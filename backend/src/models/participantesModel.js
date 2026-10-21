const pool = require('../config/db');

const participantesModel = {

    // Totais da página (visitantes já promovidos contam só como membros)
    resumo: async () => {
        const result = await pool.query(
            `SELECT (SELECT COUNT(*) FROM visitantes WHERE id_membro IS NULL)::int AS total_visitantes,
                    (SELECT COUNT(*) FROM membros)::int AS total_membros,
                    ((SELECT COUNT(*) FROM visitantes WHERE id_membro IS NULL) + (SELECT COUNT(*) FROM membros))::int AS total_pessoas,
                    (SELECT COUNT(*) FROM visitantes
                     WHERE id_membro IS NULL AND date_trunc('month', data_visita) = date_trunc('month', CURRENT_DATE))::int AS novos_visitantes_mes`
        );
        return result.rows[0];
    },

    // Membros e visitantes em uma lista só, dos mais recentes para os mais antigos.
    // "apto" = elegível ao voluntariado; "voluntario" = já serve (tabela voluntarios).
    listar: async () => {
        const result = await pool.query(
            `SELECT 'membro' AS tipo, m.id_membro AS id, m.nome_completo AS nome, m.email, m.telefone,
                    m.data_entrada_igreja AS data, m.ativo, NULL AS observacoes,
                    m.apto_voluntario AS apto,
                    EXISTS (SELECT 1 FROM voluntarios v WHERE v.id_membro = m.id_membro AND v.ativo) AS voluntario
             FROM membros m
             UNION ALL
             SELECT 'visitante', id_visitante, nome, email, telefone,
                    data_visita, TRUE, observacoes, FALSE, FALSE
             FROM visitantes
             WHERE id_membro IS NULL
             ORDER BY data DESC NULLS LAST, nome ASC`
        );
        return result.rows;
    },

    // Todo novo cadastro entra como visitante
    criarVisitante: async ({ nome, telefone, email, data_nascimento, estado_civil, endereco, data_visita, observacoes }) => {
        const result = await pool.query(
            `INSERT INTO visitantes (nome, telefone, email, data_nascimento, estado_civil, endereco, data_visita, observacoes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [nome, telefone, email, data_nascimento, estado_civil, endereco, data_visita, observacoes]
        );
        return result.rows[0];
    },

    // Promove um visitante a membro (o visitante fica como histórico, ligado ao membro).
    // Devolve null se o visitante não existe; { jaPromovido } se já virou membro.
    promoverAMembro: async (idVisitante, m) => {
        const cliente = await pool.connect();
        try {
            await cliente.query('BEGIN');
            const visitante = (await cliente.query(
                'SELECT * FROM visitantes WHERE id_visitante = $1 FOR UPDATE',
                [idVisitante]
            )).rows[0];
            if (!visitante) {
                await cliente.query('ROLLBACK');
                return null;
            }
            if (visitante.id_membro) {
                await cliente.query('ROLLBACK');
                return { jaPromovido: true };
            }

            // Membro novo nunca entra como apto ao voluntariado: isso é outra decisão
            const membro = (await cliente.query(
                `INSERT INTO membros (nome_completo, data_nascimento, telefone, email, endereco, estado_civil,
                                      data_entrada_igreja, informacoes_batismo, participa_celula, observacoes,
                                      apto_voluntario, voluntario, ativo)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, FALSE, FALSE, TRUE)
                 RETURNING *`,
                [visitante.nome, visitante.data_nascimento, visitante.telefone, visitante.email, visitante.endereco,
                 visitante.estado_civil, m.data_entrada_igreja, m.informacoes_batismo, m.participa_celula,
                 visitante.observacoes]
            )).rows[0];

            await cliente.query(
                'UPDATE visitantes SET id_membro = $2, promovido_em = CURRENT_TIMESTAMP WHERE id_visitante = $1',
                [idVisitante, membro.id_membro]
            );
            await cliente.query('COMMIT');
            return { membro };
        } catch (error) {
            await cliente.query('ROLLBACK');
            throw error;
        } finally {
            cliente.release();
        }
    },

    buscarMembro: async (idMembro) => {
        const result = await pool.query(
            `SELECT m.id_membro, m.nome_completo, m.ativo, m.apto_voluntario,
                    EXISTS (SELECT 1 FROM voluntarios v WHERE v.id_membro = m.id_membro AND v.ativo) AS voluntario_ativo
             FROM membros m WHERE m.id_membro = $1`,
            [idMembro]
        );
        return result.rows[0];
    },

    // Altera status (ativo) e/ou elegibilidade ao voluntariado (apto) de um membro
    atualizarClassificacao: async (idMembro, { ativo, apto_voluntario }) => {
        const result = await pool.query(
            `UPDATE membros
             SET ativo = COALESCE($2, ativo),
                 apto_voluntario = COALESCE($3, apto_voluntario)
             WHERE id_membro = $1
             RETURNING id_membro, nome_completo, ativo, apto_voluntario`,
            [idMembro, ativo, apto_voluntario]
        );
        return result.rows[0];
    }
};

module.exports = participantesModel;
