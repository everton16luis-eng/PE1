-- =========================================================
-- Cadastro de pessoas: todo novo cadastro entra como VISITANTE.
-- O administrador promove a membro depois (o registro de visitante
-- é mantido como histórico e ligado ao membro criado).
--   npm run db:cadastro
-- Só acrescenta colunas (pode rodar mais de uma vez).
-- =========================================================

ALTER TABLE public.visitantes ADD COLUMN IF NOT EXISTS email VARCHAR(150);
ALTER TABLE public.visitantes ADD COLUMN IF NOT EXISTS data_nascimento DATE;
ALTER TABLE public.visitantes ADD COLUMN IF NOT EXISTS estado_civil VARCHAR(30);
ALTER TABLE public.visitantes ADD COLUMN IF NOT EXISTS endereco VARCHAR(255);

-- Preenchido quando o visitante é promovido a membro
ALTER TABLE public.visitantes ADD COLUMN IF NOT EXISTS id_membro INTEGER REFERENCES public.membros (id_membro);
ALTER TABLE public.visitantes ADD COLUMN IF NOT EXISTS promovido_em TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS uq_visitantes_id_membro ON public.visitantes (id_membro) WHERE id_membro IS NOT NULL;
