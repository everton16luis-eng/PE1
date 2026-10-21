// =========================================
// USUÁRIOS
// =========================================

const PERFIS = {
    ADMINISTRADOR: 'Administrador',
    GESTOR: 'Gestor',
    SECRETARIA: 'Secretaria',
    FINANCEIRO: 'Financeiro',
    VOLUNTARIO: 'Voluntário',
    VISUALIZACAO: 'Apenas visualização'
};

const AREAS = [
    ['participantes', 'Participantes', 'Permitir visualizar e gerenciar participantes.'],
    ['voluntarios', 'Voluntários', 'Permitir gerenciar voluntários e suas funções.'],
    ['escalas', 'Escalas', 'Permitir criar e gerenciar escalas e eventos.'],
    ['criancas', 'Crianças', 'Permitir gerenciar crianças, turmas e presença.'],
    ['relatorios', 'Relatórios', 'Permitir visualizar os relatórios do sistema.'],
    ['usuarios', 'Usuários', 'Permitir gerenciar usuários do sistema.']
];

function ultimoAcesso(data) {
    if (!data) return 'Ainda não acessou';
    const acesso = new Date(data);
    const dias = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(acesso).setHours(0, 0, 0, 0)) / 86400000);
    const hora = acesso.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (dias === 0) return `Hoje, ${hora}`;
    if (dias === 1) return `Ontem, ${hora}`;
    return `${acesso.toLocaleDateString('pt-BR')} ${hora}`;
}

async function gerenciaUsuarios() {
    registrarRota('usuarios');
    marcarMenuAtivo('gerenciaUsuarios');
    const dados = await buscarDados('usuarios', { usuarios: [], resumo: {} });
    const main = document.getElementById('main');
    const r = dados.resumo || {};

    const painel = document.createElement('section');
    painel.className = 'panel';
    painel.innerHTML = `
        <div class="panel-header">
            <div><h2>Usuários cadastrados</h2><p>Consulte e gerencie os usuários do sistema</p></div>
            <button type="button" class="primary" id="btnNovoUsuario"><span class="material-icons" style="font-size:16px;vertical-align:middle;">person_add</span> Novo usuário</button>
        </div>
        <div class="toolbar">
            <input class="search" type="search" placeholder="Buscar por nome ou e-mail..." aria-label="Buscar usuário">
            <button type="button" class="filtro ativo" data-filtro="todos">Todos</button>
            <button type="button" class="filtro" data-filtro="ativo">Ativos</button>
            <button type="button" class="filtro" data-filtro="pendente">Pendentes</button>
            <button type="button" class="filtro" data-filtro="administrador">Administradores</button>
        </div>
        <div class="table-responsive">
            <table>
                <thead><tr><th>Usuário</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Último acesso</th><th>Ações</th></tr></thead>
                <tbody>
                    ${dados.usuarios.map(u => {
                        const status = u.ativo ? 'ativo' : (u.ultimo_acesso ? 'inativo' : 'pendente');
                        const badge = { ativo: '<span class="badge ok">Ativo</span>', inativo: '<span class="badge inactive">Inativo</span>', pendente: '<span class="badge pending">Pendente</span>' }[status];
                        return `
                            <tr data-filtro="${status}" data-perfil="${u.perfil}">
                                <td>
                                    <div class="person">
                                        <div class="mini-avatar">${escapar(u.nome.charAt(0).toUpperCase())}</div>
                                        <div class="info"><strong>${escapar(u.nome)}</strong><small>${escapar(u.telefone || u.observacoes || '')}</small></div>
                                    </div>
                                </td>
                                <td>${escapar(u.email)}</td>
                                <td><span class="badge ${u.perfil === 'ADMINISTRADOR' ? 'ok' : 'pending'}">${PERFIS[u.perfil] || u.perfil}</span></td>
                                <td>${badge}</td>
                                <td>${ultimoAcesso(u.ultimo_acesso)}</td>
                                <td>${u.perfil === 'ADMINISTRADOR' && usuarioAtual?.perfil !== 'ADMINISTRADOR' ? '—'
                                    : `<button type="button" class="action-btn" data-editar="${u.id_usuario}" title="Editar" aria-label="Editar ${escapar(u.nome)}"><span class="material-icons">edit</span></button>`}</td>
                            </tr>`;
                    }).join('') || '<tr><td colspan="6" class="vazio">Nenhum usuário cadastrado.</td></tr>'}
                </tbody>
            </table>
        </div>
    `;

    main.replaceChildren(
        headerInterno('Usuários', 'Gerencie acessos, perfis e permissões do sistema'),
        cardsEstatisticas([
            ['blue', 'manage_accounts', r.total, 'Total de usuários'],
            ['green', 'check_circle', r.ativos, 'Usuários ativos'],
            ['purple', 'admin_panel_settings', r.administradores, 'Administradores'],
            ['orange', 'pending', r.pendentes, 'Cadastros aguardando liberação']
        ]),
        painel
    );

    configurarFiltros(painel, (linha, filtro) =>
        filtro === 'administrador' ? linha.dataset.perfil === 'ADMINISTRADOR' : linha.dataset.filtro === filtro);

    painel.querySelector('#btnNovoUsuario').addEventListener('click', () => formularioUsuario());
    painel.addEventListener('click', event => {
        const botao = event.target.closest('[data-editar]');
        if (botao) formularioUsuario(dados.usuarios.find(u => u.id_usuario === Number(botao.dataset.editar)));
    });
}

function formularioUsuario(usuario = null) {
    registrarRota(usuario ? 'usuarios/editar' : 'usuarios/novo', [usuario]);
    const main = document.getElementById('main');
    const editar = Boolean(usuario);

    const section = document.createElement('section');
    section.className = 'panel volunteer-form';
    section.innerHTML = `
        <form id="formUsuario" novalidate>
            <div class="form-section">
                <div class="section-title"><span class="material-icons">person</span><div><h3>Dados do usuário</h3><p>Informações básicas para identificação</p></div></div>
                <div class="form-grid">
                    <div class="form-group"><label for="uNome">Nome completo</label><input type="text" id="uNome" placeholder="Digite o nome completo" required></div>
                    <div class="form-group"><label for="uEmail">E-mail</label><input type="email" id="uEmail" placeholder="usuario@igreja.com" required><small>Usado para entrar no sistema (o telefone também serve).</small></div>
                    <div class="form-group"><label for="uTelefone">Telefone</label><input type="tel" id="uTelefone" placeholder="(00) 00000-0000"></div>
                    <div class="form-group">
                        <label for="uStatus">Status</label>
                        <select id="uStatus"><option value="ativo">Ativo</option><option value="inativo">Inativo</option></select>
                    </div>
                </div>
            </div>

            <div class="form-section">
                <div class="section-title"><span class="material-icons">lock</span><div><h3>Acesso ao sistema</h3><p>${editar ? 'Deixe a senha em branco para manter a atual.' : 'Defina a senha e o perfil de acesso.'}</p></div></div>
                <div class="form-grid">
                    <div class="form-group"><label for="uSenha">Senha</label><input type="password" id="uSenha" autocomplete="new-password" placeholder="Mínimo de 6 caracteres" minlength="6" ${editar ? '' : 'required'}></div>
                    <div class="form-group"><label for="uConfirmar">Confirmar senha</label><input type="password" id="uConfirmar" autocomplete="new-password" placeholder="Digite a senha novamente"></div>
                    <div class="form-group">
                        <label for="uPerfil">Perfil de acesso</label>
                        <select id="uPerfil" required>
                            <option value="">Selecione o perfil</option>
                            ${Object.entries(PERFIS).map(([valor, nome]) => `<option value="${valor}">${nome}</option>`).join('')}
                        </select>
                    </div>
                </div>
            </div>

            <div class="form-section">
                <div class="section-title"><span class="material-icons">admin_panel_settings</span><div><h3>Permissões</h3><p>Áreas que o usuário pode acessar (administrador acessa todas).</p></div></div>
                <div class="checkbox-grid">
                    ${AREAS.map(([chave, nome, descricao]) => `
                        <label class="checkbox-card">
                            <input type="checkbox" name="permissoes" value="${chave}">
                            <div><strong>${nome}</strong><small>${descricao}</small></div>
                        </label>`).join('')}
                </div>
            </div>

            <div class="form-section">
                <div class="section-title"><span class="material-icons">notes</span><div><h3>Observações</h3><p>Informações adicionais sobre o usuário.</p></div></div>
                <div class="form-group"><label for="uObservacoes">Observações adicionais</label><textarea id="uObservacoes" rows="4" placeholder="Digite alguma observação sobre este usuário..."></textarea></div>
            </div>

            <div class="form-actions">
                <button type="button" class="btn-cancel" id="cancelarUsuario">Cancelar</button>
                <button type="submit" class="primary"><span class="material-icons">save</span>${editar ? 'Salvar alterações' : 'Salvar usuário'}</button>
            </div>
        </form>
    `;

    main.replaceChildren(
        headerComVoltar(editar ? 'Editar Usuário' : 'Novo Usuário',
            editar ? `Altere o acesso de ${usuario.nome}` : 'Cadastre um novo usuário e defina suas permissões', gerenciaUsuarios),
        section
    );

    const form = section.querySelector('form');
    const $ = id => section.querySelector('#' + id);
    const caixasPermissao = [...form.querySelectorAll('input[name="permissoes"]')];

    const souAdmin = usuarioAtual?.perfil === 'ADMINISTRADOR';
    const editandoASiMesmo = editar && usuario.id_usuario === usuarioAtual?.id_usuario;

    // Quem não é administrador não cria administradores
    if (!souAdmin) $('uPerfil').querySelector('option[value="ADMINISTRADOR"]')?.remove();

    // Administrador sempre tem todas as permissões; os demais só concedem as que possuem
    // e não alteram o próprio acesso
    function travarPermissoesAdmin() {
        const admin = $('uPerfil').value === 'ADMINISTRADOR';
        caixasPermissao.forEach(c => {
            if (admin) c.checked = true;
            c.disabled = admin || (!souAdmin && (editandoASiMesmo || !usuarioAtual?.permissoes?.[c.value]));
        });
        if (!souAdmin && editandoASiMesmo) $('uPerfil').disabled = true;
    }

    if (editar) {
        $('uNome').value = usuario.nome;
        $('uEmail').value = usuario.email;
        $('uTelefone').value = usuario.telefone || '';
        $('uStatus').value = usuario.ativo ? 'ativo' : 'inativo';
        $('uPerfil').value = usuario.perfil;
        $('uObservacoes').value = usuario.observacoes || '';
        caixasPermissao.forEach(c => { c.checked = Boolean(usuario.permissoes?.[c.value]); });
    }
    travarPermissoesAdmin();
    $('uPerfil').addEventListener('change', travarPermissoesAdmin);
    $('cancelarUsuario').addEventListener('click', () => abrirSubstituindo(gerenciaUsuarios));

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const senha = $('uSenha').value;
        if ((!editar || senha) && senha.length < 6) return mensagemFormulario(form, 'A senha deve ter pelo menos 6 caracteres.');
        if (senha !== $('uConfirmar').value) return mensagemFormulario(form, 'As senhas não são iguais.');
        if (!$('uPerfil').value) return mensagemFormulario(form, 'Selecione o perfil de acesso.');

        const dados = {
            nome: $('uNome').value,
            email: $('uEmail').value,
            telefone: $('uTelefone').value,
            senha,
            perfil: $('uPerfil').value,
            ativo: $('uStatus').value === 'ativo',
            observacoes: $('uObservacoes').value,
            permissoes: Object.fromEntries(caixasPermissao.map(c => [c.value, c.checked]))
        };

        try {
            const salvo = await enviarDados(editar ? `usuarios/${usuario.id_usuario}` : 'usuarios', editar ? 'PUT' : 'POST', dados);
            // Se editou o próprio cadastro, atualiza nome/permissões na tela
            if (salvo.id_usuario === usuarioAtual?.id_usuario) {
                usuarioAtual = salvo;
                document.getElementById('sidebar').replaceWith(sideBar());
            }
            alert(editar ? 'Usuário atualizado com sucesso!' : 'Usuário cadastrado com sucesso!');
            abrirSubstituindo(gerenciaUsuarios);
        } catch (erro) {
            mensagemFormulario(form, erro.message);
        }
    });
}
