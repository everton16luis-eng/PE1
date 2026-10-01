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
                <a class="active" href="/dashboard"><span class="material-icons">dashboard</span>Dashboard</a>
                <a class="" href="/eventos"><span class="material-icons">circle</span> Eventos
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


async function criarEvento() {
    const dados = await dadosEventos();
    const voluntarios = await dadosVolutanrios();

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
                        <input type="text" id="nome-evento" required>
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
                        <select id="culto" required>
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
                    <div>
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
                        <div class="form-actions-left">
                            <button type="button" id="salvaFuncao" class="primary">
                                <span class="material-icons">add</span>
                                Adicionar função
                            </button>
                        </div>
                    </div>
                    <div>
                        <div class="section-title">
                            <div>
                                <h3>Funções selecionadas</h3>
                                <p>
                                    Lista de funções selecionadas para o evento
                                </p>
                            </div>
                        </div>
                        <table>
                            <thead>
                                <tr>
                                    <th>Função</th>
                                    <th>Voluntarios</th>
                                </tr>
                            </thead>
                            <tbody id="lista-funcoes">
                            </tbody>
                        </table>
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
                            Designe as funções aos voluntários que estão aptos a colaborar no evento.
                        </p>
                    </div>
                </div>
                <div class="checkbox-grid">
                    <table>
                        <thead>
                            <tr>
                                <th>Voluntário</th>
                                <th>Disónibilidade</th>
                                <th>Função</th>
                            </tr>
                        </thead>
                        <tbody id="lista-voluntarios">
                        </tbody>
                    </table>
                </div>
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
                <button type="submit" class="primary">
                    <span class="material-icons">
                        save
                    </span>
                    Salvar Escala
                </button>
            </div>
        </form>
</section>
    `
    const listaFuncoes = document.getElementById('funcao')
    listaFuncoes.innerHTML = '<option value="">Selecione uma função</option>';
    const listaVoluntarios = document.getElementById('lista-voluntarios')
    dados.forEach(item => {
        listaFuncoes.innerHTML += `
        <option value="${item.nome}">
            ${item.nome}
        </option>
        `
    });
    voluntarios.forEach(item => {
        listaVoluntarios.innerHTML += `
            <tr>
                    <td>${item.nome}</td>
                    <td>
                        <b class="ok">Disponivel</b>
                    </td>
                    <td>
                    <select id="funcao-disponivel" required>                        
                    </select>

                    </td>
            </tr>

        `
    });
    



    const funcoes = []
    function salvaFuncao() {
        const id = document.getElementById('funcao').value;
        const nV = document.getElementById('quantidade')
        const lista = document.getElementById('lista-funcoes')
        const funcaoDisp = document.getElementById('funcao-disponivel')

        const quantidade = Number(nV.value);

        if (id === "") {
            alert('Por favor, selecione uma função primeiro');
            return;
        } else if (
            nV.value === "" ||
            quantidade < Number(nV.min) ||
            quantidade > Number(nV.max)
        ) {
            alert(`Quantidade de voluntários não permitida\nMínimo: ${nV.min} e Máximo: ${nV.max}`);
            return;
        }

        const existente = funcoes.find(item => item.nome == id);

        if (existente) {
            if (Number(existente.numero_voluntarios) === quantidade) {
                alert('Função já cadastrada com essa quantidade');
                return;
            }

            existente.numero_voluntarios = quantidade;
        } else {
            funcoes.push({
                nome: id,
                numero_voluntarios: quantidade
            });
        }
        lista.innerHTML = '';
        funcaoDisp.innerHTML = '';

        funcoes.forEach(item => {
            lista.innerHTML += `
                <tr>
                    <td>${item.nome}</td>
                    <td>${item.numero_voluntarios}</td>
                </tr>
                `
            funcaoDisp.innerHTML += `
                <option value="${item.nome}">
                            ${item.nome}
                </option>        
            `
            
        ;
        });
    }


    document.getElementById('salvaFuncao')
        .addEventListener('click', salvaFuncao);
}


criarEvento()

sideBar()
// carregarDashboard();    