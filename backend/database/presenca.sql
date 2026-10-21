-- =========================================================
-- Tabelas usadas pela Lista de Presença (presencaModel.js)
-- Execute uma vez no banco igreja_sistema:
--   npm run db:presenca
-- =========================================================

-- Turmas disponíveis (ex.: Kids 2 a 4 anos, Next...)
CREATE TABLE IF NOT EXISTS public.cadastroturmas (
    id_turma SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL UNIQUE
);

-- Registro de entrada/saída de cada membro em uma turma, por data
CREATE TABLE IF NOT EXISTS public.turmas (
    id_registro SERIAL PRIMARY KEY,
    id_turma INTEGER NOT NULL REFERENCES public.cadastroturmas (id_turma),
    nome VARCHAR(150) NOT NULL,
    id_membro INTEGER NOT NULL REFERENCES public.membros (id_membro),
    data DATE NOT NULL DEFAULT CURRENT_DATE,
    hora_entrada TIME NOT NULL DEFAULT CURRENT_TIME,
    hora_saida TIME,
    CONSTRAINT uq_turmas_membro_data UNIQUE (id_turma, id_membro, data)
);

CREATE INDEX IF NOT EXISTS idx_turmas_data ON public.turmas (data);

-- Turmas iniciais (podem ser alteradas pela tela de presença)
INSERT INTO public.cadastroturmas (nome) VALUES
    ('Kids — 2 a 4 anos'),
    ('Kids — 5 a 8 anos'),
    ('Next')
ON CONFLICT (nome) DO NOTHING;
