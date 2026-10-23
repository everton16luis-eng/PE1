const Notificacoes = require('../models/notificacoesModel');
const Servico = require('../config/notificacoes');
const { responderErro } = require('../config/erros');

// Tudo aqui é do próprio login (o id vem do token, nunca do navegador)
const idValido = valor => Number.isInteger(Number(valor)) && Number(valor) > 0;
const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

exports.listar = async (req, res) => {
    try {
        const [dados, aparelhos] = await Promise.all([
            Notificacoes.listar(req.usuario.id_usuario),
            Notificacoes.totalAparelhos(req.usuario.id_usuario)
        ]);
        res.json({ ...dados, aparelhos, push_disponivel: Servico.pushConfigurado });
    } catch (error) {
        console.error('Erro ao carregar notificações', error);
        responderErro(res, error);
    }
}

exports.marcarLida = async (req, res) => {
    try {
        if (!idValido(req.params.id)) return res.status(400).json({ erro: 'Aviso inválido.' });
        const ok = await Notificacoes.marcarLida(req.usuario.id_usuario, Number(req.params.id));
        if (!ok) return res.status(404).json({ erro: 'Aviso não encontrado.' });
        res.json({ ok: true });
    } catch (error) {
        console.error('Erro ao marcar aviso como lido', error);
        responderErro(res, error);
    }
}

exports.marcarTodasLidas = async (req, res) => {
    try {
        await Notificacoes.marcarTodasLidas(req.usuario.id_usuario);
        res.json({ ok: true });
    } catch (error) {
        console.error('Erro ao marcar avisos como lidos', error);
        responderErro(res, error);
    }
}

exports.limparLidas = async (req, res) => {
    try {
        const removidos = await Notificacoes.limparLidas(req.usuario.id_usuario);
        res.json({ ok: true, removidos });
    } catch (error) {
        console.error('Erro ao limpar avisos lidos', error);
        responderErro(res, error);
    }
}

// Chave pública VAPID (o navegador precisa dela para ativar o push)
exports.chave = (req, res) => {
    res.json({ chave: Servico.CHAVE_PUBLICA, disponivel: Servico.pushConfigurado });
}

// Ativa as notificações neste aparelho
exports.inscrever = async (req, res) => {
    try {
        if (!Servico.pushConfigurado) return res.status(503).json({ erro: 'As notificações no aparelho ainda não foram configuradas no servidor.' });
        const s = req.body?.inscricao || {};
        const endpoint = typeof s.endpoint === 'string' ? s.endpoint : '';
        const p256dh = typeof s.keys?.p256dh === 'string' ? s.keys.p256dh : '';
        const auth = typeof s.keys?.auth === 'string' ? s.keys.auth : '';
        // Serviços de push dos navegadores sempre usam https
        let url;
        try { url = new URL(endpoint); } catch { url = null; }
        if (!url || url.protocol !== 'https:' || endpoint.length > 1000) return res.status(400).json({ erro: 'Inscrição inválida.' });
        if (!BASE64URL.test(p256dh) || !BASE64URL.test(auth) || p256dh.length > 200 || auth.length > 100) {
            return res.status(400).json({ erro: 'Inscrição inválida.' });
        }
        const aparelho = typeof req.body?.aparelho === 'string' ? req.body.aparelho.slice(0, 200) : null;
        await Notificacoes.inscrever(req.usuario.id_usuario, { endpoint, p256dh, auth, aparelho });
        res.status(201).json({ ok: true });
    } catch (error) {
        console.error('Erro ao ativar notificações', error);
        responderErro(res, error);
    }
}

// Desativa as notificações neste aparelho
exports.cancelar = async (req, res) => {
    try {
        const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : '';
        if (!endpoint) return res.status(400).json({ erro: 'Informe o aparelho.' });
        await Notificacoes.cancelar(req.usuario.id_usuario, endpoint);
        res.json({ ok: true });
    } catch (error) {
        console.error('Erro ao desativar notificações', error);
        responderErro(res, error);
    }
}

// Envia um aviso de teste para o próprio login
exports.testar = async (req, res) => {
    try {
        await Servico.avisar([req.usuario.id_usuario], {
            tipo: 'teste', rota: null,
            titulo: 'Notificações ativadas',
            mensagem: 'Tudo certo! Você vai receber os avisos da igreja neste aparelho.'
        });
        res.json({ ok: true });
    } catch (error) {
        console.error('Erro ao enviar aviso de teste', error);
        responderErro(res, error);
    }
}
