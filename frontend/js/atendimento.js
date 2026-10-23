// =========================================
// TURMAS (atendimento das crianças)
// Voluntário vinculado à turma: abre a turma no evento, registra entrada
// e saída (conferindo a etiqueta), consulta os dados e imprime as etiquetas.
// Gestão das crianças: tudo isso + sessões, alertas e vínculos.
// As regras (evento, prazo, códigos) são conferidas no servidor.
// =========================================

const FUSO = 'America/Sao_Paulo';
const horaDe = valor => valor ? new Date(valor).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: FUSO }) : '';
const dataHoraDe = valor => valor
    ? `${new Date(valor).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: FUSO })} ${horaDe(valor)}` : '';
const faixaDaTurma = t => (t.idade_minima != null ? `${t.idade_minima} a ${t.idade_maxima} anos` : 'Faixa etária não definida');
const idadeTexto = idade => idade == null ? '' : idade < 1 ? 'Bebê' : `${idade} ano${idade > 1 ? 's' : ''}`;

const TIPOS_ENCERRAMENTO = {
    manual: 'Encerrada pelo voluntário',
    administrativo: 'Encerrada pela administração',
    automatico_limite_diario: 'Automático — limite diário atingido',
    automatico_fim_evento: 'Automático — evento encerrado sem fechamento da turma'
};
const TIPOS_SAIDA = { manual: 'Saída conferida', automatica: 'Saída automática (não conferida)', administrativa: 'Saída pela administração' };
const MOTIVOS_ALERTA = { limite_diario: 'Limite diário atingido', fim_evento: 'Evento encerrado sem fechamento da turma', sessao_abandonada: 'Sessão abandonada' };

// Até quando a turma pode ficar aberta naquele evento (23h59 ou fim do evento após a meia-noite)
function textoPrazo(prazo, regra) {
    return `${dataHoraDe(prazo)}${regra === 'automatico_fim_evento' ? ' (fim do evento)' : ' (limite do dia)'}`;
}

// ---------------------------------------------------------
// Página Turmas
// ---------------------------------------------------------
async function gerenciaAtendimento(aba = 'turmas') {
    registrarRota('atendimento', [aba]);
    const ativa = paginaAtiva();
    marcarMenuAtivo('gerenciaAtendimento');
    const dados = await buscarDados('atendimento/turmas', null);
    if (!ativa()) return;
    const main = document.getElementById('main');
    if (!dados) {
        main.replaceChildren(headerInterno('Turmas', 'Recepção das crianças'), Object.assign(document.createElement('p'), { className: 'vazio', textContent: 'Não foi possível carregar as turmas.' }));
        return;
    }

    const conteudo = document.createElement('div');
    const abas = document.createElement('div');
    if (dados.gestor) {
        abas.className = 'abas-menu';
        abas.setAttribute('role', 'tablist');
        abas.innerHTML = `
            <button type="button" class="aba-botao" role="tab" data-aba="turmas">Turmas</button>
            <button type="button" class="aba-botao" role="tab" data-aba="sessoes">Sessões</button>
            <button type="button" class="aba-botao" role="tab" data-aba="alertas">Alertas${dados.alertas_pendentes ? ` <span class="contador-aba alerta">(${dados.alertas_pendentes})</span>` : ''}</button>`;
    }
    main.replaceChildren(headerInterno('Turmas', dados.gestor ? 'Atendimento das crianças, sessões e alertas' : 'Receba as crianças da sua turma'), abas, conteudo);

    async function mostrar(qual) {
        aba = qual;
        if (history.state?.rota === 'atendimento') history.replaceState({ ...history.state, args: [qual] }, '', location.hash);
        abas.querySelectorAll('[data-aba]').forEach(b => {
            b.classList.toggle('ativa', b.dataset.aba === qual);
            b.setAttribute('aria-selected', String(b.dataset.aba === qual));
        });
        if (qual === 'sessoes' && dados.gestor) return desenharSessoes(conteudo, ativa);
        if (qual === 'alertas' && dados.gestor) return desenharAlertas(conteudo, ativa);
        return desenharTurmas(conteudo, dados);
    }
    abas.addEventListener('click', event => {
        const botao = event.target.closest('[data-aba]');
        if (botao) mostrar(botao.dataset.aba);
    });
    await mostrar(dados.gestor ? aba : 'turmas');
}

function desenharTurmas(conteudo, dados) {
    const todosEventos = dados.eventos_elegiveis || [];
    const eventosLivres = t => todosEventos.filter(e => !(t.eventos_atendidos || []).includes(e.id_evento));
    const proximo = dados.proximo_evento;
    const semEvento = `<p class="motivo-bloqueio"><span class="material-icons">event_busy</span>${escapar(dados.mensagem_sem_evento)}${proximo
        ? ` <strong>Próximo evento:</strong> ${escapar(proximo.nome)} em ${dataHoraDe(proximo.inicio_em)} (abertura a partir de ${horaDe(proximo.libera_em)}).` : ''}</p>`;

    conteudo.innerHTML = `
        <section class="turmas-atendimento">
            ${dados.turmas.map(t => {
                const aberta = Boolean(t.id_sessao);
                const eventos = eventosLivres(t);
                const responsaveis = [t.responsavel, ...(t.voluntarios || []).map(v => v.nome)].filter(Boolean);
                return `
                <article class="panel turma-card ${aberta ? 'aberta' : ''}" data-turma="${t.id_turma}">
                    <div class="turma-card-topo">
                        <div>
                            <h2>${escapar(t.nome)}</h2>
                            <p class="subtitulo">${faixaDaTurma(t)}</p>
                        </div>
                        <span class="badge ${aberta ? 'ok' : 'inactive'}">${aberta ? 'Aberta' : 'Fechada'}</span>
                    </div>
                    <p class="turma-linha"><span class="material-icons">badge</span>${responsaveis.length ? escapar(responsaveis.join(', ')) : 'Sem responsável definido'}</p>
                    ${aberta ? `
                        <div class="turma-numeros"><strong>${t.presentes}</strong><span>criança(s) presente(s)</span></div>
                        <p class="turma-linha"><span class="material-icons">event</span>${escapar(t.evento)} · aberta às ${horaDe(t.aberta_em)} por ${escapar(t.aberta_por || '—')}</p>
                        <p class="turma-linha"><span class="material-icons">schedule</span>Encerramento previsto: ${dataHoraDe(t.prazo_encerramento)}</p>
                        <div class="turma-acoes"><button type="button" class="primary" data-entrar="${t.id_sessao}"><span class="material-icons">login</span>Entrar na turma</button></div>`
                    : eventos.length ? `
                        ${eventos.length > 1 ? `<label class="turma-linha" for="ev${t.id_turma}">Evento</label>
                            <select class="seletor" id="ev${t.id_turma}" data-evento-turma="${t.id_turma}">${eventos.map(e => `<option value="${e.id_evento}">${escapar(e.nome)} (${horaDe(e.inicio_em)}–${horaDe(e.fim_em)})</option>`).join('')}</select>` : ''}
                        ${eventos.map((e, i) => `<div class="turma-evento" data-info-evento="${e.id_evento}" ${i ? 'hidden' : ''}>
                            <p class="turma-linha"><span class="material-icons">event</span>${escapar(e.nome)} · ${horaDe(e.inicio_em)} às ${horaDe(e.fim_em)}</p>
                            <p class="turma-linha"><span class="material-icons">schedule</span>Pode funcionar até ${textoPrazo(e.prazo_encerramento, e.regra_encerramento)}</p>
                        </div>`).join('')}
                        <div class="turma-acoes"><button type="button" class="primary" data-abrir="${t.id_turma}"><span class="material-icons">lock_open</span>Abrir turma</button></div>`
                    : `${todosEventos.length
                        ? '<p class="motivo-bloqueio"><span class="material-icons">event_busy</span>Esta turma já teve atendimento no evento de agora. Um novo atendimento só no próximo evento.</p>'
                        : semEvento}<div class="turma-acoes"><button type="button" class="primary" disabled title="Sem evento elegível agora"><span class="material-icons">lock</span>Abrir turma</button></div>`}
                    <div class="turma-acoes secundarias">
                        <button type="button" class="secondary" data-detalhes="${t.id_turma}"><span class="material-icons">info</span>Detalhes</button>
                        ${dados.gestor ? `<button type="button" class="secondary" data-vinculos="${t.id_turma}"><span class="material-icons">group_add</span>Responsáveis</button>` : ''}
                    </div>
                </article>`;
            }).join('') || `<article class="panel"><p class="vazio">${dados.gestor ? 'Nenhuma turma ativa. Cadastre em Crianças → Gerenciar turmas.' : 'Você ainda não está vinculado a nenhuma turma. Fale com a liderança.'}</p></article>`}
        </section>
        <p class="mensagem-lista" role="status"></p>`;

    const aviso = conteudo.querySelector('.mensagem-lista');
    conteudo.onchange = event => {
        const seletor = event.target.closest('[data-evento-turma]');
        if (!seletor) return;
        seletor.closest('.turma-card').querySelectorAll('[data-info-evento]').forEach(div => { div.hidden = div.dataset.infoEvento !== seletor.value; });
    };
    conteudo.onclick = async event => {
        const abrirBtn = event.target.closest('[data-abrir]');
        const entrarBtn = event.target.closest('[data-entrar]');
        const detalhes = event.target.closest('[data-detalhes]');
        const vinculos = event.target.closest('[data-vinculos]');
        if (entrarBtn) return sessaoTurma(Number(entrarBtn.dataset.entrar));
        if (detalhes) return detalhesDaTurma(dados.turmas.find(t => t.id_turma === Number(detalhes.dataset.detalhes)), dados.gestor);
        if (vinculos) return modalVinculos(dados.turmas.find(t => t.id_turma === Number(vinculos.dataset.vinculos)));
        if (!abrirBtn) return;
        const idTurma = Number(abrirBtn.dataset.abrir);
        const card = abrirBtn.closest('.turma-card');
        const livres = eventosLivres(dados.turmas.find(t => t.id_turma === idTurma));
        const idEvento = Number(card.querySelector('[data-evento-turma]')?.value || livres[0]?.id_evento);
        const evento = livres.find(e => e.id_evento === idEvento);
        if (!confirm(`Abrir a turma ${card.querySelector('h2').textContent} para "${evento?.nome}"?`)) return;
        abrirBtn.disabled = true;
        try {
            const sessao = await enviarDados(`atendimento/turmas/${idTurma}/sessoes`, 'POST', { id_evento: idEvento });
            sessaoTurma(sessao.id_sessao);
        } catch (erro) {
            abrirBtn.disabled = false;
            aviso.textContent = erro.message;
            aviso.classList.add('erro');
        }
    };
}

// Detalhes da turma: vínculos e, para a gestão, as últimas sessões
async function detalhesDaTurma(turma, gestor) {
    const { modal } = abrirModal(turma.nome, faixaDaTurma(turma), '<p class="vazio">Carregando...</p>');
    const sessoes = gestor ? await buscarDados(`atendimento/admin/sessoes?turma=${turma.id_turma}`, []) : [];
    modal.querySelector('.modal-corpo').innerHTML = `
        <div class="ficha-lista">
            <p><strong>Responsável principal:</strong> ${escapar(turma.responsavel || 'Não definido')}</p>
            <p><strong>Voluntários da turma:</strong> ${escapar((turma.voluntarios || []).map(v => v.nome).join(', ') || 'Nenhum vinculado')}</p>
            <p><strong>Dia e horário habituais:</strong> ${escapar(turma.dia_semana || '')} ${formatarHora(turma.horario)}</p>
            <p><strong>Situação:</strong> ${turma.id_sessao ? `Aberta (${escapar(turma.evento)}), ${turma.presentes} presente(s)` : 'Fechada'}</p>
        </div>
        ${gestor ? `<h3 class="titulo-secao">Últimas sessões</h3>
            <ul class="lista-simples">${sessoes.slice(0, 8).map(s => `<li><button type="button" class="link-botao" data-sessao="${s.id_sessao}">${formatarDataSimples(s.data_evento)} · ${escapar(s.evento)}</button>
                <small>${s.status === 'aberta' ? 'aberta' : escapar(TIPOS_ENCERRAMENTO[s.tipo_encerramento] || 'encerrada')} · ${s.criancas} criança(s)</small></li>`).join('') || '<li class="vazio">Nenhuma sessão ainda.</li>'}</ul>` : ''}`;
    modal.addEventListener('click', event => {
        const link = event.target.closest('[data-sessao]');
        if (!link) return;
        modal.closest('.modal-overlay').remove();
        sessaoTurma(Number(link.dataset.sessao));
    });
}

// ---------------------------------------------------------
// Sessão (a turma aberta num evento)
// ---------------------------------------------------------
async function sessaoTurma(idSessao) {
    registrarRota('atendimento/sessao', [idSessao]);
    const ativa = paginaAtiva();
    marcarMenuAtivo('gerenciaAtendimento');
    const main = document.getElementById('main');
    let dados;
    try {
        dados = await enviarDados(`atendimento/sessoes/${idSessao}`, 'GET');
    } catch (erro) {
        if (ativa()) main.replaceChildren(headerComVoltar('Turma', erro.message, gerenciaAtendimento));
        return;
    }
    if (!ativa()) return;

    const s = dados.sessao;
    const aberta = s.status === 'aberta';
    const section = document.createElement('section');
    section.className = 'sessao-turma';
    section.innerHTML = `
        <article class="panel sessao-cabecalho ${aberta ? 'aberta' : 'encerrada'}">
            <div class="sessao-info">
                <div><small>Evento</small><strong>${escapar(s.evento)}</strong><span>${formatarDataSimples(s.data_evento)} · ${horaDe(s.inicio_em)}–${horaDe(s.fim_em)}</span></div>
                <div><small>Aberta</small><strong>${dataHoraDe(s.aberta_em)}</strong><span>por ${escapar(s.aberta_por || '—')}</span></div>
                <div><small>${aberta ? 'Encerramento previsto' : 'Encerrada'}</small>
                    <strong>${aberta ? textoPrazo(s.prazo_encerramento, s.regra_encerramento) : dataHoraDe(s.encerrada_em)}</strong>
                    <span>${aberta ? 'Encerre depois de entregar todas as crianças' : escapar(TIPOS_ENCERRAMENTO[s.tipo_encerramento] || '')}${!aberta && s.encerrada_por ? ` (${escapar(s.encerrada_por)})` : ''}</span></div>
                <div class="sessao-presentes"><small>Presentes</small><strong>${s.presentes}</strong><span>${s.criancas_recebidas} criança(s) recebida(s)</span></div>
            </div>
            ${aberta ? `<div class="sessao-acoes">
                <button type="button" class="primary" data-acao="entrada"><span class="material-icons">person_add</span>Registrar entrada</button>
                <button type="button" class="secondary" data-acao="conferir"><span class="material-icons">qr_code_scanner</span>Conferir etiqueta</button>
                <button type="button" class="secondary" data-acao="encerrar"><span class="material-icons">lock</span>Encerrar turma</button>
                ${dados.gestor ? '<button type="button" class="secondary perigo" data-acao="encerrar-admin"><span class="material-icons">gpp_maybe</span>Encerrar (administração)</button>' : ''}
            </div>` : '<p class="motivo-bloqueio"><span class="material-icons">lock</span>Turma encerrada: não recebe entradas nem saídas. O histórico continua disponível.</p>'}
            ${dados.gestor ? '<div class="sessao-acoes"><button type="button" class="link-botao" data-acao="historico">Ver histórico completo da sessão</button></div>' : ''}
            <p class="mensagem-lista" role="status"></p>
        </article>
        <article class="panel">
            <div class="panel-header"><div><h2>Crianças</h2><p class="contador">${s.presentes} presente(s) · ${dados.atendimentos.length} registro(s)</p></div></div>
            <div class="lista-atendimentos">
                ${dados.atendimentos.map(a => `
                    <div class="atendimento-item ${a.saida_em ? 'saiu' : 'presente'}">
                        <div class="atendimento-nome">
                            <strong>${escapar(a.nome)}</strong>
                            <small>${idadeTexto(a.idade)}${a.tem_alergia ? ' · <span class="alerta-texto">⚠ alergia</span>' : ''}</small>
                        </div>
                        <div class="atendimento-horarios">
                            <span>Entrada ${horaDe(a.entrada_em)} <small>por ${escapar(a.entrada_por || '—')}</small></span>
                            ${a.saida_em ? `<span>Saída ${horaDe(a.saida_em)} <small>${escapar(TIPOS_SAIDA[a.tipo_saida] || '')}${a.saida_por ? ` · ${escapar(a.saida_por)}` : ''}${a.retirada_por ? ` · com ${escapar(a.retirada_por)}` : ''}</small></span>` : ''}
                        </div>
                        <span class="badge ${a.saida_em ? (a.tipo_saida === 'manual' ? 'acesso' : 'pending') : 'ok'}">${a.saida_em ? 'Saída registrada' : 'Presente'}</span>
                        <div class="atendimento-acoes">
                            ${aberta || dados.gestor ? `<button type="button" class="action-btn com-texto" data-dados="${a.id_crianca}"><span class="material-icons">contact_page</span>Dados</button>` : ''}
                            ${aberta && !a.saida_em ? `<button type="button" class="action-btn com-texto" data-etiqueta="${a.id_atendimento}"><span class="material-icons">label</span>Etiquetas</button>
                                <button type="button" class="action-btn com-texto destaque" data-saida="${a.id_atendimento}"><span class="material-icons">logout</span>Registrar saída</button>` : ''}
                        </div>
                    </div>`).join('') || '<p class="vazio">Nenhuma criança recebida ainda. Use "Registrar entrada".</p>'}
            </div>
        </article>`;

    main.replaceChildren(headerComVoltar(s.turma, aberta ? 'Turma aberta — recepção das crianças' : 'Sessão encerrada', gerenciaAtendimento), section);
    const recarregar = () => sessaoTurma(idSessao);
    const aviso = section.querySelector('.mensagem-lista');
    const avisar = (texto, erro = true) => { aviso.textContent = texto; aviso.classList.toggle('erro', erro); };

    section.addEventListener('click', async event => {
        const botao = event.target.closest('button');
        if (!botao) return;
        const acao = botao.dataset.acao;
        if (acao === 'entrada') return modalEntrada(s, recarregar);
        if (acao === 'conferir') return modalConferir(s);
        if (acao === 'historico') return modalHistorico(s);
        if (acao === 'encerrar') {
            if (!confirm(`Encerrar a turma ${s.turma}? Depois de encerrada, ela não recebe mais entradas nem saídas.`)) return;
            try {
                await enviarDados(`atendimento/sessoes/${s.id_sessao}/encerrar`, 'POST', {});
                recarregar();
            } catch (erro) { avisar(erro.message); }
            return;
        }
        if (acao === 'encerrar-admin') return modalEncerrarAdmin(s, recarregar);
        if (botao.dataset.dados) return modalDadosCrianca(s.id_sessao, Number(botao.dataset.dados));
        if (botao.dataset.etiqueta) return modalEtiquetas(Number(botao.dataset.etiqueta), recarregar);
        if (botao.dataset.saida) return modalSaida(s, dados.atendimentos.find(a => a.id_atendimento === Number(botao.dataset.saida)), recarregar);
    });
}

// Entrada: buscar → conferir a criança → registrar → etiquetas
function modalEntrada(sessao, aoConcluir) {
    const { modal, fechar } = abrirModal('Registrar entrada', `${sessao.turma} · ${sessao.evento}`, `
        <div class="form-group"><label for="buscaCrianca">Nome da criança</label>
        <input type="search" id="buscaCrianca" placeholder="Digite parte do nome..." autocomplete="off"></div>
        <p class="subtitulo">Sem busca, aparecem as crianças desta turma.</p>
        <div class="lista-escolha" id="resultadoCriancas"><p class="vazio">Carregando...</p></div>
        <div id="confirmacaoEntrada" hidden></div>
        <p class="mensagem-lista" role="status"></p>`);
    const corpo = modal.querySelector('.modal-corpo');
    const busca = corpo.querySelector('#buscaCrianca');
    const lista = corpo.querySelector('#resultadoCriancas');
    const confirmacao = corpo.querySelector('#confirmacaoEntrada');
    const aviso = corpo.querySelector('.mensagem-lista');
    let espera;

    async function pesquisar() {
        const criancas = await buscarDados(`atendimento/sessoes/${sessao.id_sessao}/criancas?busca=${encodeURIComponent(busca.value.trim())}`, []);
        lista.innerHTML = criancas.map(c => `
            <button type="button" class="opcao-escolha" data-crianca="${c.id_crianca}" ${c.presente ? 'disabled' : ''}>
                <strong>${escapar(c.nome)}</strong>
                <small>${idadeTexto(c.idade)}${c.turma ? ` · ${escapar(c.turma)}` : ''}${c.presente ? ' · já presente' : c.da_turma ? '' : ' · outra turma'}</small>
            </button>`).join('') || '<p class="vazio">Nenhuma criança encontrada. Confira o nome ou cadastre em Crianças.</p>';
    }
    busca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(pesquisar, 250); });
    pesquisar();
    busca.focus();

    lista.addEventListener('click', async event => {
        const opcao = event.target.closest('[data-crianca]');
        if (!opcao) return;
        aviso.textContent = '';
        let crianca;
        try {
            crianca = await enviarDados(`atendimento/sessoes/${sessao.id_sessao}/criancas/${opcao.dataset.crianca}`, 'GET');
        } catch (erro) { aviso.textContent = erro.message; aviso.classList.add('erro'); return; }
        lista.hidden = true;
        busca.disabled = true;
        confirmacao.hidden = false;
        confirmacao.innerHTML = `
            <div class="confirmar-crianca">
                <small>Confira antes de registrar</small>
                <strong class="nome-grande">${escapar(crianca.nome)}</strong>
                <p>${idadeTexto(crianca.idade)} · nascimento ${formatarDataSimples(crianca.data_nascimento)}${crianca.turma ? ` · ${escapar(crianca.turma)}` : ''}</p>
                ${crianca.alergias ? `<p class="alerta-texto">⚠ Alergias: ${escapar(crianca.alergias)}</p>` : ''}
                <p>Responsáveis: ${escapar(crianca.responsaveis.map(r => `${r.nome}${r.parentesco ? ` (${r.parentesco})` : ''}`).join(', ') || 'não cadastrados')}</p>
            </div>
            <div class="form-actions">
                <button type="button" class="btn-cancel" data-voltar>Escolher outra</button>
                <button type="button" class="primary" data-confirmar><span class="material-icons">how_to_reg</span>Registrar entrada de ${escapar(crianca.nome.split(' ')[0])}</button>
            </div>`;
        confirmacao.querySelector('[data-voltar]').addEventListener('click', () => {
            confirmacao.hidden = true; lista.hidden = false; busca.disabled = false; busca.focus();
        });
        confirmacao.querySelector('[data-confirmar]').addEventListener('click', async event2 => {
            const botaoConfirmar = event2.currentTarget;
            botaoConfirmar.disabled = true;
            try {
                const registro = await enviarDados(`atendimento/sessoes/${sessao.id_sessao}/entradas`, 'POST', { id_crianca: crianca.id_crianca });
                confirmacao.innerHTML = `
                    <div class="confirmar-crianca sucesso">
                        <span class="material-icons">check_circle</span>
                        <strong class="nome-grande">${escapar(registro.nome)}</strong>
                        <p>Entrada registrada às ${horaDe(registro.entrada_em)}. Imprima as etiquetas: uma fica com a criança, a outra com o responsável.</p>
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn-cancel" data-outra>Registrar outra criança</button>
                        <button type="button" class="primary" data-imprimir><span class="material-icons">print</span>Imprimir etiquetas</button>
                    </div>`;
                confirmacao.querySelector('[data-imprimir]').addEventListener('click', () => { fechar(); aoConcluir(); modalEtiquetas(registro.id_atendimento, aoConcluir); });
                confirmacao.querySelector('[data-outra]').addEventListener('click', () => { fechar(); aoConcluir(); modalEntrada(sessao, aoConcluir); });
            } catch (erro) {
                aviso.textContent = erro.message;
                aviso.classList.add('erro');
                botaoConfirmar.disabled = false;
            }
        });
    });
    modal.closest('.modal-overlay').addEventListener('click', event => {
        if (event.target.classList.contains('modal-close') || event.target.classList.contains('modal-overlay')) aoConcluir();
    });
}

// Dados completos da criança e dos responsáveis (contato com um toque)
async function modalDadosCrianca(idSessao, idCrianca) {
    const { modal } = abrirModal('Dados da criança', '', '<p class="vazio">Carregando...</p>');
    const corpo = modal.querySelector('.modal-corpo');
    try {
        const c = await enviarDados(`atendimento/sessoes/${idSessao}/criancas/${idCrianca}`, 'GET');
        corpo.innerHTML = `
            <div class="ficha-lista">
                <p class="nome-grande">${escapar(c.nome)}</p>
                <p><strong>Nascimento:</strong> ${formatarDataSimples(c.data_nascimento)} (${idadeTexto(c.idade)})</p>
                <p><strong>Turma do cadastro:</strong> ${escapar(c.turma || '—')}</p>
                ${c.alergias ? `<p class="alerta-texto"><strong>⚠ Alergias:</strong> ${escapar(c.alergias)}</p>` : ''}
                ${c.observacoes ? `<p><strong>Observações:</strong> ${escapar(c.observacoes)}</p>` : ''}
                <p><strong>Uso de imagem:</strong> ${c.autorizacao_imagem ? 'autorizado' : 'NÃO autorizado'}</p>
            </div>
            <h3 class="titulo-secao">Pais e responsáveis</h3>
            <div class="lista-responsaveis">
                ${c.responsaveis.map(r => `
                    <div class="responsavel-item">
                        <strong>${escapar(r.nome)}</strong>
                        <small>${escapar(r.parentesco || 'Responsável')}${r.principal ? ' · principal' : ''}</small>
                        <span class="badge ${r.autorizado_retirada ? 'ok' : 'inactive'}">${r.autorizado_retirada ? 'Autorizado a buscar' : 'Sem autorização de retirada'}</span>
                        <div class="contatos">
                            ${r.telefone ? `<a href="tel:${escapar(r.telefone.replace(/[^\d+]/g, ''))}"><span class="material-icons">call</span>${escapar(r.telefone)}</a>` : ''}
                            ${r.email ? `<a href="mailto:${escapar(r.email)}"><span class="material-icons">mail</span>${escapar(r.email)}</a>` : ''}
                        </div>
                    </div>`).join('') || '<p class="vazio">Nenhum responsável cadastrado.</p>'}
            </div>`;
    } catch (erro) {
        corpo.innerHTML = `<p class="vazio">${escapar(erro.message)}</p>`;
    }
}

// Saída: confere quem busca e o código da etiqueta do responsável (validado no servidor)
async function modalSaida(sessao, atendimento, aoConcluir) {
    const { modal, fechar } = abrirModal('Registrar saída', `${sessao.turma} · ${sessao.evento}`, '<p class="vazio">Carregando...</p>');
    const corpo = modal.querySelector('.modal-corpo');
    let crianca;
    try {
        crianca = await enviarDados(`atendimento/sessoes/${sessao.id_sessao}/criancas/${atendimento.id_crianca}`, 'GET');
    } catch (erro) { corpo.innerHTML = `<p class="vazio">${escapar(erro.message)}</p>`; return; }
    const autorizados = crianca.responsaveis.filter(r => r.autorizado_retirada);
    corpo.innerHTML = `
        <form novalidate>
            <div class="confirmar-crianca">
                <small>Criança</small>
                <strong class="nome-grande">${escapar(crianca.nome)}</strong>
                <p>Entrada às ${horaDe(atendimento.entrada_em)} · saída será registrada em <strong data-agora>${dataHoraDe(new Date())}</strong></p>
            </div>
            <fieldset class="quem-busca">
                <legend>Quem está buscando?</legend>
                ${autorizados.length ? autorizados.map(r => `
                    <label class="opcao-radio"><input type="radio" name="responsavel" value="${r.id_responsavel}">
                        <span><strong>${escapar(r.nome)}</strong> <small>${escapar(r.parentesco || '')}${r.telefone ? ` · ${escapar(r.telefone)}` : ''}</small></span></label>`).join('')
                : '<p class="motivo-bloqueio"><span class="material-icons">warning</span>Nenhuma pessoa autorizada a buscar esta criança está cadastrada. Entregue somente com a etiqueta do responsável e avise a liderança para cadastrar as autorizações.</p>'}
            </fieldset>
            <div class="form-group"><label for="codigoSaida">Código de retirada (etiqueta do responsável)</label>
            <input type="text" id="codigoSaida" class="codigo-input" placeholder="Código de RETIRADA (ou leia o QR do responsável)" autocomplete="off" autocapitalize="characters" required></div>
            <p class="subtitulo">O código da etiqueta da criança não é aceito. Confira que a etiqueta do responsável é desta criança; o código vale uma única vez.</p>
            <div class="form-actions">
                <button type="button" class="btn-cancel" data-cancelar>Cancelar</button>
                <button type="submit" class="primary"><span class="material-icons">logout</span>Confirmar saída</button>
            </div>
        </form>`;
    const form = corpo.querySelector('form');
    const relogio = setInterval(() => { const campo = corpo.querySelector('[data-agora]'); if (campo) campo.textContent = dataHoraDe(new Date()); else clearInterval(relogio); }, 15000);
    corpo.querySelector('#codigoSaida').focus();
    corpo.querySelector('[data-cancelar]').addEventListener('click', fechar);
    form.addEventListener('submit', async event => {
        event.preventDefault();
        const escolhido = form.querySelector('input[name="responsavel"]:checked');
        if (autorizados.length && !escolhido) return mensagemFormulario(form, 'Escolha quem está buscando a criança.');
        const codigo = form.querySelector('#codigoSaida').value.trim();
        if (!codigo) return mensagemFormulario(form, 'Digite ou leia o código da etiqueta do responsável.');
        const botao = form.querySelector('[type="submit"]');
        botao.disabled = true;
        try {
            await enviarDados(`atendimento/atendimentos/${atendimento.id_atendimento}/saida`, 'POST', { codigo, id_responsavel: escolhido ? Number(escolhido.value) : null });
            clearInterval(relogio);
            fechar();
            aoConcluir();
        } catch (erro) {
            botao.disabled = false;
            mensagemFormulario(form, erro.message);
            form.querySelector('#codigoSaida').select();
        }
    });
}

// Conferir uma etiqueta sem registrar a saída
function modalConferir(sessao) {
    const { modal } = abrirModal('Conferir etiqueta', 'Leia o QR ou digite o código', `
        <form novalidate>
            <input type="text" class="codigo-input" id="codigoConferir" placeholder="Código ou QR" autocomplete="off" autocapitalize="characters">
            <div class="form-actions"><button type="submit" class="primary">Conferir</button></div>
            <div id="resultadoConferencia"></div>
        </form>`);
    const form = modal.querySelector('form');
    form.querySelector('input').focus();
    form.addEventListener('submit', async event => {
        event.preventDefault();
        const resultado = form.querySelector('#resultadoConferencia');
        try {
            const r = await enviarDados(`atendimento/sessoes/${sessao.id_sessao}/conferir`, 'POST', { codigo: form.querySelector('input').value });
            resultado.innerHTML = r.valido
                ? `<div class="confirmar-crianca sucesso"><span class="material-icons">verified</span>
                     <small>${r.tipo === 'retirada' ? 'Etiqueta do RESPONSÁVEL (vale para a retirada)' : 'Etiqueta da CRIANÇA (não serve para retirada)'}</small>
                     <strong class="nome-grande">${escapar(r.crianca)}</strong>
                     <p>${r.presente ? 'Presente nesta turma.' : 'Já saiu.'} Código da criança: ${formatarCodigo(r.codigo_crianca)}.${r.tipo === 'retirada' && r.responsavel ? ` Responsável: ${escapar(r.responsavel)}.` : ''}</p></div>`
                : `<div class="confirmar-crianca falha"><span class="material-icons">gpp_bad</span><p>${escapar(r.mensagem)}</p></div>`;
        } catch (erro) {
            resultado.innerHTML = `<div class="confirmar-crianca falha"><p>${escapar(erro.message)}</p></div>`;
        }
        form.querySelector('input').select();
    });
}

// ---------------------------------------------------------
// Etiquetas: dois códigos vinculados. O da criança (exposto) só identifica;
// o de retirada vai SÓ na etiqueta do responsável e é o único aceito na saída.
// A etiqueta do responsável repete o código da criança para a conferência visual.
// ---------------------------------------------------------
const formatarCodigo = codigo => `${codigo.slice(0, 3)}-${codigo.slice(3)}`;

function htmlEtiqueta(e, tipo) {
    const data = formatarDataSimples(e.data_evento);
    return tipo === 'crianca'
        ? `<div class="etiqueta etiqueta-crianca">
               <div class="etiqueta-texto">
                   <span class="etiqueta-tipo">CRIANÇA</span>
                   <strong class="etiqueta-nome">${escapar(e.crianca)}</strong>
                   <span class="etiqueta-turma">${escapar(e.turma)}</span>
                   <span class="etiqueta-codigo">${formatarCodigo(e.codigo_crianca)}</span>
                   <small>${escapar(e.evento)} · ${data} · sessão ${e.id_sessao}</small>
               </div>
               <div class="etiqueta-qr">${e.qr_crianca}</div>
           </div>`
        : `<div class="etiqueta etiqueta-responsavel">
               <div class="etiqueta-texto">
                   <span class="etiqueta-tipo">RESPONSÁVEL — apresente na retirada</span>
                   <strong class="etiqueta-nome">${escapar(e.responsavel || 'Responsável')}</strong>
                   <span class="etiqueta-turma">Criança: ${escapar(e.crianca)} · ${escapar(e.turma)}</span>
                   <span class="etiqueta-retirada">RETIRADA <span class="etiqueta-codigo">${formatarCodigo(e.codigo_retirada)}</span></span>
                   <small>Etiqueta da criança: ${formatarCodigo(e.codigo_crianca)} · ${escapar(e.evento)} · ${data}</small>
               </div>
               <div class="etiqueta-qr">${e.qr_responsavel}</div>
           </div>`;
}

async function modalEtiquetas(idAtendimento, aoAlterar) {
    const { modal, fechar } = abrirModal('Etiquetas', 'Confira antes de imprimir', '<p class="vazio">Carregando...</p>');
    modal.classList.add('modal-etiquetas');
    const corpo = modal.querySelector('.modal-corpo');
    let etiqueta;
    try {
        etiqueta = await enviarDados(`atendimento/atendimentos/${idAtendimento}/etiqueta`, 'GET');
    } catch (erro) { corpo.innerHTML = `<p class="vazio">${escapar(erro.message)}</p>`; return; }
    corpo.innerHTML = `
        <div class="previa-etiquetas">${htmlEtiqueta(etiqueta, 'crianca')}${htmlEtiqueta(etiqueta, 'responsavel')}</div>
        <p class="subtitulo">A etiqueta da criança não serve para retirada. Na saída vale só o <strong>código de RETIRADA</strong> da etiqueta do responsável, e ela também traz o código da criança para você conferir que são do mesmo atendimento. Nenhum telefone ou e-mail vai impresso.</p>
        <div class="form-actions etiquetas-acoes">
            <button type="button" class="primary" data-imprimir="ambas"><span class="material-icons">print</span>Imprimir as duas</button>
            <button type="button" class="secondary" data-imprimir="crianca">Só da criança</button>
            <button type="button" class="secondary" data-imprimir="responsavel">Só do responsável</button>
            <button type="button" class="secondary perigo" data-segunda-via><span class="material-icons">autorenew</span>2ª via (etiqueta perdida)</button>
        </div>
        <p class="mensagem-lista" role="status"></p>`;
    const aviso = corpo.querySelector('.mensagem-lista');
    corpo.addEventListener('click', async event => {
        const imprimir = event.target.closest('[data-imprimir]');
        if (imprimir) {
            const tipo = imprimir.dataset.imprimir;
            try {
                await enviarDados(`atendimento/atendimentos/${idAtendimento}/etiqueta/impressao`, 'POST', { tipo });
            } catch (erro) { aviso.textContent = erro.message; aviso.classList.add('erro'); return; }
            imprimirEtiquetas(etiqueta, tipo);
            return;
        }
        if (event.target.closest('[data-segunda-via]')) {
            const motivo = prompt('Motivo da 2ª via (ex.: etiqueta perdida ou danificada). A etiqueta anterior deixará de valer.');
            if (!motivo || motivo.trim().length < 3) return;
            try {
                await enviarDados(`atendimento/atendimentos/${idAtendimento}/etiqueta/segunda-via`, 'POST', { motivo });
                fechar();
                if (aoAlterar) aoAlterar();
                modalEtiquetas(idAtendimento, aoAlterar);
            } catch (erro) { aviso.textContent = erro.message; aviso.classList.add('erro'); }
        }
    });
}

// Imprime só as etiquetas (o resto da página fica oculto pelo CSS de impressão)
function imprimirEtiquetas(etiqueta, tipo) {
    document.getElementById('area-impressao')?.remove();
    const area = document.createElement('div');
    area.id = 'area-impressao';
    area.innerHTML = (tipo !== 'responsavel' ? htmlEtiqueta(etiqueta, 'crianca') : '') + (tipo !== 'crianca' ? htmlEtiqueta(etiqueta, 'responsavel') : '');
    document.body.appendChild(area);
    document.body.classList.add('imprimindo-etiquetas');
    const limpar = () => { document.body.classList.remove('imprimindo-etiquetas'); area.remove(); window.removeEventListener('afterprint', limpar); };
    // Só some depois da impressão (no celular o print() não espera o diálogo; a área
    // só aparece no papel, e a próxima impressão substitui a anterior)
    window.addEventListener('afterprint', limpar);
    window.print();
}

// ---------------------------------------------------------
// Administração
// ---------------------------------------------------------
function modalEncerrarAdmin(sessao, aoConcluir) {
    const { modal, fechar } = abrirModal('Encerrar pela administração', `${sessao.turma} · ${sessao.evento}`, `
        <form novalidate>
            <p>As crianças ainda presentes terão a saída registrada como <strong>administrativa</strong> e as etiquetas deixam de valer.</p>
            <div class="form-group"><label for="motivoAdmin">Motivo</label>
            <textarea id="motivoAdmin" rows="3" required placeholder="Ex.: voluntário saiu sem encerrar; crianças já entregues aos pais"></textarea></div>
            <div class="form-actions">
                <button type="button" class="btn-cancel" data-cancelar>Cancelar</button>
                <button type="submit" class="primary">Encerrar sessão</button>
            </div>
        </form>`);
    const form = modal.querySelector('form');
    modal.querySelector('[data-cancelar]').addEventListener('click', fechar);
    form.addEventListener('submit', async event => {
        event.preventDefault();
        try {
            await enviarDados(`atendimento/admin/sessoes/${sessao.id_sessao}/encerrar`, 'POST', { motivo: form.querySelector('textarea').value });
            fechar();
            aoConcluir();
        } catch (erro) { mensagemFormulario(form, erro.message); }
    });
}

const NOMES_ACOES = {
    sessao_aberta: 'Turma aberta', sessao_encerrada: 'Turma encerrada', entrada: 'Entrada', saida: 'Saída conferida',
    saida_automatica: 'Saída automática', saida_administrativa: 'Saída administrativa', codigo_emitido: 'Etiqueta emitida',
    codigo_segunda_via: '2ª via emitida', codigo_invalidado: 'Etiqueta invalidada', etiqueta_impressa: 'Etiqueta impressa',
    codigo_conferido: 'Etiqueta conferida', conferencia_recusada: 'Conferência recusada', retirada_recusada: 'Retirada recusada',
    tentativa_reuso_codigo: 'Tentativa de reuso do código', dados_consultados: 'Dados consultados', alerta_tratado: 'Alerta tratado'
};

async function modalHistorico(sessao) {
    const { modal } = abrirModal('Histórico da sessão', `${sessao.turma} · ${sessao.evento}`, '<p class="vazio">Carregando...</p>');
    const registros = await buscarDados(`atendimento/admin/sessoes/${sessao.id_sessao}/historico`, []);
    modal.querySelector('.modal-corpo').innerHTML = `<ul class="lista-historico">${registros.map(h => `
        <li class="${/recusad|reuso/.test(h.acao) ? 'alerta' : ''}">
            <span>${dataHoraDe(h.criado_em)}</span>
            <strong>${escapar(NOMES_ACOES[h.acao] || h.acao)}${h.crianca ? ` · ${escapar(h.crianca)}` : ''}</strong>
            <small>${h.automatico ? 'sistema' : escapar(h.usuario || '—')}${h.detalhe ? ` · ${escapar(h.detalhe)}` : ''}</small>
        </li>`).join('') || '<li class="vazio">Sem registros.</li>'}</ul>`;
}

async function desenharSessoes(conteudo, ativa) {
    conteudo.innerHTML = '<article class="panel"><p class="vazio">Carregando...</p></article>';
    const sessoes = await buscarDados('atendimento/admin/sessoes', []);
    if (!ativa()) return;
    conteudo.innerHTML = `
        <article class="panel">
            <div class="panel-header"><div><h2>Sessões das turmas</h2><p class="contador"></p></div></div>
            <div class="toolbar">
                <input class="search" type="search" placeholder="Buscar turma, evento ou voluntário..." aria-label="Buscar sessões">
                <button type="button" class="filtro ativo" data-filtro="todos">Todas</button>
                <button type="button" class="filtro" data-filtro="aberta">Abertas</button>
                <button type="button" class="filtro" data-filtro="encerrada">Encerradas</button>
            </div>
            <div class="table-responsive">
                <table class="tabela-cartoes">
                    <thead><tr><th>Turma</th><th>Evento</th><th>Aberta por</th><th>Situação</th><th>Crianças</th><th>Ação</th></tr></thead>
                    <tbody>${sessoes.map(s => `
                        <tr data-filtro="${s.status}">
                            <td><strong>${escapar(s.turma)}</strong></td>
                            <td>${escapar(s.evento)}<small style="display:block;color:var(--muted)">${formatarDataSimples(s.data_evento)} · aberta ${horaDe(s.aberta_em)}</small></td>
                            <td>${escapar(s.aberta_por || '—')}</td>
                            <td>${s.status === 'aberta' ? '<span class="badge ok">Aberta</span>' : `<span class="badge ${String(s.tipo_encerramento).startsWith('automatico') ? 'pending' : s.tipo_encerramento === 'manual' ? 'acesso' : 'inactive'}">${escapar(TIPOS_ENCERRAMENTO[s.tipo_encerramento] || 'Encerrada')}</span>`}</td>
                            <td>${s.criancas}${s.presentes ? ` (${s.presentes} presente${s.presentes > 1 ? 's' : ''})` : ''}</td>
                            <td><button type="button" class="action-btn com-texto" data-sessao="${s.id_sessao}"><span class="material-icons">visibility</span>Ver</button></td>
                        </tr>`).join('') || '<tr><td colspan="6" class="vazio">Nenhuma sessão registrada.</td></tr>'}</tbody>
                </table>
            </div>
        </article>`;
    configurarFiltros(conteudo.querySelector('article'), (linha, filtro) => linha.dataset.filtro === filtro);
    conteudo.onclick = event => {
        const ver = event.target.closest('[data-sessao]');
        if (ver) sessaoTurma(Number(ver.dataset.sessao));
    };
    conteudo.onchange = null;
}

async function desenharAlertas(conteudo, ativa) {
    conteudo.innerHTML = '<article class="panel"><p class="vazio">Carregando...</p></article>';
    const alertas = await buscarDados('atendimento/admin/alertas', []);
    if (!ativa()) return;
    conteudo.innerHTML = `
        <article class="panel">
            <div class="panel-header"><div><h2>Turmas encerradas automaticamente</h2>
                <p class="contador">Turma esquecida aberta: o sistema encerrou e registrou a ocorrência. Pendentes primeiro.</p></div></div>
            <div class="lista-alertas">${alertas.map(a => `
                <div class="alerta-turma ${a.status} ${a.prioritario ? 'prioritario' : ''}">
                    <span class="material-icons">${a.prioritario ? 'priority_high' : 'notification_important'}</span>
                    <div>
                        <strong>${escapar(a.turma)} · ${escapar(a.evento)} (${formatarDataSimples(a.data_evento)})</strong>
                        <small>${escapar(MOTIVOS_ALERTA[a.motivo] || a.motivo)}${a.presentes_no_encerramento ? ` · ${a.presentes_no_encerramento} criança(s) ainda presente(s)` : ''} · ${escapar(a.voluntario || '—')}</small>
                    </div>
                    <span class="badge ${a.status === 'pendente' ? (a.prioritario ? 'inactive' : 'pending') : 'ok'}">${a.status === 'pendente' ? (a.prioritario ? 'Prioritário' : 'Pendente') : 'Tratado'}</span>
                    <button type="button" class="action-btn com-texto" data-alerta="${a.id_alerta}"><span class="material-icons">open_in_new</span>Abrir</button>
                </div>`).join('') || '<p class="vazio">Nenhum alerta. Todas as turmas foram encerradas corretamente.</p>'}</div>
        </article>`;
    conteudo.onclick = event => {
        const abrir = event.target.closest('[data-alerta]');
        if (abrir) modalAlerta(Number(abrir.dataset.alerta), () => gerenciaAtendimento('alertas')); // atualiza também o contador da aba
    };
    conteudo.onchange = null;
}

async function modalAlerta(idAlerta, aoTratar) {
    const { modal, fechar } = abrirModal('Turma encerrada automaticamente', '', '<p class="vazio">Carregando...</p>');
    const corpo = modal.querySelector('.modal-corpo');
    let a;
    try { a = await enviarDados(`atendimento/admin/alertas/${idAlerta}`, 'GET'); } catch (erro) { corpo.innerHTML = `<p class="vazio">${escapar(erro.message)}</p>`; return; }
    corpo.innerHTML = `
        <div class="ficha-lista">
            ${a.prioritario ? '<p class="motivo-bloqueio"><span class="material-icons">priority_high</span>Havia crianças registradas como presentes: confirme com as famílias que todas foram entregues.</p>' : ''}
            <p><strong>Turma:</strong> ${escapar(a.turma)}</p>
            <p><strong>Evento:</strong> ${escapar(a.evento)} (${formatarDataSimples(a.data_evento)})</p>
            <p><strong>Aberta:</strong> ${dataHoraDe(a.aberta_em)} por ${escapar(a.voluntario || '—')}</p>
            <p><strong>Deveria ter sido encerrada até:</strong> ${dataHoraDe(a.deveria_encerrar_em)}</p>
            <p><strong>Encerramento automático:</strong> ${dataHoraDe(a.encerrada_em)} (processado ${dataHoraDe(a.processada_em)})</p>
            <p><strong>Motivo:</strong> ${escapar(MOTIVOS_ALERTA[a.motivo] || a.motivo)}</p>
            <p><strong>Crianças presentes no encerramento:</strong> ${a.presentes_no_encerramento} · <strong>saídas regularizadas pelo sistema:</strong> ${a.saidas_regularizadas}</p>
            <p><strong>Situação:</strong> ${a.status === 'pendente' ? 'Pendente' : `Tratado por ${escapar(a.tratado_por_nome || '—')} em ${dataHoraDe(a.tratado_em)}: ${escapar(a.observacao_tratamento || '')}`}</p>
        </div>
        ${a.afetados.length ? `<h3 class="titulo-secao">Crianças afetadas</h3><ul class="lista-simples">${a.afetados.map(c => `<li><strong>${escapar(c.nome)}</strong> <small>entrada ${horaDe(c.entrada_em)} · saída automática ${dataHoraDe(c.saida_em)}</small></li>`).join('')}</ul>` : ''}
        <div class="form-actions"><button type="button" class="secondary" data-ver-sessao>Ver a sessão</button></div>
        ${a.status === 'pendente' ? `<form novalidate>
            <div class="form-group"><label for="obsAlerta">O que foi verificado ou feito</label>
            <textarea id="obsAlerta" rows="3" placeholder="Ex.: confirmado com as famílias que as crianças foram entregues"></textarea></div>
            <div class="form-actions"><button type="submit" class="primary"><span class="material-icons">task_alt</span>Marcar como tratado</button></div>
        </form>` : ''}`;
    corpo.querySelector('[data-ver-sessao]').addEventListener('click', () => { fechar(); sessaoTurma(a.id_sessao); });
    corpo.querySelector('form')?.addEventListener('submit', async event => {
        event.preventDefault();
        try {
            await enviarDados(`atendimento/admin/alertas/${idAlerta}/tratar`, 'POST', { observacao: corpo.querySelector('#obsAlerta').value });
            fechar();
            aoTratar();
        } catch (erro) { mensagemFormulario(event.target, erro.message); }
    });
}

// Voluntários que operam a turma (o responsável principal fica no cadastro da turma)
async function modalVinculos(turma) {
    const { modal, fechar } = abrirModal(`Responsáveis — ${turma.nome}`, 'Voluntários que podem abrir e operar esta turma', '<p class="vazio">Carregando...</p>');
    const corpo = modal.querySelector('.modal-corpo');
    const voluntarios = await buscarDados(`atendimento/admin/turmas/${turma.id_turma}/voluntarios`, []);
    corpo.innerHTML = `
        <form novalidate>
            <p><strong>Responsável principal:</strong> ${escapar(turma.responsavel || 'não definido')} <small>(altere em Crianças → Gerenciar turmas)</small></p>
            <input type="search" class="search" placeholder="Buscar voluntário..." aria-label="Buscar voluntário">
            <div class="lista-checagem">${voluntarios.map(v => `
                <label class="opcao-radio" data-nome="${escapar(normalizarTexto(v.nome))}"><input type="checkbox" value="${v.id_voluntario}" ${v.vinculado ? 'checked' : ''}><span>${escapar(v.nome)}</span></label>`).join('') || '<p class="vazio">Nenhum voluntário ativo.</p>'}</div>
            <p class="subtitulo">Ser responsável pela turma não dá acesso às áreas de gestão: a pessoa vê só a página Turmas.</p>
            <div class="form-actions">
                <button type="button" class="btn-cancel" data-cancelar>Cancelar</button>
                <button type="submit" class="primary">Salvar</button>
            </div>
        </form>`;
    const form = corpo.querySelector('form');
    form.querySelector('.search').addEventListener('input', event => {
        const termo = normalizarTexto(event.target.value);
        form.querySelectorAll('[data-nome]').forEach(l => { l.hidden = termo && !l.dataset.nome.includes(termo); });
    });
    form.querySelector('[data-cancelar]').addEventListener('click', fechar);
    form.addEventListener('submit', async event => {
        event.preventDefault();
        const ids = [...form.querySelectorAll('input[type="checkbox"]:checked')].map(c => Number(c.value));
        try {
            await enviarDados(`atendimento/admin/turmas/${turma.id_turma}/voluntarios`, 'PUT', { voluntarios: ids });
            fechar();
            gerenciaAtendimento('turmas');
        } catch (erro) { mensagemFormulario(form, erro.message); }
    });
}
