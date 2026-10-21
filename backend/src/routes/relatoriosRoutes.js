const express = require('express');
const router = express.Router();
const relatoriosController = require('../controllers/relatoriosController');
const { exigirPermissao } = require('../middlewares/autenticacao');

router.get('/relatorios', exigirPermissao('relatorios'), relatoriosController.getResumo);
router.get('/relatorios/:tipo', exigirPermissao('relatorios'), relatoriosController.getDados);
router.post('/relatorios/historico', exigirPermissao('relatorios'), relatoriosController.registrar);

module.exports = router;
