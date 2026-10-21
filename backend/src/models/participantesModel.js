const pool = require('../config/db');

const participantesModel = {

    resumo: async () => {
        const result = await pool.query('SELECT * FROM vw_resumo_pessoas');
        return result.rows[0];
    },

    // Membros e visitantes em uma lista só, dos mais recentes para os mais antigos
    listar: async () => {
        const result = await pool.query(
            `SELECT 'membro' AS tipo, id_membro AS id, nome_completo AS nome, email, telefone,
                    data_entrada_igreja AS data, ativo, NULL AS observacoes
             FROM membros
             UNION ALL
             SELECT 'visitante', id_visitante, nome, NULL, telefone,
                    data_visita, TRUE, observacoes
             FROM visitantes
             ORDER BY data DESC NULLS LAST, nome ASC`
        );
        return result.rows;
    },

    // Cadastra o membro e, se veio uma função, já o registra como voluntário
    criarMembro: async (m) => {
        const cliente = await pool.connect();
        try {
            await cliente.query('BEGIN');

            const membro = (await cliente.query(
                `INSERT INTO membros (nome_completo, data_nascimento, telefone, email, endereco, estado_civil,
                                      data_entrada_igreja, informacoes_batismo, participa_celula, observacoes,
                                      apto_voluntario, ativo)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE)
                 RETURNING *`,
                [m.nome_completo, m.data_nascimento, m.telefone, m.email, m.endereco, m.estado_civil,
                 m.data_entrada_igreja, m.informacoes_batismo, m.participa_celula, m.observacoes, Boolean(m.id_funcao)]
            )).rows[0];

            if (m.id_funcao) {
                const voluntario = (await cliente.query(
                    `INSERT INTO voluntarios (id_membro, data_batismo, numero_mes_batizado, data_inicio_voluntariado, ativo)
                     VALUES ($1, $2, $3, CURRENT_DATE, TRUE)
                     RETURNING id_voluntario`,
                    [membro.id_membro, m.data_batismo, m.data_batismo ? Number(m.data_batismo.slice(5, 7)) : 0]
                )).rows[0];
                await cliente.query(
                    'INSERT INTO voluntario_funcoes (id_voluntario, id_funcao) VALUES ($1, $2)',
                    [voluntario.id_voluntario, m.id_funcao]
                );
            }

            await cliente.query('COMMIT');
            return membro;
        } catch (error) {
            await cliente.query('ROLLBACK');
            throw error;
        } finally {
            cliente.release();
        }
    },

    criarVisitante: async ({ nome, telefone, data_visita, observacoes }) => {
        const result = await pool.query(
            `INSERT INTO visitantes (nome, telefone, data_visita, observacoes)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [nome, telefone, data_visita, observacoes]
        );
        return result.rows[0];
    }
};

module.exports = participantesModel;
