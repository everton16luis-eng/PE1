const Funcoes = require('../models/funcoesModel');
const { responderErro } = require('../config/erros');

const DIAS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

function dadosDoFormulario(b) {
    const dados = {
        nome: String(b.nome || '').trim(),
        descricao: String(b.descricao || '').trim() || null,
        ativo: b.ativo !== false,
        qtd_voluntarios: Number(b.qtd_voluntarios),
        vagas: Number(b.vagas),
        dias_disponiveis: (Array.isArray(b.dias_disponiveis) ? b.dias_disponiveis : []).filter(dia => DIAS.includes(dia)),
        observacoes: String(b.observacoes || '').trim() || null
    };
    if (!dados.nome) return { erro: 'Informe o nome da função.' };
    if (!Number.isInteger(dados.qtd_voluntarios) || dados.qtd_voluntarios < 1) return { erro: 'Informe quantos voluntários servem por escala.' };
    if (!Number.isInteger(dados.vagas) || dados.vagas < 0) return { erro: 'Informe a quantidade de vagas da equipe.' };
    return { dados };
}

exports.getFuncoes = async (req, res) => {
    try {
        const funcoes = await Funcoes.listar();
        res.json({
            resumo: {
                total: funcoes.length,
                ativas: funcoes.filter(f => f.ativo).length,
                voluntarios: funcoes.reduce((soma, f) => soma + f.voluntarios, 0),
                com_vagas: funcoes.filter(f => f.ativo && f.vagas_abertas > 0).length
            },
            funcoes
        });
    } catch (error) {
        console.error('Erro ao carregar funções', error);
        responderErro(res, error);
    }
}

exports.novaFuncao = async (req, res) => {
    try {
        const { dados, erro } = dadosDoFormulario(req.body);
        if (erro) return res.status(400).json({ erro });
        res.status(201).json(await Funcoes.criar(dados));
    } catch (error) {
        console.error('Erro ao cadastrar função', error);
        if (error.code === '23505') return res.status(409).json({ erro: 'Já existe uma função com esse nome.' });
        responderErro(res, error);
    }
}

exports.atualizarFuncao = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ erro: 'Função inválida.' });

        const { dados, erro } = dadosDoFormulario(req.body);
        if (erro) return res.status(400).json({ erro });

        const funcao = await Funcoes.atualizar(id, dados);
        if (!funcao) return res.status(404).json({ erro: 'Função não encontrada.' });
        res.json(funcao);
    } catch (error) {
        console.error('Erro ao atualizar função', error);
        if (error.code === '23505') return res.status(409).json({ erro: 'Já existe uma função com esse nome.' });
        responderErro(res, error);
    }
}
