const express = require('express');
const router = express.Router()
const eventosControler = require('../controllers/eventosController')

router.get('/funcoes', eventosControler.getAllFuncoes);
router.get('/voluntariosDisponiveis', eventosControler.getAllvoluntariosDisponiveis)

module.exports = router