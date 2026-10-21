// =========================================
// CRIANÇAS E TURMAS
// =========================================

const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const faixaEtaria = t => (t.idade_minima != null ? `${t.idade_minima} a ${t.idade_maxima} anos` : 'Faixa não definida');

async function gerenciaCriancas() {
    registrarRota('criancas');
    marcarMenuAtivo('gerenciaCriancas');
    const dados = await buscarDados('criancas', { resumo: {}, criancas: [], turmas: [] });
    const main = document.getElementById('main');
    const r = dados.resumo || {};

    const grade = document.createElement('section');
    grade.className = 'grid';
    grade.innerHTML = `
        <article class="panel" id="painelCriancas">
            <div class="panel-header">
                <div><h2>Crianças cadastradas</h2><p class="contador"></p></div>
                <button type="button" class="primary" id="btnNovaCrianca">+ Nova criança</button>
            </div>
            <div class="toolbar">
                <input class="search" type="search" placeholder="Buscar criança ou responsável..." aria-label="Buscar criança ou responsável">
                <button type="button" class="filtro ativo" data-filtro="todos">Todos</button>
                <button type="button" class="filtro" data-filtro="presente">Presentes</button>
                <button type="button" class="filtro" data-filtro="ausente">Ausentes</button>
                ${dados.criancas.some(c => !c.ativo) ? '<button type="button" class="filtro" data-filtro="inativo">Inativas</button>' : ''}
            </div>
            <div class="table-responsive">
                <table class="tabela-cartoes">
                    <thead><tr><th>Criança</th><th>Idade</th><th>Responsável</th><th>Turma</th><th>Presença hoje</th></tr></thead>
                    <tbody>
                        ${dados.criancas.map(c => `
                            <tr data-filtro="${!c.ativo ? 'inativo' : c.presente_hoje ? 'presente' : 'ausente'}">
                                <td>
                                    <div class="person">
                                        <div class="mini-avatar">${escapar(c.nome.charAt(0).toUpperCase())}</div>
                                        <div class="info">
                                            <strong>${escapar(c.nome)}</strong>
                                            <small>Cadastro ${String(c.data_cadastro || '').slice(0, 4)}${c.alergias ? ' • ⚠ ' + escapar(c.alergias) : ''}</small>
                                        </div>
                                    </div>
                                </td>
                                <td>${c.idade < 1 ? 'Bebê' : `${c.idade} ano${c.idade > 1 ? 's' : ''}`}</td>
                                <td>${escapar(c.responsavel || '—')}${c.parentesco ? `<small style="display:block;color:var(--muted)">${escapar(c.parentesco)} • ${escapar(c.telefone || '')}</small>` : ''}</td>
                                <td>${escapar(c.turma || 'Sem turma')}</td>
                                <td>${!c.ativo ? '<span class="badge inactive">Cadastro inativo</span>' : c.presente_hoje ? '<span class="badge ok">Presente</span>' : '<span class="badge pending">Ausente</span>'}</td>
                            </tr>`).join('') || '<tr><td colspan="5" class="vazio">Nenhuma criança cadastrada.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </article>

        <article class="panel">
            <div class="panel-header">
                <h2>Turmas</h2>
                <button type="button" id="btnGerenciarTurmas">Gerenciar</button>
            </div>
            <div class="list">
                ${dados.turmas.map((t, i) => `
                    <div class="list-row">
                        <div class="mini-avatar">${i + 1}</div>
                        <div class="info"><strong>${escapar(t.nome)}</strong><small>${faixaEtaria(t)} • ${t.criancas} criança(s)</small></div>
                        <span class="badge ${t.ativo ? 'ok' : 'inactive'}">${t.ativo ? 'Ativa' : 'Inativa'}</span>
                    </div>`).join('') || '<p class="vazio">Nenhuma turma cadastrada.</p>'}
            </div>
            <p class="aviso" style="font-size:12px;color:var(--muted);margin-top:12px;">A presença do dia é registrada na Lista de presença.</p>
        </article>
    `;

    main.replaceChildren(
        headerInterno('Crianças', 'Controle de crianças, responsáveis, turmas e presença'),
        cardsEstatisticas([
            ['blue', 'child_care', r.criancas, 'Crianças ativas'],
            ['green', 'how_to_reg', r.presentes_hoje, 'Presentes hoje'],
            ['purple', 'class', r.turmas, 'Turmas ativas'],
            ['orange', 'family_restroom', r.responsaveis, 'Responsáveis']
        ]),
        grade
    );

    configurarFiltros(grade.querySelector('#painelCriancas'), (linha, filtro) => linha.dataset.filtro === filtro, { exigirInteracao: true });
    grade.querySelector('#btnNovaCrianca').addEventListener('click', () => novaCrianca(dados.turmas));
    grade.querySelector('#btnGerenciarTurmas').addEventListener('click', gerenciaTurmas);
}

function novaCrianca(turmas) {
    registrarRota('criancas/nova', [turmas]);
    const main = document.getElementById('main');
    const ativas = turmas.filter(t => t.ativo);

    const section = document.createElement('section');
    section.className = 'panel volunteer-form';
    section.innerHTML = `
        <form id="formCrianca" novalidate>
            <div class="form-section">
                <div class="section-title"><span class="material-icons">child_care</span><div><h3>Dados da criança</h3><p>Informações básicas</p></div></div>
                <div class="form-grid">
                    <div class="form-group"><label for="cNome">Nome completo</label><input type="text" id="cNome" placeholder="Digite o nome completo" required></div>
                    <div class="form-group"><label for="cNascimento">Data de nascimento</label><input type="date" id="cNascimento" required></div>
                    <div class="form-group">
                        <label for="cSexo">Sexo</label>
                        <select id="cSexo" required><option value="">Selecione</option><option value="feminino">Feminino</option><option value="masculino">Masculino</option></select>
                    </div>
                    <div class="form-group">
                        <label for="cStatus">Status</label>
                        <select id="cStatus"><option value="ativo">Ativo</option><option value="inativo">Inativo</option></select>
                    </div>
                </div>
            </div>

            <div class="form-section">
                <div class="section-title"><span class="material-icons">family_restroom</span><div><h3>Responsável</h3><p>Quem acompanha a criança</p></div></div>
                <div class="form-grid">
                    <div class="form-group"><label for="cResponsavel">Nome do responsável</label><input type="text" id="cResponsavel" placeholder="Nome completo do responsável" required></div>
                    <div class="form-group">
                        <label for="cParentesco">Parentesco</label>
                        <select id="cParentesco" required>
                            <option value="">Selecione</option><option value="mae">Mãe</option><option value="pai">Pai</option>
                            <option value="avo">Avó/Avô</option><option value="tio">Tia/Tio</option><option value="responsavel">Outro responsável</option>
                        </select>
                    </div>
                    <div class="form-group"><label for="cTelefone">Telefone</label><input type="tel" id="cTelefone" placeholder="(00) 00000-0000" required></div>
                    <div class="form-group"><label for="cEmail">E-mail</label><input type="email" id="cEmail" placeholder="responsavel@email.com"></div>
                </div>
            </div>

            <div class="form-section">
                <div class="section-title"><span class="material-icons">class</span><div><h3>Turma e participação</h3><p>A turma é sugerida pela idade</p></div></div>
                <div class="form-grid">
                    <div class="form-group">
                        <label for="cTurma">Turma</label>
                        <select id="cTurma" required>
                            <option value="">Selecione uma turma</option>
                            ${ativas.map(t => `<option value="${t.id_turma}">${escapar(t.nome)}${t.nome.includes(' anos') ? '' : ` — ${faixaEtaria(t)}`}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group"><label for="cDataCadastro">Data de cadastro</label><input type="date" id="cDataCadastro" required></div>
                </div>
            </div>

            <div class="form-section">
                <div class="section-title"><span class="material-icons">medical_information</span><div><h3>Informações adicionais</h3><p>Cuidados importantes</p></div></div>
                <div class="form-grid">
                    <div class="form-group"><label for="cAlergias">Alergias ou cuidados</label><input type="text" id="cAlergias" placeholder="Ex.: alergia alimentar, cuidados especiais"></div>
                    <div class="form-group"><label for="cObservacoes">Observações</label><textarea id="cObservacoes" rows="3" placeholder="Digite outras informações importantes..."></textarea></div>
                </div>
            </div>

            <div class="form-section">
                <div class="section-title"><span class="material-icons">verified_user</span><div><h3>Autorizações</h3><p>Consentimento dos responsáveis</p></div></div>
                <div class="checkbox-grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr));">
                    <label class="checkbox-card">
                        <input type="checkbox" id="cAutorizacao">
                        <div><strong>Autorização dos responsáveis</strong><small>Responsável autorizou a participação da criança nas atividades da igreja.</small></div>
                    </label>
                    <label class="checkbox-card">
                        <input type="checkbox" id="cImagem">
                        <div><strong>Autorização de imagem</strong><small>Responsável autorizou o uso de imagens da criança nas atividades da igreja.</small></div>
                    </label>
                </div>
            </div>

            <div class="form-actions">
                <button type="button" class="btn-cancel" id="cancelarCrianca">Cancelar</button>
                <button type="submit" class="primary"><span class="material-icons">save</span>Salvar criança</button>
            </div>
        </form>
    `;

    main.replaceChildren(headerComVoltar('Nova Criança', 'Cadastre uma nova criança no sistema', gerenciaCriancas), section);

    const form = section.querySelector('form');
    const $ = id => section.querySelector('#' + id);
    $('cDataCadastro').value = dataDeHoje();

    // Sugere a turma pela idade
    $('cNascimento').addEventListener('change', () => {
        if (!$('cNascimento').value) return;
        const nascimento = new Date($('cNascimento').value + 'T00:00:00');
        const hoje = new Date();
        let idade = hoje.getFullYear() - nascimento.getFullYear();
        if (hoje < new Date(hoje.getFullYear(), nascimento.getMonth(), nascimento.getDate())) idade--;
        const turma = ativas.find(t => idade >= t.idade_minima && idade <= t.idade_maxima);
        if (turma) $('cTurma').value = turma.id_turma;
    });

    $('cancelarCrianca').addEventListener('click', () => abrirSubstituindo(gerenciaCriancas));

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!$('cAutorizacao').checked) return mensagemFormulario(form, 'É necessário confirmar a autorização do responsável.');

        const dados = {
            nome: $('cNome').value,
            data_nascimento: $('cNascimento').value,
            sexo: $('cSexo').value,
            ativo: $('cStatus').value === 'ativo',
            id_turma: $('cTurma').value,
            data_cadastro: $('cDataCadastro').value,
            alergias: $('cAlergias').value,
            observacoes: $('cObservacoes').value,
            autorizacao_responsavel: $('cAutorizacao').checked,
            autorizacao_imagem: $('cImagem').checked,
            responsavel: {
                nome: $('cResponsavel').value,
                parentesco: $('cParentesco').value,
                telefone: $('cTelefone').value,
                email: $('cEmail').value
            }
        };

        try {
            await enviarDados('criancas', 'POST', dados);
            alert('Criança cadastrada com sucesso!');
            abrirSubstituindo(gerenciaCriancas);
        } catch (erro) {
            mensagemFormulario(form, erro.message);
        }
    });
}

async function gerenciaTurmas() {
    registrarRota('turmas');
    marcarMenuAtivo('gerenciaCriancas');
    const dados = await buscarDados('turmas', { resumo: {}, turmas: [], responsaveis: [] });
    const main = document.getElementById('main');
    const r = dados.resumo || {};

    const painel = document.createElement('section');
    painel.className = 'panel';
    painel.innerHTML = `
        <div class="panel-header">
            <div><h2>Turmas cadastradas</h2><p class="panel-description">Consulte e gerencie as turmas da igreja.</p></div>
            <button type="button" class="primary" id="btnNovaTurma">+ Nova turma</button>
        </div>
        <div class="toolbar">
            <input class="search" type="search" placeholder="Buscar turma ou responsável..." aria-label="Buscar turma ou responsável">
            <button type="button" class="filtro ativo" data-filtro="todos">Todas</button>
            <button type="button" class="filtro" data-filtro="ativa">Ativas</button>
            <button type="button" class="filtro" data-filtro="inativa">Inativas</button>
        </div>
        <div class="table-responsive">
            <table class="tabela-cartoes">
                <thead><tr><th>Turma</th><th>Faixa etária</th><th>Crianças</th><th>Responsável</th><th>Dia</th><th>Status</th><th>Ações</th></tr></thead>
                <tbody>
                    ${dados.turmas.map(t => `
                        <tr data-filtro="${t.ativo ? 'ativa' : 'inativa'}">
                            <td><strong>${escapar(t.nome)}</strong></td>
                            <td>${faixaEtaria(t)}</td>
                            <td>${t.criancas}</td>
                            <td>${escapar(t.responsavel || '—')}</td>
                            <td>${escapar(t.dia_semana)} ${formatarHora(t.horario)}</td>
                            <td><span class="badge ${t.ativo ? 'ok' : 'pending'}">${t.ativo ? 'Ativa' : 'Inativa'}</span></td>
                            <td>
                                <button type="button" class="action-btn" data-editar="${t.id_turma}" title="Editar" aria-label="Editar ${escapar(t.nome)}"><span class="material-icons">edit</span></button>
                                <button type="button" class="action-btn" data-excluir="${t.id_turma}" title="Excluir" aria-label="Excluir ${escapar(t.nome)}"><span class="material-icons">delete</span></button>
                            </td>
                        </tr>`).join('') || '<tr><td colspan="7" class="vazio">Nenhuma turma cadastrada.</td></tr>'}
                </tbody>
            </table>
        </div>
    `;

    main.replaceChildren(
        headerComVoltar('Gerenciar Turmas', 'Gerencie as turmas, responsáveis e faixas etárias', gerenciaCriancas),
        cardsEstatisticas([
            ['blue', 'groups', r.total, 'Total de turmas'],
            ['green', 'check_circle', r.ativas, 'Turmas ativas'],
            ['purple', 'child_care', r.criancas, 'Crianças matriculadas'],
            ['orange', 'person', r.responsaveis, 'Responsáveis']
        ]),
        painel
    );

    configurarFiltros(painel, (linha, filtro) => linha.dataset.filtro === filtro);
    painel.querySelector('#btnNovaTurma').addEventListener('click', () => modalTurma(null, dados.responsaveis));

    painel.addEventListener('click', async event => {
        const editar = event.target.closest('[data-editar]');
        const excluir = event.target.closest('[data-excluir]');
        if (editar) modalTurma(dados.turmas.find(t => t.id_turma === Number(editar.dataset.editar)), dados.responsaveis);
        if (excluir) {
            const turma = dados.turmas.find(t => t.id_turma === Number(excluir.dataset.excluir));
            if (!confirm(`Excluir a turma "${turma.nome}"?`)) return;
            try {
                await enviarDados(`turmas/${turma.id_turma}`, 'DELETE');
                gerenciaTurmas();
            } catch (erro) {
                alert(erro.message);
            }
        }
    });
}

function modalTurma(turma, responsaveis) {
    const editar = Boolean(turma);
    const { modal, fechar } = abrirModal(editar ? 'Editar turma' : 'Nova turma', editar ? turma.nome : 'Cadastre uma nova turma.', `
        <form id="formTurma" novalidate>
            <div class="form-grid">
                <div class="form-group full"><label for="tNome">Nome da turma</label><input type="text" id="tNome" placeholder="Ex.: Kids 1" required></div>
                <div class="form-group"><label for="tMin">Idade mínima</label><input type="number" id="tMin" min="0" max="99" required></div>
                <div class="form-group"><label for="tMax">Idade máxima</label><input type="number" id="tMax" min="0" max="99" required></div>
                <div class="form-group">
                    <label for="tResponsavel">Responsável</label>
                    <select id="tResponsavel">
                        <option value="">Selecione</option>
                        ${responsaveis.map(p => `<option value="${p.id_membro}">${escapar(p.nome_completo)}${p.kids ? ' (Kids)' : ''}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label for="tDia">Dia da semana</label>
                    <select id="tDia" required>${DIAS_SEMANA.map(d => `<option>${d}</option>`).join('')}</select>
                </div>
                <div class="form-group"><label for="tHorario">Horário</label><input type="time" id="tHorario" value="09:00"></div>
                <div class="form-group">
                    <label for="tStatus">Status</label>
                    <select id="tStatus"><option value="ativa">Ativa</option><option value="inativa">Inativa</option></select>
                </div>
                <div class="form-group full"><label for="tObservacoes">Observações</label><textarea id="tObservacoes" rows="3" placeholder="Informações adicionais sobre a turma..."></textarea></div>
            </div>
            <div class="form-actions">
                <button type="button" class="btn-cancel" data-cancelar>Cancelar</button>
                <button type="submit" class="primary">Salvar turma</button>
            </div>
        </form>
    `);

    const form = modal.querySelector('form');
    const $ = id => modal.querySelector('#' + id);
    if (editar) {
        $('tNome').value = turma.nome;
        $('tMin').value = turma.idade_minima ?? '';
        $('tMax').value = turma.idade_maxima ?? '';
        $('tResponsavel').value = turma.id_membro_responsavel || '';
        $('tDia').value = turma.dia_semana;
        $('tHorario').value = formatarHora(turma.horario);
        $('tStatus').value = turma.ativo ? 'ativa' : 'inativa';
        $('tObservacoes').value = turma.observacoes || '';
    }
    $('tNome').focus();
    modal.querySelector('[data-cancelar]').addEventListener('click', fechar);

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const dados = {
            nome: $('tNome').value,
            idade_minima: $('tMin').value,
            idade_maxima: $('tMax').value,
            id_membro_responsavel: $('tResponsavel').value,
            dia_semana: $('tDia').value,
            horario: $('tHorario').value,
            ativo: $('tStatus').value === 'ativa',
            observacoes: $('tObservacoes').value
        };
        try {
            await enviarDados(editar ? `turmas/${turma.id_turma}` : 'turmas', editar ? 'PUT' : 'POST', dados);
            fechar();
            gerenciaTurmas();
        } catch (erro) {
            mensagemFormulario(form, erro.message);
        }
    });
}
