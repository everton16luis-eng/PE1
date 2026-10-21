const express = require('express');
const router = express.Router();
const voluntariosController = require('../controllers/voluntariosController');
const { exigirPermissao } = require('../middlewares/autenticacao');

const gestao = exigirPermissao('voluntarios');

router.get('/voluntarios', gestao, voluntariosController.getVoluntarios);
router.get('/voluntarios/candidatos', gestao, voluntariosController.getCandidatos);
router.post('/voluntarios', gestao, voluntariosController.novoVoluntario);
router.patch('/voluntarios/:id/status', gestao, voluntariosController.alterarStatus);

// Ficha do voluntário
router.get('/voluntarios/:id', gestao, voluntariosController.getFicha);
router.put('/voluntarios/:id', gestao, voluntariosController.atualizarVoluntario);
router.patch('/voluntarios/:id/escalas/:idEscala', gestao, voluntariosController.responderEscala);
router.delete('/voluntarios/:id/escalas/:idEscala', gestao, voluntariosController.removerDaEscala);
router.post('/voluntarios/:id/ausencias', gestao, voluntariosController.novaAusencia);
router.delete('/voluntarios/:id/ausencias/:idAusencia', gestao, voluntariosController.removerAusencia);
router.post('/voluntarios/:id/acesso', gestao, voluntariosController.criarAcesso);
router.patch('/voluntarios/:id/acesso', gestao, voluntariosController.alterarAcesso);

module.exports = router;
