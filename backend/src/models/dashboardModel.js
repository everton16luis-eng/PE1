const pool = require('../config/db');

class resumoDashboard {
    constructor(total_visitantes, total_membros, total_voluntarios, total_escalas) {
        this.total_visitantes = total_visitantes;
        this.total_membros = total_membros;
        this.total_voluntarios = total_voluntarios;
        this.total_escalas = total_escalas;
    }
};

class escalasSemana {
    constructor(id_escala, data_escala, id_funcao, funcao, horario,
                total_voluntarios, confirmados, pendentes) {
        this.id_escala = id_escala;
        this.data_escala = data_escala;
        this.id_funcao = id_funcao;
        this.funcao = funcao;
        this.horario = horario;
        this.total_voluntarios = total_voluntarios;
        this.confirmados = confirmados;
        this.pendentes = pendentes;
    }
};

class eventoIgreja {
    constructor(id_evento, nome, data_evento) {
        this.id_evento = id_evento;
        this.nome = nome;
        this.data_evento = data_evento;
    }
};

class criarFuncao {
    constructor(id_funcao, nome, descricao, ativo, qtd_voluntarios) {
        this.id_funcao = id_funcao;
        this.nome = nome;
        this.descricao = descricao;
        this.ativo = ativo;
        this.qtd_voluntarios = qtd_voluntarios;
    }
}

const dashboardModel = {
    criarEvento: async (nome, data_evento) => {
        const result = await pool.query(
            `
            INSERT INTO eventos (nome, data_evento)
            VALUES ($1, $2)
            RETURNING *
            `, [nome, data_evento]
        );

        const e = result.rows[0];
        return new eventoIgreja(e.id_evento, e.nome, e.data_evento);
    },

    criarFuncao: async (nome, descricao, ativo, qtd_voluntarios) => {
        const result = await pool.query(
            `
            INSERT INTO funcoes
            (nome, descricao, ativo, qtd_voluntarios)
            VALUES ($1, $2, $3, $4)
            RETURNING *
            `,
            [nome, descricao, ativo, qtd_voluntarios]
        );
        const p = result.rows[0];
        return new criarFuncao(p.id_funcao, p.nome, p.descricao, p.ativo, p.qtd_voluntarios);
    },

    resumoPessoas: async () => {
        const result = await pool.query(
            'SELECT * FROM vw_dashboard'
        );
        const row = result.rows[0];
        if (!row) return null;
        return new resumoDashboard(
            row.total_visitantes,
            row.total_membros,
            row.total_voluntarios,
            row.total_escalas
        );
    },

    // Escalas da semana atual (segunda a domingo)
    escalasSemana: async () => {
        const result = await pool.query(
            `SELECT es.id_escala, es.data_escala, ep.id_funcao, f.nome AS funcao, es.horario, e.nome AS evento,
                    COUNT(*)::int AS total_voluntarios,
                    COUNT(*) FILTER (WHERE ep.confirmado IS TRUE)::int AS confirmados,
                    COUNT(*) FILTER (WHERE ep.confirmado IS NOT TRUE AND NOT ep.recusado)::int AS pendentes,
                    COUNT(*) FILTER (WHERE ep.recusado)::int AS recusados
             FROM escalas es
             INNER JOIN escala_participantes ep ON ep.id_escala = es.id_escala
             INNER JOIN funcoes f ON f.id_funcao = ep.id_funcao
             LEFT JOIN eventos e ON e.id_evento = es.id_evento
             WHERE es.data_escala >= date_trunc('week', CURRENT_DATE)
               AND es.data_escala < date_trunc('week', CURRENT_DATE) + INTERVAL '7 days'
             GROUP BY es.id_escala, ep.id_funcao, f.nome, e.nome
             ORDER BY es.data_escala ASC, es.horario ASC, f.nome ASC`
        );
        return result.rows.map(row => ({
            ...new escalasSemana(row.id_escala, row.data_escala, row.id_funcao, row.funcao,
                                 row.horario, row.total_voluntarios, row.confirmados, row.pendentes),
            recusados: row.recusados,
            evento: row.evento
        }));
    },

    // Próximos voluntários escalados que ainda não confirmaram
    confirmacoesPendentes: async () => {
        const result = await pool.query(
            `SELECT m.nome_completo AS nome, f.nome AS funcao, es.data_escala
             FROM escala_participantes ep
             INNER JOIN escalas es ON es.id_escala = ep.id_escala
             INNER JOIN funcoes f ON f.id_funcao = ep.id_funcao
             INNER JOIN voluntarios v ON v.id_voluntario = ep.id_voluntario
             INNER JOIN membros m ON m.id_membro = v.id_membro
             WHERE ep.confirmado IS NOT TRUE AND NOT ep.recusado
               AND es.data_escala >= CURRENT_DATE
             ORDER BY es.data_escala ASC, m.nome_completo ASC
             LIMIT 5`
        );
        return result.rows;
    },

    // Situação das escalas do mês atual:
    // confirmados, pendentes (ainda vão acontecer) e ausentes
    // (já passaram sem confirmação ou o voluntário recusou)
    graficoConfirmacoes: async () => {
        const result = await pool.query(
            `SELECT
                COUNT(*) FILTER (WHERE ep.confirmado IS TRUE)::int AS confirmados,
                COUNT(*) FILTER (WHERE ep.confirmado IS NOT TRUE AND NOT ep.recusado AND es.data_escala >= CURRENT_DATE)::int AS pendentes,
                COUNT(*) FILTER (WHERE ep.confirmado IS NOT TRUE AND (ep.recusado OR es.data_escala < CURRENT_DATE))::int AS ausentes
             FROM escala_participantes ep
             INNER JOIN escalas es ON es.id_escala = ep.id_escala
             WHERE es.data_escala >= date_trunc('month', CURRENT_DATE)
               AND es.data_escala < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'`
        );
        return result.rows[0];
    }
}

module.exports = dashboardModel;
