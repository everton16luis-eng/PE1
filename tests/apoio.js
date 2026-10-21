// =========================================================
// Funções de apoio dos testes: sobe a API apontando para o
// banco de testes e cria usuários com perfis/permissões.
// =========================================================

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../backend/src/.env'), quiet: true });

// Antes de carregar a API: troca para o banco de testes
process.env.DB_NAME = process.env.DB_NAME_TESTE || `${process.env.DB_NAME}_teste`;
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'segredo-dos-testes';

const crypto = require('crypto');
const app = require('../backend/src/server');
const pool = require('../backend/src/config/db');
const { gerarHashSenha } = require('../backend/src/config/seguranca');

const SENHA = 'Senha@Teste1';
const TODAS = { participantes: true, voluntarios: true, escalas: true, criancas: true, relatorios: true, usuarios: true };
const NENHUMA = { participantes: false, voluntarios: false, escalas: false, criancas: false, relatorios: false, usuarios: false };

let servidor;
let base;

async function iniciar() {
    if (pool.options.database === undefined || !String(pool.options.database).endsWith('_teste')) {
        throw new Error(`Os testes só rodam no banco de testes (atual: ${pool.options.database}).`);
    }
    await new Promise(resolve => { servidor = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${servidor.address().port}`;
    return base;
}

async function encerrar() {
    await new Promise(resolve => servidor.close(resolve));
    await pool.end();
}

// Requisição à API devolvendo { status, corpo, headers }
async function api(rota, { metodo = 'GET', token, corpo, headers = {} } = {}) {
    const resposta = await fetch(`${base}${rota}`, {
        method: metodo,
        headers: {
            ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...headers
        },
        body: corpo === undefined ? undefined : (typeof corpo === 'string' ? corpo : JSON.stringify(corpo))
    });
    const texto = await resposta.text();
    let json = null;
    try { json = JSON.parse(texto); } catch { /* resposta não é JSON */ }
    return { status: resposta.status, corpo: json, texto, headers: resposta.headers };
}

// Cria um usuário direto no banco e devolve { id, email, token }
async function criarUsuario({ perfil = 'SECRETARIA', permissoes = NENHUMA, ativo = true, id_membro = null } = {}) {
    const email = `teste.${perfil.toLowerCase()}.${crypto.randomBytes(4).toString('hex')}@exemplo.test`;
    const result = await pool.query(
        `INSERT INTO usuarios (nome, email, senha_hash, perfil, ativo, permissoes, id_membro)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id_usuario`,
        [`Teste ${perfil}`, email, gerarHashSenha(SENHA), perfil, ativo, permissoes, id_membro]
    );
    const usuario = { id: result.rows[0].id_usuario, email };
    if (ativo) {
        const login = await api('/api/auth/login', { metodo: 'POST', corpo: { login: email, senha: SENHA } });
        usuario.token = login.corpo?.token;
    }
    return usuario;
}

// Conta linhas de tabelas (para provar que nada foi apagado/alterado)
async function contar(...tabelas) {
    const resultado = {};
    for (const tabela of tabelas) {
        resultado[tabela] = (await pool.query(`SELECT COUNT(*)::int AS n FROM ${tabela}`)).rows[0].n;
    }
    return resultado;
}

// Voluntário ativo, com escalas futuras e sem login ainda (para o portal)
async function voluntarioComEscalas(pular = 0) {
    const result = await pool.query(
        `SELECT v.id_voluntario, v.id_membro
         FROM voluntarios v
         WHERE v.ativo
           AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.id_membro = v.id_membro)
           AND (SELECT COUNT(*) FROM escala_participantes ep JOIN escalas es ON es.id_escala = ep.id_escala
                WHERE ep.id_voluntario = v.id_voluntario AND es.data_escala >= CURRENT_DATE AND NOT ep.recusado) >= 2
         ORDER BY v.id_voluntario
         OFFSET $1 LIMIT 1`,
        [pular]
    );
    return result.rows[0];
}

module.exports = { iniciar, encerrar, api, criarUsuario, contar, voluntarioComEscalas, pool, SENHA, TODAS, NENHUMA, get base() { return base; } };
