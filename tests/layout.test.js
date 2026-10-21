// =========================================================
// Testes de layout e de interface no navegador (Chrome/Edge
// instalado, sem janela). Também verifica XSS na tela.
// =========================================================

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const { iniciar, encerrar, api, criarUsuario, voluntarioComEscalas, pool, TODAS, NENHUMA, SENHA } = require('./apoio');

const TELAS = { celular: { width: 375, height: 812 }, tablet: { width: 768, height: 1024 }, desktop: { width: 1280, height: 800 } };
const PAGINAS = ['gerenciaDashboard', 'gerenciaEvento', 'gerenciaPresenca', 'gerenciaParticipantes', 'gerenciaVoluntarios',
    'gerenciaEscalas', 'gerenciaFuncoes', 'gerenciaCriancas', 'gerenciaRelatorios', 'gerenciaUsuarios', 'gerenciaConfiguracoes'];

let navegador;
let admin;
let urlBase;

async function abrirNavegador() {
    for (const channel of ['chrome', 'msedge']) {
        try {
            return await chromium.launch({ channel, headless: true });
        } catch {
            // tenta o próximo navegador instalado
        }
    }
    throw new Error('Instale o Google Chrome ou o Microsoft Edge para rodar os testes de layout.');
}

// Abre uma página já logada (token na sessão) e registra erros de JavaScript
async function abrirLogado(usuario, tela = TELAS.desktop) {
    const contexto = await navegador.newContext({ viewport: tela });
    await contexto.addInitScript(token => sessionStorage.setItem('igreja-token', token), usuario.token);
    const pagina = await contexto.newPage();
    const erros = [];
    pagina.on('pageerror', erro => erros.push(erro.message));
    pagina.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) erros.push(msg.text()); });
    pagina.on('dialog', dialogo => dialogo.dismiss());
    await pagina.goto(urlBase);
    await pagina.waitForSelector('#main h1');
    return { pagina, contexto, erros };
}

async function abrirPagina(pagina, idMenu, tela) {
    if (tela.width <= 1024) {
        await pagina.click('.menu-toggle');
        await pagina.waitForTimeout(300);
    }
    await pagina.click(`#${idMenu}`);
    await pagina.waitForLoadState('networkidle');
    await pagina.waitForTimeout(200);
}

const rolagemHorizontal = pagina => pagina.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

before(async () => {
    urlBase = await iniciar();
    navegador = await abrirNavegador();
    admin = await criarUsuario({ perfil: 'ADMINISTRADOR', permissoes: TODAS });
});

after(async () => {
    await navegador?.close();
    await encerrar();
});

describe('Tela de login e registro', () => {
    for (const [nome, tela] of Object.entries(TELAS)) {
        test(`login e registro no mesmo padrão (${nome})`, async () => {
            const contexto = await navegador.newContext({ viewport: tela });
            const pagina = await contexto.newPage();
            await pagina.goto(urlBase);
            await pagina.waitForSelector('#formLogin');

            const medir = () => pagina.evaluate(() => {
                const r = s => document.querySelector(s).getBoundingClientRect().toJSON();
                const formVisivel = document.querySelector('.login-form:not([hidden])');
                return { caixa: r('.login-caixa'), abas: r('.login-abas'), form: formVisivel.getBoundingClientRect().toJSON(), campos: [...formVisivel.querySelectorAll('input:not([type=checkbox])')].map(i => i.getBoundingClientRect().toJSON()) };
            });

            const login = await medir();
            await pagina.click('[data-aba="registro"]');
            await pagina.waitForTimeout(400);
            const registro = await medir();

            for (const [aba, m] of [['login', login], ['registro', registro]]) {
                assert.ok(m.form.width > 200, `${aba}: formulário sem largura`);
                for (const campo of m.campos) {
                    assert.ok(campo.left >= m.caixa.left && campo.right <= m.caixa.right + 0.5, `${aba}: campo fora da caixa`);
                    assert.ok(campo.top >= m.caixa.top && campo.bottom <= m.caixa.bottom + 0.5, `${aba}: campo fora da caixa (altura)`);
                }
            }
            assert.equal(Math.round(login.abas.height), Math.round(registro.abas.height), 'a barra de abas mudou de altura');
            assert.equal(Math.round(login.form.width), Math.round(registro.form.width), 'formulários com larguras diferentes');
            assert.equal(Math.round(login.campos[0].height), Math.round(registro.campos[0].height), 'campos com alturas diferentes');
            assert.equal(registro.campos.length, 5);
            assert.ok(await rolagemHorizontal(pagina) <= 0, 'rolagem horizontal na tela de login');
            await contexto.close();
        });
    }

    test('login pela tela leva ao dashboard e "Sair" volta ao login', async () => {
        const contexto = await navegador.newContext({ viewport: TELAS.desktop });
        const pagina = await contexto.newPage();
        await pagina.goto(urlBase);
        await pagina.fill('#loginUsuario', admin.email);
        await pagina.fill('#loginSenha', SENHA);
        await pagina.click('#formLogin button[type="submit"]');
        await pagina.waitForSelector('#main h1');
        assert.equal(await pagina.textContent('#main h1'), 'Dashboard');

        await pagina.click('.sair');
        await pagina.waitForSelector('#formLogin');
        const tokens = await pagina.evaluate(() => [sessionStorage.getItem('igreja-token'), localStorage.getItem('igreja-token')]);
        assert.deepEqual(tokens, [null, null], 'o token deveria ser apagado ao sair');
        await contexto.close();
    });

    test('senha errada mostra mensagem e não entra', async () => {
        const contexto = await navegador.newContext({ viewport: TELAS.celular });
        const pagina = await contexto.newPage();
        await pagina.goto(urlBase);
        await pagina.fill('#loginUsuario', admin.email);
        await pagina.fill('#loginSenha', 'errada');
        await pagina.click('#formLogin button[type="submit"]');
        await pagina.waitForFunction(() => document.querySelector('#mensagemLogin').textContent.length > 0);
        assert.equal(await pagina.$('#main'), null);
        await contexto.close();
    });
});

describe('Páginas do sistema', () => {
    for (const [nome, tela] of Object.entries(TELAS)) {
        test(`todas as páginas sem erros e sem rolagem horizontal (${nome})`, async () => {
            const { pagina, contexto, erros } = await abrirLogado(admin, tela);
            for (const id of PAGINAS) {
                await abrirPagina(pagina, id, tela);
                const titulo = await pagina.textContent('#main h1');
                assert.ok(titulo?.trim(), `${id}: sem título`);
                assert.ok(await rolagemHorizontal(pagina) <= 0, `${id}: rolagem horizontal de ${await rolagemHorizontal(pagina)}px`);
                assert.equal(await pagina.getAttribute(`#${id}`, 'class'), 'active', `${id}: menu não marcado como ativo`);

                // O título não pode ficar escondido atrás do perfil
                const sobreposto = await pagina.evaluate(() => {
                    const a = document.querySelector('#main h1').getBoundingClientRect();
                    const b = document.querySelector('#main .profile').getBoundingClientRect();
                    return a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
                });
                assert.equal(sobreposto, false, `${id}: título sobreposto ao perfil`);
            }
            assert.deepEqual(erros, [], `erros de JavaScript: ${erros.join(' | ')}`);
            await contexto.close();
        });
    }

    test('celular: menu lateral fica escondido e abre pelo botão', async () => {
        const { pagina, contexto } = await abrirLogado(admin, TELAS.celular);
        const dentroDaTela = () => pagina.evaluate(() => document.querySelector('#sidebar').getBoundingClientRect().right > 0);
        assert.equal(await dentroDaTela(), false, 'menu aparece sem ser aberto');

        const botao = await pagina.$('.menu-toggle');
        const tamanho = await botao.boundingBox();
        assert.ok(tamanho.width >= 40 && tamanho.height >= 40, 'botão do menu pequeno demais para toque');

        await botao.click();
        await pagina.waitForTimeout(350);
        assert.equal(await dentroDaTela(), true, 'menu não abriu');
        await pagina.keyboard.press('Escape');
        await pagina.waitForTimeout(350);
        assert.equal(await dentroDaTela(), false, 'Esc não fechou o menu');
        await contexto.close();
    });

    test('desktop: menu lateral sempre visível e sem botão de menu', async () => {
        const { pagina, contexto } = await abrirLogado(admin, TELAS.desktop);
        assert.equal(await pagina.isVisible('.menu-toggle'), false);
        const menu = await pagina.evaluate(() => document.querySelector('#sidebar').getBoundingClientRect().toJSON());
        assert.equal(Math.round(menu.left), 0);
        await contexto.close();
    });

    test('calendário de escalas: 7 colunas e seletor de mês começa fechado', async () => {
        const { pagina, contexto } = await abrirLogado(admin, TELAS.celular);
        await abrirPagina(pagina, 'gerenciaEscalas', TELAS.celular);
        assert.equal(await pagina.isVisible('#seletorMes'), false);
        const colunas = await pagina.evaluate(() => getComputedStyle(document.querySelector('.calendar')).gridTemplateColumns.split(' ').length);
        assert.equal(colunas, 7);
        await pagina.click('#btnEscolherMes');
        assert.equal(await pagina.isVisible('#seletorMes'), true);
        await contexto.close();
    });
});

describe('Listas só aparecem após interação', () => {
    const paginas = [
        ['gerenciaParticipantes', 'visitante'],
        ['gerenciaVoluntarios', 'ativo'],
        ['gerenciaFuncoes', 'ativa'],
        ['gerenciaCriancas', 'ausente']
    ];

    for (const [id, filtro] of paginas) {
        test(`${id}: nenhum nome ao abrir; aparece com busca ou filtro`, async () => {
            const { pagina, contexto, erros } = await abrirLogado(admin, TELAS.desktop);
            await abrirPagina(pagina, id, TELAS.desktop);
            const painel = id === 'gerenciaCriancas' ? '#painelCriancas' : '#main .panel:has(.search)';
            const linhas = () => pagina.$$eval(`${painel} tbody tr[data-filtro]`, trs => trs.length);

            // Ao abrir: nenhuma linha (nem escondida) e o aviso explicando o que fazer
            assert.equal(await linhas(), 0, 'a lista não deveria aparecer sem interação');
            assert.match(await pagina.textContent(`${painel} tbody`), /Pesquise pelo nome ou use os filtros/);

            // Busca por um pedaço de texto da primeira linha
            await pagina.click(`${painel} .filtro[data-filtro="todos"]`);
            const total = await linhas();
            assert.ok(total > 0, 'o filtro "Todos" deveria mostrar os registros');
            const primeiraPalavra = (await pagina.textContent(`${painel} tbody tr[data-filtro] strong`)).trim().split(' ')[0];

            // Volta ao estado inicial abrindo a página de novo e pesquisa
            await abrirPagina(pagina, id, TELAS.desktop);
            assert.equal(await linhas(), 0);
            await pagina.fill(`${painel} .search`, primeiraPalavra);
            const encontrados = await linhas();
            assert.ok(encontrados > 0 && encontrados <= total, 'a busca deveria mostrar resultados');
            const textos = await pagina.$$eval(`${painel} tbody tr[data-filtro]`, trs => trs.map(t => t.textContent.toLowerCase()));
            assert.ok(textos.every(t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').includes(primeiraPalavra.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))));

            // Limpar a busca esconde de novo; um filtro específico também mostra
            await pagina.fill(`${painel} .search`, '');
            assert.equal(await linhas(), 0, 'limpar a busca deveria esconder a lista');
            await pagina.click(`${painel} .filtro[data-filtro="${filtro}"]`);
            assert.ok(await linhas() >= 0);
            assert.equal(await pagina.getAttribute(`${painel} .filtro[data-filtro="${filtro}"]`, 'class'), 'filtro ativo');

            // Pesquisa sem resultado mostra mensagem
            await pagina.fill(`${painel} .search`, 'zzzz-nao-existe-zzzz');
            assert.equal(await linhas(), 0);
            assert.match(await pagina.textContent(`${painel} tbody`), /Nenhum registro encontrado/);
            assert.deepEqual(erros, []);
            await contexto.close();
        });
    }
});

describe('Voltar e avançar do navegador', () => {
    const titulo = pagina => pagina.textContent('#main h1');
    const esperarTitulo = (pagina, texto) => pagina.waitForFunction(t => document.querySelector('#main h1')?.textContent === t, texto);

    test('voltar/avançar percorrem as páginas visitadas', async () => {
        const { pagina, contexto, erros } = await abrirLogado(admin, TELAS.desktop);
        await abrirPagina(pagina, 'gerenciaParticipantes', TELAS.desktop);
        await abrirPagina(pagina, 'gerenciaFuncoes', TELAS.desktop);
        await pagina.click('#btnNovaFuncao');
        await esperarTitulo(pagina, 'Nova Função');
        assert.match(pagina.url(), /#\/funcoes\/nova$/);

        await pagina.goBack(); await esperarTitulo(pagina, 'Funções');
        assert.equal(await pagina.getAttribute('#gerenciaFuncoes', 'class'), 'active');
        await pagina.goBack(); await esperarTitulo(pagina, 'Participantes');
        assert.equal(await pagina.getAttribute('#gerenciaParticipantes', 'class'), 'active');
        await pagina.goBack(); await esperarTitulo(pagina, 'Dashboard');
        await pagina.goForward(); await esperarTitulo(pagina, 'Participantes');
        await pagina.goForward(); await esperarTitulo(pagina, 'Funções');
        assert.deepEqual(erros, []);
        await contexto.close();
    });

    test('recarregar a página mantém a página atual', async () => {
        const { pagina, contexto } = await abrirLogado(admin, TELAS.desktop);
        await abrirPagina(pagina, 'gerenciaEscalas', TELAS.desktop);
        await pagina.click('.calendar .dia[data-data$="-15"]');
        await pagina.waitForTimeout(400);
        const dia = await pagina.textContent('#tituloDia');
        await pagina.reload();
        await esperarTitulo(pagina, 'Escalas');
        await pagina.waitForFunction(d => document.querySelector('#tituloDia')?.textContent === d, dia);
        assert.match(pagina.url(), /#\/escalas$/);
        await contexto.close();
    });

    test('depois de salvar um formulário, voltar não reabre o formulário', async () => {
        const { pagina, contexto } = await abrirLogado(admin, TELAS.desktop);
        await abrirPagina(pagina, 'gerenciaParticipantes', TELAS.desktop);
        await pagina.click('#btnNovoParticipante');
        await esperarTitulo(pagina, 'Cadastro de Participante');
        await pagina.selectOption('#tipoParticipante', 'visitante');
        await pagina.fill('#pNome', 'Visitante Navegação');
        await pagina.click('#formParticipante button[type="submit"]');
        await esperarTitulo(pagina, 'Participantes');
        await pagina.goBack();
        await esperarTitulo(pagina, 'Dashboard');
        await contexto.close();
    });

    test('botão "voltar" do formulário também não deixa o formulário no histórico', async () => {
        const { pagina, contexto } = await abrirLogado(admin, TELAS.desktop);
        await abrirPagina(pagina, 'gerenciaVoluntarios', TELAS.desktop);
        await pagina.click('#btnNovoVoluntario');
        await esperarTitulo(pagina, 'Novo Voluntário');
        await pagina.click('.back-button');
        await esperarTitulo(pagina, 'Voluntários');
        await pagina.goBack();
        await esperarTitulo(pagina, 'Dashboard');
        await contexto.close();
    });

    test('abrir um endereço direto (#/funcoes) leva à página', async () => {
        const contexto = await navegador.newContext({ viewport: TELAS.desktop });
        await contexto.addInitScript(token => sessionStorage.setItem('igreja-token', token), admin.token);
        const pagina = await contexto.newPage();
        await pagina.goto(`${urlBase}/#/funcoes`);
        await esperarTitulo(pagina, 'Funções');
        // Formulário de edição sem dados no histórico volta para a lista
        await pagina.goto(`${urlBase}/#/usuarios/editar`);
        await esperarTitulo(pagina, 'Usuários');
        await contexto.close();
    });

    test('endereço de área sem permissão abre o Dashboard', async () => {
        const restrito = await criarUsuario({ perfil: 'SECRETARIA', permissoes: { ...NENHUMA, criancas: true } });
        const contexto = await navegador.newContext({ viewport: TELAS.desktop });
        await contexto.addInitScript(token => sessionStorage.setItem('igreja-token', token), restrito.token);
        const pagina = await contexto.newPage();
        await pagina.goto(`${urlBase}/#/usuarios`);
        await esperarTitulo(pagina, 'Dashboard');
        assert.equal(await titulo(pagina), 'Dashboard');
        await contexto.close();
    });
});

describe('Ficha e portal do voluntário', () => {
    test('ficha abre pelo nome na lista, recarrega e volta', async () => {
        const v = await voluntarioComEscalas(5);
        const nome = (await pool.query('SELECT nome_completo FROM membros WHERE id_membro = $1', [v.id_membro])).rows[0].nome_completo;
        const { pagina, contexto, erros } = await abrirLogado(admin, TELAS.desktop);
        await abrirPagina(pagina, 'gerenciaVoluntarios', TELAS.desktop);
        await pagina.fill('.search', nome);
        await pagina.click(`.link-ficha[data-ficha="${v.id_voluntario}"]`);
        await pagina.waitForFunction(n => document.querySelector('#main h1')?.textContent === n, nome);
        assert.match(pagina.url(), /#\/voluntarios\/ficha$/);
        assert.ok(await pagina.$$eval('#fichaProximas tr', trs => trs.length) >= 1);

        await pagina.reload();
        await pagina.waitForFunction(n => document.querySelector('#main h1')?.textContent === n, nome);

        await pagina.click('#btnEditarVoluntario');
        await pagina.waitForSelector('.modal input[name="evFuncoes"]');
        await pagina.keyboard.press('Escape');

        await pagina.goBack();
        await pagina.waitForFunction(() => document.querySelector('#main h1')?.textContent === 'Voluntários');
        assert.ok(await rolagemHorizontal(pagina) <= 0);
        assert.deepEqual(erros, []);
        await contexto.close();
    });

    for (const [nomeTela, tela] of [['celular', TELAS.celular], ['desktop', TELAS.desktop]]) {
        test(`portal: voluntário confirma e recusa escalas (${nomeTela})`, async () => {
            const v = await voluntarioComEscalas(nomeTela === 'celular' ? 6 : 7);
            const login = await criarUsuario({ perfil: 'VOLUNTARIO', permissoes: NENHUMA, id_membro: v.id_membro });
            const { pagina, contexto, erros } = await abrirLogado(login, tela);
            await pagina.waitForSelector('.escala-card');

            // Só a Minha área no menu; endereço de gestão volta para o portal
            assert.deepEqual(await pagina.$$eval('.sidebar nav a', links => links.map(a => a.id)), ['gerenciaMinhaArea']);
            await pagina.goto(`${urlBase}/#/usuarios`);
            await pagina.waitForSelector('.escala-card');
            assert.match(pagina.url(), /#\/minha-area$/);

            // Confirmar a primeira escala que aguarda resposta
            const aguardando = '.escala-card.aguardando';
            const id = await pagina.getAttribute(aguardando, 'data-escala');
            await pagina.click(`[data-escala="${id}"] [data-resposta="confirmar"]`);
            await pagina.waitForSelector(`.escala-card.confirmada[data-escala="${id}"]`);

            // Recusar outra com motivo
            const outra = await pagina.getAttribute(aguardando, 'data-escala').catch(() => null)
                || await pagina.getAttribute(`.escala-card.confirmada:not([data-escala="${id}"])`, 'data-escala');
            await pagina.click(`[data-escala="${outra}"] [data-resposta="recusar"]`);
            await pagina.fill('#motivoRecusa', 'Viagem de trabalho');
            await pagina.click('.modal button[type="submit"]');
            await pagina.waitForSelector(`.escala-card.recusada[data-escala="${outra}"]`);
            assert.match(await pagina.textContent(`.escala-card.recusada[data-escala="${outra}"]`), /Viagem de trabalho/);

            assert.ok(await rolagemHorizontal(pagina) <= 0, 'rolagem horizontal no portal');
            assert.deepEqual(erros, []);
            await contexto.close();
        });
    }
});

describe('Segurança na tela', () => {
    test('nome com HTML/script aparece como texto (sem XSS)', async () => {
        const ataque = '<img src=x onerror="window.__xss=1">XSS-Teste';
        const r = await api('/api/participantes', { metodo: 'POST', token: admin.token, corpo: { tipo: 'visitante', nome: ataque, data_visita: '2026-10-21' } });
        assert.equal(r.status, 201);

        const { pagina, contexto } = await abrirLogado(admin, TELAS.desktop);
        await abrirPagina(pagina, 'gerenciaParticipantes', TELAS.desktop);
        await pagina.fill('.search', 'XSS-Teste');
        await pagina.waitForTimeout(300);
        const resultado = await pagina.evaluate(() => ({
            executou: window.__xss === 1,
            imagens: document.querySelectorAll('#main img[src="x"]').length,
            textoVisivel: document.querySelector('#main tbody').innerText.includes('<img src=x')
        }));
        assert.equal(resultado.executou, false, 'o script injetado foi executado');
        assert.equal(resultado.imagens, 0, 'a tag <img> injetada virou HTML');
        assert.equal(resultado.textoVisivel, true, 'o nome deveria aparecer como texto');
        await contexto.close();
    });

    test('usuário restrito só vê no menu as áreas permitidas', async () => {
        const restrito = await criarUsuario({ perfil: 'SECRETARIA', permissoes: { ...NENHUMA, criancas: true } });
        const { pagina, contexto } = await abrirLogado(restrito, TELAS.desktop);
        const menu = await pagina.$$eval('.sidebar nav a', links => links.map(a => a.id));
        assert.deepEqual(menu, ['gerenciaDashboard', 'gerenciaPresenca', 'gerenciaCriancas', 'gerenciaConfiguracoes']);
        await abrirPagina(pagina, 'gerenciaConfiguracoes', TELAS.desktop);
        assert.equal(await pagina.isDisabled('#cfNome'), true, 'configurações deveriam ser só leitura');
        assert.equal(await pagina.isVisible('#formConfiguracoes button[type="submit"]'), false, 'não deveria haver botão de salvar');
        await contexto.close();
    });

    test('token inválido na sessão volta para o login', async () => {
        const contexto = await navegador.newContext({ viewport: TELAS.desktop });
        await contexto.addInitScript(() => sessionStorage.setItem('igreja-token', 'token.falso'));
        const pagina = await contexto.newPage();
        await pagina.goto(urlBase);
        await pagina.waitForSelector('#formLogin');
        assert.equal(await pagina.$('#sidebar'), null);
        await contexto.close();
    });
});
