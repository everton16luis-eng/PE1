// =========================================
// LEITOR DE QR CODE (câmera do celular ou do computador)
// Abre a câmera traseira num modal e devolve o texto do QR (ou null se
// cancelar). Usa o leitor do próprio navegador quando existe (Chrome no
// Android) e, nos demais (iPhone), o jsQR servido pelo próprio sistema.
// A câmera só funciona em endereço seguro (https ou localhost).
// =========================================

let carregandoJsQr = null;

function carregarJsQr() {
    if (window.jsQR) return Promise.resolve();
    if (!carregandoJsQr) {
        carregandoJsQr = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'vendor/jsQR.js';
            script.onload = resolve;
            script.onerror = () => { carregandoJsQr = null; reject(new Error('Não foi possível carregar o leitor de QR.')); };
            document.head.appendChild(script);
        });
    }
    return carregandoJsQr;
}

const cameraDisponivel = () => window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia);

function lerQrCode(titulo = 'Ler QR code') {
    return new Promise(resolve => {
        const { modal, fechar } = abrirModal(titulo, 'Aponte a câmera para o QR da etiqueta', `
            <div class="leitor-qr"><video playsinline muted></video><div class="leitor-mira" aria-hidden="true"></div></div>
            <p class="mensagem-lista leitor-situacao" role="status">Abrindo a câmera...</p>
            <div class="form-actions"><button type="button" class="btn-cancel" data-cancelar>Cancelar</button></div>`);
        modal.classList.add('modal-leitor');
        const video = modal.querySelector('video');
        const situacao = modal.querySelector('.leitor-situacao');
        let stream = null;
        let ativo = true;

        const terminar = valor => {
            if (!ativo) return;
            ativo = false;
            clearInterval(vigia);
            stream?.getTracks().forEach(trilha => trilha.stop());
            fechar();
            resolve(valor);
        };
        modal.querySelector('[data-cancelar]').addEventListener('click', () => terminar(null));
        // Fechou pelo X, por fora ou pelo Esc: desliga a câmera também
        const vigia = setInterval(() => { if (!document.body.contains(modal)) terminar(null); }, 300);

        if (!cameraDisponivel()) {
            situacao.textContent = 'A câmera só funciona com o endereço seguro do sistema (https). Digite o código impresso na etiqueta.';
            situacao.classList.add('erro');
            return;
        }

        (async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
            } catch (erro) {
                situacao.textContent = erro.name === 'NotAllowedError'
                    ? 'A câmera foi bloqueada. Libere o acesso à câmera para este site (cadeado ao lado do endereço) ou digite o código.'
                    : 'Não foi possível abrir a câmera. Digite o código impresso na etiqueta.';
                situacao.classList.add('erro');
                return;
            }
            if (!ativo) { stream.getTracks().forEach(t => t.stop()); return; }
            video.srcObject = stream;
            await video.play().catch(() => {});

            let detector = null;
            if ('BarcodeDetector' in window) {
                try {
                    const formatos = await BarcodeDetector.getSupportedFormats();
                    if (formatos.includes('qr_code')) detector = new BarcodeDetector({ formats: ['qr_code'] });
                } catch { detector = null; }
            }
            if (!detector) {
                try { await carregarJsQr(); } catch (erro) { situacao.textContent = erro.message; situacao.classList.add('erro'); return; }
            }
            situacao.textContent = 'Procurando o QR...';

            const canvas = document.createElement('canvas');
            const contexto = canvas.getContext('2d', { willReadFrequently: true });
            const procurar = async () => {
                if (!ativo) return;
                if (video.readyState >= 2 && video.videoWidth) {
                    try {
                        if (detector) {
                            const [achado] = await detector.detect(video);
                            if (achado?.rawValue) return terminar(achado.rawValue.trim());
                        } else {
                            // Imagem reduzida: leitura rápida também em celulares mais simples
                            const escala = Math.min(1, 640 / video.videoWidth);
                            canvas.width = Math.round(video.videoWidth * escala);
                            canvas.height = Math.round(video.videoHeight * escala);
                            contexto.drawImage(video, 0, 0, canvas.width, canvas.height);
                            const imagem = contexto.getImageData(0, 0, canvas.width, canvas.height);
                            const achado = window.jsQR(imagem.data, imagem.width, imagem.height, { inversionAttempts: 'dontInvert' });
                            if (achado?.data) return terminar(achado.data.trim());
                        }
                    } catch { /* quadro ruim: tenta o próximo */ }
                }
                setTimeout(procurar, 150);
            };
            procurar();
        })();
    });
}
