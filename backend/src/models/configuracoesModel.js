const pool = require('../config/db');

const configuracoesModel = {

    buscar: async () => {
        const result = await pool.query('SELECT * FROM configuracoes_igreja ORDER BY id LIMIT 1');
        return result.rows[0];
    },

    salvar: async (c) => {
        const atual = await configuracoesModel.buscar();
        const valores = [c.nome_igreja, c.cnpj, c.telefone, c.endereco, c.cidade, c.estado,
                         c.horario_principal, c.fuso_horario, c.notificacoes, c.notificacoes_email];

        const result = atual
            ? await pool.query(
                `UPDATE configuracoes_igreja
                 SET nome_igreja = $1, cnpj = $2, telefone = $3, endereco = $4, cidade = $5, estado = $6,
                     horario_principal = $7, fuso_horario = $8, notificacoes = $9, notificacoes_email = $10,
                     atualizado_em = CURRENT_TIMESTAMP
                 WHERE id = $11 RETURNING *`,
                [...valores, atual.id])
            : await pool.query(
                `INSERT INTO configuracoes_igreja (nome_igreja, cnpj, telefone, endereco, cidade, estado,
                     horario_principal, fuso_horario, notificacoes, notificacoes_email)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
                valores);
        return result.rows[0];
    },

    // Registra o backup feito e agenda o próximo para o dia seguinte às 03:00
    registrarBackup: async () => {
        const result = await pool.query(
            `UPDATE configuracoes_igreja
             SET ultimo_backup = CURRENT_TIMESTAMP,
                 proximo_backup = (CURRENT_DATE + 1) + TIME '03:00'
             RETURNING ultimo_backup, proximo_backup`
        );
        return result.rows[0];
    }
};

module.exports = configuracoesModel;
