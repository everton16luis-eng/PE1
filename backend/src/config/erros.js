// Responde erros inesperados sem expor detalhes internos do banco.
// O erro completo continua no log do servidor (console.error do controller).

const ERROS_DE_ENTRADA = {
    '22001': 'Um dos campos passou do tamanho permitido.',
    '22003': 'Um dos números está fora do intervalo permitido.',
    '22007': 'Uma das datas ou horários está em formato inválido.',
    '22008': 'Uma das datas ou horários está fora do intervalo permitido.',
    '22P02': 'Algum valor está em formato inválido.',
    '23502': 'Faltou preencher um campo obrigatório.',
    '23514': 'Algum valor não é permitido.'
};

function responderErro(res, error) {
    const mensagem = ERROS_DE_ENTRADA[error?.code];
    if (mensagem) return res.status(400).json({ erro: mensagem });
    return res.status(500).json({ erro: 'Erro interno. Tente novamente em instantes.' });
}

module.exports = { responderErro };
