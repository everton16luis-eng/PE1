const pool = require('../config/db');

const voluntariosModel = {

    resumo: async () => {
        const result = await pool.query(
            `SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE ativo)::int AS ativos,
                    COUNT(*) FILTER (WHERE NOT ativo)::int AS inativos,
                    (SELECT COUNT(*)::int FROM vw_voluntarios_disponiveis) AS disponiveis
             FROM voluntarios`
        );
        return result.rows[0];
    },

    listar: async () => {
        const result = await pool.query(
            `SELECT v.id_voluntario, v.id_membro, m.nome_completo AS nome, m.telefone, m.email,
                    v.id_departamento, d.nome AS departamento, v.disponibilidade, v.ativo, v.observacoes,
                    v.data_inicio_voluntariado,
                    COALESCE(
                        (SELECT json_agg(json_build_object('id_funcao', f.id_funcao, 'nome', f.nome) ORDER BY f.nome)
                         FROM voluntario_funcoes vf JOIN funcoes f ON f.id_funcao = vf.id_funcao
                         WHERE vf.id_voluntario = v.id_voluntario), '[]') AS funcoes,
                    (SELECT MAX(es.data_escala)
                     FROM escala_participantes ep JOIN escalas es ON es.id_escala = ep.id_escala
                     WHERE ep.id_voluntario = v.id_voluntario AND es.data_escala <= CURRENT_DATE) AS ultima_escala
             FROM voluntarios v
             JOIN membros m ON m.id_membro = v.id_membro
             LEFT JOIN departamentos d ON d.id_departamento = v.id_departamento
             ORDER BY v.ativo DESC, m.nome_completo ASC`
        );
        return result.rows;
    },

    // Membros ativos que ainda não são voluntários (para o cadastro)
    candidatos: async () => {
        const result = await pool.query(
            `SELECT m.id_membro, m.nome_completo, m.telefone, m.email, m.apto_voluntario
             FROM membros m
             WHERE m.ativo AND NOT EXISTS (SELECT 1 FROM voluntarios v WHERE v.id_membro = m.id_membro)
             ORDER BY m.apto_voluntario DESC, m.nome_completo ASC`
        );
        return result.rows;
    },

    departamentos: async () => {
        const result = await pool.query('SELECT id_departamento, nome FROM departamentos WHERE ativo ORDER BY nome');
        return result.rows;
    },

    criar: async (v) => {
        const cliente = await pool.connect();
        try {
            await cliente.query('BEGIN');

            const voluntario = (await cliente.query(
                `INSERT INTO voluntarios (id_membro, id_departamento, data_inicio_voluntariado, ativo,
                                          disponibilidade, observacoes, numero_mes_batizado)
                 VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, 0)
                 RETURNING *`,
                [v.id_membro, v.id_departamento, v.ativo, v.disponibilidade, v.observacoes]
            )).rows[0];

            for (const idFuncao of v.funcoes) {
                await cliente.query(
                    'INSERT INTO voluntario_funcoes (id_voluntario, id_funcao) VALUES ($1, $2)',
                    [voluntario.id_voluntario, idFuncao]
                );
            }

            // Atualiza o contato do membro e marca como apto ao voluntariado
            await cliente.query(
                `UPDATE membros
                 SET apto_voluntario = TRUE,
                     telefone = COALESCE($2, telefone),
                     email = COALESCE($3, email)
                 WHERE id_membro = $1`,
                [v.id_membro, v.telefone, v.email]
            );

            await cliente.query('COMMIT');
            return voluntario;
        } catch (error) {
            await cliente.query('ROLLBACK');
            throw error;
        } finally {
            cliente.release();
        }
    },

    alterarStatus: async (id, ativo) => {
        const result = await pool.query(
            'UPDATE voluntarios SET ativo = $2 WHERE id_voluntario = $1 RETURNING id_voluntario, ativo',
            [id, ativo]
        );
        return result.rows[0];
    },

    // ---------------------------------------------------------
    // Ficha completa (usada pela gestão e pelo portal)
    // ---------------------------------------------------------

    idPorMembro: async (idMembro) => {
        const result = await pool.query('SELECT id_voluntario FROM voluntarios WHERE id_membro = $1', [idMembro]);
        return result.rows[0]?.id_voluntario || null;
    },

    buscarFicha: async (id) => {
        const dados = (await pool.query(
            `SELECT v.id_voluntario, v.id_membro, m.nome_completo AS nome, m.telefone, m.email, m.data_nascimento,
                    v.id_departamento, d.nome AS departamento, v.disponibilidade, v.ativo, v.observacoes,
                    v.data_inicio_voluntariado, v.data_batismo,
                    COALESCE((SELECT json_agg(json_build_object('id_funcao', f.id_funcao, 'nome', f.nome) ORDER BY f.nome)
                              FROM voluntario_funcoes vf JOIN funcoes f ON f.id_funcao = vf.id_funcao
                              WHERE vf.id_voluntario = v.id_voluntario), '[]') AS funcoes,
                    (SELECT json_build_object('id_usuario', u.id_usuario, 'email', u.email, 'ativo', u.ativo, 'ultimo_acesso', u.ultimo_acesso)
                     FROM usuarios u WHERE u.id_membro = v.id_membro) AS acesso
             FROM voluntarios v
             JOIN membros m ON m.id_membro = v.id_membro
             LEFT JOIN departamentos d ON d.id_departamento = v.id_departamento
             WHERE v.id_voluntario = $1`,
            [id]
        )).rows[0];
        if (!dados) return null;

        const [estatisticas, proximas, historico, ausencias, porFuncao] = await Promise.all([
            pool.query(
                `SELECT COUNT(*)::int AS total,
                        COUNT(*) FILTER (WHERE es.data_escala < CURRENT_DATE)::int AS realizadas,
                        COUNT(*) FILTER (WHERE es.data_escala < CURRENT_DATE AND ep.confirmado)::int AS presentes,
                        COUNT(*) FILTER (WHERE es.data_escala >= CURRENT_DATE)::int AS proximas,
                        COUNT(*) FILTER (WHERE es.data_escala >= CURRENT_DATE AND NOT ep.confirmado AND NOT ep.recusado)::int AS aguardando,
                        COUNT(*) FILTER (WHERE ep.recusado)::int AS recusadas,
                        MAX(es.data_escala) FILTER (WHERE es.data_escala < CURRENT_DATE) AS ultima,
                        MIN(es.data_escala) FILTER (WHERE es.data_escala >= CURRENT_DATE) AS proxima
                 FROM escala_participantes ep JOIN escalas es ON es.id_escala = ep.id_escala
                 WHERE ep.id_voluntario = $1`,
                [id]),
            pool.query(
                `SELECT es.id_escala, es.id_evento, es.data_escala, es.horario, e.nome AS evento, e.hora_inicio, e.hora_fim,
                        f.nome AS funcao, ep.confirmado, ep.recusado, ep.motivo_recusa, es.observacoes,
                        COALESCE((SELECT json_agg(json_build_object('nome', m2.nome_completo, 'funcao', f2.nome) ORDER BY f2.nome, m2.nome_completo)
                                  FROM escala_participantes ep2
                                  JOIN escalas es2 ON es2.id_escala = ep2.id_escala
                                  JOIN voluntarios v2 ON v2.id_voluntario = ep2.id_voluntario
                                  JOIN membros m2 ON m2.id_membro = v2.id_membro
                                  JOIN funcoes f2 ON f2.id_funcao = ep2.id_funcao
                                  WHERE es2.id_evento = es.id_evento AND ep2.id_voluntario <> ep.id_voluntario AND NOT ep2.recusado), '[]') AS colegas
                 FROM escala_participantes ep
                 JOIN escalas es ON es.id_escala = ep.id_escala
                 LEFT JOIN eventos e ON e.id_evento = es.id_evento
                 LEFT JOIN funcoes f ON f.id_funcao = ep.id_funcao
                 WHERE ep.id_voluntario = $1 AND es.data_escala >= CURRENT_DATE
                 ORDER BY es.data_escala, es.horario`,
                [id]),
            pool.query(
                `SELECT es.id_escala, es.data_escala, es.horario, e.nome AS evento, f.nome AS funcao, ep.confirmado, ep.recusado
                 FROM escala_participantes ep
                 JOIN escalas es ON es.id_escala = ep.id_escala
                 LEFT JOIN eventos e ON e.id_evento = es.id_evento
                 LEFT JOIN funcoes f ON f.id_funcao = ep.id_funcao
                 WHERE ep.id_voluntario = $1 AND es.data_escala < CURRENT_DATE
                 ORDER BY es.data_escala DESC, es.horario DESC
                 LIMIT 30`,
                [id]),
            pool.query(
                `SELECT id_ausencia, data_inicio, data_fim, motivo
                 FROM voluntario_ausencias WHERE id_voluntario = $1 AND data_fim >= CURRENT_DATE
                 ORDER BY data_inicio`,
                [id]),
            pool.query(
                `SELECT f.nome AS funcao, COUNT(*)::int AS vezes
                 FROM escala_participantes ep
                 JOIN escalas es ON es.id_escala = ep.id_escala
                 JOIN funcoes f ON f.id_funcao = ep.id_funcao
                 WHERE ep.id_voluntario = $1 AND es.data_escala < CURRENT_DATE AND ep.confirmado
                 GROUP BY f.nome ORDER BY vezes DESC`,
                [id])
        ]);

        return {
            ...dados,
            estatisticas: estatisticas.rows[0],
            proximas: proximas.rows,
            historico: historico.rows,
            ausencias: ausencias.rows,
            por_funcao: porFuncao.rows
        };
    },

    atualizar: async (id, v) => {
        const cliente = await pool.connect();
        try {
            await cliente.query('BEGIN');
            const voluntario = (await cliente.query(
                `UPDATE voluntarios
                 SET id_departamento = $2, ativo = $3, disponibilidade = $4, observacoes = $5
                 WHERE id_voluntario = $1
                 RETURNING id_voluntario, id_membro`,
                [id, v.id_departamento, v.ativo, v.disponibilidade, v.observacoes]
            )).rows[0];
            if (!voluntario) {
                await cliente.query('ROLLBACK');
                return null;
            }

            await cliente.query('DELETE FROM voluntario_funcoes WHERE id_voluntario = $1', [id]);
            for (const idFuncao of v.funcoes) {
                await cliente.query('INSERT INTO voluntario_funcoes (id_voluntario, id_funcao) VALUES ($1, $2)', [id, idFuncao]);
            }
            await cliente.query('UPDATE membros SET telefone = $2, email = $3 WHERE id_membro = $1',
                [voluntario.id_membro, v.telefone, v.email]);

            await cliente.query('COMMIT');
            return voluntario;
        } catch (error) {
            await cliente.query('ROLLBACK');
            throw error;
        } finally {
            cliente.release();
        }
    },

    // Disponibilidade e contato (o que o próprio voluntário pode mudar)
    atualizarPreferencias: async (id, { disponibilidade, telefone, email }) => {
        await pool.query('UPDATE voluntarios SET disponibilidade = $2 WHERE id_voluntario = $1', [id, disponibilidade]);
        await pool.query(
            'UPDATE membros SET telefone = $2, email = $3 WHERE id_membro = (SELECT id_membro FROM voluntarios WHERE id_voluntario = $1)',
            [id, telefone, email]
        );
    },

    // Confirma, volta para pendente ou recusa — só escalas desse voluntário
    responderEscala: async (id, idEscala, { confirmado, recusado, motivo }, somenteFuturas) => {
        const result = await pool.query(
            `UPDATE escala_participantes ep
             SET confirmado = $3, recusado = $4, motivo_recusa = $5, respondido_em = CURRENT_TIMESTAMP
             FROM escalas es
             WHERE ep.id_escala = es.id_escala AND ep.id_escala = $2 AND ep.id_voluntario = $1
               AND ($6::boolean IS FALSE OR es.data_escala >= CURRENT_DATE)
             RETURNING ep.id_escala, ep.confirmado, ep.recusado, ep.motivo_recusa`,
            [id, idEscala, confirmado, recusado, motivo, somenteFuturas]
        );
        return result.rows[0];
    },

    removerDaEscala: async (id, idEscala) => {
        const result = await pool.query(
            `DELETE FROM escala_participantes ep
             USING escalas es
             WHERE ep.id_escala = es.id_escala AND ep.id_escala = $2 AND ep.id_voluntario = $1
               AND es.data_escala >= CURRENT_DATE
             RETURNING ep.id_escala`,
            [id, idEscala]
        );
        return result.rowCount > 0;
    },

    adicionarAusencia: async (id, { data_inicio, data_fim, motivo }) => {
        const result = await pool.query(
            `INSERT INTO voluntario_ausencias (id_voluntario, data_inicio, data_fim, motivo)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [id, data_inicio, data_fim, motivo]
        );
        return result.rows[0];
    },

    removerAusencia: async (id, idAusencia) => {
        const result = await pool.query(
            'DELETE FROM voluntario_ausencias WHERE id_ausencia = $2 AND id_voluntario = $1',
            [id, idAusencia]
        );
        return result.rowCount > 0;
    },

    // Escalas em que o voluntário está durante uma ausência (para avisar)
    escalasNoPeriodo: async (id, inicio, fim) => {
        const result = await pool.query(
            `SELECT es.data_escala, e.nome AS evento
             FROM escala_participantes ep
             JOIN escalas es ON es.id_escala = ep.id_escala
             LEFT JOIN eventos e ON e.id_evento = es.id_evento
             WHERE ep.id_voluntario = $1 AND es.data_escala BETWEEN $2 AND $3 AND NOT ep.recusado
             ORDER BY es.data_escala`,
            [id, inicio, fim]
        );
        return result.rows;
    }
};

module.exports = voluntariosModel;
