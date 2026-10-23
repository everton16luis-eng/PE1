const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
const express = require('express');
const cors = require('cors');

const { exigirLogin, restringirAreaDeGestao } = require('./middlewares/autenticacao');
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const eventosRoutes = require('./routes/eventoRoutes');
const presencaRoutes = require('./routes/presencaRoutes');
const participantesRoutes = require('./routes/participantesRoutes');
const voluntariosRoutes = require('./routes/voluntariosRoutes');
const funcoesRoutes = require('./routes/funcoesRoutes');
const escalasRoutes = require('./routes/escalasRoutes');
const criancasRoutes = require('./routes/criancasRoutes');
const usuariosRoutes = require('./routes/usuariosRoutes');
const configuracoesRoutes = require('./routes/configuracoesRoutes');
const relatoriosRoutes = require('./routes/relatoriosRoutes');
const { iniciarBackupAutomatico } = require('./controllers/configuracoesController');

const frontEnd = path.join(__dirname, '../../frontend');
const app = express();
const PORT = process.env.PORT || 3000;

// Cabeçalhos de segurança (não revela o Express, impede o site de ser
// embutido em outro site e o navegador de "adivinhar" tipos de arquivo)
app.disable('x-powered-by');
app.use((req, res, next) => {
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'same-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    });
    if (req.path.startsWith('/api')) res.set('Cache-Control', 'no-store');
    next();
});

app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(express.static(frontEnd, { dotfiles: 'deny' }));

// Login e cadastro são públicos; o restante da API exige token
app.use('/api', authRoutes);
app.use('/api', exigirLogin);
app.use('/api', restringirAreaDeGestao);
app.use('/api', require('./routes/portalRoutes'));
app.use('/api', require('./routes/notificacoesRoutes'));

app.use('/api', dashboardRoutes);
app.use('/api', eventosRoutes);
app.use('/api', presencaRoutes);
app.use('/api', participantesRoutes);
app.use('/api', voluntariosRoutes);
app.use('/api', funcoesRoutes);
app.use('/api', escalasRoutes);
app.use('/api', criancasRoutes);
app.use('/api', usuariosRoutes);
app.use('/api', configuracoesRoutes);
app.use('/api', relatoriosRoutes);

// Rota de API inexistente
app.use('/api', (req, res) => {
    res.status(404).json({ erro: 'Rota não encontrada.' });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(frontEnd, 'index.html'));
});

// JSON inválido, corpo grande demais ou erro não tratado (sem detalhes internos)
app.use((error, req, res, next) => {
    const status = error.status || 500;
    if (status >= 500) console.error('Erro não tratado:', error);
    const mensagens = { 400: 'Requisição inválida.', 413: 'Os dados enviados são grandes demais.' };
    res.status(status).json({ erro: mensagens[status] || (status < 500 ? 'Requisição não aceita.' : 'Erro interno. Tente novamente em instantes.') });
});

// Os testes importam o app e sobem o servidor numa porta própria
if (require.main === module) {
    app.listen(PORT, "0.0.0.0", () => {
        console.log(`API rodando em http://localhost:${PORT}`);
        iniciarBackupAutomatico();
        require('./config/notificacoes').iniciarLembretes();
    });
}

module.exports = app;
