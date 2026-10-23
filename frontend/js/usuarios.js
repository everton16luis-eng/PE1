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
    const ativa = paginaAtiva();
    marcarMenuAtivo('gerenciaUsuarios');
    const dados = await buscarDados('usuarios', { usuarios: [], resumo: {} });
    if (!ativa()) return;
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
        headerInterno('Usuários', 'Contas de acesso da equipe de gestão. O acesso de voluntários ao portal fica na ficha de cada voluntário.'),
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

// idMembro = pessoa já escolhida (ex.: botão "Dar acesso" em Participantes)
async function formularioUsuario(usuario = null, idMembro = null) {
    registrarRota(usuario ? 'usuarios/editar' : 'usuarios/novo', usuario ? [usuario] : [null, idMembro]);
    const ativa = paginaAtiva();
    const main = document.getElementById('main');
    const editar = Boolean(usuario);
    // Novo acesso é dado a uma pessoa do cadastro universal que ainda não tem login;
    // quem já tem login aparece à parte, para editar o acesso que já existe
    const dadosUsuarios = editar ? {} : await buscarDados('usuarios', { pessoas: [], usuarios: [] });
    if (!ativa()) return;
    const pessoas = dadosUsuarios.pessoas || [];
    const comLogin = dadosUsuarios.usuarios || [];

    const section = document.createElement('section');
    section.className = 'panel volunteer-form';
    section.innerHTML = `
        <form id="formUsuario" novalidate>
            <div class="form-section">
                <div class="section-title"><span class="material-icons">person</span><div><h3>Pessoa</h3><p>${editar ? 'O nome vem do cadastro da pessoa (altere em Participantes).' : 'Escolha quem vai receber o acesso. Ela precisa estar no Cadastro (Participantes).'}</p></div></div>
                <div class="form-grid">
                    ${editar
                        ? '<div class="form-group"><label for="uNome">Nome</label><input type="text" id="uNome" readonly></div>'
                        : `<div class="form-group full">
                               <label for="uPessoaBusca">Pessoa</label>
                               <input type="search" id="uPessoaBusca" placeholder="Digite parte do nome..." aria-label="Buscar pessoa no cadastro">
                               <select id="uPessoa" required size="5" aria-label="Pessoa que vai receber o acesso"></select>
                               <small>Só aparecem pessoas sem login. Ter um cadastro não dá acesso: o acesso é criado aqui.</small>
                               <div class="ja-tem-acesso" id="uJaTemAcesso" hidden></div>
                           </div>`}
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
                            ${Object.entries(PERFIS).filter(([valor]) => valor !== 'VOLUNTARIO').map(([valor, nome]) => `<option value="${valor}">${nome}</option>`).join('')}
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

    // Busca e escolha da pessoa (até 50 por vez); preenche e-mail e telefone do cadastro
    function preencherContato() {
        const pessoa = pessoas.find(p => String(p.id_membro) === $('uPessoa').value);
        if (pessoa?.email && !$('uEmail').value) $('uEmail').value = pessoa.email;
        if (pessoa?.telefone && !$('uTelefone').value) $('uTelefone').value = pessoa.telefone;
    }
    function desenharPessoas() {
        const termo = normalizarTexto($('uPessoaBusca').value);
        const escolhida = $('uPessoa').value;
        const encontradas = pessoas.filter(p => !termo || normalizarTexto(p.nome).includes(termo)).slice(0, 50);
        $('uPessoa').innerHTML = encontradas.map(p => `<option value="${p.id_membro}">${escapar(p.nome)}${p.email ? ' — ' + escapar(p.email) : ''}</option>`).join('')
            || '<option value="" disabled>Ninguém sem login com esse nome</option>';
        // Continua escolhida enquanto aparecer; se a busca deixou uma pessoa só, ela já fica escolhida
        if (encontradas.some(p => String(p.id_membro) === escolhida)) $('uPessoa').value = escolhida;
        else if (termo && encontradas.length === 1) { $('uPessoa').value = String(encontradas[0].id_membro); preencherContato(); }

        // Quem já tem login não está na lista acima: mostra para editar o acesso existente
        const jaTem = termo.length >= 2 ? comLogin.filter(u => normalizarTexto(u.nome).includes(termo)).slice(0, 5) : [];
        $('uJaTemAcesso').hidden = !jaTem.length;
        $('uJaTemAcesso').innerHTML = jaTem.length ? `<p>Já têm acesso ao sistema (não aparecem na lista):</p>` + jaTem.map(u => `
            <div class="ja-tem-acesso-linha">
                <span><strong>${escapar(u.nome)}</strong> · ${escapar(PERFIS[u.perfil] || u.perfil)}${u.ativo ? '' : ' · inativo'}</span>
                <button type="button" class="secondary" data-editar-usuario="${u.id_usuario}"><span class="material-icons">manage_accounts</span>Editar acesso</button>
            </div>`).join('') : '';
    }
    if (!editar) {
        const preEscolhida = idMembro && pessoas.find(p => p.id_membro === Number(idMembro));
        if (preEscolhida) $('uPessoaBusca').value = preEscolhida.nome;
        desenharPessoas();
        if (preEscolhida) { $('uPessoa').value = String(preEscolhida.id_membro); preencherContato(); }
        $('uPessoaBusca').addEventListener('input', desenharPessoas);
        $('uPessoa').addEventListener('change', preencherContato);
        $('uJaTemAcesso').addEventListener('click', event => {
            const botao = event.target.closest('[data-editar-usuario]');
            const existente = botao && comLogin.find(u => String(u.id_usuario) === botao.dataset.editarUsuario);
            if (existente) formularioUsuario(existente);
        });
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
        if (!editar && !$('uPessoa').value) return mensagemFormulario(form, 'Escolha a pessoa que vai receber o acesso.');

        const dados = {
            id_membro: editar ? undefined : Number($('uPessoa').value),
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
                usuarioAtual = { ...usuarioAtual, ...salvo };
                document.getElementById('sidebar').replaceWith(sideBar());
            }
            alert(editar ? 'Usuário atualizado com sucesso!' : 'Usuário cadastrado com sucesso!');
            abrirSubstituindo(gerenciaUsuarios);
        } catch (erro) {
            mensagemFormulario(form, erro.message);
        }
    });
}
