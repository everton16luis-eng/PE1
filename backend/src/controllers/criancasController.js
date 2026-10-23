const Criancas = require('../models/criancasModel');
const { responderErro } = require('../config/erros');
const Turmas = require('../models/turmasModel');

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}(:\d{2})?$/;
const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const PARENTESCOS = { mae: 'Mãe', pai: 'Pai', avo: 'Avó/Avô', tio: 'Tia/Tio', responsavel: 'Outro responsável' };
const texto = valor => String(valor ?? '').trim() || null;

// ---------------------------------------------------------
// Crianças
// ---------------------------------------------------------
exports.getCriancas = async (req, res) => {
    try {
        const [resumo, criancas, turmas] = await Promise.all([Criancas.resumo(), Criancas.listar(), Turmas.listar()]);
        res.json({ resumo, criancas, turmas });
    } catch (error) {
        console.error('Erro ao carregar crianças', error);
        responderErro(res, error);
    }
}

exports.novaCrianca = async (req, res) => {
    try {
        const b = req.body;
        const r = b.responsavel || {};
        const dados = {
            // Pessoa já cadastrada (completar a ficha) ou nova pessoa (nome + nascimento)
            id_membro: Number.isInteger(Number(b.id_membro)) && Number(b.id_membro) > 0 ? Number(b.id_membro) : null,
            nome: texto(b.nome),
            data_nascimento: DATA.test(b.data_nascimento || '') ? b.data_nascimento : null,
            sexo: ['feminino', 'masculino'].includes(b.sexo) ? b.sexo : null,
            ativo: b.ativo !== false,
            id_turma: Number(b.id_turma) || null,
            data_cadastro: DATA.test(b.data_cadastro || '') ? b.data_cadastro : new Date().toISOString().slice(0, 10),
            alergias: texto(b.alergias),
            observacoes: texto(b.observacoes),
            autorizacao_responsavel: Boolean(b.autorizacao_responsavel),
            autorizacao_imagem: Boolean(b.autorizacao_imagem),
            responsavel: {
                nome: texto(r.nome),
                parentesco: PARENTESCOS[r.parentesco] || null,
                telefone: texto(r.telefone),
                email: texto(r.email),
                // Buscar a criança na turma: só quem a equipe marcar
                autorizado_retirada: r.autorizado_retirada === true
            },
            id_usuario: req.usuario.id_usuario
        };

        if (b.id_membro != null && b.id_membro !== '' && !dados.id_membro) return res.status(400).json({ erro: 'Pessoa inválida.' });
        if (!dados.id_membro) {
            if (!dados.nome || !dados.data_nascimento) return res.status(400).json({ erro: 'Informe nome e data de nascimento.' });
            const hoje = new Date();
            const limite = new Date(hoje.getFullYear() - 18, hoje.getMonth(), hoje.getDate()).toLocaleDateString('sv-SE');
            if (dados.data_nascimento > hoje.toLocaleDateString('sv-SE')) return res.status(400).json({ erro: 'A data de nascimento não pode ser no futuro.' });
            if (dados.data_nascimento <= limite) {
                return res.status(400).json({ erro: 'Crianças são pessoas com menos de 18 anos. Para adultos, use o Cadastro em Participantes.' });
            }
        }
        if (!dados.sexo) return res.status(400).json({ erro: 'Selecione o sexo.' });
        if (!dados.responsavel.nome || !dados.responsavel.parentesco || !dados.responsavel.telefone) {
            return res.status(400).json({ erro: 'Informe nome, parentesco e telefone do responsável.' });
        }
        if (!dados.id_turma) return res.status(400).json({ erro: 'Selecione a turma.' });
        if (!dados.autorizacao_responsavel) return res.status(400).json({ erro: 'É necessário confirmar a autorização do responsável.' });

        const crianca = await Criancas.criar(dados);
        if (crianca.erro) return res.status(crianca.status).json({ erro: crianca.erro });
        res.status(201).json(crianca);
    } catch (error) {
        console.error('Erro ao cadastrar criança', error);
        if (error.code === '23503') return res.status(400).json({ erro: 'A turma selecionada não existe.' });
        responderErro(res, error);
    }
}

// ---------------------------------------------------------
// Responsáveis e autorização de retirada (quem pode buscar a criança na turma)
// ---------------------------------------------------------
const idValido = valor => Number.isInteger(Number(valor)) && Number(valor) > 0;

exports.responsaveis = async (req, res) => {
    try {
        if (!idValido(req.params.id)) return res.status(400).json({ erro: 'Criança inválida.' });
        const dados = await Criancas.responsaveis(Number(req.params.id));
        if (!dados) return res.status(404).json({ erro: 'Criança não encontrada.' });
        res.json(dados);
    } catch (error) {
        console.error('Erro ao listar responsáveis', error);
        responderErro(res, error);
    }
}

exports.adicionarResponsavel = async (req, res) => {
    try {
        if (!idValido(req.params.id)) return res.status(400).json({ erro: 'Criança inválida.' });
        const b = req.body || {};
        const dados = {
            nome: texto(b.nome)?.slice(0, 150), parentesco: PARENTESCOS[b.parentesco] || null,
            telefone: texto(b.telefone)?.slice(0, 30), email: texto(b.email)?.slice(0, 150),
            autorizado_retirada: b.autorizado_retirada === true
        };
        if (!dados.nome || !dados.parentesco || !dados.telefone) return res.status(400).json({ erro: 'Informe nome, parentesco e telefone.' });
        if (dados.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) return res.status(400).json({ erro: 'E-mail inválido.' });
        const novo = await Criancas.adicionarResponsavel(Number(req.params.id), dados, req.usuario.id_usuario);
        if (!novo) return res.status(404).json({ erro: 'Criança não encontrada.' });
        res.status(201).json(novo);
    } catch (error) {
        console.error('Erro ao adicionar responsável', error);
        responderErro(res, error);
    }
}

exports.definirAutorizacao = async (req, res) => {
    try {
        if (!idValido(req.params.id) || !idValido(req.params.idResponsavel)) return res.status(400).json({ erro: 'Dados inválidos.' });
        if (typeof req.body?.autorizado_retirada !== 'boolean') return res.status(400).json({ erro: 'Informe se a pessoa está autorizada.' });
        const ok = await Criancas.definirAutorizacao(Number(req.params.id), Number(req.params.idResponsavel), req.body.autorizado_retirada, req.usuario.id_usuario);
        if (!ok) return res.status(404).json({ erro: 'Responsável não vinculado a esta criança.' });
        res.json({ mensagem: req.body.autorizado_retirada ? 'Autorizado a buscar a criança.' : 'Autorização de retirada removida.' });
    } catch (error) {
        console.error('Erro ao alterar autorização', error);
        responderErro(res, error);
    }
}

// ---------------------------------------------------------
// Turmas
// ---------------------------------------------------------
function dadosDaTurma(b) {
    const dados = {
        nome: texto(b.nome),
        idade_minima: b.idade_minima === '' || b.idade_minima == null ? null : Number(b.idade_minima),
        idade_maxima: b.idade_maxima === '' || b.idade_maxima == null ? null : Number(b.idade_maxima),
        id_membro_responsavel: Number(b.id_membro_responsavel) || null,
        dia_semana: DIAS_SEMANA.includes(b.dia_semana) ? b.dia_semana : null,
        horario: HORA.test(b.horario || '') ? b.horario : null,
        ativo: b.ativo !== false,
        observacoes: texto(b.observacoes)
    };
    if (!dados.nome) return { erro: 'Informe o nome da turma.' };
    if (!Number.isInteger(dados.idade_minima) || !Number.isInteger(dados.idade_maxima) || dados.idade_minima < 0 || dados.idade_maxima < dados.idade_minima) {
        return { erro: 'Informe uma faixa etária válida (idade mínima até a máxima).' };
    }
    if (!dados.dia_semana || !dados.horario) return { erro: 'Informe o dia da semana e o horário.' };
    return { dados };
}

exports.getTurmas = async (req, res) => {
    try {
        const [turmas, responsaveis] = await Promise.all([Turmas.listar(), Turmas.possiveisResponsaveis()]);
        res.json({
            resumo: {
                total: turmas.length,
                ativas: turmas.filter(t => t.ativo).length,
                criancas: turmas.reduce((soma, t) => soma + t.criancas, 0),
                responsaveis: new Set(turmas.map(t => t.id_membro_responsavel).filter(Boolean)).size
            },
            turmas,
            responsaveis
        });
    } catch (error) {
        console.error('Erro ao carregar turmas', error);
        responderErro(res, error);
    }
}

exports.novaTurma = async (req, res) => {
    try {
        const { dados, erro } = dadosDaTurma(req.body);
        if (erro) return res.status(400).json({ erro });
        res.status(201).json(await Turmas.criar(dados));
    } catch (error) {
        console.error('Erro ao cadastrar turma', error);
        if (error.code === '23505') return res.status(409).json({ erro: 'Já existe uma turma com esse nome.' });
        responderErro(res, error);
    }
}

exports.atualizarTurma = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ erro: 'Turma inválida.' });

        const { dados, erro } = dadosDaTurma(req.body);
        if (erro) return res.status(400).json({ erro });

        const turma = await Turmas.atualizar(id, dados);
        if (!turma) return res.status(404).json({ erro: 'Turma não encontrada.' });
        res.json(turma);
    } catch (error) {
        console.error('Erro ao atualizar turma', error);
        if (error.code === '23505') return res.status(409).json({ erro: 'Já existe uma turma com esse nome.' });
        responderErro(res, error);
    }
}

exports.excluirTurma = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ erro: 'Turma inválida.' });

        const resultado = await Turmas.excluir(id);
        if (resultado.emUso) {
            return res.status(409).json({
                erro: `A turma tem ${resultado.emUso.criancas} criança(s) e ${resultado.emUso.presencas} presença(s) registradas. Em vez de excluir, marque-a como inativa.`
            });
        }
        if (!resultado.excluida) return res.status(404).json({ erro: 'Turma não encontrada.' });
        res.json({ mensagem: 'Turma excluída.' });
    } catch (error) {
        console.error('Erro ao excluir turma', error);
        responderErro(res, error);
    }
}
