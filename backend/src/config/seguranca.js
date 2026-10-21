const crypto = require('crypto');

// Chave usada para assinar os tokens de login.
// Defina AUTH_SECRET no .env; sem ela, uma chave temporária é gerada
// e todos precisam entrar de novo quando o servidor reinicia.
const SEGREDO = process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.AUTH_SECRET) {
    console.warn('AUTH_SECRET não definido no .env: usando chave temporária (logins expiram ao reiniciar).');
}

const VALIDADE_HORAS = 12;

// Senha no formato: scrypt$<sal>$<hash>
function gerarHashSenha(senha) {
    const sal = crypto.randomBytes(16).toString('hex');
    return `scrypt$${sal}$${crypto.scryptSync(senha, sal, 32).toString('hex')}`;
}

function conferirSenha(senha, hashSalvo) {
    const [algoritmo, sal, hash] = String(hashSalvo || '').split('$');
    if (algoritmo !== 'scrypt' || !sal || !hash) return false;

    const calculado = crypto.scryptSync(String(senha), sal, 32);
    const esperado = Buffer.from(hash, 'hex');
    return esperado.length === calculado.length && crypto.timingSafeEqual(esperado, calculado);
}

const base64url = texto => Buffer.from(texto).toString('base64url');

function assinar(conteudo) {
    return crypto.createHmac('sha256', SEGREDO).update(conteudo).digest('base64url');
}

// Token: <dados em base64>.<assinatura>
function gerarToken(usuario) {
    const dados = base64url(JSON.stringify({
        id: usuario.id_usuario,
        perfil: usuario.perfil,
        exp: Date.now() + VALIDADE_HORAS * 60 * 60 * 1000
    }));
    return `${dados}.${assinar(dados)}`;
}

function lerToken(token) {
    const [dados, assinatura] = String(token || '').split('.');
    if (!dados || !assinatura) return null;

    const esperada = Buffer.from(assinar(dados));
    const recebida = Buffer.from(assinatura);
    if (esperada.length !== recebida.length || !crypto.timingSafeEqual(esperada, recebida)) return null;

    try {
        const conteudo = JSON.parse(Buffer.from(dados, 'base64url').toString());
        return conteudo.exp > Date.now() ? conteudo : null;
    } catch {
        return null;
    }
}

module.exports = { gerarHashSenha, conferirSenha, gerarToken, lerToken };
