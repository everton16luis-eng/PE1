const Eventos = require('../models/eventosModel');

exports.getAllFuncoes = async (req, res) =>{
    try {
        const funcoes = await Eventos.selecionaFuncao()
        res.json(funcoes);
    } catch (error) {
        console.error('Erro ao carregar funcões')
        res.status(500).json({erro : error.message})
    }
}

exports.getAllvoluntariosDisponiveis = async (req, res) =>{
    try {
        const voluntarios = await Eventos.selecionaVoluntariosAtivos()
        res.json(voluntarios);
    } catch (error) {
        console.error('Erro ao carregar funcões')
        res.status(500).json({erro : error.message})
    }
}

exports.getAlleventosDisponiveis = async (req, res) =>{
    try {
        const eventos = await Eventos.selecionaEventos()
        res.json(eventos);
    } catch (error) {
        console.error('Erro ao carregar funcões')
        res.status(500).json({erro : error.message})
    }
}

exports.novoEvento = async(req, res) =>{
    try {
        const {nome, data_evento, criado_em, hora_inicio, hora_fim, tipo_evento} = req.body;
        const evento = await Eventos.criarEvento(nome, data_evento, criado_em, hora_inicio, hora_fim, tipo_evento);
        res.status(201).json(evento)
        
    } catch (error) {
        console.error('Erro ao criar evento');
        res.status(500).json({erro : error.message})
    }
}


