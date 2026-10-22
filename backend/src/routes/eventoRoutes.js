const express = require('express');
const router = express.Router()
const eventosControler = require('../controllers/eventosController')
const { exigirPermissao } = require('../middlewares/autenticacao')

// Listas de apoio (formulários e dashboard): equipe de gestão
router.get('/funcoes', eventosControler.getAllFuncoes);
router.get('/voluntariosDisponiveis', eventosControler.getAllvoluntariosDisponiveis)
router.get('/eventosDisponiveis', eventosControler.getAlleventosDisponiveis)

// Página Eventos: criar, listar (próximos e realizados), detalhar, editar e remover.
// Eventos que já terminaram são somente leitura (o controller recusa editar/remover).
router.post('/novoEvento', exigirPermissao('escalas'), eventosControler.novoEvento)
router.get('/eventos', exigirPermissao('escalas'), eventosControler.getTodosEventos)
router.get('/eventos/:id', exigirPermissao('escalas'), eventosControler.getDetalhesEvento)
router.put('/eventos/:id', exigirPermissao('escalas'), eventosControler.atualizarEvento)
router.delete('/eventos/:id', exigirPermissao('escalas'), eventosControler.removerEvento)

module.exports = router
