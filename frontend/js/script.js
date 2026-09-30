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


function sideBar(){
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



sideBar();
carregarDashboard();    