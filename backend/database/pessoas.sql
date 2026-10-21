-- =========================================================
-- Base universal de pessoas
--   npm run db:pessoas
--
-- A tabela "membros" passa a ser o cadastro universal: TODA pessoa
-- (visitante, membro, criança, voluntário ou quem tem login) tem um
-- registro nela. Os setores apenas filtram essa base:
--   Participantes = todas as pessoas
--   Crianças      = pessoas com menos de 18 anos (pela data de nascimento)
--   Voluntários   = pessoas ativas e aptas ao voluntariado
--   Usuários      = pessoas com login de gestão
-- "classificacao" diz se a pessoa é visitante ou membro.
--
-- Não apaga pessoas nem muda identificadores: só acrescenta colunas,
-- cria os registros que faltavam na base e liga as tabelas a eles.
-- Pode rodar mais de uma vez.
-- =========================================================

COMMENT ON TABLE public.membros IS 'Cadastro universal de pessoas (visitantes e membros). Crianças, voluntários e logins apontam para cá.';

-- 1. Classificação (visitante ou membro) e data da primeira visita
ALTER TABLE public.membros ADD COLUMN IF NOT EXISTS classificacao VARCHAR(20) NOT NULL DEFAULT 'membro';
ALTER TABLE public.membros ADD COLUMN IF NOT EXISTS data_primeira_visita DATE;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_membros_classificacao') THEN
        ALTER TABLE public.membros ADD CONSTRAINT chk_membros_classificacao CHECK (classificacao IN ('visitante', 'membro'));
    END IF;
END $$;

-- 2. Visitantes entram na base universal como "visitante".
--    A tabela visitantes fica como histórico da visita, ligada à pessoa (id_membro).
DO $$
DECLARE
    v RECORD;
    nova INTEGER;
BEGIN
    FOR v IN SELECT * FROM public.visitantes WHERE id_membro IS NULL ORDER BY id_visitante LOOP
        INSERT INTO public.membros (nome_completo, data_nascimento, telefone, email, endereco, estado_civil, observacoes,
                                    ativo, apto_voluntario, voluntario, classificacao, data_primeira_visita, criado_em)
        VALUES (v.nome, v.data_nascimento, v.telefone, v.email, v.endereco, v.estado_civil, v.observacoes,
                TRUE, FALSE, FALSE, 'visitante', v.data_visita, COALESCE(v.criado_em, CURRENT_TIMESTAMP))
        RETURNING id_membro INTO nova;
        UPDATE public.visitantes SET id_membro = nova WHERE id_visitante = v.id_visitante;
    END LOOP;
END $$;

-- Membros que vieram de uma visita guardam a data da primeira visita
UPDATE public.membros m
SET data_primeira_visita = v.data_visita
FROM public.visitantes v
WHERE v.id_membro = m.id_membro AND m.data_primeira_visita IS NULL;

-- Ligação login ↔ visitante (versão anterior, não publicada) vira login ↔ pessoa
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'visitantes' AND column_name = 'id_usuario') THEN
        UPDATE public.usuarios u SET id_membro = v.id_membro
        FROM public.visitantes v
        WHERE v.id_usuario = u.id_usuario AND u.id_membro IS NULL;
        ALTER TABLE public.visitantes DROP COLUMN id_usuario;
    END IF;
END $$;

-- 3. Crianças: toda ficha infantil aponta para uma pessoa da base.
--    Nome e nascimento oficiais passam a ser os da pessoa (as colunas da ficha ficam como legado).
DO $$
DECLARE
    c RECORD;
    nova INTEGER;
BEGIN
    FOR c IN SELECT * FROM public.criancas WHERE id_membro IS NULL ORDER BY id_crianca LOOP
        INSERT INTO public.membros (nome_completo, data_nascimento, ativo, apto_voluntario, voluntario,
                                    classificacao, data_primeira_visita)
        VALUES (c.nome_completo, c.data_nascimento, COALESCE(c.ativo, TRUE), FALSE, FALSE,
                'visitante', c.data_cadastro)
        RETURNING id_membro INTO nova;
        UPDATE public.criancas SET id_membro = nova WHERE id_crianca = c.id_crianca;
    END LOOP;
END $$;

ALTER TABLE public.criancas ALTER COLUMN id_membro SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_criancas_id_membro ON public.criancas (id_membro);
ALTER TABLE public.criancas ALTER COLUMN nome_completo DROP NOT NULL;
ALTER TABLE public.criancas ALTER COLUMN data_nascimento DROP NOT NULL;
COMMENT ON COLUMN public.criancas.nome_completo IS 'Legado. O nome oficial está em membros (base universal).';
COMMENT ON COLUMN public.criancas.data_nascimento IS 'Legado. A data oficial está em membros (base universal).';

-- 4. Todo login pertence a uma pessoa da base (criada como visitante quando faltava).
--    Ter um cadastro não cria login; ter um login exige um cadastro.
DO $$
DECLARE
    u RECORD;
    nova INTEGER;
BEGIN
    FOR u IN SELECT * FROM public.usuarios WHERE id_membro IS NULL ORDER BY id_usuario LOOP
        INSERT INTO public.membros (nome_completo, telefone, email, ativo, apto_voluntario, voluntario,
                                    classificacao, data_primeira_visita, observacoes)
        VALUES (u.nome, u.telefone, u.email, TRUE, FALSE, FALSE,
                'visitante', COALESCE(u.criado_em::date, CURRENT_DATE), 'Cadastro criado a partir da conta de acesso')
        RETURNING id_membro INTO nova;
        UPDATE public.usuarios SET id_membro = nova WHERE id_usuario = u.id_usuario;
    END LOOP;
END $$;

ALTER TABLE public.usuarios ALTER COLUMN id_membro SET NOT NULL;

-- 5. Índices para os filtros dos setores
CREATE INDEX IF NOT EXISTS idx_membros_classificacao ON public.membros (classificacao);
CREATE INDEX IF NOT EXISTS idx_membros_nascimento ON public.membros (data_nascimento);
CREATE INDEX IF NOT EXISTS idx_membros_ativo_apto ON public.membros (ativo, apto_voluntario);

-- 6. Visões de resumo contam pela classificação da base universal
CREATE OR REPLACE VIEW public.vw_resumo_pessoas AS
SELECT (SELECT count(*) FROM public.membros WHERE classificacao = 'visitante') AS total_visitantes,
       (SELECT count(*) FROM public.membros WHERE classificacao = 'membro') AS total_membros,
       (SELECT count(*) FROM public.membros) AS total_pessoas,
       (SELECT count(*) FROM public.membros
        WHERE classificacao = 'visitante'
          AND date_trunc('month', data_primeira_visita) = date_trunc('month', CURRENT_DATE)) AS novos_visitantes_mes;

CREATE OR REPLACE VIEW public.vw_dashboard AS
SELECT (SELECT count(*) FROM public.membros WHERE classificacao = 'visitante') AS total_visitantes,
       (SELECT count(*) FROM public.membros WHERE classificacao = 'membro') AS total_membros,
       (SELECT count(*) FROM public.membros WHERE ativo AND apto_voluntario) AS total_voluntarios,
       (SELECT count(*) FROM public.escalas e
        JOIN public.eventos ev ON ev.id_evento = e.id_evento
        WHERE ev.data_evento >= date_trunc('month', CURRENT_DATE::timestamp with time zone)
          AND ev.data_evento < (date_trunc('month', CURRENT_DATE::timestamp with time zone) + '1 mon'::interval)) AS total_escalas;
