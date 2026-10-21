const pool = require('../config/db');

const CONSULTA_FUNCOES = `
    SELECT f.id_funcao, f.nome, f.descricao, f.ativo, f.qtd_voluntarios, f.vagas,
           f.dias_disponiveis, f.observacoes,
           COUNT(v.id_voluntario) FILTER (WHERE v.ativo)::int AS voluntarios,
           GREATEST(COALESCE(f.vagas, 0) - COUNT(v.id_voluntario) FILTER (WHERE v.ativo), 0)::int AS vagas_abertas
    FROM funcoes f
    LEFT JOIN voluntario_funcoes vf ON vf.id_funcao = f.id_funcao
    LEFT JOIN voluntarios v ON v.id_voluntario = vf.id_voluntario
`;

const funcoesModel = {

    listar: async () => {
        const result = await pool.query(`${CONSULTA_FUNCOES} GROUP BY f.id_funcao ORDER BY f.ativo DESC, f.nome ASC`);
        return result.rows;
    },

    buscar: async (id) => {
        const result = await pool.query(`${CONSULTA_FUNCOES} WHERE f.id_funcao = $1 GROUP BY f.id_funcao`, [id]);
        return result.rows[0];
    },

    criar: async ({ nome, descricao, ativo, qtd_voluntarios, vagas, dias_disponiveis, observacoes }) => {
        const result = await pool.query(
            `INSERT INTO funcoes (nome, descricao, ativo, qtd_voluntarios, vagas, dias_disponiveis, observacoes)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id_funcao`,
            [nome, descricao, ativo, qtd_voluntarios, vagas, dias_disponiveis, observacoes]
        );
        return funcoesModel.buscar(result.rows[0].id_funcao);
    },

    atualizar: async (id, { nome, descricao, ativo, qtd_voluntarios, vagas, dias_disponiveis, observacoes }) => {
        const result = await pool.query(
            `UPDATE funcoes
             SET nome = $2, descricao = $3, ativo = $4, qtd_voluntarios = $5, vagas = $6,
                 dias_disponiveis = $7, observacoes = $8
             WHERE id_funcao = $1
             RETURNING id_funcao`,
            [id, nome, descricao, ativo, qtd_voluntarios, vagas, dias_disponiveis, observacoes]
        );
        return result.rows[0] ? funcoesModel.buscar(id) : null;
    }
};

module.exports = funcoesModel;
