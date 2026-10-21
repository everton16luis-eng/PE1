const Dashboard = require('../models/dashboardModel');
const { responderErro } = require('../config/erros');

exports.getAllPessoas = async (req, res) => {
    try {
        const resumo = await Dashboard.resumoPessoas();
        res.json(resumo);
    } catch (error) {
        console.error('Erro ao carregar lista resumida de pessoas', error);
        responderErro(res, error);
    }
}

exports.getEscalasSemana = async (req, res) => {
    try {
        const resumo = await Dashboard.escalasSemana();
        res.json(resumo);
    } catch (error) {
        console.error('Erro ao carregar escalas da semana', error);
        responderErro(res, error);
    }
}

exports.getConfirmacoesPendentes = async (req, res) => {
    try {
        const pendentes = await Dashboard.confirmacoesPendentes();
        res.json(pendentes);
    } catch (error) {
        console.error('Erro ao carregar confirmações pendentes', error);
        responderErro(res, error);
    }
}

exports.getGraficoConfirmacoes = async (req, res) => {
    try {
        const grafico = await Dashboard.graficoConfirmacoes();
        res.json(grafico);
    } catch (error) {
        console.error('Erro ao carregar gráfico de confirmações', error);
        responderErro(res, error);
    }
}

exports.criarEvento = async (req, res) => {
    try {
        const { nome, data_evento } = req.body;

        if (!nome || !data_evento) {
            return res.status(400).json({ erro: 'Informe o nome e a data do evento.' });
        }

        const evento = await Dashboard.criarEvento(nome, data_evento);
        res.status(201).json(evento);
    } catch (error) {
        console.error('Erro ao criar evento', error);
        responderErro(res, error);
    }
}

exports.criarFuncao = async (req, res) => {
    try {
        const { nome, descricao, ativo, qtd_voluntarios } = req.body;

        if (!nome) {
            return res.status(400).json({ erro: 'Informe o nome da função.' });
        }

        const funcao = await Dashboard.criarFuncao(nome, descricao, ativo, qtd_voluntarios);
        res.status(201).json(funcao);
    } catch (error) {
        console.error('Erro ao criar função', error);
        responderErro(res, error);
    }
}
