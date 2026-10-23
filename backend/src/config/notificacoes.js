// =========================================================
// Notificações: central de avisos (sininho) + Web Push no
// celular/computador, sem aplicativo.
//
// avisar() grava o aviso para cada login e envia o push para os
// aparelhos que ativaram. Falhas de envio nunca atrapalham a ação
// principal (criar escala, recusar...): são só registradas no log.
// Sem chaves VAPID no .env, só a central de avisos funciona.
// =========================================================

const webpush = require('web-push');
const Notificacoes = require('../models/notificacoesModel');
const Configuracoes = require('../models/configuracoesModel');

const CHAVE_PUBLICA = process.env.VAPID_PUBLIC_KEY || null;
const pushConfigurado = Boolean(CHAVE_PUBLICA && process.env.VAPID_PRIVATE_KEY);
if (pushConfigurado) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:contato@igrejanovocaminho.org', CHAVE_PUBLICA, process.env.VAPID_PRIVATE_KEY);
}

// Quem entrega o push (os testes trocam por um falso, para não sair para a internet)
let enviador = (inscricao, conteudo) => webpush.sendNotification(inscricao, conteudo, { TTL: 24 * 60 * 60, timeout: 8000 });
let enviadorDeTeste = false;
const definirEnviador = fn => { enviador = fn; enviadorDeTeste = true; };

const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
function dataCurta(valor) {
    const [ano, mes, dia] = String(valor instanceof Date ? valor.toISOString() : valor).slice(0, 10).split('-').map(Number);
    return `${SEMANA[new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()]}, ${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`;
}
const hora = valor => (valor ? String(valor).slice(0, 5) : '');
const resumoEscala = i => `${i.evento || 'Escala'} — ${dataCurta(i.data)}${i.funcao ? `, ${i.funcao}` : ''}${i.horario ? `, chegada ${hora(i.horario)}` : ''}`;

// Envia o push para os aparelhos destes logins; remove aparelhos que não existem mais
async function enviarPush(idsUsuarios, aviso) {
    if (!pushConfigurado && !enviadorDeTeste) return;
    const inscricoes = await Notificacoes.inscricoesDe(idsUsuarios);
    const conteudo = JSON.stringify({
        titulo: aviso.titulo,
        mensagem: aviso.mensagem,
        url: aviso.rota ? `/#/${aviso.rota}` : '/',
        tag: aviso.tipo
    });
    await Promise.all(inscricoes.map(async i => {
        try {
            await enviador({ endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } }, conteudo);
            await Notificacoes.registrarEnvio(i.id_inscricao);
        } catch (erro) {
            if (erro.statusCode === 404 || erro.statusCode === 410) await Notificacoes.removerInscricao(i.id_inscricao);
            else console.error('Push não enviado:', erro.statusCode || erro.message);
        }
    }));
}

// Grava o aviso para cada login (sem repetir) e envia o push
async function avisar(idsUsuarios, aviso) {
    const ids = [...new Set(idsUsuarios.filter(Boolean))];
    if (!ids.length) return;
    await Notificacoes.criar(ids, aviso);
    await enviarPush(ids, aviso);
}

// Para chamar depois da ação principal, sem esperar e sem derrubar nada
function avisarDepois(promessa) {
    Promise.resolve().then(promessa).catch(erro => console.error('Falha ao notificar:', erro.message));
}

// ---------------------------------------------------------
// Avisos dos acontecimentos do sistema
// ---------------------------------------------------------
const Avisos = {
    // Voluntários colocados numa escala (nova escala ou substituição pela equipe)
    novaEscala: async (idsVoluntarios, info) => avisar(await Notificacoes.usuariosDosVoluntarios(idsVoluntarios), {
        tipo: 'escala_nova', rota: 'minha-area',
        titulo: 'Você foi escalado(a)',
        mensagem: `${resumoEscala(info)}. Confirme sua presença na Minha área.`
    }),

    // Voluntário tirado de uma escala pela equipe
    escalaRetirada: async (idsVoluntarios, info) => avisar(await Notificacoes.usuariosDosVoluntarios(idsVoluntarios), {
        tipo: 'escala_retirada', rota: 'minha-area',
        titulo: 'Você saiu de uma escala',
        mensagem: `A liderança retirou você de: ${resumoEscala(info)}.`
    }),

    // Evento alterado (data ou horário) — todos os escalados nele
    eventoAlterado: async (idsVoluntarios, info) => avisar(await Notificacoes.usuariosDosVoluntarios(idsVoluntarios), {
        tipo: 'escala_alterada', rota: 'minha-area',
        titulo: 'Escala alterada',
        mensagem: `${info.evento} agora é ${dataCurta(info.data)}${info.hora_inicio ? ` às ${hora(info.hora_inicio)}` : ''}. Confira na Minha área.`
    }),

    // Evento removido — as escalas dele deixam de existir
    eventoRemovido: async (idsVoluntarios, info) => avisar(await Notificacoes.usuariosDosVoluntarios(idsVoluntarios), {
        tipo: 'escala_removida', rota: 'minha-area',
        titulo: 'Escala cancelada',
        mensagem: `O evento ${info.evento} (${dataCurta(info.data)}) foi removido e a sua escala nele foi cancelada.`
    }),

    // Troca entre voluntários: quem assumiu e a liderança
    vagaPassada: async ({ idEntrou, nomeSaiu, nomeEntrou, info }) => {
        await avisar(await Notificacoes.usuariosDosVoluntarios([idEntrou]), {
            tipo: 'vaga_recebida', rota: 'minha-area',
            titulo: 'Você assumiu uma vaga',
            mensagem: `${nomeSaiu} passou a vaga dele(a) para você: ${resumoEscala(info)}. Confirme sua presença.`
        });
        await avisar(await Notificacoes.lideranca(), {
            tipo: 'troca_voluntarios', rota: 'escalas',
            titulo: 'Troca de vaga entre voluntários',
            mensagem: `${nomeSaiu} passou a vaga para ${nomeEntrou}: ${resumoEscala(info)}.`
        });
    },

    // Voluntário avisou que não pode ir
    recusa: async ({ nome, motivo, info }) => avisar(await Notificacoes.lideranca(), {
        tipo: 'recusa', rota: 'escalas',
        titulo: `${nome} não poderá ir`,
        mensagem: `${resumoEscala(info)}. Motivo: ${motivo}`
    })
};

// ---------------------------------------------------------
// Lembretes automáticos (a partir das 18h, horário da igreja)
// ---------------------------------------------------------
const HORA_LEMBRETE = Number(process.env.LEMBRETE_HORA || 18);

// Data e hora "de parede" no fuso da igreja
function agoraNoFuso(agora, fuso) {
    const partes = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
    }).formatToParts(agora).map(p => [p.type, p.value]));
    return { data: `${partes.year}-${partes.month}-${partes.day}`, hora: Number(partes.hour) };
}
const somarDias = (data, dias) => {
    const d = new Date(data + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
};

// Véspera: cada escalado de amanhã recebe um lembrete (uma vez só).
// Liderança: um resumo por dia das confirmações pendentes dos próximos 2 dias.
async function executarLembretes(agora = new Date()) {
    const config = await Configuracoes.buscar();
    if (config && config.notificacoes === false) return { enviados: 0, desligado: true };
    let fuso = config?.fuso_horario || 'America/Sao_Paulo';
    try { new Intl.DateTimeFormat('pt-BR', { timeZone: fuso }); } catch { fuso = 'America/Sao_Paulo'; }

    const { data: hoje, hora: horaAgora } = agoraNoFuso(agora, fuso);
    if (horaAgora < HORA_LEMBRETE) return { enviados: 0 };
    const amanha = somarDias(hoje, 1);
    let enviados = 0;

    for (const e of await Notificacoes.escaladosNaData(amanha)) {
        if (!(await Notificacoes.reservarAviso(`vespera:${e.id_escala}:${e.id_voluntario}`))) continue;
        const info = { evento: e.evento, data: amanha, funcao: e.funcao, horario: e.horario };
        await avisar(await Notificacoes.usuariosDosVoluntarios([e.id_voluntario]), {
            tipo: 'lembrete', rota: 'minha-area',
            titulo: e.confirmado ? 'Amanhã você serve!' : 'Amanhã você está escalado(a) — confirme',
            mensagem: `${resumoEscala(info)}.${e.confirmado ? ' Obrigado por servir!' : ' Você ainda não confirmou: responda na Minha área.'}`
        });
        enviados++;
    }

    if (await Notificacoes.reservarAviso(`pendencias:${hoje}`)) {
        const p = await Notificacoes.pendenciasEntre(amanha, somarDias(hoje, 2));
        if (p.pendentes > 0) {
            await avisar(await Notificacoes.lideranca(), {
                tipo: 'pendencias', rota: 'escalas',
                titulo: 'Confirmações pendentes',
                mensagem: `${p.pendentes} voluntário(s) ainda não responderam às escalas de ${p.eventos} evento(s) nos próximos 2 dias.`
            });
            enviados++;
        }
    }
    return { enviados };
}

function iniciarLembretes() {
    const verificar = () => executarLembretes().catch(erro => console.error('Lembretes falharam:', erro.message));
    setTimeout(verificar, 30 * 1000).unref();
    setInterval(verificar, 10 * 60 * 1000).unref();
}

module.exports = { avisar, avisarDepois, Avisos, executarLembretes, iniciarLembretes, definirEnviador, CHAVE_PUBLICA, pushConfigurado, dataCurta };
