// =========================================
// MINHA ÁREA
// Voluntário: as próprias escalas em primeiro lugar (portal do voluntário).
// Membro ou visitante: a programação da igreja.
// A classificação vem da API (dados reais do login), não da tela.
// =========================================

// Quantos dias faltam (texto curto): "Hoje", "Amanhã", "Em 5 dias"
function diasAte(data) {
    const [a, m, d] = String(data).slice(0, 10).split('-').map(Number);
    const [ha, hm, hd] = dataDeHoje().split('-').map(Number);
    const dias = Math.round((Date.UTC(a, m - 1, d) - Date.UTC(ha, hm - 1, hd)) / 86400000);
    return dias <= 0 ? 'Hoje' : dias === 1 ? 'Amanhã' : `Em ${dias} dias`;
}

// Painel "Próximos eventos da igreja" (escalados = ids de eventos em que a pessoa serve)
// (limite = quantos aparecem antes do botão "Ver todos")
function painelProximosEventos(eventos, { titulo, descricao, escalados = new Set(), limite = Infinity }) {
    const painel = document.createElement('section');
    painel.className = 'panel painel-agenda';
    painel.innerHTML = `
        <div class="panel-header"><div><h2>${titulo}</h2><p>${descricao}</p></div></div>
        ${eventos.length ? `<ul class="agenda-eventos">
            ${eventos.map((ev, i) => {
                const tipo = TIPOS_DE_EVENTO[ev.tipo_evento] ? ev.tipo_evento : 'evento';
                const [, mes, dia] = String(ev.data_evento).slice(0, 10).split('-');
                const horario = ev.hora_inicio ? `${formatarHora(ev.hora_inicio)}${ev.hora_fim ? ' às ' + formatarHora(ev.hora_fim) : ''}` : 'Horário a definir';
                return `
                    <li class="agenda-evento tipo-${tipo}" ${i >= limite ? 'hidden' : ''}>
                        <span class="agenda-data" aria-hidden="true"><strong>${dia}</strong>${MESES_CURTOS[Number(mes) - 1]}</span>
                        <div class="agenda-info">
                            <strong>${escapar(ev.nome)}</strong>
                            <small><span class="material-icons" aria-hidden="true">event</span>${escapar(dataComSemana(ev.data_evento))}</small>
                            <small><span class="material-icons" aria-hidden="true">schedule</span>${horario}</small>
                        </div>
                        <div class="agenda-selos">
                            <span class="selo-tipo">${TIPOS_DE_EVENTO[tipo]}</span>
                            <span class="badge pending">${diasAte(ev.data_evento)}</span>
                            ${escalados.has(ev.id_evento) ? '<span class="badge ok">Você está escalado(a)</span>' : ''}
                        </div>
                    </li>`;
            }).join('')}
        </ul>
        ${eventos.length > limite ? `<button type="button" class="secondary ver-todos-eventos"><span class="material-icons">expand_more</span>Ver todos os eventos (${eventos.length})</button>` : ''}`
        : '<p class="vazio">Nenhum evento programado no momento. Volte em breve!</p>'}
    `;
    painel.querySelector('.ver-todos-eventos')?.addEventListener('click', event => {
        painel.querySelectorAll('.agenda-evento[hidden]').forEach(item => { item.hidden = false; });
        event.currentTarget.remove();
    });
    return painel;
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// Membro ou visitante: painel informativo com a programação
function areaDoParticipante(main, dados, primeiroNome) {
    const eventos = dados.eventos || [];
    const proximo = eventos[0];
    const emUmaSemana = eventos.filter(ev => /^(Hoje|Amanhã|Em [2-7] dias)$/.test(diasAte(ev.data_evento))).length;
    const cards = cardsEstatisticas([
        ['blue', 'event', proximo ? dataComSemana(proximo.data_evento) : '—', proximo ? `Próximo: ${proximo.nome}` : 'Nenhum evento marcado'],
        ['green', 'date_range', emUmaSemana, 'Eventos nos próximos 7 dias']
    ]);
    cards.classList.add('cards-duas');

    // Quem acabou de criar a conta: como passa a servir (decisão da liderança)
    const servir = document.createElement('section');
    servir.className = 'panel aviso-servir';
    servir.innerHTML = `
        <span class="material-icons" aria-hidden="true">volunteer_activism</span>
        <div><strong>Quer servir como voluntário?</strong>
        <p>Fale com a liderança da igreja. Quando ela definir você como voluntário, suas escalas aparecem aqui, nesta mesma conta.</p></div>`;

    main.replaceChildren(
        headerInterno(`Olá, ${primeiroNome}!`, 'Acompanhe a programação da igreja'),
        cards,
        servir,
        painelProximosEventos(eventos, {
            titulo: 'Próximos eventos da igreja',
            descricao: 'Programação em ordem de data e horário'
        })
    );
}

// "Passar a vaga": o voluntário escolhe quem assume a vaga dele (combinado entre eles).
// A lista vem do servidor: mesma função, disponível no dia, sem ausência e sem outra escala.
async function passarVaga(idEscala, descricao, aoConcluir) {
    const { modal, fechar } = abrirModal('Passar a vaga', descricao, '<p class="vazio">Procurando quem está livre nesse dia...</p>');
    let substitutos;
    try {
        substitutos = (await enviarDados(`portal/escalas/${idEscala}/substitutos`, 'GET')).substitutos;
    } catch (erro) {
        modal.querySelector('.modal-corpo').innerHTML = `<p class="vazio">${escapar(erro.message)}</p>`;
        return;
    }

    const corpo = modal.querySelector('.modal-corpo');
    if (!substitutos.length) {
        corpo.innerHTML = `
            <p class="vazio">Ninguém da sua função está livre nesse dia (disponível, sem ausência e sem outra escala).</p>
            <p class="subtitulo">Use "Não posso ir" para avisar a liderança, que vai procurar um substituto.</p>
            <div class="form-actions"><button type="button" class="primary" data-fechar>Entendi</button></div>`;
        corpo.querySelector('[data-fechar]').addEventListener('click', fechar);
        return;
    }

    corpo.innerHTML = `
        <form novalidate>
            <p class="subtitulo">Combine antes com a pessoa (por WhatsApp ou telefone). Ela assume a sua vaga, fica como
               <strong>aguardando resposta</strong> e confirma pela Minha área dela. A liderança vê a troca.</p>
            <input class="search" type="search" id="buscaSubstituto" placeholder="Buscar pelo nome..." aria-label="Buscar voluntário">
            <div class="list lista-escolha" role="radiogroup" aria-label="Quem pode assumir a vaga">
                ${substitutos.map(s => `
                    <label class="list-row opcao-escolha" data-nome="${escapar(normalizarTexto(s.nome))}">
                        <input type="radio" name="substituto" value="${s.id_voluntario}">
                        <div class="mini-avatar">${escapar(s.nome.charAt(0).toUpperCase())}</div>
                        <div class="info"><strong>${escapar(s.nome)}</strong><small>Livre nesse dia</small></div>
                    </label>`).join('')}
            </div>
            <div class="form-actions">
                <button type="button" class="btn-cancel" data-cancelar>Cancelar</button>
                <button type="submit" class="primary"><span class="material-icons">swap_horiz</span>Passar a vaga</button>
            </div>
        </form>`;

    const form = corpo.querySelector('form');
    corpo.querySelector('#buscaSubstituto').addEventListener('input', event => {
        const termo = normalizarTexto(event.target.value);
        corpo.querySelectorAll('.opcao-escolha').forEach(op => { op.hidden = Boolean(termo) && !op.dataset.nome.includes(termo); });
    });
    corpo.querySelector('[data-cancelar]').addEventListener('click', fechar);
    form.addEventListener('submit', async event => {
        event.preventDefault();
        const escolhido = form.querySelector('input[name="substituto"]:checked');
        if (!escolhido) return mensagemFormulario(form, 'Escolha quem vai assumir a sua vaga.');
        const nome = escolhido.closest('.opcao-escolha').querySelector('strong').textContent;
        if (!confirm(`Passar a sua vaga para ${nome}? Você sai desta escala.`)) return;
        try {
            const resposta = await enviarDados(`portal/escalas/${idEscala}/passar`, 'POST', { id_voluntario: Number(escolhido.value) });
            fechar();
            alert(resposta.mensagem);
            aoConcluir();
        } catch (erro) {
            mensagemFormulario(form, erro.message);
        }
    });
}

async function gerenciaMinhaArea() {
    registrarRota('minha-area');
    const ativa = paginaAtiva();
    marcarMenuAtivo('gerenciaMinhaArea');
    const main = document.getElementById('main');
    const primeiroNome = (usuarioAtual?.nome || '').split(' ')[0];

    let v;
    try {
        v = await enviarDados('portal', 'GET');
    } catch (erro) {
        if (!ativa()) return;
        const aviso = document.createElement('section');
        aviso.className = 'panel';
        aviso.innerHTML = `<p class="vazio">${escapar(erro.message)}</p>`;
        main.replaceChildren(headerInterno(`Olá, ${primeiroNome}!`, 'Minha área'), aviso);
        return;
    }
    if (!ativa()) return;

    if (v.classificacao !== 'voluntario') return areaDoParticipante(main, v, primeiroNome);

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
                    ${p.assumiu_de ? `<p class="escala-troca"><span class="material-icons">swap_horiz</span>Você assumiu a vaga de ${escapar(p.assumiu_de)}</p>` : ''}
                    ${p.bloqueada ? avisoSomenteConsulta(p.realizada) : ''}
                    <div class="acoes">
                        ${p.bloqueada ? '' : `
                        ${p.confirmado ? '' : '<button type="button" class="primary" data-resposta="confirmar"><span class="material-icons">check</span>Confirmar presença</button>'}
                        ${p.recusado ? '' : '<button type="button" class="secondary" data-resposta="recusar"><span class="material-icons">event_busy</span>Não posso ir</button>'}
                        ${p.recusado ? '<button type="button" class="secondary" data-resposta="pendente">Mudei de ideia</button>' : ''}
                        <button type="button" class="secondary" data-passar><span class="material-icons">swap_horiz</span>Passar a vaga</button>`}
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
        // Programação da igreja: secundária, depois das escalas
        painelProximosEventos(v.eventos || [], {
            titulo: 'Próximos eventos da igreja',
            descricao: 'Programação geral — suas escalas estão acima',
            escalados: new Set(v.proximas.filter(p => !p.recusado).map(p => p.id_evento)),
            limite: 6
        }),
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
        if (event.target.closest('[data-passar]')) {
            passarVaga(cartao.dataset.escala, `${cartao.querySelector('h3').textContent} — ${cartao.querySelector('.escala-data strong').textContent}`, recarregar);
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
