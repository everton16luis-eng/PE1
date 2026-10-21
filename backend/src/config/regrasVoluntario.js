// Validações compartilhadas entre a ficha (gestão) e o portal do voluntário

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const DIAS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const texto = (valor, limite) => (typeof valor === 'string' && valor.trim() ? valor.trim().slice(0, limite) : null);

function lerAusencia(b) {
    const dados = {
        data_inicio: DATA.test(b.data_inicio || '') ? b.data_inicio : null,
        data_fim: DATA.test(b.data_fim || '') ? b.data_fim : null,
        motivo: texto(b.motivo, 200)
    };
    if (!dados.data_inicio || !dados.data_fim) return { erro: 'Informe o período da ausência.' };
    if (dados.data_fim < dados.data_inicio) return { erro: 'A data final não pode ser antes da inicial.' };
    const hoje = new Date().toISOString().slice(0, 10);
    if (dados.data_fim < hoje) return { erro: 'A ausência precisa terminar hoje ou depois.' };
    return { dados };
}

function lerDisponibilidade(lista) {
    return [...new Set((Array.isArray(lista) ? lista : []).filter(dia => DIAS.includes(dia)))];
}

// "confirmar" | "pendente" | "recusar" (recusar exige motivo)
function lerResposta(b) {
    const resposta = b.resposta;
    if (resposta === 'confirmar') return { dados: { confirmado: true, recusado: false, motivo: null } };
    if (resposta === 'pendente') return { dados: { confirmado: false, recusado: false, motivo: null } };
    if (resposta === 'recusar') {
        const motivo = texto(b.motivo, 300);
        if (!motivo) return { erro: 'Conte o motivo para a equipe poder te substituir.' };
        return { dados: { confirmado: false, recusado: true, motivo } };
    }
    return { erro: 'Resposta inválida.' };
}

const idValido = valor => Number.isInteger(Number(valor)) && Number(valor) > 0;

module.exports = { lerAusencia, lerDisponibilidade, lerResposta, idValido, texto, DIAS };
