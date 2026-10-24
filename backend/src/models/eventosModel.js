const pool = require('../config/db');

class funcoes {
    constructor(id_funcao, nome, descricao, qtd_voluntarios) {
        this.id_funcao = id_funcao;
        this.nome = nome;
        this.descricao = descricao;
        this.qtd_voluntarios = qtd_voluntarios;
    }
}

class voluntariosDisponiveis {
    constructor(id_membro, nome_completo, ativo, apto_voluntario, voluntario) {
        this.id_membro = id_membro;
        this.nome_completo = nome_completo;
        this.ativo = ativo;
        this.apto = apto_voluntario;
        this.voluntario = voluntario;
    }
}

class eventos {
    constructor(id_evento, nome, data_evento, criado_em, hora_inicio, hora_fim, tipo_evento) {
        this.id_evento = id_evento;
        this.nome = nome;
        this.data_evento = data_evento;
        this.criado_em = criado_em;
        this.hora_inicio = hora_inicio;
        this.hora_fim = hora_fim;
        this.tipo_evento = tipo_evento;
    }
}

// Situação temporal do evento, calculada pelo horário real (nunca por um status manual),
// sempre no fuso da igreja (America/Sao_Paulo), qualquer que seja o fuso do servidor.
// - Início: data + hora de início (sem hora de início, o começo do dia).
// - Término: data + hora de término; se o término for antes (ou igual) ao início, o
//   evento atravessa a meia-noite e termina no dia seguinte. Sem hora de término, o
//   evento vale até o fim do dia (não se presume que terminou antes).
// - Realizado: o horário de término já foi atingido. Em andamento: começou e não terminou.
// "e" é o apelido da tabela eventos na consulta.
const AGORA = "(now() AT TIME ZONE 'America/Sao_Paulo')";
const INICIO_DO_EVENTO = "(e.data_evento + COALESCE(e.hora_inicio, TIME '00:00'))";
const FIM_DO_EVENTO = `(CASE
    WHEN e.hora_fim IS NULL THEN e.data_evento + TIME '23:59:59.999'
    WHEN e.hora_inicio IS NOT NULL AND e.hora_fim <= e.hora_inicio THEN e.data_evento + 1 + e.hora_fim
    ELSE e.data_evento + e.hora_fim END)`;
const SITUACAO = {
    realizado: `(${FIM_DO_EVENTO} <= ${AGORA})`,
    emAndamento: `(${INICIO_DO_EVENTO} <= ${AGORA} AND ${FIM_DO_EVENTO} > ${AGORA})`,
    // Já começou (em andamento ou realizado): a escala fica só para consulta
    iniciado: `(${INICIO_DO_EVENTO} <= ${AGORA})`
};

// Mesma regra para uma escala ("es"), pelo evento dela. Escala sem evento usa a
// própria data e o horário de chegada (e vale até o fim desse dia).
const SITUACAO_ESCALA = {
    bloqueada: `COALESCE(${SITUACAO.iniciado}, (es.data_escala + COALESCE(es.horario, TIME '00:00')) <= ${AGORA})`,
    realizada: `COALESCE(${SITUACAO.realizado}, (es.data_escala + TIME '23:59:59.999') <= ${AGORA})`
};

// Mensagens únicas para o bloqueio (backend e tela usam o mesmo texto)
const MENSAGENS_BLOQUEIO = {
    realizado: 'Este evento já foi realizado. Sua escala está disponível somente para consulta e não pode mais ser alterada.',
    andamento: 'Este evento está em andamento. Sua escala está disponível somente para consulta e não pode mais ser alterada.'
};

// Situação de um voluntário na escala, só pelos estados gravados no banco.
// Combinação fora das regras (confirmado E recusado) não vira confirmação nem recusa.
function situacaoDoParticipante(p) {
    if (p.confirmado === true && p.recusado !== true) return 'confirmado';
    if (p.recusado === true && p.confirmado !== true) return 'recusado';
    if (p.confirmado !== true && p.recusado !== true) return 'pendente';
    return 'indefinido';
}

// Totais de um evento a partir das escalas detalhadas (cada escala = uma função no evento).
// Vagas = qtd_voluntarios da escala; quem recusou não ocupa vaga (mesma regra do Dashboard).
function resumirEvento(escalas) {
    const pessoas = new Set();
    const total = { funcoes: escalas.length, vagas: 0, atribuicoes: 0, pessoas: 0, confirmados: 0, recusados: 0,
                    pendentes: 0, indefinidos: 0, vagas_nao_preenchidas: 0, funcoes_completas: 0, funcoes_com_pendencias: 0 };

    const funcoes = escalas.map(escala => {
        const conta = { confirmado: 0, recusado: 0, pendente: 0, indefinido: 0 };
        const participantes = escala.participantes.map(p => {
            const situacao = situacaoDoParticipante(p);
            conta[situacao]++;
            pessoas.add(p.id_voluntario);
            return { ...p, situacao };
        });
        const vagas = Number(escala.qtd_voluntarios) || 0;
        const ocupadas = conta.confirmado + conta.pendente + conta.indefinido;
        const naoPreenchidas = Math.max(vagas - ocupadas, 0);
        const completa = naoPreenchidas === 0 && conta.pendente === 0 && conta.indefinido === 0;

        total.vagas += vagas;
        total.atribuicoes += participantes.length;
        total.confirmados += conta.confirmado;
        total.recusados += conta.recusado;
        total.pendentes += conta.pendente;
        total.indefinidos += conta.indefinido;
        total.vagas_nao_preenchidas += naoPreenchidas;
        total[completa ? 'funcoes_completas' : 'funcoes_com_pendencias']++;

        return {
            ...escala, participantes, vagas, confirmados: conta.confirmado, recusados: conta.recusado,
            pendentes: conta.pendente, indefinidos: conta.indefinido, vagas_nao_preenchidas: naoPreenchidas,
            situacao: completa ? 'completa' : 'com_pendencias'
        };
    });
    total.pessoas = pessoas.size;
    return { funcoes, resumo: total };
}

const eventoModel = {

    SITUACAO,
    SITUACAO_ESCALA,
    MENSAGENS_BLOQUEIO,
    situacaoDoParticipante,
    resumirEvento,

    criarEvento: async (nome, data_evento, criado_em, hora_inicio, hora_fim, tipo_evento) => {
        const result = await pool.query(
            `
            INSERT INTO eventos
            (nome, data_evento, criado_em, hora_inicio, hora_fim, tipo_evento)
            VALUES ($1, $2, COALESCE($3, CURRENT_TIMESTAMP), $4, $5, $6)
            RETURNING *
            `,
            [nome, data_evento, criado_em, hora_inicio, hora_fim, tipo_evento]
        );
        const p = result.rows[0];
        return new eventos(p.id_evento, p.nome, p.data_evento, p.criado_em, p.hora_inicio, p.hora_fim, p.tipo_evento);
    },

    // Próximos eventos (ainda não terminaram), do mais próximo ao mais distante
    // (4 no dashboard; a Minha área pede mais)
    selecionaEventos: async (limite = 4) => {
        const result = await pool.query(
            `SELECT * FROM eventos e
             WHERE NOT ${SITUACAO.realizado}
             ORDER BY e.data_evento ASC, e.hora_inicio ASC NULLS LAST, e.id_evento ASC
             LIMIT $1`,
            [limite]
        );
        return result.rows.map(row =>
            new eventos(row.id_evento, row.nome, row.data_evento, row.criado_em, row.hora_inicio, row.hora_fim, row.tipo_evento)
        );
    },

    // Todos os eventos, dos mais recentes para os mais antigos, com a situação
    // temporal (realizado / em andamento) e os totais de escalas e voluntários
    // (o total de escalas também serve para avisar antes de remover)
    selecionaTodosEventos: async () => {
        const result = await pool.query(
            `SELECT e.*, ${SITUACAO.realizado} AS realizado, ${SITUACAO.emAndamento} AS em_andamento,
                    (SELECT COUNT(*) FROM escalas es WHERE es.id_evento = e.id_evento)::int AS total_escalas,
                    (SELECT COUNT(*) FROM escalas es JOIN escala_participantes ep ON ep.id_escala = es.id_escala
                     WHERE es.id_evento = e.id_evento)::int AS total_voluntarios,
                    (SELECT COUNT(*) FROM escalas es JOIN escala_participantes ep ON ep.id_escala = es.id_escala
                     WHERE es.id_evento = e.id_evento AND ep.confirmado IS TRUE AND ep.recusado IS NOT TRUE)::int AS total_confirmados
             FROM eventos e ORDER BY e.data_evento DESC, e.hora_inicio DESC`
        );
        return result.rows.map(row => ({
            ...new eventos(row.id_evento, row.nome, row.data_evento, row.criado_em, row.hora_inicio, row.hora_fim, row.tipo_evento),
            realizado: row.realizado,
            em_andamento: row.em_andamento,
            total_escalas: row.total_escalas,
            total_voluntarios: row.total_voluntarios,
            total_confirmados: row.total_confirmados
        }));
    },

    // Só a situação temporal (para barrar alterações em eventos que já começaram)
    buscarSituacao: async (id, executor = pool) => {
        const result = await executor.query(
            `SELECT e.id_evento, ${SITUACAO.realizado} AS realizado, ${SITUACAO.emAndamento} AS em_andamento,
                    ${SITUACAO.iniciado} AS iniciado,
                    to_char(e.data_evento, 'YYYY-MM-DD') AS data_evento, to_char(e.hora_inicio, 'HH24:MI') AS hora_inicio
             FROM eventos e WHERE e.id_evento = $1`,
            [id]
        );
        return result.rows[0];
    },

    // Evento completo: dados gravados, escalas (funções) com os voluntários e a
    // resposta de cada um, e os totais. Usado nos detalhes do evento e no relatório.
    // Um voluntário aparece uma vez por escala (não é contado em dobro).
    detalhar: async (id) => {
        const evento = (await pool.query(
            `SELECT e.id_evento, e.nome, to_char(e.data_evento, 'YYYY-MM-DD') AS data_evento,
                    to_char(e.hora_inicio, 'HH24:MI') AS hora_inicio, to_char(e.hora_fim, 'HH24:MI') AS hora_fim,
                    e.tipo_evento, to_char(e.criado_em, 'YYYY-MM-DD"T"HH24:MI') AS criado_em,
                    ${SITUACAO.realizado} AS realizado, ${SITUACAO.emAndamento} AS em_andamento
             FROM eventos e WHERE e.id_evento = $1`,
            [id]
        )).rows[0];
        if (!evento) return null;

        const escalas = (await pool.query(
            `SELECT es.id_escala, es.id_funcao, f.nome AS funcao, to_char(es.horario, 'HH24:MI') AS horario,
                    es.qtd_voluntarios, es.descricao, es.observacoes,
                    COALESCE(json_agg(json_build_object(
                        'id_voluntario', ep.id_voluntario,
                        'nome', m.nome_completo,
                        'confirmado', ep.confirmado,
                        'recusado', ep.recusado,
                        'motivo_recusa', ep.motivo_recusa,
                        'respondido_em', to_char(ep.respondido_em, 'YYYY-MM-DD"T"HH24:MI')
                    ) ORDER BY m.nome_completo, ep.id_voluntario) FILTER (WHERE ep.id_voluntario IS NOT NULL), '[]') AS participantes
             FROM escalas es
             LEFT JOIN funcoes f ON f.id_funcao = es.id_funcao
             LEFT JOIN escala_participantes ep ON ep.id_escala = es.id_escala
             LEFT JOIN voluntarios v ON v.id_voluntario = ep.id_voluntario
             LEFT JOIN membros m ON m.id_membro = v.id_membro
             WHERE es.id_evento = $1
             GROUP BY es.id_escala, f.nome
             ORDER BY f.nome NULLS LAST, es.horario, es.id_escala`,
            [id]
        )).rows.map(escala => ({
            ...escala,
            participantes: escala.participantes.filter((p, i, todos) => todos.findIndex(o => o.id_voluntario === p.id_voluntario) === i)
        }));

        return { evento, ...resumirEvento(escalas) };
    },

    // Altera evento que ainda não começou. Durante o evento só vale ajuste que não mexe
    // na escala: mesma data e mesmo início (ex.: corrigir o horário de término).
    // Evento realizado não muda. null = não encontrado ou não permitido.
    atualizarEvento: async (id, { nome, data_evento, hora_inicio, hora_fim, tipo_evento }) => {
        const result = await pool.query(
            `UPDATE eventos e
             SET nome = $2, data_evento = $3, hora_inicio = $4, hora_fim = $5, tipo_evento = $6
             WHERE e.id_evento = $1 AND NOT ${SITUACAO.realizado}
               AND (NOT ${SITUACAO.iniciado}
                    OR (e.data_evento = $3::date AND e.hora_inicio IS NOT DISTINCT FROM $4::time))
             RETURNING *`,
            [id, nome, data_evento, hora_inicio, hora_fim, tipo_evento]
        );
        const p = result.rows[0];
        if (!p) return null;
        // As escalas do evento acompanham a nova data
        await pool.query('UPDATE escalas SET data_escala = $2 WHERE id_evento = $1', [id, data_evento]);
        return new eventos(p.id_evento, p.nome, p.data_evento, p.criado_em, p.hora_inicio, p.hora_fim, p.tipo_evento);
    },

    // Remove o evento com suas escalas (os voluntários escalados saem junto).
    // Evento que já começou (em andamento ou realizado) é histórico: devolve
    // { realizado } / { emAndamento } e não apaga nada.
    removerEvento: async (id) => {
        const cliente = await pool.connect();
        try {
            await cliente.query('BEGIN');
            const situacao = (await cliente.query(
                `SELECT ${SITUACAO.realizado} AS realizado, ${SITUACAO.iniciado} AS iniciado
                 FROM eventos e WHERE e.id_evento = $1 FOR UPDATE`, [id]
            )).rows[0];
            if (!situacao || situacao.iniciado) {
                await cliente.query('ROLLBACK');
                return situacao ? (situacao.realizado ? { realizado: true } : { emAndamento: true }) : null;
            }
            // Atendimento de turma é histórico das crianças: o evento não pode sumir
            const atendimento = await cliente.query('SELECT 1 FROM turma_sessoes WHERE id_evento = $1 LIMIT 1', [id]);
            if (atendimento.rowCount) {
                await cliente.query('ROLLBACK');
                return { comAtendimento: true };
            }
            // escala_participantes não apaga em cascata: os voluntários escalados saem primeiro
            await cliente.query(
                'DELETE FROM escala_participantes WHERE id_escala IN (SELECT id_escala FROM escalas WHERE id_evento = $1)', [id]
            );
            const escalas = await cliente.query('DELETE FROM escalas WHERE id_evento = $1', [id]);
            const evento = await cliente.query('DELETE FROM eventos WHERE id_evento = $1', [id]);
            await cliente.query('COMMIT');
            return evento.rowCount ? { escalas_removidas: escalas.rowCount } : null;
        } catch (error) {
            await cliente.query('ROLLBACK');
            throw error;
        } finally {
            cliente.release();
        }
    },

    selecionaFuncao: async () => {
        const result = await pool.query(
            'SELECT * FROM funcoes ORDER BY nome ASC'
        );
        return result.rows.map(row =>
            new funcoes(row.id_funcao, row.nome, row.descricao, row.qtd_voluntarios)
        );
    },

    selecionaVoluntariosAtivos: async () => {
        const result = await pool.query(
            'SELECT * FROM vw_voluntarios_disponiveis ORDER BY nome_completo ASC'
        );
        return result.rows.map(row =>
            new voluntariosDisponiveis(row.id_membro, row.nome_completo, row.ativo, row.apto_voluntario, row.voluntario)
        );
    }

}

module.exports = eventoModel;
