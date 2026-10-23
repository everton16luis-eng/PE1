const express = require('express');
const router = express.Router();
const atendimentoController = require('../controllers/atendimentoController');
const gestor = atendimentoController.exigirGestor;

// Operação das turmas: voluntário vinculado à turma ou gestão das crianças
// (a autorização de cada turma/sessão é conferida no controller)
router.get('/atendimento/turmas', atendimentoController.listarTurmas);
router.post('/atendimento/turmas/:id/sessoes', atendimentoController.abrirSessao);
router.get('/atendimento/sessoes/:id', atendimentoController.verSessao);
router.get('/atendimento/sessoes/:id/criancas', atendimentoController.buscarCriancas);
router.get('/atendimento/sessoes/:id/criancas/:idCrianca', atendimentoController.perfilCrianca);
router.post('/atendimento/sessoes/:id/entradas', atendimentoController.registrarEntrada);
router.post('/atendimento/sessoes/:id/conferir', atendimentoController.conferirCodigo);
router.post('/atendimento/sessoes/:id/encerrar', atendimentoController.encerrarSessao);
router.post('/atendimento/atendimentos/:id/saida', atendimentoController.registrarSaida);
router.get('/atendimento/atendimentos/:id/etiqueta', atendimentoController.etiqueta);
router.post('/atendimento/atendimentos/:id/etiqueta/impressao', atendimentoController.registrarImpressao);
router.post('/atendimento/atendimentos/:id/etiqueta/segunda-via', atendimentoController.segundaVia);

// Administração (gestão das crianças)
router.get('/atendimento/admin/sessoes', gestor, atendimentoController.listarSessoes);
router.get('/atendimento/admin/sessoes/:id/historico', gestor, atendimentoController.historicoDaSessao);
router.post('/atendimento/admin/sessoes/:id/encerrar', gestor, atendimentoController.encerrarAdministrativo);
router.get('/atendimento/admin/alertas', gestor, atendimentoController.listarAlertas);
router.get('/atendimento/admin/alertas/:id', gestor, atendimentoController.verAlerta);
router.post('/atendimento/admin/alertas/:id/tratar', gestor, atendimentoController.tratarAlerta);
router.get('/atendimento/admin/turmas/:id/voluntarios', gestor, atendimentoController.voluntariosDaTurma);
router.put('/atendimento/admin/turmas/:id/voluntarios', gestor, atendimentoController.definirVoluntarios);

module.exports = router;
