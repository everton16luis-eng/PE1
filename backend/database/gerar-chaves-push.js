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

if (/^VAPID_PUBLIC_KEY\s*=/m.test(atual) && /^VAPID_PRIVATE_KEY\s*=/m.test(atual)) {
    console.log('As chaves VAPID já existem no .env — nada foi alterado.');
    process.exit(0);
}

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
const contato = process.argv[2] || 'mailto:contato@igrejanovocaminho.org';
const bloco = [
    '',
    '# Notificações (Web Push) — gerado por npm run push:chaves',
    `VAPID_PUBLIC_KEY=${publicKey}`,
    `VAPID_PRIVATE_KEY=${privateKey}`,
    `VAPID_SUBJECT=${contato}`,
    ''
].join('\n');

fs.writeFileSync(arquivo, atual.replace(/\s*$/, '\n') + bloco);
console.log('Chaves VAPID gravadas no .env (a privada não é exibida).');
console.log('Contato usado:', contato, '— troque por um e-mail real da igreja em VAPID_SUBJECT.');
