const pool = require('../config/db');
const Usuarios = require('../models/usuariosModel');
const Pessoas = require('../models/pessoasModel');
const { responderErro } = require('../config/erros');
const { gerarHashSenha, conferirSenha, gerarToken } = require('../config/seguranca');
const Limite = require('../config/limiteLogin');

const PERMISSOES_ADMIN = { participantes: true, voluntarios: true, escalas: true, criancas: true, relatorios: true, usuarios: true };
const PERMISSOES_VISUALIZACAO = { participantes: false, voluntarios: false, escalas: true, criancas: false, relatorios: false, usuarios: false };

exports.login = async (req, res) => {
    try {
        // Só aceita texto (evita objetos/arrays no lugar do login)
        const login = typeof req.body.login === 'string' ? req.body.login.trim().slice(0, 150) : '';
        const senha = typeof req.body.senha === 'string' ? req.body.senha.slice(0, 200) : '';

        if (!login || !senha) {
            return res.status(400).json({ erro: 'Informe e-mail (ou telefone) e senha.' });
        }

        const espera = Limite.bloqueadoPor(req.ip, login);
        if (espera) {
            res.set('Retry-After', String(espera));
            return res.status(429).json({ erro: `Muitas tentativas. Tente novamente em ${Math.ceil(espera / 60)} minuto(s).` });
        }

        const usuario = await Usuarios.buscarParaLogin(login);
        if (!usuario || !conferirSenha(senha, usuario.senha_hash)) {
            Limite.registrarFalha(req.ip, login);
            return res.status(401).json({ erro: 'Login ou senha incorretos.' });
        }
        Limite.registrarSucesso(req.ip, login);
        if (!usuario.ativo) {
            return res.status(403).json({ erro: 'Seu acesso ainda não foi liberado por um administrador.' });
        }

        await Usuarios.registrarAcesso(usuario.id_usuario);
        res.json({ token: gerarToken(usuario), usuario: await Usuarios.buscarPorId(usuario.id_usuario) });
    } catch (error) {
        console.error('Erro ao fazer login', error);
        responderErro(res, error);
    }
}

// Cadastro pela tela de login: fica pendente até um administrador liberar.
// Se ainda não existe nenhum administrador ativo, o primeiro cadastro vira administrador.
exports.registro = async (req, res) => {
    try {
        const nome = String(req.body.nome || '').trim();
        const email = String(req.body.email || '').trim().toLowerCase();
        const telefone = String(req.body.telefone || '').trim() || null;
        const senha = String(req.body.senha || '');

        if (!nome || !email || senha.length < 6) {
            return res.status(400).json({ erro: 'Informe nome, e-mail e uma senha com pelo menos 6 caracteres.' });
        }

        const primeiroAcesso = (await Usuarios.contarAdministradoresAtivos()) === 0;

        // Quem pede acesso entra no cadastro universal (como visitante) e o
        // login fica ligado a essa pessoa — tudo ou nada, numa transação
        const cliente = await pool.connect();
        try {
            await cliente.query('BEGIN');
            const pessoa = await Pessoas.criar({ nome, email, telefone, observacoes: 'Cadastro feito pela tela de login' }, cliente);
            await Usuarios.criar({
                nome,
                email,
                telefone,
                senha_hash: gerarHashSenha(senha),
                perfil: primeiroAcesso ? 'ADMINISTRADOR' : 'VISUALIZACAO',
                ativo: primeiroAcesso,
                permissoes: primeiroAcesso ? PERMISSOES_ADMIN : PERMISSOES_VISUALIZACAO,
                observacoes: primeiroAcesso ? 'Primeiro administrador do sistema' : 'Cadastro feito pela tela de login',
                id_membro: pessoa.id_membro
            }, cliente);
            await cliente.query('COMMIT');
        } catch (error) {
            await cliente.query('ROLLBACK');
            throw error;
        } finally {
            cliente.release();
        }

        res.status(201).json({
            mensagem: primeiroAcesso
                ? 'Administrador criado. Você já pode entrar.'
                : 'Cadastro enviado. Aguarde um administrador liberar seu acesso.'
        });
    } catch (error) {
        console.error('Erro ao registrar usuário', error);
        if (error.code === '23505') return res.status(409).json({ erro: 'Já existe um usuário com esse e-mail.' });
        responderErro(res, error);
    }
}

// Dados do login + se a pessoa tem ficha de voluntário (dá direito à Minha área,
// mesmo para quem também tem um perfil de gestão)
exports.me = async (req, res) => {
    const usuario = await Usuarios.buscarPorId(req.usuario.id_usuario);
    const ficha = await pool.query('SELECT 1 FROM voluntarios WHERE id_membro = $1', [usuario.id_membro]);
    res.json({ ...usuario, voluntario: ficha.rowCount > 0 });
}
