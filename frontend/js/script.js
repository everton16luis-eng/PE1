const API_URL = 'http://localhost:3000/api'

async function carregarDashboard() {
    try {
        //busca configurações da empresa
        //busca no banco os dados dos Cards 
        const cards = await fetch(`${API_URL}/dashboardPessoas`);
        //busca no banco as escalas da semana
        // const escalasSemana  = await fetch(`${API_URL}/dashboardEscalasSemana`)


        if (!cards.ok) {
            throw new Error('Erro ao consultar a API');
        }

        const dados = await cards.json();
        console.log(dados)
        // const escalas = await escalasSemana.json()



        // Envia os dados para cada parte do site
        atualizarCards(dados);
        // renderizarEscalas(escalas);c
        // renderizarConfirmacoes(dados.confirmacoes);
        // renderizarEventos(dados.eventos);

    } catch (erro) {
        console.error('Erro ao carregar dashboard:', erro);
    }
}

async function dadosEventos() {
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

function atualizarCards(dados) {

    document.getElementById('total_visitantes').textContent =
        dados.total_visitantes ?? 0;
    console.log(dados.total_visitantes)

    document.getElementById('total_membros').textContent =
        dados.total_membros ?? 0;

    document.getElementById('total_voluntarios').textContent =
        dados.total_voluntarios ?? 0;

    document.getElementById('total_escalas').textContent =
        dados.total_escalas ?? 0;
}

function renderizarEscalas(escalas) {

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


function sideBar() {
    const sideBar = document.getElementById('sidebar');
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
                <a class="" id="gerenciaEvento"href="#"><span class="material-icons">circle</span> Eventos</a>
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
    document.getElementById('gerenciaEvento')
        .addEventListener('click', gerenciaEvento); 
}

function headerInterno(nome, descricao) {
    return `
        <header class="topbar" id="topbar">
            <div>
                <h1>${nome}</h1>
                <p>${descricao}</p>
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
        </header>
    `
}


async function gerenciaEvento() {
    const dados = await dadosEventos();
    const voluntarios = await dadosVolutanrios();
    document.getElementById('gerenciaEvento').classList.add('active');
    const header = headerInterno("Criar evento", "Crie e gerencie os eventos da igreja.");
    const main = document.getElementById('main')
    main.innerHTML = `
    ${header}
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
    `
    const listaFuncoes = document.getElementById('funcao')
    listaFuncoes.innerHTML = '<option value="">Selecione uma função</option>';
    const listaVoluntarios = document.querySelectorAll('voluntarios')
    dados.forEach(item => {
        listaFuncoes.innerHTML += `
        <option value="${item.nome}">
            ${item.nome}
        </option>
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

    function criarEvento() {
        const nomeEvento = document.getElementById('nomeEvento').value
        const dataEvento = document.getElementById('data').value;
        const horaInicio = document.getElementById('horarioInicio').value;
        const horaFim = document.getElementById('horarioFim').value;
        const tipoEvento = document.getElementById('tipoEvento').value;
        console.log(`
        Nome do Evento: ${nomeEvento}\n
        Data do Evento: ${dataEvento}\n
        Hora do Evento: ${horaInicio}\n
        Hora do Fim do Evento: ${horaFim}\n
        Tipo de Evento: ${tipoEvento}
        `)
    }

    document.getElementById('salvaFuncao')
        .addEventListener('click', capturaFuncao);
    document.getElementById('criarEvento')
        .addEventListener('click', criarEvento);
}
function gerenciaDashboard(){
    const header = headerInterno("Dashboard", "Algo aqui");
    const main = document.getElementById('main')

<<<<<<< HEAD
    main.innerHTML = `
    ${header}`
}
=======

// criarEvento()

>>>>>>> 87917de (Atualização do BD)
sideBar()

// criarEvento()

// carregarDashboard();    