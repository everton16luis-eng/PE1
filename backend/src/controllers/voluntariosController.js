const Voluntarios = require('../models/voluntariosModel');
const Escalas = require('../models/escalasModel');
const Notificacoes = require('../models/notificacoesModel');
const { Avisos, avisarDepois } = require('../config/notificacoes');
const { responderErro } = require('../config/erros');

const DIAS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const texto = valor => String(valor ?? '').trim() || null;
const listaDeIds = lista => [...new Set((Array.isArray(lista) ? lista : []).map(Number).filter(n => Number.isInteger(n) && n > 0))];

exports.getVoluntarios = async (req, res) => {
    try {
        const [resumo, voluntarios] = await Promise.all([Voluntarios.resumo(), Voluntarios.listar()]);
        res.json({ resumo, voluntarios });
    } catch (error) {
        console.error('Erro ao carregar voluntários', error);
        responderErro(res, error);
    }
}

exports.getCandidatos = async (req, res) => {
    try {
        const [membros, departamentos] = await Promise.all([Voluntarios.candidatos(), Voluntarios.departamentos()]);
        res.json({ membros, departamentos });
    } catch (error) {
        console.error('Erro ao carregar membros para voluntariado', error);
        responderErro(res, error);
    }
}

exports.novoVoluntario = async (req, res) => {
    try {
        const b = req.body;
        const idMembro = Number(b.id_membro);
        const funcoes = listaDeIds(b.funcoes);
        const disponibilidade = (Array.isArray(b.disponibilidade) ? b.disponibilidade : []).filter(dia => DIAS.includes(dia));

        if (!Number.isInteger(idMembro) || idMembro <= 0) return res.status(400).json({ erro: 'Selecione o participante.' });
        if (!funcoes.length) return res.status(400).json({ erro: 'Selecione pelo menos uma função.' });
        if (!disponibilidade.length) return res.status(400).json({ erro: 'Informe pelo menos um dia de disponibilidade.' });

        // Só quem está ativo e apto (definido pelo administrador em Participantes) recebe ficha
        const pessoa = await Voluntarios.elegibilidade(idMembro);
        if (!pessoa) return res.status(400).json({ erro: 'Membro, departamento ou função inexistente.' });
        if (!pessoa.ativo || !pessoa.apto_voluntario) {
            return res.status(400).json({ erro: 'Só pessoas ativas e aptas ao voluntariado podem ser voluntárias. O administrador define isso em Participantes.' });
        }
        if (pessoa.tem_ficha) return res.status(409).json({ erro: 'Esta pessoa já tem ficha de voluntário.' });

        const voluntario = await Voluntarios.criar({
            id_membro: idMembro,
            id_departamento: Number(b.id_departamento) || null,
            ativo: b.ativo !== false,
            funcoes,
            disponibilidade,
            observacoes: texto(b.observacoes),
            telefone: texto(b.telefone),
            email: texto(b.email)
        });
        res.status(201).json(voluntario);
    } catch (error) {
        console.error('Erro ao cadastrar voluntário', error);
        if (error.code === '23503') return res.status(400).json({ erro: 'Membro, departamento ou função inexistente.' });
        responderErro(res, error);
    }
}

exports.alterarStatus = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ erro: 'Voluntário inválido.' });

        const voluntario = await Voluntarios.alterarStatus(id, Boolean(req.body.ativo));
        if (!voluntario) return res.status(404).json({ erro: 'Voluntário não encontrado.' });
        res.json(voluntario);
    } catch (error) {
        console.error('Erro ao alterar status do voluntário', error);
        responderErro(res, error);
    }
}

// =========================================================
// Ficha do voluntário (gestão)
// =========================================================
const Usuarios = require('../models/usuariosModel');
const { gerarHashSenha } = require('../config/seguranca');
const Regras = require('../config/regrasVoluntario');

const PERMISSOES_PORTAL = { participantes: false, voluntarios: false, escalas: false, criancas: false, relatorios: false, usuarios: false };

const podeGerenciarUsuarios = usuario => usuario.perfil === 'ADMINISTRADOR' || Boolean(usuario.permissoes?.usuarios);

// Lê um id da URL; responde 400 se não for número
function idDaUrl(req, res, nome = 'id') {
    if (!Regras.idValido(req.params[nome])) {
        res.status(400).json({ erro: 'Identificador inválido.' });
        return null;
    }
    return Number(req.params[nome]);
}

exports.getFicha = async (req, res) => {
    try {
        const id = idDaUrl(req, res);
        if (!id) return;
        const ficha = await Voluntarios.buscarFicha(id);
        if (!ficha) return res.status(404).json({ erro: 'Voluntário não encontrado.' });
        res.json(ficha);
    } catch (error) {
        console.error('Erro ao carregar ficha do voluntário', error);
        responderErro(res, error);
    }
}

exports.atualizarVoluntario = async (req, res) => {
    try {
        const id = idDaUrl(req, res);
        if (!id) return;
        const b = req.body;
        const dados = {
            id_departamento: Regras.idValido(b.id_departamento) ? Number(b.id_departamento) : null,
            ativo: b.ativo !== false,
            funcoes: listaDeIds(b.funcoes),
            disponibilidade: Regras.lerDisponibilidade(b.disponibilidade),
            observacoes: Regras.texto(b.observacoes, 2000),
            telefone: Regras.texto(b.telefone, 20),
            email: Regras.texto(b.email, 150)
        };
        if (!dados.funcoes.length) return res.status(400).json({ erro: 'Selecione pelo menos uma função.' });
        if (!dados.disponibilidade.length) return res.status(400).json({ erro: 'Informe pelo menos um dia de disponibilidade.' });
        if (dados.email && !/^\S+@\S+\.\S+$/.test(dados.email)) return res.status(400).json({ erro: 'E-mail inválido.' });

        const voluntario = await Voluntarios.atualizar(id, dados);
        if (!voluntario) return res.status(404).json({ erro: 'Voluntário não encontrado.' });
        res.json(await Voluntarios.buscarFicha(id));
    } catch (error) {
        console.error('Erro ao atualizar voluntário', error);
        if (error.code === '23503') return res.status(400).json({ erro: 'Departamento ou função inexistente.' });
        responderErro(res, error);
    }
}

exports.responderEscala = async (req, res) => {
    try {
        const id = idDaUrl(req, res);
        const idEscala = id && idDaUrl(req, res, 'idEscala');
        if (!idEscala) return;
        const { dados, erro } = Regras.lerResposta(req.body);
        if (erro) return res.status(400).json({ erro });

        const resposta = await Voluntarios.responderEscala(id, idEscala, dados);
        if (!resposta) {
            const situacao = await Escalas.situacaoDaEscala(idEscala);
            if (situacao?.bloqueada) return res.status(409).json({ erro: Escalas.mensagemBloqueio(situacao) });
            return res.status(404).json({ erro: 'Este voluntário não está nessa escala.' });
        }
        // A própria equipe fez a mudança: sem aviso para a liderança
        const { estava_recusado: _estavaRecusado, ...dadosResposta } = resposta;
        res.json(dadosResposta);
    } catch (error) {
        console.error('Erro ao responder escala', error);
        responderErro(res, error);
    }
}

exports.removerDaEscala = async (req, res) => {
    try {
        const id = idDaUrl(req, res);
        const idEscala = id && idDaUrl(req, res, 'idEscala');
        if (!idEscala) return;
        const info = await Notificacoes.escalaInfo(idEscala);
        const removido = await Voluntarios.removerDaEscala(id, idEscala);
        if (!removido) {
            const situacao = await Escalas.situacaoDaEscala(idEscala);
            if (situacao?.bloqueada) return res.status(409).json({ erro: Escalas.mensagemBloqueio(situacao) });
            return res.status(404).json({ erro: 'Este voluntário não está nessa escala.' });
        }
        if (info) avisarDepois(() => Avisos.escalaRetirada([id], info));
        res.json({ mensagem: 'Voluntário retirado da escala.' });
    } catch (error) {
        console.error('Erro ao retirar voluntário da escala', error);
        responderErro(res, error);
    }
}

exports.novaAusencia = async (req, res) => {
    try {
        const id = idDaUrl(req, res);
        if (!id) return;
        const { dados, erro } = Regras.lerAusencia(req.body);
        if (erro) return res.status(400).json({ erro });
        const ausencia = await Voluntarios.adicionarAusencia(id, dados);
        const conflitos = await Voluntarios.escalasNoPeriodo(id, dados.data_inicio, dados.data_fim);
        res.status(201).json({ ...ausencia, conflitos });
    } catch (error) {
        console.error('Erro ao registrar ausência', error);
        if (error.code === '23503') return res.status(404).json({ erro: 'Voluntário não encontrado.' });
        responderErro(res, error);
    }
}

exports.removerAusencia = async (req, res) => {
    try {
        const id = idDaUrl(req, res);
        const idAusencia = id && idDaUrl(req, res, 'idAusencia');
        if (!idAusencia) return;
        if (!await Voluntarios.removerAusencia(id, idAusencia)) return res.status(404).json({ erro: 'Ausência não encontrada.' });
        res.json({ mensagem: 'Ausência removida.' });
    } catch (error) {
        console.error('Erro ao remover ausência', error);
        responderErro(res, error);
    }
}

// Cria o login do voluntário para o portal (exige permissão de gerenciar usuários)
exports.criarAcesso = async (req, res) => {
    try {
        if (!podeGerenciarUsuarios(req.usuario)) {
            return res.status(403).json({ erro: 'Criar acesso exige a permissão de gerenciar usuários.' });
        }
        const id = idDaUrl(req, res);
        if (!id) return;
        const ficha = await Voluntarios.buscarFicha(id);
        if (!ficha) return res.status(404).json({ erro: 'Voluntário não encontrado.' });
        if (ficha.acesso) return res.status(409).json({ erro: 'Este voluntário já tem acesso ao portal.' });

        const email = Regras.texto(req.body.email, 150)?.toLowerCase();
        const senha = typeof req.body.senha === 'string' ? req.body.senha : '';
        if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ erro: 'Informe um e-mail válido para o login.' });
        if (senha.length < 6) return res.status(400).json({ erro: 'A senha deve ter pelo menos 6 caracteres.' });

        const usuario = await Usuarios.criar({
            nome: ficha.nome, email, telefone: ficha.telefone, senha_hash: gerarHashSenha(senha),
            perfil: 'VOLUNTARIO', ativo: true, permissoes: PERMISSOES_PORTAL,
            observacoes: 'Acesso ao portal do voluntário', id_membro: ficha.id_membro
        });
        res.status(201).json({ id_usuario: usuario.id_usuario, email: usuario.email, ativo: usuario.ativo });
    } catch (error) {
        console.error('Erro ao criar acesso do voluntário', error);
        if (error.code === '23505') return res.status(409).json({ erro: 'Já existe um usuário com esse e-mail.' });
        responderErro(res, error);
    }
}

// Bloqueia/libera o login do portal (não mexe em contas de gestão)
exports.alterarAcesso = async (req, res) => {
    try {
        if (!podeGerenciarUsuarios(req.usuario)) {
            return res.status(403).json({ erro: 'Alterar acesso exige a permissão de gerenciar usuários.' });
        }
        const id = idDaUrl(req, res);
        if (!id) return;
        const ficha = await Voluntarios.buscarFicha(id);
        if (!ficha?.acesso) return res.status(404).json({ erro: 'Este voluntário não tem acesso ao portal.' });

        const atual = await Usuarios.buscarPorId(ficha.acesso.id_usuario);
        if (atual.perfil !== 'VOLUNTARIO') {
            return res.status(400).json({ erro: 'Este login é de gestão; altere-o na página Usuários.' });
        }
        const usuario = await Usuarios.alterarAcessoDoMembro(ficha.id_membro, Boolean(req.body.ativo));
        res.json({ id_usuario: usuario.id_usuario, email: usuario.email, ativo: usuario.ativo });
    } catch (error) {
        console.error('Erro ao alterar acesso do voluntário', error);
        responderErro(res, error);
    }
}
