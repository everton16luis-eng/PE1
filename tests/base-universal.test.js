// =========================================================
// Base universal de pessoas: um cadastro por pessoa e cada
// setor aplicando o seu critério sobre essa mesma base.
//   Participantes = todas | Crianças = menos de 18 anos
//   Voluntários = ativas e aptas | Usuários = login de gestão
// =========================================================

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar, encerrar, api, criarUsuario, contar, pool, TODAS, NENHUMA } = require('./apoio');

let admin;
let secretaria;

// Data (AAAA-MM-DD) de "hoje menos X anos e Y dias"
function nascidoHa(anos, dias = 0) {
    const d = new Date();
    d.setFullYear(d.getFullYear() - anos);
    d.setDate(d.getDate() - dias);
    return d.toLocaleDateString('sv-SE');
}

const cadastrar = corpo => api('/api/participantes', { metodo: 'POST', token: secretaria.token, corpo });
const participantes = async () => (await api('/api/participantes', { token: admin.token })).corpo.participantes;
const criancas = async () => (await api('/api/criancas', { token: admin.token })).corpo.criancas;
const voluntarios = async () => (await api('/api/voluntarios', { token: admin.token })).corpo.voluntarios;
const usuarios = async () => (await api('/api/usuarios', { token: admin.token })).corpo.usuarios;
const classificar = (id, corpo) => api(`/api/participantes/${id}`, { metodo: 'PATCH', token: admin.token, corpo });
const tornarMembro = id => api(`/api/participantes/${id}/membro`, { metodo: 'POST', token: admin.token, corpo: {} });

before(async () => {
    await iniciar();
    admin = await criarUsuario({ perfil: 'ADMINISTRADOR', permissoes: TODAS });
    secretaria = await criarUsuario({ perfil: 'SECRETARIA', permissoes: { ...NENHUMA, participantes: true, criancas: true } });
});
after(encerrar);

describe('Integridade da base', () => {
    test('toda visita, ficha infantil e login aponta para uma pessoa da base', async () => {
        const r = (await pool.query(
            `SELECT (SELECT COUNT(*) FROM visitantes WHERE id_membro IS NULL)::int AS visitas,
                    (SELECT COUNT(*) FROM criancas WHERE id_membro IS NULL)::int AS fichas,
                    (SELECT COUNT(*) FROM usuarios WHERE id_membro IS NULL)::int AS logins,
                    (SELECT COUNT(*) FROM (SELECT id_membro FROM criancas GROUP BY id_membro HAVING COUNT(*) > 1) x)::int AS fichas_duplicadas`
        )).rows[0];
        assert.deepEqual(r, { visitas: 0, fichas: 0, logins: 0, fichas_duplicadas: 0 });
    });

    test('Participantes lista exatamente as pessoas da base, sem repetir ninguém', async () => {
        const lista = await participantes();
        const total = (await pool.query('SELECT COUNT(*)::int AS n FROM membros')).rows[0].n;
        assert.equal(lista.length, total);
        assert.equal(new Set(lista.map(p => p.id)).size, lista.length);
    });
});

describe('Fluxo de uma pessoa pelos setores', () => {
    test('adulto visitante: aparece em Participantes, não em Crianças, Voluntários nem Usuários', async () => {
        const antes = await contar('usuarios', 'voluntarios', 'criancas');
        const r = await cadastrar({ nome: 'Adulto Visitante Base', data_nascimento: nascidoHa(30) });
        assert.equal(r.status, 201);
        assert.equal(r.corpo.tipo, 'visitante');

        assert.ok((await participantes()).some(p => p.id === r.corpo.id && p.tipo === 'visitante'));
        assert.ok(!(await criancas()).some(c => c.id_membro === r.corpo.id));
        assert.ok(!(await voluntarios()).some(v => v.id_membro === r.corpo.id));
        assert.ok(!(await usuarios()).some(u => u.id_membro === r.corpo.id));
        assert.deepEqual(await contar('usuarios', 'voluntarios', 'criancas'), antes, 'cadastro não cria login, voluntário nem ficha');
    });

    test('menor de 18 anos: aparece em Participantes e em Crianças sem novo cadastro', async () => {
        const r = await cadastrar({ nome: 'Menor Base Universal', data_nascimento: nascidoHa(9) });
        const naLista = (await participantes()).find(p => p.id === r.corpo.id);
        assert.equal(naLista.menor, true);
        const crianca = (await criancas()).find(c => c.id_membro === r.corpo.id);
        assert.ok(crianca, 'deveria aparecer em Crianças');
        assert.equal(crianca.tem_ficha, false);
        assert.equal(crianca.idade, 9);
    });

    test('completar a ficha infantil não cria outra pessoa', async () => {
        const r = await cadastrar({ nome: 'Menor Com Ficha', data_nascimento: nascidoHa(6) });
        const turma = (await pool.query('SELECT id_turma FROM cadastroturmas WHERE ativo LIMIT 1')).rows[0].id_turma;
        const antes = await contar('membros');
        const ficha = await api('/api/criancas', {
            metodo: 'POST', token: secretaria.token,
            corpo: { id_membro: r.corpo.id, sexo: 'feminino', id_turma: turma, autorizacao_responsavel: true,
                     responsavel: { nome: 'Mãe Base', parentesco: 'mae', telefone: '(47) 90000-0000' } }
        });
        assert.equal(ficha.status, 201, ficha.texto);
        assert.equal(ficha.corpo.id_membro, r.corpo.id);
        assert.deepEqual(await contar('membros'), antes, 'a pessoa já existia');
        assert.equal((await criancas()).find(c => c.id_membro === r.corpo.id).tem_ficha, true);

        // Não cria duas fichas para a mesma pessoa, nem ficha para adulto
        const repetida = await api('/api/criancas', {
            metodo: 'POST', token: secretaria.token,
            corpo: { id_membro: r.corpo.id, sexo: 'feminino', id_turma: turma, autorizacao_responsavel: true, responsavel: { nome: 'Mãe', parentesco: 'mae', telefone: '1' } }
        });
        assert.equal(repetida.status, 409);
        const adulto = await cadastrar({ nome: 'Adulto Sem Ficha', data_nascimento: nascidoHa(25) });
        const fichaAdulto = await api('/api/criancas', { metodo: 'POST', token: secretaria.token, corpo: { id_membro: adulto.corpo.id, sexo: 'masculino', id_turma: turma, autorizacao_responsavel: true, responsavel: { nome: 'X', parentesco: 'pai', telefone: '1' } } });
        assert.equal(fichaAdulto.status, 400);
    });

    test('"Nova criança" cadastra a pessoa na base (como visitante) e recusa adultos', async () => {
        const turma = (await pool.query('SELECT id_turma FROM cadastroturmas WHERE ativo LIMIT 1')).rows[0].id_turma;
        const corpo = { nome: 'Criança Nova Base', data_nascimento: nascidoHa(4), sexo: 'masculino', id_turma: turma,
                        autorizacao_responsavel: true, responsavel: { nome: 'Pai Base', parentesco: 'pai', telefone: '(47) 91111-0000' } };
        const r = await api('/api/criancas', { metodo: 'POST', token: secretaria.token, corpo });
        assert.equal(r.status, 201, r.texto);
        const pessoa = (await participantes()).find(p => p.id === r.corpo.id_membro);
        assert.equal(pessoa.tipo, 'visitante');
        assert.equal(pessoa.nome, 'Criança Nova Base');
        assert.equal((await api('/api/criancas', { metodo: 'POST', token: secretaria.token, corpo: { ...corpo, data_nascimento: nascidoHa(18) } })).status, 400);
    });

    test('quem completa 18 anos sai de Crianças sem perder o cadastro', async () => {
        const r = await cadastrar({ nome: 'Quase Adulto', data_nascimento: nascidoHa(18, -1) }); // faz 18 amanhã
        assert.ok((await criancas()).some(c => c.id_membro === r.corpo.id));
        await pool.query('UPDATE membros SET data_nascimento = $2 WHERE id_membro = $1', [r.corpo.id, nascidoHa(18)]); // faz 18 hoje
        assert.ok(!(await criancas()).some(c => c.id_membro === r.corpo.id), 'com 18 anos não é criança');
        assert.ok((await participantes()).some(p => p.id === r.corpo.id), 'continua em Participantes');
    });

    test('sem data de nascimento, ninguém é tratado como criança', async () => {
        const r = await cadastrar({ nome: 'Sem Nascimento' });
        assert.ok(!(await criancas()).some(c => c.id_membro === r.corpo.id));
    });

    test('Voluntários = ativo E apto: cada critério é exigido', async () => {
        const r = await cadastrar({ nome: 'Candidato Voluntário', data_nascimento: nascidoHa(28) });
        const id = r.corpo.id;
        const naLista = async () => (await voluntarios()).some(v => v.id_membro === id);

        assert.equal((await classificar(id, { apto_voluntario: true })).status, 400, 'visitante não é apto');
        assert.equal((await tornarMembro(id)).status, 201);
        assert.equal(await naLista(), false, 'membro ativo, mas não apto');

        assert.equal((await classificar(id, { apto_voluntario: true })).status, 200);
        assert.equal(await naLista(), true, 'ativo e apto');
        const linha = (await voluntarios()).find(v => v.id_membro === id);
        assert.equal(linha.tem_ficha, false, 'aparece para completar a ficha');

        assert.equal((await classificar(id, { ativo: false })).status, 200);
        assert.equal(await naLista(), false, 'inativo não aparece');
        assert.ok((await participantes()).some(p => p.id === id), 'o cadastro continua existindo');
    });

    test('ficha de voluntário só para quem é ativo e apto; o cadastro não muda a aptidão', async () => {
        const r = await cadastrar({ nome: 'Sem Aptidão' });
        await tornarMembro(r.corpo.id);
        const funcao = (await pool.query('SELECT id_funcao FROM funcoes LIMIT 1')).rows[0].id_funcao;
        const corpo = { id_membro: r.corpo.id, funcoes: [funcao], disponibilidade: ['domingo'] };
        assert.equal((await api('/api/voluntarios', { metodo: 'POST', token: admin.token, corpo })).status, 400);

        await classificar(r.corpo.id, { apto_voluntario: true });
        const ficha = await api('/api/voluntarios', { metodo: 'POST', token: admin.token, corpo });
        assert.equal(ficha.status, 201);
        assert.equal((await api('/api/voluntarios', { metodo: 'POST', token: admin.token, corpo })).status, 409, 'uma ficha por pessoa');
        const linha = (await voluntarios()).find(v => v.id_membro === r.corpo.id);
        assert.equal(linha.tem_ficha, true);
    });

    test('função de escala não dá acesso administrativo', async () => {
        const escalado = (await pool.query(
            `SELECT DISTINCT v.id_membro FROM escala_participantes ep JOIN voluntarios v ON v.id_voluntario = ep.id_voluntario
             WHERE NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.id_membro = v.id_membro) LIMIT 1`)).rows[0];
        assert.ok(!(await usuarios()).some(u => u.id_membro === escalado.id_membro));
    });

    test('Usuários: só quem tem login de gestão; perder o acesso não apaga a pessoa', async () => {
        const r = await cadastrar({ nome: 'Futura Secretária' });
        const conta = await api('/api/usuarios', {
            metodo: 'POST', token: admin.token,
            corpo: { id_membro: r.corpo.id, email: `secretaria.${Date.now()}@exemplo.test`, senha: 'Senha@123', perfil: 'SECRETARIA', permissoes: { participantes: true } }
        });
        assert.equal(conta.status, 201);
        assert.ok((await usuarios()).some(u => u.id_membro === r.corpo.id && u.nome === 'Futura Secretária'));

        // Perfil de portal não é de gestão: some de Usuários, a pessoa continua
        await pool.query("UPDATE usuarios SET perfil = 'VOLUNTARIO' WHERE id_usuario = $1", [conta.corpo.id_usuario]);
        assert.ok(!(await usuarios()).some(u => u.id_membro === r.corpo.id));
        assert.ok((await participantes()).some(p => p.id === r.corpo.id));
    });

    test('pedido de acesso pela tela de login cria a pessoa (visitante) e o login ativo, sem áreas de gestão', async () => {
        const email = `pedido.${Date.now()}@exemplo.test`;
        const r = await api('/api/auth/registro', { metodo: 'POST', corpo: { nome: 'Pessoa Que Pediu', email, senha: 'Senha@123' } });
        assert.equal(r.status, 201);
        const u = (await pool.query(
            `SELECT u.perfil, u.ativo, m.nome_completo, m.classificacao FROM usuarios u JOIN membros m USING (id_membro) WHERE u.email = $1`, [email])).rows[0];
        assert.deepEqual(u, { perfil: 'VISUALIZACAO', ativo: true, nome_completo: 'Pessoa Que Pediu', classificacao: 'visitante' });
    });
});

describe('Segurança da classificação', () => {
    test('quem não é administrador não classifica nem se dá privilégios pelo cadastro', async () => {
        const r = await cadastrar({ nome: 'Tentativa', tipo: 'membro', apto_voluntario: true, perfil: 'ADMINISTRADOR', classificacao: 'membro' });
        const pessoa = (await participantes()).find(p => p.id === r.corpo.id);
        assert.deepEqual([pessoa.tipo, pessoa.apto, pessoa.perfil], ['visitante', false, null]);
        assert.equal((await api(`/api/participantes/${r.corpo.id}`, { metodo: 'PATCH', token: secretaria.token, corpo: { apto_voluntario: true } })).status, 403);
        assert.equal((await api(`/api/participantes/${r.corpo.id}/membro`, { metodo: 'POST', token: secretaria.token, corpo: {} })).status, 403);
    });

    test('perfil de acesso das pessoas só aparece para quem gerencia usuários', async () => {
        const lista = (await api('/api/participantes', { token: secretaria.token })).corpo.participantes;
        assert.ok(lista.every(p => p.perfil === null && p.id_usuario === null));
        assert.ok((await participantes()).some(p => p.perfil === 'ADMINISTRADOR'));
    });

    test('escala só aceita voluntários ativos e aptos daquela função', async () => {
        const naoApto = (await pool.query(
            `SELECT v.id_voluntario, vf.id_funcao FROM voluntarios v JOIN voluntario_funcoes vf USING (id_voluntario)
             JOIN membros m ON m.id_membro = v.id_membro LIMIT 1`)).rows[0];
        await pool.query('UPDATE membros SET apto_voluntario = FALSE WHERE id_membro = (SELECT id_membro FROM voluntarios WHERE id_voluntario = $1)', [naoApto.id_voluntario]);
        try {
            const r = await api('/api/escalas', {
                metodo: 'POST', token: admin.token,
                corpo: { data: '2026-12-20', horario: '08:00', id_funcao: naoApto.id_funcao, qtd_voluntarios: 1, voluntarios: [naoApto.id_voluntario],
                         evento: { nome: 'Teste Elegibilidade', tipo_evento: 'culto', hora_inicio: '09:00', hora_fim: '11:00' } }
            });
            assert.equal(r.status, 400);
        } finally {
            await pool.query('UPDATE membros SET apto_voluntario = TRUE WHERE id_membro = (SELECT id_membro FROM voluntarios WHERE id_voluntario = $1)', [naoApto.id_voluntario]);
        }
    });
});
