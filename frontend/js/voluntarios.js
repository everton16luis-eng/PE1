// =========================================
// VOLUNTÁRIOS
// =========================================

async function gerenciaVoluntarios() {
    registrarRota('voluntarios');
    marcarMenuAtivo('gerenciaVoluntarios');
    const dados = await buscarDados('voluntarios', { resumo: {}, voluntarios: [] });
    const main = document.getElementById('main');
    const r = dados.resumo || {};

    const lista = document.createElement('section');
    lista.className = 'panel';
    lista.innerHTML = `
        <div class="panel-header">
            <div><h2>Lista de Voluntários</h2><p class="contador"></p></div>
            <button type="button" class="primary" id="btnNovoVoluntario">+ Novo voluntário</button>
        </div>
        <div class="toolbar">
            <input class="search" type="search" placeholder="Buscar voluntário..." aria-label="Buscar voluntário">
            <button type="button" class="filtro ativo" data-filtro="todos">Todos</button>
            <button type="button" class="filtro" data-filtro="ativo">Ativos</button>
            <button type="button" class="filtro" data-filtro="inativo">Inativos</button>
        </div>
        <div class="table-responsive">
            <table class="tabela-cartoes">
                <thead>
                    <tr><th>Voluntário</th><th>Funções</th><th>Disponibilidade</th><th>Última escala</th><th>Status</th><th>Ação</th></tr>
                </thead>
                <tbody>
                    ${dados.voluntarios.map(v => `
                        <tr data-filtro="${v.ativo ? 'ativo' : 'inativo'}">
                            <td>
                                <div class="person">
                                    <div class="mini-avatar">${escapar(v.nome.charAt(0).toUpperCase())}</div>
                                    <div class="info">
                                        <a href="#" class="link-ficha" data-ficha="${v.id_voluntario}"><strong>${escapar(v.nome)}</strong></a>
                                        <small>${escapar(v.departamento || 'Sem departamento')}</small>
                                    </div>
                                </div>
                            </td>
                            <td>${escapar(v.funcoes.map(f => f.nome).join(', ') || '—')}</td>
                            <td>${escapar(nomesDosDias(v.disponibilidade) || '—')}</td>
                            <td>${formatarDataSimples(v.ultima_escala) || '—'}</td>
                            <td>${v.ativo ? '<span class="badge ok">Ativo</span>' : '<span class="badge inactive">Inativo</span>'}</td>
                            <td>
                                <button type="button" class="action-btn" data-ficha="${v.id_voluntario}" title="Ver ficha" aria-label="Ver ficha de ${escapar(v.nome)}">
                                    <span class="material-icons">badge</span>
                                </button>
                                <button type="button" class="action-btn" data-status="${v.id_voluntario}" data-ativo="${v.ativo}"
                                        title="${v.ativo ? 'Inativar' : 'Reativar'}" aria-label="${v.ativo ? 'Inativar' : 'Reativar'} ${escapar(v.nome)}">
                                    <span class="material-icons">${v.ativo ? 'person_off' : 'person'}</span>
                                </button>
                            </td>
                        </tr>`).join('') || '<tr><td colspan="6" class="vazio">Nenhum voluntário cadastrado.</td></tr>'}
                </tbody>
            </table>
        </div>
    `;

    main.replaceChildren(
        headerInterno('Voluntários', 'Gerencie voluntários, funções e disponibilidade'),
        cardsEstatisticas([
            ['blue', 'volunteer_activism', r.total, 'Voluntários'],
            ['green', 'check_circle', r.ativos, 'Ativos'],
            ['purple', 'person_search', r.disponiveis, 'Membros aptos ainda não escalados'],
            ['orange', 'person_off', r.inativos, 'Inativos']
        ]),
        lista
    );

    configurarFiltros(lista, (linha, filtro) => linha.dataset.filtro === filtro, { exigirInteracao: true });
    lista.querySelector('#btnNovoVoluntario').addEventListener('click', novoVoluntario);

    lista.addEventListener('click', async event => {
        const ficha = event.target.closest('[data-ficha]');
        if (ficha) {
            event.preventDefault();
            fichaVoluntario(Number(ficha.dataset.ficha));
            return;
        }
        const botao = event.target.closest('[data-status]');
        if (!botao) return;
        const ativar = botao.dataset.ativo !== 'true';
        if (!confirm(ativar ? 'Reativar este voluntário?' : 'Inativar este voluntário? Ele deixa de aparecer nas novas escalas.')) return;
        try {
            await enviarDados(`voluntarios/${botao.dataset.status}/status`, 'PATCH', { ativo: ativar });
            gerenciaVoluntarios();
        } catch (erro) {
            alert(erro.message);
        }
    });
}

async function novoVoluntario() {
    registrarRota('voluntarios/novo');
    const [candidatos, funcoes] = await Promise.all([
        buscarDados('voluntarios/candidatos', { membros: [], departamentos: [] }),
        buscarDados('funcoes', [])
    ]);
    const main = document.getElementById('main');
    const icones = { 'RECEPÇÃO': 'front_hand', 'LOUVOR': 'music_note', 'MESA DE SOM': 'graphic_eq', 'PROJEÇÃO': 'videocam', 'FOTOS': 'photo_camera', 'ESTACIONAMENTO': 'local_parking', 'GESTÃO DE CULTO': 'event_note' };

    const section = document.createElement('section');
    section.className = 'panel volunteer-form';
    section.innerHTML = `
        <form id="formVoluntario" novalidate>
            <div class="form-section">
                <div class="section-title">
                    <span class="material-icons">person</span>
                    <div><h3>Dados Pessoais</h3><p>Informações básicas do voluntário</p></div>
                </div>
                <div class="form-grid">
                    <div class="form-group full">
                        <label for="vParticipante">Participante</label>
                        <select id="vParticipante" required>
                            <option value="">Selecione um participante</option>
                            ${candidatos.membros.map(m => `<option value="${m.id_membro}">${escapar(m.nome_completo)}${m.apto_voluntario ? ' (apto)' : ''}</option>`).join('')}
                        </select>
                        <small>Selecione um membro já cadastrado. Para alguém novo, cadastre primeiro em Participantes.</small>
                    </div>
                    <div class="form-group"><label for="vTelefone">Telefone</label><input type="tel" id="vTelefone" placeholder="(47) 99999-9999"></div>
                    <div class="form-group"><label for="vEmail">E-mail</label><input type="email" id="vEmail" placeholder="email@exemplo.com"></div>
                    <div class="form-group">
                        <label for="vDepartamento">Departamento</label>
                        <select id="vDepartamento">
                            <option value="">Selecione</option>
                            ${candidatos.departamentos.map(d => `<option value="${d.id_departamento}">${escapar(d.nome)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="vStatus">Status</label>
                        <select id="vStatus"><option value="ativo">Ativo</option><option value="inativo">Inativo</option></select>
                    </div>
                </div>
            </div>

            <div class="form-section">
                <div class="section-title">
                    <span class="material-icons">engineering</span>
                    <div><h3>Funções</h3><p>Selecione as áreas em que o voluntário pode atuar.</p></div>
                </div>
                <div class="checkbox-grid">
                    ${funcoes.map(f => `
                        <label class="checkbox-card">
                            <input type="checkbox" name="funcoes" value="${f.id_funcao}">
                            <span class="material-icons">${icones[f.nome.toUpperCase()] || (f.nome.toUpperCase().includes('KIDS') || f.nome.toUpperCase() === 'NEXT' ? 'child_care' : 'badge')}</span>
                            <span>${escapar(f.nome)}</span>
                        </label>`).join('')}
                </div>
            </div>

            <div class="form-section">
                <div class="section-title">
                    <span class="material-icons">calendar_month</span>
                    <div><h3>Disponibilidade</h3><p>Informe os dias em que o voluntário está disponível.</p></div>
                </div>
                <div class="checkbox-grid days-grid">
                    ${Object.entries(NOMES_DIAS).map(([valor, nome]) => `
                        <label class="checkbox-card"><input type="checkbox" name="disponibilidade" value="${valor}"><span>${nome}</span></label>`).join('')}
                </div>
            </div>

            <div class="form-section">
                <div class="section-title">
                    <span class="material-icons">notes</span>
                    <div><h3>Observações</h3><p>Informações adicionais sobre o voluntário.</p></div>
                </div>
                <div class="form-group">
                    <label for="vObservacoes">Observações</label>
                    <textarea id="vObservacoes" rows="5" placeholder="Digite observações importantes sobre o voluntário..."></textarea>
                </div>
            </div>

            <div class="form-actions">
                <button type="button" class="btn-cancel" id="cancelarVoluntario">Cancelar</button>
                <button type="submit" class="primary"><span class="material-icons">save</span>Salvar Voluntário</button>
            </div>
        </form>
    `;

    main.replaceChildren(
        headerComVoltar('Novo Voluntário', 'Cadastre um novo voluntário e defina suas funções e disponibilidade', gerenciaVoluntarios),
        section
    );

    const form = section.querySelector('form');
    const $ = id => section.querySelector('#' + id);

    // Preenche contato com o que já está no cadastro do membro
    $('vParticipante').addEventListener('change', () => {
        const membro = candidatos.membros.find(m => String(m.id_membro) === $('vParticipante').value);
        $('vTelefone').value = membro?.telefone || '';
        $('vEmail').value = membro?.email || '';
    });

    $('cancelarVoluntario').addEventListener('click', () => abrirSubstituindo(gerenciaVoluntarios));

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const marcados = nome => [...form.querySelectorAll(`input[name="${nome}"]:checked`)].map(c => c.value);
        const dados = {
            id_membro: $('vParticipante').value,
            telefone: $('vTelefone').value,
            email: $('vEmail').value,
            id_departamento: $('vDepartamento').value,
            ativo: $('vStatus').value === 'ativo',
            funcoes: marcados('funcoes'),
            disponibilidade: marcados('disponibilidade'),
            observacoes: $('vObservacoes').value
        };

        if (!dados.id_membro) return mensagemFormulario(form, 'Selecione o participante.');
        if (!dados.funcoes.length) return mensagemFormulario(form, 'Selecione pelo menos uma função.');
        if (!dados.disponibilidade.length) return mensagemFormulario(form, 'Informe pelo menos um dia de disponibilidade.');

        try {
            await enviarDados('voluntarios', 'POST', dados);
            alert('Voluntário cadastrado com sucesso!');
            abrirSubstituindo(gerenciaVoluntarios);
        } catch (erro) {
            mensagemFormulario(form, erro.message);
        }
    });
}
