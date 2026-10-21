const express = require('express');
const router = express.Router();
const escalasController = require('../controllers/escalasController');
const { exigirPermissao } = require('../middlewares/autenticacao');

router.get('/escalas/calendario', exigirPermissao('escalas'), escalasController.getCalendario);
router.get('/escalas/dia', exigirPermissao('escalas'), escalasController.getDia);
router.get('/escalas/voluntarios', exigirPermissao('escalas'), escalasController.getVoluntariosDaFuncao);
router.post('/escalas', exigirPermissao('escalas'), escalasController.novaEscala);
router.patch('/escalas/:id/participantes/:idVoluntario', exigirPermissao('escalas'), escalasController.confirmarParticipante);

module.exports = router;
