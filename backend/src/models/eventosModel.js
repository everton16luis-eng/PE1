const pool = require('../config/db')

class funcoes {
    constructor(id_funcao, nome, descricao, qtd_voluntarios) {
        this.id_funcao = id_funcao;
        this.nome = nome;
        this.descricao = descricao;
        this.qtd_voluntarios = qtd_voluntarios
    }
}
class voluntariosDisponiveis {
    constructor(id_membro, nome_completo, ativo, apt_voluntario, voluntario) {
        this.id_membro = id_membro;
        this.nome_completo = nome_completo;
        this.ativo = ativo
        this.apto = apt_voluntario;
        this.voluntario = voluntario
    }
}

class eventos {
    constructor(id_evento, nome, data_evento, criado_em, hora_inicio, hora_fim, tipo_evento) {
        this.id_evento = id_evento;
        this.nome = nome;
        this.data_evento = data_evento
        this.criado_em = criado_em;
        this.hora_inicio = hora_inicio;
        this.hora_fim = hora_fim;
        this.tipo_evento = tipo_evento
    }

}

const eventoModel = {

    criarEvento: async (nome, data_evento, criado_em, hora_inicio, hora_fim, tipo_evento) => {
        const result = await pool.query(
            `
            INSERT INTO eventos
            (nome, data_evento, criado_em, hora_inicio, hora_fim, tipo_evento)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
            `,
            [nome, data_evento, criado_em, hora_inicio, hora_fim, tipo_evento]
        );
        const p = result.rows[0];
        return new eventos(p.nome, p.data_evento, p.criado_em, p.hora_inicio, p.hora_fim, p.tipo_evento)
    },

    selecionaEventos: async () => {
        const result = await pool.query(
            'select * from eventos order by data_evento asc limit 4'
        );
        const row = result.rows[0]
        if (!row) return null
        return result.rows.map(row =>
            new eventos(row.id_evento, row.nome, row.data_evento, row.criado_em, row.hora_inicio, row.hora_fim, row.tipo_evento
            )
        )
    },


    selecionaFuncao: async () => {
        const result = await pool.query(
            'select * from funcoes'
        );
        const row = result.rows[0]
        if (!row) return null
        return result.rows.map(row =>
            new funcoes(row.id_funcao, row.nome, row.descricao, row.qtd_voluntarios
            )
        )
    },

    selecionaVoluntariosAtivos: async () => {
        const result = await pool.query(
            'select * from vw_voluntarios_disponiveis order by nome_completo ASC'

        );
        const row = result.rows[0]
        if (!row) return null
        return result.rows.map(row =>
            new voluntariosDisponiveis(row.id_membro, row.nome_completo, row.ativo, row.apto, row.voluntario
            )
        );
    }

}

module.exports = eventoModel;