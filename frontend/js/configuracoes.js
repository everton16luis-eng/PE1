// =========================================
// CONFIGURAÇÕES
// =========================================

const ESTADOS = ['Acre', 'Alagoas', 'Amapá', 'Amazonas', 'Bahia', 'Ceará', 'Distrito Federal', 'Espírito Santo', 'Goiás', 'Maranhão',
    'Mato Grosso', 'Mato Grosso do Sul', 'Minas Gerais', 'Pará', 'Paraíba', 'Paraná', 'Pernambuco', 'Piauí', 'Rio de Janeiro',
    'Rio Grande do Norte', 'Rio Grande do Sul', 'Rondônia', 'Roraima', 'Santa Catarina', 'São Paulo', 'Sergipe', 'Tocantins'];

function dataHora(valor) {
    if (!valor) return 'nunca';
    const data = new Date(valor);
    return `${data.toLocaleDateString('pt-BR')} às ${data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

async function gerenciaConfiguracoes() {
    registrarRota('configuracoes');
    const ativa = paginaAtiva();
    marcarMenuAtivo('gerenciaConfiguracoes');
    const c = await buscarDados('configuracoes', {});
    if (!ativa()) return;
    const main = document.getElementById('main');
    const admin = usuarioAtual?.perfil === 'ADMINISTRADOR';

    const grade = document.createElement('section');
    grade.className = 'grid';
    grade.innerHTML = `
        <article class="panel">
            <form id="formConfiguracoes" novalidate>
                <div class="panel-header">
                    <h2>Dados da Igreja</h2>
                    ${admin ? '<button type="submit" class="primary">Salvar alterações</button>' : ''}
                </div>
                <fieldset ${admin ? '' : 'disabled'} style="border:0;min-width:0;">
                    <div class="form-grid">
                        <div class="field full"><label for="cfNome">Nome da igreja</label><input id="cfNome" required></div>
                        <div class="field"><label for="cfCnpj">CNPJ</label><input id="cfCnpj" placeholder="00.000.000/0000-00" inputmode="numeric"></div>
                        <div class="field"><label for="cfTelefone">Telefone</label><input id="cfTelefone" placeholder="(47) 0000-0000"></div>
                        <div class="field full"><label for="cfEndereco">Endereço</label><input id="cfEndereco" placeholder="Rua, número - Centro"></div>
                        <div class="field"><label for="cfCidade">Cidade</label><input id="cfCidade"></div>
                        <div class="field">
                            <label for="cfEstado">Estado</label>
                            <select id="cfEstado"><option value="">Selecione</option>${ESTADOS.map(e => `<option>${e}</option>`).join('')}</select>
                        </div>
                        <div class="field"><label for="cfHorario">Horário principal</label><input id="cfHorario" type="time"></div>
                        <div class="field">
                            <label for="cfFuso">Fuso horário</label>
                            <select id="cfFuso">
                                <option>America/Sao_Paulo</option><option>America/Manaus</option>
                                <option>America/Cuiaba</option><option>America/Rio_Branco</option><option>America/Noronha</option>
                            </select>
                        </div>
                    </div>
                </fieldset>
                ${admin ? '' : '<p class="panel-description" style="margin-top:14px;">Somente administradores podem alterar as configurações.</p>'}
            </form>
        </article>

        <article class="panel">
            <div class="panel-header"><h2>Preferências</h2></div>
            <div class="list">
                <div class="list-row">
                    <span class="material-icons">notifications</span>
                    <div class="info"><strong>Notificações</strong><small>Receber alertas sobre escalas pendentes</small></div>
                    <label class="switch"><input type="checkbox" id="cfNotificacoes" ${admin ? '' : 'disabled'} aria-label="Notificações"><span class="slider"></span></label>
                </div>
                <div class="list-row">
                    <span class="material-icons">mark_email_unread</span>
                    <div class="info"><strong>Notificações por e-mail</strong><small>Enviar avisos importantes aos responsáveis</small></div>
                    <label class="switch"><input type="checkbox" id="cfEmail" ${admin ? '' : 'disabled'} aria-label="Notificações por e-mail"><span class="slider"></span></label>
                </div>
                <div class="list-row">
                    <span class="material-icons">cloud_upload</span>
                    <div class="info"><strong>Backup</strong><small id="cfResumoBackup"></small></div>
                </div>
            </div>
        </article>
    `;

    const backup = document.createElement('section');
    backup.className = 'panel';
    backup.style.marginTop = '17px';
    backup.innerHTML = `
        <div class="panel-header"><h2>Backup e manutenção</h2></div>
        <div class="list">
            <div class="list-row">
                <div class="mini-avatar"><span class="material-icons">cloud_sync</span></div>
                <div class="info"><strong>Backup automático</strong><small id="cfUltimoBackup"></small></div>
                <span class="badge" id="cfStatusBackup"></span>
            </div>
            <div class="list-row">
                <div class="mini-avatar"><span class="material-icons">history</span></div>
                <div class="info"><strong>Próximo backup</strong><small id="cfProximoBackup"></small></div>
                ${admin ? '<button type="button" id="cfExecutarBackup">Executar agora</button>' : ''}
            </div>
        </div>
        <p class="panel-description" id="cfMensagemBackup" role="status"></p>
    `;

    main.replaceChildren(headerInterno('Configurações', 'Personalize os dados e preferências do sistema'), grade, backup);

    const $ = id => main.querySelector('#' + id);
    $('cfNome').value = c.nome_igreja || '';
    $('cfCnpj').value = c.cnpj || '';
    $('cfTelefone').value = c.telefone || '';
    $('cfEndereco').value = c.endereco || '';
    $('cfCidade').value = c.cidade || '';
    $('cfEstado').value = c.estado || '';
    $('cfHorario').value = formatarHora(c.horario_principal);
    $('cfFuso').value = c.fuso_horario || 'America/Sao_Paulo';
    $('cfNotificacoes').checked = Boolean(c.notificacoes);
    $('cfEmail').checked = Boolean(c.notificacoes_email);

    function mostrarBackup(ultimo, proximo) {
        $('cfResumoBackup').textContent = `Último backup: ${dataHora(ultimo)}`;
        $('cfUltimoBackup').textContent = `Último backup: ${dataHora(ultimo)}`;
        $('cfProximoBackup').textContent = proximo ? `Agendado para ${dataHora(proximo)}` : 'Nenhum backup agendado';
        const recente = ultimo && (Date.now() - new Date(ultimo)) < 2 * 86400000;
        $('cfStatusBackup').className = `badge ${recente ? 'ok' : 'pending'}`;
        $('cfStatusBackup').textContent = recente ? 'Concluído' : 'Atrasado';
    }
    mostrarBackup(c.ultimo_backup, c.proximo_backup);

    // Máscara simples de CNPJ
    $('cfCnpj').addEventListener('input', () => {
        const d = $('cfCnpj').value.replace(/\D/g, '').slice(0, 14);
        $('cfCnpj').value = d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
            .replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
    });

    if (!admin) return;

    async function salvar() {
        const form = $('formConfiguracoes');
        try {
            await enviarDados('configuracoes', 'PUT', {
                nome_igreja: $('cfNome').value,
                cnpj: $('cfCnpj').value,
                telefone: $('cfTelefone').value,
                endereco: $('cfEndereco').value,
                cidade: $('cfCidade').value,
                estado: $('cfEstado').value,
                horario_principal: $('cfHorario').value,
                fuso_horario: $('cfFuso').value,
                notificacoes: $('cfNotificacoes').checked,
                notificacoes_email: $('cfEmail').checked
            });
            mensagemFormulario(form, 'Configurações salvas.', false);
        } catch (erro) {
            mensagemFormulario(form, erro.message);
        }
    }

    $('formConfiguracoes').addEventListener('submit', event => { event.preventDefault(); salvar(); });
    $('cfNotificacoes').addEventListener('change', salvar);
    $('cfEmail').addEventListener('change', salvar);

    $('cfExecutarBackup').addEventListener('click', async () => {
        const botao = $('cfExecutarBackup');
        botao.disabled = true;
        $('cfMensagemBackup').textContent = 'Gerando backup...';
        try {
            const resultado = await enviarDados('configuracoes/backup', 'POST');
            mostrarBackup(resultado.ultimo_backup, resultado.proximo_backup);
            $('cfMensagemBackup').textContent = `Backup salvo em backups/${resultado.arquivo} (${(resultado.tamanho / 1024).toFixed(0)} KB).`;
        } catch (erro) {
            $('cfMensagemBackup').textContent = erro.message;
        } finally {
            botao.disabled = false;
        }
    });
}
