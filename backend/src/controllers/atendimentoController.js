const QRCode = require('qrcode');
const Atendimento = require('../models/atendimentoModel');
const { responderErro } = require('../config/erros');

// Toda operação confere, no servidor, se o login pode operar a turma da sessão:
// responsável/voluntário vinculado à turma ou gestão das crianças (administrador ou área Crianças).
const idValido = valor => Number.isInteger(Number(valor)) && Number(valor) > 0;
const texto = (valor, max) => String(valor ?? '').trim().slice(0, max);

function tratarErro(res, error, contexto) {
    if (error instanceof Atendimento.ErroAtendimento) {
        return res.status(error.status).json({ erro: error.message, ...error.extra });
    }
    console.error(contexto, error);
    return responderErro(res, error);
}

async function sessaoAutorizada(req, res, idSessao) {
    if (!idValido(idSessao)) { res.status(400).json({ erro: 'Sessão inválida.' }); return null; }
    const sessao = await Atendimento.buscarSessao(Number(idSessao));
    if (!sessao) { res.status(404).json({ erro: 'Sessão não encontrada.' }); return null; }
    if (!(await Atendimento.podeOperar(req.usuario, sessao.id_turma))) {
        res.status(403).json({ erro: 'Você não está vinculado a esta turma.' });
        return null;
    }
    return sessao;
}

async function atendimentoAutorizado(req, res) {
    if (!idValido(req.params.id)) { res.status(400).json({ erro: 'Atendimento inválido.' }); return null; }
    const dados = await Atendimento.etiqueta(Number(req.params.id));
    if (!dados) { res.status(404).json({ erro: 'Atendimento não encontrado.' }); return null; }
    const sessao = await sessaoAutorizada(req, res, dados.id_sessao);
    return sessao ? { dados, sessao } : null;
}

// Middleware: só a gestão das crianças
exports.exigirGestor = (req, res, next) => {
    if (Atendimento.ehGestor(req.usuario)) return next();
    return res.status(403).json({ erro: 'Somente a administração das crianças acessa esta área.' });
};

// ---------------------------------------------------------
// Operação (voluntário vinculado ou gestão)
// ---------------------------------------------------------
exports.listarTurmas = async (req, res) => {
    try {
        const gestor = Atendimento.ehGestor(req.usuario);
        const [turmas, eventos, proximo, alertas] = await Promise.all([
            Atendimento.listarTurmas(req.usuario),
            Atendimento.eventosElegiveis(),
            Atendimento.proximoEvento(),
            gestor ? Atendimento.alertasPendentes() : 0
        ]);
        res.json({ turmas, eventos_elegiveis: eventos, proximo_evento: proximo, gestor, alertas_pendentes: alertas, mensagem_sem_evento: Atendimento.MENSAGEM_SEM_EVENTO });
    } catch (error) {
        tratarErro(res, error, 'Erro ao listar as turmas');
    }
};

exports.abrirSessao = async (req, res) => {
    try {
        if (!idValido(req.params.id)) return res.status(400).json({ erro: 'Turma inválida.' });
        if (!(await Atendimento.podeOperar(req.usuario, Number(req.params.id)))) {
            return res.status(403).json({ erro: 'Você não está vinculado a esta turma.' });
        }
        const idEvento = req.body?.id_evento;
        if (idEvento !== undefined && idEvento !== null && !idValido(idEvento)) return res.status(400).json({ erro: 'Evento inválido.' });
        const sessao = await Atendimento.abrirSessao(req.usuario, Number(req.params.id), idEvento ? Number(idEvento) : null);
        res.status(201).json(sessao);
    } catch (error) {
        tratarErro(res, error, 'Erro ao abrir a turma');
    }
};

exports.verSessao = async (req, res) => {
    try {
        const sessao = await sessaoAutorizada(req, res, req.params.id);
        if (!sessao) return;
        const atendimentos = await Atendimento.atendimentosDaSessao(sessao.id_sessao);
        res.json({ sessao, atendimentos, gestor: Atendimento.ehGestor(req.usuario) });
    } catch (error) {
        tratarErro(res, error, 'Erro ao carregar a sessão');
    }
};

exports.buscarCriancas = async (req, res) => {
    try {
        const sessao = await sessaoAutorizada(req, res, req.params.id);
        if (!sessao) return;
        if (sessao.status !== 'aberta') return res.status(409).json({ erro: 'Esta turma já foi encerrada.' });
        res.json(await Atendimento.criancasParaEntrada(sessao.id_sessao, texto(req.query.busca, 80)));
    } catch (error) {
        tratarErro(res, error, 'Erro ao buscar crianças');
    }
};

// Dados completos da criança e dos responsáveis: voluntário só com a turma aberta; gestão sempre
exports.perfilCrianca = async (req, res) => {
    try {
        const sessao = await sessaoAutorizada(req, res, req.params.id);
        if (!sessao) return;
        if (sessao.status !== 'aberta' && !Atendimento.ehGestor(req.usuario)) {
            return res.status(403).json({ erro: 'Os dados das crianças ficam disponíveis só enquanto a turma está aberta.' });
        }
        if (!idValido(req.params.idCrianca)) return res.status(400).json({ erro: 'Criança inválida.' });
        const crianca = await Atendimento.perfilCrianca(Number(req.params.idCrianca));
        if (!crianca) return res.status(404).json({ erro: 'Criança não encontrada.' });
        await Atendimento.auditar(null, { id_sessao: sessao.id_sessao, acao: 'dados_consultados', detalhe: crianca.nome, id_usuario: req.usuario.id_usuario });
        res.json(crianca);
    } catch (error) {
        tratarErro(res, error, 'Erro ao carregar a criança');
    }
};

exports.registrarEntrada = async (req, res) => {
    try {
        const sessao = await sessaoAutorizada(req, res, req.params.id);
        if (!sessao) return;
        if (!idValido(req.body?.id_crianca)) return res.status(400).json({ erro: 'Escolha a criança.' });
        res.status(201).json(await Atendimento.registrarEntrada(req.usuario, sessao.id_sessao, Number(req.body.id_crianca)));
    } catch (error) {
        tratarErro(res, error, 'Erro ao registrar a entrada');
    }
};

exports.conferirCodigo = async (req, res) => {
    try {
        const sessao = await sessaoAutorizada(req, res, req.params.id);
        if (!sessao) return;
        const codigo = texto(req.body?.codigo, 64);
        if (!codigo) return res.status(400).json({ erro: 'Digite ou leia o código da etiqueta.' });
        res.json(await Atendimento.conferirCodigo(req.usuario, sessao.id_sessao, codigo));
    } catch (error) {
        tratarErro(res, error, 'Erro ao conferir o código');
    }
};

exports.encerrarSessao = async (req, res) => {
    try {
        const sessao = await sessaoAutorizada(req, res, req.params.id);
        if (!sessao) return;
        await Atendimento.encerrarManual(req.usuario, sessao.id_sessao);
        res.json({ mensagem: 'Turma encerrada.' });
    } catch (error) {
        tratarErro(res, error, 'Erro ao encerrar a turma');
    }
};

exports.registrarSaida = async (req, res) => {
    try {
        const alvo = await atendimentoAutorizado(req, res);
        if (!alvo) return;
        const codigo = texto(req.body?.codigo, 64);
        if (!codigo) return res.status(400).json({ erro: 'Digite ou leia o código da etiqueta do responsável.' });
        const idResponsavel = req.body?.id_responsavel;
        if (idResponsavel !== undefined && idResponsavel !== null && idResponsavel !== '' && !idValido(idResponsavel)) {
            return res.status(400).json({ erro: 'Responsável inválido.' });
        }
        res.json(await Atendimento.registrarSaida(req.usuario, Number(req.params.id), { codigo, id_responsavel: idResponsavel ? Number(idResponsavel) : null }));
    } catch (error) {
        tratarErro(res, error, 'Erro ao registrar a saída');
    }
};

// Etiqueta: só com o código ativo (turma aberta e criança presente). Sem telefone nem e-mail.
exports.etiqueta = async (req, res) => {
    try {
        const alvo = await atendimentoAutorizado(req, res);
        if (!alvo) return;
        const { dados, sessao } = alvo;
        if (sessao.status !== 'aberta' || dados.saida_em || !dados.id_codigo) {
            return res.status(409).json({ erro: 'Não há etiqueta ativa para este atendimento (a criança já saiu ou a turma foi encerrada).' });
        }
        // Cada etiqueta com seu QR (tokens aleatórios diferentes). O código de retirada só vai na do responsável.
        const opcoes = { type: 'svg', margin: 0, errorCorrectionLevel: 'M' };
        const [qrCrianca, qrResponsavel] = await Promise.all([QRCode.toString(dados.token_crianca, opcoes), QRCode.toString(dados.token, opcoes)]);
        res.json({
            id_atendimento: dados.id_atendimento, id_sessao: dados.id_sessao, crianca: dados.crianca, turma: dados.turma,
            evento: dados.evento, data_evento: dados.data_evento, emitido_em: dados.emitido_em,
            responsavel: dados.responsavel, parentesco: dados.parentesco,
            codigo_crianca: dados.codigo, qr_crianca: qrCrianca,
            codigo_retirada: dados.codigo_retirada, qr_responsavel: qrResponsavel
        });
    } catch (error) {
        tratarErro(res, error, 'Erro ao gerar a etiqueta');
    }
};

exports.registrarImpressao = async (req, res) => {
    try {
        const alvo = await atendimentoAutorizado(req, res);
        if (!alvo) return;
        const tipo = ['ambas', 'crianca', 'responsavel'].includes(req.body?.tipo) ? req.body.tipo : 'ambas';
        await Atendimento.registrarImpressao(req.usuario, Number(req.params.id), tipo);
        res.json({ ok: true });
    } catch (error) {
        tratarErro(res, error, 'Erro ao registrar a impressão');
    }
};

exports.segundaVia = async (req, res) => {
    try {
        const alvo = await atendimentoAutorizado(req, res);
        if (!alvo) return;
        const motivo = texto(req.body?.motivo, 300);
        if (motivo.length < 3) return res.status(400).json({ erro: 'Informe o motivo da 2ª via (ex.: etiqueta perdida).' });
        const codigo = await Atendimento.segundaVia(req.usuario, Number(req.params.id), motivo);
        res.status(201).json({ mensagem: 'Nova etiqueta emitida. A anterior não vale mais.', codigo: codigo.codigo });
    } catch (error) {
        tratarErro(res, error, 'Erro ao emitir a 2ª via');
    }
};

// ---------------------------------------------------------
// Administração
// ---------------------------------------------------------
exports.listarSessoes = async (req, res) => {
    try {
        const status = ['aberta', 'encerrada'].includes(req.query.status) ? req.query.status : '';
        const idTurma = idValido(req.query.turma) ? Number(req.query.turma) : null;
        res.json(await Atendimento.listarSessoes({ status, idTurma }));
    } catch (error) {
        tratarErro(res, error, 'Erro ao listar as sessões');
    }
};

exports.historicoDaSessao = async (req, res) => {
    try {
        if (!idValido(req.params.id)) return res.status(400).json({ erro: 'Sessão inválida.' });
        res.json(await Atendimento.auditoriaDaSessao(Number(req.params.id)));
    } catch (error) {
        tratarErro(res, error, 'Erro ao carregar o histórico');
    }
};

exports.encerrarAdministrativo = async (req, res) => {
    try {
        if (!idValido(req.params.id)) return res.status(400).json({ erro: 'Sessão inválida.' });
        const motivo = texto(req.body?.motivo, 300);
        if (motivo.length < 3) return res.status(400).json({ erro: 'Informe o motivo do encerramento.' });
        res.json(await Atendimento.encerrarAdministrativo(req.usuario, Number(req.params.id), motivo));
    } catch (error) {
        tratarErro(res, error, 'Erro ao encerrar a sessão');
    }
};

exports.listarAlertas = async (req, res) => {
    try {
        const status = ['pendente', 'tratado'].includes(req.query.status) ? req.query.status : '';
        res.json(await Atendimento.listarAlertas(status));
    } catch (error) {
        tratarErro(res, error, 'Erro ao listar os alertas');
    }
};

exports.verAlerta = async (req, res) => {
    try {
        if (!idValido(req.params.id)) return res.status(400).json({ erro: 'Alerta inválido.' });
        const alerta = (await Atendimento.listarAlertas('')).find(a => a.id_alerta === Number(req.params.id));
        if (!alerta) return res.status(404).json({ erro: 'Alerta não encontrado.' });
        res.json({ ...alerta, afetados: await Atendimento.afetadosDoAlerta(alerta.id_sessao) });
    } catch (error) {
        tratarErro(res, error, 'Erro ao carregar o alerta');
    }
};

exports.tratarAlerta = async (req, res) => {
    try {
        if (!idValido(req.params.id)) return res.status(400).json({ erro: 'Alerta inválido.' });
        const observacao = texto(req.body?.observacao, 500);
        if (observacao.length < 3) return res.status(400).json({ erro: 'Descreva o que foi verificado ou feito.' });
        if (!(await Atendimento.tratarAlerta(req.usuario, Number(req.params.id), observacao))) {
            return res.status(409).json({ erro: 'Este alerta não existe ou já foi tratado.' });
        }
        res.json({ mensagem: 'Alerta marcado como tratado.' });
    } catch (error) {
        tratarErro(res, error, 'Erro ao tratar o alerta');
    }
};

exports.voluntariosDaTurma = async (req, res) => {
    try {
        if (!idValido(req.params.id)) return res.status(400).json({ erro: 'Turma inválida.' });
        res.json(await Atendimento.voluntariosParaVinculo(Number(req.params.id)));
    } catch (error) {
        tratarErro(res, error, 'Erro ao carregar os voluntários');
    }
};

exports.definirVoluntarios = async (req, res) => {
    try {
        if (!idValido(req.params.id)) return res.status(400).json({ erro: 'Turma inválida.' });
        const ids = Array.isArray(req.body?.voluntarios) ? req.body.voluntarios : null;
        if (!ids || ids.length > 200 || !ids.every(idValido)) return res.status(400).json({ erro: 'Lista de voluntários inválida.' });
        const total = await Atendimento.definirVoluntarios(req.usuario, Number(req.params.id), [...new Set(ids.map(Number))]);
        res.json({ mensagem: 'Voluntários da turma atualizados.', total });
    } catch (error) {
        tratarErro(res, error, 'Erro ao vincular voluntários');
    }
};
