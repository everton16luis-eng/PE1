// =========================================================
// Testes de segurança: autenticação, permissões e acesso indevido
// =========================================================

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { iniciar, encerrar, api, criarUsuario, pool, SENHA, TODAS, NENHUMA } = require('./apoio');

// Rotas protegidas: [método, caminho, área exigida (null = só login), corpo]
const ROTAS = [
    ['GET', '/api/auth/me', null],
    ['GET', '/api/dashboardPessoas', null],
    ['GET', '/api/escalasSemana', null],
    ['GET', '/api/eventos', null],
    ['GET', '/api/presenca/turmas', null],
    ['GET', '/api/configuracoes', null],
    ['GET', '/api/participantes', 'participantes'],
    ['POST', '/api/participantes', 'participantes', {}],
    ['GET', '/api/voluntarios', 'voluntarios'],
    ['GET', '/api/voluntarios/candidatos', 'voluntarios'],
    ['POST', '/api/voluntarios', 'voluntarios', {}],
    ['GET', '/api/funcoes/gestao', 'voluntarios'],
    ['POST', '/api/funcoes', 'voluntarios', {}],
    ['GET', '/api/escalas/calendario?ano=2026&mes=10', 'escalas'],
    ['GET', '/api/escalas/dia?data=2026-10-18', 'escalas'],
    ['POST', '/api/escalas', 'escalas', {}],
    ['GET', '/api/criancas', 'criancas'],
    ['POST', '/api/criancas', 'criancas', {}],
    ['GET', '/api/turmas', 'criancas'],
    ['GET', '/api/relatorios', 'relatorios'],
    ['GET', '/api/relatorios/participantes', 'relatorios'],
    ['GET', '/api/usuarios', 'usuarios'],
    ['POST', '/api/usuarios', 'usuarios', {}]
];

function tokenAssinado(dados, segredo = process.env.AUTH_SECRET) {
    const conteudo = Buffer.from(JSON.stringify(dados)).toString('base64url');
    const assinatura = crypto.createHmac('sha256', segredo).update(conteudo).digest('base64url');
    return `${conteudo}.${assinatura}`;
}

let admin;

before(async () => {
    await iniciar();
    admin = await criarUsuario({ perfil: 'ADMINISTRADOR', permissoes: TODAS });
});
after(encerrar);

describe('Sem login', () => {
    for (const [metodo, rota, , corpo] of ROTAS) {
        test(`${metodo} ${rota} sem token → 401`, async () => {
            const r = await api(rota, { metodo, corpo });
            assert.equal(r.status, 401);
        });
    }

    test('rota de API inexistente também exige login (não revela o que existe)', async () => {
        assert.equal((await api('/api/rota-que-nao-existe')).status, 401);
    });
});

describe('Tokens inválidos', () => {
    const casos = {
        'texto qualquer': 'abc',
        'sem assinatura': Buffer.from('{"id":1}').toString('base64url'),
        'assinado com outra chave': tokenAssinado({ id: 1, perfil: 'ADMINISTRADOR', exp: Date.now() + 60000 }, 'chave-errada'),
        'expirado': tokenAssinado({ id: 1, perfil: 'ADMINISTRADOR', exp: Date.now() - 1000 }),
        'cabeçalho "Bearer" vazio': '',
        'JWT com alg none': 'eyJhbGciOiJub25lIn0.eyJpZCI6MX0.'
    };
    for (const [nome, token] of Object.entries(casos)) {
        test(`token ${nome} → 401`, async () => {
            const r = await api('/api/dashboardPessoas', { headers: { Authorization: `Bearer ${token}` } });
            assert.equal(r.status, 401);
        });
    }

    test('trocar o id dentro do token (sem reassinar) → 401', async () => {
        const [dados, assinatura] = admin.token.split('.');
        const conteudo = JSON.parse(Buffer.from(dados, 'base64url').toString());
        const adulterado = Buffer.from(JSON.stringify({ ...conteudo, id: conteudo.id + 1 })).toString('base64url');
        const r = await api('/api/auth/me', { token: `${adulterado}.${assinatura}` });
        assert.equal(r.status, 401);
    });

    test('token de usuário desativado deixa de funcionar na hora', async () => {
        const usuario = await criarUsuario({ perfil: 'GESTOR', permissoes: TODAS });
        assert.equal((await api('/api/auth/me', { token: usuario.token })).status, 200);
        await pool.query('UPDATE usuarios SET ativo = FALSE WHERE id_usuario = $1', [usuario.id]);
        assert.equal((await api('/api/auth/me', { token: usuario.token })).status, 401);
    });

    test('token de usuário apagado → 401', async () => {
        const usuario = await criarUsuario({ perfil: 'GESTOR', permissoes: TODAS });
        await pool.query('DELETE FROM usuarios WHERE id_usuario = $1', [usuario.id]);
        assert.equal((await api('/api/auth/me', { token: usuario.token })).status, 401);
    });
});

describe('Login', () => {
    test('senha errada → 401 sem dizer se o e-mail existe', async () => {
        const existe = await api('/api/auth/login', { metodo: 'POST', corpo: { login: admin.email, senha: 'errada' } });
        const naoExiste = await api('/api/auth/login', { metodo: 'POST', corpo: { login: 'ninguem@exemplo.test', senha: 'errada' } });
        assert.equal(existe.status, 401);
        assert.equal(naoExiste.status, 401);
        assert.equal(existe.corpo.erro, naoExiste.corpo.erro);
    });

    test('usuário inativo não consegue entrar', async () => {
        const inativo = await criarUsuario({ perfil: 'SECRETARIA', ativo: false });
        const r = await api('/api/auth/login', { metodo: 'POST', corpo: { login: inativo.email, senha: SENHA } });
        assert.equal(r.status, 403);
        assert.equal(r.corpo.token, undefined);
    });

    test('respostas nunca incluem o hash da senha', async () => {
        const login = await api('/api/auth/login', { metodo: 'POST', corpo: { login: admin.email, senha: SENHA } });
        const me = await api('/api/auth/me', { token: admin.token });
        const lista = await api('/api/usuarios', { token: admin.token });
        for (const r of [login, me, lista]) {
            assert.ok(!r.texto.includes('senha_hash'), 'senha_hash apareceu na resposta');
            assert.ok(!r.texto.includes('scrypt$'), 'hash scrypt apareceu na resposta');
        }
    });

    test('muitas tentativas erradas bloqueiam temporariamente (força bruta) → 429', async () => {
        const alvo = await criarUsuario({ perfil: 'SECRETARIA', permissoes: NENHUMA });
        let ultimo;
        for (let i = 0; i < 12; i++) {
            ultimo = await api('/api/auth/login', { metodo: 'POST', corpo: { login: alvo.email, senha: `errada${i}` } });
        }
        assert.equal(ultimo.status, 429);
        // Mesmo com a senha certa continua bloqueado durante a janela
        const certo = await api('/api/auth/login', { metodo: 'POST', corpo: { login: alvo.email, senha: SENHA } });
        assert.equal(certo.status, 429);
    });
});

describe('Registro pela tela de login', () => {
    test('não deixa escolher perfil, ativação ou permissões', async () => {
        const email = `registro.${Date.now()}@exemplo.test`;
        const r = await api('/api/auth/registro', {
            metodo: 'POST',
            corpo: { nome: 'Invasor', email, senha: 'Senha@123', perfil: 'ADMINISTRADOR', ativo: true, permissoes: { usuarios: true } }
        });
        assert.equal(r.status, 201);
        const salvo = (await pool.query('SELECT perfil, ativo, permissoes FROM usuarios WHERE email = $1', [email])).rows[0];
        assert.equal(salvo.perfil, 'VISUALIZACAO');
        assert.equal(salvo.ativo, false);
        assert.equal(salvo.permissoes.usuarios, false);
        const login = await api('/api/auth/login', { metodo: 'POST', corpo: { login: email, senha: 'Senha@123' } });
        assert.equal(login.status, 403, 'cadastro novo não pode entrar antes da liberação');
    });

    test('e-mail repetido → 409', async () => {
        const r = await api('/api/auth/registro', { metodo: 'POST', corpo: { nome: 'X', email: admin.email, senha: 'Senha@123' } });
        assert.equal(r.status, 409);
    });
});

describe('Permissões por área', () => {
    const areas = ['participantes', 'voluntarios', 'escalas', 'criancas', 'relatorios', 'usuarios'];

    for (const area of areas) {
        test(`usuário só com "${area}" acessa só essa área`, async () => {
            const usuario = await criarUsuario({ perfil: 'SECRETARIA', permissoes: { ...NENHUMA, [area]: true } });
            for (const [metodo, rota, exigida] of ROTAS.filter(([m]) => m === 'GET')) {
                const r = await api(rota, { metodo, token: usuario.token });
                if (exigida === null || exigida === area) {
                    assert.equal(r.status, 200, `${rota} deveria liberar para "${area}"`);
                } else {
                    assert.equal(r.status, 403, `${rota} deveria bloquear para "${area}"`);
                }
            }
        });
    }

    test('relatório de usuários exige a permissão "usuarios"', async () => {
        const usuario = await criarUsuario({ perfil: 'SECRETARIA', permissoes: { ...NENHUMA, relatorios: true } });
        assert.equal((await api('/api/relatorios/participantes', { token: usuario.token })).status, 200);
        assert.equal((await api('/api/relatorios/usuarios', { token: usuario.token })).status, 403);
    });

    test('alterar configurações e fazer backup: só administrador', async () => {
        const gestor = await criarUsuario({ perfil: 'GESTOR', permissoes: TODAS });
        assert.equal((await api('/api/configuracoes', { metodo: 'PUT', token: gestor.token, corpo: { nome_igreja: 'Hack' } })).status, 403);
        assert.equal((await api('/api/configuracoes/backup', { metodo: 'POST', token: gestor.token })).status, 403);
    });
});

describe('Escalada de privilégio', () => {
    let gestorDeUsuarios;

    before(async () => {
        gestorDeUsuarios = await criarUsuario({ perfil: 'SECRETARIA', permissoes: { ...NENHUMA, usuarios: true } });
    });

    test('quem não é administrador não cria administrador', async () => {
        const r = await api('/api/usuarios', {
            metodo: 'POST', token: gestorDeUsuarios.token,
            corpo: { nome: 'Novo Admin', email: `admin.${Date.now()}@exemplo.test`, senha: 'Senha@123', perfil: 'ADMINISTRADOR' }
        });
        assert.equal(r.status, 403);
    });

    test('quem não é administrador não promove a si mesmo', async () => {
        const r = await api(`/api/usuarios/${gestorDeUsuarios.id}`, {
            metodo: 'PUT', token: gestorDeUsuarios.token,
            corpo: { nome: 'Eu', email: gestorDeUsuarios.email, perfil: 'ADMINISTRADOR' }
        });
        assert.equal(r.status, 403);
        const perfil = (await pool.query('SELECT perfil FROM usuarios WHERE id_usuario = $1', [gestorDeUsuarios.id])).rows[0].perfil;
        assert.equal(perfil, 'SECRETARIA');
    });

    test('quem não é administrador não altera conta (ou senha) de administrador', async () => {
        const r = await api(`/api/usuarios/${admin.id}`, {
            metodo: 'PUT', token: gestorDeUsuarios.token,
            corpo: { nome: 'Admin', email: admin.email, perfil: 'ADMINISTRADOR', senha: 'Roubada@123' }
        });
        assert.equal(r.status, 403);
        const login = await api('/api/auth/login', { metodo: 'POST', corpo: { login: admin.email, senha: SENHA } });
        assert.equal(login.status, 200, 'a senha do administrador não pode ter mudado');
    });

    test('quem não é administrador não concede permissão que não tem', async () => {
        const r = await api('/api/usuarios', {
            metodo: 'POST', token: gestorDeUsuarios.token,
            corpo: { nome: 'Novo', email: `novo.${Date.now()}@exemplo.test`, senha: 'Senha@123', perfil: 'GESTOR', permissoes: { relatorios: true } }
        });
        assert.equal(r.status, 403);
    });

    test('pode editar alguém mantendo permissões que essa pessoa já tinha', async () => {
        const alvo = await criarUsuario({ perfil: 'GESTOR', permissoes: { ...NENHUMA, relatorios: true } });
        const r = await api(`/api/usuarios/${alvo.id}`, {
            metodo: 'PUT', token: gestorDeUsuarios.token,
            corpo: { nome: 'Nome Novo', email: alvo.email, perfil: 'GESTOR', permissoes: { relatorios: true } }
        });
        assert.equal(r.status, 200, r.texto);
        assert.equal(r.corpo.nome, 'Nome Novo');
    });

    test('administrador continua podendo criar administrador', async () => {
        const r = await api('/api/usuarios', {
            metodo: 'POST', token: admin.token,
            corpo: { nome: 'Outro Admin', email: `admin2.${Date.now()}@exemplo.test`, senha: 'Senha@123', perfil: 'ADMINISTRADOR' }
        });
        assert.equal(r.status, 201);
    });
});

describe('Servidor e arquivos', () => {
    const secretos = ['/backend/src/.env', '/../backend/src/.env', '/%2e%2e/backend/src/.env', '/..%2fbackend%2fsrc%2f.env',
        '/package.json', '/backups/', '/.git/config', '/backend/src/config/seguranca.js'];
    for (const caminho of secretos) {
        test(`não expõe ${caminho}`, async () => {
            const r = await api(caminho);
            assert.notEqual(r.status, 200);
            assert.ok(!r.texto.includes('DB_PASSWORD') && !r.texto.includes('AUTH_SECRET'));
        });
    }

    test('cabeçalhos de segurança presentes e "X-Powered-By" escondido', async () => {
        const r = await api('/');
        assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
        assert.equal(r.headers.get('x-frame-options'), 'DENY');
        assert.ok(r.headers.get('referrer-policy'));
        assert.equal(r.headers.get('x-powered-by'), null);
    });

    test('JSON malformado → 400 sem detalhes internos', async () => {
        const r = await api('/api/auth/login', { metodo: 'POST', corpo: '{"login": ', headers: { 'Content-Type': 'application/json' } });
        assert.equal(r.status, 400);
        assert.ok(!/at |\\node_modules|SyntaxError/.test(r.texto));
    });

    test('corpo gigante é recusado (413)', async () => {
        const r = await api('/api/auth/login', { metodo: 'POST', corpo: { login: 'a'.repeat(200 * 1024), senha: 'x' } });
        assert.equal(r.status, 413);
    });
});
