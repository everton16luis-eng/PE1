const Usuarios = require('../models/usuariosModel');
const { responderErro } = require('../config/erros');
const { gerarHashSenha } = require('../config/seguranca');

const PERFIS = ['ADMINISTRADOR', 'GESTOR', 'SECRETARIA', 'FINANCEIRO', 'VOLUNTARIO', 'VISUALIZACAO'];
const AREAS = ['participantes', 'voluntarios', 'escalas', 'criancas', 'relatorios', 'usuarios'];

// Lê e valida o corpo do formulário de usuário
function dadosDoFormulario(body, senhaObrigatoria) {
    const dados = {
        nome: String(body.nome || '').trim(),
        email: String(body.email || '').trim().toLowerCase(),
        telefone: String(body.telefone || '').trim() || null,
        perfil: String(body.perfil || '').toUpperCase(),
        ativo: body.ativo !== false,
        observacoes: String(body.observacoes || '').trim() || null,
        permissoes: Object.fromEntries(AREAS.map(area => [area, Boolean(body.permissoes?.[area])]))
    };
    const senha = String(body.senha || '');

    if (!dados.nome || !/^\S+@\S+\.\S+$/.test(dados.email)) return { erro: 'Informe nome e um e-mail válido.' };
    if (!PERFIS.includes(dados.perfil)) return { erro: 'Selecione um perfil de acesso válido.' };
    if ((senhaObrigatoria || senha) && senha.length < 6) return { erro: 'A senha deve ter pelo menos 6 caracteres.' };

    dados.senha_hash = senha ? gerarHashSenha(senha) : null;
    if (dados.perfil === 'ADMINISTRADOR') dados.permissoes = Object.fromEntries(AREAS.map(area => [area, true]));
    return { dados };
}

// Regras para quem tem a permissão "usuarios" mas não é administrador:
// não mexe em administradores, não promove ninguém a administrador
// e só concede permissões que ele mesmo tem.
function bloqueioDePrivilegio(usuarioLogado, dados, alvoAtual = null) {
    if (usuarioLogado.perfil === 'ADMINISTRADOR') return null;

    if (dados.perfil === 'ADMINISTRADOR' || alvoAtual?.perfil === 'ADMINISTRADOR') {
        return 'Somente administradores podem criar ou alterar administradores.';
    }
    if (alvoAtual && alvoAtual.id_usuario === usuarioLogado.id_usuario) {
        const mudouAcesso = dados.perfil !== alvoAtual.perfil
            || AREAS.some(area => dados.permissoes[area] !== Boolean(alvoAtual.permissoes?.[area]));
        if (mudouAcesso) return 'Você não pode alterar o seu próprio perfil ou as suas permissões.';
    }
    // Só barra permissões NOVAS (as que o usuário editado já tinha podem ser mantidas)
    const extra = AREAS.find(area => dados.permissoes[area] && !usuarioLogado.permissoes?.[area] && !alvoAtual?.permissoes?.[area]);
    if (extra) return `Você não pode conceder a permissão "${extra}", que não possui.`;
    return null;
}

exports.getUsuarios = async (req, res) => {
    try {
        const [usuarios, resumo] = await Promise.all([Usuarios.listar(), Usuarios.resumo()]);
        res.json({ usuarios, resumo });
    } catch (error) {
        console.error('Erro ao carregar usuários', error);
        responderErro(res, error);
    }
}

exports.novoUsuario = async (req, res) => {
    try {
        const { dados, erro } = dadosDoFormulario(req.body, true);
        if (erro) return res.status(400).json({ erro });

        const bloqueio = bloqueioDePrivilegio(req.usuario, dados);
        if (bloqueio) return res.status(403).json({ erro: bloqueio });

        res.status(201).json(await Usuarios.criar(dados));
    } catch (error) {
        console.error('Erro ao cadastrar usuário', error);
        if (error.code === '23505') return res.status(409).json({ erro: 'Já existe um usuário com esse e-mail.' });
        responderErro(res, error);
    }
}

exports.atualizarUsuario = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ erro: 'Usuário inválido.' });

        const { dados, erro } = dadosDoFormulario(req.body, false);
        if (erro) return res.status(400).json({ erro });

        // Não deixa o sistema ficar sem nenhum administrador ativo
        const atual = await Usuarios.buscarPorId(id);
        if (!atual) return res.status(404).json({ erro: 'Usuário não encontrado.' });

        const bloqueio = bloqueioDePrivilegio(req.usuario, dados, atual);
        if (bloqueio) return res.status(403).json({ erro: bloqueio });

        const deixaDeSerAdmin = atual.perfil === 'ADMINISTRADOR' && atual.ativo && (dados.perfil !== 'ADMINISTRADOR' || !dados.ativo);
        if (deixaDeSerAdmin && (await Usuarios.contarAdministradoresAtivos()) <= 1) {
            return res.status(400).json({ erro: 'O sistema precisa de pelo menos um administrador ativo.' });
        }

        res.json(await Usuarios.atualizar(id, dados));
    } catch (error) {
        console.error('Erro ao atualizar usuário', error);
        if (error.code === '23505') return res.status(409).json({ erro: 'Já existe um usuário com esse e-mail.' });
        responderErro(res, error);
    }
}
