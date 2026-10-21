// =========================================================
// Base universal de pessoas (tabela "membros").
// Toda pessoa do sistema tem um registro aqui; os setores só filtram:
//   Participantes = todas
//   Crianças      = menos de 18 anos (pela data de nascimento, calculada hoje)
//   Voluntários   = ativas e aptas ao voluntariado
//   Usuários      = com login de gestão (tabela usuarios, ligada pela pessoa)
// =========================================================

const pool = require('../config/db');

// Critérios de cada setor (SQL), para todas as consultas usarem os mesmos.
// "m" é o apelido da tabela membros na consulta.
const CRITERIOS = {
    // Idade < 18: nasceu depois da data de hoje menos 18 anos (sem data, não entra)
    menor: "(m.data_nascimento IS NOT NULL AND m.data_nascimento > CURRENT_DATE - INTERVAL '18 years')",
    voluntarioElegivel: '(m.ativo AND m.apto_voluntario)',
    idade: "date_part('year', age(m.data_nascimento))::int"
};

const pessoasModel = {

    CRITERIOS,

    // Cria uma pessoa na base universal. Todo cadastro novo entra como VISITANTE,
    // ativo, sem aptidão ao voluntariado e sem login (classificar é do administrador).
    // "executor" pode ser o pool ou um cliente dentro de uma transação.
    criar: async (dados, executor = pool) => {
        const result = await executor.query(
            `INSERT INTO membros (nome_completo, data_nascimento, telefone, email, endereco, estado_civil, observacoes,
                                  data_primeira_visita, classificacao, ativo, apto_voluntario, voluntario)
             VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, CURRENT_DATE), 'visitante', TRUE, FALSE, FALSE)
             RETURNING id_membro, nome_completo AS nome, data_nascimento, telefone, email, endereco, estado_civil,
                       observacoes, data_primeira_visita, classificacao, ativo`,
            [dados.nome, dados.data_nascimento || null, dados.telefone || null, dados.email || null, dados.endereco || null,
             dados.estado_civil || null, dados.observacoes || null, dados.data_primeira_visita || null]
        );
        return result.rows[0];
    },

    // Dados resumidos de uma pessoa (com idade e se tem login/ficha infantil)
    buscar: async (idMembro, executor = pool) => {
        const result = await executor.query(
            `SELECT m.id_membro, m.nome_completo AS nome, m.data_nascimento, m.telefone, m.email, m.classificacao,
                    m.ativo, m.apto_voluntario,
                    ${CRITERIOS.idade} AS idade, ${CRITERIOS.menor} AS menor,
                    EXISTS (SELECT 1 FROM usuarios u WHERE u.id_membro = m.id_membro) AS tem_login,
                    EXISTS (SELECT 1 FROM criancas c WHERE c.id_membro = m.id_membro) AS tem_ficha_infantil
             FROM membros m WHERE m.id_membro = $1`,
            [idMembro]
        );
        return result.rows[0] || null;
    },

    // Pessoas sem login (para escolher a quem um novo login de gestão pertence)
    semLogin: async () => {
        const result = await pool.query(
            `SELECT m.id_membro, m.nome_completo AS nome, m.email, m.telefone, m.classificacao
             FROM membros m
             WHERE NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.id_membro = m.id_membro)
             ORDER BY m.nome_completo`
        );
        return result.rows;
    }
};

module.exports = pessoasModel;
