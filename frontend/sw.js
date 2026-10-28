// =========================================================
// Service Worker: recebe as notificações (Web Push) mesmo com
// o sistema fechado e abre a tela certa ao tocar no aviso.
// Não guarda páginas em cache (o sistema sempre carrega a
// versão mais nova do servidor).
// =========================================================

// Endereços relativos à pasta do sistema (raiz ou, por exemplo, /sistema/)
const doSistema = caminho => new URL(caminho, self.registration.scope).href;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', evento => evento.waitUntil(self.clients.claim()));

self.addEventListener('push', evento => {
    let dados = {};
    try {
        dados = evento.data ? evento.data.json() : {};
    } catch {
        dados = { mensagem: evento.data ? evento.data.text() : '' };
    }
    const titulo = dados.titulo || 'Igreja Novo Caminho';
    evento.waitUntil(Promise.all([
        self.registration.showNotification(titulo, {
            body: dados.mensagem || '',
            icon: doSistema('img/icone-192.png'),
            badge: doSistema('img/icone-badge.png'),
            tag: dados.tag || undefined,
            renotify: Boolean(dados.tag),
            data: { url: dados.url || '' },
            lang: 'pt-BR'
        }),
        // Se o sistema estiver aberto, atualiza o contador do sininho
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(janelas => janelas.forEach(j => j.postMessage({ tipo: 'notificacao' })))
    ]));
});

// Tocar no aviso: usa uma janela já aberta do sistema ou abre uma nova
self.addEventListener('notificationclick', evento => {
    evento.notification.close();
    // O aviso traz "#/rota" (ou um endereço antigo "/#/rota"): sempre abre dentro da pasta do sistema
    const rota = String(evento.notification.data?.url || '').replace(/^\/(?=#)/, '');
    const destino = doSistema(rota);
    evento.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(janelas => {
            const aberta = janelas.find(j => j.url.startsWith(self.registration.scope));
            if (aberta) {
                return aberta.focus().then(j => (j && 'navigate' in j ? j.navigate(destino) : null));
            }
            return self.clients.openWindow(destino);
        })
    );
});
