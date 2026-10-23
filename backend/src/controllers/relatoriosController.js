const pool = require('../config/db');
const Relatorios = require('../models/relatoriosModel');
const Eventos = require('../models/eventosModel');
const Configuracoes = require('../models/configuracoesModel');
const Documentos = require('../config/documentos');
const { responderErro } = require('../config/erros');

const DATA = /^\d{4}-\d{2}-\d{2}$/;
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
        encerramento: opcao(q.encerramento, ['aberta', 'manual', 'automatico', 'administrativo']),
        id_funcao: Number.isInteger(Number(q.id_funcao)) && Number(q.id_funcao) > 0 ? Number(q.id_funcao) : null,
        id_turma: Number.isInteger(Number(q.id_turma)) && Number(q.id_turma) > 0 ? Number(q.id_turma) : null
    };
    return Object.fromEntries(Object.entries(filtros).filter(([, v]) => v !== null));
}

function podeVerUsuarios(usuario) {
    return usuario.perfil === 'ADMINISTRADOR' || usuario.permissoes?.usuarios;
}

// Turmas traz dados das crianças (entrada, saída e quem buscou): além de Relatórios, exige a área Crianças
function podeVerTurmas(usuario) {
    return usuario.perfil === 'ADMINISTRADOR' || usuario.permissoes?.criancas;
}

// Tipo que o login não pode ver (ou null): mesma regra na pré-visualização, na geração e no download
function bloqueio(tipo, usuario) {
    if (tipo === 'usuarios' && !podeVerUsuarios(usuario)) return 'Você não tem permissão para o relatório de usuários.';
    if (tipo === 'turmas' && !podeVerTurmas(usuario)) return 'O relatório de turmas exige também a área Crianças.';
    return null;
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
        const proibido = bloqueio(tipo, req.usuario);
        if (proibido) return res.status(403).json({ erro: proibido });

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

const idValido = valor => Number.isInteger(Number(valor)) && Number(valor) > 0;
const texto = (valor, limite) => (typeof valor === 'string' ? valor.trim().slice(0, limite) : '');

// Eventos que podem ter relatório (futuros e realizados)
exports.getEventos = async (req, res) => {
    try {
        res.json(await Relatorios.eventosParaRelatorio());
    } catch (error) {
        console.error('Erro ao carregar eventos para relatório', error);
        responderErro(res, error);
    }
}

// Dados do relatório de um evento (pré-visualização antes de gerar o PDF)
exports.getRelatorioEvento = async (req, res) => {
    try {
        if (!idValido(req.params.id)) return res.status(400).json({ erro: 'Evento inválido.' });
        const detalhes = await Eventos.detalhar(Number(req.params.id));
        if (!detalhes) return res.status(404).json({ erro: 'Evento não encontrado.' });
        res.json(detalhes);
    } catch (error) {
        console.error('Erro ao carregar relatório do evento', error);
        responderErro(res, error);
    }
}

// Gera o relatório NO SERVIDOR a partir dos dados do banco, grava o arquivo e o
// registro do histórico (tudo ou nada) e devolve o registro.
//   { tipo: 'evento', id_evento }                          → PDF completo do evento
//   { tipo: 'participantes' | ..., formato, filtros, opcoes } → relatório em tabela
exports.gerar = async (req, res) => {
    let arquivoGravado = null;
    const cliente = await pool.connect();
    try {
        const b = req.body || {};
        const porEvento = b.tipo === 'evento';
        const formato = porEvento ? 'pdf' : b.formato;
        if (!porEvento && !Relatorios.tipos.includes(b.tipo)) return res.status(404).json({ erro: 'Tipo de relatório inexistente.' });
        if (!Documentos.FORMATOS[formato]) return res.status(400).json({ erro: 'Formato de relatório inválido.' });
        const proibido = bloqueio(b.tipo, req.usuario);
        if (proibido) return res.status(403).json({ erro: proibido });

        const configuracao = await Configuracoes.buscar().catch(() => null);
        const meta = { nomeIgreja: configuracao?.nome_igreja || 'Igreja Novo Caminho', usuario: req.usuario.nome };

        // Dados reais do momento da geração
        let dados;
        let registro;
        if (porEvento) {
            if (!idValido(b.id_evento)) return res.status(400).json({ erro: 'Selecione o evento.' });
            dados = await Eventos.detalhar(Number(b.id_evento));
            if (!dados) return res.status(404).json({ erro: 'Evento não encontrado.' });
            registro = {
                tipo: 'evento', formato, id_evento: dados.evento.id_evento,
                titulo: `Relatório do evento — ${dados.evento.nome} (${Documentos.dataBr(dados.evento.data_evento)}${dados.evento.hora_inicio ? ' ' + dados.evento.hora_inicio : ''})`,
                data_inicial: dados.evento.data_evento, data_final: dados.evento.data_evento,
                filtros: {}, total_registros: dados.resumo.atribuicoes
            };
        } else {
            const filtros = lerFiltros(b.filtros || {});
            if (filtros.inicio && filtros.fim && filtros.inicio > filtros.fim) {
                return res.status(400).json({ erro: 'A data inicial não pode ser maior que a data final.' });
            }
            dados = await Relatorios.gerar(b.tipo, filtros);
            const { inicio, fim, ...outros } = filtros;
            const o = b.opcoes || {};
            meta.inicio = inicio;
            meta.fim = fim;
            meta.opcoes = {
                cabecalho: o.cabecalho !== false, periodo: o.periodo !== false, resumo: o.resumo !== false,
                dataGeracao: o.dataGeracao !== false, observacoes: texto(o.observacoes, 1000)
            };
            registro = {
                tipo: b.tipo, formato, id_evento: null, titulo: `Relatório de ${dados.titulo}`,
                data_inicial: inicio || null, data_final: fim || null, filtros: outros,
                // Turmas: uma linha por criança atendida (as sessões sem criança não contam)
                total_registros: b.tipo === 'turmas' ? dados.linhas.filter(l => l.id_atendimento).length : dados.linhas.length
            };
        }

        await cliente.query('BEGIN');
        const salvo = await Relatorios.registrar({ ...registro, id_usuario: req.usuario.id_usuario }, cliente);
        meta.geradoEm = salvo.gerado_em;

        const conteudo = porEvento ? Documentos.montarRelatorioEvento(dados, meta)
            : b.tipo === 'turmas' ? Documentos.montarRelatorioTurmas(dados, formato, meta)
            : Documentos.montarTabela(dados, formato, meta);
        const base = porEvento ? `relatorio-evento-${Documentos.slug(dados.evento.nome)}-${dados.evento.data_evento}` : `relatorio-${b.tipo}`;
        const extensao = Documentos.FORMATOS[formato].extensao;
        const nomeArquivo = `${base}-gerado-${Documentos.carimbo(new Date(salvo.gerado_em))}.${extensao}`;
        // O id do registro no nome do arquivo guardado: cada geração tem o seu arquivo
        arquivoGravado = Documentos.salvar(`${salvo.id_relatorio}-${nomeArquivo}`, conteudo);
        await Relatorios.vincularArquivo(salvo.id_relatorio, { ...arquivoGravado, nome_arquivo: nomeArquivo }, cliente);
        await cliente.query('COMMIT');
        arquivoGravado = null;

        res.status(201).json({ ...salvo, nome_arquivo: nomeArquivo, tem_arquivo: true });
    } catch (error) {
        await cliente.query('ROLLBACK').catch(() => {});
        if (arquivoGravado) Documentos.remover(arquivoGravado.arquivo);
        console.error('Erro ao gerar relatório', error);
        responderErro(res, error);
    } finally {
        cliente.release();
    }
}

// Entrega o arquivo guardado de um registro do histórico (sem gerar de novo).
// ?download=1 → baixar; senão, abrir para visualizar.
exports.getArquivo = async (req, res) => {
    try {
        if (!idValido(req.params.id)) return res.status(400).json({ erro: 'Relatório inválido.' });
        const registro = await Relatorios.buscarRegistro(Number(req.params.id));
        if (!registro) return res.status(404).json({ erro: 'Relatório não encontrado.' });
        const proibido = bloqueio(registro.tipo, req.usuario);
        if (proibido) return res.status(403).json({ erro: proibido });
        if (!registro.arquivo) {
            return res.status(404).json({ erro: 'Este relatório foi registrado antes do armazenamento de arquivos e não tem documento salvo.' });
        }

        const { conteudo, erro } = Documentos.ler(registro.arquivo, registro.hash_arquivo);
        if (erro === 'indisponivel') return res.status(404).json({ erro: 'O arquivo deste relatório não foi encontrado no servidor.' });
        if (erro === 'corrompido') return res.status(409).json({ erro: 'O arquivo deste relatório está corrompido (o conteúdo não confere com o registrado).' });

        const nome = registro.nome_arquivo || `relatorio-${registro.id_relatorio}.${Documentos.FORMATOS[registro.formato].extensao}`;
        res.set({
            'Content-Type': Documentos.FORMATOS[registro.formato].tipo,
            'Content-Length': String(conteudo.length),
            'Content-Disposition': `${req.query.download ? 'attachment' : 'inline'}; filename="${nome.replace(/[^\w.-]/g, '_')}"`
        });
        res.send(conteudo);
    } catch (error) {
        console.error('Erro ao entregar arquivo de relatório', error);
        responderErro(res, error);
    }
}
