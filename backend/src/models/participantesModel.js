const pool = require('../config/db');
const Pessoas = require('./pessoasModel');

const { CRITERIOS } = Pessoas;

// Participantes = TODAS as pessoas da base universal (tabela membros),
// sejam visitantes, membros, crianças, voluntários ou quem tem login.
const participantesModel = {

    resumo: async () => {
        const result = await pool.query(
            `SELECT COUNT(*) FILTER (WHERE classificacao = 'visitante')::int AS total_visitantes,
                    COUNT(*) FILTER (WHERE classificacao = 'membro')::int AS total_membros,
                    COUNT(*)::int AS total_pessoas,
                    COUNT(*) FILTER (WHERE classificacao = 'visitante'
                                       AND date_trunc('month', data_primeira_visita) = date_trunc('month', CURRENT_DATE))::int AS novos_visitantes_mes
             FROM membros`
        );
        return result.rows[0];
    },

    // Uma linha por pessoa, das mais recentes para as mais antigas.
    // tipo = classificação (visitante/membro); data = entrada na igreja (membro)
    // ou primeira visita (visitante); "apto" = elegível ao voluntariado;
    // "voluntario" = serve hoje; "menor" = menos de 18 anos; "perfil" = login, se houver.
    listar: async () => {
        const result = await pool.query(
            `SELECT m.classificacao AS tipo, m.id_membro AS id, m.nome_completo AS nome, m.email, m.telefone,
                    CASE WHEN m.classificacao = 'membro' THEN m.data_entrada_igreja ELSE m.data_primeira_visita END AS data,
                    m.ativo, m.observacoes, m.apto_voluntario AS apto,
                    EXISTS (SELECT 1 FROM voluntarios v WHERE v.id_membro = m.id_membro AND v.ativo) AS voluntario,
                    ${CRITERIOS.menor} AS menor, ${CRITERIOS.idade} AS idade,
                    u.perfil, u.id_usuario
             FROM membros m
             LEFT JOIN usuarios u ON u.id_membro = m.id_membro
             ORDER BY data DESC NULLS LAST, m.nome_completo ASC`
        );
        return result.rows;
    },

    // Cadastro: sempre na base universal, como visitante
    criarPessoa: (dados) => Pessoas.criar(dados),

    // Promove um visitante a membro: a pessoa é a mesma, muda a classificação.
    // Devolve null se a pessoa não existe; { jaMembro } se já é membro.
    promoverAMembro: async (idPessoa, m) => {
        const cliente = await pool.connect();
        try {
            await cliente.query('BEGIN');
            const pessoa = (await cliente.query(
                'SELECT id_membro, classificacao FROM membros WHERE id_membro = $1 FOR UPDATE',
                [idPessoa]
            )).rows[0];
            if (!pessoa) {
                await cliente.query('ROLLBACK');
                return null;
            }
            if (pessoa.classificacao === 'membro') {
                await cliente.query('ROLLBACK');
                return { jaMembro: true };
            }

            // Virar membro não torna apto ao voluntariado: isso é outra decisão
            const membro = (await cliente.query(
                `UPDATE membros
                 SET classificacao = 'membro', data_entrada_igreja = $2, informacoes_batismo = COALESCE($3, informacoes_batismo),
                     participa_celula = COALESCE($4, participa_celula), apto_voluntario = FALSE
                 WHERE id_membro = $1
                 RETURNING *`,
                [idPessoa, m.data_entrada_igreja, m.informacoes_batismo, m.participa_celula]
            )).rows[0];

            // Histórico da visita (quando existe) registra a promoção
            await cliente.query(
                'UPDATE visitantes SET promovido_em = CURRENT_TIMESTAMP WHERE id_membro = $1 AND promovido_em IS NULL',
                [idPessoa]
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
            `SELECT m.id_membro, m.nome_completo, m.classificacao, m.ativo, m.apto_voluntario,
                    EXISTS (SELECT 1 FROM voluntarios v WHERE v.id_membro = m.id_membro AND v.ativo) AS voluntario_ativo
             FROM membros m WHERE m.id_membro = $1`,
            [idMembro]
        );
        return result.rows[0];
    },

    // Altera status (ativo) e/ou elegibilidade ao voluntariado (apto) de uma pessoa
    atualizarClassificacao: async (idMembro, { ativo, apto_voluntario }) => {
        const result = await pool.query(
            `UPDATE membros
             SET ativo = COALESCE($2, ativo),
                 apto_voluntario = COALESCE($3, apto_voluntario)
             WHERE id_membro = $1
             RETURNING id_membro, nome_completo, classificacao, ativo, apto_voluntario`,
            [idMembro, ativo, apto_voluntario]
        );
        return result.rows[0];
    }
};

module.exports = participantesModel;
