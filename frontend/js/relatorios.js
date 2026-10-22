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

// ---------- Arquivos guardados no servidor
// Todo relatório é gerado no servidor a partir do banco, guardado em arquivo e
// registrado no histórico. Visualizar e Download entregam esse mesmo arquivo
// (nada é gerado de novo).

// Busca o arquivo de um registro do histórico (com o token do login)
async function arquivoDoRelatorio(id, download = false) {
    const resposta = await fetch(`${API_URL}/relatorios/historico/${id}/arquivo${download ? '?download=1' : ''}`, { headers: cabecalhos() });
    if (resposta.status === 401) {
        sairDoSistema();
        throw new Error('Sua sessão expirou. Entre novamente.');
    }
    if (!resposta.ok) {
        const dados = await resposta.json().catch(() => ({}));
        throw new Error(dados.erro || 'Não foi possível abrir o arquivo deste relatório.');
    }
    const blob = await resposta.blob();
    if (!blob.size) throw new Error('O arquivo deste relatório está vazio ou corrompido.');
    return blob;
}

function nomeDoArquivo(rel) {
    const extensao = { pdf: 'pdf', excel: 'xls', csv: 'csv' }[rel.formato] || 'pdf';
    return rel.nome_arquivo || `relatorio-${rel.tipo}-${rel.id_relatorio}.${extensao}`;
}

async function baixarRelatorioSalvo(rel) {
    const blob = await arquivoDoRelatorio(rel.id_relatorio, true);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeDoArquivo(rel);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Mostra o documento salvo numa janela (PDF no visualizador do navegador;
// Excel e CSV como conteúdo, sem executar nada do arquivo)
async function visualizarRelatorioSalvo(rel) {
    const titulo = rel.titulo || `Relatório de ${TIPOS_RELATORIO[rel.tipo]?.nome || rel.tipo}`;
    const { modal, fechar } = abrirModal(titulo, `Gerado em ${new Date(rel.gerado_em).toLocaleString('pt-BR')} • ${FORMATOS[rel.formato] || rel.formato}`,
        '<p class="vazio">Carregando o documento salvo...</p>');
    modal.classList.add('modal-largo', 'modal-documento');
    const corpo = modal.querySelector('.modal-corpo');
    let url;
    const liberar = () => { if (url) setTimeout(() => URL.revokeObjectURL(url), 1000); };
    modal.closest('.modal-overlay').addEventListener('click', event => { if (event.target.closest('.modal-close') || event.target === event.currentTarget) liberar(); });

    try {
        const blob = await arquivoDoRelatorio(rel.id_relatorio);
        const tipo = rel.formato === 'pdf' ? 'application/pdf' : rel.formato === 'excel' ? 'text/html;charset=utf-8' : 'text/plain;charset=utf-8';
        url = URL.createObjectURL(new Blob([blob], { type: tipo }));
        corpo.innerHTML = `
            <iframe class="visualizador-relatorio" title="${escapar(titulo)}" ${rel.formato === 'pdf' ? '' : 'sandbox=""'}></iframe>
            <div class="form-actions">
                <a class="secondary botao-link" href="${url}" target="_blank" rel="noopener">
                    <span class="material-icons">open_in_new</span>Abrir em nova aba</a>
                <button type="button" class="primary" data-baixar><span class="material-icons">download</span>Download</button>
            </div>`;
        corpo.querySelector('iframe').src = url;
        corpo.querySelector('[data-baixar]').addEventListener('click', async () => {
            try { await baixarRelatorioSalvo(rel); } catch (erro) { alert(erro.message); }
        });
    } catch (erro) {
        corpo.innerHTML = `<p class="vazio">${escapar(erro.message)}</p>
            <div class="form-actions"><button type="button" class="primary" data-fechar>Fechar</button></div>`;
        corpo.querySelector('[data-fechar]').addEventListener('click', fechar);
    }
}

// Gera no servidor (registra no histórico) e baixa o arquivo gerado
async function gerarEExportar(tipo, filtros, formato, opcoes) {
    const registro = await enviarDados('relatorios/gerar', 'POST', { tipo, formato, filtros, opcoes });
    await baixarRelatorioSalvo(registro);
    return registro;
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
                <button type="button" class="report" data-relatorio-evento>
                    <div class="report-icon" style="background:#fbeee6;color:#965b39;"><span class="material-icons">event_note</span></div>
                    <div class="report-info"><strong>Relatório por evento</strong><small>Tudo sobre um evento: funções, voluntários, confirmações, recusas e vagas</small></div>
                    <span class="report-arrow">›</span>
                </button>
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
    const descricaoPeriodo = rel => rel.tipo === 'evento'
        ? (rel.evento ? `${escapar(rel.evento)} • ${formatarDataSimples(rel.data_evento)}` : `Evento removido (${formatarDataSimples(rel.data_inicial)})`)
        : (rel.data_inicial || rel.data_final ? `${formatarDataSimples(rel.data_inicial) || '…'} - ${formatarDataSimples(rel.data_final) || '…'}` : 'Todos');
    recentes.innerHTML = `
        <div class="panel-header"><div><h2>Relatórios recentes</h2><p class="panel-description">Histórico dos relatórios gerados (mais novos primeiro). Visualizar e Download abrem o documento salvo, sem gerar de novo.</p></div></div>
        <div class="toolbar">
            <input class="search" type="search" placeholder="Buscar por relatório, evento ou usuário..." aria-label="Buscar relatórios gerados">
        </div>
        <p class="contador"></p>
        <div class="table-responsive">
            <table class="tabela-cartoes">
                <thead><tr><th>Relatório</th><th>Período / evento</th><th>Formato</th><th>Registros</th><th>Gerado em</th><th>Ações</th></tr></thead>
                <tbody>
                    ${dados.recentes.map((rel, i) => `
                        <tr data-filtro="${rel.tipo}">
                            <td><strong>${escapar(rel.titulo || `Relatório de ${TIPOS_RELATORIO[rel.tipo]?.nome || rel.tipo}`)}</strong><small style="display:block;color:var(--muted)">${escapar(rel.usuario || '')}</small></td>
                            <td>${descricaoPeriodo(rel)}</td>
                            <td>${FORMATOS[rel.formato] || escapar(rel.formato)}</td>
                            <td>${rel.total_registros ?? '—'}</td>
                            <td>${new Date(rel.gerado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                            <td>
                                <div class="acoes">
                                    <button type="button" class="action-btn com-texto" data-ver="${i}" ${rel.tem_arquivo ? '' : 'disabled'}>
                                        <span class="material-icons">visibility</span>Visualizar</button>
                                    <button type="button" class="action-btn com-texto" data-baixar="${i}" ${rel.tem_arquivo ? '' : 'disabled'}>
                                        <span class="material-icons">download</span>Download</button>
                                </div>
                                ${rel.tem_arquivo ? '' : '<small style="display:block;color:var(--muted)">Sem arquivo salvo (gerado antes do histórico de arquivos)</small>'}
                            </td>
                        </tr>`).join('') || '<tr><td colspan="6" class="vazio">Nenhum relatório gerado ainda. Os relatórios gerados aparecem aqui e ficam disponíveis para consulta.</td></tr>'}
                </tbody>
            </table>
        </div>
        <p class="mensagem-lista" data-mensagem-recentes role="status"></p>
    `;

    main.replaceChildren(headerInterno('Relatórios', 'Consulte e gere relatórios da organização'), grade, resumo, recentes);

    const $ = id => main.querySelector('#' + id);
    configurarFiltros(recentes, () => true);

    grade.querySelectorAll('[data-tipo]').forEach(b => b.addEventListener('click', () => gerarRelatorio(b.dataset.tipo)));
    grade.querySelector('[data-relatorio-evento]').addEventListener('click', () => gerarRelatorioEvento());
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
        const aviso = recentes.querySelector('[data-mensagem-recentes]');
        if (ver) visualizarRelatorioSalvo(dados.recentes[ver.dataset.ver]);
        if (baixar) {
            baixar.disabled = true;
            try {
                await baixarRelatorioSalvo(dados.recentes[baixar.dataset.baixar]);
                aviso.textContent = '';
            } catch (erro) {
                aviso.textContent = erro.message;
                aviso.classList.add('erro');
            } finally {
                baixar.disabled = false;
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
            const registro = await gerarEExportar($('gTipo').value, filtros, form.querySelector('input[name="formato"]:checked').value, {
                cabecalho: $('gCabecalho').checked,
                periodo: $('gPeriodo').checked,
                resumo: $('gResumo').checked,
                dataGeracao: $('gDataGeracao').checked,
                observacoes: $('gObservacoes').value.trim()
            });
            mensagemFormulario(form, `${registro.titulo} gerado com ${registro.total_registros ?? 0} registro(s). Ele fica salvo em Relatórios recentes.`, false);
        } catch (erro) {
            mensagemFormulario(form, erro.message);
        }
    });

    await atualizarPreview();
}

// =========================================
// RELATÓRIO POR EVENTO
// Escolhe qualquer evento (futuro ou realizado), visualiza os dados reais
// e gera o PDF completo no servidor (fica salvo em Relatórios recentes).
// =========================================

async function gerarRelatorioEvento(idInicial = null) {
    registrarRota('relatorios/evento', [idInicial]);
    marcarMenuAtivo('gerenciaRelatorios');
    const eventos = await buscarDados('relatorios/eventos', []);
    const main = document.getElementById('main');

    const rotuloEvento = ev => `${formatarDataSimples(ev.data_evento)}${ev.hora_inicio ? ' ' + ev.hora_inicio : ''} — ${ev.nome}`
        + ` (${TIPOS_DE_EVENTO[ev.tipo_evento] || ev.tipo_evento || 'sem tipo'})`;

    const selecao = document.createElement('section');
    selecao.className = 'panel';
    selecao.innerHTML = `
        <div class="panel-header"><div><h2>Selecione o evento</h2>
            <p class="panel-description">Eventos futuros e realizados. Cada um aparece com data e horário para não confundir eventos de mesmo nome.</p></div></div>
        <form id="formRelatorioEvento" novalidate>
            <div class="form-grid">
                <div class="field full">
                    <label for="reBusca">Buscar evento</label>
                    <input type="search" id="reBusca" class="search" placeholder="Nome, tipo ou data (dd/mm/aaaa)..." autocomplete="off">
                </div>
                <div class="field full">
                    <label for="reEvento">Evento</label>
                    <select id="reEvento" required></select>
                </div>
            </div>
            <div class="form-actions">
                <button type="button" class="btn-cancel" id="reCancelar">Cancelar</button>
                <button type="button" class="secondary" id="reVisualizar"><span class="material-icons">visibility</span>Visualizar</button>
                <button type="submit" class="primary"><span class="material-icons">picture_as_pdf</span>Gerar PDF</button>
            </div>
        </form>
    `;

    const previa = document.createElement('section');
    previa.className = 'panel';
    previa.style.marginTop = '17px';
    previa.innerHTML = `
        <div class="panel-header"><div><h2>Pré-visualização</h2><p class="panel-description" id="reDescricao">Escolha um evento e clique em Visualizar.</p></div></div>
        <div id="rePrevia"></div>
    `;

    main.replaceChildren(headerComVoltar('Relatório por evento', 'Funções, voluntários e confirmações de um evento', gerenciaRelatorios), selecao, previa);

    const $ = id => main.querySelector('#' + id);
    const form = $('formRelatorioEvento');

    function preencherOpcoes() {
        const termo = normalizarTexto($('reBusca').value);
        const atual = $('reEvento').value || (idInicial ? String(idInicial) : '');
        const visiveis = eventos.filter(ev => !termo || normalizarTexto(rotuloEvento(ev)).includes(termo));
        const grupo = (titulo, lista) => lista.length
            ? `<optgroup label="${titulo}">${lista.map(ev => `<option value="${ev.id_evento}">${escapar(rotuloEvento(ev))}</option>`).join('')}</optgroup>` : '';
        // Próximos: do mais próximo ao mais distante; realizados: do mais recente ao mais antigo
        const proximos = visiveis.filter(ev => !ev.realizado).reverse();
        const realizados = visiveis.filter(ev => ev.realizado);
        $('reEvento').innerHTML = visiveis.length
            ? '<option value="">Selecione um evento</option>' + grupo('Próximos eventos', proximos) + grupo('Eventos realizados', realizados)
            : `<option value="">${eventos.length ? 'Nenhum evento encontrado com essa busca' : 'Nenhum evento cadastrado'}</option>`;
        if (visiveis.some(ev => String(ev.id_evento) === atual)) $('reEvento').value = atual;
    }

    async function visualizar() {
        const id = Number($('reEvento').value);
        if (!id) return mensagemFormulario(form, 'Selecione o evento.');
        mensagemFormulario(form, '');
        $('rePrevia').innerHTML = '<p class="vazio">Carregando...</p>';
        try {
            const detalhes = await enviarDados(`relatorios/evento/${id}`, 'GET');
            if (Number($('reEvento').value) !== id) return; // trocou de evento enquanto carregava
            $('reDescricao').textContent = `${detalhes.evento.nome} — dados registrados agora no sistema`;
            $('rePrevia').innerHTML = `<h3 class="titulo-previa">${escapar(detalhes.evento.nome)}</h3>${htmlDetalhesEvento(detalhes)}`;
        } catch (erro) {
            $('rePrevia').innerHTML = `<p class="vazio">${escapar(erro.message)}</p>`;
        }
    }

    $('reBusca').addEventListener('input', preencherOpcoes);
    $('reEvento').addEventListener('change', () => {
        if (history.state?.rota === 'relatorios/evento') history.replaceState({ ...history.state, args: [Number($('reEvento').value) || null] }, '', location.hash);
        if ($('reEvento').value) visualizar();
    });
    $('reVisualizar').addEventListener('click', visualizar);
    $('reCancelar').addEventListener('click', () => abrirSubstituindo(gerenciaRelatorios));

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const id = Number($('reEvento').value);
        if (!id) return mensagemFormulario(form, 'Selecione o evento.');
        const botao = form.querySelector('button[type="submit"]');
        botao.disabled = true;
        mensagemFormulario(form, 'Gerando o relatório...', false);
        try {
            const registro = await enviarDados('relatorios/gerar', 'POST', { tipo: 'evento', id_evento: id });
            await baixarRelatorioSalvo(registro);
            mensagemFormulario(form, `${registro.titulo} gerado. O PDF ficou salvo em Relatórios recentes.`, false);
        } catch (erro) {
            mensagemFormulario(form, erro.message);
        } finally {
            botao.disabled = false;
        }
    });

    preencherOpcoes();
    if ($('reEvento').value) await visualizar();
}
