const Eventos = require('../models/eventosModel');
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
