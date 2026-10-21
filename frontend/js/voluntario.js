// =========================================
// FICHA DO VOLUNTÁRIO (gestão) + utilitários
// compartilhados com o portal do voluntário
// =========================================

const SEMANA_CURTA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// "Dom, 25/10/2026"
function dataComSemana(data) {
    if (!data) return '';
    const [ano, mes, dia] = String(data).slice(0, 10).split('-').map(Number);
    return `${SEMANA_CURTA[new Date(ano, mes - 1, dia).getDay()]}, ${formatarDataSimples(data)}`;
}

// Selo da situação do voluntário em uma escala
function situacaoEscala(p, passada = false) {
    if (p.confirmado) return `<span class="badge ok">${passada ? 'Presente' : 'Confirmado'}</span>`;
    if (p.recusado) return `<span class="badge inactive" title="${escapar(p.motivo_recusa || '')}">Recusou</span>`;
    return passada ? '<span class="badge inactive">Ausente</span>' : '<span class="badge pending">Aguardando resposta</span>';
}

// Pergunta o motivo da recusa; devolve o texto ou null se cancelar
function pedirMotivoRecusa(descricao) {
    return new Promise(resolve => {
        const { modal, fechar } = abrirModal('Não poderá servir?', descricao, `
            <form novalidate>
                <div class="form-group">
                    <label for="motivoRecusa">Motivo (a equipe usa para encontrar um substituto)</label>
                    <textarea id="motivoRecusa" rows="3" maxlength="300" placeholder="Ex.: viagem a trabalho, consulta médica..." required></textarea>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn-cancel" data-cancelar>Voltar</button>
                    <button type="submit" class="primary">Enviar recusa</button>
                </div>
            </form>`);
        let respondeu = false;
        const form = modal.querySelector('form');
        modal.querySelector('#motivoRecusa').focus();
        modal.querySelector('[data-cancelar]').addEventListener('click', () => { fechar(); });
        form.addEventListener('submit', event => {
            event.preventDefault();
            const motivo = modal.querySelector('#motivoRecusa').value.trim();
            if (!motivo) return mensagemFormulario(form, 'Escreva o motivo.');
            respondeu = true;
            fechar();
            resolve(motivo);
        });
        // Fechou pelo X, Esc ou clique fora
        new MutationObserver((_, observador) => {
            if (!document.body.contains(modal)) {
                observador.disconnect();
                if (!respondeu) resolve(null);
            }
        }).observe(document.body, { childList: true });
    });
}

// Lista de ausências + formulário para informar uma nova
function painelAusencias(ausencias, { titulo = 'Ausências informadas', descricao = '' } = {}) {
    return `
        <article class="panel" id="painelAusencias">
            <div class="panel-header"><div><h2>${titulo}</h2>${descricao ? `<p>${descricao}</p>` : ''}</div></div>
            <div class="list">
                ${ausencias.map(a => `
                    <div class="list-row">
                        <span class="material-icons">event_busy</span>
                        <div class="info">
                            <strong>${formatarDataSimples(a.data_inicio)} a ${formatarDataSimples(a.data_fim)}</strong>
                            <small>${escapar(a.motivo || 'Sem motivo informado')}</small>
                        </div>
                        <button type="button" class="action-btn" data-remover-ausencia="${a.id_ausencia}" title="Remover" aria-label="Remover ausência">
                            <span class="material-icons">delete</span>
                        </button>
                    </div>`).join('') || '<p class="vazio">Nenhuma ausência futura informada.</p>'}
            </div>
            <form class="form-ausencia" novalidate>
                <div class="form-grid">
                    <div class="form-group"><label for="ausInicio">De</label><input type="date" id="ausInicio" min="${dataDeHoje()}" required></div>
                    <div class="form-group"><label for="ausFim">Até</label><input type="date" id="ausFim" min="${dataDeHoje()}" required></div>
                    <div class="form-group full"><label for="ausMotivo">Motivo</label><input type="text" id="ausMotivo" maxlength="200" placeholder="Ex.: férias, viagem, recuperação"></div>
                </div>
                <div class="form-actions-left"><button type="submit" class="primary"><span class="material-icons">event_busy</span>Informar ausência</button></div>
            </form>
        </article>`;
}

// Liga os eventos do painel de ausências; "rota" é a base da API (ex.: "portal" ou "voluntarios/12")
function configurarAusencias(container, rota, aoMudar) {
    const painel = container.querySelector('#painelAusencias');
    const form = painel.querySelector('.form-ausencia');
    painel.querySelector('#ausInicio').addEventListener('change', event => {
        painel.querySelector('#ausFim').min = event.target.value;
        if (!painel.querySelector('#ausFim').value) painel.querySelector('#ausFim').value = event.target.value;
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        try {
            const resposta = await enviarDados(`${rota}/ausencias`, 'POST', {
                data_inicio: painel.querySelector('#ausInicio').value,
                data_fim: painel.querySelector('#ausFim').value,
                motivo: painel.querySelector('#ausMotivo').value
            });
            if (resposta.conflitos?.length) {
                alert(`Ausência registrada. Atenção: há ${resposta.conflitos.length} escala(s) nesse período:\n`
                    + resposta.conflitos.map(c => `• ${dataComSemana(c.data_escala)} — ${c.evento || ''}`).join('\n')
                    + '\n\nResponda "Não posso ir" nelas para a equipe providenciar substituto.');
            }
            aoMudar();
        } catch (erro) {
            mensagemFormulario(form, erro.message);
        }
    });

    painel.addEventListener('click', async event => {
        const botao = event.target.closest('[data-remover-ausencia]');
        if (!botao || !confirm('Remover esta ausência?')) return;
        try {
            await enviarDados(`${rota}/ausencias/${botao.dataset.removerAusencia}`, 'DELETE');
            aoMudar();
        } catch (erro) {
            alert(erro.message);
        }
    });
}

// =========================================
// FICHA (gestão)
// =========================================

async function fichaVoluntario(id) {
    registrarRota('voluntarios/ficha', [id]);
    marcarMenuAtivo('gerenciaVoluntarios');
    const main = document.getElementById('main');

    let v;
    try {
        v = await enviarDados(`voluntarios/${id}`, 'GET');
    } catch (erro) {
        main.replaceChildren(headerComVoltar('Voluntário', erro.message, gerenciaVoluntarios));
        return;
    }

    const e = v.estatisticas;
    const presenca = e.realizadas ? Math.round((e.presentes / e.realizadas) * 100) : null;
    const recarregar = () => abrirSubstituindo(fichaVoluntario, id);
    const podeAcesso = temPermissao('usuarios');

    const topo = document.createElement('section');
    topo.className = 'grid';
    topo.innerHTML = `
        <article class="panel">
            <div class="panel-header">
                <div><h2>Próximas escalas</h2><p>${e.aguardando} aguardando resposta</p></div>
                <button type="button" class="secondary" id="btnIrEscalas"><span class="material-icons" style="font-size:16px;vertical-align:middle;">calendar_month</span> Ver escalas</button>
            </div>
            <div class="table-responsive">
                <table>
                    <thead><tr><th>Data</th><th>Evento</th><th>Função</th><th>Chegada</th><th>Situação</th><th>Ações</th></tr></thead>
                    <tbody id="fichaProximas">
                        ${v.proximas.map(p => `
                            <tr>
                                <td>${dataComSemana(p.data_escala)}</td>
                                <td>${escapar(p.evento || '—')}</td>
                                <td>${escapar(p.funcao || '—')}</td>
                                <td>${formatarHora(p.horario)}</td>
                                <td>${situacaoEscala(p)}${p.recusado ? `<small class="motivo">${escapar(p.motivo_recusa || '')}</small>` : ''}</td>
                                <td class="acoes-escala">
                                    ${p.confirmado ? '' : `<button type="button" class="action-btn" data-resposta="confirmar" data-escala="${p.id_escala}" title="Marcar como confirmado" aria-label="Confirmar"><span class="material-icons">check</span></button>`}
                                    ${!p.confirmado && !p.recusado ? '' : `<button type="button" class="action-btn" data-resposta="pendente" data-escala="${p.id_escala}" title="Voltar para aguardando" aria-label="Voltar para aguardando"><span class="material-icons">undo</span></button>`}
                                    ${p.recusado ? '' : `<button type="button" class="action-btn" data-resposta="recusar" data-escala="${p.id_escala}" title="Registrar recusa" aria-label="Registrar recusa"><span class="material-icons">event_busy</span></button>`}
                                    <button type="button" class="action-btn" data-retirar="${p.id_escala}" title="Retirar da escala" aria-label="Retirar da escala"><span class="material-icons">person_remove</span></button>
                                </td>
                            </tr>`).join('') || '<tr><td colspan="6" class="vazio">Nenhuma escala futura.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </article>

        <article class="panel">
            <div class="panel-header">
                <h2>Dados do voluntário</h2>
                <button type="button" class="primary" id="btnEditarVoluntario"><span class="material-icons" style="font-size:16px;vertical-align:middle;">edit</span> Editar</button>
            </div>
            <div class="list">
                <div class="list-row"><span class="material-icons">phone</span><div class="info"><strong>Telefone</strong><small>${escapar(v.telefone || 'Não informado')}</small></div></div>
                <div class="list-row"><span class="material-icons">mail</span><div class="info"><strong>E-mail</strong><small>${escapar(v.email || 'Não informado')}</small></div></div>
                <div class="list-row"><span class="material-icons">groups</span><div class="info"><strong>Departamento</strong><small>${escapar(v.departamento || 'Sem departamento')}</small></div></div>
                <div class="list-row"><span class="material-icons">engineering</span><div class="info"><strong>Funções</strong><div class="chips">${v.funcoes.map(f => `<span class="chip">${escapar(f.nome)}</span>`).join('') || '—'}</div></div></div>
                <div class="list-row"><span class="material-icons">calendar_month</span><div class="info"><strong>Disponível</strong><small>${escapar(nomesDosDias(v.disponibilidade) || '—')}</small></div></div>
                <div class="list-row"><span class="material-icons">history</span><div class="info"><strong>Voluntário desde</strong><small>${formatarDataSimples(v.data_inicio_voluntariado) || '—'}</small></div></div>
                ${v.observacoes ? `<div class="list-row"><span class="material-icons">notes</span><div class="info"><strong>Observações da equipe</strong><small>${escapar(v.observacoes)}</small></div></div>` : ''}
            </div>
            <div class="form-actions-left">
                <button type="button" id="btnStatusVoluntario" class="${v.ativo ? 'btn-remover' : 'btn-editar'}" style="color:#fff;">${v.ativo ? 'Inativar voluntário' : 'Reativar voluntário'}</button>
            </div>
        </article>
    `;

    const base = document.createElement('section');
    base.className = 'grid';
    base.style.marginTop = '17px';
    base.innerHTML = `
        <article class="panel">
            <div class="panel-header"><div><h2>Histórico de serviço</h2><p>Últimas ${v.historico.length} escalas</p></div></div>
            <div class="table-responsive">
                <table>
                    <thead><tr><th>Data</th><th>Evento</th><th>Função</th><th>Presença</th></tr></thead>
                    <tbody>
                        ${v.historico.map(h => `
                            <tr>
                                <td>${formatarDataSimples(h.data_escala)}</td>
                                <td>${escapar(h.evento || '—')}</td>
                                <td>${escapar(h.funcao || '—')}</td>
                                <td>${situacaoEscala(h, true)}</td>
                            </tr>`).join('') || '<tr><td colspan="4" class="vazio">Ainda não serviu em nenhuma escala.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </article>

        <div class="coluna">
            <article class="panel" id="painelAcesso">
                <div class="panel-header"><h2>Acesso ao portal</h2>
                    ${v.acesso ? `<span class="badge ${v.acesso.ativo ? 'ok' : 'inactive'}">${v.acesso.ativo ? 'Liberado' : 'Bloqueado'}</span>` : '<span class="badge pending">Sem acesso</span>'}
                </div>
                ${v.acesso
                    ? `<p class="subtitulo">Login: <strong>${escapar(v.acesso.email)}</strong><br>Último acesso: ${v.acesso.ultimo_acesso ? new Date(v.acesso.ultimo_acesso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'ainda não acessou'}</p>
                       ${podeAcesso ? `<button type="button" id="btnAlterarAcesso" data-ativo="${v.acesso.ativo}">${v.acesso.ativo ? 'Bloquear acesso' : 'Liberar acesso'}</button>` : ''}`
                    : `<p class="subtitulo">Com o acesso, o voluntário vê as próprias escalas, confirma presença e informa ausências.</p>
                       ${podeAcesso ? '<button type="button" class="primary" id="btnCriarAcesso">Criar acesso ao portal</button>' : '<p class="subtitulo">Peça a quem gerencia usuários para criar o acesso.</p>'}`}
            </article>

            ${painelAusencias(v.ausencias, { descricao: 'Períodos em que não deve ser escalado' })}

            <article class="panel">
                <div class="panel-header"><h2>Onde mais serviu</h2></div>
                <div class="list">
                    ${v.por_funcao.map(f => `
                        <div class="list-row"><span class="material-icons">engineering</span>
                            <div class="info"><strong>${escapar(f.funcao)}</strong></div><span class="badge ok">${f.vezes}x</span>
                        </div>`).join('') || '<p class="vazio">Sem histórico.</p>'}
                </div>
            </article>
        </div>
    `;

    main.replaceChildren(
        headerComVoltar(v.nome, `${v.departamento || 'Voluntário'} • ${v.ativo ? 'Ativo' : 'Inativo'}`, gerenciaVoluntarios),
        cardsEstatisticas([
            ['blue', 'event_available', e.realizadas, 'Escalas realizadas'],
            ['green', 'percent', presenca === null ? '—' : `${presenca}%`, 'Presença confirmada'],
            ['purple', 'upcoming', e.proximas, e.proxima ? `Próximas (a 1ª em ${formatarDataSimples(e.proxima)})` : 'Próximas escalas'],
            ['orange', 'event_busy', e.recusadas, 'Recusas']
        ]),
        topo,
        base
    );

    // --- Próximas escalas: confirmar / aguardando / recusar / retirar
    topo.querySelector('#fichaProximas').addEventListener('click', async event => {
        const botao = event.target.closest('[data-resposta], [data-retirar]');
        if (!botao) return;
        try {
            if (botao.dataset.retirar) {
                if (!confirm(`Retirar ${v.nome} desta escala?`)) return;
                await enviarDados(`voluntarios/${id}/escalas/${botao.dataset.retirar}`, 'DELETE');
            } else {
                const corpo = { resposta: botao.dataset.resposta };
                if (corpo.resposta === 'recusar') {
                    corpo.motivo = await pedirMotivoRecusa(`Registrar que ${v.nome} não poderá servir.`);
                    if (!corpo.motivo) return;
                }
                await enviarDados(`voluntarios/${id}/escalas/${botao.dataset.escala}`, 'PATCH', corpo);
            }
            recarregar();
        } catch (erro) {
            alert(erro.message);
        }
    });

    topo.querySelector('#btnIrEscalas').addEventListener('click', () => {
        if (temPermissao('escalas')) {
            marcarMenuAtivo('gerenciaEscalas');
            gerenciaEscalas(v.proximas[0] ? String(v.proximas[0].data_escala).slice(0, 10) : dataDeHoje());
        } else {
            alert('Você não tem acesso à página de Escalas.');
        }
    });

    topo.querySelector('#btnStatusVoluntario').addEventListener('click', async () => {
        if (!confirm(v.ativo ? 'Inativar? Ele deixa de aparecer nas novas escalas.' : 'Reativar este voluntário?')) return;
        try {
            await enviarDados(`voluntarios/${id}/status`, 'PATCH', { ativo: !v.ativo });
            recarregar();
        } catch (erro) {
            alert(erro.message);
        }
    });

    topo.querySelector('#btnEditarVoluntario').addEventListener('click', () => editarVoluntario(v, recarregar));

    // --- Acesso ao portal
    base.querySelector('#btnCriarAcesso')?.addEventListener('click', () => {
        const { modal, fechar } = abrirModal('Criar acesso ao portal', `Login de ${v.nome}`, `
            <form novalidate>
                <div class="form-grid">
                    <div class="form-group full"><label for="acEmail">E-mail de login</label><input type="email" id="acEmail" required></div>
                    <div class="form-group full">
                        <label for="acSenha">Senha inicial</label>
                        <input type="text" id="acSenha" minlength="6" required autocomplete="off">
                        <small>Passe a senha ao voluntário; ele pode trocá-la no portal.</small>
                    </div>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn-cancel" data-cancelar>Cancelar</button>
                    <button type="submit" class="primary">Criar acesso</button>
                </div>
            </form>`);
        const form = modal.querySelector('form');
        modal.querySelector('#acEmail').value = v.email || '';
        // Sugere uma senha aleatória (8 caracteres sem ambiguidade)
        const letras = 'abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789';
        modal.querySelector('#acSenha').value = Array.from(crypto.getRandomValues(new Uint32Array(8)), n => letras[n % letras.length]).join('');
        modal.querySelector('[data-cancelar]').addEventListener('click', fechar);
        form.addEventListener('submit', async event => {
            event.preventDefault();
            try {
                await enviarDados(`voluntarios/${id}/acesso`, 'POST', {
                    email: modal.querySelector('#acEmail').value,
                    senha: modal.querySelector('#acSenha').value
                });
                fechar();
                recarregar();
            } catch (erro) {
                mensagemFormulario(form, erro.message);
            }
        });
    });

    base.querySelector('#btnAlterarAcesso')?.addEventListener('click', async event => {
        const ativar = event.currentTarget.dataset.ativo !== 'true';
        if (!confirm(ativar ? 'Liberar o acesso ao portal?' : 'Bloquear o acesso ao portal? O voluntário não conseguirá entrar.')) return;
        try {
            await enviarDados(`voluntarios/${id}/acesso`, 'PATCH', { ativo: ativar });
            recarregar();
        } catch (erro) {
            alert(erro.message);
        }
    });

    configurarAusencias(base, `voluntarios/${id}`, recarregar);
}

// Edição dos dados do voluntário (modal)
async function editarVoluntario(v, aoSalvar) {
    const [funcoes, candidatos] = await Promise.all([
        buscarDados('funcoes', []),
        buscarDados('voluntarios/candidatos', { departamentos: [] })
    ]);
    const marcadas = new Set(v.funcoes.map(f => f.id_funcao));

    const { modal, fechar } = abrirModal('Editar voluntário', v.nome, `
        <form novalidate>
            <div class="form-grid">
                <div class="form-group"><label for="evTelefone">Telefone</label><input type="tel" id="evTelefone"></div>
                <div class="form-group"><label for="evEmail">E-mail</label><input type="email" id="evEmail"></div>
                <div class="form-group">
                    <label for="evDepartamento">Departamento</label>
                    <select id="evDepartamento"><option value="">Sem departamento</option>
                        ${candidatos.departamentos.map(d => `<option value="${d.id_departamento}">${escapar(d.nome)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label for="evStatus">Status</label>
                    <select id="evStatus"><option value="ativo">Ativo</option><option value="inativo">Inativo</option></select>
                </div>
            </div>
            <h3 style="margin:18px 0 10px;font-size:15px;">Funções</h3>
            <div class="checkbox-grid">
                ${funcoes.map(f => `<label class="checkbox-card"><input type="checkbox" name="evFuncoes" value="${f.id_funcao}" ${marcadas.has(f.id_funcao) ? 'checked' : ''}><span>${escapar(f.nome)}</span></label>`).join('')}
            </div>
            <h3 style="margin:18px 0 10px;font-size:15px;">Disponibilidade</h3>
            <div class="checkbox-grid days-grid">
                ${Object.entries(NOMES_DIAS).map(([valor, nome]) => `<label class="checkbox-card"><input type="checkbox" name="evDias" value="${valor}" ${(v.disponibilidade || []).includes(valor) ? 'checked' : ''}><span>${nome}</span></label>`).join('')}
            </div>
            <div class="form-group" style="margin-top:18px;"><label for="evObservacoes">Observações da equipe</label><textarea id="evObservacoes" rows="3"></textarea></div>
            <div class="form-actions">
                <button type="button" class="btn-cancel" data-cancelar>Cancelar</button>
                <button type="submit" class="primary">Salvar</button>
            </div>
        </form>`);

    const form = modal.querySelector('form');
    const $ = idCampo => modal.querySelector('#' + idCampo);
    $('evTelefone').value = v.telefone || '';
    $('evEmail').value = v.email || '';
    $('evDepartamento').value = v.id_departamento || '';
    $('evStatus').value = v.ativo ? 'ativo' : 'inativo';
    $('evObservacoes').value = v.observacoes || '';
    modal.querySelector('[data-cancelar]').addEventListener('click', fechar);

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const marcados = nome => [...form.querySelectorAll(`input[name="${nome}"]:checked`)].map(c => c.value);
        try {
            await enviarDados(`voluntarios/${v.id_voluntario}`, 'PUT', {
                telefone: $('evTelefone').value,
                email: $('evEmail').value,
                id_departamento: $('evDepartamento').value,
                ativo: $('evStatus').value === 'ativo',
                funcoes: marcados('evFuncoes'),
                disponibilidade: marcados('evDias'),
                observacoes: $('evObservacoes').value
            });
            fechar();
            aoSalvar();
        } catch (erro) {
            mensagemFormulario(form, erro.message);
        }
    });
}
