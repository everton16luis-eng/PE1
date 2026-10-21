const { lerToken } = require('../config/seguranca');
const pool = require('../config/db');

// Exige um token válido (Authorization: Bearer <token>) e carrega o usuário
exports.exigirLogin = async (req, res, next) => {
    try {
        const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        const dados = lerToken(token);
        if (!dados) return res.status(401).json({ erro: 'Faça login para continuar.' });

        const result = await pool.query(
            'SELECT id_usuario, nome, email, perfil, permissoes, ativo, id_membro FROM usuarios WHERE id_usuario = $1',
            [dados.id]
        );
        const usuario = result.rows[0];
        if (!usuario || !usuario.ativo) return res.status(401).json({ erro: 'Usuário inativo ou removido.' });

        req.usuario = usuario;
        next();
    } catch (error) {
        next(error);
    }
};

// Perfil Voluntário só acessa o portal (e os próprios dados de login)
exports.restringirVoluntario = (req, res, next) => {
    const liberado = req.path === '/auth/me' || req.path === '/portal' || req.path.startsWith('/portal/');
    if (req.usuario?.perfil === 'VOLUNTARIO' && !liberado) {
        return res.status(403).json({ erro: 'Esta área é exclusiva da equipe de gestão.' });
    }
    next();
};

// Libera a rota só para os perfis informados
exports.exigirPerfil = (...perfis) => (req, res, next) => {
    if (!perfis.includes(req.usuario?.perfil)) {
        return res.status(403).json({ erro: 'Você não tem permissão para esta ação.' });
    }
    next();
};

// Libera a rota para quem tem a permissão marcada (administrador sempre pode)
exports.exigirPermissao = (area) => (req, res, next) => {
    const usuario = req.usuario;
    if (usuario?.perfil === 'ADMINISTRADOR' || usuario?.permissoes?.[area]) return next();
    return res.status(403).json({ erro: 'Você não tem permissão para acessar esta área.' });
};
