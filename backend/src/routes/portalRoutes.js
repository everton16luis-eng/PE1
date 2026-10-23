const express = require('express');
const router = express.Router();
const portalController = require('../controllers/portalController');

// Portal do voluntário (só exige login; tudo é do próprio usuário)
router.get('/portal', portalController.getMinhaArea);
router.patch('/portal/escalas/:idEscala', portalController.responderEscala);
// Passar a própria vaga para outro voluntário disponível (sem depender da equipe)
router.get('/portal/escalas/:idEscala/substitutos', portalController.substitutos);
router.post('/portal/escalas/:idEscala/passar', portalController.passarVaga);
router.put('/portal/preferencias', portalController.salvarPreferencias);
router.post('/portal/ausencias', portalController.novaAusencia);
router.delete('/portal/ausencias/:idAusencia', portalController.removerAusencia);
router.put('/portal/senha', portalController.trocarSenha);

module.exports = router;
