const pool = require('../config/db')

class funcoes{
    constructor(id_funcao, nome, descricao, qtd_voluntarios){
        this.id_funcao = id_funcao;
        this.nome = nome;
        this.descricao = descricao;
        this.qtd_voluntarios = qtd_voluntarios
    }
}
class voluntariosDisponiveis{
    constructor(id_voluntario, id_membro, nome, id_departamento, data_inicio_voluntariado, data_batismo){
        this.id_voluntario = id_voluntario;
        this.id_membro = id_membro;
        this.nome = nome;
        this.id_departamento = id_departamento;
        this.data_inicio_voluntariado = data_inicio_voluntariado;
        this.data_batismo = data_batismo
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
    },

    selecionaVoluntariosAtivos : async ()=> {
        const result = await pool.query(
            'select * from vw_voluntarios_disponiveis'
        );
        const row = result.rows[0]
        if(!row) return null
        return result.rows.map(row =>
            new voluntariosDisponiveis(row.id_voluntario, row.id_membro, row.nome, row.id_departamento, row.data_inicio_voluntariado, row.data_batismo
            )
        );
    }

}

module.exports =  eventoModel;