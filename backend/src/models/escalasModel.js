const pool = require('../config/db');
const Eventos = require('./eventosModel');

// Escalas com os voluntários e as respostas (Escalas do dia e "Gerenciar escala").
// "filtro" é um trecho fixo de WHERE com parâmetros ($1...), nunca valores do usuário.
async function consultarEscalas(filtro, valores) {
    const result = await pool.query(
        `SELECT es.id_escala, es.id_evento, e.nome AS evento, e.hora_inicio, e.hora_fim, e.tipo_evento,
                to_char(es.data_escala, 'YYYY-MM-DD') AS data_escala, ${Eventos.SITUACAO.realizado} AS realizado,
                es.id_funcao, f.nome AS funcao, es.horario, es.qtd_voluntarios, es.observacoes,
                COALESCE(json_agg(json_build_object(
                    'id_voluntario', ep.id_voluntario,
                    'nome', m.nome_completo,
                    'confirmado', ep.confirmado,
                    'recusado', ep.recusado,
                    'motivo_recusa', ep.motivo_recusa,
                    'ausente', EXISTS (SELECT 1 FROM voluntario_ausencias va
                                       WHERE va.id_voluntario = ep.id_voluntario
                                         AND es.data_escala BETWEEN va.data_inicio AND va.data_fim)
                ) ORDER BY m.nome_completo) FILTER (WHERE ep.id_voluntario IS NOT NULL), '[]') AS participantes,
                COUNT(ep.*) FILTER (WHERE ep.confirmado IS TRUE)::int AS confirmados,
                COUNT(ep.*) FILTER (WHERE ep.confirmado IS NOT TRUE AND NOT ep.recusado)::int AS pendentes,
                COUNT(ep.*) FILTER (WHERE ep.recusado)::int AS recusados
         FROM escalas es
         LEFT JOIN eventos e ON e.id_evento = es.id_evento
         LEFT JOIN funcoes f ON f.id_funcao = es.id_funcao
         LEFT JOIN escala_participantes ep ON ep.id_escala = es.id_escala
         LEFT JOIN voluntarios v ON v.id_voluntario = ep.id_voluntario
         LEFT JOIN membros m ON m.id_membro = v.id_membro
         WHERE ${filtro}
         GROUP BY es.id_escala, e.id_evento, f.id_funcao
         ORDER BY e.hora_inicio, es.horario, f.nome`,
        valores
    );
    return result.rows;
}

const escalasModel = {

    // Dias do mês que têm eventos, com o total de escalas e de pendências
    // (dias que já passaram não contam como pendentes)
    calendario: async (inicio, fim) => {
        const result = await pool.query(
            `SELECT e.data_evento AS data,
                    json_agg(json_build_object('nome', e.nome, 'tipo', e.tipo_evento) ORDER BY e.hora_inicio) AS eventos,
                    COALESCE(SUM(x.escalas), 0)::int AS escalas,
                    COALESCE(SUM(x.pendentes), 0)::int AS pendentes,
                    COALESCE(SUM(x.recusados), 0)::int AS recusados
             FROM eventos e
             LEFT JOIN LATERAL (
                 SELECT COUNT(DISTINCT es.id_escala) AS escalas,
                        COUNT(ep.*) FILTER (WHERE ep.confirmado IS NOT TRUE AND NOT ep.recusado AND e.data_evento >= CURRENT_DATE) AS pendentes,
                        COUNT(ep.*) FILTER (WHERE ep.recusado AND e.data_evento >= CURRENT_DATE) AS recusados
                 FROM escalas es
                 LEFT JOIN escala_participantes ep ON ep.id_escala = es.id_escala
                 WHERE es.id_evento = e.id_evento
             ) x ON TRUE
             WHERE e.data_evento BETWEEN $1 AND $2
             GROUP BY e.data_evento
             ORDER BY e.data_evento`,
            [inicio, fim]
        );
        return result.rows;
    },

    eventosDoDia: async (data) => {
        const result = await pool.query(
            `SELECT id_evento, nome, hora_inicio, hora_fim, tipo_evento
             FROM eventos WHERE data_evento = $1 ORDER BY hora_inicio`,
            [data]
        );
        return result.rows;
    },

    escalasDoDia: async (data) => consultarEscalas('es.data_escala = $1', [data]),

    // Uma escala (mesmo formato das escalas do dia), com a data e se o evento já terminou
    buscarEscala: async (id) => (await consultarEscalas('es.id_escala = $1', [id]))[0],

    // Atribuições que ainda aguardam resposta (nem confirmadas nem recusadas) em eventos
    // que ainda não terminaram — o mesmo critério do card "Confirmações pendentes" do Dashboard
    pendentes: async () => {
        const result = await pool.query(
            `SELECT es.id_escala, ep.id_voluntario, m.nome_completo AS voluntario, m.telefone,
                    to_char(es.data_escala, 'YYYY-MM-DD') AS data_escala, to_char(es.horario, 'HH24:MI') AS horario,
                    es.id_evento, e.nome AS evento, to_char(e.hora_inicio, 'HH24:MI') AS hora_inicio,
                    to_char(e.hora_fim, 'HH24:MI') AS hora_fim, e.tipo_evento,
                    es.id_funcao, f.nome AS funcao, es.qtd_voluntarios
             FROM escala_participantes ep
             JOIN escalas es ON es.id_escala = ep.id_escala
             LEFT JOIN eventos e ON e.id_evento = es.id_evento
             LEFT JOIN funcoes f ON f.id_funcao = es.id_funcao
             JOIN voluntarios v ON v.id_voluntario = ep.id_voluntario
             JOIN membros m ON m.id_membro = v.id_membro
             WHERE ep.confirmado IS NOT TRUE AND ep.recusado IS NOT TRUE
               AND es.data_escala >= CURRENT_DATE
               AND NOT COALESCE(${Eventos.SITUACAO.realizado}, FALSE)
             ORDER BY es.data_escala ASC, e.hora_inicio ASC NULLS LAST, es.horario, f.nome, m.nome_completo`
        );
        return result.rows;
    },

    // Troca o voluntário de uma vaga: a MESMA linha de escala_participantes passa
    // a ser do novo voluntário (escala, evento e função continuam os mesmos, então não
    // surge uma segunda atribuição para a vaga). A resposta do anterior não vale para o
    // novo: a confirmação volta para "aguardando resposta".
    // Devolve { erro, status } quando a troca não é permitida.
    substituirParticipante: async (idEscala, idAnterior, idNovo) => {
        const cliente = await pool.connect();
        try {
            await cliente.query('BEGIN');
            const escala = (await cliente.query(
                `SELECT es.id_escala, es.id_funcao, ${Eventos.SITUACAO.realizado} AS realizado
                 FROM escalas es LEFT JOIN eventos e ON e.id_evento = es.id_evento
                 WHERE es.id_escala = $1 FOR UPDATE OF es`,
                [idEscala]
            )).rows[0];
            const falha = async (status, erro) => { await cliente.query('ROLLBACK'); return { status, erro }; };

            if (!escala) return falha(404, 'Escala não encontrada.');
            if (escala.realizado) return falha(409, 'O evento desta escala já foi realizado. O histórico não pode ser alterado.');

            const atuais = (await cliente.query(
                'SELECT id_voluntario FROM escala_participantes WHERE id_escala = $1', [idEscala]
            )).rows.map(r => r.id_voluntario);
            if (!atuais.includes(idAnterior)) return falha(404, 'Este voluntário não está nesta escala.');
            if (atuais.includes(idNovo)) return falha(409, 'O voluntário escolhido já está nesta escala.');

            // Mesmos critérios de quem pode ser escalado (pessoa ativa e apta, ficha ativa, atua na função)
            if ((await escalasModel.voluntariosInelegiveis(escala.id_funcao, [idNovo], cliente)).length) {
                return falha(400, 'O voluntário escolhido não está ativo e apto para esta função.');
            }

            const result = await cliente.query(
                `UPDATE escala_participantes
                 SET id_voluntario = $3, confirmado = FALSE, recusado = FALSE, motivo_recusa = NULL, respondido_em = NULL
                 WHERE id_escala = $1 AND id_voluntario = $2
                 RETURNING *`,
                [idEscala, idAnterior, idNovo]
            );
            await cliente.query('COMMIT');
            return { participante: result.rows[0] };
        } catch (error) {
            await cliente.query('ROLLBACK');
            throw error;
        } finally {
            cliente.release();
        }
    },

    // Voluntários ativos que atuam na função; "disponivel" = o dia da semana bate
    // e não há ausência informada para a data
    voluntariosDaFuncao: async (idFuncao, diaSemana, data) => {
        const result = await pool.query(
            `SELECT v.id_voluntario, m.nome_completo AS nome,
                    au.motivo AS motivo_ausencia, (au.id_ausencia IS NOT NULL) AS ausente,
                    ($2 = ANY (v.disponibilidade) AND au.id_ausencia IS NULL) AS disponivel
             FROM voluntarios v
             JOIN membros m ON m.id_membro = v.id_membro
             JOIN voluntario_funcoes vf ON vf.id_voluntario = v.id_voluntario
             LEFT JOIN LATERAL (
                 SELECT id_ausencia, motivo FROM voluntario_ausencias
                 WHERE id_voluntario = v.id_voluntario AND $3::date BETWEEN data_inicio AND data_fim
                 LIMIT 1
             ) au ON TRUE
             WHERE v.ativo AND m.ativo AND m.apto_voluntario AND vf.id_funcao = $1
             ORDER BY disponivel DESC, ausente, m.nome_completo`,
            [idFuncao, diaSemana, data]
        );
        return result.rows;
    },

    // Ids (entre os informados) que NÃO podem ser escalados nesta função
    // ("executor" pode ser o pool ou um cliente dentro de uma transação)
    voluntariosInelegiveis: async (idFuncao, ids, executor = pool) => {
        const result = await executor.query(
            `SELECT id FROM unnest($2::int[]) AS id
             WHERE NOT EXISTS (
                 SELECT 1 FROM voluntarios v
                 JOIN membros m ON m.id_membro = v.id_membro
                 JOIN voluntario_funcoes vf ON vf.id_voluntario = v.id_voluntario AND vf.id_funcao = $1
                 WHERE v.id_voluntario = id AND v.ativo AND m.ativo AND m.apto_voluntario
             )`,
            [idFuncao, ids]
        );
        return result.rows.map(r => r.id);
    },

    criar: async (e) => {
        const cliente = await pool.connect();
        try {
            await cliente.query('BEGIN');

            let idEvento = e.id_evento;
            if (!idEvento) {
                idEvento = (await cliente.query(
                    `INSERT INTO eventos (nome, data_evento, hora_inicio, hora_fim, tipo_evento)
                     VALUES ($1, $2, $3, $4, $5) RETURNING id_evento`,
                    [e.evento.nome, e.data, e.evento.hora_inicio, e.evento.hora_fim, e.evento.tipo_evento]
                )).rows[0].id_evento;
            }

            const escala = (await cliente.query(
                `INSERT INTO escalas (id_evento, id_funcao, qtd_voluntarios, data_escala, horario, descricao, observacoes)
                 VALUES ($1, $2, $3, $4, $5,
                         (SELECT f.nome || ' — ' || ev.nome FROM funcoes f, eventos ev WHERE f.id_funcao = $2 AND ev.id_evento = $1),
                         $6)
                 RETURNING *`,
                [idEvento, e.id_funcao, e.qtd_voluntarios, e.data, e.horario, e.observacoes]
            )).rows[0];

            for (const idVoluntario of e.voluntarios) {
                await cliente.query(
                    `INSERT INTO escala_participantes (id_escala, id_voluntario, id_funcao, confirmado)
                     VALUES ($1, $2, $3, FALSE)`,
                    [escala.id_escala, idVoluntario, e.id_funcao]
                );
            }

            await cliente.query('COMMIT');
            return escala;
        } catch (error) {
            await cliente.query('ROLLBACK');
            throw error;
        } finally {
            cliente.release();
        }
    },

    confirmarParticipante: async (idEscala, idVoluntario, confirmado) => {
        const result = await pool.query(
            `UPDATE escala_participantes
             SET confirmado = $3, recusado = FALSE, motivo_recusa = NULL, respondido_em = CURRENT_TIMESTAMP
             WHERE id_escala = $1 AND id_voluntario = $2
             RETURNING *`,
            [idEscala, idVoluntario, confirmado]
        );
        return result.rows[0];
    }
};

module.exports = escalasModel;
