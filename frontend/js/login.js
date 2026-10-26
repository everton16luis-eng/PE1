// =========================================
// LOGIN E REGISTRO
// =========================================

function mostrarLogin() {
    document.body.classList.remove('menu-aberto');
    document.querySelectorAll('.modal-overlay').forEach(modal => modal.remove());

    const app = document.getElementById('app');
    app.innerHTML = `
        <section class="login-tela">
            <div class="login-caixa">
                <div class="login-marca">
                    <img src="img/terracota.png" alt="">
                    <div><strong>Igreja Novo Caminho</strong><span>Sistema de Gestão</span></div>
                </div>

                <div class="login-abas" role="tablist">
                    <div class="indicador"></div>
                    <button type="button" class="ativo" data-aba="login" role="tab" id="abaLogin" aria-selected="true" aria-controls="formLogin">Login</button>
                    <button type="button" data-aba="registro" role="tab" id="abaRegistro" aria-selected="false" aria-controls="formRegistro" tabindex="-1">Registro</button>
                </div>

                <!-- LOGIN -->
                    <form id="formLogin" class="login-form" role="tabpanel" aria-labelledby="abaLogin" novalidate>
                        <div class="login-campo">
                            <label for="loginUsuario">E-mail ou telefone</label>
                            <div class="inputBox">
                                <span class="material-icons">person</span>
                                <input id="loginUsuario" type="text" autocomplete="username" placeholder="email@exemplo.com ou (00) 0000-0000" required>
                            </div>
                        </div>
                        <div class="login-campo">
                            <label for="loginSenha">Senha</label>
                            <div class="inputBox">
                                <span class="material-icons">lock</span>
                                <input id="loginSenha" type="password" autocomplete="current-password" placeholder="Digite sua senha" required>
                            </div>
                        </div>
                        <div class="login-opcoes">
                            <label><input type="checkbox" id="lembrarLogin" checked> Lembrar de mim</label>
                            <a href="#" id="esqueciSenha" style="color: var(--navy);">Esqueci minha senha</a>
                        </div>
                        <p class="login-mensagem" id="mensagemLogin" role="status"></p>
                        <button type="submit">Entrar</button>
                    </form>

                    <!-- REGISTRO -->
                    <form id="formRegistro" class="login-form" role="tabpanel" aria-labelledby="abaRegistro" novalidate hidden>
                        <div class="login-campo">
                            <label for="registroNome">Nome completo</label>
                            <div class="inputBox">
                                <span class="material-icons">badge</span>
                                <input id="registroNome" type="text" autocomplete="name" placeholder="Seu nome" required>
                            </div>
                        </div>
                        <div class="login-campo">
                            <label for="registroTelefone">Telefone</label>
                            <div class="inputBox">
                                <span class="material-icons">phone</span>
                                <input id="registroTelefone" type="tel" autocomplete="tel" placeholder="(00) 00000-0000">
                            </div>
                        </div>
                        <div class="login-campo">
                            <label for="registroEmail">E-mail</label>
                            <div class="inputBox">
                                <span class="material-icons">mail</span>
                                <input id="registroEmail" type="email" autocomplete="email" placeholder="Digite seu e-mail" required>
                            </div>
                        </div>
                        <div class="login-campo">
                            <label for="registroSenha">Senha</label>
                            <div class="inputBox">
                                <span class="material-icons">lock</span>
                                <input id="registroSenha" type="password" autocomplete="new-password" placeholder="Crie uma senha forte" minlength="8" maxlength="128" required>
                            </div>
                        </div>
                        <div class="login-campo">
                            <label for="registroConfirmar">Confirmar senha</label>
                            <div class="inputBox">
                                <span class="material-icons">lock</span>
                                <input id="registroConfirmar" type="password" autocomplete="new-password" placeholder="Digite a senha novamente" required>
                            </div>
                        </div>
                        <div class="login-opcoes">
                            <label><input type="checkbox" id="registroTermos"> Concordo com os termos de uso dos dados</label>
                        </div>
                        <p class="login-mensagem" id="mensagemRegistro" role="status"></p>
                        <button type="submit">Cadastrar</button>
                    </form>
            </div>
        </section>
    `;

    const abas = app.querySelector('.login-abas');
    const botoesAba = [...abas.querySelectorAll('button')];

    // Troca entre Login e Registro: o indicador desliza e só o formulário ativo aparece
    // (a caixa se ajusta à altura de cada formulário)
    function mostrarAba(aba) {
        const registro = aba === 'registro';
        abas.classList.toggle('aba-registro', registro);
        botoesAba.forEach(b => {
            const ativo = b.dataset.aba === aba;
            b.classList.toggle('ativo', ativo);
            b.setAttribute('aria-selected', String(ativo));
            b.tabIndex = ativo ? 0 : -1;
        });
        app.querySelector('#formLogin').hidden = registro;
        app.querySelector('#formRegistro').hidden = !registro;
        (registro ? app.querySelector('#registroNome') : app.querySelector('#loginUsuario')).focus({ preventScroll: true });
    }
    botoesAba.forEach(botao => botao.addEventListener('click', () => mostrarAba(botao.dataset.aba)));
    abas.addEventListener('keydown', event => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            const proxima = abas.classList.contains('aba-registro') ? 'login' : 'registro';
            mostrarAba(proxima);
            abas.querySelector(`[data-aba="${proxima}"]`).focus();
        }
    });

    app.querySelector('#esqueciSenha').addEventListener('click', event => {
        event.preventDefault();
        const mensagem = app.querySelector('#mensagemLogin');
        mensagem.className = 'login-mensagem ok';
        mensagem.textContent = 'Peça a um administrador para redefinir sua senha em Usuários.';
    });

    app.querySelector('#formLogin').addEventListener('submit', async event => {
        event.preventDefault();
        const mensagem = app.querySelector('#mensagemLogin');
        mensagem.className = 'login-mensagem';
        const login = app.querySelector('#loginUsuario').value.trim();
        const senha = app.querySelector('#loginSenha').value;

        if (!login || !senha) {
            mensagem.textContent = 'Informe e-mail (ou telefone) e senha.';
            return;
        }

        try {
            const resposta = await enviarDados('auth/login', 'POST', { login, senha });
            salvarToken(resposta.token, app.querySelector('#lembrarLogin').checked);
            await carregarDashboard();
        } catch (erro) {
            mensagem.textContent = erro.message;
        }
    });

    // Requisitos da senha à vista durante o cadastro (o backend confere as mesmas regras)
    const campoSenhaRegistro = app.querySelector('#registroSenha');
    ligarRegrasSenha(campoSenhaRegistro, campoSenhaRegistro.closest('.inputBox'));

    app.querySelector('#formRegistro').addEventListener('submit', async event => {
        event.preventDefault();
        const mensagem = app.querySelector('#mensagemRegistro');
        mensagem.className = 'login-mensagem';
        const dados = {
            nome: app.querySelector('#registroNome').value.trim(),
            telefone: app.querySelector('#registroTelefone').value.trim(),
            email: app.querySelector('#registroEmail').value.trim(),
            senha: app.querySelector('#registroSenha').value
        };

        if (!dados.nome || !dados.email) {
            mensagem.textContent = 'Informe nome e e-mail.';
            return;
        }
        const senhaFraca = erroSenhaFraca(dados.senha);
        if (senhaFraca) {
            mensagem.textContent = senhaFraca;
            app.querySelector('#registroSenha').focus();
            return;
        }
        if (dados.senha !== app.querySelector('#registroConfirmar').value) {
            mensagem.textContent = 'As senhas não coincidem.';
            return;
        }
        if (!app.querySelector('#registroTermos').checked) {
            mensagem.textContent = 'É necessário aceitar os termos.';
            return;
        }

        try {
            const resposta = await enviarDados('auth/registro', 'POST', dados);
            event.target.reset();
            mostrarAba('login');
            const mensagemLogin = app.querySelector('#mensagemLogin');
            mensagemLogin.className = 'login-mensagem ok';
            mensagemLogin.textContent = resposta.mensagem;
            app.querySelector('#loginUsuario').value = dados.email;
        } catch (erro) {
            mensagem.textContent = erro.message;
        }
    });

    app.querySelector('#loginUsuario').focus();
}
