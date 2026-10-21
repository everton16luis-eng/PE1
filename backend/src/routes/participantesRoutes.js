const express = require('express');
const router = express.Router();
const participantesController = require('../controllers/participantesController');
const { exigirPermissao, exigirPerfil } = require('../middlewares/autenticacao');

const gestao = exigirPermissao('participantes');
const administrador = exigirPerfil('ADMINISTRADOR');

router.get('/participantes', gestao, participantesController.getParticipantes);
// Cadastro: sempre como visitante
router.post('/participantes', gestao, participantesController.novoParticipante);

// Classificação: só o administrador
// (o :id é o da pessoa na base universal)
router.post('/participantes/:id/membro', gestao, administrador, participantesController.promoverAMembro);
router.patch('/participantes/:id', gestao, administrador, participantesController.atualizarMembro);

module.exports = router;
