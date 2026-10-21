// Limita tentativas de login erradas (proteção contra força bruta).
// Fica em memória: reinicia junto com o servidor.

const JANELA_MS = 15 * 60 * 1000;
const MAX_POR_LOGIN = 10;
const MAX_POR_IP = 50;

const falhas = new Map(); // chave -> [horários das falhas]

function recentes(chave) {
    const agora = Date.now();
    const lista = (falhas.get(chave) || []).filter(t => agora - t < JANELA_MS);
    if (lista.length) falhas.set(chave, lista); else falhas.delete(chave);
    return lista;
}

const chaves = (ip, login) => [`ip:${ip}`, `login:${ip}:${String(login).toLowerCase()}`];

// Devolve em quantos segundos libera, ou 0 se pode tentar
function bloqueadoPor(ip, login) {
    const [chaveIp, chaveLogin] = chaves(ip, login);
    const porIp = recentes(chaveIp);
    const porLogin = recentes(chaveLogin);
    const lista = porLogin.length >= MAX_POR_LOGIN ? porLogin : porIp.length >= MAX_POR_IP ? porIp : null;
    return lista ? Math.ceil((lista[0] + JANELA_MS - Date.now()) / 1000) : 0;
}

function registrarFalha(ip, login) {
    for (const chave of chaves(ip, login)) falhas.set(chave, [...recentes(chave), Date.now()]);
}

function registrarSucesso(ip, login) {
    falhas.delete(chaves(ip, login)[1]);
}

module.exports = { bloqueadoPor, registrarFalha, registrarSucesso };
