const crypto = require('crypto');

// Chave usada para assinar os tokens de login.
// Defina AUTH_SECRET no .env; sem ela, uma chave temporária é gerada
// e todos precisam entrar de novo quando o servidor reinicia.
const SEGREDO = process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.AUTH_SECRET) {
    console.warn('AUTH_SECRET não definido no .env: usando chave temporária (logins expiram ao reiniciar).');
}

const VALIDADE_HORAS = 12;

// ---------------------------------------------------------
// Senha forte: regra única para toda senha NOVA (cadastro, Usuários,
// acesso ao portal e troca de senha). O login não usa esta regra:
// quem tem senha antiga continua entrando normalmente.
// A tela usa as mesmas regras (frontend/js/script.js: REGRAS_SENHA).
// ---------------------------------------------------------
const SENHA_MIN = 8;
const SENHA_MAX = 128;
const REGRAS_SENHA = [
    ['pelo menos 8 caracteres', s => [...s].length >= SENHA_MIN],
    ['uma letra minúscula', s => /\p{Ll}/u.test(s)],
    ['uma letra maiúscula', s => /\p{Lu}/u.test(s)],
    ['um número', s => /\p{Nd}/u.test(s)],
    ['um símbolo (ex.: ! @ # $ % & * ?)', s => /[^\p{L}\p{N}\s]/u.test(s)]
];

// Devolve a mensagem de erro ou null se a senha cumpre todas as regras
function validarSenha(senha) {
    const texto = typeof senha === 'string' ? senha : '';
    if ([...texto].length > SENHA_MAX) return `A senha pode ter no máximo ${SENHA_MAX} caracteres.`;
    const faltando = REGRAS_SENHA.filter(([, cumpre]) => !cumpre(texto)).map(([regra]) => regra);
    return faltando.length ? `A senha precisa ter ${faltando.join(', ')}.` : null;
}

// ---------------------------------------------------------
// Hash das senhas: scrypt (lento de propósito) com sal aleatório.
// Formato atual:  scrypt$N=65536,r=8,p=2$<sal>$<hash>
// Formato antigo: scrypt$<sal>$<hash>  (custo padrão do Node: N=16384, r=8, p=1)
// O custo segue a recomendação da OWASP (N=2^16, r=8, p=2: ~64 MB por cálculo)
// e é gravado junto do hash: dá para aumentar no futuro sem invalidar ninguém.
// O cálculo é assíncrono (não trava o servidor enquanto confere uma senha).
// SENHA_SCRYPT_N no .env permite outro custo (os testes usam um menor, só por velocidade).
// ---------------------------------------------------------
const CUSTO_ANTIGO = { N: 16384, r: 8, p: 1 };
const CUSTO_ATUAL = { N: Math.max(Number(process.env.SENHA_SCRYPT_N) || 65536, 16384), r: 8, p: 2 };
const TAMANHO_HASH = 32;

function calcularScrypt(senha, sal, { N, r, p }) {
    return new Promise((resolve, reject) => {
        crypto.scrypt(String(senha), sal, TAMANHO_HASH, { N, r, p, maxmem: 256 * N * r + 1024 * 1024 }, (erro, hash) =>
            (erro ? reject(erro) : resolve(hash)));
    });
}

// Lê "scrypt$..." nos dois formatos; null se não for um hash reconhecido
function lerHash(hashSalvo) {
    const partes = String(hashSalvo || '').split('$');
    if (partes[0] !== 'scrypt') return null;
    if (partes.length === 3) return { custo: CUSTO_ANTIGO, sal: partes[1], hash: partes[2] };
    if (partes.length !== 4) return null;
    const custo = Object.fromEntries(partes[1].split(',').map(par => par.split('=')).map(([k, v]) => [k, Number(v)]));
    if (![custo.N, custo.r, custo.p].every(n => Number.isInteger(n) && n > 0)) return null;
    return { custo, sal: partes[2], hash: partes[3] };
}

async function gerarHashSenha(senha) {
    const sal = crypto.randomBytes(16).toString('hex');
    const { N, r, p } = CUSTO_ATUAL;
    const hash = await calcularScrypt(senha, sal, CUSTO_ATUAL);
    return `scrypt$N=${N},r=${r},p=${p}$${sal}$${hash.toString('hex')}`;
}

async function conferirSenha(senha, hashSalvo) {
    const lido = lerHash(hashSalvo);
    if (!lido || !lido.sal || !lido.hash) return false;
    const calculado = await calcularScrypt(senha, lido.sal, lido.custo);
    const esperado = Buffer.from(lido.hash, 'hex');
    return esperado.length === calculado.length && crypto.timingSafeEqual(esperado, calculado);
}

// Hash feito com um custo menor que o atual (refazer no próximo login, com a senha certa)
function senhaPrecisaAtualizar(hashSalvo) {
    const lido = lerHash(hashSalvo);
    return !lido || ['N', 'r', 'p'].some(k => lido.custo[k] !== CUSTO_ATUAL[k]);
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

module.exports = { gerarHashSenha, conferirSenha, senhaPrecisaAtualizar, validarSenha, gerarToken, lerToken };
