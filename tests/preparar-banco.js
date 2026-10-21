// =========================================================
// Cria o banco de TESTES como cópia do banco principal.
// Os testes nunca escrevem no banco principal.
//
//   node tests/preparar-banco.js   (o "npm test" já chama)
// =========================================================

const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '../backend/src/.env'), quiet: true });
const { Client } = require('pg');
const { localizarPgDump } = require('../backend/src/config/backup');

const ORIGEM = process.env.DB_NAME;
const TESTE = process.env.DB_NAME_TESTE || `${ORIGEM}_teste`;

if (!ORIGEM || TESTE === ORIGEM) {
    console.error('O banco de testes precisa ter um nome diferente do banco principal.');
    process.exit(1);
}

const conexao = { host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD };
const env = { ...process.env, PGPASSWORD: process.env.DB_PASSWORD };
const pgDump = localizarPgDump();
const pgRestore = pgDump.replace(/pg_dump(\.exe)?$/, (_, ext) => `pg_restore${ext || ''}`);
const argsConexao = ['-h', conexao.host, '-p', String(conexao.port), '-U', conexao.user];

(async () => {
    const arquivo = path.join(os.tmpdir(), `igreja-teste-${process.pid}.dump`);
    const admin = new Client({ ...conexao, database: 'postgres' });
    try {
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS "${TESTE}" WITH (FORCE)`);
        await admin.query(`CREATE DATABASE "${TESTE}"`);

        execFileSync(pgDump, [...argsConexao, '-Fc', '-f', arquivo, ORIGEM], { env, stdio: 'pipe' });
        execFileSync(pgRestore, [...argsConexao, '-d', TESTE, '--no-owner', arquivo], { env, stdio: 'pipe' });

        console.log(`Banco de testes "${TESTE}" criado a partir de "${ORIGEM}".`);
    } catch (error) {
        console.error('Não foi possível preparar o banco de testes:', error.stderr?.toString() || error.message);
        process.exitCode = 1;
    } finally {
        await admin.end();
        fs.rmSync(arquivo, { force: true });
    }
})();
