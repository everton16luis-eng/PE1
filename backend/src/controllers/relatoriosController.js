const Relatorios = require('../models/relatoriosModel');
const { responderErro } = require('../config/erros');

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const FORMATOS = ['pdf', 'excel', 'csv'];
const PERFIS = ['ADMINISTRADOR', 'GESTOR', 'SECRETARIA', 'FINANCEIRO', 'VOLUNTARIO', 'VISUALIZACAO'];

// Só aceita filtros conhecidos, com valores no formato esperado
function lerFiltros(q) {
    const opcao = (valor, permitidos) => (permitidos.includes(valor) ? valor : null);
    const filtros = {
        inicio: DATA.test(q.inicio || '') ? q.inicio : null,
        fim: DATA.test(q.fim || '') ? q.fim : null,
        tipo: opcao(q.tipo, ['membros', 'visitantes']),
        status: opcao(q.status, ['ativos', 'inativos', 'pendentes', 'confirmadas', 'recusadas', 'ativas', 'inativas']),
        vagas: opcao(q.vagas, ['com_vagas', 'lotadas']),
        perfil: opcao(q.perfil, PERFIS),
        id_funcao: Number.isInteger(Number(q.id_funcao)) && Number(q.id_funcao) > 0 ? Number(q.id_funcao) : null,
        id_turma: Number.isInteger(Number(q.id_turma)) && Number(q.id_turma) > 0 ? Number(q.id_turma) : null
    };
    return Object.fromEntries(Object.entries(filtros).filter(([, v]) => v !== null));
}

function podeVerUsuarios(usuario) {
    return usuario.perfil === 'ADMINISTRADOR' || usuario.permissoes?.usuarios;
}

exports.getResumo = async (req, res) => {
    try {
        const [resumo, recentes] = await Promise.all([Relatorios.resumo(), Relatorios.recentes()]);
        res.json({ resumo, recentes });
    } catch (error) {
        console.error('Erro ao carregar resumo de relatórios', error);
        responderErro(res, error);
    }
}

exports.getDados = async (req, res) => {
    try {
        const tipo = req.params.tipo;
        if (!Relatorios.tipos.includes(tipo)) return res.status(404).json({ erro: 'Tipo de relatório inexistente.' });
        if (tipo === 'usuarios' && !podeVerUsuarios(req.usuario)) {
            return res.status(403).json({ erro: 'Você não tem permissão para o relatório de usuários.' });
        }

        const filtros = lerFiltros(req.query);
        if (filtros.inicio && filtros.fim && filtros.inicio > filtros.fim) {
            return res.status(400).json({ erro: 'A data inicial não pode ser maior que a data final.' });
        }

        res.json({ ...await Relatorios.gerar(tipo, filtros), filtros });
    } catch (error) {
        console.error('Erro ao gerar relatório', error);
        responderErro(res, error);
    }
}

exports.registrar = async (req, res) => {
    try {
        const b = req.body;
        if (!Relatorios.tipos.includes(b.tipo) || !FORMATOS.includes(b.formato)) {
            return res.status(400).json({ erro: 'Tipo ou formato de relatório inválido.' });
        }
        const registro = await Relatorios.registrar({
            tipo: b.tipo,
            data_inicial: DATA.test(b.data_inicial || '') ? b.data_inicial : null,
            data_final: DATA.test(b.data_final || '') ? b.data_final : null,
            formato: b.formato,
            filtros: lerFiltros(b.filtros || {}),
            total_registros: Number.isInteger(b.total_registros) ? b.total_registros : null,
            id_usuario: req.usuario.id_usuario
        });
        res.status(201).json(registro);
    } catch (error) {
        console.error('Erro ao registrar relatório', error);
        responderErro(res, error);
    }
}
