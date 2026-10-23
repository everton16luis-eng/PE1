// =========================================================
// Service Worker: recebe as notificações (Web Push) mesmo com
// o sistema fechado e abre a tela certa ao tocar no aviso.
// Não guarda páginas em cache (o sistema sempre carrega a
// versão mais nova do servidor).
// =========================================================

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
            icon: '/img/icone-192.png',
            badge: '/img/icone-badge.png',
            tag: dados.tag || undefined,
            renotify: Boolean(dados.tag),
            data: { url: dados.url || '/' },
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
    const destino = new URL(evento.notification.data?.url || '/', self.location.origin).href;
    evento.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(janelas => {
            const aberta = janelas.find(j => new URL(j.url).origin === self.location.origin);
            if (aberta) {
                return aberta.focus().then(j => (j && 'navigate' in j ? j.navigate(destino) : null));
            }
            return self.clients.openWindow(destino);
        })
    );
});
