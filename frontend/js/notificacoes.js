// =========================================
// NOTIFICAÇÕES
// Sininho com contador, central de avisos e as notificações no
// aparelho (Web Push: celular ou computador, sem aplicativo).
// =========================================

let registroServiceWorker = null;
let intervaloSino = null;

// Web Push precisa de: navegador com suporte e endereço seguro (https ou localhost)
const pushSuportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const contextoSeguro = () => window.isSecureContext;
const ehIphone = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);
const instaladoNaTela = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

async function registrarServiceWorker() {
    if (!('serviceWorker' in navigator) || !contextoSeguro()) return null;
    try {
        registroServiceWorker = await navigator.serviceWorker.register('/sw.js');
        // Aviso chegou com o sistema aberto: atualiza o contador
        navigator.serviceWorker.addEventListener('message', evento => {
            if (evento.data?.tipo === 'notificacao') atualizarSino();
        });
    } catch (erro) {
        console.error('Service worker não registrado:', erro.message);
    }
    return registroServiceWorker;
}

// Atualiza o número no sininho (e começa a conferir a cada minuto)
async function atualizarSino() {
    if (!usuarioAtual) return;
    const dados = await buscarDados('notificacoes', null);
    if (!dados) return;
    document.querySelectorAll('.sino-contador').forEach(contador => {
        contador.textContent = dados.nao_lidas > 9 ? '9+' : String(dados.nao_lidas);
        contador.hidden = !dados.nao_lidas;
    });
    document.querySelectorAll('.sino').forEach(sino => {
        sino.setAttribute('aria-label', dados.nao_lidas ? `Avisos: ${dados.nao_lidas} não lido(s)` : 'Avisos');
    });
    if (!intervaloSino) intervaloSino = setInterval(() => { if (usuarioAtual) atualizarSino(); }, 60 * 1000);
}

// Chave pública (base64url) → formato que o navegador pede
function chaveParaBytes(base64) {
    const preenchida = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(preenchida), c => c.charCodeAt(0));
}

async function inscricaoAtual() {
    if (!pushSuportado() || !contextoSeguro()) return null;
    const registro = registroServiceWorker || await navigator.serviceWorker.getRegistration('/');
    return registro ? registro.pushManager.getSubscription() : null;
}

// Situação das notificações NESTE aparelho, com a orientação certa para cada caso
async function situacaoDoAparelho() {
    if (!contextoSeguro()) return { estado: 'inseguro', texto: 'As notificações no aparelho só funcionam com o endereço seguro (https). Os avisos continuam aparecendo aqui, no sininho.' };
    if (ehIphone() && !instaladoNaTela()) return { estado: 'iphone', texto: 'No iPhone, primeiro adicione o sistema à Tela de Início (botão Compartilhar → "Adicionar à Tela de Início") e abra por lá.' };
    if (!pushSuportado()) return { estado: 'sem-suporte', texto: 'Este navegador não recebe notificações. No Android, use o Chrome.' };
    if (Notification.permission === 'denied') return { estado: 'bloqueado', texto: 'As notificações foram bloqueadas neste navegador. Libere em: cadeado ao lado do endereço → Permissões → Notificações.' };
    const chave = await buscarDados('notificacoes/push/chave', {});
    if (!chave.disponivel) return { estado: 'servidor', texto: 'As notificações no aparelho ainda não foram configuradas no servidor.' };
    return (await inscricaoAtual())
        ? { estado: 'ativo', texto: 'Este aparelho recebe os avisos, mesmo com o sistema fechado.' }
        : { estado: 'inativo', texto: 'Ative para receber os avisos no celular ou no computador, mesmo com o sistema fechado.', chave: chave.chave };
}

async function ativarNotificacoes(chave) {
    const permissao = await Notification.requestPermission();
    if (permissao !== 'granted') throw new Error('Sem a sua permissão o navegador não mostra os avisos.');
    const registro = registroServiceWorker || await registrarServiceWorker() || await navigator.serviceWorker.ready;
    const inscricao = await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(chave) });
    await enviarDados('notificacoes/push', 'POST', { inscricao: inscricao.toJSON(), aparelho: navigator.userAgent.slice(0, 200) });
}

async function desativarNotificacoes() {
    const inscricao = await inscricaoAtual();
    if (!inscricao) return;
    await enviarDados('notificacoes/push', 'DELETE', { endpoint: inscricao.endpoint });
    await inscricao.unsubscribe();
}

// Ao sair do sistema, este aparelho deixa de receber os avisos desse login
// (num celular emprestado, os avisos não continuam chegando para outra pessoa).
// Usa fetch direto: se a sessão já expirou, não pode cair de novo em "sair".
function esquecerAparelhoAoSair() {
    if (!pushSuportado() || !contextoSeguro()) return;
    const cabecalho = cabecalhos();
    inscricaoAtual().then(inscricao => {
        if (!inscricao) return;
        fetch(`${API_URL}/notificacoes/push`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', ...cabecalho },
            body: JSON.stringify({ endpoint: inscricao.endpoint })
        }).catch(() => {});
        inscricao.unsubscribe().catch(() => {});
    }).catch(() => {});
}

const ICONES_AVISO = {
    escala_nova: 'event_available', escala_retirada: 'event_busy', escala_alterada: 'edit_calendar',
    escala_removida: 'event_busy', vaga_recebida: 'swap_horiz', troca_voluntarios: 'swap_horiz',
    recusa: 'person_off', lembrete: 'alarm', pendencias: 'pending_actions', teste: 'notifications_active'
};

function quandoFoi(valor) {
    const data = new Date(valor);
    const minutos = Math.round((Date.now() - data) / 60000);
    if (minutos < 1) return 'agora';
    if (minutos < 60) return `há ${minutos} min`;
    if (minutos < 24 * 60) return `há ${Math.round(minutos / 60)} h`;
    return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Central de avisos (abre pelo sininho)
async function abrirAvisos() {
    const { modal, fechar } = abrirModal('Avisos', 'Seus avisos mais recentes', '<p class="vazio">Carregando...</p>');
    modal.classList.add('modal-avisos');
    const corpo = modal.querySelector('.modal-corpo');

    async function desenhar() {
        const [dados, aparelho] = await Promise.all([
            buscarDados('notificacoes', { nao_lidas: 0, notificacoes: [] }),
            situacaoDoAparelho()
        ]);
        corpo.innerHTML = `
            <section class="aparelho-avisos estado-${aparelho.estado}">
                <span class="material-icons" aria-hidden="true">${aparelho.estado === 'ativo' ? 'notifications_active' : 'phone_android'}</span>
                <div>
                    <strong>${aparelho.estado === 'ativo' ? 'Notificações ativas neste aparelho' : 'Notificações no celular'}</strong>
                    <p>${escapar(aparelho.texto)}</p>
                    <div class="aparelho-acoes">
                        ${aparelho.estado === 'inativo' ? '<button type="button" class="primary" data-ativar><span class="material-icons">notifications_active</span>Ativar neste aparelho</button>' : ''}
                        ${aparelho.estado === 'ativo' ? '<button type="button" class="secondary" data-testar>Enviar um teste</button><button type="button" class="secondary" data-desativar>Desativar</button>' : ''}
                    </div>
                    <p class="mensagem-aparelho" role="status"></p>
                </div>
            </section>
            <div class="avisos-topo">
                <strong>${dados.nao_lidas ? `${dados.nao_lidas} não lido(s)` : 'Tudo lido'}</strong>
                ${dados.nao_lidas ? '<button type="button" class="link-botao" data-todas>Marcar todos como lidos</button>' : ''}
            </div>
            <ul class="lista-avisos">
                ${dados.notificacoes.map(n => `
                    <li class="aviso ${n.lida ? '' : 'nao-lido'}">
                        <button type="button" data-aviso="${n.id_notificacao}" data-rota="${escapar(n.rota || '')}">
                            <span class="material-icons aviso-icone" aria-hidden="true">${ICONES_AVISO[n.tipo] || 'notifications'}</span>
                            <span class="aviso-texto">
                                <strong>${escapar(n.titulo)}</strong>
                                <span>${escapar(n.mensagem)}</span>
                                <small>${quandoFoi(n.criado_em)}</small>
                            </span>
                        </button>
                    </li>`).join('') || '<li class="vazio">Nenhum aviso por enquanto.</li>'}
            </ul>`;
        atualizarSino();
        return aparelho;
    }

    let aparelho = await desenhar();
    const avisarAparelho = (texto, erro = false) => {
        const campo = corpo.querySelector('.mensagem-aparelho');
        campo.textContent = texto;
        campo.classList.toggle('erro', erro);
    };

    corpo.addEventListener('click', async event => {
        const botao = event.target.closest('button');
        if (!botao) return;
        try {
            if (botao.matches('[data-ativar]')) {
                botao.disabled = true;
                await ativarNotificacoes(aparelho.chave);
                aparelho = await desenhar();
                avisarAparelho('Pronto! Toque em "Enviar um teste" para conferir.');
            } else if (botao.matches('[data-desativar]')) {
                await desativarNotificacoes();
                aparelho = await desenhar();
            } else if (botao.matches('[data-testar]')) {
                await enviarDados('notificacoes/push/teste', 'POST', {});
                avisarAparelho('Teste enviado: o aviso deve aparecer em alguns segundos.');
                setTimeout(desenhar, 1500);
            } else if (botao.matches('[data-todas]')) {
                await enviarDados('notificacoes/lidas', 'POST', {});
                aparelho = await desenhar();
            } else if (botao.matches('[data-aviso]')) {
                await enviarDados(`notificacoes/${botao.dataset.aviso}/lida`, 'POST', {});
                fechar();
                atualizarSino();
                // Abre a tela do aviso pelo endereço: o roteador confere a permissão
                // (sem acesso, cai na tela inicial do login) e o Voltar continua funcionando
                if (botao.dataset.rota) location.hash = `#/${botao.dataset.rota}`;
            }
        } catch (erro) {
            botao.disabled = false;
            avisarAparelho(erro.message, true);
        }
    });
}
