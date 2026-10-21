const Participantes = require('../models/participantesModel');
const { responderErro } = require('../config/erros');

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const ESTADOS_CIVIS = ['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União estável', 'Outro'];
// Texto limpo; tamanho excessivo não é cortado em silêncio: o banco recusa e
// responderErro devolve 400 "Um dos campos passou do tamanho permitido".
const texto = valor => (typeof valor === 'string' && valor.trim() ? valor.trim() : null);
const data = valor => (DATA.test(valor || '') ? valor : null);
const idValido = valor => Number.isInteger(Number(valor)) && Number(valor) > 0;

exports.getParticipantes = async (req, res) => {
    try {
        const [resumo, participantes] = await Promise.all([Participantes.resumo(), Participantes.listar()]);
        // O perfil de acesso de cada pessoa só para quem gerencia usuários
        const veLogins = req.usuario.perfil === 'ADMINISTRADOR' || Boolean(req.usuario.permissoes?.usuarios);
        if (!veLogins) participantes.forEach(p => { p.perfil = null; p.id_usuario = null; });
        res.json({ resumo, participantes });
    } catch (error) {
        console.error('Erro ao carregar participantes', error);
        responderErro(res, error);
    }
}

// Cadastro de pessoa: SEMPRE como visitante.
// Campos como "tipo", "apto_voluntario", "id_funcao" ou "perfil" enviados
// pelo navegador são ignorados — classificar é tarefa do administrador.
exports.novoParticipante = async (req, res) => {
    try {
        const b = req.body;
        const nome = texto(b.nome);
        if (!nome) return res.status(400).json({ erro: 'Informe o nome completo.' });

        const email = texto(b.email);
        if (email && !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ erro: 'Informe um e-mail válido.' });

        const dataNascimento = data(b.data_nascimento);
        if (b.data_nascimento && !dataNascimento) return res.status(400).json({ erro: 'Data de nascimento inválida.' });
        if (dataNascimento && dataNascimento > new Date().toISOString().slice(0, 10)) {
            return res.status(400).json({ erro: 'A data de nascimento não pode ser no futuro.' });
        }

        const dataVisita = b.data_visita ? data(b.data_visita) : new Date().toISOString().slice(0, 10);
        if (!dataVisita) return res.status(400).json({ erro: 'Data da visita inválida.' });

        // Endereço montado como "Rua, número - Bairro"
        const rua = texto(b.endereco);
        const endereco = rua
            ? `${rua}${texto(b.numero) ? ', ' + texto(b.numero) : ''}${texto(b.bairro) ? ' - ' + texto(b.bairro) : ''}`
            : null;

        // Uma pessoa na base universal (aparece em Participantes e, se for
        // menor de 18 anos, em Crianças); sem login e sem voluntariado
        const pessoa = await Participantes.criarPessoa({
            nome,
            telefone: texto(b.telefone),
            email,
            data_nascimento: dataNascimento,
            estado_civil: ESTADOS_CIVIS.includes(b.estado_civil) ? b.estado_civil : null,
            endereco,
            data_primeira_visita: dataVisita,
            observacoes: texto(b.observacoes)
        });
        res.status(201).json({ ...pessoa, id: pessoa.id_membro, tipo: 'visitante' });
    } catch (error) {
        console.error('Erro ao cadastrar participante', error);
        responderErro(res, error);
    }
}

// Administrador: promove um visitante a membro (a pessoa é a mesma; muda a classificação)
exports.promoverAMembro = async (req, res) => {
    try {
        if (!idValido(req.params.id)) return res.status(400).json({ erro: 'Pessoa inválida.' });
        const b = req.body;
        const dataEntrada = b.data_entrada_igreja ? data(b.data_entrada_igreja) : new Date().toISOString().slice(0, 10);
        const dataBatismo = data(b.data_batismo);
        if (!dataEntrada) return res.status(400).json({ erro: 'Data de entrada na igreja inválida.' });
        if (b.data_batismo && !dataBatismo) return res.status(400).json({ erro: 'Data do batismo inválida.' });

        const resultado = await Participantes.promoverAMembro(Number(req.params.id), {
            data_entrada_igreja: dataEntrada,
            informacoes_batismo: dataBatismo ? `Batizado(a) nas águas em ${dataBatismo.split('-').reverse().join('/')}` : null,
            participa_celula: typeof b.participa_celula === 'boolean' ? b.participa_celula : null
        });
        if (!resultado) return res.status(404).json({ erro: 'Pessoa não encontrada.' });
        if (resultado.jaMembro) return res.status(409).json({ erro: 'Esta pessoa já é membro.' });
        res.status(201).json({ ...resultado.membro, tipo: 'membro' });
    } catch (error) {
        console.error('Erro ao promover visitante', error);
        responderErro(res, error);
    }
}

// Administrador: altera status (ativo) e elegibilidade ao voluntariado (apto) de um membro
exports.atualizarMembro = async (req, res) => {
    try {
        if (!idValido(req.params.id)) return res.status(400).json({ erro: 'Membro inválido.' });
        const b = req.body;
        const ativo = typeof b.ativo === 'boolean' ? b.ativo : null;
        const apto = typeof b.apto_voluntario === 'boolean' ? b.apto_voluntario : null;
        if (ativo === null && apto === null) return res.status(400).json({ erro: 'Informe o que deseja alterar.' });

        const membro = await Participantes.buscarMembro(Number(req.params.id));
        if (!membro) return res.status(404).json({ erro: 'Pessoa não encontrada.' });

        // Regras de consistência com o voluntariado
        if (apto === true && membro.classificacao !== 'membro') {
            return res.status(400).json({ erro: 'Só membros podem ser marcados como aptos ao voluntariado. Torne a pessoa membro primeiro.' });
        }
        const ficaAtivo = ativo ?? membro.ativo;
        if (apto === true && !ficaAtivo) {
            return res.status(400).json({ erro: 'Só membros ativos podem ser marcados como aptos ao voluntariado.' });
        }
        if (membro.voluntario_ativo && (apto === false || ativo === false)) {
            return res.status(409).json({ erro: 'Este membro é voluntário ativo. Inative-o primeiro na página Voluntários.' });
        }

        // Membro inativado deixa de ser apto
        const atualizado = await Participantes.atualizarClassificacao(membro.id_membro, {
            ativo,
            apto_voluntario: ativo === false ? false : apto
        });
        res.json(atualizado);
    } catch (error) {
        console.error('Erro ao atualizar membro', error);
        responderErro(res, error);
    }
}
