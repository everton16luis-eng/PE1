const pool = require('../config/db');

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

    escalasDoDia: async (data) => {
        const result = await pool.query(
            `SELECT es.id_escala, es.id_evento, e.nome AS evento, e.hora_inicio, e.hora_fim,
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
             WHERE es.data_escala = $1
             GROUP BY es.id_escala, e.id_evento, f.id_funcao
             ORDER BY e.hora_inicio, es.horario, f.nome`,
            [data]
        );
        return result.rows;
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
             WHERE v.ativo AND vf.id_funcao = $1
             ORDER BY disponivel DESC, ausente, m.nome_completo`,
            [idFuncao, diaSemana, data]
        );
        return result.rows;
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
