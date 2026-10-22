const express = require('express');
const router = express.Router();
const presencaController = require('../controllers/presencaController');
const { exigirPermissao, exigirAlgumaPermissao } = require('../middlewares/autenticacao');

// Lista de presença = área Crianças (a lista de turmas também alimenta os filtros de Relatórios)
const criancas = exigirPermissao('criancas');

// Busca os membros ativos cadastrados no banco de dados.
router.get('/presenca/membros', criancas, presencaController.getMembros);

// Busca as turmas cadastradas no banco de dados.
router.get('/presenca/turmas', exigirAlgumaPermissao('criancas', 'relatorios'), presencaController.getTurmas);

// Cadastra uma nova turma no banco de dados.
router.post('/presenca/turmas', criancas, presencaController.novaTurma);

// Consulta os registros de presença de uma data (?data=AAAA-MM-DD).
router.get('/presenca', criancas, presencaController.getPresencas);

// Registra uma nova presença.
router.post('/presenca', criancas, presencaController.novaPresenca);

// Registra o horário de saída de uma presença específica.
// O parâmetro :id identifica o registro de presença que será atualizado.
router.patch('/presenca/:id/saida', criancas, presencaController.registrarSaida);

module.exports = router;
