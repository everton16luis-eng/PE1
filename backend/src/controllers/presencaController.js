const Presenca = require('../models/presencaModel');
const { responderErro } = require('../config/erros');

// Busca os membros ativos cadastrados.
exports.getMembros = async (req, res) => {
    try {

        // Chama o model para consultar os membros ativos.
        const membros = await Presenca.selecionaMembros();

        res.json(membros);

    } catch (error) {
        console.error('Erro ao carregar membros:', error);
        responderErro(res, error);
    }
};

// Busca as turmas cadastradas.
exports.getTurmas = async (req, res) => {
    try {

        // Consulta as turmas no banco de dados.
        const turmas = await Presenca.selecionaTurmas();

        res.json(turmas);

    } catch (error) {
        console.error('Erro ao carregar turmas:', error);
        responderErro(res, error);
    }
};

// Cadastra uma nova turma.
exports.novaTurma = async (req, res) => {

    try {
        // Recebe o nome enviado no corpo da requisição,
        // converte para texto e remove espaços das extremidades.
        const nome = String(req.body.nome || '').trim();

        // Verifica se o nome foi informado.
        if (!nome) return res.status(400).json({ erro: 'Informe o nome da turma.' });

        // Envia o nome para o model cadastrar no banco.
        const turma = await Presenca.criarTurma(nome);

        // Retorna status 201, indicando que a turma foi criada.
        res.status(201).json(turma);

    } catch (error) {
        console.error('Erro ao cadastrar turma:', error);

        // O código 23505 do PostgreSQL indica violação de valor único.
        if (error.code === '23505') return res.status(409).json({ erro: 'Já existe uma turma com esse nome.' });

        responderErro(res, error);
    }
};

// Consulta as presenças de uma data específica.
exports.getPresencas = async (req, res) => {
    try {

        // Recebe a data enviada pela URL, usando o parâmetro ?data=.
        const data = req.query.data;

        // Verifica se a data foi informada no formato AAAA-MM-DD.
        if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
            return res.status(400).json({ erro: 'Informe uma data válida no formato AAAA-MM-DD.' });
        }

        // Busca as presenças daquela data no banco.
        const presencas = await Presenca.selecionaPresencas(data);
        res.json(presencas);

    } catch (error) {
        console.error('Erro ao carregar presenças:', error);
        responderErro(res, error);
    }
};

// Registra a entrada de um membro em uma turma.
exports.novaPresenca = async (req, res) => {
    try {

        // Recebe os dados enviados pelo frontend.
        const { id_turma, id_membro, data } = req.body;

        // Confere se os IDs são números inteiros e se a data
        // foi informada no formato AAAA-MM-DD.
        if (!Number.isInteger(Number(id_turma)) || !Number.isInteger(Number(id_membro)) || !data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
            return res.status(400).json({ erro: 'Informe turma, membro e data válidos.' });
        }

        // Converte os IDs para números e chama o model para registrar a entrada.
        const presenca = await Presenca.criarPresenca(Number(id_turma), Number(id_membro), data);
        if (!presenca) return res.status(400).json({ erro: 'O membro selecionado não existe.' });

        // Retorna status 201 e os dados da presença criada.
        res.status(201).json(presenca);

    } catch (error) {

        console.error('Erro ao registrar entrada:', error);

        // O código 23505 indica conflito com uma restrição de valor único.
        if (error.code === '23505') return res.status(409).json({ erro: 'Esse membro já está presente nessa turma nesta data.' });

        // O código 23503 indica violação de chave estrangeira.
        // Pode ocorrer se a turma ou o membro não existir.
        if (error.code === '23503') return res.status(400).json({ erro: 'A turma ou o membro selecionado não existe.' });
        responderErro(res, error);

    }
};

// Registra o horário de saída de uma presença.
exports.registrarSaida = async (req, res) => {
    try {

        // Obtém o ID do registro enviado na URL e converte para número.
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ erro: 'Registro inválido.' });

        const presenca = await Presenca.registrarSaida(id);

        // Se não encontrar o registro ou a saída já tiver sido registrada,
        // retorna status 404.
        if (!presenca) return res.status(404).json({ erro: 'Registro não encontrado ou saída já registrada.' });
        res.json(presenca);

    } catch (error) {
    
        console.error('Erro ao registrar saída:', error);
        responderErro(res, error);
    }
};
