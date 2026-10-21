const express = require('express');
const router = express.Router();
const portalController = require('../controllers/portalController');

// Portal do voluntário (só exige login; tudo é do próprio usuário)
router.get('/portal', portalController.getMinhaArea);
router.patch('/portal/escalas/:idEscala', portalController.responderEscala);
router.put('/portal/preferencias', portalController.salvarPreferencias);
router.post('/portal/ausencias', portalController.novaAusencia);
router.delete('/portal/ausencias/:idAusencia', portalController.removerAusencia);
router.put('/portal/senha', portalController.trocarSenha);

module.exports = router;
