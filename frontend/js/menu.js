// =========================================
// Menu lateral responsivo (compartilhado entre as páginas)
// Abre/fecha a sidebar no celular e tablet.
// =========================================

function abrirMenu(abrir) {
    document.body.classList.toggle('menu-aberto', abrir);

    document.querySelectorAll('.menu-toggle').forEach(botao => {
        botao.setAttribute('aria-expanded', String(abrir));
    });
}

document.addEventListener('click', event => {
    if (event.target.closest('.menu-toggle')) {
        abrirMenu(!document.body.classList.contains('menu-aberto'));
        return;
    }

    // Fecha ao clicar fora do menu ou em um link do menu
    if (event.target.closest('.sidebar-overlay') || event.target.closest('.sidebar nav a')) {
        abrirMenu(false);
    }
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') abrirMenu(false);
});

// Ao voltar para a tela grande, garante que o menu não fique "preso" aberto
window.matchMedia('(min-width: 1025px)').addEventListener('change', event => {
    if (event.matches) abrirMenu(false);
});
