const express = require('express');
const router = express.Router();
const participantesController = require('../controllers/participantesController');
const { exigirPermissao } = require('../middlewares/autenticacao');

router.get('/participantes', exigirPermissao('participantes'), participantesController.getParticipantes);
router.post('/participantes', exigirPermissao('participantes'), participantesController.novoParticipante);

module.exports = router;
