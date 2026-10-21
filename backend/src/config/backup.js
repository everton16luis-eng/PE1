const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const PASTA_BACKUPS = path.join(__dirname, '../../../backups');

// Procura o pg_dump: PG_DUMP_PATH no .env, instalação padrão do Windows ou o PATH
function localizarPgDump() {
    if (process.env.PG_DUMP_PATH) return process.env.PG_DUMP_PATH;

    const base = 'C:\\Program Files\\PostgreSQL';
    if (process.platform === 'win32' && fs.existsSync(base)) {
        const versoes = fs.readdirSync(base).filter(v => /^\d+/.test(v)).sort((a, b) => Number(b) - Number(a));
        for (const versao of versoes) {
            const caminho = path.join(base, versao, 'bin', 'pg_dump.exe');
            if (fs.existsSync(caminho)) return caminho;
        }
    }
    return 'pg_dump';
}

// Gera backups/backup-AAAAMMDD-HHMMSS.dump com o banco inteiro
function executarBackup() {
    return new Promise((resolve, reject) => {
        fs.mkdirSync(PASTA_BACKUPS, { recursive: true });
        const carimbo = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
        const arquivo = path.join(PASTA_BACKUPS, `backup-${carimbo}.dump`);

        execFile(localizarPgDump(), [
            '-h', process.env.DB_HOST, '-p', String(process.env.DB_PORT), '-U', process.env.DB_USER,
            '-Fc', '-f', arquivo, process.env.DB_NAME
        ], { env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD }, timeout: 5 * 60 * 1000 }, (error, stdout, stderr) => {
            if (error) return reject(new Error(`Falha no backup: ${stderr || error.message}`));
            resolve({ arquivo: path.basename(arquivo), tamanho: fs.statSync(arquivo).size });
        });
    });
}

module.exports = { executarBackup, localizarPgDump };
