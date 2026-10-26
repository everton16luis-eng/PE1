const pool = require('../config/db');
const Usuarios = require('../models/usuariosModel');
const Atendimento = require('../models/atendimentoModel');
const Pessoas = require('../models/pessoasModel');
const { responderErro } = require('../config/erros');
const { gerarHashSenha, conferirSenha, senhaPrecisaAtualizar, validarSenha, gerarToken } = require('../config/seguranca');
const Limite = require('../config/limiteLogin');
const { PERMISSOES_ADMIN, PERMISSOES_PADRAO, ehEquipeDeGestao } = require('../config/acesso');

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
        if (!usuario || !(await conferirSenha(senha, usuario.senha_hash))) {
            Limite.registrarFalha(req.ip, login);
            return res.status(401).json({ erro: 'Login ou senha incorretos.' });
        }
        Limite.registrarSucesso(req.ip, login);
        if (!usuario.ativo) {
            return res.status(403).json({ erro: 'Seu acesso está bloqueado. Fale com a secretaria da igreja.' });
        }

        // Senha guardada com um custo antigo: refaz o hash com o custo atual
        // (a senha está certa agora; ninguém precisa trocar de senha por isso)
        if (senhaPrecisaAtualizar(usuario.senha_hash)) {
            await Usuarios.trocarSenha(usuario.id_usuario, await gerarHashSenha(senha));
        }
        await Usuarios.registrarAcesso(usuario.id_usuario);
        res.json({ token: gerarToken(usuario), usuario: await Usuarios.buscarPorId(usuario.id_usuario) });
    } catch (error) {
        console.error('Erro ao fazer login', error);
        responderErro(res, error);
    }
}

// Cadastro pela tela de login: a conta já nasce ATIVA, como usuário padrão
// (sem nenhuma área de gestão: só a Minha área). Perfil e permissões são
// definidos aqui, nunca pelo navegador — campos como "perfil" ou "permissoes"
// no corpo são ignorados. Promover alguém é tarefa do administrador (Usuários).
// Se ainda não existe nenhum administrador ativo, o primeiro cadastro vira administrador.
exports.registro = async (req, res) => {
    try {
        const nome = String(req.body.nome || '').trim();
        const email = String(req.body.email || '').trim().toLowerCase();
        const telefone = String(req.body.telefone || '').trim() || null;
        const senha = String(req.body.senha || '');

        if (!nome || !email) return res.status(400).json({ erro: 'Informe nome e e-mail.' });
        const senhaFraca = validarSenha(senha);
        if (senhaFraca) return res.status(400).json({ erro: senhaFraca });

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
                senha_hash: await gerarHashSenha(senha),
                perfil: primeiroAcesso ? 'ADMINISTRADOR' : 'VISUALIZACAO',
                ativo: true,
                permissoes: primeiroAcesso ? PERMISSOES_ADMIN : PERMISSOES_PADRAO,
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
                : 'Cadastro concluído. Você já pode entrar.'
        });
    } catch (error) {
        console.error('Erro ao registrar usuário', error);
        if (error.code === '23505') return res.status(409).json({ erro: 'Já existe um usuário com esse e-mail.' });
        responderErro(res, error);
    }
}

// Dados do login + se a pessoa tem ficha de voluntário (dá direito à Minha área,
// mesmo para quem também tem um perfil de gestão) + se é da equipe de gestão
// (calculado aqui, pela mesma regra que protege a API)
exports.me = async (req, res) => {
    try {
        const usuario = await Usuarios.buscarPorId(req.usuario.id_usuario);
        const [ficha, turmas] = await Promise.all([
            pool.query('SELECT 1 FROM voluntarios WHERE id_membro = $1', [usuario.id_membro]),
            Atendimento.turmasVinculadas(usuario.id_membro)
        ]);
        res.json({ ...usuario, voluntario: ficha.rowCount > 0, gestao: ehEquipeDeGestao(usuario), turmas_vinculadas: turmas.length });
    } catch (error) {
        console.error('Erro ao carregar o usuário logado', error);
        responderErro(res, error);
    }
}
