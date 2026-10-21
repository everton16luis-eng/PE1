// =========================================================
// Regras das melhorias: cadastro como visitante, classificação
// pelo administrador, Usuários sem contas do portal, ordem das
// turmas, edição/remoção de eventos e escalas da semana.
// =========================================================

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar, encerrar, api, criarUsuario, contar, voluntarioComEscalas, pool, TODAS, NENHUMA } = require('./apoio');

let admin;
let secretaria; // tem "participantes", mas não é administrador

before(async () => {
    await iniciar();
    admin = await criarUsuario({ perfil: 'ADMINISTRADOR', permissoes: TODAS });
    secretaria = await criarUsuario({ perfil: 'SECRETARIA', permissoes: { ...NENHUMA, participantes: true, escalas: false } });
});
after(encerrar);

describe('Cadastro de pessoas: sempre como visitante', () => {
    test('campos de membro, voluntário ou perfil enviados pelo navegador são ignorados', async () => {
        const antes = await contar('membros', 'voluntarios', 'usuarios');
        const r = await api('/api/participantes', {
            metodo: 'POST', token: secretaria.token,
            corpo: {
                tipo: 'membro', nome: 'Pessoa Nova', email: 'pessoa.nova@exemplo.test', data_nascimento: '1990-05-10',
                estado_civil: 'Casado(a)', endereco: 'Rua A', numero: '10', bairro: 'Centro',
                apto_voluntario: true, voluntario: true, id_funcao: 1, perfil: 'ADMINISTRADOR', ativo: true
            }
        });
        assert.equal(r.status, 201);
        assert.equal(r.corpo.tipo, 'visitante');
        assert.equal(r.corpo.email, 'pessoa.nova@exemplo.test');
        assert.equal(r.corpo.endereco, 'Rua A, 10 - Centro');
        assert.deepEqual(await contar('membros', 'voluntarios', 'usuarios'), antes, 'não pode criar membro, voluntário ou login');
    });

    test('validações do cadastro', async () => {
        for (const [corpo, motivo] of [
            [{ nome: '  ' }, 'nome vazio'],
            [{ nome: 'Ana', email: 'sem-arroba' }, 'e-mail inválido'],
            [{ nome: 'Ana', data_nascimento: '2999-01-01' }, 'nascimento no futuro'],
            [{ nome: 'Ana', data_visita: '21/10/2026' }, 'data fora do formato']
        ]) {
            const r = await api('/api/participantes', { metodo: 'POST', token: secretaria.token, corpo });
            assert.equal(r.status, 400, motivo);
            assert.ok(r.corpo.erro, `${motivo}: deveria explicar o erro`);
        }
    });
});

describe('Classificação: só o administrador', () => {
    let visitante;
    before(async () => {
        visitante = (await api('/api/participantes', {
            metodo: 'POST', token: secretaria.token,
            corpo: { nome: 'Visitante Promovido', telefone: '(47) 90000-1111', email: 'promovido@exemplo.test', data_nascimento: '1985-03-02' }
        })).corpo;
    });

    test('quem não é administrador não promove nem altera classificação', async () => {
        assert.equal((await api(`/api/participantes/visitantes/${visitante.id_visitante}/membro`, { metodo: 'POST', token: secretaria.token, corpo: {} })).status, 403);
        const membro = (await pool.query('SELECT id_membro FROM membros WHERE ativo LIMIT 1')).rows[0];
        assert.equal((await api(`/api/participantes/membros/${membro.id_membro}`, { metodo: 'PATCH', token: secretaria.token, corpo: { apto_voluntario: true } })).status, 403);
    });

    test('administrador promove visitante a membro (dados copiados, sem virar apto)', async () => {
        const r = await api(`/api/participantes/visitantes/${visitante.id_visitante}/membro`, {
            metodo: 'POST', token: admin.token, corpo: { data_entrada_igreja: '2026-10-01', data_batismo: '2020-05-10', participa_celula: true }
        });
        assert.equal(r.status, 201);
        assert.equal(r.corpo.nome_completo, 'Visitante Promovido');
        assert.equal(r.corpo.email, 'promovido@exemplo.test');
        assert.equal(r.corpo.telefone, '(47) 90000-1111');
        assert.equal(r.corpo.apto_voluntario, false);
        assert.equal(r.corpo.participa_celula, true);

        // O visitante fica como histórico, ligado ao membro, e some da lista de visitantes
        const historico = (await pool.query('SELECT id_membro, promovido_em FROM visitantes WHERE id_visitante = $1', [visitante.id_visitante])).rows[0];
        assert.equal(historico.id_membro, r.corpo.id_membro);
        assert.ok(historico.promovido_em);
        const lista = (await api('/api/participantes', { token: admin.token })).corpo.participantes;
        assert.ok(!lista.some(p => p.tipo === 'visitante' && p.id === visitante.id_visitante));
        assert.ok(lista.some(p => p.tipo === 'membro' && p.id === r.corpo.id_membro));

        // Não promove duas vezes
        assert.equal((await api(`/api/participantes/visitantes/${visitante.id_visitante}/membro`, { metodo: 'POST', token: admin.token, corpo: {} })).status, 409);
        assert.equal((await api('/api/participantes/visitantes/999999/membro', { metodo: 'POST', token: admin.token, corpo: {} })).status, 404);
    });

    test('apto ao voluntariado e status respeitam as regras', async () => {
        const novo = (await api('/api/participantes', { metodo: 'POST', token: admin.token, corpo: { nome: 'Futuro Voluntário' } })).corpo;
        const membro = (await api(`/api/participantes/visitantes/${novo.id_visitante}/membro`, { metodo: 'POST', token: admin.token, corpo: {} })).corpo;
        const rota = `/api/participantes/membros/${membro.id_membro}`;

        assert.equal((await api(rota, { metodo: 'PATCH', token: admin.token, corpo: { apto_voluntario: true } })).corpo.apto_voluntario, true);

        // Inativar também retira o "apto"
        const inativo = await api(rota, { metodo: 'PATCH', token: admin.token, corpo: { ativo: false } });
        assert.deepEqual([inativo.corpo.ativo, inativo.corpo.apto_voluntario], [false, false]);

        // Membro inativo não pode ser marcado como apto
        assert.equal((await api(rota, { metodo: 'PATCH', token: admin.token, corpo: { apto_voluntario: true } })).status, 400);
        assert.equal((await api(rota, { metodo: 'PATCH', token: admin.token, corpo: {} })).status, 400);
    });

    test('voluntário ativo não perde o "apto" nem é inativado por aqui', async () => {
        const v = await voluntarioComEscalas(0);
        for (const corpo of [{ apto_voluntario: false }, { ativo: false }]) {
            const r = await api(`/api/participantes/membros/${v.id_membro}`, { metodo: 'PATCH', token: admin.token, corpo });
            assert.equal(r.status, 409);
        }
    });
});

describe('Usuários: só contas de gestão', () => {
    test('logins do portal (perfil Voluntário) não aparecem nem contam no resumo', async () => {
        const v = await voluntarioComEscalas(1);
        const portal = await criarUsuario({ perfil: 'VOLUNTARIO', permissoes: NENHUMA, id_membro: v.id_membro });
        const r = await api('/api/usuarios', { token: admin.token });
        assert.equal(r.status, 200);
        assert.ok(!r.corpo.usuarios.some(u => u.perfil === 'VOLUNTARIO'));
        assert.ok(!r.corpo.usuarios.some(u => u.id_usuario === portal.id));
        const gestao = (await pool.query("SELECT COUNT(*)::int AS n FROM usuarios WHERE perfil <> 'VOLUNTARIO'")).rows[0].n;
        assert.equal(r.corpo.resumo.total, gestao);
    });

    test('membro/voluntário com conta de gestão continua aparecendo', async () => {
        const v = await voluntarioComEscalas(2);
        const gestor = await criarUsuario({ perfil: 'GESTOR', permissoes: TODAS, id_membro: v.id_membro });
        const lista = (await api('/api/usuarios', { token: admin.token })).corpo.usuarios;
        assert.ok(lista.some(u => u.id_usuario === gestor.id));
    });

    test('a página Usuários não cria nem edita contas do portal', async () => {
        const criar = await api('/api/usuarios', { metodo: 'POST', token: admin.token, corpo: { nome: 'X', email: `x.${Date.now()}@exemplo.test`, senha: 'Senha@123', perfil: 'VOLUNTARIO' } });
        assert.equal(criar.status, 400);
        const v = await voluntarioComEscalas(3);
        const portal = await criarUsuario({ perfil: 'VOLUNTARIO', permissoes: NENHUMA, id_membro: v.id_membro });
        const editar = await api(`/api/usuarios/${portal.id}`, { metodo: 'PUT', token: admin.token, corpo: { nome: 'X', email: portal.email, perfil: 'GESTOR' } });
        assert.equal(editar.status, 400);
        assert.equal((await pool.query('SELECT perfil FROM usuarios WHERE id_usuario = $1', [portal.id])).rows[0].perfil, 'VOLUNTARIO');
    });

    test('cadastrar voluntário não cria conta de usuário', async () => {
        const antes = await contar('usuarios');
        const candidato = (await pool.query(
            `SELECT m.id_membro FROM membros m
             WHERE m.ativo AND NOT EXISTS (SELECT 1 FROM voluntarios v WHERE v.id_membro = m.id_membro) LIMIT 1`
        )).rows[0];
        const funcao = (await pool.query('SELECT id_funcao FROM funcoes LIMIT 1')).rows[0].id_funcao;
        const r = await api('/api/voluntarios', { metodo: 'POST', token: admin.token, corpo: { id_membro: candidato.id_membro, funcoes: [funcao], disponibilidade: ['domingo'] } });
        assert.equal(r.status, 201);
        assert.deepEqual(await contar('usuarios'), antes);
    });
});

describe('Lista de presença: NEXT sempre por último', () => {
    test('NEXT vem depois de todas as turmas, mesmo após cadastrar outra', async () => {
        const nomes = async () => (await api('/api/presenca/turmas', { token: admin.token })).corpo.map(t => t.nome);
        assert.match((await nomes()).at(-1), /^next/i);
        const antesDoNext = (await nomes()).slice(0, -1);

        // Turma nova sem faixa etária (iria para o fim) e outra com faixa maior que a do Next
        await api('/api/presenca/turmas', { metodo: 'POST', token: admin.token, corpo: { nome: 'Zeta Teste' } });
        await pool.query("UPDATE cadastroturmas SET idade_minima = 18, idade_maxima = 30 WHERE nome = 'Zeta Teste'");
        const depois = await nomes();
        assert.match(depois.at(-1), /^next/i);
        assert.deepEqual(depois.filter(n => !/^next/i.test(n) && n !== 'Zeta Teste'), antesDoNext, 'a ordem das demais deve ser preservada');
    });
});

describe('Eventos: editar e remover', () => {
    let evento;
    before(async () => {
        evento = (await api('/api/eventos', { token: admin.token })).corpo.find(e => e.total_escalas > 0 && String(e.data_evento).slice(0, 10) > new Date().toISOString().slice(0, 10));
    });

    test('exige permissão de escalas', async () => {
        const semPermissao = await criarUsuario({ perfil: 'SECRETARIA', permissoes: { ...NENHUMA, criancas: true } });
        assert.equal((await api(`/api/eventos/${evento.id_evento}`, { metodo: 'PUT', token: semPermissao.token, corpo: {} })).status, 403);
        assert.equal((await api(`/api/eventos/${evento.id_evento}`, { metodo: 'DELETE', token: semPermissao.token })).status, 403);
    });

    test('validação da edição', async () => {
        for (const corpo of [
            { nome: '', data_evento: '2026-12-01', tipo_evento: 'culto' },
            { nome: 'X', data_evento: '01/12/2026', tipo_evento: 'culto' },
            { nome: 'X', data_evento: '2026-12-01', tipo_evento: 'festa' },
            { nome: 'X', data_evento: '2026-12-01', tipo_evento: 'culto', hora_inicio: '20:00', hora_fim: '19:00' }
        ]) {
            assert.equal((await api(`/api/eventos/${evento.id_evento}`, { metodo: 'PUT', token: admin.token, corpo })).status, 400);
        }
        assert.equal((await api('/api/eventos/abc', { metodo: 'PUT', token: admin.token, corpo: {} })).status, 400);
        assert.equal((await api('/api/eventos/999999', { metodo: 'PUT', token: admin.token, corpo: { nome: 'X', data_evento: '2026-12-01', tipo_evento: 'culto' } })).status, 404);
    });

    test('editar muda o evento e leva as escalas para a nova data', async () => {
        const r = await api(`/api/eventos/${evento.id_evento}`, {
            metodo: 'PUT', token: admin.token,
            corpo: { nome: 'Evento Editado', data_evento: '2026-12-30', tipo_evento: 'evento', hora_inicio: '18:00', hora_fim: '20:00' }
        });
        assert.equal(r.status, 200);
        assert.equal(r.corpo.nome, 'Evento Editado');
        const datas = (await pool.query('SELECT DISTINCT data_escala::text AS d FROM escalas WHERE id_evento = $1', [evento.id_evento])).rows.map(x => x.d);
        assert.deepEqual(datas, ['2026-12-30']);
    });

    test('remover apaga o evento, as escalas e os voluntários escalados nelas', async () => {
        const escalas = (await pool.query('SELECT id_escala FROM escalas WHERE id_evento = $1', [evento.id_evento])).rows.map(x => x.id_escala);
        const r = await api(`/api/eventos/${evento.id_evento}`, { metodo: 'DELETE', token: admin.token });
        assert.equal(r.status, 200);
        assert.equal(r.corpo.escalas_removidas, escalas.length);
        assert.equal((await pool.query('SELECT 1 FROM eventos WHERE id_evento = $1', [evento.id_evento])).rowCount, 0);
        assert.equal((await pool.query('SELECT 1 FROM escala_participantes WHERE id_escala = ANY($1)', [escalas])).rowCount, 0);
        assert.equal((await api(`/api/eventos/${evento.id_evento}`, { metodo: 'DELETE', token: admin.token })).status, 404);
    });
});

describe('Dashboard: escalas da semana agrupadas por evento', () => {
    test('cada evento traz funções, vagas, voluntários e totais coerentes', async () => {
        const r = await api('/api/escalasSemana', { token: admin.token });
        assert.equal(r.status, 200);
        assert.ok(Array.isArray(r.corpo));
        for (const ev of r.corpo) {
            for (const campo of ['nome', 'data', 'tipo_evento', 'funcoes', 'vagas', 'confirmados', 'pendentes', 'recusados', 'faltam']) {
                assert.ok(campo in ev, `evento sem ${campo}`);
            }
            const contagem = ev.funcoes.flatMap(f => f.voluntarios);
            assert.equal(ev.confirmados, contagem.filter(v => v.confirmado).length);
            assert.equal(ev.recusados, contagem.filter(v => v.recusado).length);
            assert.equal(ev.faltam, Math.max(ev.vagas - (ev.confirmados + ev.pendentes), 0));
        }
    });
});

describe('Minha área: experiência pela classificação real do login', () => {
    let membro;     // login ligado a um membro que não é voluntário
    let visitante;  // login sem cadastro de membro
    let voluntario; // login ligado a um voluntário com escalas

    before(async () => {
        const m = (await pool.query(
            `SELECT id_membro FROM membros m
             WHERE ativo AND NOT EXISTS (SELECT 1 FROM voluntarios v WHERE v.id_membro = m.id_membro)
               AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.id_membro = m.id_membro)
             LIMIT 1`)).rows[0];
        membro = await criarUsuario({ perfil: 'VISUALIZACAO', permissoes: NENHUMA, id_membro: m.id_membro });
        visitante = await criarUsuario({ perfil: 'VISUALIZACAO', permissoes: NENHUMA });
        const v = await voluntarioComEscalas(5);
        voluntario = { ...v, ...(await criarUsuario({ perfil: 'VOLUNTARIO', permissoes: NENHUMA, id_membro: v.id_membro })) };
    });

    const conferirEventos = eventos => {
        assert.ok(Array.isArray(eventos));
        const hoje = new Date().toLocaleDateString('sv-SE');
        const chaves = eventos.map(e => `${String(e.data_evento).slice(0, 10)} ${e.hora_inicio || '99'}`);
        assert.deepEqual(chaves, [...chaves].sort(), 'eventos fora de ordem de data/horário');
        for (const e of eventos) {
            assert.ok(new Date(e.data_evento).toLocaleDateString('sv-SE') >= hoje, 'evento passado na lista');
            assert.ok(e.nome);
        }
    };

    test('membro vê os próximos eventos, sem escalas', async () => {
        const r = await api('/api/portal', { token: membro.token });
        assert.equal(r.status, 200);
        assert.equal(r.corpo.classificacao, 'membro');
        assert.equal(r.corpo.proximas, undefined);
        assert.equal(r.corpo.historico, undefined);
        conferirEventos(r.corpo.eventos);
        assert.ok(r.corpo.eventos.length > 0, 'o banco de testes tem eventos futuros');
    });

    test('visitante (login sem cadastro de membro) vê os próximos eventos', async () => {
        const r = await api('/api/portal', { token: visitante.token });
        assert.equal(r.status, 200);
        assert.equal(r.corpo.classificacao, 'visitante');
        conferirEventos(r.corpo.eventos);
    });

    test('voluntário continua com as próprias escalas e recebe os eventos à parte', async () => {
        const r = await api('/api/portal', { token: voluntario.token });
        assert.equal(r.corpo.classificacao, 'voluntario');
        assert.equal(r.corpo.id_voluntario, voluntario.id_voluntario);
        assert.ok(r.corpo.proximas.length > 0);
        assert.ok(r.corpo.proximas.every(p => 'id_evento' in p));
        conferirEventos(r.corpo.eventos);
    });

    test('voluntário inativo não perde o acesso às próprias escalas', async () => {
        await pool.query('UPDATE voluntarios SET ativo = false WHERE id_voluntario = $1', [voluntario.id_voluntario]);
        try {
            const r = await api('/api/portal', { token: voluntario.token });
            assert.equal(r.corpo.classificacao, 'voluntario');
            assert.ok(Array.isArray(r.corpo.proximas));
        } finally {
            await pool.query('UPDATE voluntarios SET ativo = true WHERE id_voluntario = $1', [voluntario.id_voluntario]);
        }
    });

    test('membro e visitante não respondem escalas nem veem escalas de outros', async () => {
        const escala = (await api('/api/portal', { token: voluntario.token })).corpo.proximas[0];
        for (const login of [membro, visitante]) {
            const r = await api(`/api/portal/escalas/${escala.id_escala}`, { metodo: 'PATCH', token: login.token, corpo: { resposta: 'confirmar' } });
            assert.equal(r.status, 404);
            assert.equal((await api('/api/escalas/dia?data=2026-10-25', { token: login.token })).status, 403);
        }
    });
});

describe('Relatório de pendentes (destino do "Ver todas" do dashboard)', () => {
    test('pendentes de hoje em diante, das mais próximas para as mais distantes', async () => {
        const hoje = new Date().toLocaleDateString('sv-SE');
        const r = await api(`/api/relatorios/escalas?status=pendentes&inicio=${hoje}`, { token: admin.token });
        assert.equal(r.status, 200);
        const datas = r.corpo.linhas.map(l => new Date(l.data).toLocaleDateString('sv-SE'));
        assert.deepEqual(datas, [...datas].sort());
        assert.ok(r.corpo.linhas.every(l => l.status === 'Pendente'));
    });
});
