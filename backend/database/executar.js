// Executa um arquivo .sql usando a mesma conexão da API (backend/src/.env).
// Uso: node backend/database/executar.js backend/database/presenca.sql
const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db');

const arquivo = process.argv[2];

if (!arquivo) {
    console.error('Informe o arquivo .sql a ser executado.');
    process.exit(1);
}

(async () => {
    try {
        await pool.query(fs.readFileSync(path.resolve(arquivo), 'utf8'));
        console.log(`Script ${arquivo} executado com sucesso.`);
    } catch (error) {
        console.error('Erro ao executar o script:', error.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
})();
