// =========================================
// RELATÓRIOS
// =========================================

const TIPOS_RELATORIO = {
    participantes: { nome: 'Participantes', icone: 'groups', cor: ['#e7efff', '#2879dc'], descricao: 'Participantes, membros, visitantes e status cadastral', permissao: 'relatorios' },
    voluntarios: { nome: 'Voluntários', icone: 'volunteer_activism', cor: ['#eee7ff', '#7853d5'], descricao: 'Voluntários, funções, disponibilidade e status', permissao: 'relatorios' },
    escalas: { nome: 'Escalas', icone: 'calendar_month', cor: ['#f1eaff', '#7853d5'], descricao: 'Escalas criadas, funções, datas e confirmações', permissao: 'relatorios' },
    presencas: { nome: 'Presenças', icone: 'assignment_turned_in', cor: ['#e5f8ee', '#2ea36b'], descricao: 'Entradas e saídas registradas nas turmas', permissao: 'relatorios' },
    criancas: { nome: 'Crianças', icone: 'escalator_warning', cor: ['#fdeaea', '#c34e4e'], descricao: 'Crianças, responsáveis, turmas e presença', permissao: 'relatorios' },
    funcoes: { nome: 'Funções', icone: 'engineering', cor: ['#fff4df', '#c98a24'], descricao: 'Funções, vagas e voluntários', permissao: 'relatorios' },
    usuarios: { nome: 'Usuários', icone: 'manage_accounts', cor: ['#e8f1ff', '#3975c6'], descricao: 'Usuários, perfis e status', permissao: 'usuarios' }
};

const FORMATOS = { pdf: 'PDF', excel: 'Excel', csv: 'CSV' };

const tiposPermitidos = () => Object.entries(TIPOS_RELATORIO).filter(([, t]) => temPermissao(t.permissao));

function periodoTexto(inicio, fim) {
    if (!inicio && !fim) return 'Período: todos os registros';
    return `Período: ${inicio ? formatarDataSimples(inicio) : 'início'} até ${fim ? formatarDataSimples(fim) : 'hoje'}`;
}

// Busca os dados do relatório na API
async function dadosRelatorio(tipo, filtros) {
    const parametros = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v !== '' && v != null));
    return enviarDados(`relatorios/${tipo}?${parametros}`, 'GET');
}

// Valor de uma célula para exibição/exportação
function valorCelula(valor) {
    if (valor == null) return '';
    if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(String(valor))) return formatarDataSimples(valor);
    return String(valor);
}

// Gera o arquivo/janela no formato escolhido; devolve false se não conseguiu abrir
function exportarRelatorio(relatorio, formato, opcoes) {
    const nomeArquivo = `relatorio-${relatorio.tipo}-${dataDeHoje()}`;
    const cabecalho = relatorio.colunas.map(c => c.titulo);
    const linhas = relatorio.linhas.map(l => relatorio.colunas.map(c => valorCelula(l[c.chave])));

    const baixar = (conteudo, tipoMime, extensao) => {
        const url = URL.createObjectURL(new Blob([conteudo], { type: tipoMime }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `${nomeArquivo}.${extensao}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    if (formato === 'csv') {
        // ";" e BOM para o Excel em português abrir com acentos e colunas certas
        const csv = [cabecalho, ...linhas].map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
        baixar('﻿' + csv, 'text/csv;charset=utf-8', 'csv');
        return true;
    }

    const titulo = `Relatório de ${relatorio.titulo}`;
    const tabela = `
        <table>
            <thead><tr>${cabecalho.map(c => `<th>${escapar(c)}</th>`).join('')}</tr></thead>
            <tbody>${linhas.map(l => `<tr>${l.map(v => `<td>${escapar(v)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>`;

    if (formato === 'excel') {
        const html = `<html><head><meta charset="UTF-8"></head><body>
            ${opcoes.cabecalho ? `<h2>Igreja Novo Caminho — ${escapar(titulo)}</h2>` : ''}
            ${opcoes.periodo ? `<p>${escapar(periodoTexto(opcoes.inicio, opcoes.fim))}</p>` : ''}
            ${tabela}</body></html>`;
        baixar('﻿' + html, 'application/vnd.ms-excel;charset=utf-8', 'xls');
        return true;
    }

    // PDF: abre uma página pronta para "Salvar como PDF" na impressão do navegador
    const janela = window.open('', '_blank');
    if (!janela) {
        alert('Permita pop-ups para gerar o PDF.');
        return false;
    }
    janela.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${escapar(titulo)}</title>
        <style>
            body { font-family: Inter, "Segoe UI", Arial, sans-serif; color: #18243a; margin: 28px; }
            header { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #965b39; padding-bottom: 12px; }
            header img { width: 48px; }
            h1 { font-size: 20px; margin: 18px 0 4px; }
            p { color: #78849a; font-size: 12px; margin: 4px 0; }
            .resumo { display: flex; gap: 12px; margin: 14px 0; }
            .resumo div { background: #f7f8fb; border-radius: 8px; padding: 10px 16px; font-size: 12px; }
            .resumo strong { display: block; font-size: 18px; color: #965b39; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 12px; }
            th { text-align: left; background: #f5f6f9; padding: 7px; border-bottom: 1px solid #ddd; }
            td { padding: 6px 7px; border-bottom: 1px solid #eee; }
            tr { page-break-inside: avoid; }
            footer { margin-top: 18px; text-align: center; font-size: 10px; color: #999; }
        </style></head><body>
        ${opcoes.cabecalho ? `<header><img src="${location.origin}/img/terracota.png" alt=""><div><strong>Igreja Novo Caminho</strong><p>Sistema de Gestão</p></div></header>` : ''}
        <h1>${escapar(titulo)}</h1>
        ${opcoes.periodo ? `<p>${escapar(periodoTexto(opcoes.inicio, opcoes.fim))}</p>` : ''}
        ${opcoes.resumo ? `<div class="resumo"><div><strong>${relatorio.linhas.length}</strong>Registros</div></div>` : ''}
        ${opcoes.observacoes ? `<p>${escapar(opcoes.observacoes)}</p>` : ''}
        ${tabela}
        ${opcoes.dataGeracao ? `<footer>Gerado em ${new Date().toLocaleString('pt-BR')} por ${escapar(usuarioAtual?.nome || '')}</footer>` : ''}
        <script>window.onload = () => window.print();<\/script>
        </body></html>`);
    janela.document.close();
    return true;
}

// Gera, exporta e registra no histórico
async function gerarEExportar(tipo, filtros, formato, opcoes) {
    const relatorio = await dadosRelatorio(tipo, filtros);
    if (!exportarRelatorio(relatorio, formato, { ...opcoes, inicio: filtros.inicio, fim: filtros.fim })) {
        throw new Error('O relatório não foi aberto. Permita pop-ups para este site e tente de novo.');
    }
    const { inicio, fim, ...outros } = filtros;
    await enviarDados('relatorios/historico', 'POST', {
        tipo, formato, data_inicial: inicio || null, data_final: fim || null,
        filtros: outros, total_registros: relatorio.linhas.length
    });
    return relatorio;
}

async function gerenciaRelatorios() {
    registrarRota('relatorios');
    marcarMenuAtivo('gerenciaRelatorios');
    const dados = await buscarDados('relatorios', { resumo: {}, recentes: [] });
    const main = document.getElementById('main');
    const r = dados.resumo || {};
    const tipos = tiposPermitidos();

    const grade = document.createElement('section');
    grade.className = 'grid';
    grade.innerHTML = `
        <article class="panel">
            <div class="panel-header"><div><h2>Relatórios disponíveis</h2><p class="panel-description">Selecione um relatório para configurar os filtros.</p></div></div>
            <div class="report-list">
                ${tipos.map(([chave, t]) => `
                    <button type="button" class="report" data-tipo="${chave}">
                        <div class="report-icon" style="background:${t.cor[0]};color:${t.cor[1]};"><span class="material-icons">${t.icone}</span></div>
                        <div class="report-info"><strong>Relatório de ${t.nome}</strong><small>${t.descricao}</small></div>
                        <span class="report-arrow">›</span>
                    </button>`).join('')}
            </div>
        </article>

        <article class="panel">
            <div class="panel-header"><div><h2>Gerar relatório</h2><p class="panel-description">Escolha o tipo, período e formato.</p></div></div>
            <form id="formRapido" novalidate>
                <div class="form-grid">
                    <div class="field full">
                        <label for="rTipo">Tipo de relatório</label>
                        <select id="rTipo">${tipos.map(([chave, t]) => `<option value="${chave}">${t.nome}</option>`).join('')}</select>
                    </div>
                    <div class="field"><label for="rInicio">Data inicial</label><input type="date" id="rInicio"></div>
                    <div class="field"><label for="rFim">Data final</label><input type="date" id="rFim"></div>
                    <div class="field full">
                        <label for="rFormato">Formato</label>
                        <select id="rFormato">${Object.entries(FORMATOS).map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select>
                    </div>
                </div>
                <div class="form-actions">
                    <button type="button" class="secondary" id="btnConfigurar">Configurar</button>
                    <button type="submit" class="primary"><span class="material-icons">description</span>Gerar relatório</button>
                </div>
            </form>
        </article>
    `;

    const resumo = document.createElement('section');
    resumo.className = 'panel';
    resumo.style.marginTop = '17px';
    resumo.innerHTML = `
        <div class="panel-header"><div><h2>Resumo dos dados</h2><p class="panel-description">Quantidade de registros disponíveis para relatórios.</p></div></div>
    `;
    resumo.appendChild(cardsEstatisticas([
        ['blue', 'groups', r.participantes, 'Participantes'],
        ['green', 'volunteer_activism', r.voluntarios, 'Voluntários ativos'],
        ['purple', 'calendar_month', r.escalas, 'Escalas'],
        ['orange', 'escalator_warning', r.criancas, 'Crianças']
    ]));
    resumo.querySelector('.cards').style.marginBottom = '0';

    const recentes = document.createElement('section');
    recentes.className = 'panel';
    recentes.style.marginTop = '17px';
    recentes.innerHTML = `
        <div class="panel-header"><div><h2>Relatórios recentes</h2><p class="panel-description">Últimos relatórios gerados pelo sistema.</p></div></div>
        <div class="table-responsive">
            <table class="tabela-cartoes">
                <thead><tr><th>Relatório</th><th>Período</th><th>Formato</th><th>Registros</th><th>Gerado em</th><th>Ação</th></tr></thead>
                <tbody>
                    ${dados.recentes.map((rel, i) => `
                        <tr>
                            <td><strong>${TIPOS_RELATORIO[rel.tipo]?.nome || rel.tipo}</strong><small style="display:block;color:var(--muted)">${escapar(rel.usuario || '')}</small></td>
                            <td>${rel.data_inicial || rel.data_final ? `${formatarDataSimples(rel.data_inicial) || '…'} - ${formatarDataSimples(rel.data_final) || '…'}` : 'Todos'}</td>
                            <td>${FORMATOS[rel.formato]}</td>
                            <td>${rel.total_registros ?? '—'}</td>
                            <td>${new Date(rel.gerado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                            <td>
                                <button type="button" class="action-btn" data-ver="${i}" title="Visualizar" aria-label="Visualizar"><span class="material-icons">visibility</span></button>
                                <button type="button" class="action-btn" data-baixar="${i}" title="Baixar novamente" aria-label="Baixar novamente"><span class="material-icons">download</span></button>
                            </td>
                        </tr>`).join('') || '<tr><td colspan="6" class="vazio">Nenhum relatório gerado ainda.</td></tr>'}
                </tbody>
            </table>
        </div>
    `;

    main.replaceChildren(headerInterno('Relatórios', 'Consulte e gere relatórios da organização'), grade, resumo, recentes);

    const $ = id => main.querySelector('#' + id);
    const filtrosDoHistorico = rel => ({
        ...(rel.filtros || {}),
        inicio: rel.data_inicial ? String(rel.data_inicial).slice(0, 10) : '',
        fim: rel.data_final ? String(rel.data_final).slice(0, 10) : ''
    });

    grade.querySelectorAll('[data-tipo]').forEach(b => b.addEventListener('click', () => gerarRelatorio(b.dataset.tipo)));
    $('btnConfigurar').addEventListener('click', () => gerarRelatorio($('rTipo').value, { inicio: $('rInicio').value, fim: $('rFim').value }));

    $('formRapido').addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.target;
        const filtros = { inicio: $('rInicio').value, fim: $('rFim').value };
        if (filtros.inicio && filtros.fim && filtros.inicio > filtros.fim) return mensagemFormulario(form, 'A data inicial não pode ser maior que a data final.');
        try {
            await gerarEExportar($('rTipo').value, filtros, $('rFormato').value, { cabecalho: true, periodo: true, resumo: true, dataGeracao: true });
            gerenciaRelatorios();
        } catch (erro) {
            mensagemFormulario(form, erro.message);
        }
    });

    recentes.addEventListener('click', async event => {
        const ver = event.target.closest('[data-ver]');
        const baixar = event.target.closest('[data-baixar]');
        if (ver) {
            const rel = dados.recentes[ver.dataset.ver];
            gerarRelatorio(rel.tipo, filtrosDoHistorico(rel), rel.formato);
        }
        if (baixar) {
            const rel = dados.recentes[baixar.dataset.baixar];
            try {
                await gerarEExportar(rel.tipo, filtrosDoHistorico(rel), rel.formato, { cabecalho: true, periodo: true, resumo: true, dataGeracao: true });
                gerenciaRelatorios();
            } catch (erro) {
                alert(erro.message);
            }
        }
    });
}

async function gerarRelatorio(tipoInicial = 'participantes', filtrosIniciais = {}, formatoInicial = 'pdf') {
    registrarRota('relatorios/gerar', [tipoInicial, filtrosIniciais, formatoInicial]);
    marcarMenuAtivo('gerenciaRelatorios');
    const [funcoes, turmas] = await Promise.all([buscarDados('funcoes', []), buscarDados('presenca/turmas', [])]);
    const main = document.getElementById('main');
    const tipos = tiposPermitidos();
    if (!tipos.some(([chave]) => chave === tipoInicial)) tipoInicial = tipos[0]?.[0];

    const opcoesFuncao = `<option value="">Todas</option>${funcoes.map(f => `<option value="${f.id_funcao}">${escapar(f.nome)}</option>`).join('')}`;
    const opcoesTurma = `<option value="">Todas</option>${turmas.map(t => `<option value="${t.id_turma}">${escapar(t.nome)}</option>`).join('')}`;
    const select = (nome, rotulo, opcoes) => `<div class="field"><label>${rotulo}</label><select data-filtro="${nome}">${opcoes}</select></div>`;
    const status = (...pares) => `<option value="">Todos</option>${pares.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}`;

    const filtrosPorTipo = {
        participantes: select('tipo', 'Tipo', status(['membros', 'Membros'], ['visitantes', 'Visitantes'])) + select('status', 'Status', status(['ativos', 'Ativos'], ['inativos', 'Inativos'])),
        voluntarios: select('status', 'Status', status(['ativos', 'Ativos'], ['inativos', 'Inativos'])) + select('id_funcao', 'Função', opcoesFuncao),
        escalas: select('status', 'Status', status(['confirmadas', 'Confirmadas'], ['pendentes', 'Pendentes / ausentes'], ['recusadas', 'Recusadas'])) + select('id_funcao', 'Função', opcoesFuncao),
        presencas: select('id_turma', 'Turma', opcoesTurma),
        criancas: select('id_turma', 'Turma', opcoesTurma) + select('status', 'Status', status(['ativos', 'Ativos'], ['inativos', 'Inativos'])),
        funcoes: select('status', 'Status', status(['ativas', 'Ativas'], ['inativas', 'Inativas'])) + select('vagas', 'Vagas', status(['com_vagas', 'Com vagas'], ['lotadas', 'Lotadas'])),
        usuarios: select('perfil', 'Perfil', `<option value="">Todos</option>${Object.entries(PERFIS).map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}`)
            + select('status', 'Status', status(['ativos', 'Ativos'], ['inativos', 'Inativos'], ['pendentes', 'Pendentes']))
    };

    const grade = document.createElement('section');
    grade.className = 'grid';
    grade.innerHTML = `
        <article class="panel">
            <div class="panel-header"><div><h2>Configuração do relatório</h2><p class="panel-description">Escolha os dados que deseja incluir no relatório.</p></div></div>
            <form id="formRelatorio" novalidate>
                <div class="form-grid">
                    <div class="field full">
                        <label for="gTipo">Tipo de relatório</label>
                        <select id="gTipo">${tipos.map(([chave, t]) => `<option value="${chave}">${t.nome}</option>`).join('')}</select>
                    </div>
                    <div class="field"><label for="gInicio">Data inicial</label><input type="date" id="gInicio"></div>
                    <div class="field"><label for="gFim">Data final</label><input type="date" id="gFim"></div>
                </div>

                <div class="filter-box">
                    ${Object.entries(filtrosPorTipo).map(([tipo, html]) => `
                        <div class="filtro-grupo" data-tipo="${tipo}" hidden>
                            <h3>Filtros de ${TIPOS_RELATORIO[tipo].nome.toLowerCase()}</h3>
                            <div class="form-grid">${html}</div>
                        </div>`).join('')}
                </div>

                <div class="form-section">
                    <h3 class="section-title" style="font-size:16px;">Formato do relatório</h3>
                    <div class="format-options">
                        <label class="format-card"><input type="radio" name="formato" value="pdf"><span class="material-icons">picture_as_pdf</span><div><strong>PDF</strong><small>Ideal para impressão</small></div></label>
                        <label class="format-card"><input type="radio" name="formato" value="excel"><span class="material-icons">table_view</span><div><strong>Excel</strong><small>Para edição dos dados</small></div></label>
                        <label class="format-card"><input type="radio" name="formato" value="csv"><span class="material-icons">description</span><div><strong>CSV</strong><small>Separado por ponto e vírgula</small></div></label>
                    </div>
                </div>

                <div class="form-section">
                    <h3 class="section-title" style="font-size:16px;">Opções</h3>
                    <div class="checkbox-grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));">
                        <label class="checkbox-card"><input type="checkbox" id="gCabecalho" checked><div><strong>Incluir cabeçalho</strong><small>Nome da igreja e título</small></div></label>
                        <label class="checkbox-card"><input type="checkbox" id="gPeriodo" checked><div><strong>Incluir período</strong><small>Exibir as datas utilizadas</small></div></label>
                        <label class="checkbox-card"><input type="checkbox" id="gResumo" checked><div><strong>Incluir resumo</strong><small>Mostrar totais no início</small></div></label>
                        <label class="checkbox-card"><input type="checkbox" id="gDataGeracao" checked><div><strong>Data de geração</strong><small>Registrar quando foi gerado</small></div></label>
                    </div>
                </div>

                <div class="field full" style="margin-top:20px;">
                    <label for="gObservacoes">Observações</label>
                    <textarea id="gObservacoes" rows="3" placeholder="Adicione alguma observação ao relatório (sai no PDF)..."></textarea>
                </div>

                <div class="form-actions">
                    <button type="button" class="btn-cancel" id="cancelarRelatorio">Cancelar</button>
                    <button type="button" class="secondary" id="btnVisualizar"><span class="material-icons">visibility</span>Visualizar</button>
                    <button type="submit" class="primary"><span class="material-icons">download</span>Gerar relatório</button>
                </div>
            </form>
        </article>

        <article class="panel">
            <div class="panel-header"><div><h2>Pré-visualização</h2><p class="panel-description">Primeiras linhas do relatório com os filtros atuais.</p></div></div>
            <div class="report-preview">
                <div class="preview-header">
                    <div class="preview-logo"><span class="material-icons">church</span></div>
                    <div><strong>Igreja Novo Caminho</strong><small>Sistema de Gestão</small></div>
                </div>
                <div class="preview-line"></div>
                <div class="preview-title"><h2 id="tituloPreview"></h2><p id="periodoPreview"></p></div>
                <div class="preview-stats">
                    <div><strong id="previewTotal">—</strong><small>Registros</small></div>
                    <div><strong id="previewColunas">—</strong><small>Colunas</small></div>
                </div>
                <div class="table-responsive"><table id="previewTabela"></table></div>
                <div class="preview-footer">Relatório gerado pelo Sistema de Gestão da Igreja</div>
            </div>
        </article>
    `;

    main.replaceChildren(headerComVoltar('Gerar relatório', 'Configure os filtros e gere um relatório', gerenciaRelatorios), grade);

    const $ = id => main.querySelector('#' + id);
    const form = $('formRelatorio');
    $('gTipo').value = tipoInicial;
    $('gInicio').value = filtrosIniciais.inicio || '';
    $('gFim').value = filtrosIniciais.fim || '';
    form.querySelector(`input[name="formato"][value="${formatoInicial}"]`).checked = true;
    grade.querySelectorAll('[data-filtro]').forEach(campo => {
        const grupo = campo.closest('.filtro-grupo').dataset.tipo;
        if (grupo === tipoInicial && filtrosIniciais[campo.dataset.filtro] != null) campo.value = filtrosIniciais[campo.dataset.filtro];
    });

    function filtrosAtuais() {
        const grupo = grade.querySelector(`.filtro-grupo[data-tipo="${$('gTipo').value}"]`);
        return {
            inicio: $('gInicio').value,
            fim: $('gFim').value,
            ...Object.fromEntries([...grupo.querySelectorAll('[data-filtro]')].map(c => [c.dataset.filtro, c.value]))
        };
    }

    async function atualizarPreview() {
        const tipo = $('gTipo').value;
        grade.querySelectorAll('.filtro-grupo').forEach(g => { g.hidden = g.dataset.tipo !== tipo; });
        $('tituloPreview').textContent = `Relatório de ${TIPOS_RELATORIO[tipo].nome}`;
        $('periodoPreview').textContent = periodoTexto($('gInicio').value, $('gFim').value);

        const filtros = filtrosAtuais();
        if (filtros.inicio && filtros.fim && filtros.inicio > filtros.fim) {
            $('previewTabela').innerHTML = '<tbody><tr><td class="vazio">A data inicial não pode ser maior que a data final.</td></tr></tbody>';
            return;
        }
        try {
            const relatorio = await dadosRelatorio(tipo, filtros);
            if ($('gTipo')?.value !== tipo) return; // o tipo mudou enquanto carregava
            $('previewTotal').textContent = relatorio.linhas.length;
            $('previewColunas').textContent = relatorio.colunas.length;
            // Todas as colunas (a tabela rola na horizontal) e as primeiras linhas
            const colunas = relatorio.colunas;
            const LINHAS_PREVIEW = 20;
            $('previewTabela').innerHTML = `
                <thead><tr>${colunas.map(c => `<th>${escapar(c.titulo)}</th>`).join('')}</tr></thead>
                <tbody>${relatorio.linhas.slice(0, LINHAS_PREVIEW).map(l => `<tr>${colunas.map(c => `<td>${escapar(valorCelula(l[c.chave]))}</td>`).join('')}</tr>`).join('')
                    || `<tr><td colspan="${colunas.length}" class="vazio">Nenhum registro com esses filtros.</td></tr>`}</tbody>
                ${relatorio.linhas.length > LINHAS_PREVIEW ? `<tfoot><tr><td colspan="${colunas.length}" class="vazio">Mostrando ${LINHAS_PREVIEW} de ${relatorio.linhas.length}. Gere o relatório para ver todos.</td></tr></tfoot>` : ''}`;
        } catch (erro) {
            $('previewTabela').innerHTML = `<tbody><tr><td class="vazio">${escapar(erro.message)}</td></tr></tbody>`;
        }
    }

    $('gTipo').addEventListener('change', atualizarPreview);
    $('gInicio').addEventListener('change', atualizarPreview);
    $('gFim').addEventListener('change', atualizarPreview);
    grade.querySelectorAll('[data-filtro]').forEach(c => c.addEventListener('change', atualizarPreview));
    $('btnVisualizar').addEventListener('click', atualizarPreview);
    $('cancelarRelatorio').addEventListener('click', () => abrirSubstituindo(gerenciaRelatorios));

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const filtros = filtrosAtuais();
        if (filtros.inicio && filtros.fim && filtros.inicio > filtros.fim) return mensagemFormulario(form, 'A data inicial não pode ser maior que a data final.');

        try {
            const relatorio = await gerarEExportar($('gTipo').value, filtros, form.querySelector('input[name="formato"]:checked').value, {
                cabecalho: $('gCabecalho').checked,
                periodo: $('gPeriodo').checked,
                resumo: $('gResumo').checked,
                dataGeracao: $('gDataGeracao').checked,
                observacoes: $('gObservacoes').value.trim()
            });
            mensagemFormulario(form, `Relatório de ${relatorio.titulo} gerado com ${relatorio.linhas.length} registro(s).`, false);
        } catch (erro) {
            mensagemFormulario(form, erro.message);
        }
    });

    await atualizarPreview();
}
