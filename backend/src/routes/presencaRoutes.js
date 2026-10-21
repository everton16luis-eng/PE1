const express = require('express');
const router = express.Router();
const presencaController = require('../controllers/presencaController');

// Busca os membros ativos cadastrados no banco de dados.
router.get('/presenca/membros', presencaController.getMembros);

// Busca as turmas cadastradas no banco de dados.
router.get('/presenca/turmas', presencaController.getTurmas);

// Cadastra uma nova turma no banco de dados.
router.post('/presenca/turmas', presencaController.novaTurma);

// Consulta os registros de presença de uma data (?data=AAAA-MM-DD).
router.get('/presenca', presencaController.getPresencas);

// Registra uma nova presença.
router.post('/presenca', presencaController.novaPresenca);

// Registra o horário de saída de uma presença específica.
// O parâmetro :id identifica o registro de presença que será atualizado.
router.patch('/presenca/:id/saida', presencaController.registrarSaida);

module.exports = router;
