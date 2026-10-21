const pool = require('../config/db');

// Turmas do ministério infantil (tabela cadastroturmas, a mesma da lista de presença)
const turmasModel = {

    listar: async () => {
        const result = await pool.query(
            `SELECT t.id_turma, t.nome, t.idade_minima, t.idade_maxima, t.dia_semana, t.horario,
                    t.ativo, t.observacoes, t.id_membro_responsavel, m.nome_completo AS responsavel,
                    (SELECT COUNT(*)::int FROM criancas c WHERE c.id_turma = t.id_turma AND c.ativo) AS criancas
             FROM cadastroturmas t
             LEFT JOIN membros m ON m.id_membro = t.id_membro_responsavel
             ORDER BY t.ativo DESC, t.idade_minima NULLS LAST, t.nome`
        );
        return result.rows;
    },

    // Quem pode ser responsável por uma turma: voluntários ativos
    possiveisResponsaveis: async () => {
        const result = await pool.query(
            `SELECT DISTINCT m.id_membro, m.nome_completo, (d.nome = 'Kids') AS kids
             FROM voluntarios v
             JOIN membros m ON m.id_membro = v.id_membro
             LEFT JOIN departamentos d ON d.id_departamento = v.id_departamento
             WHERE v.ativo
             ORDER BY kids DESC, m.nome_completo`
        );
        return result.rows;
    },

    criar: async (t) => {
        const result = await pool.query(
            `INSERT INTO cadastroturmas (nome, idade_minima, idade_maxima, id_membro_responsavel, dia_semana, horario, ativo, observacoes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [t.nome, t.idade_minima, t.idade_maxima, t.id_membro_responsavel, t.dia_semana, t.horario, t.ativo, t.observacoes]
        );
        return result.rows[0];
    },

    atualizar: async (id, t) => {
        const result = await pool.query(
            `UPDATE cadastroturmas
             SET nome = $2, idade_minima = $3, idade_maxima = $4, id_membro_responsavel = $5,
                 dia_semana = $6, horario = $7, ativo = $8, observacoes = $9
             WHERE id_turma = $1
             RETURNING *`,
            [id, t.nome, t.idade_minima, t.idade_maxima, t.id_membro_responsavel, t.dia_semana, t.horario, t.ativo, t.observacoes]
        );
        return result.rows[0];
    },

    // Só exclui turma sem crianças nem presenças registradas
    excluir: async (id) => {
        const uso = (await pool.query(
            `SELECT (SELECT COUNT(*) FROM criancas WHERE id_turma = $1)::int AS criancas,
                    (SELECT COUNT(*) FROM turmas WHERE id_turma = $1)::int AS presencas`,
            [id]
        )).rows[0];
        if (uso.criancas || uso.presencas) return { emUso: uso };

        const result = await pool.query('DELETE FROM cadastroturmas WHERE id_turma = $1 RETURNING id_turma', [id]);
        return { excluida: result.rowCount > 0 };
    }
};

module.exports = turmasModel;
