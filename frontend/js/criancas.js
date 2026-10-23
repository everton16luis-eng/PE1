// =========================================
// CRIANÇAS E TURMAS
// =========================================

const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const faixaEtaria = t => (t.idade_minima != null ? `${t.idade_minima} a ${t.idade_maxima} anos` : 'Faixa não definida');

async function gerenciaCriancas() {
    registrarRota('criancas');
    const ativa = paginaAtiva();
    marcarMenuAtivo('gerenciaCriancas');
    const dados = await buscarDados('criancas', { resumo: {}, criancas: [], turmas: [] });
    if (!ativa()) return;
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
                ${dados.criancas.some(c => !c.tem_ficha) ? '<button type="button" class="filtro" data-filtro="sem-ficha">Sem ficha</button>' : ''}
            </div>
            <div class="table-responsive">
                <table class="tabela-cartoes">
                    <thead><tr><th>Criança</th><th>Idade</th><th>Responsável</th><th>Turma</th><th>Presença hoje</th><th>Ação</th></tr></thead>
                    <tbody>
                        ${dados.criancas.map(c => `
                            <tr data-filtro="${!c.ativo ? 'inativo' : c.presente_hoje ? 'presente' : 'ausente'}" data-ficha="${c.tem_ficha}">
                                <td>
                                    <div class="person">
                                        <div class="mini-avatar">${escapar(c.nome.charAt(0).toUpperCase())}</div>
                                        <div class="info">
                                            <strong>${escapar(c.nome)}</strong>
                                            <small>${c.tem_ficha ? `Ficha desde ${String(c.data_cadastro || '').slice(0, 4)}` : 'Sem ficha infantil'}${c.alergias ? ' • ⚠ ' + escapar(c.alergias) : ''}</small>
                                        </div>
                                    </div>
                                </td>
                                <td>${c.idade < 1 ? 'Bebê' : `${c.idade} ano${c.idade > 1 ? 's' : ''}`}</td>
                                <td>${escapar(c.responsavel || '—')}${c.parentesco ? `<small style="display:block;color:var(--muted)">${escapar(c.parentesco)} • ${escapar(c.telefone || '')}</small>` : ''}</td>
                                <td>${c.tem_ficha ? escapar(c.turma || 'Sem turma') : '<span class="badge pending">Ficha a completar</span>'}</td>
                                <td>${!c.ativo ? '<span class="badge inactive">Cadastro inativo</span>' : c.presente_hoje ? '<span class="badge ok">Presente</span>' : '<span class="badge pending">Ausente</span>'}</td>
                                <td>${c.tem_ficha ? `<button type="button" class="action-btn com-texto" data-retirada="${c.id_crianca}"><span class="material-icons">how_to_reg</span>Retirada</button>`
                                    : `<button type="button" class="action-btn com-texto" data-completar="${c.id_membro}"><span class="material-icons">assignment_ind</span>Completar ficha</button>`}</td>
                            </tr>`).join('') || '<tr><td colspan="6" class="vazio">Nenhuma pessoa com menos de 18 anos no cadastro.</td></tr>'}
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
        headerInterno('Crianças', 'Pessoas do cadastro com menos de 18 anos: responsáveis, turmas e presença'),
        cardsEstatisticas([
            ['blue', 'child_care', r.criancas, 'Menores de 18 ativos'],
            ['green', 'how_to_reg', r.presentes_hoje, 'Presentes hoje'],
            ['purple', 'assignment_ind', r.sem_ficha, 'Ficha infantil a completar'],
            ['orange', 'family_restroom', r.responsaveis, 'Responsáveis']
        ]),
        grade
    );

    configurarFiltros(grade.querySelector('#painelCriancas'),
        (linha, filtro) => (filtro === 'sem-ficha' ? linha.dataset.ficha === 'false' : linha.dataset.filtro === filtro),
        { exigirInteracao: true });
    grade.querySelector('#btnNovaCrianca').addEventListener('click', () => novaCrianca(dados.turmas));
    // Pessoa menor de 18 já cadastrada: completa a ficha infantil (sem cadastrar de novo)
    grade.querySelector('#painelCriancas').addEventListener('click', event => {
        const retirada = event.target.closest('[data-retirada]');
        if (retirada) return modalRetirada(Number(retirada.dataset.retirada));
        const botao = event.target.closest('[data-completar]');
        if (!botao) return;
        const pessoa = dados.criancas.find(c => c.id_membro === Number(botao.dataset.completar));
        if (pessoa) novaCrianca(dados.turmas, { id_membro: pessoa.id_membro, nome: pessoa.nome, data_nascimento: pessoa.data_nascimento });
    });
    grade.querySelector('#btnGerenciarTurmas').addEventListener('click', gerenciaTurmas);
}

// Ficha infantil. Sem "pessoa": cadastra a criança na base universal + a ficha.
// Com "pessoa" (já cadastrada, menor de 18): só completa a ficha dela.
function novaCrianca(turmas, pessoa = null) {
    registrarRota('criancas/nova', [turmas, pessoa]);
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
                    <label class="checkbox-card">
                        <input type="checkbox" id="cRetirada">
                        <div><strong>Responsável pode buscar a criança</strong><small>Autoriza este responsável a retirar a criança na turma. Outras pessoas são cadastradas depois, em "Retirada".</small></div>
                    </label>
                </div>
            </div>

            <div class="form-actions">
                <button type="button" class="btn-cancel" id="cancelarCrianca">Cancelar</button>
                <button type="submit" class="primary"><span class="material-icons">save</span>Salvar criança</button>
            </div>
        </form>
    `;

    main.replaceChildren(pessoa
        ? headerComVoltar('Completar ficha infantil', `${pessoa.nome} já está no cadastro: preencha os dados da área infantil`, gerenciaCriancas)
        : headerComVoltar('Nova Criança', 'A criança entra no cadastro universal (como visitante) com a ficha infantil', gerenciaCriancas), section);

    const form = section.querySelector('form');
    const $ = id => section.querySelector('#' + id);
    $('cDataCadastro').value = dataDeHoje();

    // Só menores de 18 anos: nasceu depois de "hoje menos 18 anos" e até hoje
    const [ano, mes, dia] = dataDeHoje().split('-').map(Number);
    $('cNascimento').max = dataDeHoje();
    $('cNascimento').min = new Date(ano - 18, mes - 1, dia + 1).toLocaleDateString('sv-SE');

    // Nome e nascimento vêm do cadastro da pessoa (não são editados aqui)
    if (pessoa) {
        $('cNome').value = pessoa.nome;
        $('cNascimento').value = String(pessoa.data_nascimento || '').slice(0, 10);
        $('cNome').readOnly = true;
        $('cNascimento').readOnly = true;
    }

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
    if (pessoa) $('cNascimento').dispatchEvent(new Event('change'));

    $('cancelarCrianca').addEventListener('click', () => abrirSubstituindo(gerenciaCriancas));

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!$('cAutorizacao').checked) return mensagemFormulario(form, 'É necessário confirmar a autorização do responsável.');

        const dados = {
            id_membro: pessoa?.id_membro || null,
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
                email: $('cEmail').value,
                autorizado_retirada: $('cRetirada').checked
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
    const ativa = paginaAtiva();
    marcarMenuAtivo('gerenciaCriancas');
    const dados = await buscarDados('turmas', { resumo: {}, turmas: [], responsaveis: [] });
    if (!ativa()) return;
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

// Quem pode buscar a criança na turma: marcar/desmarcar e cadastrar outra pessoa autorizada
async function modalRetirada(idCrianca) {
    const { modal } = abrirModal('Retirada da criança', 'Quem pode buscar a criança na turma', '<p class="vazio">Carregando...</p>');
    const corpo = modal.querySelector('.modal-corpo');
    async function desenhar(mensagem = '') {
        let dados;
        try { dados = await enviarDados(`criancas/${idCrianca}/responsaveis`, 'GET'); } catch (erro) { corpo.innerHTML = `<p class="vazio">${escapar(erro.message)}</p>`; return; }
        modal.querySelector('.modal-header p').textContent = dados.nome;
        corpo.innerHTML = `
            <p class="subtitulo">Só quem estiver marcado aparece como autorizado na saída da turma. Ninguém é autorizado automaticamente.</p>
            <div class="lista-responsaveis">${dados.responsaveis.map(r => `
                <label class="responsavel-item opcao-radio">
                    <input type="checkbox" data-autorizar="${r.id_responsavel}" ${r.autorizado_retirada ? 'checked' : ''}>
                    <span><strong>${escapar(r.nome)}</strong>
                        <small>${escapar(r.parentesco || 'Responsável')}${r.principal ? ' · principal' : ''}${r.telefone ? ` · ${escapar(r.telefone)}` : ''}</small>
                        ${r.autorizacao_atualizada_em ? `<small>Atualizado em ${new Date(r.autorizacao_atualizada_em).toLocaleString('pt-BR')}${r.autorizacao_atualizada_por ? ` por ${escapar(r.autorizacao_atualizada_por)}` : ''}</small>` : ''}</span>
                </label>`).join('') || '<p class="vazio">Nenhum responsável cadastrado.</p>'}</div>
            <p class="mensagem-lista" role="status">${escapar(mensagem)}</p>
            <form novalidate class="form-responsavel">
                <h3 class="titulo-secao">Cadastrar outra pessoa</h3>
                <div class="form-grid">
                    <div class="form-group"><label for="rNome">Nome completo</label><input type="text" id="rNome" required></div>
                    <div class="form-group"><label for="rParentesco">Parentesco</label>
                        <select id="rParentesco" required><option value="">Selecione</option><option value="mae">Mãe</option><option value="pai">Pai</option>
                            <option value="avo">Avó/Avô</option><option value="tio">Tia/Tio</option><option value="responsavel">Outro responsável</option></select></div>
                    <div class="form-group"><label for="rTelefone">Telefone</label><input type="tel" id="rTelefone" required></div>
                    <div class="form-group"><label for="rEmail">E-mail</label><input type="email" id="rEmail"></div>
                </div>
                <label class="opcao-radio"><input type="checkbox" id="rAutorizado"><span>Pode buscar a criança</span></label>
                <div class="form-actions"><button type="submit" class="primary">Adicionar</button></div>
            </form>`;
        corpo.querySelectorAll('[data-autorizar]').forEach(caixa => caixa.addEventListener('change', async () => {
            caixa.disabled = true;
            try {
                const r = await enviarDados(`criancas/${idCrianca}/responsaveis/${caixa.dataset.autorizar}`, 'PATCH', { autorizado_retirada: caixa.checked });
                desenhar(r.mensagem);
            } catch (erro) { caixa.checked = !caixa.checked; caixa.disabled = false; corpo.querySelector('.mensagem-lista').textContent = erro.message; }
        }));
        const form = corpo.querySelector('form');
        form.addEventListener('submit', async event => {
            event.preventDefault();
            try {
                await enviarDados(`criancas/${idCrianca}/responsaveis`, 'POST', {
                    nome: form.querySelector('#rNome').value, parentesco: form.querySelector('#rParentesco').value,
                    telefone: form.querySelector('#rTelefone').value, email: form.querySelector('#rEmail').value,
                    autorizado_retirada: form.querySelector('#rAutorizado').checked
                });
                desenhar('Pessoa cadastrada.');
            } catch (erro) { mensagemFormulario(form, erro.message); }
        });
    }
    desenhar();
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
