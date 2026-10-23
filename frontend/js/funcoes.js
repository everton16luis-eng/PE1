// =========================================
// FUNÇÕES
// =========================================

async function gerenciaFuncoes() {
    registrarRota('funcoes');
    const ativa = paginaAtiva();
    marcarMenuAtivo('gerenciaFuncoes');
    const dados = await buscarDados('funcoes/gestao', { resumo: {}, funcoes: [] });
    if (!ativa()) return;
    const main = document.getElementById('main');
    const r = dados.resumo || {};

    const lista = document.createElement('section');
    lista.className = 'panel';
    lista.innerHTML = `
        <div class="panel-header">
            <div><h2>Funções da Igreja</h2><p class="contador"></p></div>
            <button type="button" class="primary" id="btnNovaFuncao">+ Nova função</button>
        </div>
        <div class="toolbar">
            <input class="search" type="search" placeholder="Buscar função..." aria-label="Buscar função">
            <button type="button" class="filtro ativo" data-filtro="todos">Todos</button>
            <button type="button" class="filtro" data-filtro="ativa">Ativas</button>
            <button type="button" class="filtro" data-filtro="vagas">Com vagas</button>
        </div>
        <div class="table-responsive">
            <table class="tabela-cartoes">
                <thead>
                    <tr><th>Função</th><th>Descrição</th><th>Por escala</th><th>Voluntários</th><th>Vagas abertas</th><th>Status</th><th>Ação</th></tr>
                </thead>
                <tbody>
                    ${dados.funcoes.map(f => {
                        const status = !f.ativo ? '<span class="badge inactive">Inativa</span>'
                            : f.vagas_abertas > 0 ? '<span class="badge pending">Vagas</span>'
                            : '<span class="badge ok">Completa</span>';
                        return `
                            <tr data-filtro="${f.ativo ? 'ativa' : 'inativa'}" data-vagas="${f.ativo && f.vagas_abertas > 0}">
                                <td><strong>${escapar(f.nome)}</strong><small style="display:block;color:var(--muted);margin-top:3px;">${escapar(nomesDosDias(f.dias_disponiveis))}</small></td>
                                <td>${escapar(f.descricao || '—')}</td>
                                <td>${f.qtd_voluntarios}</td>
                                <td>${f.voluntarios} de ${f.vagas ?? '—'}</td>
                                <td>${f.vagas_abertas}</td>
                                <td>${status}</td>
                                <td><button type="button" class="action-btn" data-editar="${f.id_funcao}" title="Editar" aria-label="Editar ${escapar(f.nome)}"><span class="material-icons">edit</span></button></td>
                            </tr>`;
                    }).join('') || '<tr><td colspan="7" class="vazio">Nenhuma função cadastrada.</td></tr>'}
                </tbody>
            </table>
        </div>
    `;

    main.replaceChildren(
        headerInterno('Funções', 'Cadastre e organize as funções dos voluntários'),
        cardsEstatisticas([
            ['blue', 'engineering', r.total, 'Funções cadastradas'],
            ['green', 'check_circle', r.ativas, 'Ativas'],
            ['purple', 'volunteer_activism', r.voluntarios, 'Voluntários vinculados'],
            ['orange', 'person_add', r.com_vagas, 'Com vagas']
        ]),
        lista
    );

    configurarFiltros(lista, (linha, filtro) =>
        filtro === 'vagas' ? linha.dataset.vagas === 'true' : linha.dataset.filtro === filtro, { exigirInteracao: true });

    lista.querySelector('#btnNovaFuncao').addEventListener('click', () => formularioFuncao());
    lista.addEventListener('click', event => {
        const botao = event.target.closest('[data-editar]');
        if (botao) formularioFuncao(dados.funcoes.find(f => f.id_funcao === Number(botao.dataset.editar)));
    });
}

// Cadastro e edição usam o mesmo formulário
function formularioFuncao(funcao = null) {
    registrarRota(funcao ? 'funcoes/editar' : 'funcoes/nova', [funcao]);
    const main = document.getElementById('main');
    const editar = Boolean(funcao);

    const section = document.createElement('section');
    section.className = 'panel volunteer-form';
    section.innerHTML = `
        <form id="formFuncao" novalidate>
            <div class="form-section">
                <div class="section-title">
                    <span class="material-icons">engineering</span>
                    <div><h3>Dados da Função</h3><p>Informe os dados principais da função.</p></div>
                </div>
                <div class="form-grid">
                    <div class="form-group"><label for="fNome">Nome da função</label><input type="text" id="fNome" placeholder="Ex: Recepção" required></div>
                    <div class="form-group">
                        <label for="fStatus">Status</label>
                        <select id="fStatus"><option value="ativa">Ativa</option><option value="inativa">Inativa</option></select>
                    </div>
                    <div class="form-group">
                        <label for="fPorEscala">Voluntários por escala</label>
                        <input type="number" id="fPorEscala" min="1" max="50" value="1" required>
                        <small>Quantas pessoas servem nesta função em cada culto/evento.</small>
                    </div>
                    <div class="form-group">
                        <label for="fVagas">Quantidade de vagas na equipe</label>
                        <input type="number" id="fVagas" min="0" max="200" value="1" required>
                        <small>${editar ? `Voluntários atuais: ${funcao.voluntarios}` : 'Total de voluntários desejado para o rodízio.'}</small>
                    </div>
                </div>
            </div>

            <div class="form-section">
                <div class="section-title">
                    <span class="material-icons">description</span>
                    <div><h3>Descrição</h3><p>Explique o que será realizado nesta função.</p></div>
                </div>
                <div class="form-group">
                    <label for="fDescricao">Descrição da função</label>
                    <textarea id="fDescricao" rows="4" placeholder="Ex: Recepcionar membros e visitantes durante os cultos..."></textarea>
                </div>
            </div>

            <div class="form-section">
                <div class="section-title">
                    <span class="material-icons">calendar_month</span>
                    <div><h3>Dias disponíveis</h3><p>Selecione os dias em que esta função poderá ser utilizada.</p></div>
                </div>
                <div class="checkbox-grid days-grid">
                    ${Object.entries(NOMES_DIAS).map(([valor, nome]) => `
                        <label class="checkbox-card"><input type="checkbox" name="dias" value="${valor}"><span class="material-icons">event</span><span>${nome}</span></label>`).join('')}
                </div>
            </div>

            <div class="form-section">
                <div class="section-title">
                    <span class="material-icons">notes</span>
                    <div><h3>Observações</h3><p>Adicione informações adicionais.</p></div>
                </div>
                <div class="form-group">
                    <label for="fObservacoes">Observações</label>
                    <textarea id="fObservacoes" rows="4" placeholder="Digite observações importantes..."></textarea>
                </div>
            </div>

            <div class="form-actions">
                <button type="button" class="btn-cancel" id="cancelarFuncao">Cancelar</button>
                <button type="submit" class="primary"><span class="material-icons">save</span>${editar ? 'Salvar alterações' : 'Salvar Função'}</button>
            </div>
        </form>
    `;

    main.replaceChildren(
        headerComVoltar(editar ? 'Editar Função' : 'Nova Função',
            editar ? `Altere os dados de ${funcao.nome}` : 'Cadastre uma nova função para os voluntários', gerenciaFuncoes),
        section
    );

    const form = section.querySelector('form');
    const $ = id => section.querySelector('#' + id);

    if (editar) {
        $('fNome').value = funcao.nome;
        $('fStatus').value = funcao.ativo ? 'ativa' : 'inativa';
        $('fPorEscala').value = funcao.qtd_voluntarios;
        $('fVagas').value = funcao.vagas ?? funcao.voluntarios;
        $('fDescricao').value = funcao.descricao || '';
        $('fObservacoes').value = funcao.observacoes || '';
        form.querySelectorAll('input[name="dias"]').forEach(c => { c.checked = (funcao.dias_disponiveis || []).includes(c.value); });
    }

    $('cancelarFuncao').addEventListener('click', () => abrirSubstituindo(gerenciaFuncoes));

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const dados = {
            nome: $('fNome').value,
            ativo: $('fStatus').value === 'ativa',
            qtd_voluntarios: Number($('fPorEscala').value),
            vagas: Number($('fVagas').value),
            descricao: $('fDescricao').value,
            dias_disponiveis: [...form.querySelectorAll('input[name="dias"]:checked')].map(c => c.value),
            observacoes: $('fObservacoes').value
        };
        if (!dados.nome.trim()) return mensagemFormulario(form, 'Informe o nome da função.');

        try {
            await enviarDados(editar ? `funcoes/${funcao.id_funcao}` : 'funcoes', editar ? 'PUT' : 'POST', dados);
            alert(editar ? 'Função atualizada com sucesso!' : 'Função cadastrada com sucesso!');
            abrirSubstituindo(gerenciaFuncoes);
        } catch (erro) {
            mensagemFormulario(form, erro.message);
        }
    });
}
