const express = require('express');
const router = express.Router();
const configuracoesController = require('../controllers/configuracoesController');
const { exigirPerfil } = require('../middlewares/autenticacao');

router.get('/configuracoes', configuracoesController.getConfiguracoes);
router.put('/configuracoes', exigirPerfil('ADMINISTRADOR'), configuracoesController.salvarConfiguracoes);
router.post('/configuracoes/backup', exigirPerfil('ADMINISTRADOR'), configuracoesController.fazerBackup);

module.exports = router;
