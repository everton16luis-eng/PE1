// =========================================
// ESCALAS (calendário + escalas do dia)
// =========================================

const NOMES_MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const TIPOS_EVENTO = { culto: 'Culto', 'culto-jovens': 'Culto de Jovens', 'culto-infantil': 'Culto Infantil', evento: 'Evento', reuniao: 'Reunião' };

function tituloDoDia(data) {
    const [ano, mes, dia] = data.split('-').map(Number);
    return `${dia} de ${NOMES_MESES[mes - 1]} de ${ano}`;
}

async function gerenciaEscalas(dataInicial = dataDeHoje()) {
    registrarRota('escalas', [dataInicial]);
    marcarMenuAtivo('gerenciaEscalas');
    const main = document.getElementById('main');
    let [ano, mes] = dataInicial.split('-').map(Number); // mes de 1 a 12
    let diaSelecionado = dataInicial;

    const calendarioPanel = document.createElement('section');
    calendarioPanel.className = 'panel';
    calendarioPanel.style.marginBottom = '17px';
    calendarioPanel.innerHTML = `
        <div class="panel-header">
            <h2 id="mesAtual"></h2>
            <div class="acoes">
                <button type="button" id="mesAnterior" aria-label="Mês anterior">‹</button>
                <button type="button" id="mesProximo" aria-label="Próximo mês">›</button>
                <button type="button" id="mesHoje">Hoje</button>
                <button type="button" class="primary" id="btnEscolherMes">Mês</button>
            </div>
        </div>
        <div class="seletor-mes" id="seletorMes" hidden>
            <select id="selectMes" class="seletor" aria-label="Mês">${NOMES_MESES.map((nome, i) => `<option value="${i + 1}">${nome}</option>`).join('')}</select>
            <input id="selectAno" class="seletor" type="number" min="2000" max="2100" aria-label="Ano" style="width:100px">
            <button type="button" class="primary" id="aplicarMes">Aplicar</button>
        </div>
        <div class="calendar" id="calendario"></div>
        <p class="subtitulo" style="margin:12px 0 0;">
            <span class="badge ok">Tudo confirmado</span>
            <span class="badge pending">Com pendências</span>
        </p>
    `;

    const diaPanel = document.createElement('section');
    diaPanel.className = 'panel';
    diaPanel.innerHTML = `
        <div class="panel-header">
            <div><h2 id="tituloDia"></h2><p id="eventosDia"></p></div>
            <button type="button" class="primary" id="btnNovaEscala">+ Nova escala</button>
        </div>
        <div class="table-responsive">
            <table>
                <thead><tr><th>Evento</th><th>Função</th><th>Horário</th><th>Voluntários</th><th>Ação</th></tr></thead>
                <tbody id="escalasDoDia"></tbody>
            </table>
        </div>
    `;

    main.replaceChildren(headerInterno('Escalas', 'Organize as funções e voluntários por data'), calendarioPanel, diaPanel);

    const $ = id => main.querySelector('#' + id);
    let escalasCarregadas = [];

    async function desenharCalendario() {
        $('mesAtual').textContent = `${NOMES_MESES[mes - 1]} ${ano}`;
        $('selectMes').value = mes;
        $('selectAno').value = ano;

        const dias = await buscarDados(`escalas/calendario?ano=${ano}&mes=${mes}`, []);
        const porData = Object.fromEntries(dias.map(d => [String(d.data).slice(0, 10), d]));
        const calendario = $('calendario');
        calendario.innerHTML = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'].map(d => `<div class="head">${d}</div>`).join('');

        const primeiroDia = new Date(ano, mes - 1, 1).getDay();
        const totalDias = new Date(ano, mes, 0).getDate();
        for (let i = 0; i < primeiroDia; i++) calendario.insertAdjacentHTML('beforeend', '<div></div>');

        for (let dia = 1; dia <= totalDias; dia++) {
            const data = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
            const info = porData[data];
            const celula = document.createElement('div');
            celula.className = 'dia';
            celula.dataset.data = data;
            celula.tabIndex = 0;
            celula.setAttribute('role', 'button');
            celula.setAttribute('aria-label', tituloDoDia(data) + (info ? `, ${info.eventos.length} evento(s)` : ''));
            celula.classList.toggle('hoje', data === dataDeHoje());
            celula.classList.toggle('selecionado', data === diaSelecionado);
            celula.innerHTML = `<span class="day-number">${dia}</span>` + (info
                ? info.eventos.slice(0, 2).map(ev => `<span class="event-tag ${info.pendentes > 0 ? 'gold' : ''}" title="${escapar(ev.nome)}">${escapar(ev.nome)}</span>`).join('')
                  + (info.eventos.length > 2 ? `<span class="event-tag">+${info.eventos.length - 2}</span>` : '')
                : '');
            calendario.appendChild(celula);
        }
    }

    async function carregarDia(data) {
        diaSelecionado = data;
        // Guarda o dia escolhido para o Voltar/recarregar reabrir no mesmo dia
        if (history.state?.rota === 'escalas') history.replaceState({ rota: 'escalas', args: [data] }, '', location.hash);
        main.querySelectorAll('.calendar .dia').forEach(c => c.classList.toggle('selecionado', c.dataset.data === data));
        $('tituloDia').textContent = tituloDoDia(data);

        const dados = await buscarDados(`escalas/dia?data=${data}`, { eventos: [], escalas: [] });
        escalasCarregadas = dados.escalas;
        $('eventosDia').textContent = dados.eventos.length
            ? dados.eventos.map(e => `${e.nome} (${formatarHora(e.hora_inicio)}–${formatarHora(e.hora_fim)})`).join(' • ')
            : 'Nenhum evento neste dia';

        $('escalasDoDia').innerHTML = dados.escalas.map(es => {
            // Quem recusou não conta como parte da equipe
            const total = es.participantes.length - es.recusados;
            const passou = data < dataDeHoje();
            const status = es.pendentes === 0
                ? `<span class="badge ok">${es.confirmados} confirmado(s)</span>`
                : passou
                    ? `<span class="badge ok">${es.confirmados} confirmado(s)</span> <span class="badge inactive">${es.pendentes} ausente(s)</span>`
                    : `<span class="badge pending">${es.pendentes} pendente(s)</span>`;
            const recusas = es.recusados ? ` <span class="badge inactive">${es.recusados} recusou</span>` : '';
            const falta = es.qtd_voluntarios > total ? ` <span class="badge inactive">faltam ${es.qtd_voluntarios - total}</span>` : '';
            return `
                <tr>
                    <td>${escapar(es.evento || '—')}</td>
                    <td>${escapar(es.funcao)}</td>
                    <td>${formatarHora(es.horario)}${es.hora_fim ? ' - ' + formatarHora(es.hora_fim) : ''}</td>
                    <td>${status}${recusas}${falta}</td>
                    <td><button type="button" data-detalhes="${es.id_escala}">Ver detalhes</button></td>
                </tr>`;
        }).join('') || '<tr><td colspan="5" class="vazio">Nenhuma escala neste dia.</td></tr>';
    }

    function verDetalhes(idEscala) {
        const escala = escalasCarregadas.find(e => e.id_escala === idEscala);
        if (!escala) return;

        const { modal, fechar } = abrirModal(
            `${escala.funcao} — ${escala.evento || ''}`,
            `${tituloDoDia(diaSelecionado)} • chegada às ${formatarHora(escala.horario)} • ${escala.participantes.length} de ${escala.qtd_voluntarios} voluntário(s)`,
            `<div class="list">${escala.participantes.map(p => `
                <div class="list-row">
                    <div class="mini-avatar">${escapar(p.nome.charAt(0))}</div>
                    <div class="info">
                        <strong>${temPermissao('voluntarios') ? `<a href="#" class="link-ficha" data-ficha="${p.id_voluntario}">${escapar(p.nome)}</a>` : escapar(p.nome)}</strong>
                        <small>${p.confirmado ? 'Presença confirmada' : p.recusado ? `Recusou: ${escapar(p.motivo_recusa || 'sem motivo')}` : 'Aguardando confirmação'}</small>
                        ${p.ausente ? '<span class="badge pending">Informou ausência nesta data</span>' : ''}
                    </div>
                    <label class="switch" title="Confirmado">
                        <input type="checkbox" data-voluntario="${p.id_voluntario}" ${p.confirmado ? 'checked' : ''} aria-label="Confirmar ${escapar(p.nome)}">
                        <span class="slider"></span>
                    </label>
                </div>`).join('') || '<p class="vazio">Ninguém escalado.</p>'}</div>
             ${escala.observacoes ? `<p class="subtitulo" style="margin-top:14px;">${escapar(escala.observacoes)}</p>` : ''}
             <div class="form-actions"><button type="button" class="primary" data-fechar>Concluir</button></div>`
        );

        // Nome do voluntário abre a ficha dele
        modal.addEventListener('click', event => {
            const link = event.target.closest('[data-ficha]');
            if (!link) return;
            event.preventDefault();
            fechar();
            fichaVoluntario(Number(link.dataset.ficha));
        });

        modal.addEventListener('change', async event => {
            const caixa = event.target.closest('[data-voluntario]');
            if (!caixa) return;
            try {
                await enviarDados(`escalas/${idEscala}/participantes/${caixa.dataset.voluntario}`, 'PATCH', { confirmado: caixa.checked });
                caixa.closest('.list-row').querySelector('small').textContent = caixa.checked ? 'Presença confirmada' : 'Aguardando confirmação';
            } catch (erro) {
                caixa.checked = !caixa.checked;
                alert(erro.message);
            }
        });
        modal.querySelector('[data-fechar]').addEventListener('click', async () => {
            fechar();
            await Promise.all([desenharCalendario(), carregarDia(diaSelecionado)]);
        });
    }

    function mudarMes(delta) {
        mes += delta;
        if (mes < 1) { mes = 12; ano--; }
        if (mes > 12) { mes = 1; ano++; }
        desenharCalendario();
    }

    $('mesAnterior').addEventListener('click', () => mudarMes(-1));
    $('mesProximo').addEventListener('click', () => mudarMes(1));
    $('mesHoje').addEventListener('click', async () => {
        [ano, mes] = dataDeHoje().split('-').map(Number);
        await desenharCalendario();
        carregarDia(dataDeHoje());
    });
    $('btnEscolherMes').addEventListener('click', () => { $('seletorMes').hidden = !$('seletorMes').hidden; });
    $('aplicarMes').addEventListener('click', () => {
        mes = Number($('selectMes').value);
        ano = Number($('selectAno').value) || ano;
        $('seletorMes').hidden = true;
        desenharCalendario();
    });

    $('calendario').addEventListener('click', event => {
        const celula = event.target.closest('.dia');
        if (celula) carregarDia(celula.dataset.data);
    });
    $('calendario').addEventListener('keydown', event => {
        const celula = event.target.closest('.dia');
        if (celula && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            carregarDia(celula.dataset.data);
        }
    });
    $('escalasDoDia').addEventListener('click', event => {
        const botao = event.target.closest('[data-detalhes]');
        if (botao) verDetalhes(Number(botao.dataset.detalhes));
    });
    $('btnNovaEscala').addEventListener('click', () => novaEscala(diaSelecionado));

    await desenharCalendario();
    await carregarDia(diaSelecionado);
}

async function novaEscala(dataSugerida = dataDeHoje()) {
    registrarRota('escalas/nova', [dataSugerida]);
    const funcoes = await buscarDados('funcoes', []);
    const main = document.getElementById('main');

    const section = document.createElement('section');
    section.className = 'panel volunteer-form';
    section.innerHTML = `
        <form id="formEscala" novalidate>
            <div class="form-section">
                <div class="section-title">
                    <span class="material-icons">event</span>
                    <div><h3>Data e Horário</h3><p>Defina quando a escala acontecerá.</p></div>
                </div>
                <div class="form-grid">
                    <div class="form-group"><label for="eData">Data</label><input type="date" id="eData" required></div>
                    <div class="form-group">
                        <label for="eEvento">Evento</label>
                        <select id="eEvento"></select>
                        <small>Escolha um evento desse dia ou crie um novo.</small>
                    </div>
                    <div class="form-group novo-evento"><label for="eNomeEvento">Nome do novo evento</label><input type="text" id="eNomeEvento" placeholder="Ex.: Culto de Celebração"></div>
                    <div class="form-group novo-evento">
                        <label for="eTipo">Tipo de culto / evento</label>
                        <select id="eTipo">
                            <option value="">Selecione</option>
                            ${Object.entries(TIPOS_EVENTO).map(([valor, nome]) => `<option value="${valor}">${nome}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group novo-evento"><label for="eInicio">Horário de início</label><input type="time" id="eInicio"></div>
                    <div class="form-group novo-evento"><label for="eFim">Horário de término</label><input type="time" id="eFim"></div>
                    <div class="form-group"><label for="eChegada">Horário de chegada da equipe</label><input type="time" id="eChegada" required></div>
                </div>
            </div>

            <div class="form-section">
                <div class="section-title">
                    <span class="material-icons">engineering</span>
                    <div><h3>Função</h3><p>Escolha a função que será realizada.</p></div>
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label for="eFuncao">Função</label>
                        <select id="eFuncao" required>
                            <option value="">Selecione uma função</option>
                            ${funcoes.map(f => `<option value="${f.id_funcao}" data-qtd="${f.qtd_voluntarios}">${escapar(f.nome)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group"><label for="eQuantidade">Quantidade de voluntários</label><input type="number" id="eQuantidade" min="1" max="50" value="1" required></div>
                </div>
            </div>

            <div class="form-section">
                <div class="section-title">
                    <span class="material-icons">groups</span>
                    <div><h3>Voluntários</h3><p id="eAjudaVoluntarios">Selecione a função e a data para ver os voluntários.</p></div>
                </div>
                <div class="checkbox-grid" id="eVoluntarios"></div>
            </div>

            <div class="form-section">
                <div class="section-title">
                    <span class="material-icons">notes</span>
                    <div><h3>Observações</h3><p>Adicione informações importantes.</p></div>
                </div>
                <div class="form-group">
                    <label for="eObservacoes">Observações</label>
                    <textarea id="eObservacoes" rows="4" placeholder="Digite observações sobre esta escala..."></textarea>
                </div>
            </div>

            <div class="form-actions">
                <button type="button" class="btn-cancel" id="cancelarEscala">Cancelar</button>
                <button type="submit" class="primary"><span class="material-icons">save</span>Salvar Escala</button>
            </div>
        </form>
    `;

    const voltar = () => abrirSubstituindo(gerenciaEscalas, $('eData').value || dataSugerida);
    main.replaceChildren(headerComVoltar('Nova Escala', 'Crie uma nova escala de voluntários', voltar), section);

    const form = section.querySelector('form');
    const $ = id => section.querySelector('#' + id);
    let eventosDoDia = [];
    $('eData').value = dataSugerida;

    function alternarNovoEvento() {
        const novo = $('eEvento').value === 'novo';
        section.querySelectorAll('.novo-evento').forEach(c => c.classList.toggle('campo-oculto', !novo));
        const evento = eventosDoDia.find(e => String(e.id_evento) === $('eEvento').value);
        const inicio = novo ? $('eInicio').value : evento?.hora_inicio;
        // Sugere chegada 30 min antes do início
        if (inicio && !$('eChegada').dataset.editado) {
            const [h, m] = inicio.split(':').map(Number);
            const total = Math.max(h * 60 + m - 30, 0);
            $('eChegada').value = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
        }
    }

    async function carregarEventos() {
        const dados = await buscarDados(`escalas/dia?data=${$('eData').value}`, { eventos: [] });
        eventosDoDia = dados.eventos;
        $('eEvento').innerHTML = eventosDoDia.map(e =>
            `<option value="${e.id_evento}">${escapar(e.nome)} — ${formatarHora(e.hora_inicio)}</option>`).join('')
            + '<option value="novo">+ Criar novo evento</option>';
        alternarNovoEvento();
    }

    async function carregarVoluntarios() {
        const caixa = $('eVoluntarios');
        if (!$('eFuncao').value || !$('eData').value) {
            caixa.innerHTML = '';
            return;
        }
        const lista = await buscarDados(`escalas/voluntarios?funcao=${$('eFuncao').value}&data=${$('eData').value}`, []);
        $('eAjudaVoluntarios').textContent = lista.length
            ? `Selecione até ${$('eQuantidade').value} voluntário(s). Quem não marcou esse dia como disponível aparece por último.`
            : 'Nenhum voluntário ativo nesta função. Cadastre em Voluntários.';
        caixa.innerHTML = lista.map(v => `
            <label class="checkbox-card">
                <input type="checkbox" name="voluntarios" value="${v.id_voluntario}">
                <span class="material-icons">person</span>
                <span>${escapar(v.nome)}</span>
                ${v.ausente ? `<span class="badge inactive" title="${escapar(v.motivo_ausencia || '')}">Ausente${v.motivo_ausencia ? ': ' + escapar(v.motivo_ausencia) : ''}</span>`
                    : v.disponivel ? '' : '<span class="badge pending">Indisponível</span>'}
            </label>`).join('');
        limitarSelecao();
    }

    // Não deixa marcar mais voluntários do que a quantidade
    function limitarSelecao() {
        const limite = Number($('eQuantidade').value) || 1;
        const caixas = [...form.querySelectorAll('input[name="voluntarios"]')];
        const marcados = caixas.filter(c => c.checked).length;
        caixas.forEach(c => { c.disabled = !c.checked && marcados >= limite; });
    }

    $('eData').addEventListener('change', () => { carregarEventos(); carregarVoluntarios(); });
    $('eEvento').addEventListener('change', alternarNovoEvento);
    $('eInicio').addEventListener('change', alternarNovoEvento);
    $('eChegada').addEventListener('input', () => { $('eChegada').dataset.editado = '1'; });
    $('eFuncao').addEventListener('change', () => {
        const opcao = $('eFuncao').selectedOptions[0];
        if (opcao?.dataset.qtd) $('eQuantidade').value = opcao.dataset.qtd;
        carregarVoluntarios();
    });
    $('eQuantidade').addEventListener('input', () => {
        form.querySelectorAll('input[name="voluntarios"]').forEach(c => { c.checked = false; });
        limitarSelecao();
        $('eAjudaVoluntarios').textContent = `Selecione até ${$('eQuantidade').value} voluntário(s).`;
    });
    $('eVoluntarios').addEventListener('change', limitarSelecao);
    $('cancelarEscala').addEventListener('click', () => voltar());

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const novo = $('eEvento').value === 'novo';
        const dados = {
            data: $('eData').value,
            id_evento: novo ? null : $('eEvento').value,
            evento: novo ? { nome: $('eNomeEvento').value, tipo_evento: $('eTipo').value, hora_inicio: $('eInicio').value, hora_fim: $('eFim').value } : null,
            horario: $('eChegada').value,
            id_funcao: $('eFuncao').value,
            qtd_voluntarios: Number($('eQuantidade').value),
            voluntarios: [...form.querySelectorAll('input[name="voluntarios"]:checked')].map(c => c.value),
            observacoes: $('eObservacoes').value
        };

        if (novo && dados.evento.hora_fim && dados.evento.hora_fim <= dados.evento.hora_inicio) {
            return mensagemFormulario(form, 'O horário de término deve ser depois do horário de início.');
        }
        if (!dados.voluntarios.length) return mensagemFormulario(form, 'Selecione pelo menos um voluntário.');

        try {
            await enviarDados('escalas', 'POST', dados);
            alert('Escala cadastrada com sucesso!');
            abrirSubstituindo(gerenciaEscalas, dados.data);
        } catch (erro) {
            mensagemFormulario(form, erro.message);
        }
    });

    await carregarEventos();
}
