// =========================================
// PORTAL DO VOLUNTÁRIO ("Minha área")
// =========================================

async function gerenciaMinhaArea() {
    registrarRota('minha-area');
    marcarMenuAtivo('gerenciaMinhaArea');
    const main = document.getElementById('main');
    const primeiroNome = (usuarioAtual?.nome || '').split(' ')[0];

    let v;
    try {
        v = await enviarDados('portal', 'GET');
    } catch (erro) {
        const aviso = document.createElement('section');
        aviso.className = 'panel';
        aviso.innerHTML = `<p class="vazio">${escapar(erro.message)}</p>`;
        main.replaceChildren(headerInterno(`Olá, ${primeiroNome}!`, 'Sua área de voluntário'), aviso);
        return;
    }

    const e = v.estatisticas;
    const presenca = e.realizadas ? Math.round((e.presentes / e.realizadas) * 100) : null;
    const recarregar = () => abrirSubstituindo(gerenciaMinhaArea);
    const proxima = v.proximas.find(p => !p.recusado);

    // ---------- Próximas escalas (cartões)
    const escalas = document.createElement('section');
    escalas.className = 'panel';
    escalas.innerHTML = `
        <div class="panel-header">
            <div><h2>Minhas próximas escalas</h2><p>${e.aguardando ? `Você tem ${e.aguardando} escala(s) aguardando sua resposta` : 'Tudo respondido. Obrigado!'}</p></div>
        </div>
        <div class="escala-cards">
            ${v.proximas.map(p => `
                <article class="escala-card ${p.confirmado ? 'confirmada' : p.recusado ? 'recusada' : 'aguardando'}" data-escala="${p.id_escala}">
                    <div class="escala-data">
                        <strong>${dataComSemana(p.data_escala)}</strong>
                        ${situacaoEscala(p)}
                    </div>
                    <h3>${escapar(p.evento || 'Escala')}</h3>
                    <p class="escala-info">
                        <span class="material-icons">engineering</span>${escapar(p.funcao || '')}
                        <span class="material-icons">schedule</span>Chegada ${formatarHora(p.horario)}${p.hora_inicio ? ` • início ${formatarHora(p.hora_inicio)}` : ''}
                    </p>
                    ${p.observacoes ? `<p class="escala-obs">${escapar(p.observacoes)}</p>` : ''}
                    ${p.recusado ? `<p class="escala-obs">Seu motivo: ${escapar(p.motivo_recusa || '')}</p>` : ''}
                    <div class="acoes">
                        ${p.confirmado ? '' : '<button type="button" class="primary" data-resposta="confirmar"><span class="material-icons">check</span>Confirmar presença</button>'}
                        ${p.recusado ? '' : '<button type="button" class="secondary" data-resposta="recusar"><span class="material-icons">event_busy</span>Não posso ir</button>'}
                        ${p.recusado ? '<button type="button" class="secondary" data-resposta="pendente">Mudei de ideia</button>' : ''}
                        ${p.colegas.length ? `<button type="button" class="secondary" data-equipe><span class="material-icons">groups</span>Equipe (${p.colegas.length})</button>` : ''}
                    </div>
                    <ul class="equipe" hidden>
                        ${p.colegas.map(c => `<li><strong>${escapar(c.nome)}</strong> — ${escapar(c.funcao)}</li>`).join('')}
                    </ul>
                </article>`).join('') || '<p class="vazio">Você não tem escalas futuras no momento.</p>'}
        </div>
    `;

    // ---------- Disponibilidade e contato + senha
    const preferencias = document.createElement('section');
    preferencias.className = 'grid';
    preferencias.style.marginTop = '17px';
    preferencias.innerHTML = `
        <div class="coluna">
            ${painelAusencias(v.ausencias, { titulo: 'Minhas ausências', descricao: 'Avise quando não puder servir (férias, viagem...)' })}
            <article class="panel">
                <div class="panel-header"><div><h2>Histórico de serviço</h2><p>${e.presentes} presença(s) nas últimas escalas</p></div></div>
                <div class="table-responsive">
                    <table>
                        <thead><tr><th>Data</th><th>Evento</th><th>Função</th><th>Presença</th></tr></thead>
                        <tbody>
                            ${v.historico.slice(0, 12).map(h => `
                                <tr><td>${formatarDataSimples(h.data_escala)}</td><td>${escapar(h.evento || '—')}</td><td>${escapar(h.funcao || '—')}</td><td>${situacaoEscala(h, true)}</td></tr>`).join('')
                                || '<tr><td colspan="4" class="vazio">Você ainda não serviu em nenhuma escala.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </article>
        </div>

        <div class="coluna">
            <article class="panel">
                <div class="panel-header"><div><h2>Disponibilidade e contato</h2><p>A equipe usa isso para montar as escalas</p></div></div>
                <form id="formPreferencias" novalidate>
                    <div class="checkbox-grid days-grid">
                        ${Object.entries(NOMES_DIAS).map(([valor, nome]) => `
                            <label class="checkbox-card"><input type="checkbox" name="dias" value="${valor}" ${(v.disponibilidade || []).includes(valor) ? 'checked' : ''}><span>${nome}</span></label>`).join('')}
                    </div>
                    <div class="form-grid" style="margin-top:15px;">
                        <div class="form-group"><label for="ptTelefone">Telefone</label><input type="tel" id="ptTelefone" maxlength="20"></div>
                        <div class="form-group"><label for="ptEmail">E-mail</label><input type="email" id="ptEmail" maxlength="150"></div>
                    </div>
                    <div class="form-actions-left"><button type="submit" class="primary"><span class="material-icons">save</span>Salvar</button></div>
                </form>
            </article>

            <article class="panel">
                <div class="panel-header"><h2>Minhas funções</h2><span class="badge ok">${escapar(v.departamento || '')}</span></div>
                <div class="chips">${v.funcoes.map(f => `<span class="chip">${escapar(f.nome)}</span>`).join('') || '—'}</div>
                <p class="subtitulo" style="margin-top:12px;">Para mudar de função, fale com o líder do seu departamento.</p>
            </article>

            <article class="panel">
                <div class="panel-header"><h2>Trocar senha</h2></div>
                <form id="formSenha" novalidate>
                    <div class="form-grid">
                        <div class="form-group full"><label for="ptSenhaAtual">Senha atual</label><input type="password" id="ptSenhaAtual" autocomplete="current-password" required></div>
                        <div class="form-group"><label for="ptNovaSenha">Nova senha</label><input type="password" id="ptNovaSenha" autocomplete="new-password" minlength="6" required></div>
                        <div class="form-group"><label for="ptConfirmar">Confirmar</label><input type="password" id="ptConfirmar" autocomplete="new-password" required></div>
                    </div>
                    <div class="form-actions-left"><button type="submit" class="primary">Trocar senha</button></div>
                </form>
            </article>
        </div>
    `;

    main.replaceChildren(
        headerInterno(`Olá, ${primeiroNome}!`, 'Sua área de voluntário'),
        cardsEstatisticas([
            ['blue', 'event', proxima ? dataComSemana(proxima.data_escala) : '—', proxima ? `Próxima: ${proxima.evento || ''}` : 'Sem escala marcada'],
            ['orange', 'pending_actions', e.aguardando, 'Aguardando sua resposta'],
            ['green', 'volunteer_activism', e.presentes, 'Vezes que você serviu'],
            ['purple', 'percent', presenca === null ? '—' : `${presenca}%`, 'Presença confirmada']
        ]),
        escalas,
        preferencias
    );

    // Responder escalas e ver equipe
    escalas.addEventListener('click', async event => {
        const cartao = event.target.closest('[data-escala]');
        if (!cartao) return;
        if (event.target.closest('[data-equipe]')) {
            const lista = cartao.querySelector('.equipe');
            lista.hidden = !lista.hidden;
            return;
        }
        const botao = event.target.closest('[data-resposta]');
        if (!botao) return;
        const corpo = { resposta: botao.dataset.resposta };
        if (corpo.resposta === 'recusar') {
            corpo.motivo = await pedirMotivoRecusa(cartao.querySelector('h3').textContent + ' — ' + cartao.querySelector('.escala-data strong').textContent);
            if (!corpo.motivo) return;
        }
        botao.disabled = true;
        try {
            await enviarDados(`portal/escalas/${cartao.dataset.escala}`, 'PATCH', corpo);
            recarregar();
        } catch (erro) {
            botao.disabled = false;
            alert(erro.message);
        }
    });

    // Disponibilidade e contato
    const formPref = preferencias.querySelector('#formPreferencias');
    formPref.querySelector('#ptTelefone').value = v.telefone || '';
    formPref.querySelector('#ptEmail').value = v.email || '';
    formPref.addEventListener('submit', async event => {
        event.preventDefault();
        try {
            await enviarDados('portal/preferencias', 'PUT', {
                disponibilidade: [...formPref.querySelectorAll('input[name="dias"]:checked')].map(c => c.value),
                telefone: formPref.querySelector('#ptTelefone').value,
                email: formPref.querySelector('#ptEmail').value
            });
            mensagemFormulario(formPref, 'Preferências salvas.', false);
        } catch (erro) {
            mensagemFormulario(formPref, erro.message);
        }
    });

    // Troca de senha
    const formSenha = preferencias.querySelector('#formSenha');
    formSenha.addEventListener('submit', async event => {
        event.preventDefault();
        const nova = formSenha.querySelector('#ptNovaSenha').value;
        if (nova.length < 6) return mensagemFormulario(formSenha, 'A nova senha deve ter pelo menos 6 caracteres.');
        if (nova !== formSenha.querySelector('#ptConfirmar').value) return mensagemFormulario(formSenha, 'As senhas não coincidem.');
        try {
            await enviarDados('portal/senha', 'PUT', { senha_atual: formSenha.querySelector('#ptSenhaAtual').value, nova_senha: nova });
            formSenha.reset();
            mensagemFormulario(formSenha, 'Senha alterada.', false);
        } catch (erro) {
            mensagemFormulario(formSenha, erro.message);
        }
    });

    configurarAusencias(preferencias, 'portal', recarregar);
}
