// =========================================================
// Eventos realizados (somente leitura), confirmações pendentes,
// substituição de voluntário e relatórios guardados no servidor
// =========================================================

const os = require('os');
const fs = require('fs');
const path = require('path');

// Os arquivos de relatório dos testes vão para uma pasta temporária própria
process.env.PASTA_ARQUIVOS = fs.mkdtempSync(path.join(os.tmpdir(), 'igreja-relatorios-'));

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar, encerrar, api, criarUsuario, pool, TODAS, NENHUMA } = require('./apoio');

const somarDias = dias => {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

let admin;
let soEscalas;
let soRelatorios;
let padrao;
let funcao;          // função com voluntários elegíveis
let elegiveis;       // ids de voluntários ativos e aptos nessa função
let passado;         // evento realizado (com escala)
let futuro;          // evento futuro (com escala)
let escalaFutura;

async function criarEvento(nome, data, horaInicio = '19:00', horaFim = '21:00') {
    return (await pool.query(
        `INSERT INTO eventos (nome, data_evento, hora_inicio, hora_fim, tipo_evento) VALUES ($1, $2, $3, $4, 'culto') RETURNING id_evento`,
        [nome, data, horaInicio, horaFim]
    )).rows[0].id_evento;
}

async function criarEscala(idEvento, data, voluntarios, qtd = 3) {
    const id = (await pool.query(
        `INSERT INTO escalas (id_evento, id_funcao, qtd_voluntarios, data_escala, horario) VALUES ($1, $2, $3, $4, '18:30') RETURNING id_escala`,
        [idEvento, funcao, qtd, data]
    )).rows[0].id_escala;
    for (const [idVoluntario, confirmado, recusado] of voluntarios) {
        await pool.query(
            `INSERT INTO escala_participantes (id_escala, id_voluntario, id_funcao, confirmado, recusado, motivo_recusa, respondido_em)
             VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $4 OR $5 THEN CURRENT_TIMESTAMP END)`,
            [id, idVoluntario, funcao, confirmado, recusado, recusado ? 'Viagem' : null]
        );
    }
    return id;
}

before(async () => {
    await iniciar();
    admin = await criarUsuario({ perfil: 'ADMINISTRADOR', permissoes: TODAS });
    soEscalas = await criarUsuario({ perfil: 'GESTOR', permissoes: { ...NENHUMA, escalas: true } });
    soRelatorios = await criarUsuario({ perfil: 'FINANCEIRO', permissoes: { ...NENHUMA, relatorios: true } });
    padrao = await criarUsuario({ perfil: 'VISUALIZACAO', permissoes: NENHUMA });

    const linha = (await pool.query(
        `SELECT vf.id_funcao, array_agg(v.id_voluntario ORDER BY v.id_voluntario) AS ids
         FROM voluntario_funcoes vf
         JOIN voluntarios v ON v.id_voluntario = vf.id_voluntario
         JOIN membros m ON m.id_membro = v.id_membro
         WHERE v.ativo AND m.ativo AND m.apto_voluntario
         GROUP BY vf.id_funcao HAVING COUNT(*) >= 5
         ORDER BY vf.id_funcao LIMIT 1`
    )).rows[0];
    funcao = linha.id_funcao;
    elegiveis = linha.ids;

    passado = await criarEvento('Evento de teste realizado', somarDias(-3));
    await criarEscala(passado, somarDias(-3), [[elegiveis[0], true, false], [elegiveis[1], false, true], [elegiveis[2], false, false]], 4);
    futuro = await criarEvento('Evento de teste futuro', somarDias(5));
    escalaFutura = await criarEscala(futuro, somarDias(5), [[elegiveis[0], false, false], [elegiveis[1], true, false]], 3);
});
after(async () => {
    await encerrar();
    fs.rmSync(process.env.PASTA_ARQUIVOS, { recursive: true, force: true });
});

describe('Eventos: próximos x realizados', () => {
    test('a lista separa pelo horário de término real', async () => {
        const lista = (await api('/api/eventos', { token: soEscalas.token })).corpo;
        assert.equal(lista.find(e => e.id_evento === passado).realizado, true);
        assert.equal(lista.find(e => e.id_evento === futuro).realizado, false);
    });

    test('evento de hoje que ainda não terminou continua nos próximos', async () => {
        const hoje = await criarEvento('Evento de hoje até o fim do dia', somarDias(0), '00:00', '23:59');
        const ev = (await api('/api/eventos', { token: admin.token })).corpo.find(e => e.id_evento === hoje);
        assert.equal(ev.realizado, false);
        assert.equal(ev.em_andamento, true);
    });

    test('detalhes do evento realizado trazem funções, voluntários e totais', async () => {
        const r = await api(`/api/eventos/${passado}`, { token: soEscalas.token });
        assert.equal(r.status, 200);
        assert.equal(r.corpo.evento.realizado, true);
        assert.deepEqual(
            { ...r.corpo.resumo },
            { funcoes: 1, vagas: 4, atribuicoes: 3, pessoas: 3, confirmados: 1, recusados: 1, pendentes: 1, indefinidos: 0,
              vagas_nao_preenchidas: 2, funcoes_completas: 0, funcoes_com_pendencias: 1 }
        );
        assert.deepEqual(r.corpo.funcoes[0].participantes.map(p => p.situacao).sort(), ['confirmado', 'pendente', 'recusado']);
    });

    test('evento realizado não pode ser editado nem removido (409) e os dados continuam', async () => {
        const antes = (await pool.query('SELECT nome, data_evento FROM eventos WHERE id_evento = $1', [passado])).rows[0];
        const put = await api(`/api/eventos/${passado}`, { metodo: 'PUT', token: admin.token, corpo: { nome: 'Alterado', data_evento: somarDias(10), tipo_evento: 'culto' } });
        assert.equal(put.status, 409);
        assert.equal((await api(`/api/eventos/${passado}`, { metodo: 'DELETE', token: admin.token })).status, 409);
        const depois = (await pool.query('SELECT nome, data_evento FROM eventos WHERE id_evento = $1', [passado])).rows[0];
        assert.deepEqual(depois, antes);
        assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM escalas WHERE id_evento = $1', [passado])).rows[0].n, 1);
    });
});

describe('Confirmações pendentes e substituição', () => {
    test('a lista traz só quem não confirmou nem recusou', async () => {
        const r = await api('/api/escalas/pendentes', { token: soEscalas.token });
        assert.equal(r.status, 200);
        const daEscala = r.corpo.filter(p => p.id_escala === escalaFutura);
        assert.deepEqual(daEscala.map(p => p.id_voluntario), [elegiveis[0]]);
        assert.ok(daEscala[0].evento && daEscala[0].funcao && daEscala[0].voluntario);
        assert.equal((await api('/api/escalas/pendentes', { token: soRelatorios.token })).status, 403);
    });

    test('substituir troca a mesma vaga e a confirmação volta para aguardando', async () => {
        await pool.query('UPDATE escala_participantes SET confirmado = TRUE WHERE id_escala = $1 AND id_voluntario = $2', [escalaFutura, elegiveis[0]]);
        const r = await api(`/api/escalas/${escalaFutura}/participantes/${elegiveis[0]}/substituir`, {
            metodo: 'POST', token: soEscalas.token, corpo: { id_voluntario: elegiveis[3] }
        });
        assert.equal(r.status, 200);
        const linhas = (await pool.query('SELECT id_voluntario, confirmado, recusado FROM escala_participantes WHERE id_escala = $1 ORDER BY id_voluntario', [escalaFutura])).rows;
        assert.equal(linhas.length, 2, 'não pode surgir uma atribuição a mais');
        assert.ok(!linhas.some(l => l.id_voluntario === elegiveis[0]));
        assert.deepEqual(linhas.find(l => l.id_voluntario === elegiveis[3]), { id_voluntario: elegiveis[3], confirmado: false, recusado: false });
    });

    test('não aceita quem já está na escala, quem não é elegível nem evento realizado', async () => {
        const rota = `/api/escalas/${escalaFutura}/participantes/${elegiveis[3]}/substituir`;
        assert.equal((await api(rota, { metodo: 'POST', token: admin.token, corpo: { id_voluntario: elegiveis[1] } })).status, 409);

        const inelegivel = (await pool.query(
            `SELECT v.id_voluntario FROM voluntarios v WHERE NOT EXISTS
               (SELECT 1 FROM voluntario_funcoes vf WHERE vf.id_voluntario = v.id_voluntario AND vf.id_funcao = $1) LIMIT 1`, [funcao]
        )).rows[0]?.id_voluntario;
        if (inelegivel) assert.equal((await api(rota, { metodo: 'POST', token: admin.token, corpo: { id_voluntario: inelegivel } })).status, 400);

        const escalaPassada = (await pool.query('SELECT id_escala FROM escalas WHERE id_evento = $1', [passado])).rows[0].id_escala;
        const r = await api(`/api/escalas/${escalaPassada}/participantes/${elegiveis[2]}/substituir`, { metodo: 'POST', token: admin.token, corpo: { id_voluntario: elegiveis[4] } });
        assert.equal(r.status, 409);
        assert.equal((await api(rota, { metodo: 'POST', token: soRelatorios.token, corpo: { id_voluntario: elegiveis[4] } })).status, 403);
    });
});

describe('Relatórios guardados no servidor', () => {
    let registro;

    test('relatório por evento gera um PDF, registra no histórico e guarda o arquivo', async () => {
        const r = await api('/api/relatorios/gerar', { metodo: 'POST', token: soRelatorios.token, corpo: { tipo: 'evento', id_evento: passado } });
        assert.equal(r.status, 201);
        registro = r.corpo;
        assert.equal(registro.tipo, 'evento');
        assert.equal(registro.id_evento, passado);
        assert.match(registro.nome_arquivo, /^relatorio-evento-evento-de-teste-realizado-.*\.pdf$/);

        const recentes = (await api('/api/relatorios', { token: soRelatorios.token })).corpo.recentes;
        const noHistorico = recentes.find(rel => rel.id_relatorio === registro.id_relatorio);
        assert.ok(noHistorico?.tem_arquivo);
        assert.equal(noHistorico.arquivo, undefined, 'o caminho interno não vai para o navegador');
        assert.equal(recentes[0].id_relatorio, registro.id_relatorio, 'mais novos primeiro');
    });

    test('visualizar e baixar entregam o mesmo arquivo salvo, sem gerar de novo', async () => {
        const total = (await pool.query('SELECT COUNT(*)::int AS n FROM relatorios_gerados')).rows[0].n;
        const ver = await fetch(`${require('./apoio').base}/api/relatorios/historico/${registro.id_relatorio}/arquivo`, { headers: { Authorization: `Bearer ${soRelatorios.token}` } });
        const baixar = await fetch(`${require('./apoio').base}/api/relatorios/historico/${registro.id_relatorio}/arquivo?download=1`, { headers: { Authorization: `Bearer ${soRelatorios.token}` } });
        assert.equal(ver.status, 200);
        assert.equal(ver.headers.get('content-type'), 'application/pdf');
        assert.match(baixar.headers.get('content-disposition'), /^attachment; filename="relatorio-evento-/);
        const [a, b] = [Buffer.from(await ver.arrayBuffer()), Buffer.from(await baixar.arrayBuffer())];
        assert.ok(a.subarray(0, 5).toString() === '%PDF-' && a.equals(b));
        assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM relatorios_gerados')).rows[0].n, total);
    });

    test('gerar de novo cria outro registro e outro arquivo (não sobrescreve)', async () => {
        const r = await api('/api/relatorios/gerar', { metodo: 'POST', token: admin.token, corpo: { tipo: 'evento', id_evento: passado } });
        assert.equal(r.status, 201);
        assert.notEqual(r.corpo.id_relatorio, registro.id_relatorio);
        const arquivos = (await pool.query('SELECT arquivo FROM relatorios_gerados WHERE id_relatorio = ANY($1)', [[registro.id_relatorio, r.corpo.id_relatorio]])).rows;
        assert.notEqual(arquivos[0].arquivo, arquivos[1].arquivo);
    });

    test('relatório em tabela (CSV) também fica guardado', async () => {
        const r = await api('/api/relatorios/gerar', { metodo: 'POST', token: admin.token, corpo: { tipo: 'escalas', formato: 'csv', filtros: { status: 'pendentes' } } });
        assert.equal(r.status, 201);
        const arquivo = await api(`/api/relatorios/historico/${r.corpo.id_relatorio}/arquivo`, { token: admin.token });
        assert.equal(arquivo.status, 200);
        assert.match(arquivo.texto, /"Data";"Evento";"Função"/);
    });

    test('arquivo alterado no disco é recusado como corrompido; sem permissão → 403', async () => {
        const { arquivo } = (await pool.query('SELECT arquivo FROM relatorios_gerados WHERE id_relatorio = $1', [registro.id_relatorio])).rows[0];
        fs.appendFileSync(path.join(process.env.PASTA_ARQUIVOS, arquivo), 'x');
        assert.equal((await api(`/api/relatorios/historico/${registro.id_relatorio}/arquivo`, { token: admin.token })).status, 409);
        assert.equal((await api(`/api/relatorios/historico/${registro.id_relatorio}/arquivo`, { token: padrao.token })).status, 403);
        assert.equal((await api(`/api/relatorios/historico/${registro.id_relatorio}/arquivo`, { token: soEscalas.token })).status, 403);
        assert.equal((await api('/api/relatorios/gerar', { metodo: 'POST', token: soEscalas.token, corpo: { tipo: 'evento', id_evento: passado } })).status, 403);
    });
});
