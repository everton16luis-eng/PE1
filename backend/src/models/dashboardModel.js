const pool = require('../config/db');

class resumoDashboard {
    constructor(total_visitantes, total_membros, total_voluntarios, total_escalas) {
        this.total_visitantes = total_visitantes;
        this.total_membros = total_membros;
        this.total_voluntarios = total_voluntarios;
        this.total_escalas = total_escalas;
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
            `SELECT es.id_escala, es.data_escala, es.id_funcao, f.nome AS funcao, es.horario, es.qtd_voluntarios,
                    e.id_evento, e.nome AS evento, e.data_evento, e.hora_inicio, e.hora_fim, e.tipo_evento,
                    COALESCE(json_agg(json_build_object(
                        'nome', m.nome_completo, 'confirmado', ep.confirmado,
                        'recusado', ep.recusado, 'motivo_recusa', ep.motivo_recusa
                    ) ORDER BY m.nome_completo) FILTER (WHERE ep.id_voluntario IS NOT NULL), '[]') AS voluntarios
             FROM escalas es
             LEFT JOIN eventos e ON e.id_evento = es.id_evento
             LEFT JOIN funcoes f ON f.id_funcao = es.id_funcao
             LEFT JOIN escala_participantes ep ON ep.id_escala = es.id_escala
             LEFT JOIN voluntarios v ON v.id_voluntario = ep.id_voluntario
             LEFT JOIN membros m ON m.id_membro = v.id_membro
             WHERE es.data_escala >= date_trunc('week', CURRENT_DATE)
               AND es.data_escala < date_trunc('week', CURRENT_DATE) + INTERVAL '7 days'
             GROUP BY es.id_escala, f.nome, e.id_evento
             ORDER BY es.data_escala ASC, e.hora_inicio ASC NULLS LAST, f.nome ASC`
        );

        // Agrupa por evento: cada evento com suas funções e os voluntários de cada uma
        const eventos = new Map();
        for (const row of result.rows) {
            const chave = row.id_evento ?? `sem-evento-${row.data_escala}`;
            if (!eventos.has(chave)) {
                eventos.set(chave, {
                    id_evento: row.id_evento,
                    nome: row.evento || 'Escala sem evento',
                    data: row.data_evento || row.data_escala,
                    hora_inicio: row.hora_inicio,
                    hora_fim: row.hora_fim,
                    tipo_evento: row.tipo_evento,
                    funcoes: []
                });
            }
            const voluntarios = row.voluntarios;
            eventos.get(chave).funcoes.push({
                id_escala: row.id_escala,
                funcao: row.funcao,
                horario: row.horario,
                qtd_voluntarios: row.qtd_voluntarios,
                voluntarios,
                confirmados: voluntarios.filter(v => v.confirmado).length,
                pendentes: voluntarios.filter(v => !v.confirmado && !v.recusado).length,
                recusados: voluntarios.filter(v => v.recusado).length
            });
        }

        // Totais do evento (quem recusou não conta como escalado)
        return [...eventos.values()].map(evento => {
            const soma = campo => evento.funcoes.reduce((total, f) => total + f[campo], 0);
            const vagas = evento.funcoes.reduce((total, f) => total + (f.qtd_voluntarios || 0), 0);
            const escalados = soma('confirmados') + soma('pendentes');
            return {
                ...evento,
                vagas,
                escalados,
                confirmados: soma('confirmados'),
                pendentes: soma('pendentes'),
                recusados: soma('recusados'),
                faltam: Math.max(vagas - escalados, 0)
            };
        });
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
