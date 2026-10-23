// Gera backend/database/instalacao.sql: a estrutura completa do banco (com todas
// as migrações já aplicadas) + os dados iniciais, sem nenhum dado da igreja.
// Rode depois de criar uma migração nova, num banco com todas as migrações aplicadas.
// Uso: npm run db:gerar-instalacao
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '../src/.env'), quiet: true });
const { localizarPgDump } = require('../src/config/backup');

const SAIDA = path.join(__dirname, 'instalacao.sql');

const estrutura = execFileSync(localizarPgDump(), [
    '--schema-only', '--no-owner', '--no-privileges', '--schema=public',
    '-h', process.env.DB_HOST, '-p', String(process.env.DB_PORT || 5432),
    '-U', process.env.DB_USER, process.env.DB_NAME
], { env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD }, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 })
    .replace(/\r\n/g, '\n')
    // Fora: comandos do psql (\restrict), que não rodam pelo executar.js; o esquema public,
    // que já existe em banco novo (e o comentário dele exige ser o dono); e o
    // transaction_timeout, que só existe no PostgreSQL 17+
    .split('\n')
    .filter(linha => !linha.startsWith('\\')
        && !/^(CREATE SCHEMA public;|COMMENT ON SCHEMA public IS .*;|SET transaction_timeout = .*;)$/.test(linha))
    .join('\n');

const dados = fs.readFileSync(path.join(__dirname, 'dados-iniciais.sql'), 'utf8').replace(/\r\n/g, '\n');

fs.writeFileSync(SAIDA, `-- =========================================================
-- INSTALAÇÃO NOVA (banco limpo)
-- Estrutura completa + dados iniciais (dados-iniciais.sql).
-- Nenhuma pessoa, login, evento, escala ou lançamento financeiro.
-- Arquivo gerado por: npm run db:gerar-instalacao (não edite à mão)
--
-- Uso, num banco VAZIO:
--   createdb -U postgres igreja_sistema
--   npm run db:instalar
-- Depois, o primeiro cadastro na tela de login vira o administrador.
-- =========================================================

${estrutura.trim()}

${dados.trim()}
`);
console.log(`Gerado: ${path.relative(process.cwd(), SAIDA)}`);
