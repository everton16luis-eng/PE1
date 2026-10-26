const Usuarios = require('../models/usuariosModel');
const Pessoas = require('../models/pessoasModel');
const { responderErro } = require('../config/erros');
const { gerarHashSenha, validarSenha } = require('../config/seguranca');
const { AREAS } = require('../config/acesso');

// Perfis de contas de gestão. O perfil VOLUNTARIO (portal) não é criado nem
// editado por aqui: a conta precisa estar ligada a um voluntário (ficha).
const PERFIS = ['ADMINISTRADOR', 'GESTOR', 'SECRETARIA', 'FINANCEIRO', 'VISUALIZACAO'];
const MENSAGEM_PORTAL = 'Contas do portal do voluntário são gerenciadas na ficha do voluntário (página Voluntários).';

// Lê e valida o corpo do formulário de usuário
async function dadosDoFormulario(body, senhaObrigatoria) {
    const dados = {
        email: String(body.email || '').trim().toLowerCase(),
        telefone: String(body.telefone || '').trim() || null,
        perfil: String(body.perfil || '').toUpperCase(),
        ativo: body.ativo !== false,
        observacoes: String(body.observacoes || '').trim() || null,
        permissoes: Object.fromEntries(AREAS.map(area => [area, Boolean(body.permissoes?.[area])]))
    };
    const senha = String(body.senha || '');

    if (!/^\S+@\S+\.\S+$/.test(dados.email)) return { erro: 'Informe um e-mail válido.' };
    if (dados.perfil === 'VOLUNTARIO') return { erro: MENSAGEM_PORTAL };
    if (!PERFIS.includes(dados.perfil)) return { erro: 'Selecione um perfil de acesso válido.' };
    // Senha nova (criar usuário ou trocar a senha dele): precisa ser forte
    if (senhaObrigatoria || senha) {
        const senhaFraca = validarSenha(senha);
        if (senhaFraca) return { erro: senhaFraca };
    }

    dados.senha_hash = senha ? await gerarHashSenha(senha) : null;
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
        // pessoas = cadastros sem login (a quem um novo acesso pode ser dado)
        const [usuarios, resumo, pessoas] = await Promise.all([Usuarios.listar(), Usuarios.resumo(), Pessoas.semLogin()]);
        res.json({ usuarios, resumo, pessoas });
    } catch (error) {
        console.error('Erro ao carregar usuários', error);
        responderErro(res, error);
    }
}

exports.novoUsuario = async (req, res) => {
    try {
        const { dados, erro } = await dadosDoFormulario(req.body, true);
        if (erro) return res.status(400).json({ erro });

        const bloqueio = bloqueioDePrivilegio(req.usuario, dados);
        if (bloqueio) return res.status(403).json({ erro: bloqueio });

        // O acesso é dado a uma pessoa que já está no cadastro universal
        const idMembro = Number(req.body.id_membro);
        if (!Number.isInteger(idMembro) || idMembro <= 0) {
            return res.status(400).json({ erro: 'Escolha a pessoa (do Cadastro) que vai receber o acesso.' });
        }
        const pessoa = await Pessoas.buscar(idMembro);
        if (!pessoa) return res.status(404).json({ erro: 'Pessoa não encontrada no cadastro.' });
        if (pessoa.tem_login) return res.status(409).json({ erro: 'Esta pessoa já tem um login.' });

        res.status(201).json(await Usuarios.criar({
            ...dados, nome: pessoa.nome, id_membro: idMembro, telefone: dados.telefone || pessoa.telefone
        }));
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

        const { dados, erro } = await dadosDoFormulario(req.body, false);
        if (erro) return res.status(400).json({ erro });

        // Não deixa o sistema ficar sem nenhum administrador ativo
        const atual = await Usuarios.buscarPorId(id);
        if (!atual) return res.status(404).json({ erro: 'Usuário não encontrado.' });
        if (atual.perfil === 'VOLUNTARIO') return res.status(400).json({ erro: MENSAGEM_PORTAL });

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
