// =========================================================
// Arquivos dos relatórios: montagem (PDF, Excel, CSV) e armazenamento.
//
// Os arquivos ficam em arquivos/relatorios/ na raiz do projeto (ou na
// pasta de PASTA_ARQUIVOS no .env) — fora do git e de pastas temporárias,
// como os backups. Cada relatório gerado é um arquivo novo (o nome leva o
// id do registro): nada é sobrescrito. O SHA-256 guardado no banco
// confirma, na hora de entregar, que o arquivo é o mesmo que foi gerado.
// =========================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DocumentoPdf, CORES } = require('./pdf');

const PASTA_ARQUIVOS = path.resolve(process.env.PASTA_ARQUIVOS || path.join(__dirname, '../../../arquivos'));
const SUBPASTA = 'relatorios';

const FORMATOS = {
    pdf: { extensao: 'pdf', tipo: 'application/pdf' },
    excel: { extensao: 'xls', tipo: 'application/vnd.ms-excel; charset=utf-8' },
    csv: { extensao: 'csv', tipo: 'text/csv; charset=utf-8' }
};

const TIPOS_DE_EVENTO = { culto: 'Culto', 'culto-jovens': 'Culto de Jovens', 'culto-infantil': 'Culto Infantil', evento: 'Evento', reuniao: 'Reunião' };
const SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

// ---------- Formatação
const dois = n => String(n).padStart(2, '0');

function dataBr(valor) {
    if (!valor) return '';
    if (valor instanceof Date) return `${dois(valor.getDate())}/${dois(valor.getMonth() + 1)}/${valor.getFullYear()}`;
    const [ano, mes, dia] = String(valor).slice(0, 10).split('-');
    return dia ? `${dia}/${mes}/${ano}` : String(valor);
}

function dataHoraBr(valor) {
    if (!valor) return '';
    if (valor instanceof Date) return `${dataBr(valor)} ${dois(valor.getHours())}:${dois(valor.getMinutes())}`;
    const [data, hora] = String(valor).split('T');
    return `${dataBr(data)}${hora ? ' ' + hora.slice(0, 5) : ''}`;
}

function dataComSemana(valor) {
    const [ano, mes, dia] = String(valor).slice(0, 10).split('-').map(Number);
    return `${SEMANA[new Date(ano, mes - 1, dia).getDay()]}, ${dataBr(valor)}`;
}

// Valor de célula dos relatórios em tabela
function valorCelula(valor) {
    if (valor == null) return '';
    if (valor instanceof Date) return dataBr(valor);
    if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(String(valor))) return dataBr(valor);
    return String(valor);
}

const escaparHtml = valor => String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Trecho seguro para nome de arquivo: "Culto de Domingo" → "culto-de-domingo"
const slug = texto => String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'relatorio';

const carimbo = data => `${data.getFullYear()}${dois(data.getMonth() + 1)}${dois(data.getDate())}-${dois(data.getHours())}${dois(data.getMinutes())}`;

function periodoTexto(inicio, fim) {
    if (!inicio && !fim) return 'Período: todos os registros';
    return `Período: ${inicio ? dataBr(inicio) : 'início'} até ${fim ? dataBr(fim) : 'hoje'}`;
}

// ---------- Relatórios em tabela (Participantes, Escalas, ...)
// relatorio = { tipo, titulo, colunas: [{ chave, titulo }], linhas: [...] }
// meta = { nomeIgreja, geradoEm, usuario, inicio, fim, opcoes }
function montarTabela(relatorio, formato, meta) {
    const opcoes = meta.opcoes || {};
    const cabecalho = relatorio.colunas.map(c => c.titulo);
    const linhas = relatorio.linhas.map(l => relatorio.colunas.map(c => valorCelula(l[c.chave])));
    const titulo = `Relatório de ${relatorio.titulo}`;

    if (formato === 'csv') {
        // ";" e BOM para o Excel em português abrir com acentos e colunas certas
        const csv = [cabecalho, ...linhas].map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
        return Buffer.from('﻿' + csv, 'utf8');
    }

    if (formato === 'excel') {
        const tabela = `<table border="1">
            <thead><tr>${cabecalho.map(c => `<th>${escaparHtml(c)}</th>`).join('')}</tr></thead>
            <tbody>${linhas.map(l => `<tr>${l.map(v => `<td>${escaparHtml(v)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>`;
        const html = `<html><head><meta charset="UTF-8"><title>${escaparHtml(titulo)}</title></head><body>
            ${opcoes.cabecalho ? `<h2>${escaparHtml(meta.nomeIgreja)} — ${escaparHtml(titulo)}</h2>` : ''}
            ${opcoes.periodo ? `<p>${escaparHtml(periodoTexto(meta.inicio, meta.fim))}</p>` : ''}
            ${opcoes.resumo ? `<p>Total de registros: ${linhas.length}</p>` : ''}
            ${opcoes.observacoes ? `<p>${escaparHtml(opcoes.observacoes)}</p>` : ''}
            ${tabela}
            ${opcoes.dataGeracao ? `<p>Gerado em ${escaparHtml(dataHoraBr(meta.geradoEm))} por ${escaparHtml(meta.usuario)}</p>` : ''}
            </body></html>`;
        return Buffer.from('﻿' + html, 'utf8');
    }

    const pdf = new DocumentoPdf({ titulo, autor: meta.usuario, paisagem: cabecalho.length > 5, rodape: `${meta.nomeIgreja} — ${titulo}` });
    if (opcoes.cabecalho) pdf.cabecalho(meta.nomeIgreja);
    pdf.titulo(titulo);
    if (opcoes.periodo) pdf.paragrafo(periodoTexto(meta.inicio, meta.fim), { tamanho: 9, corTexto: CORES.suave });
    if (opcoes.dataGeracao) pdf.paragrafo(`Gerado em ${dataHoraBr(meta.geradoEm)} por ${meta.usuario}`, { tamanho: 9, corTexto: CORES.suave });
    if (opcoes.resumo) pdf.numeros([[linhas.length, 'Registros'], [cabecalho.length, 'Colunas']], 4);
    if (opcoes.observacoes) pdf.paragrafo(opcoes.observacoes, { tamanho: 9 });
    pdf.tabela(relatorio.colunas.map(c => ({ titulo: c.titulo })), linhas, { vazio: 'Nenhum registro com esses filtros.' });
    return pdf.gerar();
}

// ---------- Relatório completo de um evento (sempre PDF)
// detalhes = resultado de eventosModel.detalhar (evento, funcoes, resumo)
const ROTULO_SITUACAO = { confirmado: 'Confirmado', recusado: 'Recusou', pendente: 'Pendente de resposta', indefinido: 'Situação não reconhecida' };

function montarRelatorioEvento({ evento, funcoes, resumo }, meta) {
    const titulo = `Relatório do evento — ${evento.nome}`;
    const pdf = new DocumentoPdf({ titulo, autor: meta.usuario, rodape: `${meta.nomeIgreja} — Relatório do evento` });
    const naoInformado = 'Não informado';
    const situacaoEvento = evento.realizado ? 'Realizado' : evento.em_andamento ? 'Em andamento' : 'Próximo (ainda não realizado)';

    pdf.cabecalho(meta.nomeIgreja);
    pdf.paragrafo('RELATÓRIO DO EVENTO', { tamanho: 9, negrito: true, corTexto: CORES.destaque, depois: 0 });
    pdf.titulo(evento.nome);
    pdf.paragrafo(`${dataComSemana(evento.data_evento)}${evento.hora_inicio ? ` • ${evento.hora_inicio}${evento.hora_fim ? ' às ' + evento.hora_fim : ''}` : ''}`, { tamanho: 11 });
    pdf.paragrafo(`Documento gerado em ${dataHoraBr(meta.geradoEm)} por ${meta.usuario}. Reflete os dados registrados no sistema nesse momento.`,
        { tamanho: 9, corTexto: CORES.suave });

    pdf.secao('Informações gerais');
    pdf.campos([
        ['Nome do evento', evento.nome],
        ['Data de realização', dataComSemana(evento.data_evento)],
        ['Horário de início', evento.hora_inicio || naoInformado],
        ['Horário de término', evento.hora_fim || naoInformado],
        ['Tipo / categoria', TIPOS_DE_EVENTO[evento.tipo_evento] || evento.tipo_evento || naoInformado],
        ['Situação', situacaoEvento],
        ['Registro criado em', evento.criado_em ? dataHoraBr(evento.criado_em) : naoInformado],
        ['Funções vinculadas', funcoes.length ? funcoes.map(f => f.funcao || 'Função não informada').join(', ') : 'Nenhuma']
    ]);

    pdf.secao('Resumo quantitativo');
    pdf.numeros([
        [resumo.funcoes, 'Funções previstas'],
        [resumo.vagas, 'Vagas previstas'],
        [resumo.atribuicoes, 'Voluntários atribuídos'],
        [resumo.pessoas, 'Pessoas distintas'],
        [resumo.confirmados, 'Confirmações'],
        [resumo.recusados, 'Recusas'],
        [resumo.pendentes, 'Respostas pendentes'],
        [resumo.vagas_nao_preenchidas, 'Vagas não preenchidas'],
        [resumo.funcoes_completas, 'Funções completas'],
        [resumo.funcoes_com_pendencias, 'Funções com pendências'],
        ...(resumo.indefinidos ? [[resumo.indefinidos, 'Situação não reconhecida']] : [])
    ], 4);
    pdf.paragrafo('Vagas = voluntários previstos em cada função. Quem recusou continua listado, mas não ocupa vaga; '
        + 'vaga não preenchida = vaga sem voluntário confirmado ou aguardando resposta.', { tamanho: 9, corTexto: CORES.suave });

    pdf.secao('Situação por função');
    pdf.tabela(
        [{ titulo: 'Função', peso: 2.4 }, { titulo: 'Chegada' }, { titulo: 'Vagas' }, { titulo: 'Atribuídos' }, { titulo: 'Confirm.' },
         { titulo: 'Recusas' }, { titulo: 'Pendentes' }, { titulo: 'Não preench.' }, { titulo: 'Situação', peso: 1.6 }],
        funcoes.map(f => [f.funcao || 'Função não informada', f.horario || '—', f.vagas, f.participantes.length, f.confirmados,
            f.recusados, f.pendentes, f.vagas_nao_preenchidas, f.situacao === 'completa' ? 'Completa' : 'Com pendências']),
        { vazio: 'Nenhuma função (escala) vinculada a este evento.' }
    );

    pdf.secao('Voluntários por função');
    if (!funcoes.length) pdf.paragrafo('Nenhuma função (escala) vinculada a este evento.', { tamanho: 9, corTexto: CORES.suave });
    for (const f of funcoes) {
        pdf.espaco(60);
        pdf.paragrafo(`${f.funcao || 'Função não informada'} — chegada ${f.horario || '—'} — ${f.vagas} vaga(s)`, { tamanho: 10.5, negrito: true, depois: 1 });
        if (f.observacoes) pdf.paragrafo(`Observações: ${f.observacoes}`, { tamanho: 9, corTexto: CORES.suave, depois: 2 });
        pdf.tabela(
            [{ titulo: 'Voluntário', peso: 2.2 }, { titulo: 'Situação', peso: 1.4 }, { titulo: 'Resposta em', peso: 1.1 }, { titulo: 'Observação', peso: 2.3 }],
            f.participantes.map(p => [p.nome, ROTULO_SITUACAO[p.situacao], p.situacao !== 'pendente' ? dataHoraBr(p.respondido_em) || '—' : '—',
                p.recusado && p.motivo_recusa ? `Motivo da recusa: ${p.motivo_recusa}` : '']),
            { vazio: 'Nenhum voluntário atribuído.' }
        );
        if (f.vagas_nao_preenchidas) pdf.paragrafo(`${f.vagas_nao_preenchidas} vaga(s) não preenchida(s) nesta função.`, { tamanho: 9, negrito: true, corTexto: '#9b1c1c' });
    }

    // Separação pelas respostas (uma linha por atribuição: voluntário + função)
    const porSituacao = situacao => funcoes.flatMap(f => f.participantes.filter(p => p.situacao === situacao)
        .map(p => [p.nome, f.funcao || 'Função não informada', situacao === 'recusado' ? (p.motivo_recusa || 'Sem motivo informado') : (dataHoraBr(p.respondido_em) || '—')]));
    const grupos = [
        ['confirmado', `Confirmados (${resumo.confirmados})`, 'Confirmado em'],
        ['recusado', `Recusaram (${resumo.recusados})`, 'Motivo'],
        ['pendente', `Pendentes de resposta (${resumo.pendentes})`, 'Resposta'],
        ...(resumo.indefinidos ? [['indefinido', `Situação não reconhecida (${resumo.indefinidos})`, 'Registro']] : [])
    ];
    for (const [situacao, tituloGrupo, terceira] of grupos) {
        pdf.secao(tituloGrupo);
        pdf.tabela([{ titulo: 'Voluntário', peso: 2 }, { titulo: 'Função', peso: 2 }, { titulo: terceira, peso: 2 }],
            porSituacao(situacao), { vazio: 'Ninguém nesta situação.' });
    }
    if (resumo.vagas_nao_preenchidas) {
        pdf.secao(`Vagas não preenchidas (${resumo.vagas_nao_preenchidas})`);
        pdf.tabela([{ titulo: 'Função', peso: 3 }, { titulo: 'Vagas previstas' }, { titulo: 'Não preenchidas' }],
            funcoes.filter(f => f.vagas_nao_preenchidas).map(f => [f.funcao || 'Função não informada', f.vagas, f.vagas_nao_preenchidas]));
    }
    return pdf.gerar();
}

// ---------- Relatório de turmas, separado por evento
// dados = relatoriosModel.gerar('turmas'): linhas (uma por criança atendida) + eventos agrupados.
// CSV: as linhas (evento e data em cada uma). PDF e Excel: uma seção por evento.
function montarRelatorioTurmas(dados, formato, meta) {
    if (formato === 'csv') return montarTabela(dados, formato, meta);
    const opcoes = meta.opcoes || {};
    const titulo = 'Relatório de Turmas';
    const horario = e => (e.hora_inicio ? ` • ${e.hora_inicio}${e.hora_fim ? ' às ' + e.hora_fim : ''}` : '');
    const totais = dados.eventos.reduce((t, e) => {
        for (const chave of Object.keys(e.resumo)) t[chave] = (t[chave] || 0) + e.resumo[chave];
        return t;
    }, {});
    const numerosDoEvento = r => [[r.turmas, 'Turmas atendidas'], [r.criancas, 'Crianças recebidas'], [r.entradas, 'Entradas'],
        [r.conferidas, 'Saídas conferidas'], [r.automaticas, 'Saídas automáticas'], [r.administrativas, 'Saídas pela administração'],
        [r.presentes, 'Ainda presentes'], [r.alertas, 'Alertas']];
    const colunas = ['Criança', 'Idade', 'Entrada', 'Deixada por', 'Entrada por', 'Saída', 'Situação da saída', 'Entregue a', 'Saída por'];
    const linhaCrianca = a => [a.crianca, a.idade ?? '', a.entrada || '', a.deixada_por || '—', a.entrada_por || '', a.saida || '—', a.situacao, a.retirada || '—', a.saida_por || (a.tipo_saida === 'automatica' ? 'sistema' : '—')];
    const textoAlerta = al => `Alerta${al.prioritario ? ' PRIORITÁRIO' : ''}: ${al.motivo} — ${al.status === 'tratado' ? `tratado por ${al.tratado_por || '—'}: ${al.observacao || ''}` : 'pendente de tratamento'}`;

    if (formato === 'excel') {
        const tabela = s => `<table border="1"><thead><tr>${colunas.map(c => `<th>${escaparHtml(c)}</th>`).join('')}</tr></thead>
            <tbody>${s.atendimentos.map(a => `<tr>${linhaCrianca(a).map(v => `<td>${escaparHtml(v)}</td>`).join('')}</tr>`).join('')
                || `<tr><td colspan="${colunas.length}">Nenhuma criança recebida.</td></tr>`}</tbody></table>`;
        const html = `<html><head><meta charset="UTF-8"><title>${escaparHtml(titulo)}</title></head><body>
            ${opcoes.cabecalho ? `<h2>${escaparHtml(meta.nomeIgreja)} — ${escaparHtml(titulo)}</h2>` : ''}
            ${opcoes.periodo ? `<p>${escaparHtml(periodoTexto(meta.inicio, meta.fim))}</p>` : ''}
            ${opcoes.resumo ? `<p>${dados.eventos.length} evento(s) • ${totais.turmas || 0} turma(s) atendida(s) • ${totais.entradas || 0} entrada(s) • ${totais.automaticas || 0} saída(s) automática(s) • ${totais.alertas || 0} alerta(s)</p>` : ''}
            ${opcoes.observacoes ? `<p>${escaparHtml(opcoes.observacoes)}</p>` : ''}
            ${dados.eventos.map(e => `
                <h3>${escaparHtml(e.evento)} — ${escaparHtml(dataComSemana(e.data))}${escaparHtml(horario(e))}</h3>
                <p>${numerosDoEvento(e.resumo).map(([n, r]) => `${escaparHtml(r)}: ${n}`).join(' • ')}</p>
                ${e.sessoes.map(s => `
                    <h4>${escaparHtml(s.turma)} — aberta ${escaparHtml(s.aberta_as)} por ${escaparHtml(s.aberta_por || '—')}; ${escaparHtml(s.encerramento)}</h4>
                    ${s.motivo_encerramento ? `<p>Motivo do encerramento: ${escaparHtml(s.motivo_encerramento)}</p>` : ''}
                    ${s.alerta ? `<p><b>${escaparHtml(textoAlerta(s.alerta))}</b></p>` : ''}
                    ${tabela(s)}`).join('')}`).join('<br>') || '<p>Nenhum atendimento de turma com esses filtros.</p>'}
            ${opcoes.dataGeracao ? `<p>Gerado em ${escaparHtml(dataHoraBr(meta.geradoEm))} por ${escaparHtml(meta.usuario)}</p>` : ''}
            </body></html>`;
        return Buffer.from('﻿' + html, 'utf8');
    }

    const pdf = new DocumentoPdf({ titulo, autor: meta.usuario, paisagem: true, rodape: `${meta.nomeIgreja} — ${titulo}` });
    if (opcoes.cabecalho) pdf.cabecalho(meta.nomeIgreja);
    pdf.titulo(titulo);
    if (opcoes.periodo) pdf.paragrafo(periodoTexto(meta.inicio, meta.fim), { tamanho: 9, corTexto: CORES.suave });
    if (opcoes.dataGeracao) pdf.paragrafo(`Gerado em ${dataHoraBr(meta.geradoEm)} por ${meta.usuario}`, { tamanho: 9, corTexto: CORES.suave });
    if (opcoes.resumo) {
        pdf.numeros([[dados.eventos.length, 'Eventos'], [totais.turmas || 0, 'Turmas atendidas'], [totais.entradas || 0, 'Entradas'],
            [totais.conferidas || 0, 'Saídas conferidas'], [totais.automaticas || 0, 'Saídas automáticas'], [totais.alertas || 0, 'Alertas']], 6);
    }
    if (opcoes.observacoes) pdf.paragrafo(opcoes.observacoes, { tamanho: 9 });
    pdf.paragrafo('Saída conferida = o voluntário validou o código de retirada da etiqueta do responsável. Saída automática = a turma ficou aberta e o sistema '
        + 'encerrou; não é entrega conferida.', { tamanho: 8.5, corTexto: CORES.suave });
    if (!dados.eventos.length) pdf.paragrafo('Nenhum atendimento de turma com esses filtros.', { tamanho: 10 });

    for (const e of dados.eventos) {
        // Título, números e o começo da primeira turma ficam na mesma página
        pdf.espaco(230);
        pdf.secao(`${e.evento} — ${dataComSemana(e.data)}${horario(e)}`);
        pdf.numeros(numerosDoEvento(e.resumo), 4);
        for (const s of e.sessoes) {
            pdf.espaco(70);
            pdf.paragrafo(`${s.turma} — aberta ${s.aberta_as} por ${s.aberta_por || '—'}; ${s.encerramento}`, { tamanho: 10.5, negrito: true, depois: 1 });
            if (s.motivo_encerramento) pdf.paragrafo(`Motivo do encerramento: ${s.motivo_encerramento}`, { tamanho: 9, corTexto: CORES.suave, depois: 1 });
            if (s.alerta) pdf.paragrafo(textoAlerta(s.alerta), { tamanho: 9, negrito: true, corTexto: '#9b1c1c', depois: 2 });
            pdf.tabela(
                [{ titulo: 'Criança', peso: 2.1 }, { titulo: 'Idade', peso: 0.5 }, { titulo: 'Entrada', peso: 0.7 }, { titulo: 'Deixada por', peso: 1.6 }, { titulo: 'Entrada por', peso: 1.3 },
                 { titulo: 'Saída', peso: 0.7 }, { titulo: 'Situação da saída', peso: 2.3 }, { titulo: 'Entregue a', peso: 1.8 }, { titulo: 'Saída por', peso: 1.3 }],
                s.atendimentos.map(linhaCrianca),
                { vazio: 'Nenhuma criança recebida nesta turma.' }
            );
        }
    }
    return pdf.gerar();
}

// ---------- Armazenamento
// Caminho relativo à pasta de arquivos → caminho absoluto (sem sair da pasta)
function caminhoSeguro(relativo) {
    const absoluto = path.resolve(PASTA_ARQUIVOS, String(relativo || ''));
    if (!relativo || !absoluto.startsWith(PASTA_ARQUIVOS + path.sep)) return null;
    return absoluto;
}

// Grava um arquivo novo (nunca sobrescreve) e devolve a referência e o hash
function salvar(nomeArquivo, conteudo) {
    const relativo = path.posix.join(SUBPASTA, nomeArquivo);
    const absoluto = caminhoSeguro(relativo);
    fs.mkdirSync(path.dirname(absoluto), { recursive: true });
    fs.writeFileSync(absoluto, conteudo, { flag: 'wx' });
    return { arquivo: relativo, tamanho: conteudo.length, hash: crypto.createHash('sha256').update(conteudo).digest('hex') };
}

// Lê o arquivo guardado; { erro: 'indisponivel' | 'corrompido' } quando não dá para entregar
function ler(relativo, hashEsperado) {
    const absoluto = caminhoSeguro(relativo);
    if (!absoluto || !fs.existsSync(absoluto)) return { erro: 'indisponivel' };
    const conteudo = fs.readFileSync(absoluto);
    if (hashEsperado && crypto.createHash('sha256').update(conteudo).digest('hex') !== hashEsperado) return { erro: 'corrompido' };
    return { conteudo };
}

function remover(relativo) {
    const absoluto = caminhoSeguro(relativo);
    if (absoluto) fs.rmSync(absoluto, { force: true });
}

module.exports = { FORMATOS, montarTabela, montarRelatorioEvento, montarRelatorioTurmas, salvar, ler, remover, slug, carimbo, dataBr };
