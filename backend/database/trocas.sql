-- =========================================================
-- Histórico de trocas de vaga nas escalas
--   npm run db:trocas
--
-- O voluntário pode passar a própria vaga para outro voluntário
-- (combinado entre eles), sem depender da equipe. A troca usa a
-- mesma linha de escala_participantes; aqui fica registrado quem
-- saiu, quem entrou, quando e quem fez (o próprio voluntário ou a
-- equipe), para a liderança acompanhar.
-- Só cria a tabela (pode rodar mais de uma vez).
-- =========================================================

CREATE TABLE IF NOT EXISTS public.escala_trocas (
    id_troca SERIAL PRIMARY KEY,
    id_escala INTEGER NOT NULL REFERENCES public.escalas (id_escala) ON DELETE CASCADE,
    id_voluntario_saiu INTEGER NOT NULL REFERENCES public.voluntarios (id_voluntario) ON DELETE CASCADE,
    id_voluntario_entrou INTEGER NOT NULL REFERENCES public.voluntarios (id_voluntario) ON DELETE CASCADE,
    feita_por VARCHAR(20) NOT NULL CHECK (feita_por IN ('voluntario', 'equipe')),
    id_usuario INTEGER REFERENCES public.usuarios (id_usuario) ON DELETE SET NULL,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_escala_trocas_escala ON public.escala_trocas (id_escala);
CREATE INDEX IF NOT EXISTS idx_escala_trocas_entrou ON public.escala_trocas (id_voluntario_entrou);
