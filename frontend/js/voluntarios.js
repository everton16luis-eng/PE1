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
            <button type="button" class="filtro" data-filtro="ativo">Servindo</button>
            <button type="button" class="filtro" data-filtro="inativo">Pausados</button>
            <button type="button" class="filtro" data-filtro="sem-ficha">Sem ficha</button>
        </div>
        <div class="table-responsive">
            <table class="tabela-cartoes">
                <thead>
                    <tr><th>Voluntário</th><th>Funções</th><th>Disponibilidade</th><th>Última escala</th><th>Status</th><th>Ação</th></tr>
                </thead>
                <tbody>
                    ${dados.voluntarios.map(v => {
                        // Pessoa ativa e apta; a ficha (funções, dias) pode ainda não existir
                        const filtro = !v.tem_ficha ? 'sem-ficha' : v.ativo ? 'ativo' : 'inativo';
                        const status = !v.tem_ficha
                            ? '<span class="badge pending">Ficha a completar</span>'
                            : v.ativo ? '<span class="badge ok">Servindo</span>' : '<span class="badge inactive">Pausado</span>';
                        const acoes = !v.tem_ficha
                            ? `<button type="button" class="action-btn com-texto" data-completar="${v.id_membro}">
                                   <span class="material-icons">assignment_ind</span>Completar ficha</button>`
                            : `<button type="button" class="action-btn" data-ficha="${v.id_voluntario}" title="Ver ficha" aria-label="Ver ficha de ${escapar(v.nome)}">
                                   <span class="material-icons">badge</span>
                               </button>
                               <button type="button" class="action-btn" data-status="${v.id_voluntario}" data-ativo="${v.ativo}"
                                       title="${v.ativo ? 'Pausar' : 'Retomar'}" aria-label="${v.ativo ? 'Pausar' : 'Retomar'} ${escapar(v.nome)}">
                                   <span class="material-icons">${v.ativo ? 'pause_circle' : 'play_circle'}</span>
                               </button>`;
                        return `
                        <tr data-filtro="${filtro}">
                            <td>
                                <div class="person">
                                    <div class="mini-avatar">${escapar(v.nome.charAt(0).toUpperCase())}</div>
                                    <div class="info">
                                        ${v.tem_ficha
                                            ? `<a href="#" class="link-ficha" data-ficha="${v.id_voluntario}"><strong>${escapar(v.nome)}</strong></a>`
                                            : `<strong>${escapar(v.nome)}</strong>`}
                                        <small>${escapar(v.departamento || 'Sem departamento')}</small>
                                    </div>
                                </div>
                            </td>
                            <td>${escapar(v.funcoes.map(f => f.nome).join(', ') || '—')}</td>
                            <td>${escapar(nomesDosDias(v.disponibilidade) || '—')}</td>
                            <td>${formatarDataSimples(v.ultima_escala) || '—'}</td>
                            <td>${status}</td>
                            <td>${acoes}</td>
                        </tr>`;
                    }).join('') || '<tr><td colspan="6" class="vazio">Nenhuma pessoa ativa e apta ao voluntariado. O administrador marca "apto" em Participantes.</td></tr>'}
                </tbody>
            </table>
        </div>
    `;

    main.replaceChildren(
        headerInterno('Voluntários', 'Pessoas ativas e aptas ao voluntariado, com funções e disponibilidade'),
        cardsEstatisticas([
            ['blue', 'volunteer_activism', r.total, 'Ativos e aptos'],
            ['green', 'check_circle', r.ativos, 'Servindo'],
            ['purple', 'assignment_ind', r.sem_ficha, 'Ficha a completar'],
            ['orange', 'pause_circle', r.inativos, 'Pausados']
        ]),
        lista
    );

    configurarFiltros(lista, (linha, filtro) => linha.dataset.filtro === filtro, { exigirInteracao: true });
    lista.querySelector('#btnNovoVoluntario').addEventListener('click', () => novoVoluntario());

    lista.addEventListener('click', async event => {
        const ficha = event.target.closest('[data-ficha]');
        if (ficha) {
            event.preventDefault();
            fichaVoluntario(Number(ficha.dataset.ficha));
            return;
        }
        const completar = event.target.closest('[data-completar]');
        if (completar) {
            novoVoluntario(Number(completar.dataset.completar));
            return;
        }
        const botao = event.target.closest('[data-status]');
        if (!botao) return;
        const ativar = botao.dataset.ativo !== 'true';
        if (!confirm(ativar ? 'Retomar o serviço deste voluntário?' : 'Pausar este voluntário? Ele deixa de aparecer nas novas escalas (continua ativo e apto no cadastro).')) return;
        try {
            await enviarDados(`voluntarios/${botao.dataset.status}/status`, 'PATCH', { ativo: ativar });
            gerenciaVoluntarios();
        } catch (erro) {
            alert(erro.message);
        }
    });
}

// Ficha de voluntário para uma pessoa ativa e apta (idMembro = já escolhida na lista)
async function novoVoluntario(idMembro = null) {
    registrarRota('voluntarios/novo', idMembro ? [idMembro] : []);
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
                            ${candidatos.membros.map(m => `<option value="${m.id_membro}">${escapar(m.nome_completo)}</option>`).join('')}
                        </select>
                        <small>Aparecem só pessoas ativas e aptas sem ficha. Para alguém novo: Cadastro em Participantes → tornar membro → marcar apto.</small>
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

    // Vindo de "Completar ficha": a pessoa já vem escolhida
    if (idMembro && candidatos.membros.some(m => m.id_membro === idMembro)) {
        $('vParticipante').value = String(idMembro);
        $('vParticipante').dispatchEvent(new Event('change'));
    }

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
