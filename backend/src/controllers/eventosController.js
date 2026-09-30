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

