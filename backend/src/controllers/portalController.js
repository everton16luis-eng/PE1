// =========================================================
// Portal do voluntário: tudo é do próprio voluntário logado.
// O id do voluntário vem SEMPRE do login (nunca do navegador).
// =========================================================

const Voluntarios = require('../models/voluntariosModel');
const Usuarios = require('../models/usuariosModel');
const Participantes = require('../models/participantesModel');
const Eventos = require('../models/eventosModel');
const Escalas = require('../models/escalasModel');
const { responderErro } = require('../config/erros');
const { gerarHashSenha, conferirSenha } = require('../config/seguranca');
const Regras = require('../config/regrasVoluntario');

const PROXIMOS_EVENTOS = 12;

// Descobre o voluntário do usuário logado; responde 404 se não houver
async function meuVoluntario(req, res) {
    const id = req.usuario.id_membro ? await Voluntarios.idPorMembro(req.usuario.id_membro) : null;
    if (!id) {
        res.status(404).json({ erro: 'Seu login ainda não está ligado a um cadastro de voluntário. Fale com a secretaria.' });
        return null;
    }
    return id;
}

// Minha área de qualquer login. A experiência vem da classificação real no banco:
// - "voluntario": a pessoa do login tem ficha de voluntário → ficha (escalas
//   em primeiro lugar) + próximos eventos como informação secundária;
// - "membro" / "visitante": classificação da pessoa na base universal → próximos eventos.
exports.getMinhaArea = async (req, res) => {
    try {
        const idMembro = req.usuario.id_membro;
        const [idVoluntario, membro, eventos] = await Promise.all([
            idMembro ? Voluntarios.idPorMembro(idMembro) : null,
            idMembro ? Participantes.buscarMembro(idMembro) : null,
            Eventos.selecionaEventos(PROXIMOS_EVENTOS)
        ]);

        if (idVoluntario) {
            const ficha = await Voluntarios.buscarFicha(idVoluntario);
            delete ficha.acesso;
            delete ficha.observacoes; // anotações internas da equipe
            return res.json({ ...ficha, classificacao: 'voluntario', eventos });
        }
        res.json({
            classificacao: membro?.classificacao === 'membro' ? 'membro' : 'visitante',
            nome: membro?.nome_completo || req.usuario.nome,
            eventos
        });
    } catch (error) {
        console.error('Erro ao carregar portal do voluntário', error);
        responderErro(res, error);
    }
}

exports.responderEscala = async (req, res) => {
    try {
        const id = await meuVoluntario(req, res);
        if (!id) return;
        if (!Regras.idValido(req.params.idEscala)) return res.status(400).json({ erro: 'Escala inválida.' });
        const { dados, erro } = Regras.lerResposta(req.body);
        if (erro) return res.status(400).json({ erro });

        // O voluntário só responde escalas futuras e que são dele
        const resposta = await Voluntarios.responderEscala(id, Number(req.params.idEscala), dados, true);
        if (!resposta) return res.status(404).json({ erro: 'Escala não encontrada (ou já passou).' });
        res.json(resposta);
    } catch (error) {
        console.error('Erro ao responder escala pelo portal', error);
        responderErro(res, error);
    }
}

// Quem pode assumir a vaga do voluntário nesta escala (só nome; sem contato de ninguém)
exports.substitutos = async (req, res) => {
    try {
        const id = await meuVoluntario(req, res);
        if (!id) return;
        if (!Regras.idValido(req.params.idEscala)) return res.status(400).json({ erro: 'Escala inválida.' });
        const substitutos = await Escalas.substitutosParaVaga(Number(req.params.idEscala), id);
        if (!substitutos) return res.status(404).json({ erro: 'Escala não encontrada (ou já passou).' });
        res.json({ substitutos });
    } catch (error) {
        console.error('Erro ao listar substitutos', error);
        responderErro(res, error);
    }
}

// O próprio voluntário passa a vaga para outro (combinado entre eles), sem a equipe.
// Quem assume entra "aguardando resposta"; a troca fica registrada para a liderança.
exports.passarVaga = async (req, res) => {
    try {
        const id = await meuVoluntario(req, res);
        if (!id) return;
        if (!Regras.idValido(req.params.idEscala)) return res.status(400).json({ erro: 'Escala inválida.' });
        const idNovo = Number(req.body?.id_voluntario);
        if (!Regras.idValido(idNovo)) return res.status(400).json({ erro: 'Escolha quem vai assumir a vaga.' });
        if (idNovo === id) return res.status(400).json({ erro: 'Escolha outra pessoa para assumir a vaga.' });

        const resultado = await Escalas.passarVaga(Number(req.params.idEscala), id, idNovo, req.usuario.id_usuario);
        if (resultado.erro) return res.status(resultado.status).json({ erro: resultado.erro });
        res.json({ mensagem: `Vaga passada para ${resultado.nome}. Ele(a) vai confirmar pela Minha área.` });
    } catch (error) {
        console.error('Erro ao passar a vaga', error);
        if (error.code === '23505') return res.status(409).json({ erro: 'Essa pessoa já está nesta escala.' });
        responderErro(res, error);
    }
}

exports.salvarPreferencias = async (req, res) => {
    try {
        const id = await meuVoluntario(req, res);
        if (!id) return;
        const disponibilidade = Regras.lerDisponibilidade(req.body.disponibilidade);
        const telefone = Regras.texto(req.body.telefone, 20);
        const email = Regras.texto(req.body.email, 150);
        if (!disponibilidade.length) return res.status(400).json({ erro: 'Marque pelo menos um dia em que pode servir.' });
        if (email && !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ erro: 'E-mail inválido.' });

        await Voluntarios.atualizarPreferencias(id, { disponibilidade, telefone, email });
        res.json({ mensagem: 'Preferências salvas.' });
    } catch (error) {
        console.error('Erro ao salvar preferências do voluntário', error);
        responderErro(res, error);
    }
}

exports.novaAusencia = async (req, res) => {
    try {
        const id = await meuVoluntario(req, res);
        if (!id) return;
        const { dados, erro } = Regras.lerAusencia(req.body);
        if (erro) return res.status(400).json({ erro });
        const ausencia = await Voluntarios.adicionarAusencia(id, dados);
        const conflitos = await Voluntarios.escalasNoPeriodo(id, dados.data_inicio, dados.data_fim);
        res.status(201).json({ ...ausencia, conflitos });
    } catch (error) {
        console.error('Erro ao registrar ausência pelo portal', error);
        responderErro(res, error);
    }
}

exports.removerAusencia = async (req, res) => {
    try {
        const id = await meuVoluntario(req, res);
        if (!id) return;
        if (!Regras.idValido(req.params.idAusencia)) return res.status(400).json({ erro: 'Ausência inválida.' });
        if (!await Voluntarios.removerAusencia(id, Number(req.params.idAusencia))) {
            return res.status(404).json({ erro: 'Ausência não encontrada.' });
        }
        res.json({ mensagem: 'Ausência removida.' });
    } catch (error) {
        console.error('Erro ao remover ausência pelo portal', error);
        responderErro(res, error);
    }
}

// Troca de senha do próprio usuário (exige a senha atual)
exports.trocarSenha = async (req, res) => {
    try {
        const atual = typeof req.body.senha_atual === 'string' ? req.body.senha_atual : '';
        const nova = typeof req.body.nova_senha === 'string' ? req.body.nova_senha : '';
        if (nova.length < 6) return res.status(400).json({ erro: 'A nova senha deve ter pelo menos 6 caracteres.' });
        if (!conferirSenha(atual, await Usuarios.buscarHash(req.usuario.id_usuario))) {
            return res.status(400).json({ erro: 'Senha atual incorreta.' });
        }
        await Usuarios.trocarSenha(req.usuario.id_usuario, gerarHashSenha(nova));
        res.json({ mensagem: 'Senha alterada.' });
    } catch (error) {
        console.error('Erro ao trocar senha', error);
        responderErro(res, error);
    }
}
