const pool = require('../config/db');

const criancasModel = {

    resumo: async () => {
        const result = await pool.query(
            `SELECT (SELECT COUNT(*)::int FROM criancas WHERE ativo) AS criancas,
                    (SELECT COUNT(DISTINCT c.id_crianca)::int
                     FROM criancas c JOIN turmas p ON p.id_membro = c.id_membro
                     WHERE p.data = CURRENT_DATE) AS presentes_hoje,
                    (SELECT COUNT(*)::int FROM cadastroturmas WHERE ativo) AS turmas,
                    (SELECT COUNT(*)::int FROM responsaveis WHERE ativo) AS responsaveis`
        );
        return result.rows[0];
    },

    listar: async () => {
        const result = await pool.query(
            `SELECT c.id_crianca, c.nome_completo AS nome, c.data_nascimento,
                    date_part('year', age(c.data_nascimento))::int AS idade,
                    c.data_cadastro, c.ativo, c.alergias, c.sexo,
                    t.id_turma, t.nome AS turma,
                    r.nome_completo AS responsavel, r.parentesco, r.telefone,
                    EXISTS (SELECT 1 FROM turmas p WHERE p.id_membro = c.id_membro AND p.data = CURRENT_DATE) AS presente_hoje
             FROM criancas c
             LEFT JOIN cadastroturmas t ON t.id_turma = c.id_turma
             LEFT JOIN LATERAL (
                 SELECT rs.nome_completo, rs.parentesco, rs.telefone
                 FROM crianca_responsavel cr
                 JOIN responsaveis rs ON rs.id_responsavel = cr.id_responsavel
                 WHERE cr.id_crianca = c.id_crianca
                 ORDER BY cr.responsavel_principal DESC
                 LIMIT 1
             ) r ON TRUE
             ORDER BY c.ativo DESC, c.nome_completo ASC`
        );
        return result.rows;
    },

    // Cria o membro (para a lista de presença), a criança e o responsável principal
    criar: async (c) => {
        const cliente = await pool.connect();
        try {
            await cliente.query('BEGIN');

            const idMembro = (await cliente.query(
                `INSERT INTO membros (nome_completo, data_nascimento, data_entrada_igreja, ativo)
                 VALUES ($1, $2, $3, $4) RETURNING id_membro`,
                [c.nome, c.data_nascimento, c.data_cadastro, c.ativo]
            )).rows[0].id_membro;

            const crianca = (await cliente.query(
                `INSERT INTO criancas (nome_completo, data_nascimento, observacoes, ativo, id_membro, id_turma, sexo,
                                       alergias, data_cadastro, autorizacao_responsavel, autorizacao_imagem)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                 RETURNING *`,
                [c.nome, c.data_nascimento, c.observacoes, c.ativo, idMembro, c.id_turma, c.sexo,
                 c.alergias, c.data_cadastro, c.autorizacao_responsavel, c.autorizacao_imagem]
            )).rows[0];

            const idResponsavel = (await cliente.query(
                `INSERT INTO responsaveis (nome_completo, telefone, email, parentesco, ativo)
                 VALUES ($1, $2, $3, $4, TRUE) RETURNING id_responsavel`,
                [c.responsavel.nome, c.responsavel.telefone, c.responsavel.email, c.responsavel.parentesco]
            )).rows[0].id_responsavel;

            await cliente.query(
                'INSERT INTO crianca_responsavel (id_crianca, id_responsavel, responsavel_principal) VALUES ($1, $2, TRUE)',
                [crianca.id_crianca, idResponsavel]
            );

            await cliente.query('COMMIT');
            return crianca;
        } catch (error) {
            await cliente.query('ROLLBACK');
            throw error;
        } finally {
            cliente.release();
        }
    }
};

module.exports = criancasModel;
