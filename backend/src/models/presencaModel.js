const pool = require('../config/db');

const presencaModel = {

    // Busca os membros ativos cadastrados no banco.
    selecionaMembros: async () => {
        const result = await pool.query(
            `SELECT id_membro, nome_completo, data_nascimento
             FROM membros
             WHERE ativo = TRUE
             ORDER BY nome_completo ASC`
        );
        return result.rows;
    },

    // Busca as turmas ativas, ordenadas pela faixa etária.
    selecionaTurmas: async () => {
        const result = await pool.query(
            // A turma NEXT vai sempre por último; as demais seguem a faixa etária
            `SELECT id_turma, nome FROM cadastroturmas
             WHERE ativo
             ORDER BY (LOWER(TRIM(nome)) ~ '^next\\M') ASC, idade_minima NULLS LAST, id_turma ASC`
        );

        return result.rows;
    },

    // Cadastra uma nova turma usando o nome recebido como parâmetro.
    criarTurma: async (nome) => {
        const result = await pool.query(
            `INSERT INTO cadastroturmas (nome)
             VALUES ($1)
             RETURNING id_turma, nome`,
            [nome] // Passa o nome como parâmetro da consulta.
        );

        // Retorna os dados da turma cadastrada.
        return result.rows[0];
    },

    // Busca os registros de presença de uma data específica.
    selecionaPresencas: async (data) => {
        const result = await pool.query(
            `SELECT t.id_registro, t.id_turma, c.nome AS nome_turma,
                    t.id_membro, m.nome_completo AS nome_membro, t.data,
                    t.hora_entrada, t.hora_saida
             FROM turmas t
             INNER JOIN cadastroturmas c ON c.id_turma = t.id_turma
             INNER JOIN membros m ON m.id_membro = t.id_membro
             WHERE t.data = $1
             ORDER BY c.nome ASC, t.hora_entrada ASC, m.nome_completo ASC`,
            [data] // Informa a data utilizada para filtrar os registros.
        );

        return result.rows;
    },

    // Registra a presença de um membro em uma turma.
    criarPresenca: async (id_turma, id_membro, data) => {
        const result = await pool.query(
            `INSERT INTO turmas (id_turma, nome, id_membro, data, hora_entrada)
             SELECT $1, m.nome_completo, m.id_membro, $3, CURRENT_TIME
             FROM membros m
             WHERE m.id_membro = $2
             RETURNING *`,
            [id_turma, id_membro, data]
            // $1 = ID da turma.
            // $2 = ID do membro.
            // $3 = Data da presença.
            // CURRENT_TIME registra a hora atual do banco.
        );

        // Retorna undefined se o membro não existir.
        return result.rows[0];
    },

    // Registra a hora de saída de um registro de presença.
    registrarSaida: async (id_registro) => {
        const result = await pool.query(
            `UPDATE turmas
             SET hora_saida = CURRENT_TIME
             WHERE id_registro = $1 AND hora_saida IS NULL
             RETURNING *`,
            [id_registro] // Identifica o registro que será atualizado.
        );

        return result.rows[0];
    }
};

module.exports = presencaModel;
