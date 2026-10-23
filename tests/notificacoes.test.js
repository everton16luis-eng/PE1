// =========================================================
// Notificações: central de avisos, aparelhos (Web Push),
// avisos disparados pelo sistema e lembretes automáticos.
// O envio real é trocado por um falso (nada sai para a internet).
// =========================================================

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar, encerrar, api, criarUsuario, pool, TODAS, NENHUMA } = require('./apoio');
const Servico = require('../backend/src/config/notificacoes');

let admin;
let lider;      // equipe com a área Escalas (também recebe os avisos da liderança)
let secretaria; // equipe sem a área Escalas (não recebe)
const enviados = [];
let respostaFalsa = null; // erro que o envio falso deve simular

const espera = ms => new Promise(r => setTimeout(r, ms));
// Os avisos saem logo depois da ação (sem travar a resposta): espera aparecer
async function avisosDe(usuario, tipo, minimo = 1) {
    for (let i = 0; i < 40; i++) {
        const lista = (await api('/api/notificacoes', { token: usuario.token })).corpo.notificacoes.filter(n => !tipo || n.tipo === tipo);
        if (lista.length >= minimo) return lista;
        await espera(50);
    }
    return (await api('/api/notificacoes', { token: usuario.token })).corpo.notificacoes.filter(n => !tipo || n.tipo === tipo);
}

const inscricao = (sufixo = Math.random().toString(16).slice(2)) => ({
    endpoint: `https://push.exemplo.test/envio/${sufixo}`,
    keys: { p256dh: 'BOr' + 'a'.repeat(84), auth: 'b'.repeat(22) }
});

// Voluntário com login, uma escala futura e (se houver) alguém livre para assumir
async function voluntarioEscalado(pular = 0) {
    const v = (await pool.query(
        `SELECT ep.id_escala, ep.id_voluntario, v.id_membro, es.id_funcao, es.id_evento
         FROM escala_participantes ep JOIN escalas es ON es.id_escala = ep.id_escala
         JOIN voluntarios v ON v.id_voluntario = ep.id_voluntario JOIN membros m ON m.id_membro = v.id_membro
         WHERE es.data_escala > CURRENT_DATE + 1 AND NOT ep.recusado AND v.ativo AND m.ativo AND m.apto_voluntario
           AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.id_membro = v.id_membro)
         ORDER BY es.data_escala, ep.id_escala OFFSET $1 LIMIT 1`, [pular])).rows[0];
    return { ...v, ...(await criarUsuario({ perfil: 'VOLUNTARIO', permissoes: NENHUMA, id_membro: v.id_membro })) };
}

before(async () => {
    await iniciar();
    Servico.definirEnviador(async (destino, conteudo) => {
        if (respostaFalsa) throw respostaFalsa;
        enviados.push({ endpoint: destino.endpoint, conteudo: JSON.parse(conteudo) });
    });
    admin = await criarUsuario({ perfil: 'ADMINISTRADOR', permissoes: TODAS });
    lider = await criarUsuario({ perfil: 'GESTOR', permissoes: { ...NENHUMA, escalas: true } });
    secretaria = await criarUsuario({ perfil: 'SECRETARIA', permissoes: { ...NENHUMA, participantes: true } });
});
after(encerrar);

describe('Central de avisos (sininho)', () => {
    test('sem login não acessa; cada um vê só os próprios avisos', async () => {
        assert.equal((await api('/api/notificacoes')).status, 401);
        await Servico.avisar([secretaria.id], { tipo: 'teste', titulo: 'Só da secretaria', mensagem: 'x' });
        const meus = (await api('/api/notificacoes', { token: secretaria.token })).corpo;
        assert.ok(meus.notificacoes.some(n => n.titulo === 'Só da secretaria'));
        const doAdmin = (await api('/api/notificacoes', { token: admin.token })).corpo;
        assert.ok(!doAdmin.notificacoes.some(n => n.titulo === 'Só da secretaria'));
    });

    test('marcar como lido: um, todos, e nunca o aviso de outra pessoa', async () => {
        await Servico.avisar([secretaria.id], { tipo: 'teste', titulo: 'Para ler', mensagem: 'x' });
        const lista = (await api('/api/notificacoes', { token: secretaria.token })).corpo;
        assert.ok(lista.nao_lidas >= 2);
        const alvo = lista.notificacoes.find(n => n.titulo === 'Para ler');
        assert.equal((await api(`/api/notificacoes/${alvo.id_notificacao}/lida`, { metodo: 'POST', token: admin.token, corpo: {} })).status, 404, 'aviso alheio');
        assert.equal((await api(`/api/notificacoes/${alvo.id_notificacao}/lida`, { metodo: 'POST', token: secretaria.token, corpo: {} })).status, 200);
        assert.equal((await api('/api/notificacoes/abc/lida', { metodo: 'POST', token: secretaria.token, corpo: {} })).status, 400);
        await api('/api/notificacoes/lidas', { metodo: 'POST', token: secretaria.token, corpo: {} });
        assert.equal((await api('/api/notificacoes', { token: secretaria.token })).corpo.nao_lidas, 0);
    });

    test('limpar lidas apaga só os lidos do próprio login', async () => {
        await Servico.avisar([secretaria.id, admin.id], { tipo: 'teste', titulo: 'Fica sem ler', mensagem: 'x' });
        const limpar = await api('/api/notificacoes/lidas', { metodo: 'DELETE', token: secretaria.token, corpo: {} });
        assert.equal(limpar.status, 200);
        assert.ok(limpar.corpo.removidos >= 1);
        const lista = (await api('/api/notificacoes', { token: secretaria.token })).corpo;
        assert.ok(lista.notificacoes.every(n => !n.lida), 'nenhum lido sobra');
        assert.ok(lista.notificacoes.some(n => n.titulo === 'Fica sem ler'), 'não lido continua');
        const doAdmin = (await api('/api/notificacoes', { token: admin.token })).corpo;
        assert.ok(doAdmin.notificacoes.some(n => n.titulo === 'Fica sem ler'), 'outro login intacto');
    });

    test('voluntário e usuário padrão (sem área de gestão) também têm a central', async () => {
        const v = await criarUsuario({ perfil: 'VOLUNTARIO', permissoes: NENHUMA });
        const comum = await criarUsuario({ perfil: 'VISUALIZACAO', permissoes: NENHUMA });
        for (const u of [v, comum]) {
            assert.equal((await api('/api/notificacoes', { token: u.token })).status, 200);
            assert.equal((await api('/api/notificacoes/push/chave', { token: u.token })).status, 200);
            assert.equal((await api('/api/escalas/dia?data=2026-10-25', { token: u.token })).status, 403, 'continua sem gestão');
        }
    });
});

describe('Aparelhos (Web Push)', () => {
    test('chave pública disponível; inscrição validada', async () => {
        const chave = (await api('/api/notificacoes/push/chave', { token: admin.token })).corpo;
        assert.equal(typeof chave.chave, 'string');
        for (const corpo of [{}, { inscricao: { endpoint: 'http://inseguro.test/x', keys: inscricao().keys } },
            { inscricao: { endpoint: 'nao-e-url', keys: inscricao().keys } },
            { inscricao: { endpoint: inscricao().endpoint, keys: { p256dh: '<script>', auth: 'x' } } }]) {
            assert.equal((await api('/api/notificacoes/push', { metodo: 'POST', token: admin.token, corpo })).status, 400, JSON.stringify(corpo));
        }
    });

    test('ativar, receber o teste, desativar', async () => {
        const insc = inscricao('admin');
        assert.equal((await api('/api/notificacoes/push', { metodo: 'POST', token: admin.token, corpo: { inscricao: insc, aparelho: 'Chrome' } })).status, 201);
        assert.equal((await api('/api/notificacoes', { token: admin.token })).corpo.aparelhos, 1);

        enviados.length = 0;
        assert.equal((await api('/api/notificacoes/push/teste', { metodo: 'POST', token: admin.token, corpo: {} })).status, 200);
        assert.equal(enviados.length, 1);
        assert.equal(enviados[0].endpoint, insc.endpoint);
        assert.equal(enviados[0].conteudo.titulo, 'Notificações ativadas');

        assert.equal((await api('/api/notificacoes/push', { metodo: 'DELETE', token: admin.token, corpo: { endpoint: insc.endpoint } })).status, 200);
        assert.equal((await api('/api/notificacoes', { token: admin.token })).corpo.aparelhos, 0);
    });

    test('o mesmo aparelho passa a ser de quem ativou por último (celular emprestado)', async () => {
        const insc = inscricao('compartilhado');
        await api('/api/notificacoes/push', { metodo: 'POST', token: admin.token, corpo: { inscricao: insc } });
        await api('/api/notificacoes/push', { metodo: 'POST', token: secretaria.token, corpo: { inscricao: insc } });
        const dono = (await pool.query('SELECT id_usuario FROM push_inscricoes WHERE endpoint = $1', [insc.endpoint])).rows[0].id_usuario;
        assert.equal(dono, secretaria.id);
        await api('/api/notificacoes/push', { metodo: 'DELETE', token: secretaria.token, corpo: { endpoint: insc.endpoint } });
    });

    test('aparelho que não existe mais (410) é removido sozinho', async () => {
        const insc = inscricao('expirado');
        await api('/api/notificacoes/push', { metodo: 'POST', token: secretaria.token, corpo: { inscricao: insc } });
        respostaFalsa = Object.assign(new Error('Gone'), { statusCode: 410 });
        try {
            await Servico.avisar([secretaria.id], { tipo: 'teste', titulo: 'x', mensagem: 'x' });
        } finally {
            respostaFalsa = null;
        }
        const resta = (await pool.query('SELECT COUNT(*)::int AS n FROM push_inscricoes WHERE endpoint = $1', [insc.endpoint])).rows[0].n;
        assert.equal(resta, 0);
        assert.ok((await avisosDe(secretaria)).length, 'o aviso continua na central');
    });
});

describe('Avisos disparados pelo sistema', () => {
    test('"Não posso ir": a liderança (admin e área Escalas) é avisada, com o motivo', async () => {
        const v = await voluntarioEscalado(0);
        const r = await api(`/api/portal/escalas/${v.id_escala}`, { metodo: 'PATCH', token: v.token, corpo: { resposta: 'recusar', motivo: 'Viagem de trabalho' } });
        assert.equal(r.status, 200);
        const doAdmin = await avisosDe(admin, 'recusa');
        assert.match(doAdmin[0].mensagem, /Viagem de trabalho/);
        assert.equal(doAdmin[0].rota, 'escalas');
        assert.ok((await avisosDe(lider, 'recusa')).length, 'equipe com a área Escalas');
        assert.equal((await avisosDe(secretaria, 'recusa', 0)).length, 0, 'quem não cuida de escalas não recebe');
    });

    test('nova escala: cada voluntário escalado é avisado', async () => {
        const v = await voluntarioEscalado(1);
        const r = await api('/api/escalas', {
            metodo: 'POST', token: admin.token,
            corpo: { data: '2026-12-27', horario: '08:00', id_funcao: v.id_funcao, qtd_voluntarios: 1, voluntarios: [v.id_voluntario],
                     evento: { nome: 'Culto de Teste Notificação', tipo_evento: 'culto', hora_inicio: '09:00', hora_fim: '11:00' } }
        });
        assert.equal(r.status, 201, r.texto);
        const aviso = (await avisosDe(v, 'escala_nova'))[0];
        assert.ok(aviso, 'voluntário avisado');
        assert.match(aviso.mensagem, /Culto de Teste Notificação/);
        assert.equal(aviso.rota, 'minha-area');
    });

    test('equipe retira o voluntário da escala: ele é avisado', async () => {
        const v = await voluntarioEscalado(2);
        const r = await api(`/api/voluntarios/${v.id_voluntario}/escalas/${v.id_escala}`, { metodo: 'DELETE', token: admin.token });
        assert.equal(r.status, 200, r.texto);
        assert.ok((await avisosDe(v, 'escala_retirada')).length);
    });

    test('evento muda de dia ou horário: os escalados são avisados', async () => {
        const v = await voluntarioEscalado(3);
        const ev = (await pool.query("SELECT nome, tipo_evento, to_char(data_evento, 'YYYY-MM-DD') AS data, hora_fim FROM eventos WHERE id_evento = $1", [v.id_evento])).rows[0];
        const r = await api(`/api/eventos/${v.id_evento}`, {
            metodo: 'PUT', token: admin.token,
            corpo: { nome: ev.nome, data_evento: ev.data, tipo_evento: ev.tipo_evento, hora_inicio: '06:00', hora_fim: '07:00' }
        });
        assert.equal(r.status, 200, r.texto);
        const aviso = (await avisosDe(v, 'escala_alterada'))[0];
        assert.ok(aviso);
        assert.match(aviso.mensagem, /06:00/);
    });

    test('evento removido: os escalados são avisados do cancelamento', async () => {
        const v = await voluntarioEscalado(4);
        const r = await api(`/api/eventos/${v.id_evento}`, { metodo: 'DELETE', token: admin.token });
        assert.equal(r.status, 200, r.texto);
        assert.ok((await avisosDe(v, 'escala_removida')).length);
    });

    test('passar a vaga: quem assumiu e a liderança são avisados', async () => {
        // Procura uma vaga com alguém livre para assumir
        for (let i = 5; i < 40; i++) {
            const v = await voluntarioEscalado(i);
            if (!v.id_escala) break;
            const livres = (await api(`/api/portal/escalas/${v.id_escala}/substitutos`, { token: v.token })).corpo?.substitutos || [];
            // Quem assume precisa estar sem login (os testes criam um para ele)
            const semLogin = (await pool.query(
                `SELECT v.id_voluntario, v.id_membro FROM voluntarios v
                 WHERE v.id_voluntario = ANY($1::int[]) AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.id_membro = v.id_membro)
                 LIMIT 1`, [livres.map(l => l.id_voluntario)])).rows[0];
            if (!semLogin) continue;
            const quemAssume = await criarUsuario({ perfil: 'VOLUNTARIO', permissoes: NENHUMA, id_membro: semLogin.id_membro });
            assert.equal((await api(`/api/portal/escalas/${v.id_escala}/passar`, { metodo: 'POST', token: v.token, corpo: { id_voluntario: semLogin.id_voluntario } })).status, 200);
            assert.ok((await avisosDe(quemAssume, 'vaga_recebida')).length, 'quem assumiu');
            assert.ok((await avisosDe(admin, 'troca_voluntarios')).length, 'liderança');
            return;
        }
        assert.fail('nenhuma vaga com alguém livre no banco de testes');
    });
});

describe('Lembretes automáticos (véspera, a partir das 18h)', () => {
    // "agora" = véspera da data escolhida, às 19h no horário de Brasília (22h UTC)
    const vesperaAs19h = data => new Date(new Date(data + 'T22:00:00Z').getTime() - 24 * 60 * 60 * 1000);

    test('antes das 18h não envia nada', async () => {
        const r = await Servico.executarLembretes(new Date('2026-12-01T15:00:00Z')); // 12h em Brasília
        assert.equal(r.enviados, 0);
    });

    test('a partir das 18h: lembrete para cada escalado de amanhã, uma vez só', async () => {
        const alvo = (await pool.query(
            `SELECT to_char(es.data_escala, 'YYYY-MM-DD') AS data, ep.id_voluntario, v.id_membro
             FROM escala_participantes ep JOIN escalas es ON es.id_escala = ep.id_escala JOIN voluntarios v USING (id_voluntario)
             WHERE es.data_escala > CURRENT_DATE AND NOT ep.recusado
               AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.id_membro = v.id_membro)
             ORDER BY es.data_escala LIMIT 1`)).rows[0];
        const login = await criarUsuario({ perfil: 'VOLUNTARIO', permissoes: NENHUMA, id_membro: alvo.id_membro });

        const primeira = await Servico.executarLembretes(vesperaAs19h(alvo.data));
        assert.ok(primeira.enviados >= 1);
        const lembretes = await avisosDe(login, 'lembrete');
        assert.ok(lembretes.length >= 1);
        assert.match(lembretes[0].titulo, /Amanhã/);

        const segunda = await Servico.executarLembretes(vesperaAs19h(alvo.data));
        assert.equal(segunda.enviados, 0, 'não repete');
        assert.equal((await avisosDe(login, 'lembrete')).length, lembretes.length);
    });

    test('a opção "Notificações" desligada em Configurações pausa os lembretes', async () => {
        await pool.query('UPDATE configuracoes_igreja SET notificacoes = FALSE');
        try {
            const r = await Servico.executarLembretes(vesperaAs19h('2026-12-20'));
            assert.equal(r.desligado, true);
        } finally {
            await pool.query('UPDATE configuracoes_igreja SET notificacoes = TRUE');
        }
    });
});
