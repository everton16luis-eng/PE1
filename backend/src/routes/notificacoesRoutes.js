const express = require('express');
const router = express.Router();
const notificacoesController = require('../controllers/notificacoesController');

// Avisos e aparelhos do próprio login (qualquer perfil, inclusive voluntário)
router.get('/notificacoes', notificacoesController.listar);
router.post('/notificacoes/lidas', notificacoesController.marcarTodasLidas);
router.delete('/notificacoes/lidas', notificacoesController.limparLidas);
router.post('/notificacoes/:id/lida', notificacoesController.marcarLida);
router.get('/notificacoes/push/chave', notificacoesController.chave);
router.post('/notificacoes/push', notificacoesController.inscrever);
router.delete('/notificacoes/push', notificacoesController.cancelar);
router.post('/notificacoes/push/teste', notificacoesController.testar);

module.exports = router;
