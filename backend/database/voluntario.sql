-- =========================================================
-- Ficha e portal do voluntário
--   npm run db:voluntario
-- Só acrescenta estruturas (pode rodar mais de uma vez).
-- =========================================================

-- Login ligado a um membro: é assim que o voluntário acessa o portal
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS id_membro INTEGER REFERENCES public.membros (id_membro);
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_id_membro ON public.usuarios (id_membro) WHERE id_membro IS NOT NULL;

-- Resposta do voluntário à escala: confirmar ou recusar (com motivo)
ALTER TABLE public.escala_participantes ADD COLUMN IF NOT EXISTS recusado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.escala_participantes ADD COLUMN IF NOT EXISTS motivo_recusa TEXT;
ALTER TABLE public.escala_participantes ADD COLUMN IF NOT EXISTS respondido_em TIMESTAMP;

-- Ausências informadas (férias, viagem, saúde...): o voluntário não deve ser escalado
CREATE TABLE IF NOT EXISTS public.voluntario_ausencias (
    id_ausencia SERIAL PRIMARY KEY,
    id_voluntario INTEGER NOT NULL REFERENCES public.voluntarios (id_voluntario) ON DELETE CASCADE,
    data_inicio DATE NOT NULL,
    data_fim DATE NOT NULL,
    motivo VARCHAR(200),
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_ausencia_periodo CHECK (data_fim >= data_inicio)
);

CREATE INDEX IF NOT EXISTS idx_ausencias_voluntario ON public.voluntario_ausencias (id_voluntario, data_inicio, data_fim);
CREATE INDEX IF NOT EXISTS idx_escala_participantes_voluntario ON public.escala_participantes (id_voluntario);
