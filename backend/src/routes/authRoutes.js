const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { exigirLogin } = require('../middlewares/autenticacao');

router.post('/auth/login', authController.login);
router.post('/auth/registro', authController.registro);
router.get('/auth/me', exigirLogin, authController.me);

module.exports = router;
