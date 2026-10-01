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


