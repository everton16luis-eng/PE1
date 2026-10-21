const express = require('express');
const router = express.Router();
const funcoesController = require('../controllers/funcoesController');
const { exigirPermissao } = require('../middlewares/autenticacao');

// GET /funcoes (lista simples) continua em eventoRoutes, usado pelo formulário de eventos
router.get('/funcoes/gestao', exigirPermissao('voluntarios'), funcoesController.getFuncoes);
router.post('/funcoes', exigirPermissao('voluntarios'), funcoesController.novaFuncao);
router.put('/funcoes/:id', exigirPermissao('voluntarios'), funcoesController.atualizarFuncao);

module.exports = router;
