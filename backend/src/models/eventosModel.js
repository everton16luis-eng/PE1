const pool = require('../config/db');

class funcoes {
    constructor(id_funcao, nome, descricao, qtd_voluntarios) {
        this.id_funcao = id_funcao;
        this.nome = nome;
        this.descricao = descricao;
        this.qtd_voluntarios = qtd_voluntarios;
    }
}

class voluntariosDisponiveis {
    constructor(id_membro, nome_completo, ativo, apto_voluntario, voluntario) {
        this.id_membro = id_membro;
        this.nome_completo = nome_completo;
        this.ativo = ativo;
        this.apto = apto_voluntario;
        this.voluntario = voluntario;
    }
}

class eventos {
    constructor(id_evento, nome, data_evento, criado_em, hora_inicio, hora_fim, tipo_evento) {
        this.id_evento = id_evento;
        this.nome = nome;
        this.data_evento = data_evento;
        this.criado_em = criado_em;
        this.hora_inicio = hora_inicio;
        this.hora_fim = hora_fim;
        this.tipo_evento = tipo_evento;
    }
}

const eventoModel = {

    criarEvento: async (nome, data_evento, criado_em, hora_inicio, hora_fim, tipo_evento) => {
        const result = await pool.query(
            `
            INSERT INTO eventos
            (nome, data_evento, criado_em, hora_inicio, hora_fim, tipo_evento)
            VALUES ($1, $2, COALESCE($3, CURRENT_TIMESTAMP), $4, $5, $6)
            RETURNING *
            `,
            [nome, data_evento, criado_em, hora_inicio, hora_fim, tipo_evento]
        );
        const p = result.rows[0];
        return new eventos(p.id_evento, p.nome, p.data_evento, p.criado_em, p.hora_inicio, p.hora_fim, p.tipo_evento);
    },

    // Próximos eventos a partir de hoje (4 no dashboard)
    selecionaEventos: async (limite = 4) => {
        const result = await pool.query(
            `SELECT * FROM eventos
             WHERE data_evento >= CURRENT_DATE
             ORDER BY data_evento ASC, hora_inicio ASC NULLS LAST, id_evento ASC
             LIMIT $1`,
            [limite]
        );
        return result.rows.map(row =>
            new eventos(row.id_evento, row.nome, row.data_evento, row.criado_em, row.hora_inicio, row.hora_fim, row.tipo_evento)
        );
    },

    // Todos os eventos, dos mais recentes para os mais antigos
    // (com o total de escalas, para avisar antes de remover)
    selecionaTodosEventos: async () => {
        const result = await pool.query(
            `SELECT e.*, (SELECT COUNT(*) FROM escalas es WHERE es.id_evento = e.id_evento)::int AS total_escalas
             FROM eventos e ORDER BY e.data_evento DESC, e.hora_inicio DESC`
        );
        return result.rows.map(row => ({
            ...new eventos(row.id_evento, row.nome, row.data_evento, row.criado_em, row.hora_inicio, row.hora_fim, row.tipo_evento),
            total_escalas: row.total_escalas
        }));
    },

    atualizarEvento: async (id, { nome, data_evento, hora_inicio, hora_fim, tipo_evento }) => {
        const result = await pool.query(
            `UPDATE eventos
             SET nome = $2, data_evento = $3, hora_inicio = $4, hora_fim = $5, tipo_evento = $6
             WHERE id_evento = $1
             RETURNING *`,
            [id, nome, data_evento, hora_inicio, hora_fim, tipo_evento]
        );
        const p = result.rows[0];
        if (!p) return null;
        // As escalas do evento acompanham a nova data
        await pool.query('UPDATE escalas SET data_escala = $2 WHERE id_evento = $1', [id, data_evento]);
        return new eventos(p.id_evento, p.nome, p.data_evento, p.criado_em, p.hora_inicio, p.hora_fim, p.tipo_evento);
    },

    // Remove o evento com suas escalas (os voluntários escalados saem junto)
    removerEvento: async (id) => {
        const cliente = await pool.connect();
        try {
            await cliente.query('BEGIN');
            const escalas = await cliente.query('DELETE FROM escalas WHERE id_evento = $1', [id]);
            const evento = await cliente.query('DELETE FROM eventos WHERE id_evento = $1', [id]);
            await cliente.query('COMMIT');
            return evento.rowCount ? { escalas_removidas: escalas.rowCount } : null;
        } catch (error) {
            await cliente.query('ROLLBACK');
            throw error;
        } finally {
            cliente.release();
        }
    },

    selecionaFuncao: async () => {
        const result = await pool.query(
            'SELECT * FROM funcoes ORDER BY nome ASC'
        );
        return result.rows.map(row =>
            new funcoes(row.id_funcao, row.nome, row.descricao, row.qtd_voluntarios)
        );
    },

    selecionaVoluntariosAtivos: async () => {
        const result = await pool.query(
            'SELECT * FROM vw_voluntarios_disponiveis ORDER BY nome_completo ASC'
        );
        return result.rows.map(row =>
            new voluntariosDisponiveis(row.id_membro, row.nome_completo, row.ativo, row.apto_voluntario, row.voluntario)
        );
    }

}

module.exports = eventoModel;
