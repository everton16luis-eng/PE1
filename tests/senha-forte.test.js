// =========================================================
// Senha forte (minúscula, maiúscula, número, símbolo e 8+ caracteres)
// obrigatória em toda senha NOVA, e atualização automática do hash
// antigo do scrypt no login (sem ninguém precisar trocar a senha).
// =========================================================

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { iniciar, encerrar, api, criarUsuario, pool, SENHA, TODAS } = require('./apoio');

// Cada senha fraca e o requisito que falta nela
const FRACAS = [
    ['Ab1!', /8 caracteres/],
    ['SENHAFORTE@1', /minúscula/],
    ['senhaforte@1', /maiúscula/],
    ['SenhaForte@', /número/],
    ['SenhaForte1', /símbolo/]
];
const FORTE = 'Igreja@2026';

let admin;
const emailNovo = prefixo => `${prefixo}.${crypto.randomBytes(4).toString('hex')}@exemplo.test`;
const hashDe = async email => (await pool.query('SELECT senha_hash FROM usuarios WHERE email = $1', [email])).rows[0]?.senha_hash;

before(async () => {
    await iniciar();
    admin = await criarUsuario({ perfil: 'ADMINISTRADOR', permissoes: TODAS });
});
after(encerrar);

describe('Senha forte obrigatória no backend', () => {
    test('cadastro pela tela de login recusa senha sem cada requisito, com o motivo', async () => {
        for (const [senha, motivo] of FRACAS) {
            const email = emailNovo('fraca');
            const r = await api('/api/auth/registro', { metodo: 'POST', corpo: { nome: 'Pessoa Teste', email, senha } });
            assert.equal(r.status, 400, senha);
            assert.match(r.corpo.erro, motivo, senha);
            assert.equal(await hashDe(email), undefined, 'nada foi gravado');
        }
        const email = emailNovo('forte');
        assert.equal((await api('/api/auth/registro', { metodo: 'POST', corpo: { nome: 'Pessoa Forte', email, senha: FORTE } })).status, 201);
        assert.match(await hashDe(email), /^scrypt\$N=\d+,r=8,p=2\$[0-9a-f]{32}\$[0-9a-f]{64}$/, 'hash no formato novo, com o custo');
    });

    test('Usuários: senha nova precisa ser forte; editar sem senha mantém a atual', async () => {
        const pessoa = (await pool.query(
            `INSERT INTO membros (nome_completo, classificacao, ativo, apto_voluntario, voluntario) VALUES ('Pessoa Usuários', 'visitante', TRUE, FALSE, FALSE) RETURNING id_membro`
        )).rows[0].id_membro;
        const corpo = { id_membro: pessoa, email: emailNovo('usuario'), perfil: 'GESTOR', permissoes: { escalas: true } };
        const fraca = await api('/api/usuarios', { metodo: 'POST', token: admin.token, corpo: { ...corpo, senha: 'senha123' } });
        assert.equal(fraca.status, 400);
        assert.match(fraca.corpo.erro, /maiúscula.*símbolo/);
        const criado = await api('/api/usuarios', { metodo: 'POST', token: admin.token, corpo: { ...corpo, senha: FORTE } });
        assert.equal(criado.status, 201, criado.texto);

        const id = criado.corpo.id_usuario;
        const antes = await hashDe(corpo.email);
        assert.equal((await api(`/api/usuarios/${id}`, { metodo: 'PUT', token: admin.token, corpo: { ...corpo, senha: '' } })).status, 200);
        assert.equal(await hashDe(corpo.email), antes, 'sem senha nova, a atual continua');
        assert.equal((await api(`/api/usuarios/${id}`, { metodo: 'PUT', token: admin.token, corpo: { ...corpo, senha: 'fraquinha' } })).status, 400);
        assert.equal(await hashDe(corpo.email), antes);
    });

    test('troca de senha na Minha área exige senha forte', async () => {
        const usuario = await criarUsuario({ perfil: 'VISUALIZACAO' });
        const fraca = await api('/api/portal/senha', { metodo: 'PUT', token: usuario.token, corpo: { senha_atual: SENHA, nova_senha: 'novasenha' } });
        assert.equal(fraca.status, 400);
        assert.match(fraca.corpo.erro, /^A nova senha precisa ter/);
        assert.equal((await api('/api/portal/senha', { metodo: 'PUT', token: usuario.token, corpo: { senha_atual: SENHA, nova_senha: FORTE } })).status, 200);
        assert.equal((await api('/api/auth/login', { metodo: 'POST', corpo: { login: usuario.email, senha: FORTE } })).status, 200);
    });
});

describe('Hash antigo é atualizado no login', () => {
    test('quem tem hash no formato antigo entra normalmente e o hash passa para o custo atual', async () => {
        const usuario = await criarUsuario({ perfil: 'GESTOR', permissoes: TODAS });
        // Mesmo formato gravado antes do reforço: scrypt$<sal>$<hash> com o custo padrão do Node
        const sal = crypto.randomBytes(16).toString('hex');
        const antigo = `scrypt$${sal}$${crypto.scryptSync('Velha123', sal, 32).toString('hex')}`;
        await pool.query('UPDATE usuarios SET senha_hash = $2 WHERE id_usuario = $1', [usuario.id, antigo]);

        // Senha errada não mexe no hash
        assert.equal((await api('/api/auth/login', { metodo: 'POST', corpo: { login: usuario.email, senha: 'Errada@1' } })).status, 401);
        assert.equal(await hashDe(usuario.email), antigo);

        // Senha antiga (mesmo fraca) continua valendo no login; o hash é refeito
        assert.equal((await api('/api/auth/login', { metodo: 'POST', corpo: { login: usuario.email, senha: 'Velha123' } })).status, 200);
        const novo = await hashDe(usuario.email);
        assert.notEqual(novo, antigo);
        assert.match(novo, /^scrypt\$N=\d+,r=8,p=2\$/);
        assert.equal((await api('/api/auth/login', { metodo: 'POST', corpo: { login: usuario.email, senha: 'Velha123' } })).status, 200, 'continua entrando');
        assert.equal(await hashDe(usuario.email), novo, 'já atualizado: não refaz de novo');
    });
});
