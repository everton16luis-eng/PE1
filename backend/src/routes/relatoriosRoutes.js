const express = require('express');
const router = express.Router();
const relatoriosController = require('../controllers/relatoriosController');
const { exigirPermissao } = require('../middlewares/autenticacao');

const relatorios = exigirPermissao('relatorios');

router.get('/relatorios', relatorios, relatoriosController.getResumo);
// Relatório por evento (lista de eventos e pré-visualização dos dados)
router.get('/relatorios/eventos', relatorios, relatoriosController.getEventos);
router.get('/relatorios/evento/:id', relatorios, relatoriosController.getRelatorioEvento);
// Gera no servidor, guarda o arquivo e registra no histórico
router.post('/relatorios/gerar', relatorios, relatoriosController.gerar);
// Arquivo guardado de um relatório do histórico (Visualizar / Download)
router.get('/relatorios/historico/:id/arquivo', relatorios, relatoriosController.getArquivo);
router.get('/relatorios/:tipo', relatorios, relatoriosController.getDados);

module.exports = router;
