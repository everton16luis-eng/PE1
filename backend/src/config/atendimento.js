// =========================================================
// Encerramento automático das turmas (servidor, nunca o navegador)
//
// O prazo de cada sessão é calculado pelo banco a partir do evento:
// 23h59 do dia do evento ou, se o evento passa da meia-noite, o fim dele.
// A rotina roda ao iniciar o servidor (recupera o que venceu enquanto ele
// estava desligado) e a cada minuto. É idempotente: cada sessão é encerrada
// numa transação só (saídas, códigos, sessão e alerta), uma única vez.
// =========================================================
const Atendimento = require('../models/atendimentoModel');
const Notificacoes = require('../models/notificacoesModel');
const { avisar } = require('./notificacoes');

const MOTIVOS = {
    automatico_limite_diario: 'limite diário atingido',
    automatico_fim_evento: 'evento encerrado sem fechamento da turma'
};

async function executarEncerramentoAutomatico(agora = new Date()) {
    const encerradas = [];
    for (const idSessao of await Atendimento.sessoesVencidas(agora)) {
        try {
            const resultado = await Atendimento.encerrarAutomaticamente(idSessao, agora);
            if (resultado) encerradas.push(resultado);
        } catch (erro) {
            console.error(`Encerramento automático da sessão ${idSessao} falhou:`, erro.message);
        }
    }
    for (const r of encerradas) {
        // Aviso para a administração (uma vez por alerta, mesmo se a rotina rodar de novo)
        if (!r.id_alerta || !(await Notificacoes.reservarAviso(`turma-alerta:${r.id_alerta}`))) continue;
        const sessao = await Atendimento.buscarSessao(r.id_sessao);
        await avisar(await Notificacoes.gestaoCriancas(), {
            tipo: 'turma_alerta', rota: 'atendimento',
            titulo: r.presentes ? `Turma ${sessao.turma} encerrada com crianças presentes` : `Turma ${sessao.turma} encerrada automaticamente`,
            mensagem: `${sessao.evento}: ${MOTIVOS[r.tipo] || 'encerramento automático'}.${r.presentes ? ` ${r.presentes} saída(s) regularizada(s) pelo sistema — revise.` : ''}`
        }).catch(erro => console.error('Aviso de turma encerrada falhou:', erro.message));
    }
    return { encerradas: encerradas.length };
}

function iniciarEncerramentoAutomatico() {
    const verificar = () => executarEncerramentoAutomatico().catch(erro => console.error('Encerramento automático das turmas falhou:', erro.message));
    setTimeout(verificar, 5 * 1000).unref();
    setInterval(verificar, 60 * 1000).unref();
}

module.exports = { executarEncerramentoAutomatico, iniciarEncerramentoAutomatico, MOTIVOS };
