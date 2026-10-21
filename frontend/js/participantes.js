// =========================================
// PARTICIPANTES (membros e visitantes)
// =========================================

async function gerenciaParticipantes() {
    registrarRota('participantes');
    marcarMenuAtivo('gerenciaParticipantes');
    const dados = await buscarDados('participantes', { resumo: {}, participantes: [] });
    const main = document.getElementById('main');
    const r = dados.resumo || {};

    const lista = document.createElement('section');
    lista.className = 'panel';
    lista.innerHTML = `
        <div class="panel-header">
            <div>
                <h2>Lista de Participantes</h2>
                <p class="contador"></p>
            </div>
            <button type="button" class="primary" id="btnNovoParticipante">+ Novo participante</button>
        </div>
        <div class="toolbar">
            <input class="search" type="search" placeholder="Buscar participante..." aria-label="Buscar participante">
            <button type="button" class="filtro ativo" data-filtro="todos">Todos</button>
            <button type="button" class="filtro" data-filtro="visitante">Visitantes</button>
            <button type="button" class="filtro" data-filtro="membro">Membros</button>
        </div>
        <div class="table-responsive">
            <table>
                <thead>
                    <tr><th>Participante</th><th>Telefone</th><th>Tipo</th><th>Entrada / visita</th><th>Status</th></tr>
                </thead>
                <tbody>
                    ${dados.participantes.map(p => {
                        // Visitante dos últimos 30 dias ainda precisa de acompanhamento
                        const recente = p.tipo === 'visitante' && (Date.now() - new Date(p.data)) / 86400000 <= 30;
                        const status = !p.ativo
                            ? '<span class="badge inactive">Inativo</span>'
                            : recente ? '<span class="badge pending">Acompanhar</span>' : '<span class="badge ok">Ativo</span>';
                        return `
                            <tr data-filtro="${p.tipo}">
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
                                <td>${p.tipo === 'membro' ? 'Membro' : 'Visitante'}</td>
                                <td>${formatarDataSimples(p.data) || '—'}</td>
                                <td>${status}</td>
                            </tr>`;
                    }).join('') || '<tr><td colspan="5" class="vazio">Nenhum participante cadastrado.</td></tr>'}
                </tbody>
            </table>
        </div>
    `;

    main.replaceChildren(
        headerInterno('Participantes', 'Cadastro e acompanhamento dos participantes da igreja'),
        cardsEstatisticas([
            ['blue', 'groups', r.total_pessoas, 'Total cadastrados'],
            ['green', 'how_to_reg', r.total_membros, 'Membros'],
            ['purple', 'waving_hand', r.total_visitantes, 'Visitantes'],
            ['orange', 'fiber_new', r.novos_visitantes_mes, 'Visitantes novos este mês']
        ]),
        lista
    );

    configurarFiltros(lista, (linha, filtro) => linha.dataset.filtro === filtro, { exigirInteracao: true });
    lista.querySelector('#btnNovoParticipante').addEventListener('click', novoParticipante);
}

async function novoParticipante() {
    registrarRota('participantes/novo');
    const funcoes = await buscarDados('funcoes', []);
    const main = document.getElementById('main');

    const section = document.createElement('section');
    section.className = 'grid';
    section.innerHTML = `
        <article class="panel">
            <div class="panel-header"><h2>Cadastro de Participante</h2></div>
            <form id="formParticipante" novalidate>
                <div class="form-grid">
                    <div class="field full">
                        <label for="tipoParticipante">Tipo de cadastro</label>
                        <select id="tipoParticipante">
                            <option value="membro">Membro</option>
                            <option value="visitante">Visitante</option>
                        </select>
                    </div>
                    <div class="field full"><label for="pNome">Nome completo</label><input id="pNome" placeholder="Ex.: João da Silva" required></div>
                    <div class="field"><label for="pTelefone">Telefone</label><input id="pTelefone" type="tel" placeholder="(47) 99999-9999"></div>

                    <!-- Só para visitante -->
                    <div class="field so-visitante"><label for="pDataVisita">Data da visita</label><input id="pDataVisita" type="date"></div>

                    <!-- Só para membro -->
                    <div class="field so-membro"><label for="pEmail">E-mail</label><input id="pEmail" type="email" placeholder="email@exemplo.com"></div>
                    <div class="field so-membro"><label for="pNascimento">Data de nascimento</label><input id="pNascimento" type="date"></div>
                    <div class="field so-membro">
                        <label for="pEstadoCivil">Estado civil</label>
                        <select id="pEstadoCivil">
                            <option value="">Selecione...</option>
                            <option>Solteiro(a)</option><option>Casado(a)</option><option>Divorciado(a)</option>
                            <option>Viúvo(a)</option><option>União estável</option><option>Outro</option>
                        </select>
                    </div>
                    <div class="field so-membro"><label for="pEndereco">Endereço</label><input id="pEndereco" placeholder="Av. dos Expedicionários"></div>
                    <div class="field so-membro"><label for="pNumero">Número</label><input id="pNumero" placeholder="999"></div>
                    <div class="field so-membro"><label for="pBairro">Bairro</label><input id="pBairro" placeholder="Campo d'Água Verde"></div>
                    <div class="field so-membro"><label for="pEntrada">Data de entrada na igreja</label><input id="pEntrada" type="date"></div>
                    <div class="field so-membro"><label for="pBatismo">Data do batismo</label><input id="pBatismo" type="date"></div>
                    <div class="field so-membro">
                        <label for="pCelula">Participa de célula?</label>
                        <select id="pCelula"><option value="">Selecione...</option><option value="sim">Sim</option><option value="nao">Não</option></select>
                    </div>
                    <div class="field so-membro">
                        <label for="pFuncao">Função como voluntário</label>
                        <select id="pFuncao">
                            <option value="">Não é voluntário</option>
                            ${funcoes.map(f => `<option value="${f.id_funcao}">${escapar(f.nome)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="field full"><label for="pObservacoes">Observações</label><textarea id="pObservacoes" placeholder="Informações adicionais..."></textarea></div>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn-cancel" id="cancelarParticipante">Cancelar</button>
                    <button type="submit" class="primary"><span class="material-icons">save</span>Salvar cadastro</button>
                </div>
            </form>
        </article>
        <article class="panel">
            <div class="panel-header"><h2>Orientações</h2></div>
            <div class="list">
                <div class="list-row"><div class="mini-avatar">1</div><div class="info"><strong>Dados pessoais</strong><small>Preencha nome, contato e informações básicas.</small></div></div>
                <div class="list-row"><div class="mini-avatar">2</div><div class="info"><strong>Vida na igreja</strong><small>Registre entrada, batismo e participação.</small></div></div>
                <div class="list-row"><div class="mini-avatar">3</div><div class="info"><strong>Voluntariado</strong><small>Escolha uma função para já registrar o membro como voluntário.</small></div></div>
                <div class="list-row"><div class="mini-avatar">4</div><div class="info"><strong>Visitantes</strong><small>Para quem está conhecendo a igreja, basta nome, telefone e data da visita.</small></div></div>
            </div>
        </article>
    `;

    main.replaceChildren(
        headerComVoltar('Cadastro de Participante', 'Cadastre um novo membro ou visitante', gerenciaParticipantes),
        section
    );

    const form = section.querySelector('#formParticipante');
    const tipo = section.querySelector('#tipoParticipante');
    const $ = id => section.querySelector('#' + id);
    $('pDataVisita').value = dataDeHoje();

    function alternarCampos() {
        const visitante = tipo.value === 'visitante';
        section.querySelectorAll('.so-membro').forEach(c => c.classList.toggle('campo-oculto', visitante));
        section.querySelectorAll('.so-visitante').forEach(c => c.classList.toggle('campo-oculto', !visitante));
    }
    tipo.addEventListener('change', alternarCampos);
    alternarCampos();

    $('cancelarParticipante').addEventListener('click', () => abrirSubstituindo(gerenciaParticipantes));

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!$('pNome').value.trim()) {
            mensagemFormulario(form, 'Informe o nome completo.');
            $('pNome').focus();
            return;
        }

        const dados = tipo.value === 'visitante'
            ? { tipo: 'visitante', nome: $('pNome').value, telefone: $('pTelefone').value, data_visita: $('pDataVisita').value, observacoes: $('pObservacoes').value }
            : {
                tipo: 'membro',
                nome: $('pNome').value,
                telefone: $('pTelefone').value,
                email: $('pEmail').value,
                data_nascimento: $('pNascimento').value,
                estado_civil: $('pEstadoCivil').value,
                endereco: $('pEndereco').value,
                numero: $('pNumero').value,
                bairro: $('pBairro').value,
                data_entrada_igreja: $('pEntrada').value,
                data_batismo: $('pBatismo').value,
                participa_celula: $('pCelula').value === '' ? null : $('pCelula').value === 'sim',
                id_funcao: $('pFuncao').value,
                observacoes: $('pObservacoes').value
            };

        try {
            await enviarDados('participantes', 'POST', dados);
            alert(`${dados.nome.trim()} cadastrado(a) com sucesso!`);
            abrirSubstituindo(gerenciaParticipantes);
        } catch (erro) {
            mensagemFormulario(form, erro.message);
        }
    });
}
