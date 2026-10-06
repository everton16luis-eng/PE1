const API_URL = 'http://localhost:3000/api'

async function carregarDashboard() {
    const dados = await dadosDashboard()
    const app = document.getElementById('app');
    const main = document.createElement('main')
    const sectionCards = atualizarCards(dados)
    const sectionResumoEscalas = ""
    main.classList.add('content');
    main.id = 'main';
    app.appendChild(main)
    main.appendChild(headerInterno('Dashboard', 'Gerencie sua Igreja'))
    main.appendChild(sectionCards)
    main.appendChild(await renderizarEscalas())
    app.appendChild(sideBar());

}

// ===================
//       DADOS     ===
// ===================
async function dadosDashboard() {
    try {
        const cards = await fetch(`${API_URL}/dashboardPessoas`);
        if (!cards.ok) {
            throw new Error('Erro ao consultar a API');
        }

        const dados = await cards.json();
        console.log(dados)
        return dados

    } catch (erro) {
        console.error('Erro ao carregar dashboard:', erro);
    }

}

async function dadosFuncoes() {
    try {
        const funcoes = await fetch(`${API_URL}/funcoes`);
        if (!funcoes.ok) {
            throw new Error('Erro ao consultar a API');
        }
        const dados = await funcoes.json();
        return dados
    } catch (error) {
        console.log(erro.message)

    }

}

async function dadosEventos() {
    try {
        const funcoes = await fetch(`${API_URL}/eventosDisponiveis`);
        if (!funcoes.ok) {
            throw new Error('Erro ao consultar a API');
        }
        const dados = await funcoes.json();
        return dados
    } catch (error) {
        console.log(erro.message)

    }

}

async function dadosVolutanrios() {
    try {
        const voluntarios = await fetch(`${API_URL}/voluntariosDisponiveis`);
        if (!voluntarios.ok) {
            throw new Error('Erro ao consultar a API');
        }
        const dados = await voluntarios.json();
        return dados
    } catch (error) {
        console.log(erro.message)

    }

}
async function dadosEscalas() {

}
// ===================================

// ====================
// ELEMNTOS DE TELA ===
// ====================

//  Barra lateral
function sideBar(paginaAtiva) {
    const sideBar = document.createElement('aside')
    sideBar.classList.add('sidebar')
    sideBar.id = 'sidebar'
    sideBar.innerHTML =
        `
        <div class="brand">
            <div class="brand-icon">✝</div>
                <div class="brand">
                    <img src="img/terracota.png" width="70px" alt="">
                    <div><strong>Igreja Novo Caminho</strong><span>ADMIN</span></div>
                </div>
            </div>
            <nav>
                <a class="" id="gerenciaDashboard" href="#"><span class="material-icons">dashboard</span>Dashboard</a>
                <a class="" id="gerenciaEvento" href="#"><span class="material-icons">circle</span> Eventos</a>
                <a class="" href="/participantes"><span class="material-icons">groups</span>Participantes</a>
                <a class="" href="/voluntarios"><span class="material-icons">volunteer_activism</span>Voluntários</a>
                <a class="" href="/escalas"><span class="material-icons">calendar_month</span>Escalas</a>
                <a class="" href="/funcoes"><span class="material-icons">engineering</span>Funções</a>
                <a class="" href="/criancas"><span class="material-icons">escalator_warning</span>Crianças</a>
                <a class="" href="/relatorios"><span class="material-icons">receipt_long</span>Relatórios</a>
                <a class="" href="/usuarios"><span class="material-icons">manage_accounts</span>Usuários</a>
                <a class="" href="/configuracoes"><span class="material-icons">settings</span>Configurações</a>
            </nav>
            <div class="sidebar-footer">Sistema de Gestão<br>da Igreja</div>
    `
    sideBar.querySelector('#gerenciaEvento')
        .addEventListener('click', (event) => {
            event.preventDefault();
            gerenciaEvento();
        });
    return sideBar
}
//  Cards do Dashboard
function atualizarCards(dados) {
    const sectionCards = document.createElement('section')
    sectionCards.classList.add('cards')
    sectionCards.id = 'cards'
    sectionCards.innerHTML =
        `
    <article class="stat-card blue">
        <div class="stat-icon">

            <span class="material-symbols-outlined card-resume blue">
                display_group
            </span>

        </div>
        <div><span>Visitantes</span><strong id="total_visitantes"></strong><small>Total cadastrados</small>
        </div>
    </article>
        <article class="stat-card green">
            <div class="stat-icon">

                <span class="material-icons card-resume green">groups</span>

            </div>
            <div><span>Membros</span><strong id="total_membros"></strong><small>Total cadastrados</small></div>
        </article>
        <article class="stat-card purple">
            <div class="stat-icon">

                <span class="material-icons card-resume purple">volunteer_activism</span>

            </div>
            <div><span>Voluntários</span><strong id="total_voluntarios"></strong><small>Ativos</small></div>
        </article>
        <article class="stat-card orange">
            <div class="stat-icon"><span class="material-icons card-resume orange">calendar_month</span></div>
            <div><span>Escalas do mês</span><strong id="total_escalas"></strong><small>Funções escaladas</small>
            </div>
        </article>

    `
    sectionCards.querySelector('#total_visitantes').textContent =
        dados.total_visitantes ?? 0;

    sectionCards.querySelector('#total_membros').textContent =
        dados.total_membros ?? 0;

    sectionCards.querySelector('#total_voluntarios').textContent =
        dados.total_voluntarios ?? 0;

    sectionCards.querySelector('#total_escalas').textContent =
        dados.total_escalas ?? 0;

    return sectionCards;
}

function renderizarConfirmacoes(confirmacoes) {

    const lista = document.getElementById('lista-confirmacoes');

    lista.innerHTML = '';

    confirmacoes.forEach(item => {

        const inicial = item.nome.charAt(0).toUpperCase();

        const dataFormatada = new Date(item.data_escala)
            .toLocaleDateString('pt-BR');

        lista.innerHTML += `
            <div class="person">

                <div class="mini-avatar">
                    ${inicial}
                </div>

                <div class="info">
                    <strong>${item.nome}</strong>

                    <small>
                        ${item.funcao} • ${dataFormatada}
                    </small>
                </div>

                <span class="badge pending">
                    Pendente
                </span>

            </div>
        `;
    });
}

async function renderizarEscalas(escalas) {
    const dados = await dadosEventos();
    const sectionEscalas = document.createElement('section')
    sectionEscalas.classList.add('grid-main')
    sectionEscalas.innerHTML = `

        <article class="panel schedule-panel">
            <div class="panel-header">
                <h2>Escalas da Semana</h2>
                <button>Ver todas</button>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Evento</th>
                        <th>Função</th>
                        <th>Horário</th>
                        <th>Voluntários</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>18/08/2026</td>
                        <td>Culto de Domingo</td>
                        <td>Recepção</td>
                        <td>08:00 - 12:00</td>
                        <td><b class="ok">4 confirmados</b></td>
                    </tr>
                    <tr>
                        <td>18/08/2026</td>
                        <td>Culto de Domingo</td>
                        <td>Louvor</td>
                        <td>08:00 - 12:00</td>
                        <td><b class="ok">5 confirmados</b></td>
                    </tr>
                    <tr>
                        <td>18/08/2026</td>
                        <td>Culto de Domingo</td>
                        <td>Kids</td>
                        <td>08:00 - 12:00</td>
                        <td><b class="ok">6 confirmados</b></td>
                    </tr>
                    <tr>
                        <td>25/08/2026</td>
                        <td>Culto de Domingo</td>
                        <td>Estacionamento</td>
                        <td>08:00 - 12:00</td>
                        <td><b class="pending">3 pendentes</b></td>
                    </tr>
                </tbody>
            </table>
        </article>

        <article class="panel confirmations">
            <div class="panel-header">
                <h2>Confirmações Pendentes</h2>
                <button>Ver todas</button>
            </div>
            <div class="person">
                <div class="mini-avatar">M</div>
                <div><strong>Maria Silva</strong><small>Louvor • 18/08/2026</small></div><span>Pendente</span>
            </div>
            <div class="person">
                <div class="mini-avatar">J</div>
                <div><strong>João Oliveira</strong><small>Recepção • 18/08/2026</small></div>
                <span>Pendente</span>
            </div>
            <div class="person">
                <div class="mini-avatar">A</div>
                <div><strong>Ana Paula</strong><small>Kids • 18/08/2026</small></div><span>Pendente</span>
            </div>
        </article>

        <article class="panel chart-panel">
            <div class="panel-header">
                <h2>Gráfico de Confirmações</h2>
                <button>Ver relatórios</button>
            </div>
            <div class="chart-content">
                <div class="donut">
                    <div><strong>68%</strong><span>Confirmados</span></div>
                </div>
                <div class="legend">
                    <p><i class="dot confirmed"></i> Confirmados <b>68%</b></p>
                    <p><i class="dot waiting"></i> Pendentes <b>22%</b></p>
                    <p><i class="dot absent"></i> Ausentes <b>10%</b></p>
                </div>
            </div>
        </article>

        <article class="panel events">
            <div class="panel-header">
                <h2>Próximos Eventos</h2>
            </div>
            <div id="proximosEventos"> 
            </div    
        </article>
    
    `
    const proximosEventos = sectionEscalas.querySelector('#proximosEventos');
    dados.forEach(item => {
        const linha = document.createElement('div');
        const data = document.createElement('b');
        const nome = document.createElement('span');
        nome.textContent = item.nome
        const horario = document.createElement('strong')
        horario.textContent = item.hora_inicio?.slice(0,5) || "";
        linha.className = 'event';
        data.textContent = new Date(item.data_evento).toLocaleDateString(
            'pt-BR',{
                day : '2-digit',
                month : '2-digit',
                timeZone : 'America/Sao_Paulo'
            }
        );
        linha.append(data, nome, horario);
        proximosEventos.appendChild(linha)


        
    });
    ;

    return sectionEscalas

    const tabela = document.getElementById('lista-escalas');


    tabela.innerHTML = '';

    escalas.forEach(item => {

        const dataFormatada = new Date(item.data_escala)
            .toLocaleDateString('pt-BR');

        const horario = item.horario.substring(0, 5);

        tabela.innerHTML +=
            // `
            //         <td>${dataFormatada}</td>
            //         <td>${horario}</td>
            //         <td>${item.descricao}</td>
            //         <td>${item.observacoe}</td>
            // `
            `
        <tr>
                <td>18/08/2026</td>
                <td>Recepção</td>  
                <td>08:00 - 12:00</td>
                <td><b class="ok">4 confirmados</b></td>
              </tr>
        `
            ;
    });
}

function renderizarEventos(eventos) {

    const lista = document.getElementById('lista-eventos');

    lista.innerHTML = '';

    eventos.forEach(evento => {

        const data = new Date(evento.data_evento);

        const dia = String(data.getUTCDate()).padStart(2, '0');
        const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
        const ano = data.getUTCFullYear();

        const dataFormatada = `${dia}/${mes}/${ano}`;

        lista.innerHTML += `
            <div class="list-row">

                <div class="mini-avatar">
                    ${dia}
                </div>

                <div class="info">
                    <strong>${evento.nome}</strong>

                    <small>
                        ${dataFormatada}
                    </small>
                </div>

            </div>
        `;
    });
}

function headerInterno(nome, descricao) {
    const header = document.createElement('header');
    header.classList.add('topbar');
    header.id = 'topbar'
    header.innerHTML = `
            <div>
                <h1></h1>
                <p></p>
            </div>
            <div class="profile">
                <div class="profile"><span class="material-icons notifications">
                        notifications
                    </span>
                    <div class="avatar">A</div>
                    <div>
                        <strong>Administrador</strong>
                        <small>
                            <a href="/login">
                                <p><a class="a" href="http://localhost:3000/login">Perfil</a></p>
                            </a>
                        </small>
                    </div>
            </div>
    `
    header.querySelector('h1').innerText = nome;
    header.querySelector('p').innerText = descricao

    return header
}


async function gerenciaEvento() {
    const dados = await dadosFuncoes();
    const eventosDisponiveis = await dadosEventos();
    const voluntarios = await dadosVolutanrios();
    document.getElementById('gerenciaEvento').classList.add('active');
    const header = headerInterno("Gerenciar Eventos", "Crie e gerencie os eventos da igreja.");
    const main = document.getElementById('main')

    main.innerHTML = `
    <div class="eventos-abas">
    <div class="abas-menu" role="tablist" aria-label="Eventos">
        <button
            type="button"
            id="tab-criar"
            class="aba-botao ativa"
            role="tab"
            aria-selected="true"
            aria-controls="aba-criar"
            data-aba="aba-criar">
            Criar evento
        </button>

        <button
            type="button"
            id="tab-gerenciar"
            class="aba-botao"
            role="tab"
            aria-selected="false"
            aria-controls="aba-gerenciar"
            data-aba="aba-gerenciar"
            tabindex="-1">
            Gerenciar eventos
        </button>
    </div>

    <div
        id="aba-criar"
        role="tabpanel"
        aria-labelledby="tab-criar">

        <section class="panel volunteer-form">
        <form id="formEscala">
            <!-- =========================
                        DATA E HORÁRIO
                    ========================== -->
            <div class="form-section">
                <div class="section-title">
                    <span class="material-icons">
                        event
                    </span>

                    <div>
                        <h3>Dados do Evento</h3>
                        <p>Preencha os campos com os dados do evento</p>
                    </div>
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label for="nome-evento">Nome do Evento.</label>
                        <input type="text" id="nomeEvento" required>
                    </div>
                    <div class="form-group">
                        <label for="data">
                            Data.
                        </label>
                        <input type="date" id="data" required>
                    </div>
                    <div class="form-group">
                        <label for="horarioInicio">
                            Horário de início.
                        </label>
                        <input type="time" id="horarioInicio" required>
                    </div>
                    <div class="form-group">
                        <label for="horarioFim">
                            Horário previsto para o término.
                        </label>
                        <input type="time" id="horarioFim" required>
                    </div>
                    <div class="form-group">
                        <label for="culto">
                            Tipo de culto / evento
                        </label>
                        <select id="tipoEvento" required>
                            <option value="">
                                Selecione
                            </option>
                            <option value="culto">
                                Culto
                            </option>
                            <option value="culto-jovens">
                                Culto de Jovens
                            </option>
                            <option value="culto-infantil">
                                Culto Infantil
                            </option>
                            <option value="evento">
                                Evento
                            </option>
                            <option value="reuniao">
                                Reunião
                            </option>
                        </select>
                    </div>
                </div>
            </div>
            <!-- =========================
                        FUNÇÃO
                    ========================== -->
            <div class="form-section">
                <div class="section-title">
                    <span class="material-icons">
                        engineering
                    </span>
                    <div>
                        <h3>Funções</h3>
                        <p>
                            Defina as funções necessarias no evento.
                        </p>
                    </div>
                </div>
                <div class="form-grid">
                        <div class="form-group">
                            <label for="funcao">
                                Função
                            </label>
                            <select id="funcao" required>
                            </select>
                        </div>
                        <div class="form-group" id="qtd_voluntarios">
                            <label>Número de voluntários</label>
                            <input type="number" id="quantidade" min="1" max="50" value="1" required></input>
                        </div>
                        <div></div>
                        <div class="form-actions-left">
                            <button type="button" id="salvaFuncao" class="primary">
                                <span class="material-icons">add</span>
                                Adicionar função
                            </button>
                        </div>
                    <div>
                    </div>
                </div>
            </div>
            <!-- =========================
                        VOLUNTÁRIOS
            ========================== -->
            <div class="form-section">
                <div class="section-title">
                    <span class="material-icons">
                        groups
                    </span>
                    <div>
                        <h3>Voluntários</h3>
                        <p>
                            Designe as os voluntarioss que estão aptos a colaborar no evento.
                        </p>
                    </div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Função</th>
                            <th>Voluntarios Necessarios</th>
                            <th>Selecione os Voluntários</th>
                        </tr>
                    </thead>
                    <tbody id="lista-funcoes">
                    </tbody>
                </table>
            </div>
            <!-- =========================
                        OBSERVAÇÕES
                    ========================== -->
            <div class="form-section">
                <div class="section-title">
                    <span class="material-icons">
                        notes
                    </span>
                    <div>
                        <h3>Observações</h3>
                        <p>
                            Adicione informações importantes.
                        </p>
                    </div>
                </div>
                <div class="form-group">
                    <label for="observacoes">
                        Observações
                    </label>
                    <textarea id="observacoes" rows="5" placeholder="Digite observações sobre esta escala..."></textarea>
                </div>

            </div>
            <!-- =========================
                        BOTÕES
                    ========================== -->
            <div class="form-actions">
                <a href="/escalas" class="btn-cancel">
                    Cancelar
                </a>
                <button type="button" id="criarEvento" class="primary">
                    <span class="material-icons">
                        save
                    </span>
                    Criar Evento
                </button>
            </div>
        </form>
</section>
    </div>

    <div
        id="aba-gerenciar"
        role="tabpanel"
        aria-labelledby="tab-gerenciar"
        hidden>

        <section class="panel">
            <div class="section-title">
                <span class="material-icons">event_note</span>
                <div>
                    <h3>Gerenciar eventos</h3>
                    <p>Consulte e gerencie os eventos cadastrados.</p>
                </div>
            </div>

            <div class="eventos-tabela">
                <table>
                    <thead>
                        <tr>
                            <th>Evento</th>
                            <th>Data</th>
                            <th>Início</th>
                            <th>Término</th>
                            <th>Tipo</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody id="lista-eventos">

                    </tbody>
                </table>
            </div>
        </section>
    </div>
</div>
    `;
    main.prepend(header)
    const listaFuncoes = document.getElementById('funcao')
    const listaEventos = document.getElementById('lista-eventos')
    listaFuncoes.innerHTML = '<option value="">Selecione uma função</option>';
    dados.forEach(item => {
        listaFuncoes.innerHTML += `
        <option value="${item.nome}">
            ${item.nome}
        </option>
        `
    });
    eventosDisponiveis.forEach(evento => {
        const dataFormatada = new Date(evento.data_evento).toLocaleDateString('pt-BR', {
            timeZone: 'America/Sao_Paulo'
        });
        listaEventos.innerHTML += `
            <tr>
                <td>
                ${evento.nome}
                </td>
                <td>
                ${dataFormatada}
                </td>
                <td>
                ${evento.hora_inicio}
                </td>
                <td>
                ${evento.hora_fim}
                </td>
                <td>
                ${evento.tipo_evento}
                </td>
                <td>
                <div class="acoes">
                    <button type="button" class="btn-editar">Editar</button>
                    <button type="button" class="btn-remover">Remover</button>
                </div>
                </td>
            </tr>
        ` 
        
    });
    const funcoes = []
    function capturaFuncao() {
        const campoFuncao = document.getElementById('funcao');
        const campoQuantidade = document.getElementById('quantidade');
        const lista = document.getElementById('lista-funcoes');

        const nomeFuncao = campoFuncao.value;
        const quantidade = Number(campoQuantidade.value);
        const minimo = Number(campoQuantidade.min);
        const maximo = Number(campoQuantidade.max);

        // 1. Valida a função e a quantidade informadas.
        if (nomeFuncao === '') {
            alert('Por favor, selecione uma função primeiro');
            return;
        }

        if (
            campoQuantidade.value === '' ||
            !Number.isInteger(quantidade) ||
            quantidade < minimo ||
            quantidade > maximo
        ) {
            alert(
                `Quantidade de voluntários não permitida\n` +
                `Mínimo: ${minimo} e Máximo: ${maximo}`
            );
            return;
        }

        const existente = funcoes.find(item => item.nome === nomeFuncao);

        if (
            existente &&
            Number(existente.numero_voluntarios) === quantidade
        ) {
            alert('Função já cadastrada com essa quantidade');
            return;
        }

        // 2. Guarda as escolhas atuais antes de recriar a tabela.
        // Cada função guarda seus voluntários na ordem dos selects.
        const escolhasAnteriores = new Map();

        lista.querySelectorAll('tr').forEach(linha => {
            const selects = linha.querySelectorAll('.voluntario');

            if (selects.length === 0) return;

            escolhasAnteriores.set(
                linha.dataset.funcao,
                Array.from(selects, select => select.value)
            );
        });

        // 3. Atualiza a função existente ou adiciona uma nova.
        if (existente) {
            existente.numero_voluntarios = quantidade;
        } else {
            funcoes.push({
                nome: nomeFuncao,
                numero_voluntarios: quantidade
            });
        }

        // 4. Recria as linhas e os campos de seleção.
        lista.innerHTML = '';

        funcoes.forEach(item => {
            const linha = document.createElement('tr');
            linha.dataset.funcao = item.nome;

            const colunaNome = document.createElement('td');
            colunaNome.textContent = item.nome;

            const colunaQuantidade = document.createElement('td');
            colunaQuantidade.textContent = item.numero_voluntarios;

            const colunaVoluntarios = document.createElement('td');
            const escolhas = escolhasAnteriores.get(item.nome) || [];

            for (let i = 0; i < Number(item.numero_voluntarios); i++) {
                const div = document.createElement('div');
                const select = document.createElement('select');

                select.className = 'voluntario';
                select.required = true;

                // A opção vazia permite desmarcar o voluntário.
                select.add(new Option('Selecione um voluntário', ''));

                voluntarios.forEach(voluntario => {
                    // Usa o ID para diferenciar pessoas com o mesmo nome.
                    select.add(
                        new Option(
                            voluntario.nome_completo,
                            String(voluntario.id_membro)
                        )
                    );
                });

                // Recupera a escolha anterior, se ainda existir.
                select.value = escolhas[i] || '';

                div.appendChild(select);
                colunaVoluntarios.appendChild(div);
            }

            linha.append(colunaNome, colunaQuantidade, colunaVoluntarios);
            lista.appendChild(linha);
        });

        // 5. Oculta e bloqueia quem já foi escolhido em outro select.
        const selectsVoluntarios = lista.querySelectorAll('.voluntario');

        function atualizarOpcoes() {
            const selecionados = new Set(
                Array.from(selectsVoluntarios, select => select.value)
                    .filter(valor => valor !== '')
            );

            selectsVoluntarios.forEach(select => {
                Array.from(select.options).forEach(option => {
                    const escolhidoEmOutro =
                        option.value !== '' &&
                        selecionados.has(option.value) &&
                        option.value !== select.value;

                    option.hidden = escolhidoEmOutro;
                    option.disabled = escolhidoEmOutro;
                });
            });
        }

        // Ao trocar ou desmarcar alguém, atualiza todos os selects.
        selectsVoluntarios.forEach(select => {
            select.addEventListener('change', atualizarOpcoes);
        });

        atualizarOpcoes();

        // 6. Atualiza os outros selects que exibem as funções disponíveis.
        document.querySelectorAll('.funcaoDisp').forEach(select => {
            const escolhaAnterior = select.value;

            select.innerHTML = '';
            select.add(new Option('Selecione uma função', ''));

            funcoes.forEach(item => {
                select.add(new Option(item.nome, item.nome));
            });

            select.value = escolhaAnterior;
        });
    }

    function capturarFuncoesEVoluntarios() {
        const linhas = document.querySelectorAll('#lista-funcoes tr');

        const resultado = Array.from(linhas)
            .filter(linha => linha.dataset.funcao)
            .map(linha => {
                const selects = linha.querySelectorAll('.voluntario');

                const selecionados = Array.from(selects)
                    .filter(select => select.value !== '')
                    .map(select => ({
                        id_membro: Number(select.value),
                        nome: select.selectedOptions[0].textContent
                    }));

                return {
                    nome_funcao: linha.dataset.funcao,
                    voluntarios: selecionados
                };
            });

        return resultado;
    }

    async function criarEvento() {

        const funcoesSelecionadas = capturarFuncoesEVoluntarios();
        const nomeEvento = document.getElementById('nomeEvento')
        const dataEvento = document.getElementById('data');
        const horaInicio = document.getElementById('horarioInicio');
        const horaFim = document.getElementById('horarioFim');
        const tipoEvento = document.getElementById('tipoEvento');
        const observacoe = document.getElementById('observacoes').value

        if (nomeEvento.value === "") {
            alert('Por favor dê um nome para o seu evento')
            nomeEvento.focus()
            return
        } else if (dataEvento.value === "") {
            alert('Por favor defina a data do evento.')
            dataEvento.focus()
            return
        } else if (horaFim.value <= horaInicio.value || horaInicio.value === "" || horaFim.value === "") {
            alert("Verifique o horario do evento, algo está incorreto!")
            horaInicio.focus()
            return
        } else if (tipoEvento.value === "") {
            alert("Por favor selecione o tipo de evento!")
            tipoEvento.focus
            return
        } else if (
            funcoesSelecionadas.length === 0 ||
            funcoesSelecionadas.some(funcao => funcao.voluntarios.length === 0)
        ) {
            alert('Defina as funções e voluntários do evento!');
            return;
        }

        try {
            const response = await fetch(`${API_URL}/novoEvento`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    nome: nomeEvento.value,
                    data_evento: dataEvento.value,
                    criado_em: new Date().toISOString(),
                    hora_inicio: horaInicio.value,
                    hora_fim: horaFim.value,
                    tipo_evento: tipoEvento.value
                })
            });
            const resultado = await response.json();

            if (!response.ok) {
                throw new Error(resultado.erro || 'Erro ao criar evento');
            }

            gerenciaEvento()
            console.log('Evento criado:', resultado);
            alert('Evento criado com sucesso!');
        } catch (erro) {
            console.error(erro);
            alert(erro.message);
        }



        funcoesSelecionadas.forEach(funcao => {
            funcao.voluntarios.forEach(voluntario => {

                console.log({
                    nomeEvento,
                    dataEvento,
                    horaInicio,
                    horaFim,
                    tipoEvento,
                    observacoes: observacoe,
                    funcao: funcao.nome_funcao,
                    id_membro: voluntario.id_membro,
                    nome_voluntario: voluntario.nome
                });
            });
        });
    }

    document.getElementById('salvaFuncao')
        .addEventListener('click', capturaFuncao);
    document.getElementById('criarEvento')
        .addEventListener('click', criarEvento);
    iniciarAbasEventos()
}


function gerenciaDashboard() {
    const header = headerInterno("Dashboard", "Algo aqui");
    const main = document.getElementById('main')

    main.innerHTML = `
    ${header}`
}
function iniciarAbasEventos() {
    const container = document.querySelector('.eventos-abas');
    if (!container) return;

    const botoes = Array.from(
        container.querySelectorAll('.aba-botao')
    );

    function ativarAba(botaoAtivo) {
        botoes.forEach(botao => {
            const ativa = botao === botaoAtivo;
            const painel = document.getElementById(botao.dataset.aba);

            botao.classList.toggle('ativa', ativa);
            botao.setAttribute('aria-selected', String(ativa));
            botao.tabIndex = ativa ? 0 : -1;
            painel.hidden = !ativa;
        });
    }

    botoes.forEach((botao, indice) => {
        botao.addEventListener('click', () => ativarAba(botao));

        botao.addEventListener('keydown', event => {
            let proximo;

            if (event.key === 'ArrowRight') {
                proximo = (indice + 1) % botoes.length;
            } else if (event.key === 'ArrowLeft') {
                proximo = (indice - 1 + botoes.length) % botoes.length;
            } else if (event.key === 'Home') {
                proximo = 0;
            } else if (event.key === 'End') {
                proximo = botoes.length - 1;
            } else {
                return;
            }

            event.preventDefault();
            ativarAba(botoes[proximo]);
            botoes[proximo].focus();
        });
    });
}

carregarDashboard();