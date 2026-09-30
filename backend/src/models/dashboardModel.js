const pool = require('../config/db');

class resumoDashboard {
    constructor(total_visitantes, total_membros, total_voluntarios, total_escalas) {
        this.total_visitantes = total_visitantes;
        this.total_membros = total_membros;
        this.total_voluntarios = total_voluntarios;
        this.total_escalas = total_escalas
    }
};


class escalasSemana{
    constructor(id_escala, data_escala, id_funcao, funcao, horario, 
                total_voluntarios, pendentes){
        this.id_escala = id_escala;
        this.data_escala = data_escala;
        this.id_funcao = id_funcao;
        this.funcao = funcao;
        this.total_voluntarios = total_voluntarios;
        this.pendentes = pendentes
        this.horario = horario;
    }
};

class eventoIgreja{
    constructor(nome, data_evento){
        this.nome = nome;
        this.data_evento = data_evento
    }
};

class criarFuncao{
    constructor(nome, descricao, ativo, qtd_voluntarios){
        this.nome = nome;
        this.descricao = descricao;
        this.ativo = ativo;
        this.qtd_voluntarios = qtd_voluntarios
    }
}



const dashboardModel = {
    criarEvento : async(nome, data_evento) =>{
        const result = await pool.query(
            `
            INSERT INTO eventos (nome, data_evento)
            VALUES ($1, $2)
            RETURNING *
            `, [nome, data_evento]
        )

        const e = result.rows[0];
        return new eventoIgreja(
            e.nome, e.data_evento
        );
    },

    criarFuncao : async (nome, descricao, ativo, qtd_voluntarios) =>{
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
        return new criarFuncao(p.nome, p.descricao, p.ativo, p.qtd_voluntarios)
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

    escalasSemana : async () =>{
        const result = await pool.query(
            'select * from vw_escalas_semana'
        );
        const row = result.rows[0]
        if (!row) return null
        return result.rows.map(row =>
            new escalasSemana(row.id_escala, row.data_escala, row.id_funcao, row.funcao, 
                              row.total_voluntarios, row.pendentes, row.horario
            )
        )

    }


}


module.exports = dashboardModel;