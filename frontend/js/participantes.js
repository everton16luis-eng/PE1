// =========================================
// PARTICIPANTES (membros, visitantes e contas do sistema)
// =========================================

async function gerenciaParticipantes() {
    registrarRota('participantes');
    marcarMenuAtivo('gerenciaParticipantes');
    const dados = await buscarDados('participantes', { resumo: {}, participantes: [] });
    const main = document.getElementById('main');
    const r = dados.resumo || {};

    // Classificar (promover a membro, apto ao voluntariado, ativar/inativar) é do administrador
    const podeClassificar = usuarioAtual?.perfil === 'ADMINISTRADOR';

    const lista = document.createElement('section');
    lista.className = 'panel';
    lista.innerHTML = `
        <div class="panel-header">
            <div>
                <h2>Lista de Participantes</h2>
                <p class="contador"></p>
            </div>
            <button type="button" class="primary" id="btnNovoParticipante">+ Novo cadastro</button>
        </div>
        <div class="toolbar">
            <input class="search" type="search" placeholder="Buscar participante..." aria-label="Buscar participante">
            <button type="button" class="filtro ativo" data-filtro="todos">Todos</button>
            <button type="button" class="filtro" data-filtro="visitante">Visitantes</button>
            <button type="button" class="filtro" data-filtro="membro">Membros</button>
            <button type="button" class="filtro" data-filtro="menor" title="Menores de 18 anos">Menores</button>
        </div>
        <p class="mensagem-lista" role="status"></p>
        <div class="table-responsive">
            <table class="tabela-cartoes">
                <thead>
                    <tr><th>Participante</th><th>Telefone</th><th>Tipo</th><th>Entrada / visita</th><th>Status</th>${podeClassificar ? '<th>Classificação</th>' : ''}</tr>
                </thead>
                <tbody>
                    ${dados.participantes.map(p => `<tr data-filtro="${p.tipo}" data-menor="${p.menor}" data-id="${p.id}">${celulasParticipante(p, podeClassificar)}</tr>`).join('')
                        || `<tr><td colspan="${podeClassificar ? 6 : 5}" class="vazio">Nenhum participante cadastrado.</td></tr>`}
                </tbody>
            </table>
        </div>
    `;

    const cards = () => cardsEstatisticas([
        ['blue', 'groups', r.total_pessoas, 'Total cadastrados'],
        ['green', 'how_to_reg', r.total_membros, 'Membros'],
        ['purple', 'waving_hand', r.total_visitantes, 'Visitantes'],
        ['orange', 'fiber_new', r.novos_visitantes_mes, 'Visitantes novos este mês']
    ]);
    let secaoCards = cards();

    main.replaceChildren(
        headerInterno('Participantes', 'Cadastro e acompanhamento dos participantes da igreja'),
        secaoCards,
        lista
    );

    configurarFiltros(lista, (linha, filtro) => (filtro === 'menor' ? linha.dataset.menor === 'true' : linha.dataset.filtro === filtro), { exigirInteracao: true });
    lista.querySelector('#btnNovoParticipante').addEventListener('click', novoParticipante);

    const avisar = (texto, erro = false) => {
        const campo = lista.querySelector('.mensagem-lista');
        campo.textContent = texto;
        campo.classList.toggle('erro', erro);
    };

    // Depois de salvar: busca os dados atualizados no backend e troca só a linha
    // daquela pessoa (e os totais). A busca, o filtro e a rolagem continuam como estavam,
    // e a pessoa continua visível na lista.
    async function atualizarParticipante(id, mensagem) {
        const atual = await enviarDados('participantes', 'GET');
        const p = atual.participantes.find(item => item.id === id);
        const linha = lista.querySelector(`tr[data-id="${id}"]`);
        if (p && linha) {
            linha.dataset.filtro = p.tipo;
            linha.dataset.menor = String(p.menor);
            linha.innerHTML = celulasParticipante(p, podeClassificar);
            linha.classList.add('linha-atualizada');
            setTimeout(() => linha.classList.remove('linha-atualizada'), 2000);
        }
        Object.assign(r, atual.resumo || {});
        const novosCards = cards();
        secaoCards.replaceWith(novosCards);
        secaoCards = novosCards;
        avisar(mensagem);
    }

    // Ações de classificação (somente administrador)
    lista.addEventListener('click', async event => {
        const promover = event.target.closest('[data-promover]');
        const apto = event.target.closest('[data-apto]');
        const ativo = event.target.closest('[data-ativo]');

        if (promover) {
            const id = Number(promover.dataset.promover);
            promoverVisitante(id, promover.dataset.nome, () => atualizarParticipante(id, `${promover.dataset.nome} agora é membro.`)
                .catch(erro => avisar(erro.message, true)));
            return;
        }
        if (!apto && !ativo) return;

        const botao = apto || ativo;
        const valor = botao.dataset.valor === 'true';
        const corpo = apto ? { apto_voluntario: valor } : { ativo: valor };
        if (ativo && !valor && !confirm('Inativar esta pessoa? Ela também deixa de ser apta ao voluntariado (o cadastro continua existindo).')) return;

        const id = Number(botao.dataset.apto || botao.dataset.ativo);
        botao.disabled = true;
        try {
            const salvo = await enviarDados(`participantes/${id}`, 'PATCH', corpo);
            await atualizarParticipante(id, `Cadastro de ${salvo.nome_completo || 'participante'} atualizado.`);
        } catch (erro) {
            botao.disabled = false;
            avisar(erro.message, true);
        }
    });
}

// Células de uma linha da lista de participantes (usadas ao montar e ao atualizar a linha)
function celulasParticipante(p, podeClassificar) {
    // Visitante dos últimos 30 dias ainda precisa de acompanhamento
    const recente = p.tipo === 'visitante' && (Date.now() - new Date(p.data)) / 86400000 <= 30;
    const status = !p.ativo
        ? '<span class="badge inactive">Inativo</span>'
        : recente ? '<span class="badge pending">Acompanhar</span>' : '<span class="badge ok">Ativo</span>';
    const voluntariado = p.tipo !== 'membro' ? ''
        : p.voluntario ? ' <span class="badge ok">Voluntário</span>'
        : p.apto ? ' <span class="badge pending">Apto ao voluntariado</span>' : '';
    // Outras participações da mesma pessoa (criança, login de acesso)
    const menor = p.menor ? ` <span class="badge pending" title="Menos de 18 anos — aparece em Crianças">${p.idade < 1 ? 'Bebê' : `${p.idade} anos`}</span>` : '';
    const login = p.perfil ? ` <span class="badge acesso" title="Perfil de acesso ao sistema">Login: ${escapar(PERFIS[p.perfil] || p.perfil)}</span>` : '';
    const tipo = p.tipo === 'membro' ? 'Membro' : 'Visitante';
    // Visitante: tornar membro; membro: aptidão ao voluntariado; todos: ativo/inativo
    const ativar = `<button type="button" class="action-btn com-texto" data-ativo="${p.id}" data-valor="${!p.ativo}">
               <span class="material-icons">${p.ativo ? 'person_off' : 'person'}</span>${p.ativo ? 'Inativar' : 'Reativar'}</button>`;
    const acoes = (p.tipo === 'visitante'
        ? `<button type="button" class="action-btn com-texto" data-promover="${p.id}" data-nome="${escapar(p.nome)}">
               <span class="material-icons">how_to_reg</span>Tornar membro</button>`
        : `<button type="button" class="action-btn com-texto" data-apto="${p.id}" data-valor="${!p.apto}" ${p.ativo ? '' : 'disabled'}>
               <span class="material-icons">${p.apto ? 'remove_done' : 'volunteer_activism'}</span>${p.apto ? 'Retirar apto' : 'Marcar apto'}</button>`) + ativar;
    return `
        <td>
            <div class="person">
                <div class="mini-avatar">${escapar(p.nome.charAt(0).toUpperCase())}</div>
                <div class="info">
                    <strong>${escapar(p.nome)}</strong>
                    <small>${escapar(p.email || p.observacoes || '')}</small>
                </div>
            </div>
        </td>
        <td>${escapar(p.telefone || '—')}</td>
        <td>${tipo}${voluntariado}${menor}${login}</td>
        <td>${formatarDataSimples(p.data) || '—'}</td>
        <td>${status}</td>
        ${podeClassificar ? `<td class="acoes-classificacao">${acoes}</td>` : ''}`;
}

// Administrador: promove um visitante a membro (modal).
// "aoSalvar" é chamado depois do sucesso (a lista atualiza a linha sem recarregar a página).
function promoverVisitante(idVisitante, nome, aoSalvar) {
    const { modal, fechar } = abrirModal('Tornar membro', `${nome} passará a ser membro da igreja.`, `
        <form novalidate>
            <div class="form-grid">
                <div class="form-group"><label for="pmEntrada">Data de entrada na igreja</label><input type="date" id="pmEntrada" required></div>
                <div class="form-group"><label for="pmBatismo">Data do batismo (se houver)</label><input type="date" id="pmBatismo"></div>
                <div class="form-group">
                    <label for="pmCelula">Participa de célula?</label>
                    <select id="pmCelula"><option value="">Não informado</option><option value="sim">Sim</option><option value="nao">Não</option></select>
                </div>
            </div>
            <p class="subtitulo">É a mesma pessoa do cadastro: só muda a classificação (os dados pessoais continuam os mesmos).
               A elegibilidade ao voluntariado é definida depois, em "Marcar apto".</p>
            <div class="form-actions">
                <button type="button" class="btn-cancel" data-cancelar>Cancelar</button>
                <button type="submit" class="primary"><span class="material-icons">how_to_reg</span>Confirmar</button>
            </div>
        </form>`);

    const form = modal.querySelector('form');
    modal.querySelector('#pmEntrada').value = dataDeHoje();
    modal.querySelector('[data-cancelar]').addEventListener('click', fechar);
    form.addEventListener('submit', async event => {
        event.preventDefault();
        const celula = modal.querySelector('#pmCelula').value;
        try {
            await enviarDados(`participantes/${idVisitante}/membro`, 'POST', {
                data_entrada_igreja: modal.querySelector('#pmEntrada').value,
                data_batismo: modal.querySelector('#pmBatismo').value,
                participa_celula: celula === '' ? null : celula === 'sim'
            });
            fechar();
            // A lista atualiza só a linha da pessoa (mantém busca e filtros)
            if (aoSalvar) await aoSalvar();
            else gerenciaParticipantes();
        } catch (erro) {
            // O modal continua aberto, com o que foi digitado
            mensagemFormulario(form, erro.message);
        }
    });
}

async function novoParticipante() {
    registrarRota('participantes/novo');
    const main = document.getElementById('main');

    const section = document.createElement('section');
    section.className = 'grid';
    section.innerHTML = `
        <article class="panel">
            <div class="panel-header"><h2>Cadastro de Pessoa</h2></div>
            <form id="formParticipante" novalidate>
                <div class="form-grid">
                    <div class="field full"><label for="pNome">Nome completo *</label><input id="pNome" maxlength="150" placeholder="Ex.: João da Silva" required></div>
                    <div class="field"><label for="pTelefone">Telefone</label><input id="pTelefone" type="tel" maxlength="20" placeholder="(47) 99999-9999"></div>
                    <div class="field"><label for="pEmail">E-mail</label><input id="pEmail" type="email" maxlength="150" placeholder="email@exemplo.com"></div>
                    <div class="field"><label for="pNascimento">Data de nascimento</label><input id="pNascimento" type="date"></div>
                    <div class="field">
                        <label for="pEstadoCivil">Estado civil</label>
                        <select id="pEstadoCivil">
                            <option value="">Selecione...</option>
                            <option>Solteiro(a)</option><option>Casado(a)</option><option>Divorciado(a)</option>
                            <option>Viúvo(a)</option><option>União estável</option><option>Outro</option>
                        </select>
                    </div>
                    <div class="field"><label for="pEndereco">Endereço</label><input id="pEndereco" maxlength="150" placeholder="Av. dos Expedicionários"></div>
                    <div class="field"><label for="pNumero">Número</label><input id="pNumero" maxlength="20" placeholder="999"></div>
                    <div class="field"><label for="pBairro">Bairro</label><input id="pBairro" maxlength="80" placeholder="Campo d'Água Verde"></div>
                    <div class="field"><label for="pDataVisita">Data da primeira visita</label><input id="pDataVisita" type="date"></div>
                    <div class="field full"><label for="pObservacoes">Observações</label><textarea id="pObservacoes" maxlength="2000" placeholder="Ex.: convidado por..., como conheceu a igreja"></textarea></div>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn-cancel" id="cancelarParticipante">Cancelar</button>
                    <button type="submit" class="primary"><span class="material-icons">save</span>Salvar cadastro</button>
                </div>
            </form>
        </article>
        <article class="panel">
            <div class="panel-header"><h2>Como funciona</h2></div>
            <div class="list">
                <div class="list-row"><div class="mini-avatar">1</div><div class="info"><strong>Um cadastro por pessoa</strong><small>Entra como visitante e passa a valer em todo o sistema: Participantes e, se tiver menos de 18 anos, Crianças.</small></div></div>
                <div class="list-row"><div class="mini-avatar">2</div><div class="info"><strong>Tornar membro</strong><small>Um administrador promove o visitante a membro na lista de participantes.</small></div></div>
                <div class="list-row"><div class="mini-avatar">3</div><div class="info"><strong>Voluntariado</strong><small>O administrador marca o membro como apto; ativo e apto, ele aparece em Voluntários.</small></div></div>
                <div class="list-row"><div class="mini-avatar">4</div><div class="info"><strong>Acesso ao sistema</strong><small>Cadastrar uma pessoa não cria login nem permissões. O acesso é dado a uma pessoa já cadastrada, em Usuários.</small></div></div>
            </div>
        </article>
    `;

    main.replaceChildren(
        headerComVoltar('Novo cadastro', 'Toda pessoa cadastrada entra como visitante', gerenciaParticipantes),
        section
    );

    const form = section.querySelector('#formParticipante');
    const $ = id => section.querySelector('#' + id);
    $('pDataVisita').value = dataDeHoje();
    $('pNascimento').max = dataDeHoje();

    $('cancelarParticipante').addEventListener('click', () => abrirSubstituindo(gerenciaParticipantes));

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!$('pNome').value.trim()) {
            mensagemFormulario(form, 'Informe o nome completo.');
            $('pNome').focus();
            return;
        }
        if ($('pEmail').value && !$('pEmail').checkValidity()) {
            mensagemFormulario(form, 'Informe um e-mail válido.');
            $('pEmail').focus();
            return;
        }

        const dados = {
            nome: $('pNome').value,
            telefone: $('pTelefone').value,
            email: $('pEmail').value,
            data_nascimento: $('pNascimento').value,
            estado_civil: $('pEstadoCivil').value,
            endereco: $('pEndereco').value,
            numero: $('pNumero').value,
            bairro: $('pBairro').value,
            data_visita: $('pDataVisita').value,
            observacoes: $('pObservacoes').value
        };

        const botao = form.querySelector('button[type="submit"]');
        botao.disabled = true;
        try {
            await enviarDados('participantes', 'POST', dados);
            alert(`${dados.nome.trim()} foi cadastrado(a) como visitante.`);
            abrirSubstituindo(gerenciaParticipantes);
        } catch (erro) {
            botao.disabled = false;
            mensagemFormulario(form, erro.message);
        }
    });
}
