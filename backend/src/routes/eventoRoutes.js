const express = require('express');
const router = express.Router()
const eventosControler = require('../controllers/eventosController')

router.get('/funcoes', eventosControler.getAllFuncoes);
router.get('/voluntariosDisponiveis', eventosControler.getAllvoluntariosDisponiveis)
router.post('/novoEvento', eventosControler.novoEvento)
router.get('/eventosDisponiveis', eventosControler.getAlleventosDisponiveis)

module.exports = router