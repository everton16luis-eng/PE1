const Participantes = require('../models/participantesModel');
const { responderErro } = require('../config/erros');

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const texto = valor => String(valor ?? '').trim() || null;
const data = valor => (DATA.test(valor || '') ? valor : null);

exports.getParticipantes = async (req, res) => {
    try {
        const [resumo, participantes] = await Promise.all([Participantes.resumo(), Participantes.listar()]);
        res.json({ resumo, participantes });
    } catch (error) {
        console.error('Erro ao carregar participantes', error);
        responderErro(res, error);
    }
}

exports.novoParticipante = async (req, res) => {
    try {
        const b = req.body;
        const nome = texto(b.nome);
        if (!nome) return res.status(400).json({ erro: 'Informe o nome completo.' });

        if (b.tipo === 'visitante') {
            const dataVisita = data(b.data_visita);
            if (!dataVisita) return res.status(400).json({ erro: 'Informe a data da visita.' });

            const visitante = await Participantes.criarVisitante({
                nome, telefone: texto(b.telefone), data_visita: dataVisita, observacoes: texto(b.observacoes)
            });
            return res.status(201).json(visitante);
        }

        // Endereço montado como "Rua, número - Bairro"
        const rua = texto(b.endereco);
        const endereco = rua
            ? `${rua}${texto(b.numero) ? ', ' + texto(b.numero) : ''}${texto(b.bairro) ? ' - ' + texto(b.bairro) : ''}`
            : null;
        const dataBatismo = data(b.data_batismo);

        const membro = await Participantes.criarMembro({
            nome_completo: nome,
            data_nascimento: data(b.data_nascimento),
            telefone: texto(b.telefone),
            email: texto(b.email),
            endereco,
            estado_civil: texto(b.estado_civil),
            data_entrada_igreja: data(b.data_entrada_igreja),
            data_batismo: dataBatismo,
            informacoes_batismo: dataBatismo ? `Batizado(a) nas águas em ${dataBatismo.split('-').reverse().join('/')}` : null,
            participa_celula: b.participa_celula === '' || b.participa_celula == null ? null : Boolean(b.participa_celula),
            observacoes: texto(b.observacoes),
            id_funcao: Number.isInteger(Number(b.id_funcao)) && Number(b.id_funcao) > 0 ? Number(b.id_funcao) : null
        });
        res.status(201).json(membro);
    } catch (error) {
        console.error('Erro ao cadastrar participante', error);
        if (error.code === '23503') return res.status(400).json({ erro: 'A função selecionada não existe.' });
        responderErro(res, error);
    }
}
