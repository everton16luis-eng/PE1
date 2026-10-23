// =========================================================
// Minha área do voluntário: passar a própria vaga para outro
// voluntário (sem a equipe) e o caminho do primeiro acesso
// (conta criada pela pessoa → liderança define voluntário).
// =========================================================

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar, encerrar, api, criarUsuario, pool, TODAS, NENHUMA } = require('./apoio');

const DIAS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

let admin;
let maria;    // voluntária escalada, com login (quem passa a vaga)
let escala;   // { id_escala, data, id_funcao }
let joao;     // { id_voluntario, nome } — livre no dia, mesma função

// Quem está livre para a vaga, conferido direto no banco (mesmas regras da tela)
async function livresNoBanco(idEscala, idVoluntario) {
    const r = await pool.query(
        `WITH esc AS (SELECT id_funcao, data_escala,
                             (ARRAY['domingo','segunda','terca','quarta','quinta','sexta','sabado'])[EXTRACT(DOW FROM data_escala)::int + 1] AS dia
                      FROM escalas WHERE id_escala = $1)
         SELECT v.id_voluntario, m.nome_completo AS nome
         FROM esc JOIN voluntario_funcoes vf ON vf.id_funcao = esc.id_funcao
         JOIN voluntarios v ON v.id_voluntario = vf.id_voluntario JOIN membros m ON m.id_membro = v.id_membro
         WHERE v.ativo AND m.ativo AND m.apto_voluntario AND v.id_voluntario <> $2 AND esc.dia = ANY (v.disponibilidade)
           AND NOT EXISTS (SELECT 1 FROM voluntario_ausencias a WHERE a.id_voluntario = v.id_voluntario AND esc.data_escala BETWEEN a.data_inicio AND a.data_fim)
           AND NOT EXISTS (SELECT 1 FROM escala_participantes ep JOIN escalas e2 ON e2.id_escala = ep.id_escala
                           WHERE ep.id_voluntario = v.id_voluntario AND e2.data_escala = esc.data_escala AND NOT ep.recusado)
         ORDER BY m.nome_completo`, [idEscala, idVoluntario]);
    return r.rows;
}

before(async () => {
    await iniciar();
    admin = await criarUsuario({ perfil: 'ADMINISTRADOR', permissoes: TODAS });

    // Uma escala futura de um voluntário sem login, para a qual existe alguém livre
    const candidatas = (await pool.query(
        `SELECT ep.id_escala, ep.id_voluntario, v.id_membro, es.id_funcao, to_char(es.data_escala, 'YYYY-MM-DD') AS data
         FROM escala_participantes ep JOIN escalas es ON es.id_escala = ep.id_escala
         JOIN voluntarios v ON v.id_voluntario = ep.id_voluntario JOIN membros m ON m.id_membro = v.id_membro
         JOIN eventos e ON e.id_evento = es.id_evento
         WHERE es.data_escala > CURRENT_DATE AND v.ativo AND m.ativo AND m.apto_voluntario
           AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.id_membro = v.id_membro)
         ORDER BY es.data_escala, ep.id_escala`)).rows;
    for (const c of candidatas) {
        const livres = await livresNoBanco(c.id_escala, c.id_voluntario);
        if (livres.length) {
            escala = { id_escala: c.id_escala, data: c.data, id_funcao: c.id_funcao };
            maria = { id_voluntario: c.id_voluntario, ...(await criarUsuario({ perfil: 'VOLUNTARIO', permissoes: NENHUMA, id_membro: c.id_membro })) };
            joao = livres[0];
            break;
        }
    }
    assert.ok(escala, 'o banco de testes precisa de uma escala futura com alguém livre para assumir');
});
after(encerrar);

const substitutos = (token, id = escala.id_escala) => api(`/api/portal/escalas/${id}/substitutos`, { token });
const passar = (token, idNovo, id = escala.id_escala) => api(`/api/portal/escalas/${id}/passar`, { metodo: 'POST', token, corpo: { id_voluntario: idNovo } });

describe('Passar a vaga: quem aparece na lista', () => {
    test('só voluntários da mesma função, disponíveis no dia, sem ausência e sem outra escala', async () => {
        const r = await substitutos(maria.token);
        assert.equal(r.status, 200);
        const esperados = await livresNoBanco(escala.id_escala, maria.id_voluntario);
        assert.deepEqual(r.corpo.substitutos.map(s => s.id_voluntario), esperados.map(s => s.id_voluntario));
        assert.ok(!r.corpo.substitutos.some(s => s.id_voluntario === maria.id_voluntario), 'a própria pessoa não aparece');

        const dia = DIAS[new Date(escala.data + 'T00:00:00Z').getUTCDay()];
        for (const s of r.corpo.substitutos) {
            const v = (await pool.query(
                `SELECT v.disponibilidade, EXISTS (SELECT 1 FROM voluntario_funcoes vf WHERE vf.id_voluntario = v.id_voluntario AND vf.id_funcao = $2) AS faz_funcao
                 FROM voluntarios v WHERE v.id_voluntario = $1`, [s.id_voluntario, escala.id_funcao])).rows[0];
            assert.ok(v.disponibilidade.includes(dia), `${s.nome} não marcou ${dia}`);
            assert.ok(v.faz_funcao, `${s.nome} não atua na função`);
        }
    });

    test('a lista mostra só o nome (nenhum telefone ou e-mail de outros voluntários)', async () => {
        const r = await substitutos(maria.token);
        for (const s of r.corpo.substitutos) assert.deepEqual(Object.keys(s).sort(), ['id_voluntario', 'nome']);
    });

    test('quem já está escalado no mesmo dia não aparece', async () => {
        const ocupado = (await pool.query(
            `SELECT ep.id_voluntario FROM escala_participantes ep JOIN escalas es ON es.id_escala = ep.id_escala
             WHERE es.data_escala = $1 AND ep.id_voluntario <> $2 AND NOT ep.recusado LIMIT 1`, [escala.data, maria.id_voluntario])).rows[0];
        const lista = (await substitutos(maria.token)).corpo.substitutos;
        if (ocupado) assert.ok(!lista.some(s => s.id_voluntario === ocupado.id_voluntario));
    });

    test('só para a própria escala futura; outros logins não usam', async () => {
        const outra = (await pool.query(
            `SELECT es.id_escala FROM escalas es WHERE es.data_escala > CURRENT_DATE
             AND NOT EXISTS (SELECT 1 FROM escala_participantes ep WHERE ep.id_escala = es.id_escala AND ep.id_voluntario = $1) LIMIT 1`,
            [maria.id_voluntario])).rows[0];
        assert.equal((await substitutos(maria.token, outra.id_escala)).status, 404, 'escala de outra pessoa');
        const passada = (await pool.query(
            `SELECT ep.id_escala FROM escala_participantes ep JOIN escalas es ON es.id_escala = ep.id_escala
             WHERE ep.id_voluntario = $1 AND es.data_escala < CURRENT_DATE LIMIT 1`, [maria.id_voluntario])).rows[0];
        if (passada) assert.equal((await substitutos(maria.token, passada.id_escala)).status, 404, 'escala que já passou');
        assert.equal((await substitutos(maria.token, 'abc')).status, 400);

        const comum = await criarUsuario({ perfil: 'VISUALIZACAO', permissoes: NENHUMA });
        assert.equal((await substitutos(comum.token)).status, 404, 'quem não é voluntário não tem vaga');
        assert.equal((await passar(comum.token, joao.id_voluntario)).status, 404);
    });
});

describe('Passar a vaga: a troca', () => {
    test('pedidos inválidos são recusados sem mexer na escala', async () => {
        const antes = (await pool.query('SELECT id_voluntario FROM escala_participantes WHERE id_escala = $1 ORDER BY 1', [escala.id_escala])).rows;
        assert.equal((await passar(maria.token, maria.id_voluntario)).status, 400, 'para si mesma');
        assert.equal((await passar(maria.token, 'x')).status, 400);
        const ocupado = (await pool.query(
            `SELECT ep.id_voluntario FROM escala_participantes ep JOIN escalas es ON es.id_escala = ep.id_escala
             WHERE es.data_escala = $1 AND ep.id_voluntario <> $2 AND NOT ep.recusado LIMIT 1`, [escala.data, maria.id_voluntario])).rows[0];
        if (ocupado) assert.equal((await passar(maria.token, ocupado.id_voluntario)).status, 409, 'quem já tem escala no dia');
        const depois = (await pool.query('SELECT id_voluntario FROM escala_participantes WHERE id_escala = $1 ORDER BY 1', [escala.id_escala])).rows;
        assert.deepEqual(depois, antes);
    });

    test('Maria passa a vaga para João: ele entra aguardando, ela sai e a troca fica registrada', async () => {
        const r = await passar(maria.token, joao.id_voluntario);
        assert.equal(r.status, 200, r.texto);
        assert.match(r.corpo.mensagem, new RegExp(joao.nome));

        const linhas = (await pool.query('SELECT id_voluntario, confirmado, recusado FROM escala_participantes WHERE id_escala = $1', [escala.id_escala])).rows;
        assert.ok(!linhas.some(l => l.id_voluntario === maria.id_voluntario), 'Maria saiu');
        const doJoao = linhas.find(l => l.id_voluntario === joao.id_voluntario);
        assert.deepEqual([doJoao.confirmado, doJoao.recusado], [false, false], 'João fica aguardando resposta');

        const troca = (await pool.query('SELECT * FROM escala_trocas WHERE id_escala = $1 ORDER BY id_troca DESC LIMIT 1', [escala.id_escala])).rows[0];
        assert.equal(troca.id_voluntario_saiu, maria.id_voluntario);
        assert.equal(troca.id_voluntario_entrou, joao.id_voluntario);
        assert.equal(troca.feita_por, 'voluntario');
        assert.equal(troca.id_usuario, maria.id);
    });

    test('na Minha área: Maria não vê mais a escala e João vê de quem veio a vaga', async () => {
        const portalMaria = (await api('/api/portal', { token: maria.token })).corpo;
        assert.ok(!portalMaria.proximas.some(p => p.id_escala === escala.id_escala));

        const idMembroJoao = (await pool.query('SELECT id_membro FROM voluntarios WHERE id_voluntario = $1', [joao.id_voluntario])).rows[0].id_membro;
        const loginJoao = await criarUsuario({ perfil: 'VOLUNTARIO', permissoes: NENHUMA, id_membro: idMembroJoao });
        const daEscala = (await api('/api/portal', { token: loginJoao.token })).corpo.proximas.find(p => p.id_escala === escala.id_escala);
        assert.ok(daEscala, 'a escala aparece para o João');
        assert.equal(daEscala.confirmado, false);
        const nomeMaria = (await pool.query('SELECT m.nome_completo FROM voluntarios v JOIN membros m USING (id_membro) WHERE v.id_voluntario = $1', [maria.id_voluntario])).rows[0].nome_completo;
        assert.equal(daEscala.assumiu_de, nomeMaria);

        // João confirma pela Minha área dele
        const confirma = await api(`/api/portal/escalas/${escala.id_escala}`, { metodo: 'PATCH', token: loginJoao.token, corpo: { resposta: 'confirmar' } });
        assert.equal(confirma.status, 200);
    });

    test('Maria não consegue passar de novo uma vaga que já não é dela', async () => {
        assert.equal((await passar(maria.token, joao.id_voluntario)).status, 404);
    });

    test('a equipe vê a troca nos detalhes da escala', async () => {
        const r = await api(`/api/escalas/${escala.id_escala}`, { token: admin.token });
        assert.equal(r.status, 200);
        const p = r.corpo.participantes.find(x => x.id_voluntario === joao.id_voluntario);
        assert.equal(p.troca.feita_por, 'voluntario');
        assert.ok(p.troca.de);
    });
});

describe('Primeiro acesso: a pessoa cria a conta, a liderança define o voluntariado', () => {
    test('conta criada pela tela de cadastro passa a mostrar as escalas quando vira voluntário', async () => {
        const email = `primeiro.acesso.${Date.now()}@exemplo.test`;
        const senha = 'Senha@Primeira1';
        assert.equal((await api('/api/auth/registro', { metodo: 'POST', corpo: { nome: 'Pessoa Primeiro Acesso', email, senha } })).status, 201);
        const login = await api('/api/auth/login', { metodo: 'POST', corpo: { login: email, senha } });
        assert.equal(login.status, 200);
        const token = login.corpo.token;

        // Antes: pessoa comum, só a programação da igreja
        const me = (await api('/api/auth/me', { token })).corpo;
        assert.deepEqual([me.voluntario, me.gestao], [false, false]);
        assert.equal((await api('/api/portal', { token })).corpo.classificacao, 'visitante');

        // A liderança: tornar membro, marcar apto e criar a ficha (a mesma pessoa, sem novo cadastro)
        const idPessoa = me.id_membro;
        assert.equal((await api(`/api/participantes/${idPessoa}/membro`, { metodo: 'POST', token: admin.token, corpo: {} })).status, 201);
        assert.equal((await api(`/api/participantes/${idPessoa}`, { metodo: 'PATCH', token: admin.token, corpo: { apto_voluntario: true } })).status, 200);
        const ficha = await api('/api/voluntarios', { metodo: 'POST', token: admin.token, corpo: { id_membro: idPessoa, funcoes: [escala.id_funcao], disponibilidade: ['domingo'] } });
        assert.equal(ficha.status, 201, ficha.texto);

        // Depois: o MESMO login já é voluntário e vê a área de escalas
        const meDepois = (await api('/api/auth/me', { token })).corpo;
        assert.deepEqual([meDepois.voluntario, meDepois.gestao], [true, false]);
        const portal = (await api('/api/portal', { token })).corpo;
        assert.equal(portal.classificacao, 'voluntario');
        assert.ok(Array.isArray(portal.proximas));
        assert.equal((await api('/api/participantes', { token })).status, 403, 'continua sem acesso de gestão');
    });
});
