const pool = require('../config/db');
const { CRITERIOS } = require('./pessoasModel');
const { SITUACAO } = require('./eventosModel');

// Monta o "WHERE" de cada relatório com parâmetros ($1, $2...) — nunca concatena valores
function construtor() {
    const condicoes = [];
    const valores = [];
    return {
        valores,
        add(sql, ...params) {
            const indices = params.map(p => { valores.push(p); return '$' + valores.length; });
            condicoes.push(sql.replace(/\?/g, () => indices.shift()));
        },
        where() { return condicoes.length ? 'WHERE ' + condicoes.join(' AND ') : ''; }
    };
}

// Período: aplica em uma coluna de data quando informado
function periodo(w, coluna, f) {
    if (f.inicio) w.add(`${coluna} >= ?`, f.inicio);
    if (f.fim) w.add(`${coluna} <= ?`, f.fim);
}

const ENCERRAMENTOS = {
    manual: 'pelo voluntário', administrativo: 'pela administração',
    automatico_limite_diario: 'automático: limite diário atingido', automatico_fim_evento: 'automático: evento encerrado sem fechamento da turma'
};
const SAIDAS = { manual: 'Entregue (código de retirada conferido)', automatica: 'Saída automática — NÃO conferida', administrativa: 'Saída registrada pela administração' };
const MOTIVOS_ALERTA = { limite_diario: 'limite diário atingido', fim_evento: 'evento encerrado sem fechamento da turma', sessao_abandonada: 'sessão abandonada' };

// Relatório de turmas separado por evento: evento → turmas atendidas → crianças, com os totais
function agruparTurmasPorEvento(linhas) {
    const eventos = [];
    const porEvento = new Map();
    const porSessao = new Map();
    for (const l of linhas) {
        if (!porEvento.has(l.id_evento)) {
            const evento = { id_evento: l.id_evento, evento: l.evento, data: l.data, hora_inicio: l.hora_inicio, hora_fim: l.hora_fim, sessoes: [] };
            porEvento.set(l.id_evento, evento);
            eventos.push(evento);
        }
        if (!porSessao.has(l.id_sessao)) {
            const sessao = {
                id_sessao: l.id_sessao, turma: l.turma, aberta_as: l.aberta_as, aberta_por: l.aberta_por, encerramento: l.encerramento,
                motivo_encerramento: l.motivo_encerramento, atendimentos: [],
                alerta: l.alerta_motivo ? {
                    motivo: MOTIVOS_ALERTA[l.alerta_motivo] || l.alerta_motivo, prioritario: l.alerta_prioritario, status: l.alerta_status,
                    tratado_por: l.alerta_tratado_por, observacao: l.alerta_observacao
                } : null
            };
            porSessao.set(l.id_sessao, sessao);
            porEvento.get(l.id_evento).sessoes.push(sessao);
        }
        if (l.id_atendimento) porSessao.get(l.id_sessao).atendimentos.push(l);
    }
    for (const e of eventos) {
        const todos = e.sessoes.flatMap(s => s.atendimentos);
        e.resumo = {
            turmas: e.sessoes.length,
            criancas: new Set(todos.map(a => a.crianca)).size,
            entradas: todos.length,
            conferidas: todos.filter(a => a.tipo_saida === 'manual').length,
            automaticas: todos.filter(a => a.tipo_saida === 'automatica').length,
            administrativas: todos.filter(a => a.tipo_saida === 'administrativa').length,
            presentes: todos.filter(a => !a.saida).length,
            alertas: e.sessoes.filter(s => s.alerta).length
        };
    }
    return eventos;
}

const RELATORIOS = {
    participantes: {
        titulo: 'Participantes',
        colunas: [['nome', 'Nome'], ['tipo', 'Tipo'], ['telefone', 'Telefone'], ['email', 'E-mail'], ['data', 'Entrada / visita'], ['status', 'Status']],
        consulta(f) {
            const w = construtor();
            if (f.tipo === 'membros') w.add("tipo = 'Membro'");
            if (f.tipo === 'visitantes') w.add("tipo = 'Visitante'");
            if (f.status === 'ativos') w.add("status = 'Ativo'");
            if (f.status === 'inativos') w.add("status = 'Inativo'");
            periodo(w, 'data', f);
            // Todas as pessoas da base universal (membros e visitantes)
            return [`SELECT * FROM (
                        SELECT nome_completo AS nome, CASE WHEN classificacao = 'membro' THEN 'Membro' ELSE 'Visitante' END AS tipo,
                               telefone, email,
                               CASE WHEN classificacao = 'membro' THEN data_entrada_igreja ELSE data_primeira_visita END AS data,
                               CASE WHEN ativo THEN 'Ativo' ELSE 'Inativo' END AS status
                        FROM membros
                    ) p ${w.where()} ORDER BY data DESC NULLS LAST, nome`, w.valores];
        }
    },

    voluntarios: {
        titulo: 'Voluntários',
        colunas: [['nome', 'Nome'], ['departamento', 'Departamento'], ['funcoes', 'Funções'], ['disponibilidade', 'Disponibilidade'], ['escalas', 'Escalas no período'], ['status', 'Status']],
        consulta(f) {
            const w = construtor();
            w.add(CRITERIOS.voluntarioElegivel); // voluntário = pessoa ativa e apta
            if (f.status === 'ativos') w.add('v.ativo');
            if (f.status === 'inativos') w.add('NOT v.ativo');
            if (f.id_funcao) w.add('EXISTS (SELECT 1 FROM voluntario_funcoes x WHERE x.id_voluntario = v.id_voluntario AND x.id_funcao = ?)', f.id_funcao);
            const p = construtor();
            p.valores.push(...w.valores);
            const ini = f.inicio ? (p.valores.push(f.inicio), '$' + p.valores.length) : 'NULL';
            const fim = f.fim ? (p.valores.push(f.fim), '$' + p.valores.length) : 'NULL';
            return [`SELECT m.nome_completo AS nome, d.nome AS departamento,
                            (SELECT string_agg(fn.nome, ', ' ORDER BY fn.nome) FROM voluntario_funcoes vf
                             JOIN funcoes fn ON fn.id_funcao = vf.id_funcao WHERE vf.id_voluntario = v.id_voluntario) AS funcoes,
                            array_to_string(v.disponibilidade, ', ') AS disponibilidade,
                            (SELECT COUNT(*) FROM escala_participantes ep JOIN escalas es ON es.id_escala = ep.id_escala
                             WHERE ep.id_voluntario = v.id_voluntario
                               AND (${ini}::date IS NULL OR es.data_escala >= ${ini}::date)
                               AND (${fim}::date IS NULL OR es.data_escala <= ${fim}::date))::int AS escalas,
                            CASE WHEN v.ativo THEN 'Ativo' ELSE 'Inativo' END AS status
                     FROM voluntarios v
                     JOIN membros m ON m.id_membro = v.id_membro
                     LEFT JOIN departamentos d ON d.id_departamento = v.id_departamento
                     ${w.where()}
                     ORDER BY m.nome_completo`, p.valores];
        }
    },

    escalas: {
        titulo: 'Escalas',
        colunas: [['data', 'Data'], ['evento', 'Evento'], ['funcao', 'Função'], ['horario', 'Horário'], ['voluntario', 'Voluntário'], ['status', 'Status']],
        consulta(f) {
            const w = construtor();
            if (f.status === 'confirmadas') w.add('ep.confirmado IS TRUE');
            if (f.status === 'pendentes') w.add('ep.confirmado IS NOT TRUE AND NOT ep.recusado');
            if (f.status === 'recusadas') w.add('ep.recusado');
            if (f.id_funcao) w.add('es.id_funcao = ?', f.id_funcao);
            periodo(w, 'es.data_escala', f);
            return [`SELECT es.data_escala AS data, e.nome AS evento, fn.nome AS funcao, to_char(es.horario, 'HH24:MI') AS horario,
                            m.nome_completo AS voluntario,
                            CASE WHEN ep.confirmado THEN 'Confirmado'
                                 WHEN ep.recusado THEN 'Recusou: ' || COALESCE(ep.motivo_recusa, '')
                                 WHEN es.data_escala < CURRENT_DATE THEN 'Ausente'
                                 ELSE 'Pendente' END AS status
                     FROM escala_participantes ep
                     JOIN escalas es ON es.id_escala = ep.id_escala
                     LEFT JOIN eventos e ON e.id_evento = es.id_evento
                     LEFT JOIN funcoes fn ON fn.id_funcao = ep.id_funcao
                     JOIN voluntarios v ON v.id_voluntario = ep.id_voluntario
                     JOIN membros m ON m.id_membro = v.id_membro
                     ${w.where()}
                     ORDER BY es.data_escala ${f.status === 'pendentes' ? 'ASC' /* as mais próximas primeiro */ : 'DESC'}, es.horario, fn.nome, m.nome_completo`, w.valores];
        }
    },

    presencas: {
        titulo: 'Presenças',
        colunas: [['data', 'Data'], ['turma', 'Turma'], ['membro', 'Membro'], ['entrada', 'Entrada'], ['saida', 'Saída']],
        consulta(f) {
            const w = construtor();
            if (f.id_turma) w.add('p.id_turma = ?', f.id_turma);
            periodo(w, 'p.data', f);
            return [`SELECT p.data, c.nome AS turma, m.nome_completo AS membro,
                            to_char(p.hora_entrada, 'HH24:MI') AS entrada, to_char(p.hora_saida, 'HH24:MI') AS saida
                     FROM turmas p
                     JOIN cadastroturmas c ON c.id_turma = p.id_turma
                     JOIN membros m ON m.id_membro = p.id_membro
                     ${w.where()}
                     ORDER BY p.data DESC, c.nome, m.nome_completo`, w.valores];
        }
    },

    criancas: {
        titulo: 'Crianças',
        colunas: [['nome', 'Nome'], ['idade', 'Idade'], ['turma', 'Turma'], ['responsavel', 'Responsável'], ['telefone', 'Telefone'], ['presencas', 'Presenças no período'], ['status', 'Status']],
        consulta(f) {
            const w = construtor();
            w.add(CRITERIOS.menor); // crianças = menos de 18 anos, pela data de nascimento
            if (f.id_turma) w.add('c.id_turma = ?', f.id_turma);
            if (f.status === 'ativos') w.add('(m.ativo AND COALESCE(c.ativo, TRUE))');
            if (f.status === 'inativos') w.add('NOT (m.ativo AND COALESCE(c.ativo, TRUE))');
            const ini = f.inicio ? (w.valores.push(f.inicio), '$' + w.valores.length) : 'NULL';
            const fim = f.fim ? (w.valores.push(f.fim), '$' + w.valores.length) : 'NULL';
            return [`SELECT m.nome_completo AS nome, ${CRITERIOS.idade} AS idade,
                            t.nome AS turma, r.nome_completo AS responsavel, r.telefone,
                            (SELECT COUNT(*) FROM turmas p WHERE p.id_membro = m.id_membro
                               AND (${ini}::date IS NULL OR p.data >= ${ini}::date)
                               AND (${fim}::date IS NULL OR p.data <= ${fim}::date))::int AS presencas,
                            CASE WHEN m.ativo AND COALESCE(c.ativo, TRUE) THEN 'Ativo' ELSE 'Inativo' END AS status
                     FROM membros m
                     LEFT JOIN criancas c ON c.id_membro = m.id_membro
                     LEFT JOIN cadastroturmas t ON t.id_turma = c.id_turma
                     LEFT JOIN LATERAL (
                         SELECT rs.nome_completo, rs.telefone FROM crianca_responsavel cr
                         JOIN responsaveis rs ON rs.id_responsavel = cr.id_responsavel
                         WHERE cr.id_crianca = c.id_crianca ORDER BY cr.responsavel_principal DESC LIMIT 1
                     ) r ON TRUE
                     ${w.where()}
                     ORDER BY t.nome NULLS LAST, m.nome_completo`, w.valores];
        }
    },

    funcoes: {
        titulo: 'Funções',
        colunas: [['nome', 'Função'], ['descricao', 'Descrição'], ['por_escala', 'Por escala'], ['vagas', 'Vagas'], ['voluntarios', 'Voluntários'], ['vagas_abertas', 'Vagas abertas'], ['status', 'Status']],
        consulta(f) {
            const w = construtor();
            if (f.status === 'ativas') w.add("status = 'Ativa'");
            if (f.status === 'inativas') w.add("status = 'Inativa'");
            if (f.vagas === 'com_vagas') w.add('vagas_abertas > 0');
            if (f.vagas === 'lotadas') w.add('vagas_abertas = 0');
            return [`SELECT * FROM (
                        SELECT f.nome, f.descricao, f.qtd_voluntarios AS por_escala, f.vagas,
                               COUNT(v.id_voluntario) FILTER (WHERE v.ativo)::int AS voluntarios,
                               GREATEST(COALESCE(f.vagas, 0) - COUNT(v.id_voluntario) FILTER (WHERE v.ativo), 0)::int AS vagas_abertas,
                               CASE WHEN f.ativo THEN 'Ativa' ELSE 'Inativa' END AS status
                        FROM funcoes f
                        LEFT JOIN voluntario_funcoes vf ON vf.id_funcao = f.id_funcao
                        LEFT JOIN voluntarios v ON v.id_voluntario = vf.id_voluntario
                        GROUP BY f.id_funcao
                    ) x ${w.where()} ORDER BY nome`, w.valores];
        }
    },

    // Atendimento das turmas: uma linha por criança atendida (ou pela sessão sem crianças).
    // Os horários saem no fuso da igreja; "agrupar" monta a separação por evento (PDF/Excel).
    turmas: {
        titulo: 'Turmas',
        colunas: [['data', 'Data'], ['evento', 'Evento'], ['turma', 'Turma'], ['crianca', 'Criança'], ['idade', 'Idade'],
            ['entrada', 'Entrada'], ['entrada_por', 'Entrada registrada por'], ['saida', 'Saída'], ['situacao', 'Situação da saída'],
            ['retirada', 'Entregue a'], ['saida_por', 'Saída registrada por'], ['sessao', 'Sessão da turma']],
        consulta(f) {
            const w = construtor();
            periodo(w, 'j.data_evento', f);
            if (f.id_turma) w.add('s.id_turma = ?', f.id_turma);
            if (f.encerramento === 'aberta') w.add("s.status = 'aberta'");
            if (f.encerramento === 'manual') w.add("s.tipo_encerramento = 'manual'");
            if (f.encerramento === 'automatico') w.add("s.tipo_encerramento LIKE 'automatico%'");
            if (f.encerramento === 'administrativo') w.add("s.tipo_encerramento = 'administrativo'");
            return [`WITH z AS (SELECT COALESCE((SELECT fuso_horario FROM configuracoes_igreja ORDER BY id LIMIT 1), 'America/Sao_Paulo') AS fuso)
                     SELECT j.id_evento, s.id_sessao, a.id_atendimento,
                            to_char(j.data_evento, 'YYYY-MM-DD') AS data, j.nome AS evento,
                            to_char(j.hora_inicio, 'HH24:MI') AS hora_inicio, to_char(j.hora_fim, 'HH24:MI') AS hora_fim,
                            t.nome AS turma, s.status AS status_sessao, s.tipo_encerramento, s.motivo_encerramento,
                            to_char(s.aberta_em AT TIME ZONE z.fuso, 'HH24:MI') AS aberta_as, ua.nome AS aberta_por,
                            to_char(s.encerrada_em AT TIME ZONE z.fuso, 'DD/MM/YYYY HH24:MI') AS encerrada_as, ue.nome AS encerrada_por,
                            al.motivo AS alerta_motivo, al.status AS alerta_status, al.prioritario AS alerta_prioritario,
                            ut.nome AS alerta_tratado_por, al.observacao_tratamento AS alerta_observacao,
                            cm.nome_completo AS crianca, date_part('year', age(cm.data_nascimento))::int AS idade,
                            to_char(a.entrada_em AT TIME ZONE z.fuso, 'HH24:MI') AS entrada, uen.nome AS entrada_por,
                            to_char(a.saida_em AT TIME ZONE z.fuso, 'HH24:MI') AS saida, a.tipo_saida,
                            r.nome_completo AS retirada_por, r.parentesco AS retirada_parentesco, usa.nome AS saida_por
                     FROM turma_sessoes s
                     CROSS JOIN z
                     JOIN cadastroturmas t ON t.id_turma = s.id_turma
                     JOIN vw_eventos_janela j ON j.id_evento = s.id_evento
                     LEFT JOIN usuarios ua ON ua.id_usuario = s.aberta_por
                     LEFT JOIN usuarios ue ON ue.id_usuario = s.encerrada_por
                     LEFT JOIN turma_alertas al ON al.id_sessao = s.id_sessao
                     LEFT JOIN usuarios ut ON ut.id_usuario = al.tratado_por
                     LEFT JOIN turma_atendimentos a ON a.id_sessao = s.id_sessao
                     LEFT JOIN criancas c ON c.id_crianca = a.id_crianca
                     LEFT JOIN membros cm ON cm.id_membro = c.id_membro
                     LEFT JOIN usuarios uen ON uen.id_usuario = a.entrada_por
                     LEFT JOIN usuarios usa ON usa.id_usuario = a.saida_por
                     LEFT JOIN responsaveis r ON r.id_responsavel = a.id_responsavel_retirada
                     ${w.where()}
                     ORDER BY j.data_evento DESC, j.inicio_em DESC, j.id_evento DESC, t.nome, s.id_sessao, a.entrada_em NULLS LAST, a.id_atendimento`, w.valores];
        },
        // Textos das colunas (situação, quem buscou, sessão)
        preparar(l) {
            const encerramento = l.status_sessao === 'aberta' ? 'ainda aberta'
                : `encerrada ${l.encerrada_as} — ${ENCERRAMENTOS[l.tipo_encerramento] || 'encerrada'}${l.encerrada_por ? ` (${l.encerrada_por})` : ''}`;
            return {
                ...l,
                crianca: l.crianca || '—',
                situacao: !l.id_atendimento ? 'Nenhuma criança recebida'
                    : !l.saida ? 'Ainda presente' : SAIDAS[l.tipo_saida] || l.tipo_saida,
                retirada: l.retirada_por ? `${l.retirada_por}${l.retirada_parentesco ? ` (${l.retirada_parentesco})` : ''}` : '',
                sessao: `Aberta ${l.aberta_as} por ${l.aberta_por || '—'}; ${encerramento}`,
                encerramento
            };
        },
        agrupar: agruparTurmasPorEvento
    },

    usuarios: {
        titulo: 'Usuários',
        colunas: [['nome', 'Nome'], ['email', 'E-mail'], ['perfil', 'Perfil'], ['status', 'Status'], ['ultimo_acesso', 'Último acesso'], ['criado_em', 'Criado em']],
        consulta(f) {
            const w = construtor();
            if (f.perfil) w.add('perfil = ?', f.perfil);
            if (f.status === 'ativos') w.add('ativo');
            if (f.status === 'inativos') w.add('NOT ativo AND ultimo_acesso IS NOT NULL');
            if (f.status === 'pendentes') w.add('NOT ativo AND ultimo_acesso IS NULL');
            periodo(w, 'criado_em::date', f);
            return [`SELECT nome, email, perfil,
                            CASE WHEN ativo THEN 'Ativo' WHEN ultimo_acesso IS NULL THEN 'Pendente' ELSE 'Inativo' END AS status,
                            to_char(ultimo_acesso, 'DD/MM/YYYY HH24:MI') AS ultimo_acesso, criado_em::date AS criado_em
                     FROM usuarios ${w.where()} ORDER BY nome`, w.valores];
        }
    }
};

const relatoriosModel = {
    tipos: Object.keys(RELATORIOS),
    tituloDe: tipo => RELATORIOS[tipo]?.titulo,

    gerar: async (tipo, filtros) => {
        const relatorio = RELATORIOS[tipo];
        const [sql, valores] = relatorio.consulta(filtros);
        const result = await pool.query(sql, valores);
        const linhas = relatorio.preparar ? result.rows.map(relatorio.preparar) : result.rows;
        return {
            tipo,
            titulo: relatorio.titulo,
            colunas: relatorio.colunas.map(([chave, titulo]) => ({ chave, titulo })),
            linhas,
            ...(relatorio.agrupar ? { eventos: relatorio.agrupar(linhas) } : {})
        };
    },

    resumo: async () => {
        const result = await pool.query(
            `SELECT (SELECT COUNT(*) FROM membros) AS participantes,
                    (SELECT COUNT(*) FROM membros m WHERE ${CRITERIOS.voluntarioElegivel}) AS voluntarios,
                    (SELECT COUNT(*) FROM escalas) AS escalas,
                    (SELECT COUNT(*) FROM membros m WHERE ${CRITERIOS.menor} AND m.ativo) AS criancas`
        );
        return result.rows[0];
    },

    // Histórico (mais novos primeiro). O caminho do arquivo não sai daqui:
    // o navegador só sabe se ele existe (tem_arquivo) e baixa pela rota protegida.
    recentes: async (limite = 200) => {
        const result = await pool.query(
            `SELECT r.id_relatorio, r.tipo, r.titulo, r.formato, r.filtros, r.total_registros,
                    to_char(r.data_inicial, 'YYYY-MM-DD') AS data_inicial, to_char(r.data_final, 'YYYY-MM-DD') AS data_final,
                    r.gerado_em, r.id_evento, r.nome_arquivo, r.tamanho_bytes, (r.arquivo IS NOT NULL) AS tem_arquivo,
                    e.nome AS evento, to_char(e.data_evento, 'YYYY-MM-DD') AS data_evento,
                    COALESCE(m.nome_completo, u.nome) AS usuario
             FROM relatorios_gerados r
             LEFT JOIN usuarios u ON u.id_usuario = r.id_usuario
             LEFT JOIN membros m ON m.id_membro = u.id_membro
             LEFT JOIN eventos e ON e.id_evento = r.id_evento
             ORDER BY r.gerado_em DESC, r.id_relatorio DESC
             LIMIT $1`,
            [limite]
        );
        return result.rows;
    },

    // Eventos para o "Relatório por evento" (todos: futuros e realizados), mais recentes primeiro
    eventosParaRelatorio: async () => {
        const result = await pool.query(
            `SELECT e.id_evento, e.nome, to_char(e.data_evento, 'YYYY-MM-DD') AS data_evento,
                    to_char(e.hora_inicio, 'HH24:MI') AS hora_inicio, to_char(e.hora_fim, 'HH24:MI') AS hora_fim,
                    e.tipo_evento, ${SITUACAO.realizado} AS realizado,
                    (SELECT COUNT(*) FROM escalas es WHERE es.id_evento = e.id_evento)::int AS total_escalas
             FROM eventos e
             ORDER BY e.data_evento DESC, e.hora_inicio DESC NULLS LAST, e.id_evento DESC`
        );
        return result.rows;
    },

    // Cria o registro do histórico (dentro da transação de geração: "executor" é o cliente)
    registrar: async ({ tipo, titulo, id_evento, data_inicial, data_final, formato, filtros, total_registros, id_usuario }, executor = pool) => {
        const result = await executor.query(
            `INSERT INTO relatorios_gerados (tipo, titulo, id_evento, data_inicial, data_final, formato, filtros, total_registros, id_usuario)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [tipo, titulo, id_evento, data_inicial, data_final, formato, filtros, total_registros, id_usuario]
        );
        return result.rows[0];
    },

    // Liga o arquivo gravado ao registro
    vincularArquivo: async (id, { arquivo, nome_arquivo, tamanho, hash }, executor = pool) => {
        await executor.query(
            `UPDATE relatorios_gerados SET arquivo = $2, nome_arquivo = $3, tamanho_bytes = $4, hash_arquivo = $5
             WHERE id_relatorio = $1`,
            [id, arquivo, nome_arquivo, tamanho, hash]
        );
    },

    buscarRegistro: async (id) => {
        const result = await pool.query(
            'SELECT id_relatorio, tipo, formato, arquivo, nome_arquivo, hash_arquivo FROM relatorios_gerados WHERE id_relatorio = $1',
            [id]
        );
        return result.rows[0];
    }
};

module.exports = relatoriosModel;
