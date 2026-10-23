const pool = require('../config/db');
const Pessoas = require('./pessoasModel');

const { CRITERIOS } = Pessoas;

// Crianças = pessoas da base universal com MENOS DE 18 ANOS, calculado hoje pela
// data de nascimento (quem faz 18 sai da lista sozinho; sem data, não entra).
// A ficha infantil (turma, alergias, autorizações, responsáveis) complementa a pessoa.
const criancasModel = {

    resumo: async () => {
        const result = await pool.query(
            `SELECT (SELECT COUNT(*)::int FROM membros m WHERE ${CRITERIOS.menor} AND m.ativo) AS criancas,
                    (SELECT COUNT(DISTINCT m.id_membro)::int
                     FROM membros m JOIN turmas p ON p.id_membro = m.id_membro
                     WHERE ${CRITERIOS.menor} AND p.data = CURRENT_DATE) AS presentes_hoje,
                    (SELECT COUNT(*)::int FROM cadastroturmas WHERE ativo) AS turmas,
                    (SELECT COUNT(*)::int FROM responsaveis WHERE ativo) AS responsaveis,
                    (SELECT COUNT(*)::int FROM membros m
                     WHERE ${CRITERIOS.menor} AND NOT EXISTS (SELECT 1 FROM criancas c WHERE c.id_membro = m.id_membro)) AS sem_ficha`
        );
        return result.rows[0];
    },

    listar: async () => {
        const result = await pool.query(
            `SELECT m.id_membro, c.id_crianca, m.nome_completo AS nome, m.data_nascimento, m.classificacao,
                    ${CRITERIOS.idade} AS idade,
                    c.data_cadastro, (m.ativo AND COALESCE(c.ativo, TRUE)) AS ativo, c.alergias, c.sexo,
                    (c.id_crianca IS NOT NULL) AS tem_ficha,
                    t.id_turma, t.nome AS turma,
                    r.nome_completo AS responsavel, r.parentesco, r.telefone,
                    EXISTS (SELECT 1 FROM turmas p WHERE p.id_membro = m.id_membro AND p.data = CURRENT_DATE) AS presente_hoje
             FROM membros m
             LEFT JOIN criancas c ON c.id_membro = m.id_membro
             LEFT JOIN cadastroturmas t ON t.id_turma = c.id_turma
             LEFT JOIN LATERAL (
                 SELECT rs.nome_completo, rs.parentesco, rs.telefone
                 FROM crianca_responsavel cr
                 JOIN responsaveis rs ON rs.id_responsavel = cr.id_responsavel
                 WHERE cr.id_crianca = c.id_crianca
                 ORDER BY cr.responsavel_principal DESC
                 LIMIT 1
             ) r ON TRUE
             WHERE ${CRITERIOS.menor}
             ORDER BY (m.ativo AND COALESCE(c.ativo, TRUE)) DESC, m.nome_completo ASC`
        );
        return result.rows;
    },

    // Ficha infantil: para uma pessoa já cadastrada (id_membro) ou, sem ela, cria a
    // pessoa na base universal (como todo cadastro, visitante) + a ficha + o responsável.
    // Devolve { erro, status } quando a pessoa não pode receber ficha.
    criar: async (c) => {
        const cliente = await pool.connect();
        try {
            await cliente.query('BEGIN');

            let idMembro = c.id_membro;
            if (idMembro) {
                const pessoa = await Pessoas.buscar(idMembro, cliente);
                if (!pessoa) {
                    await cliente.query('ROLLBACK');
                    return { status: 404, erro: 'Pessoa não encontrada.' };
                }
                if (!pessoa.menor) {
                    await cliente.query('ROLLBACK');
                    return { status: 400, erro: 'A ficha infantil é só para quem tem menos de 18 anos (confira a data de nascimento no cadastro).' };
                }
                if (pessoa.tem_ficha_infantil) {
                    await cliente.query('ROLLBACK');
                    return { status: 409, erro: 'Esta pessoa já tem ficha infantil.' };
                }
            } else {
                idMembro = (await Pessoas.criar({
                    nome: c.nome, data_nascimento: c.data_nascimento,
                    data_primeira_visita: c.data_cadastro, observacoes: c.observacoes
                }, cliente)).id_membro;
            }

            // Nome e nascimento oficiais ficam na pessoa; a ficha guarda o específico da área
            const crianca = (await cliente.query(
                `INSERT INTO criancas (observacoes, ativo, id_membro, id_turma, sexo,
                                       alergias, data_cadastro, autorizacao_responsavel, autorizacao_imagem)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 RETURNING *`,
                [c.observacoes, c.ativo, idMembro, c.id_turma, c.sexo,
                 c.alergias, c.data_cadastro, c.autorizacao_responsavel, c.autorizacao_imagem]
            )).rows[0];

            const idResponsavel = (await cliente.query(
                `INSERT INTO responsaveis (nome_completo, telefone, email, parentesco, ativo)
                 VALUES ($1, $2, $3, $4, TRUE) RETURNING id_responsavel`,
                [c.responsavel.nome, c.responsavel.telefone, c.responsavel.email, c.responsavel.parentesco]
            )).rows[0].id_responsavel;

            await cliente.query(
                `INSERT INTO crianca_responsavel (id_crianca, id_responsavel, responsavel_principal,
                                                  autorizado_retirada, autorizacao_atualizada_em, autorizacao_atualizada_por)
                 VALUES ($1, $2, TRUE, $3, CASE WHEN $3 THEN now() END, CASE WHEN $3 THEN $4::int END)`,
                [crianca.id_crianca, idResponsavel, c.responsavel.autorizado_retirada === true, c.id_usuario || null]
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
,

    // Responsáveis vinculados e quem pode buscar a criança (null = criança não existe)
    responsaveis: async (idCrianca) => {
        const crianca = (await pool.query(
            `SELECT c.id_crianca, m.nome_completo AS nome FROM criancas c JOIN membros m ON m.id_membro = c.id_membro WHERE c.id_crianca = $1`,
            [idCrianca]
        )).rows[0];
        if (!crianca) return null;
        crianca.responsaveis = (await pool.query(
            `SELECT r.id_responsavel, r.nome_completo AS nome, r.parentesco, r.telefone, r.email,
                    cr.responsavel_principal AS principal, cr.autorizado_retirada,
                    cr.autorizacao_atualizada_em, u.nome AS autorizacao_atualizada_por
             FROM crianca_responsavel cr JOIN responsaveis r ON r.id_responsavel = cr.id_responsavel
             LEFT JOIN usuarios u ON u.id_usuario = cr.autorizacao_atualizada_por
             WHERE cr.id_crianca = $1 AND r.ativo IS NOT FALSE
             ORDER BY cr.responsavel_principal DESC, r.nome_completo`,
            [idCrianca]
        )).rows;
        return crianca;
    },

    adicionarResponsavel: async (idCrianca, r, idUsuario) => {
        const cliente = await pool.connect();
        try {
            await cliente.query('BEGIN');
            const existe = await cliente.query('SELECT 1 FROM criancas WHERE id_crianca = $1', [idCrianca]);
            if (!existe.rowCount) { await cliente.query('ROLLBACK'); return null; }
            const id = (await cliente.query(
                `INSERT INTO responsaveis (nome_completo, telefone, email, parentesco, ativo)
                 VALUES ($1, $2, $3, $4, TRUE) RETURNING id_responsavel`,
                [r.nome, r.telefone, r.email, r.parentesco]
            )).rows[0].id_responsavel;
            await cliente.query(
                `INSERT INTO crianca_responsavel (id_crianca, id_responsavel, responsavel_principal,
                                                  autorizado_retirada, autorizacao_atualizada_em, autorizacao_atualizada_por)
                 VALUES ($1, $2, FALSE, $3, now(), $4)`,
                [idCrianca, id, r.autorizado_retirada, idUsuario]
            );
            await cliente.query('COMMIT');
            return { id_responsavel: id };
        } catch (error) {
            await cliente.query('ROLLBACK');
            throw error;
        } finally {
            cliente.release();
        }
    },

    definirAutorizacao: async (idCrianca, idResponsavel, autorizado, idUsuario) => {
        const result = await pool.query(
            `UPDATE crianca_responsavel SET autorizado_retirada = $3, autorizacao_atualizada_em = now(), autorizacao_atualizada_por = $4
             WHERE id_crianca = $1 AND id_responsavel = $2`,
            [idCrianca, idResponsavel, autorizado, idUsuario]
        );
        return result.rowCount > 0;
    }
};

module.exports = criancasModel;
