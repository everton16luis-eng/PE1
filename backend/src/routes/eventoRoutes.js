const express = require('express');
const router = express.Router()
const eventosControler = require('../controllers/eventosController')
const { exigirPermissao } = require('../middlewares/autenticacao')

router.get('/funcoes', eventosControler.getAllFuncoes);
router.get('/voluntariosDisponiveis', eventosControler.getAllvoluntariosDisponiveis)
router.post('/novoEvento', eventosControler.novoEvento)
router.get('/eventosDisponiveis', eventosControler.getAlleventosDisponiveis)
router.get('/eventos', eventosControler.getTodosEventos)
// Editar e remover eventos (página Eventos → Gerenciar eventos)
router.put('/eventos/:id', exigirPermissao('escalas'), eventosControler.atualizarEvento)
router.delete('/eventos/:id', exigirPermissao('escalas'), eventosControler.removerEvento)

module.exports = router