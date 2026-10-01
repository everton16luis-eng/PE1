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
    constructor(id_membro, nome_completo, ativo, apt_voluntario, voluntario){
        this.id_membro = id_membro;
        this.nome_completo = nome_completo;
        this.ativo = ativo
        this.apto = apt_voluntario;
        this.voluntario = voluntario
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
            new voluntariosDisponiveis(row.id_membro, row.nome_completo, row.ativo, row.apto, row.voluntario
            )
        );
    }

}

module.exports =  eventoModel;