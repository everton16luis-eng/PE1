const pool = require('../config/db');

const CAMPOS_PUBLICOS = `id_usuario, nome, email, telefone, perfil, ativo, permissoes,
                         observacoes, criado_em, ultimo_acesso, id_membro`;

const usuariosModel = {

    // Busca para login por e-mail ou telefone (só dígitos)
    buscarParaLogin: async (login) => {
        const result = await pool.query(
            `SELECT * FROM usuarios
             WHERE LOWER(email) = LOWER($1)
                OR (regexp_replace(COALESCE(telefone, ''), '\\D', '', 'g') = regexp_replace($1, '\\D', '', 'g')
                    AND regexp_replace($1, '\\D', '', 'g') <> '')
             LIMIT 1`,
            [login]
        );
        return result.rows[0];
    },

    registrarAcesso: async (id) => {
        await pool.query('UPDATE usuarios SET ultimo_acesso = CURRENT_TIMESTAMP WHERE id_usuario = $1', [id]);
    },

    buscarPorId: async (id) => {
        const result = await pool.query(`SELECT ${CAMPOS_PUBLICOS} FROM usuarios WHERE id_usuario = $1`, [id]);
        return result.rows[0];
    },

    contarAdministradoresAtivos: async () => {
        const result = await pool.query("SELECT COUNT(*)::int AS total FROM usuarios WHERE perfil = 'ADMINISTRADOR' AND ativo");
        return result.rows[0].total;
    },

    // Página Usuários: só contas de gestão. Logins do portal do voluntário
    // (perfil VOLUNTARIO) são administrados pela ficha do voluntário.
    listar: async () => {
        const result = await pool.query(
            `SELECT ${CAMPOS_PUBLICOS} FROM usuarios
             WHERE perfil <> 'VOLUNTARIO'
             ORDER BY ativo DESC, nome ASC`
        );
        return result.rows;
    },

    resumo: async () => {
        const result = await pool.query(
            `SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE ativo)::int AS ativos,
                    COUNT(*) FILTER (WHERE perfil = 'ADMINISTRADOR')::int AS administradores,
                    COUNT(*) FILTER (WHERE NOT ativo AND ultimo_acesso IS NULL)::int AS pendentes
             FROM usuarios
             WHERE perfil <> 'VOLUNTARIO'`
        );
        return result.rows[0];
    },

    criar: async ({ nome, email, telefone, senha_hash, perfil, ativo, permissoes, observacoes, id_membro = null }) => {
        const result = await pool.query(
            `INSERT INTO usuarios (nome, email, telefone, senha_hash, perfil, ativo, permissoes, observacoes, id_membro)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING ${CAMPOS_PUBLICOS}`,
            [nome, email, telefone, senha_hash, perfil, ativo, permissoes, observacoes, id_membro]
        );
        return result.rows[0];
    },

    // Atualiza os dados; a senha só muda quando senha_hash vem preenchido
    atualizar: async (id, { nome, email, telefone, senha_hash, perfil, ativo, permissoes, observacoes }) => {
        const result = await pool.query(
            `UPDATE usuarios
             SET nome = $2, email = $3, telefone = $4,
                 senha_hash = COALESCE($5, senha_hash),
                 perfil = $6, ativo = $7, permissoes = $8, observacoes = $9
             WHERE id_usuario = $1
             RETURNING ${CAMPOS_PUBLICOS}`,
            [id, nome, email, telefone, senha_hash, perfil, ativo, permissoes, observacoes]
        );
        return result.rows[0];
    },

    // Ativa/bloqueia o acesso de um usuário ligado a um membro (portal do voluntário)
    alterarAcessoDoMembro: async (idMembro, ativo) => {
        const result = await pool.query(
            `UPDATE usuarios SET ativo = $2 WHERE id_membro = $1 RETURNING ${CAMPOS_PUBLICOS}`,
            [idMembro, ativo]
        );
        return result.rows[0];
    },

    buscarHash: async (id) => {
        const result = await pool.query('SELECT senha_hash FROM usuarios WHERE id_usuario = $1', [id]);
        return result.rows[0]?.senha_hash;
    },

    trocarSenha: async (id, senhaHash) => {
        await pool.query('UPDATE usuarios SET senha_hash = $2 WHERE id_usuario = $1', [id, senhaHash]);
    }
};

module.exports = usuariosModel;
