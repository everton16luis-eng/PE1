// =========================================================
// Testes de SQL injection e validação de entrada
// =========================================================

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar, encerrar, api, criarUsuario, contar, pool, TODAS } = require('./apoio');

const ATAQUES = [
    "' OR '1'='1",
    "' OR 1=1--",
    "admin@novocaminho.org'--",
    "1; DROP TABLE membros;--",
    "1 OR 1=1",
    "'; DELETE FROM usuarios; --",
    "1' UNION SELECT senha_hash, email FROM usuarios--",
    "') OR ('a'='a",
    "1; UPDATE usuarios SET perfil='ADMINISTRADOR'--",
    "$1",
    "\\'; SELECT pg_sleep(5);--",
    "%27%20OR%201%3D1"
];

const TABELAS = ['membros', 'visitantes', 'usuarios', 'voluntarios', 'funcoes', 'escalas', 'eventos', 'criancas', 'cadastroturmas', 'turmas'];

// Uma resposta "segura": sem erro 500 e sem texto de erro do banco
function assertSemVazamento(r, contexto) {
    assert.notEqual(r.status, 500, `${contexto}: erro 500 → ${r.texto.slice(0, 200)}`);
    assert.ok(!/syntax error|erro de sintaxe|relation|relação|pg_|SELECT |column|coluna/i.test(r.corpo?.erro || ''),
        `${contexto}: mensagem de erro do banco vazou → ${r.corpo?.erro}`);
}

let admin;
let contagemInicial;

before(async () => {
    await iniciar();
    admin = await criarUsuario({ perfil: 'ADMINISTRADOR', permissoes: TODAS });
    contagemInicial = await contar(...TABELAS);
});

after(async () => {
    // Nenhum ataque pode ter apagado dados (inserções legítimas dos testes podem aumentar)
    const final = await contar(...TABELAS);
    for (const tabela of TABELAS) {
        assert.ok(final[tabela] >= contagemInicial[tabela], `${tabela} perdeu registros: ${contagemInicial[tabela]} → ${final[tabela]}`);
    }
    const perfis = await pool.query("SELECT COUNT(*)::int AS n FROM usuarios WHERE perfil = 'ADMINISTRADOR'");
    assert.ok(perfis.rows[0].n < 10, 'perfis foram alterados para ADMINISTRADOR em massa');
    await encerrar();
});

describe('Login', () => {
    for (const ataque of ATAQUES) {
        test(`login = ${ataque}`, async () => {
            const r = await api('/api/auth/login', { metodo: 'POST', corpo: { login: ataque, senha: ataque } });
            assertSemVazamento(r, 'login');
            assert.ok([401, 429].includes(r.status), `esperado 401/429, veio ${r.status}`);
            assert.equal(r.corpo?.token, undefined);
        });
    }

    test('senha com injeção junto de um e-mail real não entra', async () => {
        const r = await api('/api/auth/login', { metodo: 'POST', corpo: { login: admin.email, senha: "' OR '1'='1" } });
        assert.equal(r.status, 401);
    });

    test('campos com tipos inesperados (objeto/array) não quebram o login', async () => {
        for (const corpo of [{ login: { $ne: null }, senha: { $ne: null } }, { login: ['a'], senha: ['b'] }, { login: null, senha: 123 }]) {
            const r = await api('/api/auth/login', { metodo: 'POST', corpo });
            assertSemVazamento(r, JSON.stringify(corpo));
            assert.ok([400, 401, 429].includes(r.status));
        }
    });
});

describe('Parâmetros de URL', () => {
    for (const ataque of ATAQUES) {
        const q = encodeURIComponent(ataque);
        const rotas = [
            `/api/escalas/dia?data=${q}`,
            `/api/escalas/calendario?ano=${q}&mes=${q}`,
            `/api/escalas/voluntarios?funcao=${q}&data=2026-10-25`,
            `/api/presenca?data=${q}`,
            `/api/relatorios/${q}`
        ];
        for (const rota of rotas) {
            test(`GET ${rota.split('?')[0]} com ${ataque}`, async () => {
                const r = await api(rota, { token: admin.token });
                assertSemVazamento(r, rota);
                assert.ok([400, 404].includes(r.status), `esperado 400/404, veio ${r.status}`);
            });
        }

        test(`IDs na URL com ${ataque}`, async () => {
            const chamadas = [
                ['PATCH', `/api/presenca/${q}/saida`],
                ['PUT', `/api/usuarios/${q}`, { nome: 'x', email: 'x@x.com', perfil: 'GESTOR' }],
                ['PUT', `/api/funcoes/${q}`, { nome: 'x', qtd_voluntarios: 1, vagas: 1 }],
                ['PUT', `/api/turmas/${q}`, { nome: 'x', idade_minima: 1, idade_maxima: 2, dia_semana: 'Domingo', horario: '09:00' }],
                ['DELETE', `/api/turmas/${q}`],
                ['PATCH', `/api/voluntarios/${q}/status`, { ativo: false }],
                ['PATCH', `/api/escalas/${q}/participantes/${q}`, { confirmado: true }]
            ];
            for (const [metodo, rota, corpo] of chamadas) {
                const r = await api(rota, { metodo, token: admin.token, corpo });
                assertSemVazamento(r, `${metodo} ${rota}`);
                assert.ok([400, 404].includes(r.status), `${metodo} ${rota}: esperado 400/404, veio ${r.status}`);
            }
        });
    }
});

describe('Filtros dos relatórios', () => {
    const tipos = ['participantes', 'voluntarios', 'escalas', 'presencas', 'criancas', 'funcoes', 'usuarios'];
    const filtros = ['tipo', 'status', 'vagas', 'perfil', 'id_funcao', 'id_turma', 'inicio', 'fim'];

    for (const tipo of tipos) {
        test(`relatório de ${tipo}: filtros maliciosos são ignorados`, async () => {
            const semFiltro = await api(`/api/relatorios/${tipo}`, { token: admin.token });
            assert.equal(semFiltro.status, 200);
            for (const ataque of ATAQUES) {
                const params = new URLSearchParams(filtros.map(f => [f, ataque]));
                const r = await api(`/api/relatorios/${tipo}?${params}`, { token: admin.token });
                assertSemVazamento(r, `${tipo} ${ataque}`);
                assert.equal(r.status, 200);
                assert.deepEqual(r.corpo.filtros, {}, 'nenhum filtro malicioso deveria ser aceito');
                assert.equal(r.corpo.linhas.length, semFiltro.corpo.linhas.length);
            }
        });
    }
});

describe('Dados gravados literalmente (sem executar)', () => {
    for (const ataque of ATAQUES.slice(0, 6)) {
        test(`participante com nome ${ataque}`, async () => {
            const nome = `Inj ${ataque}`;
            const telefone = ataque.slice(0, 20); // a coluna telefone aceita até 20 caracteres
            const r = await api('/api/participantes', { metodo: 'POST', token: admin.token, corpo: { tipo: 'visitante', nome, data_visita: '2026-10-21', telefone, observacoes: ataque } });
            assertSemVazamento(r, 'participante');
            assert.equal(r.status, 201);
            const salvo = (await pool.query('SELECT nome, telefone, observacoes FROM visitantes WHERE id_visitante = $1', [r.corpo.id_visitante])).rows[0];
            assert.deepEqual(salvo, { nome, telefone, observacoes: ataque });
        });
    }

    test('campo maior que o permitido → 400 amigável, sem mensagem do banco', async () => {
        const r = await api('/api/participantes', { metodo: 'POST', token: admin.token, corpo: { tipo: 'visitante', nome: 'Ana', data_visita: '2026-10-21', telefone: "1; DROP TABLE membros;-- e mais texto" } });
        assert.equal(r.status, 400);
        assert.equal(r.corpo.erro, 'Um dos campos passou do tamanho permitido.');
    });

    test('erros inesperados não mostram detalhes internos', async () => {
        const r = await api('/api/participantes', { metodo: 'POST', token: admin.token, corpo: { tipo: 'membro', nome: 'x'.repeat(500) } });
        assertSemVazamento(r, 'nome gigante');
        assert.ok(!/character varying|varchar|caracteres|tipo/i.test(r.corpo.erro) || r.corpo.erro === 'Um dos campos passou do tamanho permitido.');
    });

    test('função e turma com nomes maliciosos', async () => {
        const nome = "Função'); DROP TABLE funcoes;--";
        const f = await api('/api/funcoes', { metodo: 'POST', token: admin.token, corpo: { nome, qtd_voluntarios: 1, vagas: 1 } });
        assert.equal(f.status, 201);
        assert.equal(f.corpo.nome, nome);

        const t = await api('/api/presenca/turmas', { metodo: 'POST', token: admin.token, corpo: { nome: "Turma' OR '1'='1" } });
        assert.equal(t.status, 201);
        assert.equal(t.corpo.nome, "Turma' OR '1'='1");
    });

    test('script HTML é guardado como texto (a tela é que escapa)', async () => {
        const nome = '<img src=x onerror="alert(1)">';
        const r = await api('/api/participantes', { metodo: 'POST', token: admin.token, corpo: { tipo: 'membro', nome } });
        assert.equal(r.status, 201);
        assert.equal(r.corpo.nome_completo, nome);
    });
});

describe('Validação de entrada', () => {
    const invalidos = [
        ['POST', '/api/participantes', { tipo: 'membro', nome: '   ' }, 'nome vazio'],
        ['POST', '/api/participantes', { tipo: 'visitante', nome: 'Ana', data_visita: '21/10/2026' }, 'data fora do formato'],
        ['POST', '/api/funcoes', { nome: 'X', qtd_voluntarios: 0, vagas: 1 }, 'zero voluntários por escala'],
        ['POST', '/api/funcoes', { nome: 'X', qtd_voluntarios: 1, vagas: -1 }, 'vagas negativas'],
        ['POST', '/api/escalas', { data: '2026-10-25', horario: '08:00', id_funcao: 1, qtd_voluntarios: 1, voluntarios: [] }, 'sem voluntários'],
        ['POST', '/api/escalas', { data: '2026-10-25', horario: '08:00', id_funcao: 1, qtd_voluntarios: 1, voluntarios: [1, 2] }, 'mais voluntários que vagas'],
        ['POST', '/api/escalas', { data: '2026-10-25', horario: '08:00', id_funcao: 1, qtd_voluntarios: 1, voluntarios: [1], evento: { nome: 'X', hora_inicio: '20:00', hora_fim: '19:00', tipo_evento: 'culto' } }, 'evento termina antes de começar'],
        ['POST', '/api/criancas', { nome: 'Bia', data_nascimento: '2020-01-01', sexo: 'feminino', id_turma: 1, responsavel: { nome: 'Mãe', parentesco: 'mae', telefone: '1' } }, 'sem autorização do responsável'],
        ['POST', '/api/turmas', { nome: 'X', idade_minima: 10, idade_maxima: 5, dia_semana: 'Domingo', horario: '09:00' }, 'faixa etária invertida'],
        ['POST', '/api/usuarios', { nome: 'X', email: 'nao-e-email', senha: 'Senha@123', perfil: 'GESTOR' }, 'e-mail inválido'],
        ['POST', '/api/usuarios', { nome: 'X', email: 'a@b.com', senha: '123', perfil: 'GESTOR' }, 'senha curta'],
        ['POST', '/api/usuarios', { nome: 'X', email: 'a@b.com', senha: 'Senha@123', perfil: 'SUPERUSUARIO' }, 'perfil inexistente'],
        ['PUT', '/api/configuracoes', { nome_igreja: 'Igreja', cnpj: '123' }, 'CNPJ inválido'],
        ['POST', '/api/presenca', { id_turma: 1, id_membro: 'abc', data: '2026-10-21' }, 'membro não numérico']
    ];
    for (const [metodo, rota, corpo, descricao] of invalidos) {
        test(`${metodo} ${rota}: ${descricao} → 400`, async () => {
            const r = await api(rota, { metodo, token: admin.token, corpo });
            assert.equal(r.status, 400, r.texto);
            assert.ok(r.corpo?.erro, 'deveria explicar o erro');
        });
    }
});
