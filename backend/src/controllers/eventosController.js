const Eventos = require('../models/eventosModel');
const Notificacoes = require('../models/notificacoesModel');
const { Avisos, avisarDepois } = require('../config/notificacoes');
const { responderErro } = require('../config/erros');

exports.getAllFuncoes = async (req, res) => {
    try {
        const funcoes = await Eventos.selecionaFuncao();
        res.json(funcoes);
    } catch (error) {
        console.error('Erro ao carregar funções', error);
        responderErro(res, error);
    }
}

exports.getAllvoluntariosDisponiveis = async (req, res) => {
    try {
        const voluntarios = await Eventos.selecionaVoluntariosAtivos();
        res.json(voluntarios);
    } catch (error) {
        console.error('Erro ao carregar voluntários disponíveis', error);
        responderErro(res, error);
    }
}

exports.getAlleventosDisponiveis = async (req, res) => {
    try {
        const eventos = await Eventos.selecionaEventos();
        res.json(eventos);
    } catch (error) {
        console.error('Erro ao carregar eventos', error);
        responderErro(res, error);
    }
}

exports.getTodosEventos = async (req, res) => {
    try {
        const eventos = await Eventos.selecionaTodosEventos();
        res.json(eventos);
    } catch (error) {
        console.error('Erro ao carregar eventos', error);
        responderErro(res, error);
    }
}

// Detalhes de um evento (dados, funções, voluntários e confirmações) — somente leitura
exports.getDetalhesEvento = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ erro: 'Evento inválido.' });
        const detalhes = await Eventos.detalhar(id);
        if (!detalhes) return res.status(404).json({ erro: 'Evento não encontrado.' });
        res.json(detalhes);
    } catch (error) {
        console.error('Erro ao carregar detalhes do evento', error);
        responderErro(res, error);
    }
}

const MENSAGEM_REALIZADO = 'Este evento já foi realizado. Os dados históricos não podem ser alterados nem removidos.';

exports.novoEvento = async (req, res) => {
    try {
        const { nome, data_evento, criado_em, hora_inicio, hora_fim, tipo_evento } = req.body;

        if (!nome || !data_evento) {
            return res.status(400).json({ erro: 'Informe o nome e a data do evento.' });
        }

        const evento = await Eventos.criarEvento(nome, data_evento, criado_em, hora_inicio, hora_fim, tipo_evento);
        res.status(201).json(evento);

    } catch (error) {
        console.error('Erro ao criar evento', error);
        responderErro(res, error);
    }
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}(:\d{2})?$/;
const TIPOS = ['culto', 'culto-jovens', 'culto-infantil', 'evento', 'reuniao'];

exports.atualizarEvento = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ erro: 'Evento inválido.' });

        const b = req.body;
        const dados = {
            nome: typeof b.nome === 'string' ? b.nome.trim().slice(0, 150) : '',
            data_evento: DATA.test(b.data_evento || '') ? b.data_evento : null,
            hora_inicio: HORA.test(b.hora_inicio || '') ? b.hora_inicio : null,
            hora_fim: HORA.test(b.hora_fim || '') ? b.hora_fim : null,
            tipo_evento: TIPOS.includes(b.tipo_evento) ? b.tipo_evento : null
        };
        if (!dados.nome || !dados.data_evento) return res.status(400).json({ erro: 'Informe o nome e a data do evento.' });
        if (!dados.tipo_evento) return res.status(400).json({ erro: 'Selecione o tipo de culto / evento.' });
        if (dados.hora_inicio && dados.hora_fim && dados.hora_fim <= dados.hora_inicio) {
            return res.status(400).json({ erro: 'O horário de término deve ser depois do início.' });
        }

        const antes = await Notificacoes.escaladosDoEvento(id);
        const evento = await Eventos.atualizarEvento(id, dados);
        if (!evento) {
            const situacao = await Eventos.buscarSituacao(id);
            if (situacao?.realizado) return res.status(409).json({ erro: MENSAGEM_REALIZADO });
            return res.status(404).json({ erro: 'Evento não encontrado.' });
        }
        // Mudou o dia ou o horário de início: os escalados são avisados
        const mudouHorario = antes && (antes.data !== dados.data_evento
            || String(antes.hora_inicio || '').slice(0, 5) !== String(dados.hora_inicio || '').slice(0, 5));
        if (mudouHorario && antes.voluntarios.length) {
            avisarDepois(() => Avisos.eventoAlterado(antes.voluntarios, { evento: dados.nome, data: dados.data_evento, hora_inicio: dados.hora_inicio }));
        }
        res.json(evento);
    } catch (error) {
        console.error('Erro ao atualizar evento', error);
        responderErro(res, error);
    }
}

exports.removerEvento = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ erro: 'Evento inválido.' });

        // Quem estava escalado é avisado de que a escala foi cancelada
        const antes = await Notificacoes.escaladosDoEvento(id);
        const resultado = await Eventos.removerEvento(id);
        if (!resultado) return res.status(404).json({ erro: 'Evento não encontrado.' });
        if (resultado.realizado) return res.status(409).json({ erro: MENSAGEM_REALIZADO });
        if (resultado.comAtendimento) return res.status(409).json({ erro: 'Este evento tem atendimento de turma registrado (entrada e saída de crianças) e não pode ser removido.' });
        if (antes?.voluntarios.length) avisarDepois(() => Avisos.eventoRemovido(antes.voluntarios, antes));
        res.json({ mensagem: 'Evento removido.', ...resultado });
    } catch (error) {
        console.error('Erro ao remover evento', error);
        responderErro(res, error);
    }
}
