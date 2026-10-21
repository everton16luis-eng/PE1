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
        await esperarTitulo(pagina, 'Novo cadastro');
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

describe('Melhorias de usabilidade', () => {
    test('Dashboard: eventos da semana começam recolhidos e expandem sob demanda', async () => {
        for (const tela of [TELAS.celular, TELAS.desktop]) {
            const { pagina, contexto, erros } = await abrirLogado(admin, tela);
            const eventos = await pagina.$$('.evento-semana');
            if (!eventos.length) { await contexto.close(); continue; } // semana sem escalas no banco de testes
            assert.equal(await pagina.$$eval('.evento-detalhes:not([hidden])', d => d.length), 0, 'nada deveria abrir sozinho');
            assert.equal(await pagina.$$eval('.funcao-semana', f => f.filter(x => x.offsetParent).length), 0, 'funções não deveriam aparecer fechadas');

            const cabecalho = await eventos[0].$('.evento-cabecalho');
            await cabecalho.click();
            assert.equal(await cabecalho.getAttribute('aria-expanded'), 'true');
            assert.ok(await eventos[0].$$eval('.funcao-semana', f => f.filter(x => x.offsetParent).length) > 0, 'funções deveriam aparecer ao expandir');
            await cabecalho.click();
            assert.equal(await cabecalho.getAttribute('aria-expanded'), 'false');
            assert.ok(await rolagemHorizontal(pagina) <= 0);
            assert.deepEqual(erros, []);
            await contexto.close();
        }
    });

    test('Eventos no celular: Editar e Remover visíveis, grandes e funcionando', async () => {
        const { pagina, contexto } = await abrirLogado(admin, TELAS.celular);
        await abrirPagina(pagina, 'gerenciaEvento', TELAS.celular);
        await pagina.click('#tab-gerenciar');
        const linha = await pagina.$('#lista-eventos tr');
        await linha.scrollIntoViewIfNeeded();
        for (const seletor of ['.btn-editar', '.btn-remover']) {
            const caixa = await (await linha.$(seletor)).boundingBox();
            assert.ok(caixa.x >= 0 && caixa.x + caixa.width <= TELAS.celular.width, `${seletor} fora da tela`);
            assert.ok(caixa.height >= 44, `${seletor} pequeno para toque (${caixa.height}px)`);
        }
        assert.ok(await rolagemHorizontal(pagina) <= 0);

        await (await linha.$('.btn-editar')).click();
        await pagina.waitForSelector('.modal #edNome');
        assert.ok((await pagina.inputValue('#edNome')).length > 0);
        await pagina.click('.modal [data-cancelar]');

        // Remover pede confirmação; cancelando, nada muda
        let mensagem = '';
        pagina.removeAllListeners('dialog');
        pagina.once('dialog', dialogo => { mensagem = dialogo.message(); dialogo.dismiss(); });
        const antes = await pagina.$$eval('#lista-eventos tr', l => l.length);
        await (await linha.$('.btn-remover')).click();
        await pagina.waitForTimeout(300);
        assert.match(mensagem, /Remover o evento/);
        assert.equal(await pagina.$$eval('#lista-eventos tr', l => l.length), antes);
        await contexto.close();
    });

    test('Relatórios: botão Visualizar com o mesmo padrão do Gerar relatório', async () => {
        for (const tela of [TELAS.desktop, TELAS.celular]) {
            const { pagina, contexto } = await abrirLogado(admin, tela);
            await pagina.goto(`${urlBase}/#/relatorios/gerar`);
            await pagina.waitForSelector('#btnVisualizar');
            const estilo = seletor => pagina.$eval(seletor, b => {
                const cs = getComputedStyle(b);
                const icone = b.querySelector('.material-icons');
                return { display: cs.display, fonte: cs.fontSize, largura: b.getBoundingClientRect().width, icone: icone && getComputedStyle(icone).fontSize };
            });
            const visualizar = await estilo('#btnVisualizar');
            const gerar = await estilo('#formRelatorio button[type="submit"]');
            assert.equal(visualizar.display, 'flex');
            assert.equal(visualizar.fonte, gerar.fonte);
            assert.equal(visualizar.icone, gerar.icone);
            if (tela === TELAS.celular) assert.equal(Math.round(visualizar.largura), Math.round(gerar.largura), 'no celular os botões ocupam a largura');
            await contexto.close();
        }
    });

    test('Sair no celular: botão visível no cabeçalho e funcionando', async () => {
        const { pagina, contexto } = await abrirLogado(admin, TELAS.celular);
        assert.equal(await pagina.isVisible('.sair-mobile'), true);
        await pagina.click('.sair-mobile');
        await pagina.waitForSelector('#formLogin');
        await contexto.close();

        const desktop = await abrirLogado(admin, TELAS.desktop);
        assert.equal(await desktop.pagina.isVisible('.sair-mobile'), false, 'no computador vale o link "Sair"');
        await desktop.contexto.close();
    });

    test('Usuários não lista contas do portal do voluntário', async () => {
        const v = await voluntarioComEscalas(8);
        const portal = await criarUsuario({ perfil: 'VOLUNTARIO', permissoes: NENHUMA, id_membro: v.id_membro });
        const { pagina, contexto } = await abrirLogado(admin, TELAS.desktop);
        await abrirPagina(pagina, 'gerenciaUsuarios', TELAS.desktop);
        const texto = await pagina.textContent('#main');
        assert.ok(!texto.includes(portal.email), 'conta do portal apareceu em Usuários');
        assert.ok(!texto.includes('Voluntário'), 'perfil Voluntário apareceu em Usuários');
        await pagina.click('#btnNovoUsuario');
        const opcoes = await pagina.$$eval('#uPerfil option', o => o.map(x => x.value));
        assert.ok(!opcoes.includes('VOLUNTARIO'));
        await contexto.close();
    });

    test('Lista de presença: NEXT é a última turma', async () => {
        const { pagina, contexto } = await abrirLogado(admin, TELAS.desktop);
        await abrirPagina(pagina, 'gerenciaPresenca', TELAS.desktop);
        const turmas = await pagina.$$eval('.turma h2', h => h.map(x => x.textContent.trim()));
        assert.match(turmas.at(-1), /^next/i);
        await pagina.fill('#busca', 'a');
        const opcoes = await pagina.$$eval('[data-turma-membro]:first-of-type option', o => o.map(x => x.textContent.trim()));
        assert.match(opcoes.at(-1), /^next/i);
        await contexto.close();
    });

    test('Cadastro: formulário sem escolha de tipo; classificação só para administrador', async () => {
        const { pagina, contexto } = await abrirLogado(admin, TELAS.desktop);
        await abrirPagina(pagina, 'gerenciaParticipantes', TELAS.desktop);
        await pagina.click('.filtro[data-filtro="visitante"]');
        assert.ok(await pagina.$$eval('[data-promover]', b => b.length) > 0, 'administrador deveria ver "Tornar membro"');
        await pagina.click('#btnNovoParticipante');
        await pagina.waitForSelector('#formParticipante');
        assert.equal(await pagina.$('#tipoParticipante'), null);
        assert.equal(await pagina.$('#pFuncao'), null);
        await contexto.close();

        const secretaria = await criarUsuario({ perfil: 'SECRETARIA', permissoes: { ...NENHUMA, participantes: true } });
        const sec = await abrirLogado(secretaria, TELAS.desktop);
        await abrirPagina(sec.pagina, 'gerenciaParticipantes', TELAS.desktop);
        await sec.pagina.click('.filtro[data-filtro="todos"]');
        assert.equal(await sec.pagina.$$eval('[data-promover], [data-apto], [data-ativo]', b => b.length), 0, 'secretaria não classifica');
        await sec.contexto.close();
    });
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

describe('Minha área, dashboard e listas responsivas', () => {
    test('Minha área do membro: próximos eventos, sem escalas e sem rolagem lateral', async () => {
        const m = (await pool.query(
            `SELECT id_membro FROM membros m
             WHERE ativo AND classificacao = 'membro' AND NOT EXISTS (SELECT 1 FROM voluntarios v WHERE v.id_membro = m.id_membro)
               AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.id_membro = m.id_membro)
             LIMIT 1`)).rows[0];
        const membro = await criarUsuario({ perfil: 'VISUALIZACAO', permissoes: NENHUMA, id_membro: m.id_membro });
        for (const tela of [TELAS.celular, TELAS.desktop]) {
            const { pagina, contexto, erros } = await abrirLogado(membro, tela);
            await abrirPagina(pagina, 'gerenciaMinhaArea', tela);
            await pagina.waitForSelector('.painel-agenda');
            const titulos = await pagina.$$eval('#main h2', h => h.map(x => x.textContent.trim()));
            assert.ok(titulos.includes('Próximos eventos da igreja'));
            assert.ok(!titulos.includes('Minhas próximas escalas'), 'membro não tem escalas');
            assert.ok(await pagina.$$eval('.agenda-evento', e => e.length) > 0);
            assert.ok(await rolagemHorizontal(pagina) <= 0);
            assert.deepEqual(erros, []);
            await contexto.close();
        }
    });

    test('Minha área do voluntário: escalas primeiro, eventos depois', async () => {
        const v = await voluntarioComEscalas(9);
        const login = await criarUsuario({ perfil: 'VOLUNTARIO', permissoes: NENHUMA, id_membro: v.id_membro });
        const { pagina, contexto, erros } = await abrirLogado(login, TELAS.celular);
        await pagina.waitForSelector('.painel-agenda');
        const titulos = await pagina.$$eval('#main h2', h => h.map(x => x.textContent.trim()));
        assert.equal(titulos[0], 'Minhas próximas escalas');
        assert.ok(titulos.indexOf('Próximos eventos da igreja') > 0);
        assert.ok(await pagina.$$eval('.agenda-evento:not([hidden])', e => e.length) <= 6, 'lista secundária deveria vir compacta');
        assert.ok(await rolagemHorizontal(pagina) <= 0);
        assert.deepEqual(erros, []);
        await contexto.close();
    });

    test('Dashboard: tag "Recusou" sem risco/sublinhado', async () => {
        const { pagina, contexto } = await abrirLogado(admin, TELAS.desktop);
        const decoracao = await pagina.evaluate(() => {
            const lista = document.createElement('ul');
            lista.className = 'voluntarios-semana';
            lista.innerHTML = '<li class="recusado"><span>Fulano</span></li>';
            document.querySelector('#lista-escalas').appendChild(lista);
            const li = lista.firstElementChild;
            return [getComputedStyle(li).textDecorationLine, getComputedStyle(li.firstElementChild).textDecorationLine, getComputedStyle(li).color];
        });
        assert.deepEqual(decoracao.slice(0, 2), ['none', 'none']);
        assert.equal(decoracao[2], 'rgb(176, 59, 59)', 'a cor de recusa deve continuar');
        await contexto.close();
    });

    test('Dashboard: "Ver todas" e "Ver relatórios" abrem o relatório de escalas filtrado', async () => {
        const { pagina, contexto, erros } = await abrirLogado(admin, TELAS.desktop);
        await pagina.click('#btnVerPendentes');
        await pagina.waitForSelector('#gTipo');
        assert.equal(await pagina.inputValue('#gTipo'), 'escalas');
        assert.equal(await pagina.inputValue('.filtro-grupo[data-tipo="escalas"] [data-filtro="status"]'), 'pendentes');
        assert.ok(await pagina.inputValue('#gInicio'));
        await pagina.waitForSelector('#previewTabela th');
        const colunas = await pagina.$$eval('#previewTabela th', t => t.map(x => x.textContent));
        assert.ok(colunas.includes('Voluntário'), 'a prévia precisa mostrar quem está pendente');

        await pagina.goBack();
        await pagina.waitForSelector('#btnVerRelatorios');
        await pagina.click('#btnVerRelatorios');
        await pagina.waitForSelector('#gTipo');
        const [inicio, fim] = [await pagina.inputValue('#gInicio'), await pagina.inputValue('#gFim')];
        assert.match(inicio, /^\d{4}-\d{2}-01$/);
        assert.equal(inicio.slice(0, 7), fim.slice(0, 7), 'período = mês atual');
        assert.deepEqual(erros, []);
        await contexto.close();

        // Sem permissão de relatórios nem de escalas: os botões nem aparecem
        const restrito = await criarUsuario({ perfil: 'SECRETARIA', permissoes: { ...NENHUMA, criancas: true } });
        const r = await abrirLogado(restrito, TELAS.desktop);
        assert.equal(await r.pagina.$('#btnVerPendentes'), null);
        assert.equal(await r.pagina.$('#btnVerRelatorios'), null);
        await r.contexto.close();
    });

    const LISTAS = [
        ['gerenciaParticipantes', 'todos'], ['gerenciaVoluntarios', 'todos'], ['gerenciaEscalas', null],
        ['gerenciaFuncoes', 'todos'], ['gerenciaCriancas', 'todos'], ['gerenciaRelatorios', null]
    ];
    for (const [nomeTela, tela] of [['celular', TELAS.celular], ['tablet', TELAS.tablet]]) {
        test(`listas administrativas em cartões, sem cortes (${nomeTela})`, async () => {
            const { pagina, contexto, erros } = await abrirLogado(admin, tela);
            for (const [menu, filtro] of LISTAS) {
                await abrirPagina(pagina, menu, tela);
                assert.ok(await pagina.$('table.tabela-cartoes'), `${menu}: lista sem o modo cartão`);

                // Vazia (antes de pesquisar) e preenchida (depois do filtro)
                for (const estado of filtro ? ['vazia', 'preenchida'] : ['preenchida']) {
                    if (estado === 'preenchida' && filtro) await pagina.click(`.filtro[data-filtro="${filtro}"]`);
                    const medida = await pagina.evaluate(() => {
                        const painel = document.querySelector('table.tabela-cartoes').closest('.panel').getBoundingClientRect();
                        const fora = [...document.querySelectorAll('table.tabela-cartoes tbody *')]
                            .filter(el => { const r = el.getBoundingClientRect(); return r.width && (r.left < painel.left - 1 || r.right > painel.right + 1); })
                            .map(el => el.tagName + ' ' + el.textContent.trim().slice(0, 20));
                        const linhas = [...document.querySelectorAll('table.tabela-cartoes tbody tr')];
                        const botoes = [...document.querySelectorAll('table.tabela-cartoes tbody button')].map(b => b.getBoundingClientRect().height);
                        return {
                            fora: fora.slice(0, 3),
                            linhas: linhas.length,
                            semRotulo: linhas.flatMap(l => [...l.cells]).filter(c => c.colSpan === 1 && !c.dataset.label).length,
                            botaoPequeno: botoes.filter(h => h && h < 44).length
                        };
                    });
                    assert.deepEqual(medida.fora, [], `${menu} (${estado}): conteúdo fora do painel`);
                    assert.ok(medida.linhas > 0, `${menu} (${estado}): lista sem linhas nem mensagem`);
                    assert.equal(medida.semRotulo, 0, `${menu}: células sem rótulo no cartão`);
                    assert.equal(medida.botaoPequeno, 0, `${menu}: botão de ação menor que 44px`);
                    assert.ok(await rolagemHorizontal(pagina) <= 0, `${menu}: rolagem lateral`);
                }
            }
            assert.deepEqual(erros, []);
            await contexto.close();
        });
    }

    test('listas continuam em tabela no computador', async () => {
        const { pagina, contexto } = await abrirLogado(admin, TELAS.desktop);
        await abrirPagina(pagina, 'gerenciaVoluntarios', TELAS.desktop);
        await pagina.click('.filtro[data-filtro="todos"]');
        assert.equal(await pagina.$eval('table.tabela-cartoes tbody tr', tr => getComputedStyle(tr).display), 'table-row');
        assert.equal(await pagina.isVisible('table.tabela-cartoes thead th'), true);
        await contexto.close();
    });
});
