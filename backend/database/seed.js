// =========================================================
// SEED DE TESTE — simula meses de funcionamento da igreja
//
// Uso:  npm run db:seed
//
// - Gera ~6 meses de histórico e ~2 meses de agenda futura,
//   sempre relativos à data em que o script é executado.
// - Só ACRESCENTA dados (não apaga nada do que já existe).
// - Roda em uma única transação: se der erro, nada é gravado.
// - Não roda duas vezes (verifica o usuário admin@novocaminho.org).
// - Os dados são determinísticos (mesma semente = mesmos dados).
//
// Usuários criados (senha de teste para todos: Teste@123):
//   admin@novocaminho.org       ADMINISTRADOR
//   secretaria@novocaminho.org  SECRETARIA
//   tesouraria@novocaminho.org  FINANCEIRO
// =========================================================

const crypto = require('crypto');
const pool = require('../src/config/db');

const MESES_HISTORICO = 6;
const DIAS_FUTURO = 60;
const SENHA_TESTE = 'Teste@123';

// ---------------------------------------------------------
// Aleatório determinístico
// ---------------------------------------------------------
let semente = 20261021;
function aleatorio() {
    semente |= 0; semente = semente + 0x6D2B79F5 | 0;
    let t = Math.imul(semente ^ semente >>> 15, 1 | semente);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
const inteiro = (min, max) => Math.floor(aleatorio() * (max - min + 1)) + min;
const chance = p => aleatorio() < p;
const escolher = lista => lista[Math.floor(aleatorio() * lista.length)];
const valor = (min, max) => (aleatorio() * (max - min) + min).toFixed(2);
function embaralhar(lista) {
    const copia = [...lista];
    for (let i = copia.length - 1; i > 0; i--) {
        const j = Math.floor(aleatorio() * (i + 1));
        [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
}

// ---------------------------------------------------------
// Datas (sempre 'AAAA-MM-DD', calculadas em UTC)
// ---------------------------------------------------------
const paraData = d => d.toISOString().slice(0, 10);
const deData = s => new Date(s + 'T00:00:00Z');
function somarDias(s, dias) { const d = deData(s); d.setUTCDate(d.getUTCDate() + dias); return paraData(d); }
function somarMeses(s, meses) { const d = deData(s); d.setUTCMonth(d.getUTCMonth() + meses); return paraData(d); }
const diaSemana = s => deData(s).getUTCDay(); // 0 = domingo
const diaDoMes = s => deData(s).getUTCDate();
const dataNoMes = (ano, mes, dia) => paraData(new Date(Date.UTC(ano, mes, dia)));
function idadeEm(nascimento, data) {
    const n = deData(nascimento), d = deData(data);
    let anos = d.getUTCFullYear() - n.getUTCFullYear();
    if (d.getUTCMonth() < n.getUTCMonth() || (d.getUTCMonth() === n.getUTCMonth() && d.getUTCDate() < n.getUTCDate())) anos--;
    return anos;
}
function hora(h, m, s = 0) { return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; }
function somarMinutos(horario, minutos) {
    const [h, m] = horario.split(':').map(Number);
    const total = h * 60 + m + minutos;
    return hora(Math.floor(total / 60), total % 60);
}
function dataEntre(inicio, fim) {
    const a = deData(inicio).getTime(), b = deData(fim).getTime();
    return paraData(new Date(a + Math.floor(aleatorio() * (b - a + 1) / 86400000) * 86400000));
}
const formatarBR = s => s.split('-').reverse().join('/');

const agora = new Date();
agora.setMinutes(agora.getMinutes() - agora.getTimezoneOffset());
const HOJE = paraData(agora);
let INICIO = somarMeses(HOJE, -MESES_HISTORICO);
while (diaSemana(INICIO) !== 1) INICIO = somarDias(INICIO, -1); // começa numa segunda
const FIM = somarDias(HOJE, DIAS_FUTURO);

// ---------------------------------------------------------
// Nomes
// ---------------------------------------------------------
const NOMES_M = ['Adriano', 'André', 'Antônio', 'Arthur', 'Bernardo', 'Caio', 'Carlos', 'Daniel', 'Davi', 'Eduardo', 'Elias', 'Enzo', 'Fábio', 'Fernando', 'Gabriel', 'Guilherme', 'Gustavo', 'Heitor', 'Henrique', 'Igor', 'Isaque', 'Jefferson', 'Joel', 'Jonas', 'José', 'Leandro', 'Leonardo', 'Lorenzo', 'Lucas', 'Marcelo', 'Marcos', 'Mateus', 'Miguel', 'Murilo', 'Natan', 'Otávio', 'Paulo', 'Rafael', 'Renan', 'Rodrigo', 'Samuel', 'Sérgio', 'Theo', 'Tiago', 'Vinícius', 'Wagner'];
const NOMES_F = ['Adriana', 'Alice', 'Amanda', 'Ana Clara', 'Ana Luíza', 'Beatriz', 'Bianca', 'Bruna', 'Carla', 'Cecília', 'Clara', 'Daniela', 'Débora', 'Eduarda', 'Elaine', 'Elisa', 'Ester', 'Gabriela', 'Helena', 'Isabela', 'Jéssica', 'Joana', 'Júlia', 'Karina', 'Laura', 'Letícia', 'Lívia', 'Luana', 'Manuela', 'Marta', 'Mirela', 'Natália', 'Patrícia', 'Priscila', 'Rafaela', 'Raquel', 'Rebeca', 'Sara', 'Simone', 'Sofia', 'Tatiane', 'Valentina', 'Vanessa', 'Vitória'];
const SOBRENOMES = ['Andrade', 'Antunes', 'Barros', 'Bittencourt', 'Borges', 'Cardoso', 'Castro', 'Correia', 'Cunha', 'Dias', 'Duarte', 'Fagundes', 'Farias', 'Fernandes', 'Fischer', 'Freitas', 'Garcia', 'Gonçalves', 'Hoffmann', 'Kowalski', 'Kraus', 'Lopes', 'Machado', 'Marques', 'Medeiros', 'Moraes', 'Nascimento', 'Neves', 'Pacheco', 'Pinto', 'Prado', 'Ramos', 'Reis', 'Rocha', 'Sampaio', 'Schmidt', 'Siqueira', 'Soares', 'Tavares', 'Vargas', 'Vieira', 'Wiecheteck', 'Zanella'];
const RUAS = ['Rua Felipe Schmidt', 'Rua Vidal Ramos', 'Rua Caetano Costa', 'Rua Paula Pereira', 'Rua Barão do Rio Branco', 'Rua Eugênio de Souza', 'Avenida Rui Barbosa', 'Rua Getúlio Vargas', 'Rua XV de Novembro', 'Rua Coronel Albuquerque'];
const BAIRROS = ['Centro', 'Alto das Palmeiras', 'Água Verde', 'Campo d\'Água Verde', 'Boa Vista', 'Piedade', 'Sossego', 'Industrial', 'Tricolin'];

const semAcento = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '');
const telefone = () => `(47) 9${inteiro(8100, 9999)}-${inteiro(1000, 9999)}`;
const endereco = () => `${escolher(RUAS)}, ${inteiro(10, 2400)} - ${escolher(BAIRROS)}, Canoinhas - SC`;
const emailsUsados = new Set();
function email(nome, sobrenome) {
    const base = semAcento(`${nome.split(' ')[0]}.${sobrenome}`).toLowerCase().replace(/[^a-z.]/g, '');
    let candidato = `${base}@example.com`, n = 2;
    while (emailsUsados.has(candidato)) candidato = `${base}${n++}@example.com`;
    emailsUsados.add(candidato);
    return candidato;
}

// ---------------------------------------------------------
// Banco
// ---------------------------------------------------------
let cliente;
async function inserir(tabela, dados, retorno) {
    const colunas = Object.keys(dados);
    const sql = `INSERT INTO ${tabela} (${colunas.join(', ')})
                 VALUES (${colunas.map((_, i) => '$' + (i + 1)).join(', ')})
                 ${retorno ? 'RETURNING ' + retorno : ''}`;
    const result = await cliente.query(sql, Object.values(dados));
    return retorno ? result.rows[0][retorno] : undefined;
}
const contador = {};
const contar = (tabela, n = 1) => { contador[tabela] = (contador[tabela] || 0) + n; };

function hashSenha(senha) {
    const sal = crypto.randomBytes(16).toString('hex');
    return `scrypt$${sal}$${crypto.scryptSync(senha, sal, 32).toString('hex')}`;
}

// ---------------------------------------------------------
// 0. Corrige textos gravados com codificação errada
//    (ex.: "Recep‡Æo" -> "Recepção", "µgua" -> "Água").
//    Acontece quando o SQL é rodado no terminal do Windows (CP850)
//    e o banco interpreta os bytes como outra codificação.
// ---------------------------------------------------------
const CP850_ERRADO = { '‡': 'ç', 'Æ': 'ã', 'ä': 'õ', '¡': 'í', 'µ': 'Á', '‚': 'é', '£': 'ú', ' ': 'á', '…': 'à', '¢': 'ó', 'ƒ': 'â', 'ˆ': 'ê', '€': 'Ç' };
const TEXTO_CORROMPIDO = /[‡Æ¡µ‚£ …¢ƒˆ€]/;
const corrigirTexto = texto => texto.replace(/[‡Æä¡µ‚£ …¢ƒˆ€]/g, c => CP850_ERRADO[c]);

async function corrigirTextosCorrompidos() {
    const alvos = [
        ['departamentos', 'id_departamento', ['nome', 'descricao']],
        ['categorias_financeiras', 'id_categoria', ['nome']]
    ];
    for (const [tabela, chave, colunas] of alvos) {
        for (const linha of (await cliente.query(`SELECT ${chave}, ${colunas.join(', ')} FROM ${tabela}`)).rows) {
            for (const coluna of colunas) {
                if (!linha[coluna] || !TEXTO_CORROMPIDO.test(linha[coluna])) continue;
                await cliente.query(`UPDATE ${tabela} SET ${coluna} = $1 WHERE ${chave} = $2`, [corrigirTexto(linha[coluna]), linha[chave]]);
                contar('textos corrigidos (codificação)');
            }
        }
    }
}

// ---------------------------------------------------------
// 1. Usuários do sistema
// ---------------------------------------------------------
async function seedUsuarios() {
    const usuarios = [
        { nome: 'Administrador', email: 'admin@novocaminho.org', perfil: 'ADMINISTRADOR', ativo: true },
        { nome: 'Rosângela Kraus', email: 'secretaria@novocaminho.org', perfil: 'SECRETARIA', ativo: true },
        { nome: 'Marcos Hoffmann', email: 'tesouraria@novocaminho.org', perfil: 'FINANCEIRO', ativo: true },
        { nome: 'Cláudia Ramos', email: 'claudia.ramos@novocaminho.org', perfil: 'SECRETARIA', ativo: false }
    ];
    for (const u of usuarios) {
        await inserir('usuarios', { ...u, senha_hash: hashSenha(SENHA_TESTE), criado_em: somarDias(INICIO, -30) });
        contar('usuarios');
    }
}

// ---------------------------------------------------------
// 2. Membros (famílias, jovens e adultos) e crianças
// ---------------------------------------------------------
const membros = [];   // { id, nome, sexo, nascimento, entrada, apto, adulto, familia }
const familias = [];  // { sobrenome, adultos: [], filhos: [] }

function nascimentoPorIdade(min, max) {
    return dataEntre(somarDias(somarMeses(HOJE, -12 * (max + 1)), 1), somarMeses(HOJE, -12 * min));
}

async function criarMembro({ sexo, sobrenome, idadeMin, idadeMax, casado, recente }) {
    const nome = sexo === 'M' ? escolher(NOMES_M) : escolher(NOMES_F);
    const nascimento = nascimentoPorIdade(idadeMin, idadeMax);
    const idade = idadeEm(nascimento, HOJE);
    const adulto = idade >= 18;
    const entrada = recente
        ? dataEntre(somarDias(INICIO, 14), somarDias(HOJE, -3))
        : dataEntre(somarMeses(INICIO, -12 * 9), somarDias(INICIO, -1));
    const estadoCivil = idade < 12 ? null
        : casado ? (sexo === 'M' ? 'Casado' : 'Casada')
        : idade > 60 && chance(.3) ? (sexo === 'M' ? 'Viúvo' : 'Viúva')
        : idade > 30 && chance(.12) ? (sexo === 'M' ? 'Divorciado' : 'Divorciada')
        : (sexo === 'M' ? 'Solteiro' : 'Solteira');
    const batizado = idade >= 12 && chance(adulto ? .8 : .35);
    const dataBatismo = batizado ? dataEntre(somarMeses(nascimento, 12 * 12), somarDias(HOJE, -30)) : null;
    const apto = adulto && idade <= 68 && batizado && !recente && chance(.7);

    const id = await inserir('membros', {
        nome_completo: `${nome} ${sobrenome}`,
        data_nascimento: nascimento,
        telefone: idade >= 14 ? telefone() : null,
        email: idade >= 16 ? email(nome, sobrenome) : null,
        endereco: endereco(),
        estado_civil: estadoCivil,
        data_entrada_igreja: entrada,
        informacoes_batismo: batizado
            ? `Batizado(a) nas águas em ${formatarBR(dataBatismo)}${chance(.7) ? ' na Igreja Novo Caminho' : ' em outra igreja evangélica'}`
            : null,
        ativo: chance(.96),
        criado_em: entrada,
        apto_voluntario: apto,
        voluntario: false
    }, 'id_membro');
    contar('membros');

    const membro = { id, nome: `${nome} ${sobrenome}`, primeiroNome: nome, sobrenome, sexo, nascimento, entrada, apto, adulto, dataBatismo };
    membros.push(membro);
    return membro;
}

async function seedMembros() {
    const sobrenomes = embaralhar(SOBRENOMES);

    // Famílias com filhos
    for (let i = 0; i < 34; i++) {
        const sobrenome = sobrenomes[i % sobrenomes.length];
        const recente = chance(.15);
        const familia = { sobrenome, adultos: [], filhos: [] };
        const idadePais = inteiro(27, 50);

        familia.adultos.push(await criarMembro({ sexo: 'M', sobrenome, idadeMin: idadePais, idadeMax: idadePais + 3, casado: true, recente }));
        if (chance(.85)) {
            familia.adultos.push(await criarMembro({ sexo: 'F', sobrenome, idadeMin: idadePais - 3, idadeMax: idadePais, casado: true, recente }));
        }

        const qtdFilhos = inteiro(1, 3);
        for (let f = 0; f < qtdFilhos; f++) {
            const maxIdade = Math.min(17, idadePais - 20);
            familia.filhos.push(await criarMembro({ sexo: chance(.5) ? 'M' : 'F', sobrenome, idadeMin: 2, idadeMax: maxIdade, recente }));
        }
        familias.push(familia);
    }

    // Jovens e adultos sem filhos cadastrados
    for (let i = 0; i < 46; i++) {
        const sobrenome = escolher(SOBRENOMES);
        const faixa = escolher([[18, 25], [18, 25], [26, 40], [41, 60], [61, 80]]);
        await criarMembro({ sexo: chance(.5) ? 'M' : 'F', sobrenome, idadeMin: faixa[0], idadeMax: faixa[1], casado: faixa[0] >= 26 && chance(.5), recente: chance(.2) });
    }
}

// ---------------------------------------------------------
// 3. Visitantes (alguns viraram membros)
// ---------------------------------------------------------
async function seedVisitantes() {
    const origens = ['Primeira visita', 'Convidado(a) por um membro', 'Veio pelo Instagram da igreja', 'Mudou-se recentemente para Canoinhas', 'Retornou após alguns anos afastado(a)', 'Veio com a família', 'Conheceu a igreja na Ação Social', null, null];

    // Membros recentes visitaram antes de entrar
    for (const m of membros.filter(m => m.entrada >= INICIO && m.adulto)) {
        let visita = somarDias(m.entrada, -inteiro(14, 60));
        while (diaSemana(visita) !== 0) visita = somarDias(visita, -1);
        if (visita < INICIO) continue;
        await inserir('visitantes', { nome: m.nome, telefone: telefone(), data_visita: visita, observacoes: 'Primeira visita — hoje é membro', criado_em: visita });
        contar('visitantes');
    }

    for (let d = INICIO; d <= HOJE; d = somarDias(d, 1)) {
        const qtd = diaSemana(d) === 0 ? inteiro(2, 7) : diaSemana(d) === 3 ? inteiro(0, 2) : 0;
        for (let i = 0; i < qtd; i++) {
            const sexo = chance(.5) ? 'M' : 'F';
            const nome = `${sexo === 'M' ? escolher(NOMES_M) : escolher(NOMES_F)} ${escolher(SOBRENOMES)}`;
            const observacao = escolher(origens);
            await inserir('visitantes', {
                nome,
                telefone: chance(.8) ? telefone() : null,
                data_visita: d,
                observacoes: observacao === 'Convidado(a) por um membro'
                    ? `Convidado(a) por ${escolher(membros.filter(m => m.adulto)).nome}`
                    : observacao,
                criado_em: d
            });
            contar('visitantes');
        }
    }
}

// ---------------------------------------------------------
// 4. Departamentos, funções e voluntários
// ---------------------------------------------------------
const funcoes = {};      // NOME -> { id, qtd }
const departamentos = {}; // nome -> id
const voluntarios = [];  // { id, idMembro, funcoes: [idFuncao], inicio, uso }

async function carregarCadastrosBase() {
    for (const r of (await cliente.query('SELECT id_funcao, nome, qtd_voluntarios FROM funcoes')).rows) {
        funcoes[r.nome.toUpperCase()] = { id: r.id_funcao, qtd: r.qtd_voluntarios };
    }
    for (const r of (await cliente.query('SELECT id_departamento, nome FROM departamentos')).rows) {
        departamentos[r.nome] = r.id_departamento;
    }
    for (const nome of ['RECEPÇÃO', 'LOUVOR', 'MESA DE SOM', 'PROJEÇÃO', 'FOTOS', 'KIDS (2 A 4 ANOS)', 'KIDS (5 A 8 ANOS)', 'NEXT', 'LÍDER PEDAGÓGICO', 'ESTACIONAMENTO', 'GESTÃO DE CULTO']) {
        if (!funcoes[nome]) throw new Error(`Função "${nome}" não encontrada na tabela funcoes.`);
    }
    for (const nome of ['Recepção', 'Louvor', 'Kids', 'Mídia', 'Estacionamento', 'Integração']) {
        if (!departamentos[nome]) throw new Error(`Departamento "${nome}" não encontrado.`);
    }
}

async function seedVoluntarios() {
    // Departamento -> funções que ele cobre e quantos voluntários ter.
    // Os grupos pequenos vêm primeiro para nunca ficarem sem gente.
    const plano = [
        { dep: 'Integração', funcoes: [['GESTÃO DE CULTO'], ['GESTÃO DE CULTO', 'RECEPÇÃO']], qtd: 6 },
        { dep: 'Estacionamento', funcoes: [['ESTACIONAMENTO']], qtd: 5 },
        { dep: 'Kids', funcoes: [['KIDS (2 A 4 ANOS)'], ['KIDS (5 A 8 ANOS)'], ['NEXT'], ['KIDS (2 A 4 ANOS)', 'KIDS (5 A 8 ANOS)'], ['LÍDER PEDAGÓGICO', 'KIDS (5 A 8 ANOS)'], ['LÍDER PEDAGÓGICO', 'NEXT']], qtd: 14 },
        { dep: 'Mídia', funcoes: [['MESA DE SOM'], ['PROJEÇÃO'], ['MESA DE SOM', 'PROJEÇÃO'], ['FOTOS'], ['FOTOS', 'PROJEÇÃO']], qtd: 10 },
        { dep: 'Recepção', funcoes: [['RECEPÇÃO']], qtd: 13 },
        { dep: 'Louvor', funcoes: [['LOUVOR']], qtd: 16 }
    ];

    const jaVoluntarios = new Set((await cliente.query('SELECT id_membro FROM voluntarios')).rows.map(r => r.id_membro));
    const existentesAptos = (await cliente.query(
        `SELECT id_membro, nome_completo, data_entrada_igreja FROM membros
         WHERE apto_voluntario = TRUE AND ativo = TRUE AND id_membro <> ALL($1::int[])`,
        [[...jaVoluntarios, ...membros.map(m => m.id)]]
    )).rows.map(r => ({ id: r.id_membro, nome: r.nome_completo, entrada: paraData(r.data_entrada_igreja || deData(somarMeses(INICIO, -12))), dataBatismo: null }));

    let candidatos = embaralhar([...membros.filter(m => m.apto), ...existentesAptos]);

    for (const grupo of plano) {
        for (let i = 0; i < grupo.qtd && candidatos.length; i++) {
            const m = candidatos.shift();
            const nomesFuncoes = grupo.funcoes[i % grupo.funcoes.length];
            // A maioria já servia antes do período; alguns começaram durante
            let inicio = chance(.85)
                ? dataEntre(somarMeses(INICIO, -36), somarDias(INICIO, -1))
                : dataEntre(somarDias(INICIO, 20), somarDias(HOJE, -20));
            if (inicio < m.entrada) inicio = m.entrada; // não serve antes de entrar na igreja
            const batismo = m.dataBatismo || dataEntre(somarMeses(INICIO, -12 * 10), somarMeses(INICIO, -6));

            const id = await inserir('voluntarios', {
                id_membro: m.id,
                numero_mes_batizado: deData(batismo).getUTCMonth() + 1,
                data_batismo: batismo,
                data_inicio_voluntariado: inicio,
                ativo: chance(.95),
                id_departamento: departamentos[grupo.dep]
            }, 'id_voluntario');
            contar('voluntarios');

            const idsFuncoes = nomesFuncoes.map(n => funcoes[n].id);
            for (const idFuncao of idsFuncoes) {
                await inserir('voluntario_funcoes', { id_voluntario: id, id_funcao: idFuncao });
                contar('voluntario_funcoes');
            }
            voluntarios.push({ id, idMembro: m.id, funcoes: idsFuncoes, inicio, uso: 0 });
        }
    }
}

// ---------------------------------------------------------
// 5. Eventos, escalas e participantes
// ---------------------------------------------------------
const ESCALAS = {
    celebracao: { 'RECEPÇÃO': 4, 'LOUVOR': 6, 'MESA DE SOM': 1, 'PROJEÇÃO': 1, 'FOTOS': 1, 'KIDS (2 A 4 ANOS)': 2, 'KIDS (5 A 8 ANOS)': 1, 'NEXT': 1, 'LÍDER PEDAGÓGICO': 1, 'ESTACIONAMENTO': 1, 'GESTÃO DE CULTO': 2 },
    familia: { 'RECEPÇÃO': 2, 'LOUVOR': 4, 'MESA DE SOM': 1, 'PROJEÇÃO': 1, 'KIDS (5 A 8 ANOS)': 1, 'GESTÃO DE CULTO': 1 },
    oracao: { 'RECEPÇÃO': 2, 'LOUVOR': 3, 'MESA DE SOM': 1, 'PROJEÇÃO': 1 },
    jovens: { 'RECEPÇÃO': 2, 'LOUVOR': 4, 'MESA DE SOM': 1, 'PROJEÇÃO': 1, 'FOTOS': 1 },
    infantil: { 'RECEPÇÃO': 2, 'LOUVOR': 2, 'MESA DE SOM': 1, 'KIDS (2 A 4 ANOS)': 2, 'KIDS (5 A 8 ANOS)': 2, 'NEXT': 1, 'LÍDER PEDAGÓGICO': 1 },
    especial: { 'RECEPÇÃO': 3, 'LOUVOR': 4, 'MESA DE SOM': 1, 'FOTOS': 1, 'ESTACIONAMENTO': 1, 'GESTÃO DE CULTO': 1 },
    social: { 'RECEPÇÃO': 4, 'GESTÃO DE CULTO': 2, 'FOTOS': 1 },
    cantata: { 'RECEPÇÃO': 4, 'LOUVOR': 6, 'MESA DE SOM': 1, 'PROJEÇÃO': 1, 'FOTOS': 1, 'ESTACIONAMENTO': 1, 'GESTÃO DE CULTO': 2 }
};

const ano = Number(HOJE.slice(0, 4));
const ESPECIAIS = [
    { data: `${ano}-05-24`, nome: 'Batismo nas Águas', inicio: hora(15, 0), fim: hora(17, 0), tipo: 'evento', escala: 'especial' },
    { data: `${ano}-06-13`, nome: 'Ação Social — Arrecadação de Alimentos', inicio: hora(9, 0), fim: hora(12, 0), tipo: 'evento', escala: 'social', despesa: 'social' },
    { data: `${ano}-07-11`, nome: 'Festa Julina da Igreja', inicio: hora(18, 0), fim: hora(22, 0), tipo: 'evento', escala: 'especial', receita: [2400, 3300], despesa: 'evento' },
    { data: `${ano}-08-30`, nome: 'Batismo nas Águas', inicio: hora(15, 0), fim: hora(17, 0), tipo: 'evento', escala: 'especial' },
    { data: `${ano}-09-18`, nome: 'Conferência de Família — Noite 1', inicio: hora(19, 30), fim: hora(22, 0), tipo: 'evento', escala: 'especial', receita: [2600, 3400], despesa: 'evento' },
    { data: `${ano}-09-19`, nome: 'Conferência de Família — Noite 2', inicio: hora(19, 30), fim: hora(22, 0), tipo: 'evento', escala: 'especial' },
    { data: `${ano}-10-10`, nome: 'Dia das Crianças — Culto Kids Especial', inicio: hora(14, 0), fim: hora(17, 0), tipo: 'culto-infantil', escala: 'infantil', despesa: 'evento' },
    { data: `${ano}-11-14`, nome: 'Retiro de Jovens', inicio: hora(8, 0), fim: hora(18, 0), tipo: 'evento', escala: 'especial', receita: [1800, 2600], despesa: 'evento' },
    { data: `${ano}-11-22`, nome: 'Batismo nas Águas', inicio: hora(15, 0), fim: hora(17, 0), tipo: 'evento', escala: 'especial' },
    { data: `${ano}-12-13`, nome: 'Ação Social de Natal', inicio: hora(9, 0), fim: hora(12, 0), tipo: 'evento', escala: 'social', despesa: 'social' },
    { data: `${ano}-12-20`, nome: 'Cantata de Natal', inicio: hora(19, 0), fim: hora(21, 0), tipo: 'evento', escala: 'cantata', despesa: 'evento' }
];

const eventos = []; // { id, data, nome, inicio, fim, tipo, culto, especial }

function eventosDoDia(d) {
    const lista = [];
    const dia = diaSemana(d);
    const semanaDoMes = Math.ceil(diaDoMes(d) / 7);

    if (dia === 0) {
        lista.push({ nome: semanaDoMes === 1 ? 'Culto de Santa Ceia' : 'Culto de Celebração', inicio: hora(9, 0), fim: hora(11, 30), tipo: 'culto', escala: 'celebracao', culto: 'manha' });
        lista.push({ nome: 'Culto da Família', inicio: hora(19, 0), fim: hora(21, 0), tipo: 'culto', escala: 'familia', culto: 'noite' });
    }
    if (dia === 3) lista.push({ nome: 'Culto de Oração e Ensino', inicio: hora(19, 30), fim: hora(21, 0), tipo: 'culto', escala: 'oracao', culto: 'quarta' });
    if (dia === 6 && semanaDoMes % 2 === 1) lista.push({ nome: 'Culto de Jovens', inicio: hora(19, 30), fim: hora(22, 0), tipo: 'culto-jovens', escala: 'jovens', culto: 'jovens' });
    const kidsEspecial = ESPECIAIS.some(e => e.data === d && e.tipo === 'culto-infantil');
    if (dia === 6 && semanaDoMes === 2 && !kidsEspecial) lista.push({ nome: 'Culto Kids', inicio: hora(15, 0), fim: hora(17, 0), tipo: 'culto-infantil', escala: 'infantil', culto: 'kids' });
    if (dia === 1 && semanaDoMes === 1) lista.push({ nome: 'Reunião de Liderança', inicio: hora(20, 0), fim: hora(21, 30), tipo: 'reuniao' });
    if (dia === 4 && diaDoMes(somarDias(d, 7)) < diaDoMes(d)) lista.push({ nome: 'Reunião Geral de Voluntários', inicio: hora(20, 0), fim: hora(21, 0), tipo: 'reuniao' });

    for (const e of ESPECIAIS.filter(e => e.data === d)) lista.push({ ...e, especial: true });
    return lista;
}

function escolherVoluntarios(idFuncao, quantidade, data, usadosNoEvento) {
    const aptos = voluntarios.filter(v =>
        v.funcoes.includes(idFuncao) && v.inicio <= data && !usadosNoEvento.has(v.id)
    );
    // Rodízio: quem serviu menos vem primeiro (com um pouco de sorte no desempate)
    aptos.sort((a, b) => (a.uso + aleatorio() * 1.5) - (b.uso + aleatorio() * 1.5));
    return aptos.slice(0, quantidade);
}

async function seedEventosEEscalas() {
    for (let d = INICIO; d <= FIM; d = somarDias(d, 1)) {
        for (const ev of eventosDoDia(d)) {
            const criadoEm = somarDias(d, -inteiro(7, 30));
            const id = await inserir('eventos', {
                nome: ev.nome,
                data_evento: d,
                criado_em: `${criadoEm < HOJE ? criadoEm : HOJE} ${hora(inteiro(8, 18), inteiro(0, 59))}`,
                hora_inicio: ev.inicio,
                hora_fim: ev.fim,
                tipo_evento: ev.tipo
            }, 'id_evento');
            contar('eventos');
            eventos.push({ id, data: d, ...ev });

            if (!ev.escala) continue;

            const usadosNoEvento = new Set();
            for (const [nomeFuncao, quantidade] of Object.entries(ESCALAS[ev.escala])) {
                const funcao = funcoes[nomeFuncao];
                const chegada = somarMinutos(ev.inicio, nomeFuncao === 'LOUVOR' || nomeFuncao === 'MESA DE SOM' ? -60 : -30);
                const idEscala = await inserir('escalas', {
                    id_evento: id,
                    id_funcao: funcao.id,
                    qtd_voluntarios: quantidade,
                    data_escala: d,
                    horario: chegada,
                    descricao: `${nomeFuncao} — ${ev.nome}`,
                    observacoes: nomeFuncao === 'LOUVOR' ? 'Ensaio e oração 1h antes do culto' : chance(.15) ? 'Chegar 30 min antes para oração' : null
                }, 'id_escala');
                contar('escalas');

                const diasAte = (deData(d) - deData(HOJE)) / 86400000;
                for (const v of escolherVoluntarios(funcao.id, quantidade, d, usadosNoEvento)) {
                    usadosNoEvento.add(v.id);
                    v.uso++;
                    const confirmado = diasAte < 0 ? chance(.91) : diasAte <= 7 ? chance(.6) : chance(.25);
                    await inserir('escala_participantes', { id_escala: idEscala, id_voluntario: v.id, id_funcao: funcao.id, confirmado });
                    contar('escala_participantes');
                }
            }
        }
    }
}

// ---------------------------------------------------------
// 6. Lista de presença (turmas) nos cultos de domingo de manhã
// ---------------------------------------------------------
async function seedPresenca() {
    const faixas = [
        { nome: 'Kids — 2 a 4 anos', min: 2, max: 4 },
        { nome: 'Kids — 5 a 8 anos', min: 5, max: 8 },
        { nome: 'Next', min: 9, max: 12 },
        { nome: 'Adolescentes — 13 a 17 anos', min: 13, max: 17 }
    ];
    for (const f of faixas) {
        await cliente.query('INSERT INTO cadastroturmas (nome) VALUES ($1) ON CONFLICT (nome) DO NOTHING', [f.nome]);
        f.id = (await cliente.query('SELECT id_turma FROM cadastroturmas WHERE nome = $1', [f.nome])).rows[0].id_turma;
    }

    const criancas = membros.filter(m => idadeEm(m.nascimento, HOJE) <= 18);
    const cultosComTurmas = eventos.filter(e =>
        (e.culto === 'manha' || e.culto === 'kids' || e.tipo === 'culto-infantil') && e.data <= HOJE
    );
    const registrados = new Set(); // turma + membro + data é único

    for (const culto of cultosComTurmas) {
        for (const c of criancas) {
            const idade = idadeEm(c.nascimento, culto.data);
            const turma = faixas.find(f => idade >= f.min && idade <= f.max);
            const cultoInfantil = culto.culto !== 'manha';
            if (!turma || c.entrada > culto.data || !chance(cultoInfantil ? .55 : .78)) continue;
            if (cultoInfantil && turma.min >= 13) continue;
            const chave = `${turma.id}-${c.id}-${culto.data}`;
            if (registrados.has(chave)) continue;
            registrados.add(chave);

            const entrada = somarMinutos(culto.inicio, -inteiro(0, 20));
            const ehHoje = culto.data === HOJE;
            await inserir('turmas', {
                id_turma: turma.id,
                nome: c.nome,
                id_membro: c.id,
                data: culto.data,
                hora_entrada: `${entrada.slice(0, 5)}:${String(inteiro(0, 59)).padStart(2, '0')}`,
                hora_saida: ehHoje && chance(.6) ? null : `${somarMinutos(culto.fim, inteiro(-5, 20)).slice(0, 5)}:${String(inteiro(0, 59)).padStart(2, '0')}`
            });
            contar('turmas (presenças)');
        }
    }
}

// ---------------------------------------------------------
// 7. Ministério infantil: crianças e responsáveis
// ---------------------------------------------------------
async function seedCriancas() {
    const observacoes = ['Alergia a amendoim', 'Intolerância à lactose', 'Usa óculos', 'Asma leve — bombinha na mochila', 'Não pode comer glúten', 'Autorizado(a) a sair só com a mãe'];

    for (const familia of familias) {
        const filhos = familia.filhos.filter(f => idadeEm(f.nascimento, HOJE) <= 12);
        // Alguns bebês ainda não são membros, mas já frequentam o berçário
        if (chance(.15)) filhos.push({ nome: `${escolher(NOMES_F)} ${familia.sobrenome}`, nascimento: dataEntre(somarMeses(HOJE, -20), somarMeses(HOJE, -4)) });
        if (!filhos.length) continue;

        const responsaveis = [];
        for (const adulto of familia.adultos) {
            const id = await inserir('responsaveis', {
                nome_completo: adulto.nome,
                telefone: telefone(),
                email: chance(.8) ? email(adulto.primeiroNome, familia.sobrenome) : null,
                parentesco: adulto.sexo === 'M' ? 'Pai' : 'Mãe',
                ativo: true
            }, 'id_responsavel');
            contar('responsaveis');
            responsaveis.push({ id, sexo: adulto.sexo });
        }
        if (chance(.25)) {
            const sexo = chance(.6) ? 'F' : 'M';
            const id = await inserir('responsaveis', {
                nome_completo: `${sexo === 'M' ? escolher(NOMES_M) : escolher(NOMES_F)} ${escolher(SOBRENOMES)}`,
                telefone: telefone(),
                email: null,
                parentesco: sexo === 'M' ? 'Avô' : 'Avó',
                ativo: true
            }, 'id_responsavel');
            contar('responsaveis');
            responsaveis.push({ id, sexo, avo: true });
        }

        const principal = responsaveis.find(r => r.sexo === 'F' && !r.avo) || responsaveis[0];
        for (const filho of filhos) {
            const idCrianca = await inserir('criancas', {
                nome_completo: filho.nome,
                data_nascimento: filho.nascimento,
                observacoes: chance(.18) ? escolher(observacoes) : null,
                ativo: true
            }, 'id_crianca');
            contar('criancas');
            for (const r of responsaveis) {
                await inserir('crianca_responsavel', { id_crianca: idCrianca, id_responsavel: r.id, responsavel_principal: r === principal });
                contar('crianca_responsavel');
            }
        }
    }
}

// ---------------------------------------------------------
// 8. Financeiro
// ---------------------------------------------------------
async function seedFinanceiro() {
    // Categorias que faltam para as despesas do dia a dia
    for (const nome of ['Despesas com Eventos', 'Ação Social', 'Missões', 'Pessoal']) {
        const existe = (await cliente.query('SELECT 1 FROM categorias_financeiras WHERE nome = $1', [nome])).rowCount;
        if (!existe) { await inserir('categorias_financeiras', { nome, tipo: 'DESPESA', ativo: true }); contar('categorias_financeiras'); }
    }
    const categoria = {};
    for (const r of (await cliente.query('SELECT id_categoria, nome, tipo FROM categorias_financeiras')).rows) {
        categoria[semAcento(r.nome).toLowerCase()] = r.id_categoria;
    }
    const cat = nome => {
        const id = categoria[semAcento(nome).toLowerCase()];
        if (!id) throw new Error(`Categoria financeira "${nome}" não encontrada.`);
        return id;
    };

    const fornecedores = {};
    const listaFornecedores = [
        ['energia', 'Energia Sul Distribuidora Ltda', 'Energia Sul', 'contato@energiasul.example.com'],
        ['agua', 'Águas do Planalto Serviços de Saneamento', 'Águas do Planalto', 'atendimento@aguasplanalto.example.com'],
        ['internet', 'NetCaminho Telecomunicações Ltda', 'NetCaminho', 'financeiro@netcaminho.example.com'],
        ['contabilidade', 'Silva & Associados Contabilidade', 'Silva Contábil', 'contato@silvacontabil.example.com'],
        ['limpeza', 'Limpeza Total Distribuidora Ltda', 'Limpeza Total', 'vendas@limpezatotal.example.com'],
        ['papelaria', 'Papelaria Central Canoinhas Ltda', 'Papelaria Central', 'pedidos@papelariacentral.example.com'],
        ['som', 'Som & Luz Manutenções Eletrônicas', 'Som & Luz', 'servicos@someluz.example.com'],
        ['jardim', 'Jardim Verde Paisagismo ME', 'Jardim Verde', 'jardimverde@example.com'],
        ['mercado', 'Supermercado Bom Preço Ltda', 'Bom Preço', 'compras@bompreco.example.com']
    ];
    for (const [chave, razao, fantasia, emailF] of listaFornecedores) {
        fornecedores[chave] = await inserir('fornecedores', {
            razao_social: razao,
            nome_fantasia: fantasia,
            cpf_cnpj: `${inteiro(10, 99)}.${inteiro(100, 999)}.${inteiro(100, 999)}/0001-${inteiro(10, 99)}`,
            telefone: `(47) 3${inteiro(600, 699)}-${inteiro(1000, 9999)}`,
            email: emailF,
            endereco: endereco(),
            ativo: true
        }, 'id_fornecedor');
        contar('fornecedores');
    }

    const formasRecebimento = ['PIX', 'PIX', 'PIX', 'Dinheiro', 'Dinheiro', 'Cartão de débito'];

    async function lancarConta({ descricao, tipo, valorConta, vencimento, categoriaNome, fornecedor, observacoes, pagarAtrasada, formaPagamento }) {
        const vencida = vencimento < HOJE;
        const paga = vencida && !pagarAtrasada;
        const dataPagamento = paga ? somarDias(vencimento, -inteiro(0, 4)) : null;
        const idConta = await inserir('contas', {
            descricao, tipo, valor: valorConta,
            data_vencimento: vencimento,
            data_pagamento: dataPagamento,
            status: paga ? 'PAGO' : 'PENDENTE',
            id_categoria: cat(categoriaNome),
            id_fornecedor: fornecedor ? fornecedores[fornecedor] : null,
            observacoes: observacoes || (pagarAtrasada && vencida ? 'Pagamento em atraso — verificar com o fornecedor' : null)
        }, 'id_conta');
        contar('contas');

        if (!paga) return;

        const idMov = await inserir('movimentacoes_financeiras', {
            data_movimentacao: dataPagamento,
            tipo: tipo === 'PAGAR' ? 'DESPESA' : 'RECEITA',
            descricao,
            valor: valorConta,
            id_categoria: cat(categoriaNome),
            id_conta: idConta,
            forma_pagamento: formaPagamento || (tipo === 'PAGAR' ? escolher(['Boleto', 'Boleto', 'PIX', 'Débito automático']) : 'PIX'),
            criado_em: `${dataPagamento} ${hora(inteiro(9, 17), inteiro(0, 59))}`
        }, 'id_movimentacao');
        contar('movimentacoes_financeiras');

        await inserir('documentos_financeiros', {
            id_movimentacao: idMov,
            id_conta: idConta,
            tipo_documento: tipo === 'RECEBER' ? 'Recibo' : fornecedor && ['som', 'contabilidade', 'jardim'].includes(fornecedor) ? 'Nota Fiscal de Serviço' : 'Boleto',
            numero_documento: tipo === 'RECEBER' ? `REC-${dataPagamento.replace(/-/g, '')}-${inteiro(100, 999)}` : String(inteiro(10000000, 99999999)),
            caminho_arquivo: null,
            data_documento: dataPagamento,
            observacoes: null,
            criado_em: `${dataPagamento} ${hora(inteiro(9, 17), inteiro(0, 59))}`
        });
        contar('documentos_financeiros');
    }

    // Contas mensais a pagar
    const mesInicio = deData(INICIO), mesFim = deData(FIM);
    let atrasadaLancada = false;
    for (let a = mesInicio.getUTCFullYear(), m = mesInicio.getUTCMonth(); a < mesFim.getUTCFullYear() || (a === mesFim.getUTCFullYear() && m <= mesFim.getUTCMonth()); m === 11 ? (a++, m = 0) : m++) {
        const nomeMes = new Date(Date.UTC(a, m, 1)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
        const verao = [11, 0, 1, 2].includes(m);
        const mensais = [
            { descricao: `Energia elétrica — ${nomeMes}`, valorConta: valor(verao ? 820 : 610, verao ? 1080 : 860), dia: 10, categoriaNome: 'Energia Elétrica', fornecedor: 'energia', formaPagamento: 'Débito automático' },
            { descricao: `Água e esgoto — ${nomeMes}`, valorConta: valor(140, 260), dia: 15, categoriaNome: 'Água', fornecedor: 'agua' },
            { descricao: `Internet fibra 500MB — ${nomeMes}`, valorConta: '199.90', dia: 20, categoriaNome: 'Serviços', fornecedor: 'internet', formaPagamento: 'Débito automático' },
            { descricao: `Honorários contábeis — ${nomeMes}`, valorConta: '850.00', dia: 5, categoriaNome: 'Serviços', fornecedor: 'contabilidade', formaPagamento: 'PIX' },
            { descricao: `Material de limpeza — ${nomeMes}`, valorConta: valor(220, 420), dia: 25, categoriaNome: 'Material de Limpeza', fornecedor: 'limpeza' },
            { descricao: `Jardinagem e roçada — ${nomeMes}`, valorConta: '280.00', dia: 28, categoriaNome: 'Manutenção', fornecedor: 'jardim', formaPagamento: 'PIX' },
            { descricao: `Cestas básicas — Ação Social ${nomeMes}`, valorConta: valor(600, 900), dia: 8, categoriaNome: 'Ação Social', fornecedor: 'mercado' },
            { descricao: `Oferta missionária — ${nomeMes}`, valorConta: '500.00', dia: 12, categoriaNome: 'Missões', fornecedor: null, formaPagamento: 'PIX' },
            { descricao: `Prebenda pastoral — ${nomeMes}`, valorConta: '6500.00', dia: 5, categoriaNome: 'Pessoal', fornecedor: null, formaPagamento: 'Transferência bancária' },
            { descricao: `Salário zeladoria — ${nomeMes}`, valorConta: '1950.00', dia: 5, categoriaNome: 'Pessoal', fornecedor: null, formaPagamento: 'Transferência bancária' },
            { descricao: `INSS e FGTS — ${nomeMes}`, valorConta: valor(780, 820), dia: 20, categoriaNome: 'Pessoal', fornecedor: null, formaPagamento: 'Boleto' }
        ];
        if (m % 2 === 0) mensais.push({ descricao: `Material de escritório — ${nomeMes}`, valorConta: valor(150, 380), dia: 18, categoriaNome: 'Material Administrativo', fornecedor: 'papelaria' });

        for (const conta of mensais) {
            const vencimento = dataNoMes(a, m, conta.dia);
            if (vencimento < INICIO || vencimento > FIM) continue;
            // Uma conta do mês passado ficou em aberto, para testar "contas atrasadas"
            const pagarAtrasada = !atrasadaLancada && conta.fornecedor === 'limpeza' && vencimento < HOJE && vencimento > somarDias(HOJE, -45);
            if (pagarAtrasada) atrasadaLancada = true;
            await lancarConta({ ...conta, tipo: 'PAGAR', vencimento, pagarAtrasada });
        }
    }

    // Manutenções avulsas
    const avulsas = [
        { descricao: 'Manutenção da mesa de som e microfones sem fio', valorConta: '1850.00', dias: 35, fornecedor: 'som' },
        { descricao: 'Limpeza e recarga do ar-condicionado do templo', valorConta: '680.00', dias: 90, fornecedor: 'som' },
        { descricao: 'Troca de lâmpadas e reparo elétrico da sala Kids', valorConta: '420.00', dias: 140, fornecedor: 'som' },
        { descricao: 'Reparo do telhado da sala de jovens', valorConta: '2350.00', dias: -12, fornecedor: null }
    ];
    for (const m of avulsas) {
        await lancarConta({ ...m, tipo: 'PAGAR', vencimento: somarDias(HOJE, -m.dias), categoriaNome: 'Manutenção', formaPagamento: 'PIX' });
    }

    // Eventos especiais: despesas e inscrições/vendas a receber
    for (const ev of eventos.filter(e => e.especial)) {
        if (ev.despesa === 'evento') {
            await lancarConta({ descricao: `Decoração e lanche — ${ev.nome}`, tipo: 'PAGAR', valorConta: valor(350, 1800), vencimento: somarDias(ev.data, -3), categoriaNome: 'Despesas com Eventos', fornecedor: 'mercado' });
        }
        if (ev.receita) {
            await lancarConta({ descricao: `Inscrições e vendas — ${ev.nome}`, tipo: 'RECEBER', valorConta: valor(ev.receita[0], ev.receita[1]), vencimento: ev.data, categoriaNome: 'Eventos', fornecedor: null });
        }
    }

    // Dízimos e ofertas de cada culto já realizado
    for (const ev of eventos.filter(e => e.culto && e.data <= HOJE)) {
        if (ev.data === HOJE && ev.inicio > hora(agora.getUTCHours(), agora.getUTCMinutes())) continue;
        const faixas = { manha: [[1600, 2800], [300, 750]], noite: [[700, 1300], [200, 500]], quarta: [[300, 700], [100, 300]], jovens: [[100, 350], [100, 300]], kids: [[0, 0], [80, 200]] }[ev.culto];

        const lancamentos = [];
        if (faixas[0][1] > 0) {
            const total = Number(valor(...faixas[0]));
            const pix = (total * (0.55 + aleatorio() * 0.2)).toFixed(2);
            lancamentos.push(['Dízimos', `Dízimos via PIX — ${ev.nome}`, pix, 'PIX']);
            lancamentos.push(['Dízimos', `Dízimos em envelope — ${ev.nome}`, (total - pix).toFixed(2), 'Dinheiro']);
        }
        const oferta = ev.nome === 'Culto de Santa Ceia' ? valor(faixas[1][0] * 1.4, faixas[1][1] * 1.5) : valor(...faixas[1]);
        lancamentos.push(['Ofertas', `Ofertas — ${ev.nome}`, oferta, escolher(formasRecebimento)]);

        for (const [categoriaNome, descricao, valorMov, forma] of lancamentos) {
            await inserir('movimentacoes_financeiras', {
                data_movimentacao: ev.data,
                tipo: 'RECEITA',
                descricao,
                valor: valorMov,
                id_categoria: cat(categoriaNome),
                id_conta: null,
                forma_pagamento: forma,
                observacoes: null,
                criado_em: `${ev.data} ${somarMinutos(ev.fim, inteiro(10, 50))}`
            });
            contar('movimentacoes_financeiras');
        }
    }

    // Doações avulsas (com recibo nas maiores)
    for (let d = INICIO; d <= HOJE; d = somarDias(d, inteiro(9, 20))) {
        const doacao = chance(.2) ? valor(1000, 3500) : valor(100, 800);
        const descricao = escolher(['Doação para a Ação Social', 'Doação de membro', 'Doação para reforma do templo', 'Doação para o ministério infantil', 'Doação anônima']);
        const idMov = await inserir('movimentacoes_financeiras', {
            data_movimentacao: d, tipo: 'RECEITA', descricao, valor: doacao,
            id_categoria: cat('Doações'), id_conta: null,
            forma_pagamento: escolher(['PIX', 'PIX', 'Transferência bancária', 'Dinheiro']),
            observacoes: null,
            criado_em: `${d} ${hora(inteiro(9, 20), inteiro(0, 59))}`
        }, 'id_movimentacao');
        contar('movimentacoes_financeiras');

        if (Number(doacao) >= 1000) {
            await inserir('documentos_financeiros', {
                id_movimentacao: idMov, id_conta: null, tipo_documento: 'Recibo de Doação',
                numero_documento: `DOA-${d.replace(/-/g, '')}-${inteiro(100, 999)}`,
                caminho_arquivo: null, data_documento: d, observacoes: null, criado_em: d
            });
            contar('documentos_financeiros');
        }
    }
}

// ---------------------------------------------------------
// 9. Configurações da igreja
// ---------------------------------------------------------
async function seedConfiguracoes() {
    const result = await cliente.query(
        `UPDATE configuracoes_igreja
         SET horario_principal = COALESCE(horario_principal, '09:00'),
             ultimo_backup = COALESCE(ultimo_backup, $1::date + TIME '03:00'),
             proximo_backup = COALESCE(proximo_backup, $1::date + 7 + TIME '03:00'),
             atualizado_em = CURRENT_TIMESTAMP`,
        [somarDias(HOJE, -1)]
    );
    contar('configuracoes_igreja (atualizada)', result.rowCount);
}

// ---------------------------------------------------------
// Execução
// ---------------------------------------------------------
(async () => {
    cliente = await pool.connect();
    try {
        const jaExecutado = await cliente.query("SELECT 1 FROM usuarios WHERE email = 'admin@novocaminho.org'");
        if (jaExecutado.rowCount) {
            console.log('O seed já foi executado neste banco (usuário admin@novocaminho.org existe). Nada foi alterado.');
            return;
        }

        console.log(`Gerando dados de ${formatarBR(INICIO)} até ${formatarBR(FIM)} (hoje: ${formatarBR(HOJE)})...`);
        await cliente.query('BEGIN');

        await corrigirTextosCorrompidos();
        await carregarCadastrosBase();
        await seedUsuarios();
        await seedMembros();
        await seedVisitantes();
        await seedVoluntarios();
        await seedEventosEEscalas();
        await seedPresenca();
        await seedCriancas();
        await seedFinanceiro();
        await seedConfiguracoes();

        await cliente.query('COMMIT');
        console.log('\nSeed concluído. Registros criados:');
        console.table(contador);
    } catch (error) {
        await cliente.query('ROLLBACK').catch(() => {});
        console.error('\nErro no seed — nenhuma alteração foi gravada:', error.message);
        process.exitCode = 1;
    } finally {
        cliente.release();
        await pool.end();
    }
})();
