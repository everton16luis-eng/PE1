-- =========================================================
-- Atendimento das turmas (recepção das crianças)
--
-- cadastroturmas  = a turma permanente (NEXT, Kids...)        [já existia]
-- turma_sessoes   = um atendimento da turma num evento (abre e encerra)
-- turma_atendimentos = entrada e saída de cada criança numa sessão
-- turma_codigos   = código das etiquetas (criança + responsável), um por atendimento
-- turma_auditoria = tudo o que aconteceu (quem, quando, o quê)
-- turma_alertas   = sessão encerrada automaticamente (turma esquecida)
--
-- Só acrescenta estruturas; pode rodar mais de uma vez.
-- =========================================================

-- Quem pode buscar a criança. Ninguém fica autorizado sozinho: a equipe marca.
ALTER TABLE public.crianca_responsavel
    ADD COLUMN IF NOT EXISTS autorizado_retirada boolean NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS autorizacao_atualizada_em timestamptz,
    ADD COLUMN IF NOT EXISTS autorizacao_atualizada_por integer REFERENCES public.usuarios (id_usuario) ON DELETE SET NULL;

-- Voluntários que operam a turma (além do responsável principal do cadastro da turma)
CREATE TABLE IF NOT EXISTS public.turma_voluntarios (
    id_turma integer NOT NULL REFERENCES public.cadastroturmas (id_turma) ON DELETE CASCADE,
    id_voluntario integer NOT NULL REFERENCES public.voluntarios (id_voluntario) ON DELETE CASCADE,
    vinculado_em timestamptz NOT NULL DEFAULT now(),
    vinculado_por integer REFERENCES public.usuarios (id_usuario) ON DELETE SET NULL,
    PRIMARY KEY (id_turma, id_voluntario)
);

-- Janela de cada evento no fuso da igreja: início, fim (o fim antes do início
-- significa que o evento passa da meia-noite) e o limite diário (23h59 do dia).
-- Sem horário de término, o evento vale até as 23h59.
CREATE OR REPLACE VIEW public.vw_eventos_janela AS
SELECT e.id_evento, e.nome, e.data_evento, e.hora_inicio, e.hora_fim,
       ((e.data_evento + COALESCE(e.hora_inicio, TIME '00:00')) AT TIME ZONE z.fuso) AS inicio_em,
       ((e.data_evento + COALESCE(e.hora_fim, TIME '23:59')
         + CASE WHEN e.hora_inicio IS NOT NULL AND e.hora_fim IS NOT NULL AND e.hora_fim <= e.hora_inicio
                THEN INTERVAL '1 day' ELSE INTERVAL '0' END) AT TIME ZONE z.fuso) AS fim_em,
       ((e.data_evento + TIME '23:59') AT TIME ZONE z.fuso) AS limite_diario_em
FROM public.eventos e
CROSS JOIN (SELECT COALESCE((SELECT fuso_horario FROM public.configuracoes_igreja ORDER BY id LIMIT 1), 'America/Sao_Paulo') AS fuso) z;

-- Sessão = a turma aberta para um evento
CREATE TABLE IF NOT EXISTS public.turma_sessoes (
    id_sessao serial PRIMARY KEY,
    id_turma integer NOT NULL REFERENCES public.cadastroturmas (id_turma) ON DELETE RESTRICT,
    id_evento integer NOT NULL REFERENCES public.eventos (id_evento) ON DELETE RESTRICT,
    status varchar(10) NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'encerrada')),
    aberta_em timestamptz NOT NULL DEFAULT now(),
    aberta_por integer NOT NULL REFERENCES public.usuarios (id_usuario) ON DELETE RESTRICT,
    encerrada_em timestamptz,
    encerrada_por integer REFERENCES public.usuarios (id_usuario) ON DELETE SET NULL,
    processada_em timestamptz,
    tipo_encerramento varchar(30)
        CHECK (tipo_encerramento IN ('manual', 'administrativo', 'automatico_limite_diario', 'automatico_fim_evento')),
    motivo_encerramento text,
    CHECK ((status = 'aberta') = (encerrada_em IS NULL)),
    CHECK ((status = 'aberta') = (tipo_encerramento IS NULL))
);
-- Uma sessão aberta por turma, e uma sessão por turma em cada evento
CREATE UNIQUE INDEX IF NOT EXISTS uq_turma_sessao_aberta ON public.turma_sessoes (id_turma) WHERE status = 'aberta';
CREATE UNIQUE INDEX IF NOT EXISTS uq_turma_sessao_evento ON public.turma_sessoes (id_turma, id_evento);

-- Entrada e saída de cada criança. Voltou depois de sair = novo registro.
CREATE TABLE IF NOT EXISTS public.turma_atendimentos (
    id_atendimento serial PRIMARY KEY,
    id_sessao integer NOT NULL REFERENCES public.turma_sessoes (id_sessao) ON DELETE RESTRICT,
    id_crianca integer NOT NULL REFERENCES public.criancas (id_crianca) ON DELETE RESTRICT,
    entrada_em timestamptz NOT NULL DEFAULT now(),
    entrada_por integer NOT NULL REFERENCES public.usuarios (id_usuario) ON DELETE RESTRICT,
    saida_em timestamptz,
    saida_por integer REFERENCES public.usuarios (id_usuario) ON DELETE SET NULL,
    -- manual = voluntário conferiu a etiqueta; automatica = encerramento automático (não é entrega
    -- conferida); administrativa = sessão encerrada pela administração
    tipo_saida varchar(15) CHECK (tipo_saida IN ('manual', 'automatica', 'administrativa')),
    id_responsavel_retirada integer REFERENCES public.responsaveis (id_responsavel) ON DELETE SET NULL,
    CHECK ((saida_em IS NULL) = (tipo_saida IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_atendimento_presente ON public.turma_atendimentos (id_sessao, id_crianca) WHERE saida_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_atendimentos_sessao ON public.turma_atendimentos (id_sessao);

-- Código das etiquetas: curto (para ler) + token aleatório (QR). Vale só para
-- aquele atendimento; usado, substituído (2ª via) ou encerrado, nunca volta a valer.
CREATE TABLE IF NOT EXISTS public.turma_codigos (
    id_codigo serial PRIMARY KEY,
    id_atendimento integer NOT NULL REFERENCES public.turma_atendimentos (id_atendimento) ON DELETE RESTRICT,
    id_sessao integer NOT NULL REFERENCES public.turma_sessoes (id_sessao) ON DELETE RESTRICT,
    codigo varchar(8) NOT NULL,
    token varchar(64) NOT NULL UNIQUE,
    id_responsavel integer REFERENCES public.responsaveis (id_responsavel) ON DELETE SET NULL,
    status varchar(12) NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'utilizado', 'invalidado')),
    emitido_em timestamptz NOT NULL DEFAULT now(),
    emitido_por integer NOT NULL REFERENCES public.usuarios (id_usuario) ON DELETE RESTRICT,
    segunda_via_de integer REFERENCES public.turma_codigos (id_codigo),
    motivo_emissao text,
    utilizado_em timestamptz,
    utilizado_por integer REFERENCES public.usuarios (id_usuario) ON DELETE SET NULL,
    invalidado_em timestamptz,
    invalidado_por integer REFERENCES public.usuarios (id_usuario) ON DELETE SET NULL,
    motivo_invalidacao text,
    UNIQUE (id_sessao, codigo)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_codigo_ativo ON public.turma_codigos (id_atendimento) WHERE status = 'ativo';

-- Dois códigos vinculados no mesmo registro:
--   codigo / token_crianca     = etiqueta da CRIANÇA (fica exposta): só identifica, nunca retira
--   codigo_retirada / token    = etiqueta do RESPONSÁVEL: o único aceito na saída
ALTER TABLE public.turma_codigos
    ADD COLUMN IF NOT EXISTS codigo_retirada varchar(8),
    ADD COLUMN IF NOT EXISTS token_crianca varchar(64);
-- Etiquetas do formato antigo (um código só nas duas) deixam de valer
UPDATE public.turma_codigos
   SET status = 'invalidado', invalidado_em = now(), motivo_invalidacao = 'etiqueta do formato antigo (mesmo código nas duas etiquetas)'
 WHERE codigo_retirada IS NULL AND status = 'ativo';
UPDATE public.turma_codigos SET codigo_retirada = codigo, token_crianca = token || '-c' WHERE codigo_retirada IS NULL;
ALTER TABLE public.turma_codigos ALTER COLUMN codigo_retirada SET NOT NULL, ALTER COLUMN token_crianca SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_codigo_retirada_sessao ON public.turma_codigos (id_sessao, codigo_retirada);
CREATE UNIQUE INDEX IF NOT EXISTS uq_token_crianca ON public.turma_codigos (token_crianca);

-- Histórico de tudo (aberturas, entradas, saídas, etiquetas, tentativas recusadas, encerramentos)
CREATE TABLE IF NOT EXISTS public.turma_auditoria (
    id_registro serial PRIMARY KEY,
    id_sessao integer REFERENCES public.turma_sessoes (id_sessao) ON DELETE RESTRICT,
    id_atendimento integer REFERENCES public.turma_atendimentos (id_atendimento) ON DELETE RESTRICT,
    id_codigo integer REFERENCES public.turma_codigos (id_codigo) ON DELETE RESTRICT,
    acao varchar(40) NOT NULL,
    detalhe text,
    id_usuario integer REFERENCES public.usuarios (id_usuario) ON DELETE SET NULL,
    automatico boolean NOT NULL DEFAULT FALSE,
    criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_turma_auditoria_sessao ON public.turma_auditoria (id_sessao, criado_em);

-- Turma esquecida: um alerta por sessão encerrada automaticamente
CREATE TABLE IF NOT EXISTS public.turma_alertas (
    id_alerta serial PRIMARY KEY,
    id_sessao integer NOT NULL UNIQUE REFERENCES public.turma_sessoes (id_sessao) ON DELETE RESTRICT,
    motivo varchar(30) NOT NULL CHECK (motivo IN ('limite_diario', 'fim_evento', 'sessao_abandonada')),
    prioritario boolean NOT NULL DEFAULT FALSE,
    presentes_no_encerramento integer NOT NULL DEFAULT 0,
    saidas_regularizadas integer NOT NULL DEFAULT 0,
    deveria_encerrar_em timestamptz NOT NULL,
    encerrada_em timestamptz NOT NULL,
    processada_em timestamptz NOT NULL DEFAULT now(),
    status varchar(10) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'tratado')),
    tratado_por integer REFERENCES public.usuarios (id_usuario) ON DELETE SET NULL,
    tratado_em timestamptz,
    observacao_tratamento text,
    criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_turma_alertas_status ON public.turma_alertas (status, criado_em DESC);
