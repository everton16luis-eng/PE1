const crypto = require('crypto');
const pool = require('../config/db');

// =========================================================
// Atendimento das turmas: sessões (turma aberta para um evento),
// entrada/saída das crianças, códigos das etiquetas, auditoria
// e alertas de turma encerrada automaticamente.
// Toda regra é conferida aqui, no servidor; "agora" vem do servidor.
// =========================================================

class ErroAtendimento extends Error {
    constructor(status, mensagem, extra = {}) {
        super(mensagem);
        this.status = status;
        this.extra = extra;
    }
}

const MENSAGEM_SEM_EVENTO = 'Não é possível abrir esta turma porque não existe um evento em andamento ou previsto para os próximos 30 minutos. Aguarde o período permitido ou verifique os eventos cadastrados.';
const TOLERANCIA_ABERTURA = "INTERVAL '30 minutes'";

// Prazo da sessão: até as 23h59 do dia do evento; se o evento passa da meia-noite, até o fim dele
const PRAZO = 'GREATEST(j.limite_diario_em, j.fim_em)';
const TIPO_AUTOMATICO = "CASE WHEN j.fim_em > j.limite_diario_em THEN 'automatico_fim_evento' ELSE 'automatico_limite_diario' END";

// Código curto das etiquetas: sem letras/números que se confundem (0/O, 1/I/L, 5/S, 2/Z, 8/B, 6/G)
const ALFABETO = 'ACDEFHJKMNPQRTUVWXY3479';
function codigoCurto() {
    const bytes = crypto.randomBytes(6);
    return [...bytes].map(b => ALFABETO[b % ALFABETO.length]).join('');
}
const novoToken = () => crypto.randomBytes(18).toString('base64url');
// Busca por nome sem diferenciar acentos e maiúsculas
const semAcento = expr => `translate(lower(${expr}), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')`;

async function comTransacao(trabalho) {
    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');
        const resultado = await trabalho(cliente);
        await cliente.query('COMMIT');
        return resultado;
    } catch (error) {
        await cliente.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        cliente.release();
    }
}

// Registro no histórico (fora de transação: tentativas recusadas também ficam registradas)
async function auditar(executor, { id_sessao = null, id_atendimento = null, id_codigo = null, acao, detalhe = null, id_usuario = null, automatico = false }) {
    await (executor || pool).query(
        `INSERT INTO turma_auditoria (id_sessao, id_atendimento, id_codigo, acao, detalhe, id_usuario, automatico)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id_sessao, id_atendimento, id_codigo, acao, detalhe, id_usuario, automatico]
    );
}

const atendimentoModel = {
    ErroAtendimento,
    MENSAGEM_SEM_EVENTO,
    auditar,

    // ---------------------------------------------------------
    // Quem pode operar
    // ---------------------------------------------------------
    // Gestão das crianças: administrador ou quem tem a área Crianças
    ehGestor: (usuario) => usuario?.perfil === 'ADMINISTRADOR'
        || (usuario?.perfil !== 'VOLUNTARIO' && usuario?.permissoes?.criancas === true),

    // Turmas ativas de que a pessoa é responsável (cadastro da turma) ou voluntária vinculada
    turmasVinculadas: async (idMembro) => {
        const result = await pool.query(
            `SELECT t.id_turma FROM cadastroturmas t
             WHERE t.ativo AND (t.id_membro_responsavel = $1 OR EXISTS (
                 SELECT 1 FROM turma_voluntarios tv JOIN voluntarios v ON v.id_voluntario = tv.id_voluntario
                 WHERE tv.id_turma = t.id_turma AND v.id_membro = $1 AND v.ativo IS NOT FALSE))`,
            [idMembro]
        );
        return result.rows.map(r => r.id_turma);
    },

    async podeOperar(usuario, idTurma) {
        if (atendimentoModel.ehGestor(usuario)) return true;
        return (await atendimentoModel.turmasVinculadas(usuario.id_membro)).includes(Number(idTurma));
    },

    // ---------------------------------------------------------
    // Turmas e eventos
    // ---------------------------------------------------------
    // Turmas que o usuário vê, com a sessão aberta (se houver)
    listarTurmas: async (usuario) => {
        const gestor = atendimentoModel.ehGestor(usuario);
        const ids = gestor ? null : await atendimentoModel.turmasVinculadas(usuario.id_membro);
        if (ids && !ids.length) return [];
        const result = await pool.query(
            `SELECT t.id_turma, t.nome, t.idade_minima, t.idade_maxima, t.dia_semana, t.horario, t.ativo,
                    t.id_membro_responsavel, mr.nome_completo AS responsavel,
                    COALESCE((SELECT json_agg(json_build_object('id_voluntario', v.id_voluntario, 'nome', m.nome_completo) ORDER BY m.nome_completo)
                              FROM turma_voluntarios tv JOIN voluntarios v ON v.id_voluntario = tv.id_voluntario
                              JOIN membros m ON m.id_membro = v.id_membro WHERE tv.id_turma = t.id_turma), '[]') AS voluntarios,
                    s.id_sessao, s.aberta_em, ua.nome AS aberta_por, j.nome AS evento, j.inicio_em, j.fim_em,
                    ${PRAZO} AS prazo_encerramento,
                    (SELECT COUNT(*)::int FROM turma_atendimentos a WHERE a.id_sessao = s.id_sessao AND a.saida_em IS NULL) AS presentes,
                    -- eventos em que a turma já teve atendimento (não reabre no mesmo evento)
                    COALESCE((SELECT array_agg(x.id_evento) FROM turma_sessoes x WHERE x.id_turma = t.id_turma), '{}') AS eventos_atendidos
             FROM cadastroturmas t
             LEFT JOIN membros mr ON mr.id_membro = t.id_membro_responsavel
             LEFT JOIN turma_sessoes s ON s.id_turma = t.id_turma AND s.status = 'aberta'
             LEFT JOIN usuarios ua ON ua.id_usuario = s.aberta_por
             LEFT JOIN vw_eventos_janela j ON j.id_evento = s.id_evento
             WHERE t.ativo ${ids ? 'AND t.id_turma = ANY($1)' : ''}
             ORDER BY (t.nome ILIKE 'next%'), t.idade_minima NULLS LAST, t.nome`,
            ids ? [ids] : []
        );
        return result.rows;
    },

    // Eventos em que uma turma pode ser aberta agora: já começou e não terminou,
    // ou começa nos próximos 30 minutos
    eventosElegiveis: async (agora = new Date()) => {
        const result = await pool.query(
            `SELECT j.id_evento, j.nome, j.data_evento, j.hora_inicio, j.hora_fim, j.inicio_em, j.fim_em,
                    ${PRAZO} AS prazo_encerramento, ${TIPO_AUTOMATICO} AS regra_encerramento
             FROM vw_eventos_janela j
             WHERE $1::timestamptz >= j.inicio_em - ${TOLERANCIA_ABERTURA} AND $1::timestamptz < j.fim_em
             ORDER BY j.inicio_em`,
            [agora]
        );
        return result.rows;
    },

    // Próximo evento (para explicar quando a abertura será liberada)
    proximoEvento: async (agora = new Date()) => {
        const result = await pool.query(
            `SELECT j.id_evento, j.nome, j.data_evento, j.hora_inicio, j.hora_fim, j.inicio_em,
                    j.inicio_em - ${TOLERANCIA_ABERTURA} AS libera_em
             FROM vw_eventos_janela j WHERE j.inicio_em - ${TOLERANCIA_ABERTURA} > $1::timestamptz
             ORDER BY j.inicio_em LIMIT 1`,
            [agora]
        );
        return result.rows[0] || null;
    },

    // ---------------------------------------------------------
    // Sessões
    // ---------------------------------------------------------
    abrirSessao: (usuario, idTurma, idEvento, agora = new Date()) => comTransacao(async cliente => {
        const turma = (await cliente.query('SELECT id_turma, nome, ativo FROM cadastroturmas WHERE id_turma = $1', [idTurma])).rows[0];
        if (!turma || !turma.ativo) throw new ErroAtendimento(404, 'Turma não encontrada ou inativa.');

        const elegiveis = (await cliente.query(
            `SELECT j.id_evento, j.nome FROM vw_eventos_janela j
             WHERE $1::timestamptz >= j.inicio_em - ${TOLERANCIA_ABERTURA} AND $1::timestamptz < j.fim_em
             ORDER BY j.inicio_em`,
            [agora]
        )).rows;
        let evento;
        if (idEvento) evento = elegiveis.find(e => e.id_evento === Number(idEvento));
        else if (elegiveis.length === 1) [evento] = elegiveis;
        else if (elegiveis.length > 1) throw new ErroAtendimento(400, 'Escolha o evento para abrir a turma.', { eventos: elegiveis });
        if (!evento) throw new ErroAtendimento(409, MENSAGEM_SEM_EVENTO);

        const jaAberta = (await cliente.query("SELECT id_sessao FROM turma_sessoes WHERE id_turma = $1 AND status = 'aberta'", [idTurma])).rows[0];
        if (jaAberta) throw new ErroAtendimento(409, 'Esta turma já está aberta.', { id_sessao: jaAberta.id_sessao });
        const mesmaNoEvento = (await cliente.query('SELECT id_sessao FROM turma_sessoes WHERE id_turma = $1 AND id_evento = $2', [idTurma, evento.id_evento])).rows[0];
        if (mesmaNoEvento) throw new ErroAtendimento(409, 'Esta turma já teve um atendimento neste evento e ele foi encerrado. Fale com a administração se precisar corrigir.');

        let sessao;
        try {
            sessao = (await cliente.query(
                `INSERT INTO turma_sessoes (id_turma, id_evento, aberta_em, aberta_por) VALUES ($1, $2, $3, $4) RETURNING id_sessao`,
                [idTurma, evento.id_evento, agora, usuario.id_usuario]
            )).rows[0];
        } catch (error) {
            // Dois cliques ao mesmo tempo: o índice único segura a segunda abertura
            if (error.code === '23505') throw new ErroAtendimento(409, 'Esta turma já está aberta.');
            throw error;
        }
        await auditar(cliente, { id_sessao: sessao.id_sessao, acao: 'sessao_aberta', detalhe: `${turma.nome} — ${evento.nome}`, id_usuario: usuario.id_usuario });
        return sessao;
    }),

    // Cabeçalho da sessão (turma, evento, horários, prazo)
    buscarSessao: async (idSessao) => {
        const result = await pool.query(
            `SELECT s.id_sessao, s.id_turma, s.id_evento, s.status, s.aberta_em, s.encerrada_em, s.processada_em,
                    s.tipo_encerramento, s.motivo_encerramento,
                    t.nome AS turma, t.idade_minima, t.idade_maxima,
                    ua.nome AS aberta_por, ue.nome AS encerrada_por,
                    j.nome AS evento, j.data_evento, j.hora_inicio, j.hora_fim, j.inicio_em, j.fim_em,
                    ${PRAZO} AS prazo_encerramento, ${TIPO_AUTOMATICO} AS regra_encerramento,
                    (SELECT COUNT(*)::int FROM turma_atendimentos a WHERE a.id_sessao = s.id_sessao AND a.saida_em IS NULL) AS presentes,
                    (SELECT COUNT(DISTINCT a.id_crianca)::int FROM turma_atendimentos a WHERE a.id_sessao = s.id_sessao) AS criancas_recebidas
             FROM turma_sessoes s
             JOIN cadastroturmas t ON t.id_turma = s.id_turma
             JOIN vw_eventos_janela j ON j.id_evento = s.id_evento
             LEFT JOIN usuarios ua ON ua.id_usuario = s.aberta_por
             LEFT JOIN usuarios ue ON ue.id_usuario = s.encerrada_por
             WHERE s.id_sessao = $1`,
            [idSessao]
        );
        return result.rows[0] || null;
    },

    // Crianças da sessão (entradas e saídas, mais recentes primeiro)
    atendimentosDaSessao: async (idSessao) => {
        const result = await pool.query(
            `SELECT a.id_atendimento, a.id_crianca, cm.nome_completo AS nome, cm.data_nascimento,
                    date_part('year', age(cm.data_nascimento))::int AS idade,
                    (c.alergias IS NOT NULL AND btrim(c.alergias) <> '') AS tem_alergia,
                    a.entrada_em, ue.nome AS entrada_por, a.entregue_por_nome, a.saida_em, us.nome AS saida_por, a.tipo_saida,
                    r.nome_completo AS retirada_por,
                    EXISTS (SELECT 1 FROM turma_codigos k WHERE k.id_atendimento = a.id_atendimento AND k.status = 'ativo') AS codigo_ativo
             FROM turma_atendimentos a
             JOIN criancas c ON c.id_crianca = a.id_crianca JOIN membros cm ON cm.id_membro = c.id_membro
             LEFT JOIN usuarios ue ON ue.id_usuario = a.entrada_por
             LEFT JOIN usuarios us ON us.id_usuario = a.saida_por
             LEFT JOIN responsaveis r ON r.id_responsavel = a.id_responsavel_retirada
             WHERE a.id_sessao = $1
             ORDER BY (a.saida_em IS NULL) DESC, a.entrada_em DESC`,
            [idSessao]
        );
        return result.rows;
    },

    // Busca de crianças para registrar a entrada (só o necessário para identificar)
    criancasParaEntrada: async (idSessao, busca = '') => {
        const termo = String(busca || '').trim();
        const result = await pool.query(
            `SELECT c.id_crianca, cm.nome_completo AS nome, cm.data_nascimento,
                    date_part('year', age(cm.data_nascimento))::int AS idade,
                    ct.nome AS turma, (c.id_turma = s.id_turma) AS da_turma,
                    EXISTS (SELECT 1 FROM turma_atendimentos a WHERE a.id_sessao = s.id_sessao AND a.id_crianca = c.id_crianca AND a.saida_em IS NULL) AS presente
             FROM turma_sessoes s
             CROSS JOIN criancas c
             JOIN membros cm ON cm.id_membro = c.id_membro
             LEFT JOIN cadastroturmas ct ON ct.id_turma = c.id_turma
             WHERE s.id_sessao = $1 AND c.ativo IS NOT FALSE AND cm.ativo
               AND ($2 = '' OR ${semAcento('cm.nome_completo')} LIKE '%' || ${semAcento('$2')} || '%')
               AND ($2 <> '' OR c.id_turma = s.id_turma)
             ORDER BY (c.id_turma = s.id_turma) DESC NULLS LAST, cm.nome_completo
             LIMIT 40`,
            [idSessao, termo]
        );
        return result.rows;
    },

    // Ficha da criança para o atendimento: dados e responsáveis (com autorização de retirada)
    perfilCrianca: async (idCrianca) => {
        const crianca = (await pool.query(
            `SELECT c.id_crianca, cm.nome_completo AS nome, cm.data_nascimento,
                    date_part('year', age(cm.data_nascimento))::int AS idade, c.sexo,
                    c.alergias, c.observacoes, c.autorizacao_imagem, c.autorizacao_responsavel,
                    ct.nome AS turma
             FROM criancas c JOIN membros cm ON cm.id_membro = c.id_membro LEFT JOIN cadastroturmas ct ON ct.id_turma = c.id_turma
             WHERE c.id_crianca = $1`,
            [idCrianca]
        )).rows[0];
        if (!crianca) return null;
        crianca.responsaveis = (await pool.query(
            `SELECT r.id_responsavel, r.nome_completo AS nome, r.parentesco, r.telefone, r.email,
                    cr.responsavel_principal AS principal, cr.autorizado_retirada
             FROM crianca_responsavel cr JOIN responsaveis r ON r.id_responsavel = cr.id_responsavel
             WHERE cr.id_crianca = $1 AND r.ativo IS NOT FALSE
             ORDER BY cr.responsavel_principal DESC, r.nome_completo`,
            [idCrianca]
        )).rows;
        return crianca;
    },

    // Sessão travada para alterar: precisa estar aberta e dentro do prazo
    async travarSessaoAberta(cliente, idSessao, agora) {
        const sessao = (await cliente.query(
            `SELECT s.id_sessao, s.id_turma, s.status, ${PRAZO} AS prazo
             FROM turma_sessoes s JOIN vw_eventos_janela j ON j.id_evento = s.id_evento
             WHERE s.id_sessao = $1 FOR UPDATE OF s`,
            [idSessao]
        )).rows[0];
        if (!sessao) throw new ErroAtendimento(404, 'Sessão não encontrada.');
        if (sessao.status !== 'aberta') throw new ErroAtendimento(409, 'Esta turma já foi encerrada. Uma sessão encerrada não recebe entradas nem saídas.');
        if (new Date(sessao.prazo) <= agora) {
            throw new ErroAtendimento(409, 'O período desta turma terminou e ela está sendo encerrada automaticamente.', { prazo_vencido: true });
        }
        return sessao;
    },

    // ---------------------------------------------------------
    // Entrada
    // ---------------------------------------------------------
    // Entrada: { id_crianca, id_responsavel } (responsável vinculado à criança) ou
    // { id_crianca, nome_entregador } (outra pessoa). Quem deixou a criança é obrigatório.
    registrarEntrada: (usuario, idSessao, { id_crianca: idCrianca, id_responsavel: idResponsavel = null, nome_entregador: nomeEntregador = '' }, agora = new Date()) => comTransacao(async cliente => {
        await atendimentoModel.travarSessaoAberta(cliente, idSessao, agora);
        const crianca = (await cliente.query(
            `SELECT c.id_crianca, cm.nome_completo FROM criancas c JOIN membros cm ON cm.id_membro = c.id_membro
             WHERE c.id_crianca = $1 AND c.ativo IS NOT FALSE AND cm.ativo`,
            [idCrianca]
        )).rows[0];
        if (!crianca) throw new ErroAtendimento(404, 'Criança não encontrada ou com cadastro inativo.');

        let entregador;
        if (idResponsavel) {
            entregador = (await cliente.query(
                `SELECT r.id_responsavel, r.nome_completo AS nome FROM crianca_responsavel cr JOIN responsaveis r ON r.id_responsavel = cr.id_responsavel
                 WHERE cr.id_crianca = $1 AND cr.id_responsavel = $2 AND r.ativo IS NOT FALSE`,
                [idCrianca, idResponsavel]
            )).rows[0];
            if (!entregador) throw new ErroAtendimento(400, 'Este responsável não está vinculado a esta criança.');
        } else {
            const nome = String(nomeEntregador || '').trim().replace(/\s+/g, ' ').slice(0, 150);
            if (nome.length < 3) throw new ErroAtendimento(400, 'Informe quem está deixando a criança.');
            entregador = { id_responsavel: null, nome };
        }

        let atendimento;
        try {
            atendimento = (await cliente.query(
                `INSERT INTO turma_atendimentos (id_sessao, id_crianca, entrada_em, entrada_por, id_responsavel_entrada, entregue_por_nome)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_atendimento, entrada_em`,
                [idSessao, idCrianca, agora, usuario.id_usuario, entregador.id_responsavel, entregador.nome]
            )).rows[0];
        } catch (error) {
            if (error.code === '23505') throw new ErroAtendimento(409, `${crianca.nome_completo} já está presente nesta turma.`);
            throw error;
        }
        await auditar(cliente, {
            id_sessao: idSessao, id_atendimento: atendimento.id_atendimento, acao: 'entrada',
            detalhe: `${crianca.nome_completo}; deixada por ${entregador.nome}${entregador.id_responsavel ? '' : ' (não cadastrado como responsável)'}`,
            id_usuario: usuario.id_usuario
        });
        const codigo = await atendimentoModel.emitirCodigo(cliente, usuario, idSessao, atendimento.id_atendimento, idCrianca);
        return { ...atendimento, nome: crianca.nome_completo, entregue_por: entregador.nome, codigo: codigo.codigo };
    }),

    // Códigos novos para o atendimento (na entrada ou na 2ª via), dois e vinculados:
    // o da criança (etiqueta exposta, só identifica) e o de retirada (só na etiqueta do
    // responsável, o único aceito na saída). Nenhum dos dois repete outro código da sessão.
    // O responsável da etiqueta é quem deixou a criança na entrada (quando é um responsável cadastrado).
    async emitirCodigo(cliente, usuario, idSessao, idAtendimento, idCrianca, { segundaViaDe = null, motivo = null } = {}) {
        const responsavel = (await cliente.query(
            'SELECT id_responsavel_entrada AS id_responsavel FROM turma_atendimentos WHERE id_atendimento = $1', [idAtendimento]
        )).rows[0];
        for (let tentativa = 0; tentativa < 8; tentativa++) {
            const codigo = codigoCurto();
            const retirada = codigoCurto();
            if (codigo === retirada) continue;
            const emUso = await cliente.query(
                'SELECT 1 FROM turma_codigos WHERE id_sessao = $1 AND (codigo = ANY($2) OR codigo_retirada = ANY($2)) LIMIT 1',
                [idSessao, [codigo, retirada]]
            );
            if (emUso.rowCount) continue;
            let linha;
            try {
                linha = (await cliente.query(
                    `INSERT INTO turma_codigos (id_atendimento, id_sessao, codigo, codigo_retirada, token, token_crianca,
                                                id_responsavel, emitido_por, segunda_via_de, motivo_emissao)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                     RETURNING id_codigo, codigo`,
                    [idAtendimento, idSessao, codigo, retirada, novoToken(), novoToken(),
                     responsavel?.id_responsavel || null, usuario.id_usuario, segundaViaDe, motivo]
                )).rows[0];
            } catch (error) {
                if (error.code === '23505' && /codigo/.test(error.constraint || '')) continue;
                throw error;
            }
            if (linha) {
                await auditar(cliente, {
                    id_sessao: idSessao, id_atendimento: idAtendimento, id_codigo: linha.id_codigo,
                    acao: segundaViaDe ? 'codigo_segunda_via' : 'codigo_emitido', detalhe: motivo, id_usuario: usuario.id_usuario
                });
                return linha;
            }
        }
        throw new Error('Não foi possível gerar um código único para a etiqueta.');
    },

    // ---------------------------------------------------------
    // Códigos: localizar e conferir
    // ---------------------------------------------------------
    // Aceita o código curto (digitado) ou o token (leitor de QR) de qualquer das duas etiquetas
    // e diz qual foi lido: "retirada" (etiqueta do responsável) ou "crianca" (etiqueta da criança).
    // O código curto só vale na própria sessão.
    async localizarCodigo(executor, idSessao, informado) {
        const banco = executor || pool;
        const bruto = String(informado || '').trim();
        if (/^[A-Za-z0-9_-]{20,66}$/.test(bruto)) {
            const linha = (await banco.query('SELECT *, (token = $1) AS e_retirada FROM turma_codigos WHERE token = $1 OR token_crianca = $1', [bruto])).rows[0];
            return linha ? { ...linha, tipo: linha.e_retirada ? 'retirada' : 'crianca' } : null;
        }
        const curto = bruto.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!/^[A-Z0-9]{6}$/.test(curto)) return null;
        const retirada = (await banco.query('SELECT * FROM turma_codigos WHERE id_sessao = $1 AND codigo_retirada = $2', [idSessao, curto])).rows[0];
        if (retirada) return { ...retirada, tipo: 'retirada' };
        const crianca = (await banco.query('SELECT * FROM turma_codigos WHERE id_sessao = $1 AND codigo = $2', [idSessao, curto])).rows[0];
        if (crianca) return { ...crianca, tipo: 'crianca' };
        // Mesmo código em outra sessão: só para explicar o motivo da recusa
        const outra = (await banco.query(
            'SELECT id_codigo, id_sessao FROM turma_codigos WHERE codigo = $1 OR codigo_retirada = $1 ORDER BY id_codigo DESC LIMIT 1', [curto]
        )).rows[0];
        return outra ? { ...outra, outra_sessao: true } : null;
    },

    // Explica por que um código não serve para esta criança nesta sessão (null = serve).
    // Na retirada, só o código do RESPONSÁVEL vale: o da criança está exposto na etiqueta dela.
    problemaDoCodigo(codigo, idSessao, idAtendimento, { retirada = false } = {}) {
        if (!codigo) return { motivo: 'codigo_invalido', mensagem: 'Código não encontrado. Confira a etiqueta do responsável.' };
        if (codigo.outra_sessao || Number(codigo.id_sessao) !== Number(idSessao)) {
            return { motivo: 'outra_sessao', mensagem: 'Este código é de outro atendimento (outra sessão ou outro evento). Ele não vale aqui.' };
        }
        if (retirada && codigo.tipo === 'crianca') {
            return { motivo: 'codigo_crianca', mensagem: 'Este é o código da etiqueta da CRIANÇA e não serve para retirada. Peça a etiqueta do responsável.' };
        }
        if (idAtendimento && Number(codigo.id_atendimento) !== Number(idAtendimento)) {
            return { motivo: 'outra_crianca', mensagem: 'Este código é de OUTRA criança desta turma. Não entregue a criança: confira a etiqueta.' };
        }
        if (codigo.status === 'utilizado') return { motivo: 'ja_utilizado', mensagem: 'Este código já foi usado em uma retirada e não vale de novo.' };
        if (codigo.status === 'invalidado') {
            return { motivo: 'invalidado', mensagem: `Este código não vale mais (${codigo.motivo_invalidacao || 'invalidado'}).` };
        }
        return null;
    },

    // Conferência sem retirada (ex.: ler a etiqueta antes de chamar a criança)
    conferirCodigo: async (usuario, idSessao, informado) => {
        const codigo = await atendimentoModel.localizarCodigo(null, idSessao, informado);
        const problema = atendimentoModel.problemaDoCodigo(codigo, idSessao, null);
        if (problema) {
            await auditar(null, { id_sessao: idSessao, id_codigo: codigo?.outra_sessao ? null : codigo?.id_codigo || null, acao: 'conferencia_recusada', detalhe: problema.motivo, id_usuario: usuario.id_usuario });
            return { valido: false, ...problema };
        }
        const dados = (await pool.query(
            `SELECT a.id_atendimento, a.id_crianca, a.saida_em, a.entrada_em, a.entregue_por_nome, cm.nome_completo AS crianca,
                    date_part('year', age(cm.data_nascimento))::int AS idade, r.nome_completo AS responsavel
             FROM turma_atendimentos a JOIN criancas c ON c.id_crianca = a.id_crianca JOIN membros cm ON cm.id_membro = c.id_membro
             LEFT JOIN responsaveis r ON r.id_responsavel = $2
             WHERE a.id_atendimento = $1`,
            [codigo.id_atendimento, codigo.id_responsavel]
        )).rows[0];
        await auditar(null, { id_sessao: idSessao, id_atendimento: codigo.id_atendimento, id_codigo: codigo.id_codigo, acao: 'codigo_conferido', detalhe: codigo.tipo, id_usuario: usuario.id_usuario });
        return {
            valido: true, tipo: codigo.tipo, id_atendimento: dados.id_atendimento, id_crianca: dados.id_crianca, crianca: dados.crianca,
            idade: dados.idade, entrada_em: dados.entrada_em, entregue_por: dados.entregue_por_nome || dados.responsavel || null,
            responsavel: dados.responsavel, presente: !dados.saida_em, codigo_crianca: codigo.codigo
        };
    },

    // ---------------------------------------------------------
    // Prévia da retirada: confere o código (leitura do QR ou digitado) SEM usá-lo e
    // devolve os dados finais para o voluntário confirmar. A saída só acontece no POST da saída.
    // ---------------------------------------------------------
    previaSaida: async (usuario, idAtendimento, informado, agora = new Date()) => {
        const atendimento = (await pool.query(
            `SELECT a.id_atendimento, a.id_sessao, a.id_crianca, a.entrada_em, a.saida_em, a.entregue_por_nome,
                    cm.nome_completo AS crianca, date_part('year', age(cm.data_nascimento))::int AS idade,
                    t.nome AS turma, s.status, ${PRAZO} AS prazo
             FROM turma_atendimentos a
             JOIN criancas c ON c.id_crianca = a.id_crianca JOIN membros cm ON cm.id_membro = c.id_membro
             JOIN turma_sessoes s ON s.id_sessao = a.id_sessao
             JOIN cadastroturmas t ON t.id_turma = s.id_turma
             JOIN vw_eventos_janela j ON j.id_evento = s.id_evento
             WHERE a.id_atendimento = $1`,
            [idAtendimento]
        )).rows[0];
        if (!atendimento) throw new ErroAtendimento(404, 'Atendimento não encontrado.');
        if (atendimento.status !== 'aberta' || new Date(atendimento.prazo) <= agora) throw new ErroAtendimento(409, 'Esta turma já foi encerrada.');
        if (atendimento.saida_em) throw new ErroAtendimento(409, `A saída de ${atendimento.crianca} já foi registrada.`);
        const codigo = await atendimentoModel.localizarCodigo(null, atendimento.id_sessao, informado);
        const problema = atendimentoModel.problemaDoCodigo(codigo, atendimento.id_sessao, idAtendimento, { retirada: true });
        if (problema) {
            await auditar(null, {
                id_sessao: atendimento.id_sessao, id_atendimento: Number(idAtendimento), id_codigo: codigo && !codigo.outra_sessao ? codigo.id_codigo : null,
                acao: problema.motivo === 'ja_utilizado' ? 'tentativa_reuso_codigo' : 'retirada_recusada', detalhe: problema.motivo, id_usuario: usuario.id_usuario
            });
            return { valido: false, ...problema };
        }
        await auditar(null, { id_sessao: atendimento.id_sessao, id_atendimento: Number(idAtendimento), id_codigo: codigo.id_codigo, acao: 'codigo_conferido', detalhe: 'prévia da retirada', id_usuario: usuario.id_usuario });
        return {
            valido: true, id_atendimento: atendimento.id_atendimento, crianca: atendimento.crianca, idade: atendimento.idade, turma: atendimento.turma,
            entrada_em: atendimento.entrada_em, entregue_por: atendimento.entregue_por_nome, codigo_retirada: codigo.codigo_retirada
        };
    },

    // ---------------------------------------------------------
    // Saída (retirada conferida pelo código da etiqueta)
    // ---------------------------------------------------------
    async registrarSaida(usuario, idAtendimento, { codigo: informado, id_responsavel = null }, agora = new Date()) {
        let recusa = null;
        try {
            return await comTransacao(async cliente => {
                const atendimento = (await cliente.query(
                    `SELECT a.*, cm.nome_completo AS nome FROM turma_atendimentos a JOIN criancas c ON c.id_crianca = a.id_crianca JOIN membros cm ON cm.id_membro = c.id_membro
                     WHERE a.id_atendimento = $1 FOR UPDATE OF a`,
                    [idAtendimento]
                )).rows[0];
                if (!atendimento) throw new ErroAtendimento(404, 'Atendimento não encontrado.');
                await atendimentoModel.travarSessaoAberta(cliente, atendimento.id_sessao, agora);
                if (atendimento.saida_em) throw new ErroAtendimento(409, `A saída de ${atendimento.nome} já foi registrada.`);

                const codigo = await atendimentoModel.localizarCodigo(cliente, atendimento.id_sessao, informado);
                if (codigo && !codigo.outra_sessao) await cliente.query('SELECT 1 FROM turma_codigos WHERE id_codigo = $1 FOR UPDATE', [codigo.id_codigo]);
                const problema = atendimentoModel.problemaDoCodigo(codigo, atendimento.id_sessao, idAtendimento, { retirada: true });
                if (problema) {
                    recusa = { id_sessao: atendimento.id_sessao, id_codigo: codigo && !codigo.outra_sessao ? codigo.id_codigo : null, motivo: problema.motivo };
                    throw new ErroAtendimento(409, problema.mensagem, { motivo: problema.motivo });
                }

                // Quem retira: precisa estar autorizado para esta criança (se houver alguém autorizado no cadastro)
                const autorizados = (await cliente.query(
                    `SELECT cr.id_responsavel FROM crianca_responsavel cr JOIN responsaveis r ON r.id_responsavel = cr.id_responsavel
                     WHERE cr.id_crianca = $1 AND cr.autorizado_retirada AND r.ativo IS NOT FALSE`,
                    [atendimento.id_crianca]
                )).rows.map(r => r.id_responsavel);
                if (autorizados.length && !autorizados.includes(Number(id_responsavel))) {
                    throw new ErroAtendimento(400, 'Escolha quem está buscando a criança entre as pessoas autorizadas.');
                }
                if (!autorizados.length && id_responsavel) throw new ErroAtendimento(400, 'Esta pessoa não está autorizada a buscar a criança.');

                const usado = await cliente.query(
                    `UPDATE turma_codigos SET status = 'utilizado', utilizado_em = $2, utilizado_por = $3
                     WHERE id_codigo = $1 AND status = 'ativo'`,
                    [codigo.id_codigo, agora, usuario.id_usuario]
                );
                if (!usado.rowCount) throw new ErroAtendimento(409, 'Este código acabou de ser usado em outra retirada.');
                await cliente.query(
                    `UPDATE turma_atendimentos SET saida_em = $2, saida_por = $3, tipo_saida = 'manual', id_responsavel_retirada = $4
                     WHERE id_atendimento = $1 AND saida_em IS NULL`,
                    [idAtendimento, agora, usuario.id_usuario, autorizados.length ? Number(id_responsavel) : null]
                );
                await auditar(cliente, {
                    id_sessao: atendimento.id_sessao, id_atendimento: Number(idAtendimento), id_codigo: codigo.id_codigo, acao: 'saida',
                    detalhe: autorizados.length ? null : 'sem pessoa autorizada cadastrada', id_usuario: usuario.id_usuario
                });
                return { id_atendimento: Number(idAtendimento), nome: atendimento.nome, saida_em: agora };
            });
        } finally {
            // Tentativa recusada fica registrada (reuso, outra criança, outra sessão...)
            if (recusa) {
                await auditar(null, {
                    id_sessao: recusa.id_sessao, id_atendimento: Number(idAtendimento), id_codigo: recusa.id_codigo,
                    acao: recusa.motivo === 'ja_utilizado' ? 'tentativa_reuso_codigo' : 'retirada_recusada', detalhe: recusa.motivo, id_usuario: usuario.id_usuario
                }).catch(erro => console.error('Falha ao registrar tentativa recusada:', erro.message));
            }
        }
    },

    // ---------------------------------------------------------
    // Etiquetas
    // ---------------------------------------------------------
    // Dados da etiqueta (somente com o código ainda ativo)
    etiqueta: async (idAtendimento) => {
        const result = await pool.query(
            `SELECT a.id_atendimento, a.id_sessao, a.saida_em, cm.nome_completo AS crianca, t.nome AS turma,
                    j.nome AS evento, j.data_evento, k.id_codigo, k.codigo, k.token_crianca,
                    k.codigo_retirada, k.token, k.emitido_em,
                    COALESCE(a.entregue_por_nome, r.nome_completo) AS responsavel, r.parentesco
             FROM turma_atendimentos a
             JOIN criancas c ON c.id_crianca = a.id_crianca JOIN membros cm ON cm.id_membro = c.id_membro
             JOIN turma_sessoes s ON s.id_sessao = a.id_sessao
             JOIN cadastroturmas t ON t.id_turma = s.id_turma
             JOIN vw_eventos_janela j ON j.id_evento = s.id_evento
             LEFT JOIN turma_codigos k ON k.id_atendimento = a.id_atendimento AND k.status = 'ativo'
             LEFT JOIN responsaveis r ON r.id_responsavel = k.id_responsavel
             WHERE a.id_atendimento = $1`,
            [idAtendimento]
        );
        return result.rows[0] || null;
    },

    registrarImpressao: async (usuario, idAtendimento, tipo) => {
        const dados = await atendimentoModel.etiqueta(idAtendimento);
        if (!dados?.id_codigo) throw new ErroAtendimento(409, 'Esta etiqueta não está mais ativa.');
        await auditar(null, { id_sessao: dados.id_sessao, id_atendimento: Number(idAtendimento), id_codigo: dados.id_codigo, acao: 'etiqueta_impressa', detalhe: tipo, id_usuario: usuario.id_usuario });
    },

    // 2ª via: invalida o código atual e emite outro (com motivo)
    segundaVia: (usuario, idAtendimento, motivo, agora = new Date()) => comTransacao(async cliente => {
        const atendimento = (await cliente.query('SELECT * FROM turma_atendimentos WHERE id_atendimento = $1 FOR UPDATE', [idAtendimento])).rows[0];
        if (!atendimento) throw new ErroAtendimento(404, 'Atendimento não encontrado.');
        await atendimentoModel.travarSessaoAberta(cliente, atendimento.id_sessao, agora);
        if (atendimento.saida_em) throw new ErroAtendimento(409, 'A criança já saiu: não há etiqueta para reemitir.');
        const anterior = (await cliente.query(
            `UPDATE turma_codigos SET status = 'invalidado', invalidado_em = $2, invalidado_por = $3, motivo_invalidacao = 'substituído por 2ª via'
             WHERE id_atendimento = $1 AND status = 'ativo' RETURNING id_codigo`,
            [idAtendimento, agora, usuario.id_usuario]
        )).rows[0];
        if (anterior) await auditar(cliente, { id_sessao: atendimento.id_sessao, id_atendimento: Number(idAtendimento), id_codigo: anterior.id_codigo, acao: 'codigo_invalidado', detalhe: `2ª via: ${motivo}`, id_usuario: usuario.id_usuario });
        return atendimentoModel.emitirCodigo(cliente, usuario, atendimento.id_sessao, Number(idAtendimento), atendimento.id_crianca, { segundaViaDe: anterior?.id_codigo || null, motivo });
    }),

    // ---------------------------------------------------------
    // Encerramento
    // ---------------------------------------------------------
    // Pelo voluntário: só depois de registrar a saída de todas as crianças
    encerrarManual: (usuario, idSessao, agora = new Date()) => comTransacao(async cliente => {
        await atendimentoModel.travarSessaoAberta(cliente, idSessao, agora);
        const presentes = (await cliente.query('SELECT COUNT(*)::int AS n FROM turma_atendimentos WHERE id_sessao = $1 AND saida_em IS NULL', [idSessao])).rows[0].n;
        if (presentes) throw new ErroAtendimento(409, `Ainda há ${presentes} criança(s) presente(s). Registre a saída de todas antes de encerrar a turma.`, { presentes });
        await atendimentoModel.invalidarCodigos(cliente, idSessao, agora, usuario.id_usuario, 'sessão encerrada');
        await cliente.query(
            `UPDATE turma_sessoes SET status = 'encerrada', encerrada_em = $2, encerrada_por = $3, processada_em = $2, tipo_encerramento = 'manual'
             WHERE id_sessao = $1 AND status = 'aberta'`,
            [idSessao, agora, usuario.id_usuario]
        );
        await auditar(cliente, { id_sessao: idSessao, acao: 'sessao_encerrada', detalhe: 'manual', id_usuario: usuario.id_usuario });
    }),

    // Pela administração (ex.: voluntário saiu sem encerrar): regulariza as saídas como administrativas
    encerrarAdministrativo: (usuario, idSessao, motivo, agora = new Date()) => comTransacao(async cliente => {
        const sessao = (await cliente.query('SELECT status FROM turma_sessoes WHERE id_sessao = $1 FOR UPDATE', [idSessao])).rows[0];
        if (!sessao) throw new ErroAtendimento(404, 'Sessão não encontrada.');
        if (sessao.status !== 'aberta') throw new ErroAtendimento(409, 'Esta sessão já está encerrada.');
        const regularizadas = (await cliente.query(
            `UPDATE turma_atendimentos SET saida_em = $2, saida_por = $3, tipo_saida = 'administrativa'
             WHERE id_sessao = $1 AND saida_em IS NULL RETURNING id_atendimento`,
            [idSessao, agora, usuario.id_usuario]
        )).rows;
        for (const a of regularizadas) {
            await auditar(cliente, { id_sessao: idSessao, id_atendimento: a.id_atendimento, acao: 'saida_administrativa', detalhe: motivo, id_usuario: usuario.id_usuario });
        }
        await atendimentoModel.invalidarCodigos(cliente, idSessao, agora, usuario.id_usuario, 'sessão encerrada pela administração');
        await cliente.query(
            `UPDATE turma_sessoes SET status = 'encerrada', encerrada_em = $2, encerrada_por = $3, processada_em = $2,
                    tipo_encerramento = 'administrativo', motivo_encerramento = $4
             WHERE id_sessao = $1`,
            [idSessao, agora, usuario.id_usuario, motivo]
        );
        await auditar(cliente, { id_sessao: idSessao, acao: 'sessao_encerrada', detalhe: `administrativo: ${motivo}`, id_usuario: usuario.id_usuario });
        return { saidas_regularizadas: regularizadas.length };
    }),

    async invalidarCodigos(cliente, idSessao, agora, idUsuario, motivo) {
        const invalidados = (await cliente.query(
            `UPDATE turma_codigos SET status = 'invalidado', invalidado_em = $2, invalidado_por = $3, motivo_invalidacao = $4
             WHERE id_sessao = $1 AND status = 'ativo' RETURNING id_codigo, id_atendimento`,
            [idSessao, agora, idUsuario, motivo]
        )).rows;
        for (const k of invalidados) {
            await auditar(cliente, { id_sessao: idSessao, id_atendimento: k.id_atendimento, id_codigo: k.id_codigo, acao: 'codigo_invalidado', detalhe: motivo, id_usuario: idUsuario, automatico: !idUsuario });
        }
        return invalidados.length;
    },

    // Sessões abertas cujo prazo já passou (23h59 do dia ou o fim do evento que passa da meia-noite)
    sessoesVencidas: async (agora = new Date()) => {
        const result = await pool.query(
            `SELECT s.id_sessao FROM turma_sessoes s JOIN vw_eventos_janela j ON j.id_evento = s.id_evento
             WHERE s.status = 'aberta' AND ${PRAZO} <= $1::timestamptz ORDER BY s.id_sessao`,
            [agora]
        );
        return result.rows.map(r => r.id_sessao);
    },

    // Encerramento automático de UMA sessão, tudo na mesma transação: saídas regularizadas
    // (no horário do prazo), códigos invalidados, sessão encerrada e o alerta criado.
    // Idempotente: se outra execução já encerrou, não faz nada e devolve null.
    encerrarAutomaticamente: (idSessao, agora = new Date()) => comTransacao(async cliente => {
        const sessao = (await cliente.query(
            `SELECT s.id_sessao, s.status, ${PRAZO} AS prazo, ${TIPO_AUTOMATICO} AS tipo
             FROM turma_sessoes s JOIN vw_eventos_janela j ON j.id_evento = s.id_evento
             WHERE s.id_sessao = $1 FOR UPDATE OF s SKIP LOCKED`,
            [idSessao]
        )).rows[0];
        if (!sessao || sessao.status !== 'aberta' || new Date(sessao.prazo) > agora) return null;

        const regularizadas = (await cliente.query(
            `UPDATE turma_atendimentos SET saida_em = $2, saida_por = NULL, tipo_saida = 'automatica'
             WHERE id_sessao = $1 AND saida_em IS NULL RETURNING id_atendimento`,
            [idSessao, sessao.prazo]
        )).rows;
        for (const a of regularizadas) {
            await auditar(cliente, { id_sessao: idSessao, id_atendimento: a.id_atendimento, acao: 'saida_automatica', detalhe: 'regularizada no encerramento automático (não é entrega conferida)', automatico: true });
        }
        await atendimentoModel.invalidarCodigos(cliente, idSessao, agora, null, 'sessão encerrada automaticamente');
        await cliente.query(
            `UPDATE turma_sessoes SET status = 'encerrada', encerrada_em = $2, encerrada_por = NULL, processada_em = $3, tipo_encerramento = $4
             WHERE id_sessao = $1 AND status = 'aberta'`,
            [idSessao, sessao.prazo, agora, sessao.tipo]
        );
        const motivo = sessao.tipo === 'automatico_fim_evento' ? 'fim_evento' : 'limite_diario';
        const alerta = (await cliente.query(
            `INSERT INTO turma_alertas (id_sessao, motivo, prioritario, presentes_no_encerramento, saidas_regularizadas, deveria_encerrar_em, encerrada_em, processada_em)
             VALUES ($1, $2, $3, $4, $4, $5, $5, $6)
             ON CONFLICT (id_sessao) DO NOTHING RETURNING id_alerta`,
            [idSessao, motivo, regularizadas.length > 0, regularizadas.length, sessao.prazo, agora]
        )).rows[0];
        await auditar(cliente, { id_sessao: idSessao, acao: 'sessao_encerrada', detalhe: `automático: ${sessao.tipo === 'automatico_fim_evento' ? 'evento encerrado sem fechamento da turma' : 'limite diário atingido (23h59)'}; ${regularizadas.length} saída(s) regularizada(s)`, automatico: true });
        return { id_sessao: idSessao, id_alerta: alerta?.id_alerta || null, presentes: regularizadas.length, tipo: sessao.tipo };
    }),

    // ---------------------------------------------------------
    // Administração: histórico, alertas e vínculos
    // ---------------------------------------------------------
    listarSessoes: async ({ status = '', idTurma = null, limite = 100 } = {}) => {
        const result = await pool.query(
            `SELECT s.id_sessao, s.status, s.aberta_em, s.encerrada_em, s.tipo_encerramento,
                    t.nome AS turma, j.nome AS evento, j.data_evento, ua.nome AS aberta_por,
                    (SELECT COUNT(DISTINCT a.id_crianca)::int FROM turma_atendimentos a WHERE a.id_sessao = s.id_sessao) AS criancas,
                    (SELECT COUNT(*)::int FROM turma_atendimentos a WHERE a.id_sessao = s.id_sessao AND a.saida_em IS NULL) AS presentes
             FROM turma_sessoes s
             JOIN cadastroturmas t ON t.id_turma = s.id_turma
             JOIN vw_eventos_janela j ON j.id_evento = s.id_evento
             LEFT JOIN usuarios ua ON ua.id_usuario = s.aberta_por
             WHERE ($1 = '' OR s.status = $1) AND ($2::int IS NULL OR s.id_turma = $2)
             ORDER BY (s.status = 'aberta') DESC, s.aberta_em DESC
             LIMIT $3`,
            [status, idTurma, limite]
        );
        return result.rows;
    },

    auditoriaDaSessao: async (idSessao) => {
        const result = await pool.query(
            `SELECT h.acao, h.detalhe, h.automatico, h.criado_em, u.nome AS usuario, cm.nome_completo AS crianca
             FROM turma_auditoria h
             LEFT JOIN usuarios u ON u.id_usuario = h.id_usuario
             LEFT JOIN turma_atendimentos a ON a.id_atendimento = h.id_atendimento
             LEFT JOIN criancas c ON c.id_crianca = a.id_crianca LEFT JOIN membros cm ON cm.id_membro = c.id_membro
             WHERE h.id_sessao = $1 ORDER BY h.criado_em, h.id_registro`,
            [idSessao]
        );
        return result.rows;
    },

    listarAlertas: async (status = '') => {
        const result = await pool.query(
            `SELECT al.*, t.nome AS turma, j.nome AS evento, j.data_evento, s.aberta_em, ua.nome AS voluntario, ut.nome AS tratado_por_nome
             FROM turma_alertas al
             JOIN turma_sessoes s ON s.id_sessao = al.id_sessao
             JOIN cadastroturmas t ON t.id_turma = s.id_turma
             JOIN vw_eventos_janela j ON j.id_evento = s.id_evento
             LEFT JOIN usuarios ua ON ua.id_usuario = s.aberta_por
             LEFT JOIN usuarios ut ON ut.id_usuario = al.tratado_por
             WHERE ($1 = '' OR al.status = $1)
             ORDER BY (al.status = 'pendente') DESC, al.prioritario DESC, al.criado_em DESC
             LIMIT 200`,
            [status]
        );
        return result.rows;
    },

    // Crianças que saíram pelo encerramento automático (as afetadas)
    afetadosDoAlerta: async (idSessao) => {
        const result = await pool.query(
            `SELECT a.id_atendimento, cm.nome_completo AS nome, a.entrada_em, a.saida_em
             FROM turma_atendimentos a JOIN criancas c ON c.id_crianca = a.id_crianca JOIN membros cm ON cm.id_membro = c.id_membro
             WHERE a.id_sessao = $1 AND a.tipo_saida = 'automatica' ORDER BY cm.nome_completo`,
            [idSessao]
        );
        return result.rows;
    },

    tratarAlerta: async (usuario, idAlerta, observacao) => {
        const result = await pool.query(
            `UPDATE turma_alertas SET status = 'tratado', tratado_por = $2, tratado_em = now(), observacao_tratamento = $3
             WHERE id_alerta = $1 AND status = 'pendente' RETURNING id_sessao`,
            [idAlerta, usuario.id_usuario, observacao]
        );
        if (!result.rowCount) return false;
        await auditar(null, { id_sessao: result.rows[0].id_sessao, acao: 'alerta_tratado', detalhe: observacao, id_usuario: usuario.id_usuario });
        return true;
    },

    alertasPendentes: async () => (await pool.query("SELECT COUNT(*)::int AS n FROM turma_alertas WHERE status = 'pendente'")).rows[0].n,

    // Voluntários que podem ser vinculados (ativos) e os já vinculados à turma
    voluntariosParaVinculo: async (idTurma) => {
        const result = await pool.query(
            `SELECT v.id_voluntario, m.nome_completo AS nome,
                    EXISTS (SELECT 1 FROM turma_voluntarios tv WHERE tv.id_turma = $1 AND tv.id_voluntario = v.id_voluntario) AS vinculado
             FROM voluntarios v JOIN membros m ON m.id_membro = v.id_membro
             WHERE v.ativo IS NOT FALSE AND m.ativo
             ORDER BY m.nome_completo`,
            [idTurma]
        );
        return result.rows;
    },

    definirVoluntarios: (usuario, idTurma, ids) => comTransacao(async cliente => {
        const turma = (await cliente.query('SELECT id_turma FROM cadastroturmas WHERE id_turma = $1', [idTurma])).rows[0];
        if (!turma) throw new ErroAtendimento(404, 'Turma não encontrada.');
        const validos = (await cliente.query(
            `SELECT v.id_voluntario FROM voluntarios v JOIN membros m ON m.id_membro = v.id_membro
             WHERE v.id_voluntario = ANY($1) AND v.ativo IS NOT FALSE AND m.ativo`,
            [ids]
        )).rows.map(r => r.id_voluntario);
        if (validos.length !== new Set(ids).size) throw new ErroAtendimento(400, 'Escolha apenas voluntários ativos.');
        await cliente.query('DELETE FROM turma_voluntarios WHERE id_turma = $1 AND NOT (id_voluntario = ANY($2))', [idTurma, validos]);
        await cliente.query(
            `INSERT INTO turma_voluntarios (id_turma, id_voluntario, vinculado_por)
             SELECT $1, unnest($2::int[]), $3 ON CONFLICT DO NOTHING`,
            [idTurma, validos, usuario.id_usuario]
        );
        return validos.length;
    })
};

module.exports = atendimentoModel;
