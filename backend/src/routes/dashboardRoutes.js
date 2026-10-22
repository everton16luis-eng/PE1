const express = require('express');
const router = express.Router()
const dashboardControler = require('../controllers/dashboardController')
const { exigirPermissao } = require('../middlewares/autenticacao')

// Leitura: equipe de gestão (o restringirAreaDeGestao do server.js já barra os demais)
router.get('/dashboardPessoas', dashboardControler.getAllPessoas);
router.get('/escalasSemana', dashboardControler.getEscalasSemana);
router.get('/confirmacoesPendentes', dashboardControler.getConfirmacoesPendentes);
router.get('/graficoConfirmacoes', dashboardControler.getGraficoConfirmacoes);
// Rotas legadas de criação: exigem a área correspondente
router.post('/criarEvento', exigirPermissao('escalas'), dashboardControler.criarEvento);
router.post('/criarFuncao', exigirPermissao('voluntarios'), dashboardControler.criarFuncao);

module.exports = router
