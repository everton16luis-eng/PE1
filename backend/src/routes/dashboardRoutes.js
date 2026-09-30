const express = require('express');
const router = express.Router()
const dashboardControler = require('../controllers/dashboardController')

router.get('/dashboardPessoas', dashboardControler.getAllPessoas);
router.get('/escalasSemana', dashboardControler.getEscalasSemana);
router.post('/criarEvento', dashboardControler.criarEvento);
router.post('/criarFuncao', dashboardControler.criarFuncao);

module.exports = router
