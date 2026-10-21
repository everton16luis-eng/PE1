const Escalas = require('../models/escalasModel');
const { responderErro } = require('../config/erros');

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}(:\d{2})?$/;
const DIAS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const TIPOS = ['culto', 'culto-jovens', 'culto-infantil', 'evento', 'reuniao'];

exports.getCalendario = async (req, res) => {
    try {
        const ano = Number(req.query.ano);
        const mes = Number(req.query.mes);
        if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
            return res.status(400).json({ erro: 'Informe ano e mês (1 a 12).' });
        }
        const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
        const fim = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
        res.json(await Escalas.calendario(inicio, fim));
    } catch (error) {
        console.error('Erro ao carregar calendário de escalas', error);
        responderErro(res, error);
    }
}

exports.getDia = async (req, res) => {
    try {
        const data = req.query.data;
        if (!DATA.test(data || '')) return res.status(400).json({ erro: 'Informe uma data válida (AAAA-MM-DD).' });

        const [eventos, escalas] = await Promise.all([Escalas.eventosDoDia(data), Escalas.escalasDoDia(data)]);
        res.json({ eventos, escalas });
    } catch (error) {
        console.error('Erro ao carregar escalas do dia', error);
        responderErro(res, error);
    }
}

exports.getVoluntariosDaFuncao = async (req, res) => {
    try {
        const idFuncao = Number(req.query.funcao);
        const data = req.query.data;
        if (!Number.isInteger(idFuncao) || !DATA.test(data || '')) {
            return res.status(400).json({ erro: 'Informe a função e a data.' });
        }
        const diaSemana = DIAS[new Date(data + 'T00:00:00Z').getUTCDay()];
        res.json(await Escalas.voluntariosDaFuncao(idFuncao, diaSemana, data));
    } catch (error) {
        console.error('Erro ao carregar voluntários da função', error);
        responderErro(res, error);
    }
}

exports.novaEscala = async (req, res) => {
    try {
        const b = req.body;
        const voluntarios = [...new Set((Array.isArray(b.voluntarios) ? b.voluntarios : []).map(Number))].filter(n => Number.isInteger(n) && n > 0);
        const dados = {
            data: b.data,
            id_evento: Number(b.id_evento) || null,
            evento: b.evento || null,
            id_funcao: Number(b.id_funcao),
            qtd_voluntarios: Number(b.qtd_voluntarios),
            horario: b.horario,
            observacoes: String(b.observacoes || '').trim() || null,
            voluntarios
        };

        if (!DATA.test(dados.data || '')) return res.status(400).json({ erro: 'Informe a data da escala.' });
        if (!HORA.test(dados.horario || '')) return res.status(400).json({ erro: 'Informe o horário de chegada da escala.' });
        if (!Number.isInteger(dados.id_funcao)) return res.status(400).json({ erro: 'Selecione a função.' });
        if (!Number.isInteger(dados.qtd_voluntarios) || dados.qtd_voluntarios < 1) return res.status(400).json({ erro: 'Informe a quantidade de voluntários.' });
        if (!voluntarios.length) return res.status(400).json({ erro: 'Selecione pelo menos um voluntário.' });
        if (voluntarios.length > dados.qtd_voluntarios) return res.status(400).json({ erro: `Selecione no máximo ${dados.qtd_voluntarios} voluntário(s).` });

        if (!dados.id_evento) {
            const ev = dados.evento || {};
            if (!String(ev.nome || '').trim()) return res.status(400).json({ erro: 'Selecione um evento do dia ou informe o nome do novo evento.' });
            if (!HORA.test(ev.hora_inicio || '') || !HORA.test(ev.hora_fim || '') || ev.hora_fim <= ev.hora_inicio) {
                return res.status(400).json({ erro: 'O horário de término deve ser depois do horário de início.' });
            }
            if (!TIPOS.includes(ev.tipo_evento)) return res.status(400).json({ erro: 'Selecione o tipo de culto / evento.' });
            dados.evento = { ...ev, nome: String(ev.nome).trim() };
        }

        // Só voluntários elegíveis (pessoa ativa e apta, ficha ativa) que atuam na função
        const inelegiveis = await Escalas.voluntariosInelegiveis(dados.id_funcao, voluntarios);
        if (inelegiveis.length) {
            return res.status(400).json({ erro: 'Há voluntário(s) que não estão ativos e aptos para esta função. Atualize a lista e tente de novo.' });
        }

        res.status(201).json(await Escalas.criar(dados));
    } catch (error) {
        console.error('Erro ao cadastrar escala', error);
        if (error.code === '23503') return res.status(400).json({ erro: 'Evento, função ou voluntário inexistente.' });
        responderErro(res, error);
    }
}

exports.confirmarParticipante = async (req, res) => {
    try {
        const idEscala = Number(req.params.id);
        const idVoluntario = Number(req.params.idVoluntario);
        if (!Number.isInteger(idEscala) || !Number.isInteger(idVoluntario)) return res.status(400).json({ erro: 'Escala inválida.' });

        const participante = await Escalas.confirmarParticipante(idEscala, idVoluntario, Boolean(req.body.confirmado));
        if (!participante) return res.status(404).json({ erro: 'Voluntário não está nesta escala.' });
        res.json(participante);
    } catch (error) {
        console.error('Erro ao confirmar voluntário', error);
        responderErro(res, error);
    }
}
