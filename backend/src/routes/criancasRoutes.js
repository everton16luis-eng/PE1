const express = require('express');
const router = express.Router();
const criancasController = require('../controllers/criancasController');
const { exigirPermissao } = require('../middlewares/autenticacao');

router.get('/criancas', exigirPermissao('criancas'), criancasController.getCriancas);
router.post('/criancas', exigirPermissao('criancas'), criancasController.novaCrianca);
router.get('/criancas/:id/responsaveis', exigirPermissao('criancas'), criancasController.responsaveis);
router.post('/criancas/:id/responsaveis', exigirPermissao('criancas'), criancasController.adicionarResponsavel);
router.patch('/criancas/:id/responsaveis/:idResponsavel', exigirPermissao('criancas'), criancasController.definirAutorizacao);

router.get('/turmas', exigirPermissao('criancas'), criancasController.getTurmas);
router.post('/turmas', exigirPermissao('criancas'), criancasController.novaTurma);
router.put('/turmas/:id', exigirPermissao('criancas'), criancasController.atualizarTurma);
router.delete('/turmas/:id', exigirPermissao('criancas'), criancasController.excluirTurma);

module.exports = router;
