const Dashboard = require('../models/dashboardModel');

exports.getAllPessoas = async (req, res) => {
    try {
        const resumo = await Dashboard.resumoPessoas()
        res.json(resumo)
    } catch (error) {
        console.error('Erro ao carregar lista resumida de pessoas', error);
        res.status(500).json({erro: error.message});
    }
}

exports.getEscalasSemana = async(req, res) =>{
    try {
        const resumo = await Dashboard.escalasSemana()
        res.json(resumo)
        
    } catch (error) {
        console.error('Erro ao carregar escalas da semana');
        res.status(500).json({erro: error.message})
    }
}

exports.criarEvento = async(req, res) =>{
    try {
        const {nome, data_evento} = req.body;
        const evento = await Dashboard.criarEvento(nome, data_evento);
        res.status(201).json(evento)
        
    } catch (error) {
        console.error('Erro ao criar evento');
        res.status(500).json({erro : error.message})
    }
}

exports.criarFuncao = async(req, res) =>{
    try {
        const {nome, descricao, ativo, qtd_voluntarios} = req.body
        const funcao = await Dashboard.criarFuncao(
            nome, descricao, ativo, qtd_voluntarios
        );
        res.status(201).json(funcao);

    } catch (error) {
        console.error('Erro a criar função' + error);
        res.status(500).json({erro : error.message})

    }
}