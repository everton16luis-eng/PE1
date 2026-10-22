// Mesma origem do servidor Express (funciona em localhost e em produção)
const API_URL = '/api';

// Usuário logado (preenchido ao entrar no sistema)
let usuarioAtual = null;

async function carregarDashboard() {
    if (!lerToken()) {
        mostrarLogin();
        return;
    }

    try {
        usuarioAtual = await enviarDados('auth/me', 'GET');
    } catch {
        return; // token inválido: enviarDados já abriu a tela de login
    }

    const app = document.getElementById('app');
    const main = document.createElement('main');
    main.classList.add('content');
    main.id = 'main';

    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';

    app.replaceChildren(sideBar(), overlay, main);

    // Abre a página que estava na URL (recarregar mantém a página atual)
    const estado = history.state?.rota ? history.state : { rota: rotaDaUrl(), args: [] };
    await abrirRotaDoHistorico(estado);
    if (!history.state?.rota) {
        history.replaceState({ rota: estado.rota, args: [] }, '', `#/${estado.rota}`);
    }
}

// ===================
//    NAVEGAÇÃO     ===
// ===================
// Cada página registra uma rota (#/participantes, #/participantes/novo...)
// para os botões Voltar/Avançar do navegador funcionarem.

let navegandoPeloHistorico = false;
let substituirProximaRota = false;

// rota -> [função da página, permissão necessária, rota de volta se faltar dado]
const ROTAS = {
    'dashboard': [gerenciaDashboard, 'gestao'],
    'eventos': [gerenciaEvento, 'escalas'],
    'presenca': [gerenciaPresenca, 'criancas'],
    'participantes': [gerenciaParticipantes, 'participantes'],
    'participantes/novo': [novoParticipante, 'participantes'],
    'voluntarios': [gerenciaVoluntarios, 'voluntarios'],
    'voluntarios/novo': [novoVoluntario, 'voluntarios'],
    'voluntarios/ficha': [fichaVoluntario, 'voluntarios', 'voluntarios'],
    'minha-area': [gerenciaMinhaArea, 'portal'],
    'funcoes': [gerenciaFuncoes, 'voluntarios'],
    'funcoes/nova': [formularioFuncao, 'voluntarios'],
    'funcoes/editar': [formularioFuncao, 'voluntarios', 'funcoes'],
    'escalas': [gerenciaEscalas, 'escalas'],
    'escalas/nova': [novaEscala, 'escalas'],
    'criancas': [gerenciaCriancas, 'criancas'],
    'criancas/nova': [novaCrianca, 'criancas', 'criancas'],
    'turmas': [gerenciaTurmas, 'criancas'],
    'relatorios': [gerenciaRelatorios, 'relatorios'],
    'relatorios/gerar': [gerarRelatorio, 'relatorios'],
    'relatorios/evento': [gerarRelatorioEvento, 'relatorios'],
    'usuarios': [gerenciaUsuarios, 'usuarios'],
    'usuarios/novo': [formularioUsuario, 'usuarios'],
    'usuarios/editar': [formularioUsuario, 'usuarios', 'usuarios'],
    'configuracoes': [gerenciaConfiguracoes, 'gestao']
};

function rotaDaUrl() {
    return decodeURIComponent(location.hash.replace(/^#\/?/, '')) || 'dashboard';
}

// Chamada no início de cada página (antes de qualquer await)
function registrarRota(rota, args = []) {
    if (navegandoPeloHistorico) return;
    const substituir = substituirProximaRota || history.state?.rota === rota;
    // "anterior" = página de onde se chegou (usada para voltar depois de salvar)
    const estado = { rota, args, anterior: substituir ? history.state?.anterior : history.state?.rota };
    substituirProximaRota = false;
    history[substituir ? 'replaceState' : 'pushState'](estado, '', `#/${rota}`);
    atualizarTitulo(rota);
}

// Título da aba = nome da página no menu (ex.: "Participantes — Igreja Novo Caminho")
function atualizarTitulo(rota) {
    const base = rota.split('/')[0];
    const link = document.getElementById(ROTAS[base]?.[0]?.name);
    const textoDoLink = link ? [...link.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join('').trim() : '';
    const nome = textoDoLink || base.replace(/^./, c => c.toUpperCase());
    document.title = `${nome} — Igreja Novo Caminho`;
}

// Sai de um formulário (salvar/cancelar/voltar) sem deixá-lo no histórico:
// se o formulário foi aberto a partir dessa página, volta no histórico;
// senão, substitui a entrada atual.
function abrirSubstituindo(abrirPagina, ...args) {
    const rota = Object.keys(ROTAS).find(r => ROTAS[r][0] === abrirPagina && !ROTAS[r][2]);
    if (rota && history.state?.anterior === rota) {
        substituirProximaRota = false;
        if (args.length) {
            // Volta e reabre com os dados novos (ex.: dia da escala criada)
            const estadoAnterior = { rota, args };
            window.addEventListener('popstate', () => history.replaceState({ ...history.state, ...estadoAnterior }, '', location.hash), { once: true, capture: true });
        }
        history.back();
        return;
    }
    substituirProximaRota = true;
    return abrirPagina(...args);
}

async function abrirRotaDoHistorico(estado) {
    let rota = ROTAS[estado?.rota] ? estado.rota : 'dashboard';
    let [abrir, permissao, rotaDeVolta] = ROTAS[rota];
    let args = estado?.args || [];

    // Página que precisa de dados que não estão no histórico: volta para a lista
    if (rotaDeVolta && !args[0]) {
        rota = rotaDeVolta;
        [abrir, permissao] = ROTAS[rota];
        args = [];
    }
    // Voluntário só acessa a Minha área; os demais vão ao Dashboard se não tiverem permissão
    if (somenteVoluntario() && permissao !== 'portal') {
        rota = 'minha-area';
    } else if (permissao && !temPermissao(permissao)) {
        rota = 'dashboard';
    }
    if (rota !== estado?.rota) {
        [abrir] = ROTAS[rota];
        args = [];
        // O endereço acompanha a página realmente aberta
        history.replaceState({ rota, args }, '', `#/${rota}`);
        estado = { rota, args };
    }

    document.querySelectorAll('.modal-overlay').forEach(modal => modal.remove());
    document.body.classList.remove('menu-aberto');

    navegandoPeloHistorico = true;
    let carregando;
    try {
        carregando = abrir(...args);
    } finally {
        navegandoPeloHistorico = false;
    }
    atualizarTitulo(estado?.rota || 'dashboard');
    await carregando;
}

window.addEventListener('popstate', () => {
    if (!usuarioAtual) return; // na tela de login não há páginas para abrir
    abrirRotaDoHistorico(history.state?.rota ? history.state : { rota: rotaDaUrl(), args: [] });
});

// ===================
//      SESSÃO     ===
// ===================

// O token fica no localStorage ("lembrar") ou só nesta aba (sessionStorage)
function lerToken() {
    try {
        return sessionStorage.getItem('igreja-token') || localStorage.getItem('igreja-token');
    } catch {
        return null;
    }
}

function salvarToken(token, lembrar) {
    try {
        (lembrar ? localStorage : sessionStorage).setItem('igreja-token', token);
    } catch {
        // navegador sem armazenamento: a sessão dura até recarregar a página
    }
}

function sairDoSistema() {
    try {
        sessionStorage.removeItem('igreja-token');
        localStorage.removeItem('igreja-token');
    } catch {
        // nada a limpar
    }
    usuarioAtual = null;
    mostrarLogin();
}

function cabecalhos() {
    const token = lerToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

// Administrador vê tudo; os demais só as áreas marcadas no cadastro.
// "gestao": equipe de gestão (Dashboard, Configurações) — quem decide é o backend
// (/auth/me → gestao), pela mesma regra que protege a API; a tela só acompanha.
// "portal" (Minha área): logins de portal e de visualização, quem não é da gestão
// (usuário padrão) e quem tem ficha de voluntário mesmo com perfil de gestão.
// O que aparece nela vem da classificação no banco.
function temPermissao(area) {
    if (area === 'portal') {
        return !usuarioAtual?.gestao || ['VOLUNTARIO', 'VISUALIZACAO'].includes(usuarioAtual?.perfil) || Boolean(usuarioAtual?.voluntario);
    }
    if (!usuarioAtual?.gestao) return false;
    if (area === 'gestao') return true;
    return usuarioAtual?.perfil === 'ADMINISTRADOR' || Boolean(usuarioAtual?.permissoes?.[area]);
}

// Voluntário e usuário padrão (sem nenhuma área de gestão) só usam a Minha área
const somenteVoluntario = () => !usuarioAtual?.gestao;

// ===================
//       DADOS     ===
// ===================

// Faz o GET na API e devolve o JSON (ou o valor padrão em caso de erro)
async function buscarDados(rota, padrao) {
    try {
        const resposta = await fetch(`${API_URL}/${rota}`, { headers: cabecalhos() });
        if (resposta.status === 401) {
            sairDoSistema();
            return padrao;
        }
        if (!resposta.ok) {
            throw new Error(`Erro ao consultar a API (${rota})`);
        }
        return (await resposta.json()) ?? padrao;
    } catch (erro) {
        console.error(erro.message);
        return padrao;
    }
}

async function dadosDashboard() {
    return buscarDados('dashboardPessoas', {});
}

async function dadosFuncoes() {
    return buscarDados('funcoes', []);
}

async function dadosEventos() {
    return buscarDados('eventosDisponiveis', []);
}

async function dadosVolutanrios() {
    return buscarDados('voluntariosDisponiveis', []);
}

async function dadosEscalas() {
    return buscarDados('escalasSemana', []);
}

async function dadosConfirmacoes() {
    return buscarDados('confirmacoesPendentes', []);
}

async function dadosGrafico() {
    return buscarDados('graficoConfirmacoes', {});
}

async function dadosTodosEventos() {
    return buscarDados('eventos', []);
}

// Envia dados para a API (POST/PATCH) e devolve o JSON ou lança o erro
async function enviarDados(rota, metodo, corpo) {
    const resposta = await fetch(`${API_URL}/${rota}`, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', ...cabecalhos() },
        body: corpo ? JSON.stringify(corpo) : undefined
    });
    const dados = await resposta.json().catch(() => ({}));

    if (resposta.status === 401 && !rota.startsWith('auth/login')) {
        sairDoSistema();
    }
    if (!resposta.ok) {
        throw new Error(dados.erro || 'Erro ao comunicar com o servidor.');
    }
    return dados;
}
// ===================================

// ====================
//    UTILITÁRIOS    ===
// ====================

// Evita que textos vindos do banco sejam interpretados como HTML
function escapar(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function formatarData(data, opcoes = {}) {
    if (!data) return '';
    return new Date(data).toLocaleDateString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        ...opcoes
    });
}

function formatarHora(hora) {
    return hora ? String(hora).slice(0, 5) : '';
}

function marcarMenuAtivo(id) {
    document.querySelectorAll('.sidebar nav a').forEach(link => {
        link.classList.toggle('active', link.id === id);
    });
}

// Data de hoje no fuso local (AAAA-MM-DD)
function dataDeHoje() {
    const hoje = new Date();
    hoje.setMinutes(hoje.getMinutes() - hoje.getTimezoneOffset());
    return hoje.toISOString().slice(0, 10);
}

// Datas que vêm do banco como "AAAA-MM-DD" ou ISO, sem conversão de fuso
function formatarDataSimples(data) {
    if (!data) return '';
    const [ano, mes, dia] = String(data).slice(0, 10).split('-');
    return `${dia}/${mes}/${ano}`;
}

const normalizarTexto = texto => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const NOMES_DIAS = { domingo: 'Domingo', segunda: 'Segunda', terca: 'Terça', quarta: 'Quarta', quinta: 'Quinta', sexta: 'Sexta', sabado: 'Sábado' };
const nomesDosDias = dias => (dias || []).map(dia => NOMES_DIAS[dia] || dia).join(' / ');

//  Cards de estatística das páginas de gestão
function cardsEstatisticas(itens) {
    const section = document.createElement('section');
    section.className = 'cards';
    section.innerHTML = itens.map(([cor, icone, valor, rotulo]) => `
        <div class="stat ${cor}">
            <span class="material-icons">${icone}</span>
            <div><strong>${escapar(valor ?? 0)}</strong><small>${escapar(rotulo)}</small></div>
        </div>
    `).join('');
    return section;
}

//  Busca + botões de filtro de uma tabela.
//  "corresponde(linha, filtro)" decide se a linha aparece no filtro escolhido.
//  Com "exigirInteracao", nenhum registro aparece (nem fica na página) até a
//  pessoa pesquisar um nome ou clicar em um dos filtros.
// Tabelas com a classe "tabela-cartoes" viram cartões em telas menores (CSS).
// Aqui cada célula recebe o título da sua coluna (data-label), mostrado no cartão;
// a 1ª coluna vira o título do cartão e a coluna de ações ocupa a largura toda.
// Um observador cobre as linhas que entram depois (filtros, troca de dia...).
const COLUNA_DE_ACOES = /^(ação|ações|classificação)$/i;

function rotularTabela(tabela) {
    const titulos = [...tabela.querySelectorAll('thead th')].map(th => th.textContent.trim());
    tabela.querySelectorAll('tbody tr').forEach(linha => {
        [...linha.cells].forEach((celula, i) => {
            if (celula.dataset.label !== undefined || celula.colSpan > 1 || titulos[i] === undefined) return;
            celula.dataset.label = titulos[i];
            if (COLUNA_DE_ACOES.test(titulos[i])) celula.classList.add('celula-acoes');
            else if (i === 0) celula.classList.add('celula-titulo');
        });
    });
}

new MutationObserver(mudancas => {
    const tabelas = new Set();
    mudancas.forEach(mudanca => mudanca.addedNodes.forEach(no => {
        if (no.nodeType !== Node.ELEMENT_NODE) return;
        const propria = no.closest('table.tabela-cartoes');
        if (propria) tabelas.add(propria);
        no.querySelectorAll('table.tabela-cartoes').forEach(t => tabelas.add(t));
    }));
    tabelas.forEach(rotularTabela);
}).observe(document.documentElement, { childList: true, subtree: true });

function configurarFiltros(container, corresponde, { exigirInteracao = false } = {}) {
    const busca = container.querySelector('.search');
    const botoes = [...container.querySelectorAll('.filtro')];
    const tbody = container.querySelector('tbody');
    const linhas = [...tbody.querySelectorAll('tr[data-filtro]')];
    const contador = container.querySelector('.contador');
    if (!linhas.length) return; // tabela vazia: mantém a mensagem "nenhum cadastrado"

    if (exigirInteracao) botoes.forEach(b => b.classList.remove('ativo'));
    let filtroAtual = exigirInteracao ? null : (botoes.find(b => b.classList.contains('ativo'))?.dataset.filtro || 'todos');

    const aviso = document.createElement('tr');
    aviso.className = 'aviso-filtro';
    aviso.innerHTML = `<td colspan="${container.querySelectorAll('thead th').length || 1}" class="vazio"></td>`;

    function filtrar() {
        const termo = normalizarTexto(busca?.value);
        const interagiu = !exigirInteracao || Boolean(termo) || Boolean(filtroAtual);
        const encontradas = interagiu
            ? linhas.filter(linha => normalizarTexto(linha.textContent).includes(termo)
                && (!filtroAtual || filtroAtual === 'todos' || corresponde(linha, filtroAtual)))
            : [];

        if (exigirInteracao) {
            tbody.replaceChildren(...encontradas);
        } else {
            const visiveis = new Set(encontradas);
            linhas.forEach(linha => { linha.hidden = !visiveis.has(linha); });
        }

        if (!encontradas.length) {
            aviso.firstElementChild.textContent = interagiu
                ? 'Nenhum registro encontrado com essa pesquisa/filtro.'
                : 'Pesquise pelo nome ou use os filtros acima para exibir os registros.';
            tbody.appendChild(aviso);
        } else {
            aviso.remove();
        }

        if (contador) {
            contador.textContent = interagiu
                ? `${encontradas.length} de ${linhas.length} registro(s)`
                : `${linhas.length} registro(s) cadastrados`;
        }
    }

    busca?.addEventListener('input', filtrar);
    botoes.forEach(botao => botao.addEventListener('click', () => {
        botoes.forEach(b => b.classList.toggle('ativo', b === botao));
        filtroAtual = botao.dataset.filtro;
        filtrar();
    }));
    filtrar();
}

//  Abre um modal simples; devolve o elemento para preencher e a função de fechar
function abrirModal(titulo, descricao, conteudoHtml) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay mostrar';
    overlay.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true">
            <div class="modal-header">
                <div><h2></h2><p></p></div>
                <button type="button" class="modal-close" aria-label="Fechar">×</button>
            </div>
            <div class="modal-corpo">${conteudoHtml}</div>
        </div>
    `;
    overlay.querySelector('h2').textContent = titulo;
    overlay.querySelector('p').textContent = descricao || '';

    const fechar = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', fechar);
    overlay.addEventListener('click', event => { if (event.target === overlay) fechar(); });
    document.addEventListener('keydown', function aoTeclar(event) {
        if (event.key === 'Escape') { fechar(); document.removeEventListener('keydown', aoTeclar); }
    });

    document.body.appendChild(overlay);
    return { modal: overlay.querySelector('.modal'), fechar };
}

//  Cabeçalho de formulário com botão voltar (cadastros)
function headerComVoltar(nome, descricao, voltar) {
    const header = headerInterno(nome, descricao);
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'back-button';
    botao.setAttribute('aria-label', 'Voltar');
    botao.innerHTML = '<span class="material-icons">arrow_back</span>';
    botao.addEventListener('click', () => abrirSubstituindo(voltar));
    header.querySelector('.topbar-title').insertBefore(botao, header.querySelector('.topbar-title > div'));
    return header;
}

//  Mostra mensagem de erro/sucesso abaixo de um formulário
function mensagemFormulario(form, texto, erro = true) {
    let campo = form.querySelector('.mensagem-form');
    if (!campo) {
        campo = document.createElement('p');
        campo.className = 'mensagem-form';
        campo.setAttribute('role', 'status');
        campo.style.cssText = 'margin-top:12px;font-size:13px;';
        form.appendChild(campo);
    }
    campo.textContent = texto;
    campo.style.color = erro ? '#c34e4e' : '#22955e';
}

// ====================
// ELEMENTOS DE TELA ==
// ====================

//  Barra lateral
function sideBar() {
    const sideBar = document.createElement('aside');
    sideBar.classList.add('sidebar');
    sideBar.id = 'sidebar';
    sideBar.innerHTML = `
        <div class="brand">
            <img class="brand-logo" src="img/terracota.png" alt="Logo da Igreja Novo Caminho" hidden>
            <div class="brand-icon">✝</div>
            <div><strong>Igreja Novo Caminho</strong><span>ADMIN</span></div>
        </div>
        <nav></nav>
        <div class="sidebar-footer">Sistema de Gestão<br>da Igreja</div>
    `;

    // Mostra o logo só se a imagem existir; senão mantém o ícone ✝
    const logo = sideBar.querySelector('.brand-logo');
    logo.addEventListener('load', () => {
        logo.hidden = false;
        sideBar.querySelector('.brand-icon').hidden = true;
    });

    // [id, ícone, nome, função da página, permissão necessária]
    const paginas = [
        ['gerenciaMinhaArea', 'badge', 'Minha área', gerenciaMinhaArea, 'portal'],
        ['gerenciaDashboard', 'dashboard', 'Dashboard', gerenciaDashboard, 'gestao'],
        ['gerenciaEvento', 'event', 'Eventos', gerenciaEvento, 'escalas'],
        ['gerenciaPresenca', 'fact_check', 'Lista de presença', gerenciaPresenca, 'criancas'],
        ['gerenciaParticipantes', 'groups', 'Participantes', gerenciaParticipantes, 'participantes'],
        ['gerenciaVoluntarios', 'volunteer_activism', 'Voluntários', gerenciaVoluntarios, 'voluntarios'],
        ['gerenciaEscalas', 'calendar_month', 'Escalas', gerenciaEscalas, 'escalas'],
        ['gerenciaFuncoes', 'engineering', 'Funções', gerenciaFuncoes, 'voluntarios'],
        ['gerenciaCriancas', 'escalator_warning', 'Crianças', gerenciaCriancas, 'criancas'],
        ['gerenciaRelatorios', 'receipt_long', 'Relatórios', gerenciaRelatorios, 'relatorios'],
        ['gerenciaUsuarios', 'manage_accounts', 'Usuários', gerenciaUsuarios, 'usuarios'],
        ['gerenciaConfiguracoes', 'settings', 'Configurações', gerenciaConfiguracoes, 'gestao']
    ];

    const nav = sideBar.querySelector('nav');
    paginas
        .filter(([, , , , permissao]) => somenteVoluntario() ? permissao === 'portal' : (!permissao || temPermissao(permissao)))
        .forEach(([id, icone, nome, abrirPagina]) => {
            const link = document.createElement('a');
            link.id = id;
            link.href = '#';
            link.innerHTML = `<span class="material-icons">${icone}</span>${nome}`;
            link.addEventListener('click', (event) => {
                event.preventDefault();
                abrirPagina();
            });
            nav.appendChild(link);
        });

    return sideBar;
}

//  Cabeçalho interno das páginas
function headerInterno(nome, descricao) {
    const header = document.createElement('header');
    header.classList.add('topbar');
    header.id = 'topbar';
    header.innerHTML = `
        <div class="topbar-title">
            <button type="button" class="menu-toggle" aria-label="Abrir menu" aria-controls="sidebar" aria-expanded="false">
                <span class="material-icons">menu</span>
            </button>
            <div>
                <h1></h1>
                <p></p>
            </div>
        </div>
        <div class="profile">
            <span class="material-icons notifications">notifications</span>
            <div class="avatar"></div>
            <div class="profile-info">
                <strong></strong>
                <small><a href="#" class="sair">Sair</a></small>
            </div>
            <button type="button" class="sair sair-mobile" aria-label="Sair do sistema" title="Sair">
                <span class="material-icons">logout</span>
            </button>
        </div>
    `;
    header.querySelector('h1').innerText = nome;
    header.querySelector('p').innerText = descricao;

    const nomeUsuario = usuarioAtual?.nome || 'Administrador';
    header.querySelector('.avatar').textContent = nomeUsuario.charAt(0).toUpperCase();
    header.querySelector('.profile-info strong').textContent = nomeUsuario;
    header.querySelectorAll('.sair').forEach(botao => botao.addEventListener('click', (event) => {
        event.preventDefault();
        sairDoSistema();
    }));

    return header;
}

//  Cards do Dashboard
function atualizarCards(dados) {
    const sectionCards = document.createElement('section');
    sectionCards.classList.add('cards');
    sectionCards.id = 'cards';
    sectionCards.innerHTML = `
        <article class="stat-card blue">
            <div class="stat-icon">
                <span class="material-symbols-outlined card-resume">display_group</span>
            </div>
            <div><span>Visitantes</span><strong id="total_visitantes"></strong><small>Total cadastrados</small></div>
        </article>
        <article class="stat-card green">
            <div class="stat-icon">
                <span class="material-icons card-resume">groups</span>
            </div>
            <div><span>Membros</span><strong id="total_membros"></strong><small>Total cadastrados</small></div>
        </article>
        <article class="stat-card purple">
            <div class="stat-icon">
                <span class="material-icons card-resume">volunteer_activism</span>
            </div>
            <div><span>Voluntários</span><strong id="total_voluntarios"></strong><small>Ativos</small></div>
        </article>
        <article class="stat-card orange">
            <div class="stat-icon">
                <span class="material-icons card-resume">calendar_month</span>
            </div>
            <div><span>Escalas do mês</span><strong id="total_escalas"></strong><small>Funções escaladas</small></div>
        </article>
    `;
    sectionCards.querySelector('#total_visitantes').textContent = dados?.total_visitantes ?? 0;
    sectionCards.querySelector('#total_membros').textContent = dados?.total_membros ?? 0;
    sectionCards.querySelector('#total_voluntarios').textContent = dados?.total_voluntarios ?? 0;
    sectionCards.querySelector('#total_escalas').textContent = dados?.total_escalas ?? 0;

    return sectionCards;
}

//  "Escalas da Semana": um item por evento, com os detalhes (funções e
//  voluntários) só ao expandir
const TIPOS_DE_EVENTO = { culto: 'Culto', 'culto-jovens': 'Culto de Jovens', 'culto-infantil': 'Culto Infantil', evento: 'Evento', reuniao: 'Reunião' };

function eventosDaSemana(eventos) {
    if (!eventos.length) {
        return '<p class="vazio">Nenhuma escala cadastrada para esta semana.</p>';
    }

    const situacao = v => v.confirmado
        ? '<span class="material-icons" aria-hidden="true">check_circle</span>'
        : v.recusado
            ? '<span class="material-icons" aria-hidden="true">cancel</span>'
            : '<span class="material-icons" aria-hidden="true">schedule</span>';
    const rotulo = v => (v.confirmado ? 'confirmado' : v.recusado ? `recusou${v.motivo_recusa ? ': ' + v.motivo_recusa : ''}` : 'aguardando resposta');

    return eventos.map((ev, i) => {
        const tipo = TIPOS_DE_EVENTO[ev.tipo_evento] ? ev.tipo_evento : 'evento';
        const horario = ev.hora_inicio ? `${formatarHora(ev.hora_inicio)}${ev.hora_fim ? '–' + formatarHora(ev.hora_fim) : ''}` : '';
        const id = `evento-semana-${i}`;
        return `
            <div class="evento-semana tipo-${tipo}">
                <button type="button" class="evento-cabecalho" aria-expanded="false" aria-controls="${id}">
                    <span class="evento-dia">${escapar(dataComSemana(ev.data).replace(',', '').replace(/\/\d{4}$/, ''))}</span>
                    <span class="evento-info">
                        <strong>${escapar(ev.nome)}</strong>
                        <small>${horario ? horario + ' • ' : ''}${TIPOS_DE_EVENTO[tipo]} • ${ev.funcoes.length} função(ões)</small>
                    </span>
                    <span class="evento-resumo">
                        <span class="badge ok" title="Confirmados / vagas">${ev.confirmados}/${ev.vagas} confirmados</span>
                        ${ev.pendentes ? `<span class="badge pending">${ev.pendentes} pendente(s)</span>` : ''}
                        ${ev.recusados ? `<span class="badge inactive">${ev.recusados} recusa(s)</span>` : ''}
                        ${ev.faltam ? `<span class="badge inactive">faltam ${ev.faltam}</span>` : ''}
                    </span>
                    <span class="material-icons evento-seta" aria-hidden="true">expand_more</span>
                </button>
                <div class="evento-detalhes" id="${id}" hidden>
                    ${ev.funcoes.map(f => {
                        const escalados = f.voluntarios.filter(v => !v.recusado).length;
                        return `
                            <div class="funcao-semana">
                                <div class="funcao-titulo">
                                    <strong>${escapar(f.funcao || 'Função')}</strong>
                                    <small>Chegada ${formatarHora(f.horario) || '—'} • ${escalados} de ${f.qtd_voluntarios ?? '—'} voluntário(s)</small>
                                </div>
                                <ul class="voluntarios-semana">
                                    ${f.voluntarios.map(v => `
                                        <li class="${v.confirmado ? 'confirmado' : v.recusado ? 'recusado' : 'aguardando'}" title="${escapar(rotulo(v))}">
                                            ${situacao(v)}<span>${escapar(v.nome)}</span><span class="sr-only"> (${escapar(rotulo(v))})</span>
                                        </li>`).join('') || '<li class="aguardando">Ninguém escalado</li>'}
                                </ul>
                            </div>`;
                    }).join('')}
                    <p class="legenda-semana">
                        <span class="confirmado"><span class="material-icons" aria-hidden="true">check_circle</span>confirmado</span>
                        <span class="aguardando"><span class="material-icons" aria-hidden="true">schedule</span>aguardando</span>
                        <span class="recusado"><span class="material-icons" aria-hidden="true">cancel</span>recusou</span>
                    </p>
                </div>
            </div>`;
    }).join('');
}

//  Detalhes de um evento (resposta de GET eventos/:id ou relatorios/evento/:id),
//  somente leitura: dados gravados, resumo, funções com voluntários e respostas.
//  Os totais e a situação de cada voluntário vêm calculados do backend.
const SITUACOES_PARTICIPANTE = {
    confirmado: ['ok', 'Confirmado'],
    recusado: ['inactive', 'Recusou'],
    pendente: ['pending', 'Pendente de resposta'],
    indefinido: ['inactive', 'Situação não reconhecida']
};

function dataHoraCurta(valor) {
    if (!valor) return '';
    const [data, hora] = String(valor).split('T');
    return `${formatarDataSimples(data)}${hora ? ' ' + hora.slice(0, 5) : ''}`;
}

function htmlDetalhesEvento({ evento, funcoes, resumo }) {
    const horario = evento.hora_inicio
        ? `${evento.hora_inicio}${evento.hora_fim ? ' às ' + evento.hora_fim : ''}`
        : 'Não informado';
    const situacaoEvento = evento.realizado ? 'Realizado' : evento.em_andamento ? 'Acontecendo agora' : 'Próximo';
    const item = (rotulo, valor) => `<div><dt>${rotulo}</dt><dd>${valor}</dd></div>`;
    const numero = (valor, rotulo, cor = '') => `<div class="${cor}"><strong>${valor}</strong><small>${rotulo}</small></div>`;

    return `
        <div class="detalhes-evento">
            <dl class="dados-evento">
                ${item('Data', escapar(dataComSemana(evento.data_evento)))}
                ${item('Horário', escapar(horario))}
                ${item('Tipo', escapar(TIPOS_DE_EVENTO[evento.tipo_evento] || evento.tipo_evento || 'Não informado'))}
                ${item('Situação', situacaoEvento)}
                ${evento.criado_em ? item('Registro criado em', escapar(dataHoraCurta(evento.criado_em))) : ''}
            </dl>

            <div class="resumo-evento">
                ${numero(resumo.funcoes, 'Funções')}
                ${numero(resumo.vagas, 'Vagas previstas')}
                ${numero(resumo.atribuicoes, 'Voluntários atribuídos')}
                ${numero(resumo.confirmados, 'Confirmados', 'ok')}
                ${numero(resumo.recusados, 'Recusaram', 'inactive')}
                ${numero(resumo.pendentes, 'Pendentes de resposta', 'pending')}
                ${numero(resumo.vagas_nao_preenchidas, 'Vagas não preenchidas', 'inactive')}
            </div>

            ${funcoes.length ? funcoes.map(f => `
                <section class="funcao-evento">
                    <header>
                        <div>
                            <strong>${escapar(f.funcao || 'Função não informada')}</strong>
                            <small>Chegada ${escapar(f.horario || '—')} • ${f.confirmados + f.pendentes + f.indefinidos} de ${f.vagas} vaga(s) ocupada(s)</small>
                        </div>
                        <span class="badge ${f.situacao === 'completa' ? 'ok' : 'pending'}">${f.situacao === 'completa' ? 'Completa' : 'Com pendências'}</span>
                    </header>
                    ${f.observacoes ? `<p class="subtitulo">${escapar(f.observacoes)}</p>` : ''}
                    <ul class="voluntarios-evento">
                        ${f.participantes.map(p => {
                            const [cor, rotulo] = SITUACOES_PARTICIPANTE[p.situacao];
                            return `<li>
                                <span>${escapar(p.nome)}</span>
                                <span class="badge ${cor}">${rotulo}</span>
                                ${p.respondido_em && p.situacao !== 'pendente' ? `<small>Resposta em ${escapar(dataHoraCurta(p.respondido_em))}</small>` : ''}
                                ${p.recusado && p.motivo_recusa ? `<small>Motivo: ${escapar(p.motivo_recusa)}</small>` : ''}
                            </li>`;
                        }).join('') || '<li><span>Ninguém atribuído</span></li>'}
                        ${f.vagas_nao_preenchidas ? `<li class="vaga-aberta"><span>${f.vagas_nao_preenchidas} vaga(s) não preenchida(s)</span></li>` : ''}
                    </ul>
                </section>`).join('')
            : '<p class="vazio">Nenhuma função (escala) vinculada a este evento.</p>'}
        </div>`;
}

//  Lista "Confirmações Pendentes"
function listaConfirmacoes(confirmacoes) {
    if (!confirmacoes.length) {
        return '<p class="vazio">Nenhuma confirmação pendente.</p>';
    }

    return confirmacoes.map(item => `
        <div class="person">
            <div class="mini-avatar">${escapar(item.nome.charAt(0).toUpperCase())}</div>
            <div class="info">
                <strong>${escapar(item.nome)}</strong>
                <small>${escapar(item.funcao)} • ${formatarData(item.data_escala)}</small>
            </div>
            <span>Pendente</span>
        </div>
    `).join('');
}

//  Gráfico donut de confirmações do mês
function graficoConfirmacoes(grafico) {
    const confirmados = Number(grafico?.confirmados) || 0;
    const pendentes = Number(grafico?.pendentes) || 0;
    const ausentes = Number(grafico?.ausentes) || 0;
    const total = confirmados + pendentes + ausentes;
    const pct = valor => total ? Math.round((valor / total) * 100) : 0;
    const fimConfirmados = pct(confirmados);
    const fimPendentes = fimConfirmados + pct(pendentes);

    return `
        <div class="donut" style="background: conic-gradient(#25ad6b 0 ${fimConfirmados}%, #f5a027 ${fimConfirmados}% ${fimPendentes}%, #e9504f ${fimPendentes}% 100%)">
            <div><strong>${pct(confirmados)}%</strong><span>Confirmados</span></div>
        </div>
        <div class="legend">
            <p><i class="dot confirmed"></i> Confirmados <b>${pct(confirmados)}%</b></p>
            <p><i class="dot waiting"></i> Pendentes <b>${pct(pendentes)}%</b></p>
            <p><i class="dot absent"></i> Ausentes <b>${pct(ausentes)}%</b></p>
        </div>
    `;
}

async function renderizarEscalas() {
    const [escalas, eventos, confirmacoes, grafico] = await Promise.all([
        dadosEscalas(),
        dadosEventos(),
        dadosConfirmacoes(),
        dadosGrafico()
    ]);
    const sectionEscalas = document.createElement('section');
    sectionEscalas.classList.add('grid-main');
    sectionEscalas.innerHTML = `
        <article class="panel schedule-panel">
            <div class="panel-header">
                <div><h2>Escalas da Semana</h2><p>Toque em um evento para ver funções e voluntários</p></div>
                ${temPermissao('escalas') ? '<button type="button" id="btnVerEscalas">Ver todas</button>' : ''}
            </div>
            <div class="eventos-semana" id="lista-escalas">
                ${eventosDaSemana(escalas)}
            </div>
        </article>

        <article class="panel confirmations">
            <div class="panel-header">
                <h2>Confirmações Pendentes</h2>
                ${temPermissao('relatorios') || temPermissao('escalas') ? '<button type="button" id="btnVerPendentes">Ver todas</button>' : ''}
            </div>
            ${listaConfirmacoes(confirmacoes)}
        </article>

        <article class="panel chart-panel">
            <div class="panel-header">
                <h2>Confirmações do Mês</h2>
                ${temPermissao('relatorios') ? '<button type="button" id="btnVerRelatorios">Ver relatórios</button>' : ''}
            </div>
            <div class="chart-content">
                ${graficoConfirmacoes(grafico)}
            </div>
        </article>

        <article class="panel events">
            <div class="panel-header">
                <h2>Próximos Eventos</h2>
            </div>
            <div id="proximosEventos"></div>
        </article>
    `;

    const proximosEventos = sectionEscalas.querySelector('#proximosEventos');

    if (!eventos.length) {
        proximosEventos.innerHTML = '<p class="vazio">Nenhum evento cadastrado.</p>';
    }

    eventos.forEach(item => {
        const linha = document.createElement('div');
        const data = document.createElement('b');
        const nome = document.createElement('span');
        const horario = document.createElement('strong');

        linha.className = 'event';
        data.textContent = formatarData(item.data_evento, { day: '2-digit', month: '2-digit' });
        nome.textContent = item.nome;
        horario.textContent = formatarHora(item.hora_inicio);

        linha.append(data, nome, horario);
        proximosEventos.appendChild(linha);
    });

    // Expandir/recolher os detalhes de cada evento da semana
    sectionEscalas.querySelector('#lista-escalas').addEventListener('click', event => {
        const cabecalho = event.target.closest('.evento-cabecalho');
        if (!cabecalho) return;
        const aberto = cabecalho.getAttribute('aria-expanded') === 'true';
        cabecalho.setAttribute('aria-expanded', String(!aberto));
        cabecalho.closest('.evento-semana').classList.toggle('aberto', !aberto);
        document.getElementById(cabecalho.getAttribute('aria-controls')).hidden = aberto;
    });

    sectionEscalas.querySelector('#btnVerEscalas')?.addEventListener('click', () => gerenciaEscalas());

    // "Ver todas" as pendentes: página Escalas já na visão "Confirmações pendentes"
    // (cada atribuição com "Gerenciar escala"); sem acesso a Escalas, o relatório filtrado
    sectionEscalas.querySelector('#btnVerPendentes')?.addEventListener('click', () => {
        if (temPermissao('escalas')) {
            gerenciaEscalas(dataDeHoje(), 'pendentes');
        } else {
            gerarRelatorio('escalas', { status: 'pendentes', inicio: dataDeHoje() });
        }
    });

    // "Ver relatórios": as escalas do mês que o gráfico resume
    sectionEscalas.querySelector('#btnVerRelatorios')?.addEventListener('click', () => {
        const [ano, mes] = dataDeHoje().split('-').map(Number);
        const ultimoDia = new Date(ano, mes, 0).getDate();
        const doMes = dia => `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
        gerarRelatorio('escalas', { inicio: doMes(1), fim: doMes(ultimoDia) });
    });

    return sectionEscalas;
}

async function gerenciaDashboard() {
    registrarRota('dashboard');
    marcarMenuAtivo('gerenciaDashboard');
    const main = document.getElementById('main');
    const [dados, escalas, inferior] = await Promise.all([dadosDashboard(), renderizarEscalas(), renderizarResumoInferior()]);

    main.replaceChildren(
        headerInterno('Dashboard', 'Gerencie sua Igreja'),
        atualizarCards(dados),
        escalas,
        inferior
    );
}

//  Faixa inferior: participantes recentes, voluntários e atalhos de relatórios
async function renderizarResumoInferior() {
    const [participantes, voluntarios] = await Promise.all([
        temPermissao('participantes') ? buscarDados('participantes', {}) : {},
        temPermissao('voluntarios') ? buscarDados('voluntarios', {}) : {}
    ]);

    const section = document.createElement('section');
    section.className = 'bottom-grid';

    const linha = (nome, detalhe, extra = '') => `
        <div class="list-row">
            <div class="mini-avatar">${escapar(nome.charAt(0).toUpperCase())}</div>
            <div class="info"><strong>${escapar(nome)}</strong><small>${detalhe}</small></div>${extra}
        </div>`;

    if (temPermissao('participantes')) {
        const recentes = (participantes.participantes || []).filter(p => p.tipo !== 'conta').slice(0, 4);
        section.insertAdjacentHTML('beforeend', `
            <article class="panel">
                <div class="panel-header"><h2>Participantes</h2><button type="button" data-acao="novo-participante">+ Novo</button></div>
                ${recentes.map(p => linha(p.nome, p.tipo === 'visitante'
                    ? `Visitante • ${formatarDataSimples(p.data)}`
                    : `Membro desde ${String(p.data || '').slice(0, 4) || '—'}`)).join('') || '<p class="vazio">Nenhum participante.</p>'}
            </article>`);
    }

    if (temPermissao('voluntarios')) {
        const ativos = (voluntarios.voluntarios || []).filter(v => v.ativo).slice(0, 4);
        section.insertAdjacentHTML('beforeend', `
            <article class="panel">
                <div class="panel-header"><h2>Voluntários</h2><button type="button" data-acao="novo-voluntario">+ Novo</button></div>
                ${ativos.map(v => linha(v.nome, escapar(v.funcoes.map(f => f.nome).join(', ')), '<em class="status">Ativo</em>')).join('') || '<p class="vazio">Nenhum voluntário.</p>'}
            </article>`);
    }

    if (temPermissao('relatorios')) {
        section.insertAdjacentHTML('beforeend', `
            <article class="panel report-card">
                <div class="panel-header"><h2>Relatórios</h2></div>
                <a href="#" data-relatorio="participantes"><span class="material-icons">groups</span><span>Relatório de Participantes</span>›</a>
                <a href="#" data-relatorio="voluntarios"><span class="material-icons">volunteer_activism</span><span>Relatório de Voluntários</span>›</a>
                <a href="#" data-relatorio="escalas"><span class="material-icons">calendar_month</span><span>Relatório de Escalas</span>›</a>
                <a href="#" data-relatorio="presencas"><span class="material-icons">assignment_turned_in</span><span>Relatório de Presenças</span>›</a>
            </article>`);
    }

    section.addEventListener('click', event => {
        const relatorio = event.target.closest('[data-relatorio]');
        if (relatorio) {
            event.preventDefault();
            marcarMenuAtivo('gerenciaRelatorios');
            gerarRelatorio(relatorio.dataset.relatorio);
        }
        if (event.target.closest('[data-acao="novo-participante"]')) {
            marcarMenuAtivo('gerenciaParticipantes');
            novoParticipante();
        }
        if (event.target.closest('[data-acao="novo-voluntario"]')) {
            marcarMenuAtivo('gerenciaVoluntarios');
            novoVoluntario();
        }
    });

    return section;
}

async function gerenciaEvento() {
    registrarRota('eventos');
    marcarMenuAtivo('gerenciaEvento');
    const [dados, eventosDisponiveis, voluntarios] = await Promise.all([
        dadosFuncoes(),
        dadosTodosEventos(),
        dadosVolutanrios()
    ]);
    const header = headerInterno('Gerenciar Eventos', 'Crie e gerencie os eventos da igreja.');
    const main = document.getElementById('main');

    main.innerHTML = `
    <div class="eventos-abas">
        <div class="abas-menu" role="tablist" aria-label="Eventos">
            <button type="button" id="tab-criar" class="aba-botao ativa" role="tab"
                aria-selected="true" aria-controls="aba-criar" data-aba="aba-criar">
                Criar evento
            </button>
            <button type="button" id="tab-gerenciar" class="aba-botao" role="tab"
                aria-selected="false" aria-controls="aba-gerenciar" data-aba="aba-gerenciar" tabindex="-1">
                Próximos eventos
            </button>
            <button type="button" id="tab-realizados" class="aba-botao" role="tab"
                aria-selected="false" aria-controls="aba-realizados" data-aba="aba-realizados" tabindex="-1">
                Eventos realizados
            </button>
        </div>

        <div id="aba-criar" role="tabpanel" aria-labelledby="tab-criar">
            <section class="panel volunteer-form">
                <form id="formEscala">
                    <!-- =========================
                            DATA E HORÁRIO
                    ========================== -->
                    <div class="form-section">
                        <div class="section-title">
                            <span class="material-icons">event</span>
                            <div>
                                <h3>Dados do Evento</h3>
                                <p>Preencha os campos com os dados do evento</p>
                            </div>
                        </div>
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="nomeEvento">Nome do Evento</label>
                                <input type="text" id="nomeEvento" required>
                            </div>
                            <div class="form-group">
                                <label for="data">Data</label>
                                <input type="date" id="data" required>
                            </div>
                            <div class="form-group">
                                <label for="horarioInicio">Horário de início</label>
                                <input type="time" id="horarioInicio" required>
                            </div>
                            <div class="form-group">
                                <label for="horarioFim">Horário previsto para o término</label>
                                <input type="time" id="horarioFim" required>
                            </div>
                            <div class="form-group">
                                <label for="tipoEvento">Tipo de culto / evento</label>
                                <select id="tipoEvento" required>
                                    <option value="">Selecione</option>
                                    <option value="culto">Culto</option>
                                    <option value="culto-jovens">Culto de Jovens</option>
                                    <option value="culto-infantil">Culto Infantil</option>
                                    <option value="evento">Evento</option>
                                    <option value="reuniao">Reunião</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- =========================
                                FUNÇÃO
                    ========================== -->
                    <div class="form-section">
                        <div class="section-title">
                            <span class="material-icons">engineering</span>
                            <div>
                                <h3>Funções</h3>
                                <p>Defina as funções necessárias no evento.</p>
                            </div>
                        </div>
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="funcao">Função</label>
                                <select id="funcao" required></select>
                            </div>
                            <div class="form-group" id="qtd_voluntarios">
                                <label for="quantidade">Número de voluntários</label>
                                <input type="number" id="quantidade" min="1" max="50" value="1" required>
                            </div>
                            <div class="form-actions-left">
                                <button type="button" id="salvaFuncao" class="primary">
                                    <span class="material-icons">add</span>
                                    Adicionar função
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- =========================
                              VOLUNTÁRIOS
                    ========================== -->
                    <div class="form-section">
                        <div class="section-title">
                            <span class="material-icons">groups</span>
                            <div>
                                <h3>Voluntários</h3>
                                <p>Designe os voluntários que estão aptos a colaborar no evento.</p>
                            </div>
                        </div>
                        <div class="table-responsive">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Função</th>
                                        <th>Voluntários necessários</th>
                                        <th>Selecione os voluntários</th>
                                    </tr>
                                </thead>
                                <tbody id="lista-funcoes"></tbody>
                            </table>
                        </div>
                    </div>

                    <!-- =========================
                              OBSERVAÇÕES
                    ========================== -->
                    <div class="form-section">
                        <div class="section-title">
                            <span class="material-icons">notes</span>
                            <div>
                                <h3>Observações</h3>
                                <p>Adicione informações importantes.</p>
                            </div>
                        </div>
                        <div class="form-group">
                            <label for="observacoes">Observações</label>
                            <textarea id="observacoes" rows="5" placeholder="Digite observações sobre esta escala..."></textarea>
                        </div>
                    </div>

                    <!-- =========================
                                BOTÕES
                    ========================== -->
                    <div class="form-actions">
                        <a href="#" id="cancelarEvento" class="btn-cancel">Cancelar</a>
                        <button type="button" id="criarEvento" class="primary">
                            <span class="material-icons">save</span>
                            Criar Evento
                        </button>
                    </div>
                </form>
            </section>
        </div>

        <div id="aba-gerenciar" role="tabpanel" aria-labelledby="tab-gerenciar" hidden>
            <section class="panel">
                <div class="section-title">
                    <span class="material-icons">event_note</span>
                    <div>
                        <h3>Próximos eventos</h3>
                        <p>Eventos que ainda não terminaram (incluindo os que estão acontecendo agora), do mais próximo ao mais distante.</p>
                    </div>
                </div>

                <div class="toolbar">
                    <input class="search" id="busca-proximos" type="search" placeholder="Buscar evento..." aria-label="Buscar nos próximos eventos">
                </div>
                <p class="mensagem-lista" id="mensagem-eventos" role="status"></p>
                <!-- No celular a tabela vira cartões (classe tabela-cartoes) -->
                <div class="table-responsive">
                    <table class="tabela-cartoes">
                        <thead>
                            <tr>
                                <th>Evento</th>
                                <th>Data</th>
                                <th>Início</th>
                                <th>Término</th>
                                <th>Tipo</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody id="lista-eventos"></tbody>
                    </table>
                </div>
            </section>
        </div>

        <div id="aba-realizados" role="tabpanel" aria-labelledby="tab-realizados" hidden>
            <section class="panel">
                <div class="section-title">
                    <span class="material-icons">history</span>
                    <div>
                        <h3>Eventos realizados</h3>
                        <p>Histórico dos eventos que já terminaram, do mais recente para o mais antigo. Somente consulta.</p>
                    </div>
                </div>

                <div class="toolbar">
                    <input class="search" id="busca-realizados" type="search" placeholder="Buscar evento realizado..." aria-label="Buscar nos eventos realizados">
                </div>
                <div class="table-responsive">
                    <table class="tabela-cartoes">
                        <thead>
                            <tr>
                                <th>Evento</th>
                                <th>Data</th>
                                <th>Horário</th>
                                <th>Tipo</th>
                                <th>Voluntários</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody id="lista-realizados"></tbody>
                    </table>
                </div>
            </section>
        </div>
    </div>
    `;
    main.prepend(header);

    const listaFuncoes = document.getElementById('funcao');
    const listaEventos = document.getElementById('lista-eventos');

    listaFuncoes.add(new Option('Selecione uma função', ''));
    dados.forEach(item => {
        listaFuncoes.add(new Option(item.nome, item.nome));
    });

    // ---------- Próximos eventos (lista, edição e remoção) e Eventos realizados (só consulta).
    // A separação é automática: o backend diz se o evento já terminou (data + horário de término).
    let eventosCarregados = eventosDisponiveis;
    const nomeDoTipo = tipo => (typeof TIPOS_EVENTO !== 'undefined' && TIPOS_EVENTO[tipo]) || tipo || '—';
    const listaRealizados = document.getElementById('lista-realizados');
    const buscaProximos = document.getElementById('busca-proximos');
    const buscaRealizados = document.getElementById('busca-realizados');
    const chaveDoEvento = ev => `${String(ev.data_evento).slice(0, 10)} ${formatarHora(ev.hora_inicio) || '99:99'}`;
    const correspondeBusca = (ev, campo) => {
        const termo = normalizarTexto(campo.value);
        return !termo || normalizarTexto(`${ev.nome} ${nomeDoTipo(ev.tipo_evento)} ${formatarDataSimples(ev.data_evento)}`).includes(termo);
    };

    function desenharListaEventos() {
        desenharRealizados();
        const proximos = eventosCarregados
            .filter(ev => !ev.realizado)
            .sort((a, b) => chaveDoEvento(a).localeCompare(chaveDoEvento(b)) || a.id_evento - b.id_evento);
        const visiveis = proximos.filter(ev => correspondeBusca(ev, buscaProximos));
        listaEventos.innerHTML = visiveis.length
            ? visiveis.map(evento => `
                <tr>
                    <td data-label="Evento"><strong>${escapar(evento.nome)}</strong>${evento.em_andamento ? ' <span class="badge ok">Acontecendo agora</span>' : ''}</td>
                    <td data-label="Data">${formatarDataSimples(evento.data_evento)}</td>
                    <td data-label="Início">${formatarHora(evento.hora_inicio) || '—'}</td>
                    <td data-label="Término">${formatarHora(evento.hora_fim) || '—'}</td>
                    <td data-label="Tipo">${escapar(nomeDoTipo(evento.tipo_evento))}</td>
                    <td data-label="Ações">
                        <div class="acoes">
                            <button type="button" class="btn-editar" data-editar-evento="${evento.id_evento}" aria-label="Editar ${escapar(evento.nome)}">
                                <span class="material-icons">edit</span>Editar</button>
                            <button type="button" class="btn-remover" data-remover-evento="${evento.id_evento}" aria-label="Remover ${escapar(evento.nome)}">
                                <span class="material-icons">delete</span>Remover</button>
                        </div>
                    </td>
                </tr>
            `).join('')
            : `<tr><td colspan="6" class="vazio">${proximos.length ? 'Nenhum evento encontrado com essa pesquisa.' : 'Nenhum evento programado.'}</td></tr>`;
    }

    function desenharRealizados() {
        const realizados = eventosCarregados
            .filter(ev => ev.realizado)
            .sort((a, b) => chaveDoEvento(b).localeCompare(chaveDoEvento(a)) || b.id_evento - a.id_evento);
        const visiveis = realizados.filter(ev => correspondeBusca(ev, buscaRealizados));
        listaRealizados.innerHTML = visiveis.length
            ? visiveis.map(evento => `
                <tr>
                    <td data-label="Evento"><strong>${escapar(evento.nome)}</strong></td>
                    <td data-label="Data">${formatarDataSimples(evento.data_evento)}</td>
                    <td data-label="Horário">${formatarHora(evento.hora_inicio) || '—'}${evento.hora_fim ? ' às ' + formatarHora(evento.hora_fim) : ''}</td>
                    <td data-label="Tipo">${escapar(nomeDoTipo(evento.tipo_evento))}</td>
                    <td data-label="Voluntários">${evento.total_escalas
                        ? `${evento.total_escalas} função(ões) • ${evento.total_confirmados}/${evento.total_voluntarios} confirmado(s)`
                        : 'Sem escalas'}</td>
                    <td data-label="Ações">
                        <div class="acoes">
                            <button type="button" data-detalhes-evento="${evento.id_evento}" aria-label="Ver detalhes de ${escapar(evento.nome)}">
                                <span class="material-icons">visibility</span>Ver detalhes</button>
                        </div>
                    </td>
                </tr>
            `).join('')
            : `<tr><td colspan="6" class="vazio">${realizados.length ? 'Nenhum evento encontrado com essa pesquisa.' : 'Nenhum evento realizado ainda.'}</td></tr>`;
    }

    // Detalhes de um evento realizado: somente leitura (sem editar, remover ou trocar voluntários)
    async function verEventoRealizado(evento) {
        const { modal } = abrirModal(evento.nome, 'Evento realizado — somente consulta', '<p class="vazio">Carregando...</p>');
        modal.classList.add('modal-largo');
        try {
            const detalhes = await enviarDados(`eventos/${evento.id_evento}`, 'GET');
            modal.querySelector('.modal-corpo').innerHTML = htmlDetalhesEvento(detalhes)
                + (temPermissao('relatorios')
                    ? `<div class="form-actions"><button type="button" class="primary" data-relatorio-evento>
                           <span class="material-icons">picture_as_pdf</span>Gerar relatório do evento</button></div>`
                    : '');
            modal.querySelector('[data-relatorio-evento]')?.addEventListener('click', () => {
                document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
                gerarRelatorioEvento(evento.id_evento);
            });
        } catch (erro) {
            modal.querySelector('.modal-corpo').innerHTML = `<p class="vazio">${escapar(erro.message)}</p>`;
        }
    }

    listaRealizados.addEventListener('click', event => {
        const botao = event.target.closest('[data-detalhes-evento]');
        const evento = botao && eventosCarregados.find(ev => ev.id_evento === Number(botao.dataset.detalhesEvento));
        if (evento) verEventoRealizado(evento);
    });
    buscaProximos.addEventListener('input', desenharListaEventos);
    buscaRealizados.addEventListener('input', desenharRealizados);

    async function recarregarEventos(mensagem) {
        eventosCarregados = await dadosTodosEventos();
        desenharListaEventos();
        const aviso = document.getElementById('mensagem-eventos');
        aviso.textContent = mensagem || '';
        aviso.classList.remove('erro');
    }

    function editarEvento(evento) {
        const { modal, fechar } = abrirModal('Editar evento', evento.nome, `
            <form novalidate>
                <div class="form-grid">
                    <div class="form-group full"><label for="edNome">Nome do evento</label><input type="text" id="edNome" maxlength="150" required></div>
                    <div class="form-group"><label for="edData">Data</label><input type="date" id="edData" required></div>
                    <div class="form-group">
                        <label for="edTipo">Tipo de culto / evento</label>
                        <select id="edTipo" required>
                            ${Object.entries(TIPOS_EVENTO).map(([valor, nome]) => `<option value="${valor}">${nome}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group"><label for="edInicio">Horário de início</label><input type="time" id="edInicio"></div>
                    <div class="form-group"><label for="edFim">Horário de término</label><input type="time" id="edFim"></div>
                </div>
                ${evento.total_escalas ? `<p class="subtitulo">As ${evento.total_escalas} escala(s) deste evento acompanham a nova data.</p>` : ''}
                <div class="form-actions">
                    <button type="button" class="btn-cancel" data-cancelar>Cancelar</button>
                    <button type="submit" class="primary"><span class="material-icons">save</span>Salvar</button>
                </div>
            </form>`);
        const form = modal.querySelector('form');
        const campo = id => modal.querySelector('#' + id);
        campo('edNome').value = evento.nome;
        campo('edData').value = String(evento.data_evento).slice(0, 10);
        campo('edTipo').value = TIPOS_EVENTO[evento.tipo_evento] ? evento.tipo_evento : 'evento';
        campo('edInicio').value = formatarHora(evento.hora_inicio);
        campo('edFim').value = formatarHora(evento.hora_fim);
        modal.querySelector('[data-cancelar]').addEventListener('click', fechar);

        form.addEventListener('submit', async e => {
            e.preventDefault();
            if (campo('edInicio').value && campo('edFim').value && campo('edFim').value <= campo('edInicio').value) {
                return mensagemFormulario(form, 'O horário de término deve ser depois do início.');
            }
            try {
                await enviarDados(`eventos/${evento.id_evento}`, 'PUT', {
                    nome: campo('edNome').value,
                    data_evento: campo('edData').value,
                    tipo_evento: campo('edTipo').value,
                    hora_inicio: campo('edInicio').value,
                    hora_fim: campo('edFim').value
                });
                fechar();
                await recarregarEventos('Evento atualizado.');
            } catch (erro) {
                mensagemFormulario(form, erro.message);
            }
        });
    }

    async function removerEvento(evento) {
        const aviso = evento.total_escalas
            ? `\n\nAtenção: ${evento.total_escalas} escala(s) deste evento e os voluntários escalados nelas também serão removidos.`
            : '';
        if (!confirm(`Remover o evento "${evento.nome}" de ${formatarDataSimples(evento.data_evento)}?${aviso}\n\nEsta ação não pode ser desfeita.`)) return;
        try {
            await enviarDados(`eventos/${evento.id_evento}`, 'DELETE');
            await recarregarEventos(`Evento "${evento.nome}" removido.`);
        } catch (erro) {
            const campo = document.getElementById('mensagem-eventos');
            campo.textContent = erro.message;
            campo.classList.add('erro');
        }
    }

    listaEventos.addEventListener('click', event => {
        const editar = event.target.closest('[data-editar-evento]');
        const remover = event.target.closest('[data-remover-evento]');
        const id = Number((editar || remover)?.dataset.editarEvento || (editar || remover)?.dataset.removerEvento);
        const evento = eventosCarregados.find(ev => ev.id_evento === id);
        if (!evento) return;
        if (editar) editarEvento(evento);
        if (remover) removerEvento(evento);
    });

    desenharListaEventos();

    const funcoes = [];

    function capturaFuncao() {
        const campoFuncao = document.getElementById('funcao');
        const campoQuantidade = document.getElementById('quantidade');
        const lista = document.getElementById('lista-funcoes');

        const nomeFuncao = campoFuncao.value;
        const quantidade = Number(campoQuantidade.value);
        const minimo = Number(campoQuantidade.min);
        const maximo = Number(campoQuantidade.max);

        // 1. Valida a função e a quantidade informadas.
        if (nomeFuncao === '') {
            alert('Por favor, selecione uma função primeiro');
            return;
        }

        if (
            campoQuantidade.value === '' ||
            !Number.isInteger(quantidade) ||
            quantidade < minimo ||
            quantidade > maximo
        ) {
            alert(
                `Quantidade de voluntários não permitida\n` +
                `Mínimo: ${minimo} e Máximo: ${maximo}`
            );
            return;
        }

        const existente = funcoes.find(item => item.nome === nomeFuncao);

        if (existente && Number(existente.numero_voluntarios) === quantidade) {
            alert('Função já cadastrada com essa quantidade');
            return;
        }

        // 2. Guarda as escolhas atuais antes de recriar a tabela.
        // Cada função guarda seus voluntários na ordem dos selects.
        const escolhasAnteriores = new Map();

        lista.querySelectorAll('tr').forEach(linha => {
            const selects = linha.querySelectorAll('.voluntario');

            if (selects.length === 0) return;

            escolhasAnteriores.set(
                linha.dataset.funcao,
                Array.from(selects, select => select.value)
            );
        });

        // 3. Atualiza a função existente ou adiciona uma nova.
        if (existente) {
            existente.numero_voluntarios = quantidade;
        } else {
            funcoes.push({
                nome: nomeFuncao,
                numero_voluntarios: quantidade
            });
        }

        // 4. Recria as linhas e os campos de seleção.
        lista.innerHTML = '';

        funcoes.forEach(item => {
            const linha = document.createElement('tr');
            linha.dataset.funcao = item.nome;

            const colunaNome = document.createElement('td');
            colunaNome.textContent = item.nome;

            const colunaQuantidade = document.createElement('td');
            colunaQuantidade.textContent = item.numero_voluntarios;

            const colunaVoluntarios = document.createElement('td');
            const escolhas = escolhasAnteriores.get(item.nome) || [];

            for (let i = 0; i < Number(item.numero_voluntarios); i++) {
                const select = document.createElement('select');

                select.className = 'voluntario';
                select.required = true;
                select.setAttribute('aria-label', `Voluntário ${i + 1} para ${item.nome}`);

                // A opção vazia permite desmarcar o voluntário.
                select.add(new Option('Selecione um voluntário', ''));

                voluntarios.forEach(voluntario => {
                    // Usa o ID para diferenciar pessoas com o mesmo nome.
                    select.add(new Option(voluntario.nome_completo, String(voluntario.id_membro)));
                });

                // Recupera a escolha anterior, se ainda existir.
                select.value = escolhas[i] || '';

                colunaVoluntarios.appendChild(select);
            }

            linha.append(colunaNome, colunaQuantidade, colunaVoluntarios);
            lista.appendChild(linha);
        });

        // 5. Oculta e bloqueia quem já foi escolhido em outro select.
        const selectsVoluntarios = lista.querySelectorAll('.voluntario');

        function atualizarOpcoes() {
            const selecionados = new Set(
                Array.from(selectsVoluntarios, select => select.value)
                    .filter(valor => valor !== '')
            );

            selectsVoluntarios.forEach(select => {
                Array.from(select.options).forEach(option => {
                    const escolhidoEmOutro =
                        option.value !== '' &&
                        selecionados.has(option.value) &&
                        option.value !== select.value;

                    option.hidden = escolhidoEmOutro;
                    option.disabled = escolhidoEmOutro;
                });
            });
        }

        // Ao trocar ou desmarcar alguém, atualiza todos os selects.
        selectsVoluntarios.forEach(select => {
            select.addEventListener('change', atualizarOpcoes);
        });

        atualizarOpcoes();
    }

    function capturarFuncoesEVoluntarios() {
        const linhas = document.querySelectorAll('#lista-funcoes tr');

        return Array.from(linhas)
            .filter(linha => linha.dataset.funcao)
            .map(linha => {
                const selecionados = Array.from(linha.querySelectorAll('.voluntario'))
                    .filter(select => select.value !== '')
                    .map(select => ({
                        id_membro: Number(select.value),
                        nome: select.selectedOptions[0].textContent
                    }));

                return {
                    nome_funcao: linha.dataset.funcao,
                    voluntarios: selecionados
                };
            });
    }

    async function criarEvento() {
        const funcoesSelecionadas = capturarFuncoesEVoluntarios();
        const nomeEvento = document.getElementById('nomeEvento');
        const dataEvento = document.getElementById('data');
        const horaInicio = document.getElementById('horarioInicio');
        const horaFim = document.getElementById('horarioFim');
        const tipoEvento = document.getElementById('tipoEvento');

        if (nomeEvento.value.trim() === '') {
            alert('Por favor dê um nome para o seu evento');
            nomeEvento.focus();
            return;
        } else if (dataEvento.value === '') {
            alert('Por favor defina a data do evento.');
            dataEvento.focus();
            return;
        } else if (horaInicio.value === '' || horaFim.value === '' || horaFim.value <= horaInicio.value) {
            alert('Verifique o horário do evento, algo está incorreto!');
            horaInicio.focus();
            return;
        } else if (tipoEvento.value === '') {
            alert('Por favor selecione o tipo de evento!');
            tipoEvento.focus();
            return;
        } else if (
            funcoesSelecionadas.length === 0 ||
            funcoesSelecionadas.some(funcao => funcao.voluntarios.length === 0)
        ) {
            alert('Defina as funções e voluntários do evento!');
            return;
        }

        try {
            // Com o token do login (a rota exige a permissão "escalas")
            await enviarDados('novoEvento', 'POST', {
                nome: nomeEvento.value.trim(),
                data_evento: dataEvento.value,
                criado_em: new Date().toISOString(),
                hora_inicio: horaInicio.value,
                hora_fim: horaFim.value,
                tipo_evento: tipoEvento.value
            });

            alert('Evento criado com sucesso!');
            gerenciaEvento();
        } catch (erro) {
            console.error(erro);
            alert(erro.message);
        }
    }

    document.getElementById('salvaFuncao').addEventListener('click', capturaFuncao);
    document.getElementById('criarEvento').addEventListener('click', criarEvento);
    document.getElementById('cancelarEvento').addEventListener('click', event => {
        event.preventDefault();
        gerenciaDashboard();
    });
    iniciarAbasEventos();
}

// A turma NEXT fica sempre por último; as demais mantêm a ordem recebida.
// A regra usa o nome da turma (não a posição em que o banco devolveu).
function turmaNextPorUltimo(lista) {
    const ehNext = turma => /^next\b/.test(normalizarTexto(turma.nome));
    return [...lista.filter(t => !ehNext(t)), ...lista.filter(ehNext)];
}

async function gerenciaPresenca() {
    registrarRota('presenca');
    marcarMenuAtivo('gerenciaPresenca');
    const [membros, turmasIniciais] = await Promise.all([
        buscarDados('presenca/membros', []),
        buscarDados('presenca/turmas', [])
    ]);
    const header = headerInterno('Lista de presença', 'Organize a entrada e a saída de cada turma.');
    const main = document.getElementById('main');

    // Data de hoje no fuso local (AAAA-MM-DD)
    const hoje = new Date();
    hoje.setMinutes(hoje.getMinutes() - hoje.getTimezoneOffset());
    const dataHoje = hoje.toISOString().slice(0, 10);

    let turmas = turmaNextPorUltimo(turmasIniciais);
    let registros = [];
    let saidaPendente = null;

    main.innerHTML = `
        <div class="toolbar">
            <label for="data-presenca">Data da presença</label>
            <input class="seletor" id="data-presenca" type="date" value="${dataHoje}" required>
        </div>

        <div class="resumo" id="resumo"></div>

        <section class="panel busca-panel">
            <h2>Adicionar membro à turma</h2>
            <p class="subtitulo">Pesquise o nome, escolha a turma e registre a presença.</p>
            <label for="busca">Nome do membro</label>
            <input class="search" id="busca" type="search" placeholder="Digite um nome para pesquisar…" autocomplete="off">
            <div id="resultados"></div>

            <form class="nova-turma" id="form-turma">
                <input class="seletor" id="nome-turma" type="text" placeholder="Nome da nova turma" aria-label="Nome da nova turma" maxlength="100">
                <button type="submit">Cadastrar turma</button>
            </form>

            <p id="mensagem" role="status" aria-live="polite"></p>
        </section>

        <section class="presenca-grid" id="turmas" aria-label="Turmas"></section>

        <dialog id="modal-saida">
            <h2>Confirmar saída</h2>
            <p id="modal-conteudo"></p>
            <button type="button" id="cancelar-modal">Cancelar</button>
            <button type="button" class="primary" id="confirmar-modal">Confirmar saída</button>
        </dialog>
    `;
    main.prepend(header);

    const campoData = document.getElementById('data-presenca');
    const campoBusca = document.getElementById('busca');
    const modal = document.getElementById('modal-saida');

    const normalizar = texto => String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

    function idade(dataNascimento) {
        if (!dataNascimento) return null;
        const nascimento = new Date(dataNascimento);
        const anos = hoje.getFullYear() - nascimento.getFullYear();
        const fezAniversario = hoje >= new Date(hoje.getFullYear(), nascimento.getMonth(), nascimento.getDate());
        return fezAniversario ? anos : anos - 1;
    }

    function mensagem(texto, erro = false) {
        const campo = document.getElementById('mensagem');
        campo.textContent = texto;
        campo.classList.toggle('erro', erro);
    }

    function presente(idMembro) {
        return registros.find(r => r.id_membro === idMembro && !r.hora_saida);
    }

    function pesquisar() {
        const termo = normalizar(campoBusca.value);
        const resultados = document.getElementById('resultados');

        if (!termo) {
            resultados.innerHTML = '';
            return;
        }

        const encontrados = membros.filter(m => normalizar(m.nome_completo).includes(termo)).slice(0, 20);

        resultados.innerHTML = encontrados.length
            ? encontrados.map(m => {
                const ativo = presente(m.id_membro);
                const anos = idade(m.data_nascimento);
                const detalhe = ativo
                    ? 'Presente em ' + escapar(ativo.nome_turma)
                    : (anos !== null ? `${anos} anos` : 'Disponível para adicionar');

                return `
                    <div class="resultado">
                        <div>
                            <strong>${escapar(m.nome_completo)}</strong>
                            <small>${detalhe}</small>
                        </div>
                        <div class="acoes">
                            <select class="seletor" aria-label="Turma para ${escapar(m.nome_completo)}" data-turma-membro="${m.id_membro}" ${ativo ? 'disabled' : ''}>
                                ${turmas.map(t => `<option value="${t.id_turma}">${escapar(t.nome)}</option>`).join('')}
                            </select>
                            <button type="button" class="primary" data-acao="adicionar" data-membro="${m.id_membro}" ${ativo || !turmas.length ? 'disabled' : ''}>Adicionar</button>
                        </div>
                    </div>
                `;
            }).join('')
            : '<p class="vazio">Nenhum membro encontrado.</p>';
    }

    function renderizar() {
        const ativos = registros.filter(r => !r.hora_saida).length;

        document.getElementById('resumo').innerHTML = `
            <span><strong>${ativos}</strong> presentes agora</span>
            <span><strong>${registros.length - ativos}</strong> saídas registradas</span>
            <span><strong>${registros.length}</strong> registros no dia</span>
        `;

        document.getElementById('turmas').innerHTML = turmas.length
            ? turmas.map(t => {
                const lista = registros.filter(r => r.id_turma === t.id_turma);
                return `
                    <div class="panel turma">
                        <div class="panel-header">
                            <h2>${escapar(t.nome)}</h2>
                            <span class="badge ok">${lista.filter(r => !r.hora_saida).length} presentes</span>
                        </div>
                        <p class="subtitulo">${lista.length} registros nesta data</p>
                        ${lista.length
                            ? lista.map(r => `
                                <div class="registro ${r.hora_saida ? 'saiu' : ''}">
                                    <strong>${escapar(r.nome_membro)}</strong>
                                    <small>Entrada às ${formatarHora(r.hora_entrada)}${r.hora_saida ? ' · Saída às ' + formatarHora(r.hora_saida) : ''}</small>
                                    <div class="acoes">
                                        <span class="badge ${r.hora_saida ? 'inactive' : 'ok'}">${r.hora_saida ? 'Saiu' : 'Presente'}</span>
                                        ${!r.hora_saida ? `<button type="button" class="saida" data-acao="sair" data-registro="${r.id_registro}">Confirmar saída</button>` : ''}
                                    </div>
                                </div>
                            `).join('')
                            : '<p class="vazio">Nenhuma presença registrada.<br>Pesquise um membro para começar.</p>'}
                    </div>
                `;
            }).join('')
            : '<p class="vazio">Nenhuma turma cadastrada. Cadastre uma turma acima.</p>';

        pesquisar();
    }

    async function atualizarTela() {
        try {
            registros = await enviarDados(`presenca?data=${campoData.value}`, 'GET');
        } catch (erro) {
            registros = [];
            mensagem(erro.message, true);
        }
        renderizar();
    }

    async function adicionar(idMembro) {
        const membro = membros.find(m => m.id_membro === idMembro);
        const select = main.querySelector(`[data-turma-membro="${idMembro}"]`);
        if (!membro || !select) return;

        if (presente(idMembro)) {
            mensagem('Este membro já está presente em uma turma.', true);
            return;
        }

        try {
            await enviarDados('presenca', 'POST', {
                id_turma: Number(select.value),
                id_membro: idMembro,
                data: campoData.value
            });
            mensagem(`${membro.nome_completo} adicionado(a) à turma.`);
        } catch (erro) {
            mensagem(erro.message, true);
        }
        await atualizarTela();
    }

    function pedirSaida(idRegistro) {
        const registro = registros.find(r => r.id_registro === idRegistro && !r.hora_saida);
        if (!registro) return;

        saidaPendente = registro.id_registro;
        document.getElementById('modal-conteudo').textContent =
            `Confirma que ${registro.nome_membro} saiu da turma? O horário de saída será registrado.`;
        modal.showModal();
    }

    async function confirmarSaida() {
        const id = saidaPendente;
        modal.close();
        if (!id) return;

        try {
            await enviarDados(`presenca/${id}/saida`, 'PATCH');
            mensagem('Saída confirmada.');
        } catch (erro) {
            mensagem(erro.message, true);
        }
        await atualizarTela();
    }

    async function cadastrarTurma(event) {
        event.preventDefault();
        const campoNome = document.getElementById('nome-turma');
        const nome = campoNome.value.trim();

        if (!nome) {
            mensagem('Informe o nome da turma.', true);
            return;
        }

        try {
            await enviarDados('presenca/turmas', 'POST', { nome });
            turmas = turmaNextPorUltimo(await buscarDados('presenca/turmas', turmas));
            campoNome.value = '';
            mensagem(`Turma "${nome}" cadastrada.`);
            renderizar();
        } catch (erro) {
            mensagem(erro.message, true);
        }
    }

    // Os botões são recriados a cada renderização, então o clique é tratado no container
    main.querySelector('.busca-panel').addEventListener('click', event => {
        const botao = event.target.closest('button[data-acao="adicionar"]');
        if (botao) adicionar(Number(botao.dataset.membro));
    });
    document.getElementById('turmas').addEventListener('click', event => {
        const botao = event.target.closest('button[data-acao="sair"]');
        if (botao) pedirSaida(Number(botao.dataset.registro));
    });

    document.getElementById('confirmar-modal').addEventListener('click', confirmarSaida);
    document.getElementById('cancelar-modal').addEventListener('click', () => modal.close());
    modal.addEventListener('close', () => { saidaPendente = null; });
    campoBusca.addEventListener('input', pesquisar);
    document.getElementById('form-turma').addEventListener('submit', cadastrarTurma);
    campoData.addEventListener('change', () => {
        if (!campoData.value) campoData.value = dataHoje;
        mensagem('');
        atualizarTela();
    });

    if (!membros.length) mensagem('Nenhum membro ativo cadastrado.', true);
    await atualizarTela();
}

function iniciarAbasEventos() {
    const container = document.querySelector('.eventos-abas');
    if (!container) return;

    const botoes = Array.from(container.querySelectorAll('.aba-botao'));

    function ativarAba(botaoAtivo) {
        botoes.forEach(botao => {
            const ativa = botao === botaoAtivo;
            const painel = document.getElementById(botao.dataset.aba);

            botao.classList.toggle('ativa', ativa);
            botao.setAttribute('aria-selected', String(ativa));
            botao.tabIndex = ativa ? 0 : -1;
            painel.hidden = !ativa;
        });
    }

    botoes.forEach((botao, indice) => {
        botao.addEventListener('click', () => ativarAba(botao));

        botao.addEventListener('keydown', event => {
            let proximo;

            if (event.key === 'ArrowRight') {
                proximo = (indice + 1) % botoes.length;
            } else if (event.key === 'ArrowLeft') {
                proximo = (indice - 1 + botoes.length) % botoes.length;
            } else if (event.key === 'Home') {
                proximo = 0;
            } else if (event.key === 'End') {
                proximo = botoes.length - 1;
            } else {
                return;
            }

            event.preventDefault();
            ativarAba(botoes[proximo]);
            botoes[proximo].focus();
        });
    });
}

carregarDashboard();
