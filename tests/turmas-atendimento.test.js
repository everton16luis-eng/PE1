// =========================================================
// Turmas: sessão ligada a evento, entrada/saída das crianças,
// códigos das etiquetas, encerramento automático e alertas.
// =========================================================

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar, encerrar, api, criarUsuario, pool, TODAS, NENHUMA } = require('./apoio');
const Atendimento = require('../backend/src/models/atendimentoModel');
const { executarEncerramentoAutomatico } = require('../backend/src/config/atendimento');

let admin;
let voluntario;   // vinculado à turma A
let outro;        // voluntário sem vínculo
let turmaA;
let turmaB;       // para os testes de horário (encerramento automático)
let turmaC;
let criancas;     // 3 crianças ativas, com responsáveis

const sufixo = Date.now().toString(36);

// Evento relativo ao horário atual no fuso da igreja (início/fim em minutos a partir de agora)
async function eventoAgora(nome, inicioMin, fimMin) {
    return (await pool.query(
        `WITH t AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo') AS agora)
         INSERT INTO eventos (nome, data_evento, hora_inicio, hora_fim, tipo_evento)
         SELECT $1, (agora + make_interval(mins => $2))::date, (agora + make_interval(mins => $2))::time,
                (agora + make_interval(mins => $3))::time, 'culto' FROM t
         RETURNING id_evento`,
        [`${nome} ${sufixo}`, inicioMin, fimMin]
    )).rows[0].id_evento;
}

async function eventoEm(nome, data, inicio, fim) {
    return (await pool.query(
        `INSERT INTO eventos (nome, data_evento, hora_inicio, hora_fim, tipo_evento) VALUES ($1, $2, $3, $4, 'culto') RETURNING id_evento`,
        [`${nome} ${sufixo}`, data, inicio, fim]
    )).rows[0].id_evento;
}

async function novaTurma(nome) {
    return (await pool.query(
        `INSERT INTO cadastroturmas (nome, idade_minima, idade_maxima, dia_semana, horario, ativo) VALUES ($1, 9, 12, 'Domingo', '09:00', TRUE) RETURNING id_turma`,
        [`${nome} ${sufixo}`]
    )).rows[0].id_turma;
}

async function voluntarioComLogin(nome) {
    const membro = (await pool.query(
        `INSERT INTO membros (nome_completo, classificacao, ativo, apto_voluntario, voluntario, data_primeira_visita)
         VALUES ($1, 'membro', TRUE, TRUE, TRUE, CURRENT_DATE) RETURNING id_membro`, [`${nome} ${sufixo}`]
    )).rows[0].id_membro;
    const vol = (await pool.query(
        `INSERT INTO voluntarios (id_membro, data_inicio_voluntariado, ativo, disponibilidade) VALUES ($1, CURRENT_DATE, TRUE, '{domingo}') RETURNING id_voluntario`,
        [membro]
    )).rows[0].id_voluntario;
    const usuario = await criarUsuario({ perfil: 'VOLUNTARIO', permissoes: NENHUMA, id_membro: membro });
    return { ...usuario, id_voluntario: vol };
}

const abrir = (usuario, turma, idEvento) => api(`/api/atendimento/turmas/${turma}/sessoes`, { metodo: 'POST', token: usuario.token, corpo: { id_evento: idEvento } });
const entrar = (usuario, sessao, idCrianca) => api(`/api/atendimento/sessoes/${sessao}/entradas`, { metodo: 'POST', token: usuario.token, corpo: { id_crianca: idCrianca } });
const sair = (usuario, idAtendimento, codigo, idResponsavel) => api(`/api/atendimento/atendimentos/${idAtendimento}/saida`, { metodo: 'POST', token: usuario.token, corpo: { codigo, id_responsavel: idResponsavel } });
const codigoAtivo = async idAtendimento => (await pool.query("SELECT * FROM turma_codigos WHERE id_atendimento = $1 AND status = 'ativo'", [idAtendimento])).rows[0];

before(async () => {
    await iniciar();
    admin = await criarUsuario({ perfil: 'ADMINISTRADOR', permissoes: TODAS });
    turmaA = await novaTurma('Turma A');
    turmaB = await novaTurma('Turma B');
    turmaC = await novaTurma('Turma C');
    voluntario = await voluntarioComLogin('Voluntário Turma');
    outro = await voluntarioComLogin('Voluntário Sem Turma');
    await pool.query('INSERT INTO turma_voluntarios (id_turma, id_voluntario) VALUES ($1, $2), ($3, $2), ($4, $2)', [turmaA, voluntario.id_voluntario, turmaB, turmaC]);
    criancas = (await pool.query(
        `SELECT c.id_crianca, m.nome_completo AS nome FROM criancas c JOIN membros m ON m.id_membro = c.id_membro
         WHERE c.ativo IS NOT FALSE AND m.ativo AND EXISTS (SELECT 1 FROM crianca_responsavel cr WHERE cr.id_crianca = c.id_crianca)
         ORDER BY c.id_crianca LIMIT 3`
    )).rows;
    assert.equal(criancas.length, 3, 'o banco de testes precisa de crianças com responsáveis');
});

after(encerrar);

describe('Abertura vinculada a evento', () => {
    test('sem evento elegível (começa em mais de 30 min ou já terminou) não abre', async () => {
        const cedo = await eventoAgora('Evento cedo', 45, 120);
        const r = await abrir(voluntario, turmaA, cedo);
        assert.equal(r.status, 409);
        assert.match(r.corpo.erro, /não existe um evento em andamento ou previsto para os próximos 30 minutos/);
        const terminou = await eventoAgora('Evento terminado', -120, -10);
        assert.equal((await abrir(voluntario, turmaA, terminou)).status, 409);
    });

    test('voluntário sem vínculo com a turma não abre nem vê a sessão', async () => {
        const ev = await eventoAgora('Evento vinculo', -5, 90);
        assert.equal((await abrir(outro, turmaA, ev)).status, 403);
        const lista = await api('/api/atendimento/turmas', { token: outro.token });
        assert.equal(lista.status, 200);
        assert.equal(lista.corpo.turmas.length, 0);
    });

    test('abre dentro da janela (até 30 min antes); não abre duas vezes', async () => {
        const ev = await eventoAgora('Culto A', 20, 140);
        const r = await abrir(voluntario, turmaA, ev);
        assert.equal(r.status, 201, JSON.stringify(r.corpo));
        assert.equal((await abrir(voluntario, turmaA, ev)).status, 409, 'turma já aberta');
        const minhas = await api('/api/atendimento/turmas', { token: voluntario.token });
        assert.ok(minhas.corpo.turmas.some(t => t.id_turma === turmaA && t.id_sessao === r.corpo.id_sessao));
        assert.equal(minhas.corpo.gestor, false);
    });
});

describe('Voluntário: só o atendimento, nada da gestão', () => {
    test('sem acesso a dashboard, crianças, configurações ou administração das turmas', async () => {
        for (const rota of ['/api/dashboard', '/api/criancas', '/api/configuracoes', '/api/atendimento/admin/sessoes', '/api/atendimento/admin/alertas']) {
            assert.equal((await api(rota, { token: voluntario.token })).status, 403, rota);
        }
        const eu = (await api('/api/auth/me', { token: voluntario.token })).corpo;
        assert.equal(eu.gestao, false);
        assert.ok(eu.turmas_vinculadas >= 1);
    });
});

describe('Entrada, saída e códigos', () => {
    let sessao;
    let atendimentos = [];

    before(async () => {
        sessao = (await pool.query("SELECT id_sessao FROM turma_sessoes WHERE id_turma = $1 AND status = 'aberta'", [turmaA])).rows[0].id_sessao;
    });

    test('entrada registra quem fez e gera código; não entra duas vezes', async () => {
        for (const c of criancas) {
            const r = await entrar(voluntario, sessao, c.id_crianca);
            assert.equal(r.status, 201, JSON.stringify(r.corpo));
            assert.equal(r.corpo.nome, c.nome);
            assert.match(r.corpo.codigo, /^[A-Z0-9]{6}$/);
            atendimentos.push(r.corpo.id_atendimento);
        }
        assert.equal((await entrar(voluntario, sessao, criancas[0].id_crianca)).status, 409, 'já presente');
        const a = (await pool.query('SELECT entrada_por FROM turma_atendimentos WHERE id_atendimento = $1', [atendimentos[0]])).rows[0];
        assert.equal(a.entrada_por, voluntario.id);
    });

    test('dados da criança e responsáveis só para quem opera a turma', async () => {
        const ok = await api(`/api/atendimento/sessoes/${sessao}/criancas/${criancas[0].id_crianca}`, { token: voluntario.token });
        assert.equal(ok.status, 200);
        assert.ok(Array.isArray(ok.corpo.responsaveis) && ok.corpo.responsaveis.length);
        assert.equal((await api(`/api/atendimento/sessoes/${sessao}/criancas/${criancas[0].id_crianca}`, { token: outro.token })).status, 403);
    });

    test('etiquetas: dois códigos e dois QR distintos, sem dados de contato', async () => {
        const r = await api(`/api/atendimento/atendimentos/${atendimentos[0]}/etiqueta`, { token: voluntario.token });
        assert.equal(r.status, 200);
        assert.match(r.corpo.qr_crianca, /^<svg/);
        assert.match(r.corpo.qr_responsavel, /^<svg/);
        assert.notEqual(r.corpo.qr_crianca, r.corpo.qr_responsavel);
        assert.equal(r.corpo.telefone, undefined);
        const codigo = await codigoAtivo(atendimentos[0]);
        assert.ok(!r.corpo.qr_responsavel.includes(criancas[0].nome), 'QR não traz o nome');
        assert.equal(r.corpo.codigo_crianca, codigo.codigo);
        assert.equal(r.corpo.codigo_retirada, codigo.codigo_retirada);
        assert.notEqual(codigo.codigo, codigo.codigo_retirada);
        assert.notEqual(codigo.token, codigo.token_crianca);
        assert.equal((await api(`/api/atendimento/atendimentos/${atendimentos[0]}/etiqueta`, { token: outro.token })).status, 403);
    });

    test('saída exige o código da própria criança e uma pessoa autorizada, quando houver', async () => {
        const [a0, a1] = atendimentos;
        const c0 = await codigoAtivo(a0);
        const c1 = await codigoAtivo(a1);
        // código da etiqueta da CRIANÇA (exposto) não serve para retirada, nem digitado nem pelo QR
        for (const daCrianca of [c0.codigo, c0.token_crianca]) {
            const r = await sair(voluntario, a0, daCrianca);
            assert.equal(r.status, 409);
            assert.equal(r.corpo.motivo, 'codigo_crianca');
        }
        const detalhes = (await pool.query("SELECT detalhe FROM turma_auditoria WHERE id_atendimento = $1 AND acao = 'retirada_recusada'", [a0])).rows.map(r => r.detalhe);
        assert.ok(detalhes.includes('codigo_crianca'), 'tentativa com o código da criança registrada');
        // a conferência diz qual etiqueta foi lida
        const conferida = await api(`/api/atendimento/sessoes/${sessao}/conferir`, { metodo: 'POST', token: voluntario.token, corpo: { codigo: c0.codigo } });
        assert.deepEqual([conferida.corpo.valido, conferida.corpo.tipo], [true, 'crianca']);
        // código de retirada de outra criança: recusado e registrado
        const errado = await sair(voluntario, a0, c1.codigo_retirada);
        assert.equal(errado.status, 409);
        assert.equal(errado.corpo.motivo, 'outra_crianca');
        // autoriza um responsável da criança 0: passa a ser obrigatório escolher quem busca
        const resp = (await pool.query('SELECT id_responsavel FROM crianca_responsavel WHERE id_crianca = $1 LIMIT 1', [criancas[0].id_crianca])).rows[0].id_responsavel;
        const autorizou = await api(`/api/criancas/${criancas[0].id_crianca}/responsaveis/${resp}`, { metodo: 'PATCH', token: admin.token, corpo: { autorizado_retirada: true } });
        assert.equal(autorizou.status, 200);
        assert.equal((await sair(voluntario, a0, c0.codigo_retirada)).status, 400, 'sem escolher a pessoa autorizada');
        const ok = await sair(voluntario, a0, c0.codigo_retirada.slice(0, 3) + '-' + c0.codigo_retirada.slice(3), resp);
        assert.equal(ok.status, 200, JSON.stringify(ok.corpo));
        // reuso do código: recusado e auditado
        const reuso = await sair(voluntario, a0, c0.codigo_retirada, resp);
        assert.equal(reuso.status, 409);
        const auditoria = (await pool.query("SELECT acao FROM turma_auditoria WHERE id_sessao = $1", [sessao])).rows.map(r => r.acao);
        assert.ok(auditoria.includes('retirada_recusada'));
        const usado = (await pool.query('SELECT status, utilizado_por FROM turma_codigos WHERE id_codigo = $1', [c0.id_codigo])).rows[0];
        assert.equal(usado.status, 'utilizado');
        assert.equal(usado.utilizado_por, voluntario.id);
        await pool.query('UPDATE crianca_responsavel SET autorizado_retirada = FALSE WHERE id_crianca = $1 AND id_responsavel = $2', [criancas[0].id_crianca, resp]);
    });

    test('token do QR também serve; 2ª via invalida o código anterior', async () => {
        const a1 = atendimentos[1];
        const antigo = await codigoAtivo(a1);
        assert.equal((await api(`/api/atendimento/atendimentos/${a1}/etiqueta/segunda-via`, { metodo: 'POST', token: voluntario.token, corpo: { motivo: '' } })).status, 400);
        const via = await api(`/api/atendimento/atendimentos/${a1}/etiqueta/segunda-via`, { metodo: 'POST', token: voluntario.token, corpo: { motivo: 'etiqueta perdida' } });
        assert.equal(via.status, 201);
        const recusa = await sair(voluntario, a1, antigo.token);
        assert.equal(recusa.status, 409);
        assert.equal(recusa.corpo.motivo, 'invalidado');
        const novo = await codigoAtivo(a1);
        assert.equal(novo.segunda_via_de, antigo.id_codigo);
        assert.equal((await sair(voluntario, a1, novo.token)).status, 200);
    });

    test('duas retiradas ao mesmo tempo com o mesmo código: só uma passa', async () => {
        const a2 = atendimentos[2];
        const c2 = await codigoAtivo(a2);
        const [r1, r2] = await Promise.all([sair(voluntario, a2, c2.codigo_retirada), sair(voluntario, a2, c2.codigo_retirada)]);
        assert.deepEqual([r1.status, r2.status].sort(), [200, 409]);
    });

    test('criança que saiu pode entrar de novo (novo registro); encerramento manual exige todos fora', async () => {
        const volta = await entrar(voluntario, sessao, criancas[0].id_crianca);
        assert.equal(volta.status, 201);
        const recusa = await api(`/api/atendimento/sessoes/${sessao}/encerrar`, { metodo: 'POST', token: voluntario.token, corpo: {} });
        assert.equal(recusa.status, 409);
        assert.equal(recusa.corpo.presentes, 1);
        const c = await codigoAtivo(volta.corpo.id_atendimento);
        assert.equal((await sair(voluntario, volta.corpo.id_atendimento, c.codigo_retirada)).status, 200);
        assert.equal((await api(`/api/atendimento/sessoes/${sessao}/encerrar`, { metodo: 'POST', token: voluntario.token, corpo: {} })).status, 200);
        const s = (await pool.query('SELECT status, tipo_encerramento, encerrada_por FROM turma_sessoes WHERE id_sessao = $1', [sessao])).rows[0];
        assert.deepEqual([s.status, s.tipo_encerramento, s.encerrada_por], ['encerrada', 'manual', voluntario.id]);
        assert.equal((await entrar(voluntario, sessao, criancas[1].id_crianca)).status, 409, 'sessão encerrada não recebe entrada');
        assert.equal((await api(`/api/atendimento/sessoes/${sessao}/criancas/${criancas[0].id_crianca}`, { token: voluntario.token })).status, 403, 'dados só com a turma aberta');
        // mesma turma no mesmo evento não reabre
        const ev = (await pool.query('SELECT id_evento FROM turma_sessoes WHERE id_sessao = $1', [sessao])).rows[0].id_evento;
        assert.equal((await abrir(voluntario, turmaA, ev)).status, 409);
    });

    test('código de uma sessão não vale em outra (mesma criança)', async () => {
        const antigo = (await pool.query("SELECT codigo, token, status FROM turma_codigos WHERE id_sessao = $1 ORDER BY id_codigo LIMIT 1", [sessao])).rows[0];
        const ev = await eventoAgora('Culto C', -5, 90);
        const nova = await abrir(voluntario, turmaC, ev);
        assert.equal(nova.status, 201);
        const e = await entrar(voluntario, nova.corpo.id_sessao, criancas[0].id_crianca);
        const r = await sair(voluntario, e.corpo.id_atendimento, antigo.token);
        assert.equal(r.status, 409);
        assert.equal(r.corpo.motivo, 'outra_sessao');
        // encerramento pela administração regulariza e invalida
        const adm = await api(`/api/atendimento/admin/sessoes/${nova.corpo.id_sessao}/encerrar`, { metodo: 'POST', token: admin.token, corpo: { motivo: 'teste de encerramento' } });
        assert.equal(adm.status, 200);
        assert.equal(adm.corpo.saidas_regularizadas, 1);
        const k = await pool.query("SELECT COUNT(*)::int AS n FROM turma_codigos WHERE id_sessao = $1 AND status = 'ativo'", [nova.corpo.id_sessao]);
        assert.equal(k.rows[0].n, 0);
    });

    test('evento com atendimento de turma não pode ser removido', async () => {
        const ev = (await pool.query('SELECT id_evento FROM turma_sessoes WHERE id_sessao = $1', [sessao])).rows[0].id_evento;
        // o evento ainda não "aconteceu" por completo: a remoção é barrada pelo atendimento
        const r = await api(`/api/eventos/${ev}`, { metodo: 'DELETE', token: admin.token });
        assert.equal(r.status, 409);
    });
});

describe('Encerramento automático e alertas', () => {
    test('às 23h59: saídas regularizadas como automáticas, códigos invalidados, alerta prioritário, sem duplicar', async () => {
        const ev = await eventoEm('Culto noite', '2031-03-05', '19:00', '21:00');
        const sessao = await Atendimento.abrirSessao({ id_usuario: voluntario.id }, turmaB, ev, new Date('2031-03-05T18:45:00-03:00'));
        await Atendimento.registrarEntrada({ id_usuario: voluntario.id }, sessao.id_sessao, criancas[1].id_crianca, new Date('2031-03-05T19:10:00-03:00'));

        assert.equal((await executarEncerramentoAutomatico(new Date('2031-03-05T23:58:00-03:00'))).encerradas, 0, 'ainda no prazo');
        const r = await executarEncerramentoAutomatico(new Date('2031-03-06T08:00:00-03:00')); // servidor estava desligado: recupera
        assert.ok(r.encerradas >= 1);
        const s = (await pool.query('SELECT status, tipo_encerramento, encerrada_em, encerrada_por FROM turma_sessoes WHERE id_sessao = $1', [sessao.id_sessao])).rows[0];
        assert.equal(s.tipo_encerramento, 'automatico_limite_diario');
        assert.equal(s.encerrada_por, null);
        assert.equal(new Date(s.encerrada_em).toISOString(), new Date('2031-03-05T23:59:00-03:00').toISOString());
        const a = (await pool.query('SELECT saida_em, tipo_saida, saida_por FROM turma_atendimentos WHERE id_sessao = $1', [sessao.id_sessao])).rows[0];
        assert.equal(a.tipo_saida, 'automatica');
        assert.equal(a.saida_por, null);
        assert.equal(new Date(a.saida_em).toISOString(), new Date('2031-03-05T23:59:00-03:00').toISOString());
        const alerta = (await pool.query('SELECT * FROM turma_alertas WHERE id_sessao = $1', [sessao.id_sessao])).rows;
        assert.equal(alerta.length, 1);
        assert.equal(alerta[0].motivo, 'limite_diario');
        assert.equal(alerta[0].prioritario, true);
        assert.equal(alerta[0].presentes_no_encerramento, 1);
        assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM turma_codigos WHERE id_sessao = $1 AND status = 'ativo'", [sessao.id_sessao])).rows[0].n, 0);

        // rodar de novo não duplica nada
        await executarEncerramentoAutomatico(new Date('2031-03-06T09:00:00-03:00'));
        assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM turma_alertas WHERE id_sessao = $1', [sessao.id_sessao])).rows[0].n, 1);
        assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM turma_auditoria WHERE id_sessao = $1 AND acao = 'saida_automatica'", [sessao.id_sessao])).rows[0].n, 1);

        // administração vê, abre e trata o alerta
        const lista = await api('/api/atendimento/admin/alertas?status=pendente', { token: admin.token });
        const meu = lista.corpo.find(x => x.id_sessao === sessao.id_sessao);
        assert.ok(meu);
        const detalhe = await api(`/api/atendimento/admin/alertas/${meu.id_alerta}`, { token: admin.token });
        assert.equal(detalhe.corpo.afetados.length, 1);
        assert.equal((await api(`/api/atendimento/admin/alertas/${meu.id_alerta}/tratar`, { metodo: 'POST', token: admin.token, corpo: { observacao: 'Família confirmou a retirada por telefone.' } })).status, 200);
        assert.equal((await api(`/api/atendimento/admin/alertas/${meu.id_alerta}/tratar`, { metodo: 'POST', token: admin.token, corpo: { observacao: 'de novo' } })).status, 409);
        const tratado = (await pool.query('SELECT status, tratado_por FROM turma_alertas WHERE id_alerta = $1', [meu.id_alerta])).rows[0];
        assert.deepEqual([tratado.status, tratado.tratado_por], ['tratado', admin.id]);
    });

    test('evento que passa da meia-noite: segue aberta depois das 23h59 e fecha no fim do evento', async () => {
        const ev = await eventoEm('Vigília', '2031-03-07', '23:00', '02:00');
        const sessao = await Atendimento.abrirSessao({ id_usuario: voluntario.id }, turmaB, ev, new Date('2031-03-07T22:40:00-03:00'));
        await Atendimento.registrarEntrada({ id_usuario: voluntario.id }, sessao.id_sessao, criancas[2].id_crianca, new Date('2031-03-07T23:05:00-03:00'));
        await executarEncerramentoAutomatico(new Date('2031-03-08T00:30:00-03:00'));
        assert.equal((await pool.query('SELECT status FROM turma_sessoes WHERE id_sessao = $1', [sessao.id_sessao])).rows[0].status, 'aberta');
        // a entrada depois da meia-noite ainda vale (dentro do evento)
        await Atendimento.registrarEntrada({ id_usuario: voluntario.id }, sessao.id_sessao, criancas[1].id_crianca, new Date('2031-03-08T01:00:00-03:00'));
        await executarEncerramentoAutomatico(new Date('2031-03-08T02:00:30-03:00'));
        const s = (await pool.query('SELECT status, tipo_encerramento, encerrada_em FROM turma_sessoes WHERE id_sessao = $1', [sessao.id_sessao])).rows[0];
        assert.equal(s.status, 'encerrada');
        assert.equal(s.tipo_encerramento, 'automatico_fim_evento');
        assert.equal(new Date(s.encerrada_em).toISOString(), new Date('2031-03-08T02:00:00-03:00').toISOString());
        const alerta = (await pool.query('SELECT motivo, saidas_regularizadas FROM turma_alertas WHERE id_sessao = $1', [sessao.id_sessao])).rows[0];
        assert.deepEqual([alerta.motivo, alerta.saidas_regularizadas], ['fim_evento', 2]);
    });

    test('depois do prazo, a sessão não aceita entrada mesmo antes da rotina rodar', async () => {
        const ev = await eventoEm('Culto tarde', '2031-03-09', '15:00', '17:00');
        const sessao = await Atendimento.abrirSessao({ id_usuario: voluntario.id }, turmaB, ev, new Date('2031-03-09T14:50:00-03:00'));
        await assert.rejects(
            Atendimento.registrarEntrada({ id_usuario: voluntario.id }, sessao.id_sessao, criancas[0].id_crianca, new Date('2031-03-10T00:10:00-03:00')),
            erro => erro.status === 409
        );
        await executarEncerramentoAutomatico(new Date('2031-03-10T00:10:00-03:00'));
        const alerta = (await pool.query('SELECT prioritario, presentes_no_encerramento FROM turma_alertas WHERE id_sessao = $1', [sessao.id_sessao])).rows[0];
        assert.deepEqual([alerta.prioritario, alerta.presentes_no_encerramento], [false, 0]);
    });
});

describe('Administração dos vínculos', () => {
    test('administrador vincula voluntários; voluntário não', async () => {
        const r = await api(`/api/atendimento/admin/turmas/${turmaA}/voluntarios`, { metodo: 'PUT', token: admin.token, corpo: { voluntarios: [voluntario.id_voluntario, outro.id_voluntario] } });
        assert.equal(r.status, 200);
        assert.equal((await api('/api/atendimento/turmas', { token: outro.token })).corpo.turmas.length, 1);
        assert.equal((await api(`/api/atendimento/admin/turmas/${turmaA}/voluntarios`, { metodo: 'PUT', token: voluntario.token, corpo: { voluntarios: [] } })).status, 403);
        assert.equal((await api(`/api/atendimento/admin/turmas/${turmaA}/voluntarios`, { metodo: 'PUT', token: admin.token, corpo: { voluntarios: ['x'] } })).status, 400);
    });
});
