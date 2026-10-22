// =========================================================
// Gerador de PDF simples, sem dependências externas (só o zlib do Node).
// Fontes padrão do PDF (Helvetica e Helvetica-Bold, codificação WinAnsi),
// suficientes para o português. Usado pelos relatórios guardados no servidor.
//
//   const pdf = new DocumentoPdf({ titulo, paisagem });
//   pdf.titulo('...'); pdf.paragrafo('...'); pdf.tabela(colunas, linhas);
//   const buffer = pdf.gerar();
// =========================================================

const zlib = require('zlib');

// Larguras da Helvetica (1/1000 do tamanho da fonte), caracteres 32 a 126
const LARGURAS = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
    1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
    333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];

// Caracteres fora do Latin-1 que existem na WinAnsi (código na tabela)
const WIN_ANSI = { '€': 0x80, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97 };
const LARGURA_ESPECIAL = { '…': 1000, '•': 350, '–': 556, '—': 1000, '“': 333, '”': 333, '‘': 222, '’': 222, '€': 556 };

// Texto → caracteres da WinAnsi (o que não existe vira "?")
function paraWinAnsi(texto) {
    return [...String(texto ?? '')].map(c => {
        const codigo = c.codePointAt(0);
        if (c === '\t') return ' ';
        if (codigo < 32) return '';
        if (codigo <= 126 || (codigo >= 160 && codigo <= 255)) return c;
        if (WIN_ANSI[c]) return String.fromCharCode(WIN_ANSI[c]);
        return '?';
    }).join('');
}

function larguraCaractere(c) {
    if (LARGURA_ESPECIAL[c]) return LARGURA_ESPECIAL[c];
    const base = c.normalize('NFD')[0];
    const codigo = base.charCodeAt(0);
    return codigo >= 32 && codigo <= 126 ? LARGURAS[codigo - 32] : 556;
}

function larguraTexto(texto, tamanho, negrito = false) {
    const total = [...String(texto ?? '')].reduce((soma, c) => soma + larguraCaractere(c), 0);
    return (total * tamanho / 1000) * (negrito ? 1.07 : 1);
}

// Quebra o texto em linhas que cabem na largura (palavras longas são cortadas)
function quebrarTexto(texto, largura, tamanho, negrito = false) {
    const linhas = [];
    for (const paragrafo of String(texto ?? '').split(/\r?\n/)) {
        let atual = '';
        for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
            const tentativa = atual ? `${atual} ${palavra}` : palavra;
            if (larguraTexto(tentativa, tamanho, negrito) <= largura) {
                atual = tentativa;
                continue;
            }
            if (atual) linhas.push(atual);
            atual = palavra;
            while (larguraTexto(atual, tamanho, negrito) > largura && atual.length > 1) {
                let corte = atual.length - 1;
                while (corte > 1 && larguraTexto(atual.slice(0, corte), tamanho, negrito) > largura) corte--;
                linhas.push(atual.slice(0, corte));
                atual = atual.slice(corte);
            }
        }
        linhas.push(atual);
    }
    return linhas.length ? linhas : [''];
}

const escaparPdf = texto => paraWinAnsi(texto).replace(/[\\()]/g, c => '\\' + c);
const cor = hex => [1, 3, 5].map(i => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3)).join(' ');

// Cores pensadas para IMPRESSÃO: tons claros (cinza #78849a, linhas #ddd)
// ficavam apagados no papel, sobretudo em impressora a laser e em P&B.
// Texto em preto, apoio em cinza-escuro e linhas/fundos visíveis.
const CORES = {
    texto: '#000000',     // conteúdo principal
    suave: '#333d4d',     // rótulos, período, observações e rodapé
    destaque: '#7a4528',  // terracota escurecida (títulos e números)
    linha: '#8a94a6',     // divisórias da tabela
    fundo: '#e4e8ee'      // cabeçalho da tabela e cartões de resumo
};

class DocumentoPdf {
    constructor({ titulo = 'Relatório', autor = '', paisagem = false, rodape = '' } = {}) {
        this.largura = paisagem ? 842 : 595;
        this.altura = paisagem ? 595 : 842;
        this.margem = 40;
        this.info = { titulo, autor };
        this.rodapeTexto = rodape;
        this.paginas = [];
        this.novaPagina();
    }

    get larguraUtil() { return this.largura - this.margem * 2; }

    novaPagina() {
        this.atual = [];
        this.paginas.push(this.atual);
        this.y = this.altura - this.margem;
    }

    // Garante espaço vertical; senão, começa outra página
    espaco(altura) {
        if (this.y - altura < this.margem + 24) {
            this.novaPagina();
            return true;
        }
        return false;
    }

    textoEm(x, y, texto, { tamanho = 10, negrito = false, corTexto = CORES.texto } = {}) {
        this.atual.push(`BT /${negrito ? 'F2' : 'F1'} ${tamanho} Tf ${cor(corTexto)} rg ${x.toFixed(2)} ${y.toFixed(2)} Td (${escaparPdf(texto)}) Tj ET`);
    }

    retangulo(x, y, largura, altura, corFundo) {
        this.atual.push(`${cor(corFundo)} rg ${x.toFixed(2)} ${y.toFixed(2)} ${largura.toFixed(2)} ${altura.toFixed(2)} re f`);
    }

    linhaHorizontal(y, { corLinha = CORES.linha, espessura = 0.6 } = {}) {
        this.atual.push(`${cor(corLinha)} RG ${espessura} w ${this.margem} ${y.toFixed(2)} m ${this.largura - this.margem} ${y.toFixed(2)} l S`);
    }

    // Parágrafo com quebra automática de linha e de página
    paragrafo(texto, { tamanho = 10, negrito = false, corTexto = CORES.texto, recuo = 0, depois = 4 } = {}) {
        const altura = tamanho * 1.35;
        for (const linha of quebrarTexto(texto, this.larguraUtil - recuo, tamanho, negrito)) {
            this.espaco(altura);
            this.y -= altura;
            this.textoEm(this.margem + recuo, this.y + tamanho * 0.25, linha, { tamanho, negrito, corTexto });
        }
        this.y -= depois;
    }

    titulo(texto, tamanho = 18) {
        this.paragrafo(texto, { tamanho, negrito: true, depois: 2 });
    }

    secao(texto) {
        this.espaco(40);
        this.y -= 10;
        this.paragrafo(texto, { tamanho: 13, negrito: true, corTexto: CORES.destaque, depois: 2 });
        this.linhaHorizontal(this.y, { corLinha: CORES.destaque, espessura: 0.8 });
        this.y -= 8;
    }

    // Cabeçalho da igreja (nome + sistema + linha)
    cabecalho(nomeIgreja) {
        this.paragrafo(nomeIgreja, { tamanho: 14, negrito: true, depois: 0 });
        this.paragrafo('Sistema de Gestão da Igreja', { tamanho: 9, corTexto: CORES.suave, depois: 4 });
        this.linhaHorizontal(this.y, { corLinha: CORES.destaque, espessura: 1.5 });
        this.y -= 12;
    }

    // Caixas de números lado a lado: [[valor, rótulo], ...]
    numeros(itens, porLinha = 4) {
        const espaco = 8;
        const largura = (this.larguraUtil - espaco * (porLinha - 1)) / porLinha;
        const altura = 40;
        for (let i = 0; i < itens.length; i += porLinha) {
            this.espaco(altura + espaco);
            const topo = this.y;
            itens.slice(i, i + porLinha).forEach(([valor, rotulo], j) => {
                const x = this.margem + j * (largura + espaco);
                this.retangulo(x, topo - altura, largura, altura, CORES.fundo);
                this.textoEm(x + 8, topo - 18, String(valor), { tamanho: 14, negrito: true, corTexto: CORES.destaque });
                this.textoEm(x + 8, topo - 32, quebrarTexto(rotulo, largura - 12, 8)[0], { tamanho: 8, corTexto: CORES.suave });
            });
            this.y = topo - altura - espaco;
        }
    }

    // Lista "Rótulo: valor"
    campos(pares) {
        const larguraRotulo = 150;
        for (const [rotulo, valor] of pares) {
            const linhas = quebrarTexto(valor, this.larguraUtil - larguraRotulo, 10);
            const altura = linhas.length * 13.5 + 2;
            this.espaco(altura);
            this.textoEm(this.margem, this.y - 11, rotulo, { tamanho: 10, negrito: true, corTexto: CORES.suave });
            linhas.forEach((linha, i) => this.textoEm(this.margem + larguraRotulo, this.y - 11 - i * 13.5, linha, { tamanho: 10 }));
            this.y -= altura;
        }
        this.y -= 4;
    }

    // Tabela com cabeçalho repetido a cada página.
    // colunas: [{ titulo, peso }] (peso = proporção da largura); linhas: [[texto, ...]]
    tabela(colunas, linhas, { tamanho = 9, vazio = 'Nenhum registro.' } = {}) {
        const pesoTotal = colunas.reduce((soma, c) => soma + (c.peso || 1), 0);
        const larguras = colunas.map(c => this.larguraUtil * (c.peso || 1) / pesoTotal);
        const altLinha = tamanho * 1.3;
        const desenharCabecalho = () => {
            const linhasTitulo = colunas.map((c, i) => quebrarTexto(c.titulo, larguras[i] - 6, tamanho, true));
            const altura = Math.max(...linhasTitulo.map(l => l.length)) * altLinha + 6;
            this.espaco(altura + altLinha + 6);
            this.retangulo(this.margem, this.y - altura, this.larguraUtil, altura, CORES.fundo);
            let x = this.margem;
            linhasTitulo.forEach((ls, i) => {
                ls.forEach((l, k) => this.textoEm(x + 3, this.y - 4 - (k + 1) * altLinha + tamanho * 0.3, l, { tamanho, negrito: true }));
                x += larguras[i];
            });
            this.y -= altura;
            // Linha firme separando o cabeçalho do conteúdo (visível mesmo se o fundo não sair na impressão)
            this.linhaHorizontal(this.y, { corLinha: CORES.texto, espessura: 0.8 });
        };

        desenharCabecalho();
        if (!linhas.length) {
            this.paragrafo(vazio, { tamanho, corTexto: CORES.suave, recuo: 3 });
            return;
        }
        for (const linha of linhas) {
            const celulas = linha.map((valor, i) => quebrarTexto(valor ?? '', larguras[i] - 6, tamanho));
            const altura = Math.max(...celulas.map(c => c.length)) * altLinha + 5;
            if (this.espaco(altura)) desenharCabecalho();
            let x = this.margem;
            celulas.forEach((ls, i) => {
                ls.forEach((l, k) => this.textoEm(x + 3, this.y - 3 - (k + 1) * altLinha + tamanho * 0.3, l, { tamanho }));
                x += larguras[i];
            });
            this.y -= altura;
            this.linhaHorizontal(this.y, { espessura: 0.6 });
        }
        this.y -= 6;
    }

    // Monta o arquivo PDF (com "Página X de Y" e o rodapé em todas as páginas)
    gerar() {
        const total = this.paginas.length;
        this.paginas.forEach((conteudo, i) => {
            const texto = `${this.rodapeTexto ? this.rodapeTexto + '  •  ' : ''}Página ${i + 1} de ${total}`;
            const x = (this.largura - larguraTexto(texto, 8)) / 2;
            conteudo.push(`BT /F1 8 Tf ${cor(CORES.suave)} rg ${x.toFixed(2)} ${(this.margem / 2).toFixed(2)} Td (${escaparPdf(texto)}) Tj ET`);
        });

        const objetos = [];
        const adicionar = conteudo => { objetos.push(conteudo); return objetos.length; };
        const catalogo = adicionar(null);
        const paginasObj = adicionar(null);
        const fonte = adicionar('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
        const fonteNegrito = adicionar('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
        const agora = new Date();
        const dataPdf = `D:${agora.getFullYear()}${String(agora.getMonth() + 1).padStart(2, '0')}${String(agora.getDate()).padStart(2, '0')}`
            + `${String(agora.getHours()).padStart(2, '0')}${String(agora.getMinutes()).padStart(2, '0')}${String(agora.getSeconds()).padStart(2, '0')}`;
        const info = adicionar(`<< /Title (${escaparPdf(this.info.titulo)}) /Author (${escaparPdf(this.info.autor)}) /Producer (Sistema de Gestao da Igreja) /CreationDate (${dataPdf}) >>`);

        const idsPaginas = this.paginas.map(conteudo => {
            const dados = zlib.deflateSync(Buffer.from(conteudo.join('\n'), 'latin1'));
            const fluxo = adicionar({ dicionario: `<< /Length ${dados.length} /Filter /FlateDecode >>`, dados });
            return adicionar(`<< /Type /Page /Parent ${paginasObj} 0 R /MediaBox [0 0 ${this.largura} ${this.altura}] `
                + `/Resources << /Font << /F1 ${fonte} 0 R /F2 ${fonteNegrito} 0 R >> >> /Contents ${fluxo} 0 R >>`);
        });
        objetos[catalogo - 1] = `<< /Type /Catalog /Pages ${paginasObj} 0 R >>`;
        objetos[paginasObj - 1] = `<< /Type /Pages /Kids [${idsPaginas.map(id => `${id} 0 R`).join(' ')}] /Count ${idsPaginas.length} >>`;

        const partes = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
        let posicao = partes[0].length;
        const offsets = [];
        objetos.forEach((obj, i) => {
            offsets.push(posicao);
            const pedacos = typeof obj === 'string'
                ? [Buffer.from(`${i + 1} 0 obj\n${obj}\nendobj\n`, 'latin1')]
                : [Buffer.from(`${i + 1} 0 obj\n${obj.dicionario}\nstream\n`, 'latin1'), obj.dados, Buffer.from('\nendstream\nendobj\n', 'latin1')];
            pedacos.forEach(p => { partes.push(p); posicao += p.length; });
        });
        const xref = [`xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`,
            ...offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`),
            `trailer\n<< /Size ${objetos.length + 1} /Root ${catalogo} 0 R /Info ${info} 0 R >>\nstartxref\n${posicao}\n%%EOF\n`].join('');
        partes.push(Buffer.from(xref, 'latin1'));
        return Buffer.concat(partes);
    }
}

module.exports = { DocumentoPdf, quebrarTexto, larguraTexto, CORES };
