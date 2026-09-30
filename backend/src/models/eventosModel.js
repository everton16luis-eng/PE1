const pool = require('../config/db')

class funcoes{
    constructor(id_funcao, nome, descricao, qtd_voluntarios){
        this.id_funcao = id_funcao;
        this.nome = nome;
        this.descricao = descricao;
        this.qtd_voluntarios = qtd_voluntarios
    }
}

const eventoModel = {
    selecionaFuncao : async () =>{
        const result = await pool.query(
            'select * from funcoes'
        );
        const row = result.rows[0]
        if (!row) return null
        return result.rows.map(row =>
            new funcoes(row.id_funcao, row.nome, row.descricao, row.qtd_voluntarios
            )
        )
    }

}

module.exports =  eventoModel;