// =========================================================
// Escalas de eventos que já começaram (em andamento) ou terminaram:
// somente consulta. Toda alteração é recusada pelo backend, mesmo
// chamando a API direto. Horário de referência: America/Sao_Paulo.
// =========================================================

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar, encerrar, api, criarUsuario, pool, TODAS, NENHUMA } = require('./apoio');

const REALIZADO = /já foi realizado\. Sua escala está disponível somente para consulta e não pode mais ser alterada/;
const ANDAMENTO = /está em andamento\. Sua escala está disponível somente para consulta/;

let admin;
let funcao;
let vol;             // ids de voluntários ativos e aptos na função (sem login)
let eventos = {};    // { passado, andamento, madrugada, futuro } → { id_evento, id_escala }
let portal;          // login de portal do voluntário vol[0]

// Cria evento + escala com os voluntários informados. "quando" é SQL que devolve
// (data_evento, hora_inicio, hora_fim) relativos ao horário atual de São Paulo.
async function criarCenario(nome, quando, voluntarios) {
    const { data, inicio, fim } = (await pool.query(
        `WITH agora AS (SELECT now() AT TIME ZONE 'America/Sao_Paulo' AS t)
         SELECT to_char(x.data, 'YYYY-MM-DD') AS data, to_char(x.inicio, 'HH24:MI') AS inicio, to_char(x.fim, 'HH24:MI') AS fim
         FROM (SELECT ${quando} FROM agora) x`
    )).rows[0];
    const id_evento = (await pool.query(
        `INSERT INTO eventos (nome, data_evento, hora_inicio, hora_fim, tipo_evento) VALUES ($1, $2, $3, $4, 'culto') RETURNING id_evento`,
        [nome, data, inicio, fim]
    )).rows[0].id_evento;
    const id_escala = (await pool.query(
        `INSERT INTO escalas (id_evento, id_funcao, qtd_voluntarios, data_escala, horario) VALUES ($1, $2, 3, $3, $4) RETURNING id_escala`,
        [id_evento, funcao, data, inicio]
    )).rows[0].id_escala;
    for (const [id, confirmado] of voluntarios) {
        await pool.query(
            `INSERT INTO escala_participantes (id_escala, id_voluntario, id_funcao, confirmado, respondido_em)
             VALUES ($1, $2, $3, $4, CASE WHEN $4 THEN CURRENT_TIMESTAMP END)`,
            [id_escala, id, funcao, confirmado]
        );
    }
    return { id_evento, id_escala, data };
}

const participantes = id => pool.query(
    'SELECT id_voluntario, confirmado, recusado, motivo_recusa, respondido_em FROM escala_participantes WHERE id_escala = $1 ORDER BY id_voluntario', [id]
).then(r => r.rows);

before(async () => {
    await iniciar();
    admin = await criarUsuario({ perfil: 'ADMINISTRADOR', permissoes: TODAS });

    const linha = (await pool.query(
        `SELECT vf.id_funcao, array_agg(v.id_voluntario ORDER BY v.id_voluntario) AS ids
         FROM voluntario_funcoes vf
         JOIN voluntarios v ON v.id_voluntario = vf.id_voluntario
         JOIN membros m ON m.id_membro = v.id_membro
         WHERE v.ativo AND m.ativo AND m.apto_voluntario
           AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.id_membro = v.id_membro)
         GROUP BY vf.id_funcao HAVING COUNT(*) >= 4
         ORDER BY vf.id_funcao LIMIT 1`
    )).rows[0];
    funcao = linha.id_funcao;
    vol = linha.ids;

    const equipe = [[vol[0], false], [vol[1], true]];
    eventos.passado = await criarCenario('Bloqueio: realizado',
        "(t - INTERVAL '1 day')::date AS data, TIME '19:00' AS inicio, TIME '21:00' AS fim", equipe);
    // Hoje, o dia todo: em andamento a qualquer hora em que o teste rodar (sem atravessar a meia-noite)
    eventos.andamento = await criarCenario('Bloqueio: em andamento',
        "t::date AS data, TIME '00:00' AS inicio, TIME '23:59' AS fim", equipe);
    // Começou ontem e termina hoje (atravessa a meia-noite): término <= início
    eventos.madrugada = await criarCenario('Bloqueio: atravessa a meia-noite',
        "(t - INTERVAL '23 hours')::date AS data, (t + INTERVAL '1 hour')::time AS inicio, (t + INTERVAL '1 hour')::time AS fim", equipe);
    eventos.futuro = await criarCenario('Bloqueio: futuro',
        "(t + INTERVAL '3 days')::date AS data, TIME '19:00' AS inicio, TIME '21:00' AS fim", equipe);

    const { id_membro } = (await pool.query('SELECT id_membro FROM voluntarios WHERE id_voluntario = $1', [vol[0]])).rows[0];
    portal = await criarUsuario({ perfil: 'VOLUNTARIO', permissoes: NENHUMA, id_membro });
});
after(encerrar);

describe('Critério: o evento já começou ou terminou?', () => {
    test('situação calculada pelos horários reais (inclusive atravessando a meia-noite)', async () => {
        const situacao = async ({ id_escala }) => (await api(`/api/escalas/${id_escala}`, { token: admin.token })).corpo;
        assert.deepEqual([await situacao(eventos.passado)].map(e => [e.realizado, e.bloqueada]), [[true, true]]);
        assert.deepEqual([await situacao(eventos.andamento)].map(e => [e.realizado, e.bloqueada]), [[false, true]]);
        assert.deepEqual([await situacao(eventos.madrugada)].map(e => [e.realizado, e.bloqueada]), [[false, true]],
            'evento que atravessa a meia-noite e ainda não terminou não é "realizado"');
        assert.deepEqual([await situacao(eventos.futuro)].map(e => [e.realizado, e.bloqueada]), [[false, false]]);
    });
});

describe('Evento realizado: escala somente consulta', () => {
    test('nenhuma alteração passa pela API e o histórico continua igual', async () => {
        const { id_escala } = eventos.passado;
        const antes = await participantes(id_escala);
        const chamadas = [
            [`/api/escalas/${id_escala}/participantes/${vol[0]}`, 'PATCH', { confirmado: true }],
            [`/api/escalas/${id_escala}/participantes/${vol[0]}/substituir`, 'POST', { id_voluntario: vol[2] }],
            [`/api/voluntarios/${vol[0]}/escalas/${id_escala}`, 'PATCH', { resposta: 'confirmar' }],
            [`/api/voluntarios/${vol[1]}/escalas/${id_escala}`, 'DELETE'],
            ['/api/escalas', 'POST', { data: eventos.passado.data, id_evento: eventos.passado.id_evento, horario: '18:00', id_funcao: funcao, qtd_voluntarios: 1, voluntarios: [vol[3]] }]
        ];
        for (const [rota, metodo, corpo] of chamadas) {
            const r = await api(rota, { metodo, token: admin.token, corpo });
            assert.equal(r.status, 409, `${metodo} ${rota}`);
            assert.match(r.corpo.erro, REALIZADO, `${metodo} ${rota}`);
        }
        const r = await api(`/api/portal/escalas/${id_escala}`, { metodo: 'PATCH', token: portal.token, corpo: { resposta: 'confirmar' } });
        assert.equal(r.status, 409);
        assert.equal((await api(`/api/portal/escalas/${id_escala}/substitutos`, { token: portal.token })).status, 409);
        assert.equal((await api(`/api/portal/escalas/${id_escala}/passar`, { metodo: 'POST', token: portal.token, corpo: { id_voluntario: vol[2] } })).status, 409);

        assert.deepEqual(await participantes(id_escala), antes, 'voluntários e confirmações do evento realizado não mudam');
        assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM escalas WHERE id_evento = $1', [eventos.passado.id_evento])).rows[0].n, 1);
    });
});

describe('Evento em andamento: escala travada', () => {
    test('confirmar, substituir, responder, retirar e incluir são recusados', async () => {
        for (const cenario of [eventos.andamento, eventos.madrugada]) {
            const { id_escala } = cenario;
            const antes = await participantes(id_escala);
            for (const [rota, metodo, corpo] of [
                [`/api/escalas/${id_escala}/participantes/${vol[0]}`, 'PATCH', { confirmado: true }],
                [`/api/escalas/${id_escala}/participantes/${vol[0]}/substituir`, 'POST', { id_voluntario: vol[2] }],
                [`/api/voluntarios/${vol[0]}/escalas/${id_escala}`, 'PATCH', { resposta: 'recusar', motivo: 'Teste' }],
                [`/api/voluntarios/${vol[1]}/escalas/${id_escala}`, 'DELETE']
            ]) {
                const r = await api(rota, { metodo, token: admin.token, corpo });
                assert.equal(r.status, 409, `${metodo} ${rota}`);
                assert.match(r.corpo.erro, ANDAMENTO);
            }
            assert.equal((await api(`/api/portal/escalas/${id_escala}`, { metodo: 'PATCH', token: portal.token, corpo: { resposta: 'confirmar' } })).status, 409);
            assert.deepEqual(await participantes(id_escala), antes);
        }
        const nova = await api('/api/escalas', {
            metodo: 'POST', token: admin.token,
            corpo: { data: eventos.andamento.data, id_evento: eventos.andamento.id_evento, horario: '18:00', id_funcao: funcao, qtd_voluntarios: 1, voluntarios: [vol[3]] }
        });
        assert.equal(nova.status, 409);
    });

    test('o evento não pode ser removido nem mudar de data/início; ajustar o término pode', async () => {
        const { id_evento } = eventos.andamento;
        const atual = (await pool.query(
            `SELECT to_char(data_evento, 'YYYY-MM-DD') AS data, to_char(hora_inicio, 'HH24:MI') AS inicio, to_char(hora_fim, 'HH24:MI') AS fim
             FROM eventos WHERE id_evento = $1`, [id_evento])).rows[0];
        assert.equal((await api(`/api/eventos/${id_evento}`, { metodo: 'DELETE', token: admin.token })).status, 409);

        const outraData = (await pool.query("SELECT to_char($1::date + 7, 'YYYY-MM-DD') AS d", [atual.data])).rows[0].d;
        const mudaData = await api(`/api/eventos/${id_evento}`, { metodo: 'PUT', token: admin.token, corpo: { nome: 'X', data_evento: outraData, tipo_evento: 'culto', hora_inicio: atual.inicio, hora_fim: atual.fim } });
        assert.equal(mudaData.status, 409);

        // Só o nome muda (término igual): permitido, a escala não é afetada
        if (atual.fim > atual.inicio) {
            const ajuste = await api(`/api/eventos/${id_evento}`, { metodo: 'PUT', token: admin.token, corpo: { nome: 'Bloqueio: em andamento (ajustado)', data_evento: atual.data, tipo_evento: 'culto', hora_inicio: atual.inicio, hora_fim: atual.fim } });
            assert.equal(ajuste.status, 200);
        }
    });
});

describe('Evento futuro: continua editável', () => {
    test('confirmar e substituir funcionam normalmente', async () => {
        const { id_escala } = eventos.futuro;
        assert.equal((await api(`/api/escalas/${id_escala}/participantes/${vol[0]}`, { metodo: 'PATCH', token: admin.token, corpo: { confirmado: true } })).status, 200);
        assert.equal((await api(`/api/escalas/${id_escala}/participantes/${vol[0]}/substituir`, { metodo: 'POST', token: admin.token, corpo: { id_voluntario: vol[2] } })).status, 200);
    });

    test('não cria escala com evento novo que já começou', async () => {
        const ontem = (await pool.query("SELECT to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date - 1, 'YYYY-MM-DD') AS d")).rows[0].d;
        const r = await api('/api/escalas', {
            metodo: 'POST', token: admin.token,
            corpo: { data: ontem, horario: '18:00', id_funcao: funcao, qtd_voluntarios: 1, voluntarios: [vol[3]],
                     evento: { nome: 'Retroativo', tipo_evento: 'culto', hora_inicio: '19:00', hora_fim: '21:00' } }
        });
        assert.equal(r.status, 409);
        assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM eventos WHERE nome = 'Retroativo'")).rows[0].n, 0, 'nada foi gravado');
    });
});
