const express = require('express');
const router = express.Router();
const usuariosController = require('../controllers/usuariosController');
const { exigirPermissao } = require('../middlewares/autenticacao');

router.get('/usuarios', exigirPermissao('usuarios'), usuariosController.getUsuarios);
router.post('/usuarios', exigirPermissao('usuarios'), usuariosController.novoUsuario);
router.put('/usuarios/:id', exigirPermissao('usuarios'), usuariosController.atualizarUsuario);

module.exports = router;
