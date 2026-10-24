// =========================================================
// Gera as chaves VAPID das notificações (Web Push) e grava no .env
//   npm run push:chaves
//
// Rode UMA vez por servidor. Se as chaves já existem, não faz nada:
// trocá-las faria todos os aparelhos precisarem ativar de novo.
// A chave privada não é mostrada na tela.
// =========================================================

const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

const arquivo = path.join(__dirname, '../src/.env');
const atual = fs.existsSync(arquivo) ? fs.readFileSync(arquivo, 'utf8') : '';

// Chave "existe" só quando tem valor (linha "VAPID_PUBLIC_KEY=" vazia, como no .env.example, não conta)
// ([ \t] e não \s: \s também casaria a quebra de linha e "pegaria" a linha seguinte)
const preenchida = nome => new RegExp(`^${nome}[ \\t]*=[ \\t]*\\S`, 'm').test(atual);
if (preenchida('VAPID_PUBLIC_KEY') && preenchida('VAPID_PRIVATE_KEY')) {
    console.log('As chaves VAPID já existem no .env — nada foi alterado.');
    process.exit(0);
}

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
const contato = process.argv[2] || 'mailto:contato@igrejanovocaminho.org';
const valores = { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey };

// Linhas vazias que já estão no .env são preenchidas no lugar; as que faltam vão no fim.
// Um VAPID_SUBJECT já preenchido é mantido.
let conteudo = atual;
const faltando = [];
for (const [nome, valor] of Object.entries(valores)) {
    const linha = new RegExp(`^${nome}[ \\t]*=.*$`, 'm');
    if (linha.test(conteudo)) conteudo = conteudo.replace(linha, `${nome}=${valor}`);
    else faltando.push(`${nome}=${valor}`);
}
if (!preenchida('VAPID_SUBJECT')) {
    const linha = /^VAPID_SUBJECT[ \t]*=.*$/m;
    if (linha.test(conteudo)) conteudo = conteudo.replace(linha, `VAPID_SUBJECT=${contato}`);
    else faltando.push(`VAPID_SUBJECT=${contato}`);
}
if (faltando.length) {
    conteudo = conteudo.replace(/\s*$/, '\n') + ['', '# Notificações (Web Push) — gerado por npm run push:chaves', ...faltando, ''].join('\n');
}

fs.writeFileSync(arquivo, conteudo);
console.log('Chaves VAPID gravadas no .env (a privada não é exibida).');
const assunto = (conteudo.match(/^VAPID_SUBJECT[ \t]*=(.*)$/m) || [])[1]?.trim();
console.log('Contato (VAPID_SUBJECT):', assunto, '— use um e-mail real da igreja.');
