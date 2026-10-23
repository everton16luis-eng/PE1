-- =========================================================
-- Notificações
--   npm run db:notificacoes
--
-- notificacoes      → central de avisos de cada login (o sininho)
-- push_inscricoes   → aparelhos que ativaram as notificações no celular
--                     ou no computador (Web Push, sem aplicativo)
-- avisos_enviados   → controle para lembretes automáticos não serem
--                     enviados duas vezes (ex.: véspera da escala)
-- Só cria tabelas (pode rodar mais de uma vez).
-- =========================================================

CREATE TABLE IF NOT EXISTS public.notificacoes (
    id_notificacao SERIAL PRIMARY KEY,
    id_usuario INTEGER NOT NULL REFERENCES public.usuarios (id_usuario) ON DELETE CASCADE,
    tipo VARCHAR(40) NOT NULL,
    titulo VARCHAR(150) NOT NULL,
    mensagem VARCHAR(500) NOT NULL,
    -- Tela do sistema que abre ao tocar (ex.: "minha-area", "escalas")
    rota VARCHAR(80),
    lida BOOLEAN NOT NULL DEFAULT FALSE,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notificacoes_usuario ON public.notificacoes (id_usuario, lida, criado_em DESC);

CREATE TABLE IF NOT EXISTS public.push_inscricoes (
    id_inscricao SERIAL PRIMARY KEY,
    id_usuario INTEGER NOT NULL REFERENCES public.usuarios (id_usuario) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh VARCHAR(200) NOT NULL,
    auth VARCHAR(100) NOT NULL,
    aparelho VARCHAR(200),
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ultimo_envio TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_push_inscricoes_usuario ON public.push_inscricoes (id_usuario);

CREATE TABLE IF NOT EXISTS public.avisos_enviados (
    chave VARCHAR(120) PRIMARY KEY,
    enviado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
