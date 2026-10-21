// =========================================================
// Ficha (gestão) e portal do voluntário: regras e segurança
// =========================================================

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar, encerrar, api, criarUsuario, voluntarioComEscalas, pool, SENHA, TODAS, NENHUMA } = require('./apoio');

const somarDias = dias => {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    return d.toISOString().slice(0, 10);
};

let admin;
let gestor;          // só permissão de voluntários
let voluntario;      // { id_voluntario, id_membro, token, ... } com login de portal
let outro;           // outro voluntário (para tentar mexer no que não é dele)

before(async () => {
    await iniciar();
    admin = await criarUsuario({ perfil: 'ADMINISTRADOR', permissoes: TODAS });
    gestor = await criarUsuario({ perfil: 'GESTOR', permissoes: { ...NENHUMA, voluntarios: true } });

    const v = await voluntarioComEscalas(0);
    const login = await criarUsuario({ perfil: 'VOLUNTARIO', permissoes: NENHUMA, id_membro: v.id_membro });
    voluntario = { ...v, ...login };
    outro = await voluntarioComEscalas(1);
});
after(encerrar);

describe('Portal: o voluntário só enxerga o portal', () => {
    const bloqueadas = ['/api/dashboardPessoas', '/api/escalasSemana', '/api/confirmacoesPendentes', '/api/eventos', '/api/funcoes',
        '/api/voluntariosDisponiveis', '/api/presenca/turmas', '/api/configuracoes', '/api/participantes', '/api/voluntarios',
        '/api/escalas/dia?data=2026-10-18', '/api/criancas', '/api/relatorios', '/api/usuarios'];

    for (const rota of bloqueadas) {
        test(`voluntário → ${rota} = 403`, async () => {
            assert.equal((await api(rota, { token: voluntario.token })).status, 403);
        });
    }

    test('não acessa a ficha de ninguém (nem a própria) pela API de gestão', async () => {
        assert.equal((await api(`/api/voluntarios/${voluntario.id_voluntario}`, { token: voluntario.token })).status, 403);
        assert.equal((await api(`/api/voluntarios/${outro.id_voluntario}`, { token: voluntario.token })).status, 403);
    });

    test('vê os próprios dados, sem anotações internas da equipe', async () => {
        await pool.query("UPDATE voluntarios SET observacoes = 'Anotação interna' WHERE id_voluntario = $1", [voluntario.id_voluntario]);
        const r = await api('/api/portal', { token: voluntario.token });
        assert.equal(r.status, 200);
        assert.equal(r.corpo.id_voluntario, voluntario.id_voluntario);
        assert.equal(r.corpo.observacoes, undefined);
        assert.equal(r.corpo.acesso, undefined);
        assert.ok(!r.texto.includes('Anotação interna'));
        assert.ok(r.corpo.proximas.length >= 2);
        assert.ok(Array.isArray(r.corpo.proximas[0].colegas));
    });

    test('login sem cadastro de voluntário recebe aviso (404)', async () => {
        assert.equal((await api('/api/portal', { token: admin.token })).status, 404);
    });
});

describe('Portal: responder escalas', () => {
    let escalas;
    before(async () => {
        escalas = (await api('/api/portal', { token: voluntario.token })).corpo.proximas.filter(p => !p.recusado);
    });

    test('confirmar presença', async () => {
        const r = await api(`/api/portal/escalas/${escalas[0].id_escala}`, { metodo: 'PATCH', token: voluntario.token, corpo: { resposta: 'confirmar' } });
        assert.equal(r.status, 200);
        const salvo = (await pool.query('SELECT confirmado, recusado, respondido_em FROM escala_participantes WHERE id_escala = $1 AND id_voluntario = $2',
            [escalas[0].id_escala, voluntario.id_voluntario])).rows[0];
        assert.equal(salvo.confirmado, true);
        assert.equal(salvo.recusado, false);
        assert.ok(salvo.respondido_em);
    });

    test('recusar exige motivo', async () => {
        const r = await api(`/api/portal/escalas/${escalas[1].id_escala}`, { metodo: 'PATCH', token: voluntario.token, corpo: { resposta: 'recusar', motivo: '   ' } });
        assert.equal(r.status, 400);
    });

    test('recusar com motivo sai das pendências e aparece para a gestão', async () => {
        const r = await api(`/api/portal/escalas/${escalas[1].id_escala}`, { metodo: 'PATCH', token: voluntario.token, corpo: { resposta: 'recusar', motivo: 'Viagem' } });
        assert.equal(r.status, 200);
        assert.equal(r.corpo.recusado, true);

        const ficha = (await api(`/api/voluntarios/${voluntario.id_voluntario}`, { token: admin.token })).corpo;
        const escala = ficha.proximas.find(p => p.id_escala === escalas[1].id_escala);
        assert.equal(escala.recusado, true);
        assert.equal(escala.motivo_recusa, 'Viagem');

        const pendentes = (await api('/api/confirmacoesPendentes', { token: admin.token })).corpo;
        const dia = String(escala.data_escala).slice(0, 10);
        assert.ok(!pendentes.some(p => String(p.data_escala).slice(0, 10) === dia && p.nome === ficha.nome && p.funcao === escala.funcao),
            'quem recusou não pode aparecer como pendente');
    });

    test('"mudei de ideia" volta para aguardando', async () => {
        const r = await api(`/api/portal/escalas/${escalas[1].id_escala}`, { metodo: 'PATCH', token: voluntario.token, corpo: { resposta: 'pendente' } });
        assert.equal(r.status, 200);
        assert.deepEqual([r.corpo.confirmado, r.corpo.recusado, r.corpo.motivo_recusa], [false, false, null]);
    });

    test('não responde escala de outro voluntário', async () => {
        // Uma escala futura de outra pessoa, em que este voluntário NÃO está
        const doOutro = (await pool.query(
            `SELECT ep.id_escala, ep.id_voluntario, ep.confirmado, ep.recusado, ep.motivo_recusa
             FROM escala_participantes ep JOIN escalas es ON es.id_escala = ep.id_escala
             WHERE ep.id_voluntario <> $1 AND es.data_escala >= CURRENT_DATE
               AND NOT EXISTS (SELECT 1 FROM escala_participantes x WHERE x.id_escala = ep.id_escala AND x.id_voluntario = $1)
             LIMIT 1`,
            [voluntario.id_voluntario]
        )).rows[0];
        const r = await api(`/api/portal/escalas/${doOutro.id_escala}`, { metodo: 'PATCH', token: voluntario.token, corpo: { resposta: 'recusar', motivo: 'x' } });
        assert.equal(r.status, 404);
        const depois = (await pool.query('SELECT confirmado, recusado, motivo_recusa FROM escala_participantes WHERE id_escala = $1 AND id_voluntario = $2',
            [doOutro.id_escala, doOutro.id_voluntario])).rows[0];
        assert.deepEqual(depois, { confirmado: doOutro.confirmado, recusado: doOutro.recusado, motivo_recusa: doOutro.motivo_recusa },
            'a escala do outro voluntário foi alterada');
    });

    test('não responde escala que já passou', async () => {
        const passada = (await api('/api/portal', { token: voluntario.token })).corpo.historico[0];
        if (!passada) return;
        const r = await api(`/api/portal/escalas/${passada.id_escala}`, { metodo: 'PATCH', token: voluntario.token, corpo: { resposta: 'confirmar' } });
        assert.equal(r.status, 404);
    });

    test('respostas e ids inválidos', async () => {
        for (const [rota, corpo] of [
            [`/api/portal/escalas/${escalas[0].id_escala}`, { resposta: 'apagar' }],
            ["/api/portal/escalas/1%20OR%201%3D1", { resposta: 'confirmar' }],
            ['/api/portal/escalas/abc', { resposta: 'confirmar' }]
        ]) {
            assert.equal((await api(rota, { metodo: 'PATCH', token: voluntario.token, corpo })).status, 400);
        }
    });
});

describe('Portal: ausências, preferências e senha', () => {
    test('informar ausência avisa as escalas no período', async () => {
        const proxima = (await api('/api/portal', { token: voluntario.token })).corpo.proximas.find(p => !p.recusado);
        const dia = String(proxima.data_escala).slice(0, 10);
        const r = await api('/api/portal/ausencias', { metodo: 'POST', token: voluntario.token, corpo: { data_inicio: dia, data_fim: dia, motivo: 'Férias' } });
        assert.equal(r.status, 201);
        assert.ok(r.corpo.conflitos.length >= 1, 'deveria avisar que já está escalado nesse dia');

        // Quem monta a escala vê o voluntário como ausente nessa data
        const funcao = (await pool.query('SELECT id_funcao FROM voluntario_funcoes WHERE id_voluntario = $1 LIMIT 1', [voluntario.id_voluntario])).rows[0].id_funcao;
        const lista = (await api(`/api/escalas/voluntarios?funcao=${funcao}&data=${dia}`, { token: admin.token })).corpo;
        const ele = lista.find(l => l.id_voluntario === voluntario.id_voluntario);
        assert.equal(ele.ausente, true);
        assert.equal(ele.disponivel, false);
        assert.equal(ele.motivo_ausencia, 'Férias');

        assert.equal((await api(`/api/portal/ausencias/${r.corpo.id_ausencia}`, { metodo: 'DELETE', token: voluntario.token })).status, 200);
    });

    test('períodos inválidos são recusados', async () => {
        for (const corpo of [
            { data_inicio: somarDias(5), data_fim: somarDias(2) },
            { data_inicio: somarDias(-10), data_fim: somarDias(-5) },
            { data_inicio: '21/10/2026', data_fim: '22/10/2026' },
            {}
        ]) {
            assert.equal((await api('/api/portal/ausencias', { metodo: 'POST', token: voluntario.token, corpo })).status, 400);
        }
    });

    test('não remove ausência de outro voluntário', async () => {
        const criada = await api(`/api/voluntarios/${outro.id_voluntario}/ausencias`, {
            metodo: 'POST', token: admin.token, corpo: { data_inicio: somarDias(40), data_fim: somarDias(45), motivo: 'Viagem' }
        });
        assert.equal(criada.status, 201);
        const r = await api(`/api/portal/ausencias/${criada.corpo.id_ausencia}`, { metodo: 'DELETE', token: voluntario.token });
        assert.equal(r.status, 404);
        assert.equal((await pool.query('SELECT 1 FROM voluntario_ausencias WHERE id_ausencia = $1', [criada.corpo.id_ausencia])).rowCount, 1);
    });

    test('salvar disponibilidade e contato', async () => {
        const r = await api('/api/portal/preferencias', { metodo: 'PUT', token: voluntario.token, corpo: { disponibilidade: ['domingo', 'quarta', 'hackday'], telefone: '(47) 90000-0000', email: 'novo@exemplo.test' } });
        assert.equal(r.status, 200);
        const salvo = (await api('/api/portal', { token: voluntario.token })).corpo;
        assert.deepEqual(salvo.disponibilidade, ['domingo', 'quarta']);
        assert.equal(salvo.telefone, '(47) 90000-0000');

        assert.equal((await api('/api/portal/preferencias', { metodo: 'PUT', token: voluntario.token, corpo: { disponibilidade: [] } })).status, 400);
        assert.equal((await api('/api/portal/preferencias', { metodo: 'PUT', token: voluntario.token, corpo: { disponibilidade: ['domingo'], email: 'sem-arroba' } })).status, 400);
    });

    test('trocar senha exige a senha atual', async () => {
        assert.equal((await api('/api/portal/senha', { metodo: 'PUT', token: voluntario.token, corpo: { senha_atual: 'errada', nova_senha: 'NovaSenha1' } })).status, 400);
        assert.equal((await api('/api/portal/senha', { metodo: 'PUT', token: voluntario.token, corpo: { senha_atual: SENHA, nova_senha: '123' } })).status, 400);
        assert.equal((await api('/api/portal/senha', { metodo: 'PUT', token: voluntario.token, corpo: { senha_atual: SENHA, nova_senha: 'NovaSenha1' } })).status, 200);
        const login = await api('/api/auth/login', { metodo: 'POST', corpo: { login: voluntario.email, senha: 'NovaSenha1' } });
        assert.equal(login.status, 200);
        await api('/api/portal/senha', { metodo: 'PUT', token: voluntario.token, corpo: { senha_atual: 'NovaSenha1', nova_senha: SENHA } });
    });
});

describe('Ficha do voluntário (gestão)', () => {
    test('exige a permissão de voluntários', async () => {
        const semPermissao = await criarUsuario({ perfil: 'SECRETARIA', permissoes: { ...NENHUMA, criancas: true } });
        assert.equal((await api(`/api/voluntarios/${outro.id_voluntario}`, { token: semPermissao.token })).status, 403);
        assert.equal((await api(`/api/voluntarios/${outro.id_voluntario}`, { token: gestor.token })).status, 200);
    });

    test('ficha completa com indicadores, escalas, histórico e ausências', async () => {
        const r = await api(`/api/voluntarios/${outro.id_voluntario}`, { token: gestor.token });
        for (const campo of ['nome', 'funcoes', 'disponibilidade', 'estatisticas', 'proximas', 'historico', 'ausencias', 'por_funcao']) {
            assert.ok(campo in r.corpo, `faltou ${campo}`);
        }
        assert.equal(typeof r.corpo.estatisticas.realizadas, 'number');
        assert.equal((await api('/api/voluntarios/999999', { token: gestor.token })).status, 404);
        assert.equal((await api('/api/voluntarios/abc', { token: gestor.token })).status, 400);
    });

    test('editar funções, disponibilidade e contato', async () => {
        const funcoes = (await pool.query('SELECT id_funcao FROM funcoes ORDER BY id_funcao LIMIT 2')).rows.map(f => f.id_funcao);
        const r = await api(`/api/voluntarios/${outro.id_voluntario}`, {
            metodo: 'PUT', token: gestor.token,
            corpo: { funcoes, disponibilidade: ['sabado'], telefone: '(47) 91111-1111', email: 'edit@exemplo.test', observacoes: 'Líder em treinamento', ativo: true }
        });
        assert.equal(r.status, 200);
        assert.deepEqual(r.corpo.funcoes.map(f => f.id_funcao).sort(), funcoes.sort());
        assert.deepEqual(r.corpo.disponibilidade, ['sabado']);
        assert.equal(r.corpo.observacoes, 'Líder em treinamento');

        for (const corpo of [{ funcoes: [], disponibilidade: ['sabado'] }, { funcoes, disponibilidade: [] }, { funcoes, disponibilidade: ['sabado'], email: 'x' }]) {
            assert.equal((await api(`/api/voluntarios/${outro.id_voluntario}`, { metodo: 'PUT', token: gestor.token, corpo })).status, 400);
        }
    });

    test('gestão registra recusa e retira o voluntário de uma escala futura', async () => {
        const ficha = (await api(`/api/voluntarios/${outro.id_voluntario}`, { token: gestor.token })).corpo;
        const [primeira, segunda] = ficha.proximas.filter(p => !p.recusado);
        const recusa = await api(`/api/voluntarios/${outro.id_voluntario}/escalas/${primeira.id_escala}`, { metodo: 'PATCH', token: gestor.token, corpo: { resposta: 'recusar', motivo: 'Avisou por telefone' } });
        assert.equal(recusa.status, 200);

        // Confirmar pela página de Escalas limpa a recusa
        await api(`/api/escalas/${primeira.id_escala}/participantes/${outro.id_voluntario}`, { metodo: 'PATCH', token: admin.token, corpo: { confirmado: true } });
        const depois = (await pool.query('SELECT confirmado, recusado, motivo_recusa FROM escala_participantes WHERE id_escala = $1 AND id_voluntario = $2', [primeira.id_escala, outro.id_voluntario])).rows[0];
        assert.deepEqual(depois, { confirmado: true, recusado: false, motivo_recusa: null });

        const retirada = await api(`/api/voluntarios/${outro.id_voluntario}/escalas/${segunda.id_escala}`, { metodo: 'DELETE', token: gestor.token });
        assert.equal(retirada.status, 200);
        assert.equal((await api(`/api/voluntarios/${outro.id_voluntario}/escalas/${segunda.id_escala}`, { metodo: 'DELETE', token: gestor.token })).status, 404);
    });

    test('não retira o voluntário de escala que já passou', async () => {
        const passada = (await api(`/api/voluntarios/${outro.id_voluntario}`, { token: gestor.token })).corpo.historico[0];
        if (!passada) return;
        assert.equal((await api(`/api/voluntarios/${outro.id_voluntario}/escalas/${passada.id_escala}`, { metodo: 'DELETE', token: gestor.token })).status, 404);
    });
});

describe('Acesso ao portal criado pela gestão', () => {
    let alvo;
    before(async () => { alvo = await voluntarioComEscalas(2); });

    test('sem permissão de usuários não cria acesso', async () => {
        const r = await api(`/api/voluntarios/${alvo.id_voluntario}/acesso`, { metodo: 'POST', token: gestor.token, corpo: { email: 'x@exemplo.test', senha: 'Senha123' } });
        assert.equal(r.status, 403);
    });

    test('cria acesso de perfil Voluntário, sem permissões de gestão', async () => {
        const email = `portal.${Date.now()}@exemplo.test`;
        const r = await api(`/api/voluntarios/${alvo.id_voluntario}/acesso`, { metodo: 'POST', token: admin.token, corpo: { email, senha: 'Senha123' } });
        assert.equal(r.status, 201);
        const salvo = (await pool.query('SELECT perfil, permissoes, id_membro FROM usuarios WHERE email = $1', [email])).rows[0];
        assert.equal(salvo.perfil, 'VOLUNTARIO');
        assert.equal(salvo.id_membro, alvo.id_membro);
        assert.ok(Object.values(salvo.permissoes).every(p => p === false));

        const login = await api('/api/auth/login', { metodo: 'POST', corpo: { login: email, senha: 'Senha123' } });
        assert.equal(login.status, 200);
        assert.equal((await api('/api/portal', { token: login.corpo.token })).corpo.id_voluntario, alvo.id_voluntario);
        assert.equal((await api('/api/usuarios', { token: login.corpo.token })).status, 403);

        // Segundo acesso para o mesmo voluntário → 409
        assert.equal((await api(`/api/voluntarios/${alvo.id_voluntario}/acesso`, { metodo: 'POST', token: admin.token, corpo: { email: `outro.${email}`, senha: 'Senha123' } })).status, 409);

        // Bloquear o acesso derruba o login na hora
        assert.equal((await api(`/api/voluntarios/${alvo.id_voluntario}/acesso`, { metodo: 'PATCH', token: admin.token, corpo: { ativo: false } })).status, 200);
        assert.equal((await api('/api/portal', { token: login.corpo.token })).status, 401);
        assert.equal((await api('/api/auth/login', { metodo: 'POST', corpo: { login: email, senha: 'Senha123' } })).status, 403);
    });

    test('e-mail e senha do acesso são validados', async () => {
        const novo = await voluntarioComEscalas(3);
        for (const corpo of [{ email: 'invalido', senha: 'Senha123' }, { email: 'ok@exemplo.test', senha: '123' }, { email: admin.email, senha: 'Senha123' }]) {
            const r = await api(`/api/voluntarios/${novo.id_voluntario}/acesso`, { metodo: 'POST', token: admin.token, corpo });
            assert.ok([400, 409].includes(r.status), `esperado 400/409, veio ${r.status}`);
        }
    });

    test('não bloqueia por aqui um login de gestão ligado ao membro', async () => {
        const membro = await voluntarioComEscalas(4);
        await criarUsuario({ perfil: 'GESTOR', permissoes: TODAS, id_membro: membro.id_membro });
        const r = await api(`/api/voluntarios/${membro.id_voluntario}/acesso`, { metodo: 'PATCH', token: admin.token, corpo: { ativo: false } });
        assert.equal(r.status, 400);
    });
});
