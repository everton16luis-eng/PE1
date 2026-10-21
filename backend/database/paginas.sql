-- =========================================================
-- Estrutura usada pelas páginas: Participantes, Voluntários,
-- Funções, Escalas, Crianças/Turmas, Usuários/Login,
-- Configurações e Relatórios.
--
-- Só ACRESCENTA colunas/tabelas (pode rodar mais de uma vez).
--   npm run db:paginas
-- =========================================================

-- ---------------------------------------------------------
-- Participantes (membros)
-- ---------------------------------------------------------
ALTER TABLE public.membros ADD COLUMN IF NOT EXISTS participa_celula BOOLEAN;
ALTER TABLE public.membros ADD COLUMN IF NOT EXISTS observacoes TEXT;

-- ---------------------------------------------------------
-- Voluntários: dias disponíveis e observações
-- ---------------------------------------------------------
ALTER TABLE public.voluntarios ADD COLUMN IF NOT EXISTS disponibilidade VARCHAR(10)[] NOT NULL DEFAULT '{}';
ALTER TABLE public.voluntarios ADD COLUMN IF NOT EXISTS observacoes TEXT;

-- ---------------------------------------------------------
-- Funções: tamanho da equipe, dias em que é usada e observações
-- (qtd_voluntarios continua sendo "voluntários por escala")
-- ---------------------------------------------------------
ALTER TABLE public.funcoes ADD COLUMN IF NOT EXISTS vagas INTEGER CHECK (vagas IS NULL OR vagas >= 0);
ALTER TABLE public.funcoes ADD COLUMN IF NOT EXISTS dias_disponiveis VARCHAR(10)[] NOT NULL DEFAULT '{}';
ALTER TABLE public.funcoes ADD COLUMN IF NOT EXISTS observacoes TEXT;

-- ---------------------------------------------------------
-- Turmas (cadastroturmas): faixa etária, responsável, dia e status
-- ---------------------------------------------------------
ALTER TABLE public.cadastroturmas ADD COLUMN IF NOT EXISTS idade_minima INTEGER;
ALTER TABLE public.cadastroturmas ADD COLUMN IF NOT EXISTS idade_maxima INTEGER;
ALTER TABLE public.cadastroturmas ADD COLUMN IF NOT EXISTS id_membro_responsavel INTEGER REFERENCES public.membros (id_membro);
ALTER TABLE public.cadastroturmas ADD COLUMN IF NOT EXISTS dia_semana VARCHAR(20) NOT NULL DEFAULT 'Domingo';
ALTER TABLE public.cadastroturmas ADD COLUMN IF NOT EXISTS horario TIME NOT NULL DEFAULT '09:00';
ALTER TABLE public.cadastroturmas ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.cadastroturmas ADD COLUMN IF NOT EXISTS observacoes TEXT;

UPDATE public.cadastroturmas SET idade_minima = 2,  idade_maxima = 4  WHERE nome = 'Kids — 2 a 4 anos' AND idade_minima IS NULL;
UPDATE public.cadastroturmas SET idade_minima = 5,  idade_maxima = 8  WHERE nome = 'Kids — 5 a 8 anos' AND idade_minima IS NULL;
UPDATE public.cadastroturmas SET idade_minima = 9,  idade_maxima = 12 WHERE nome = 'Next' AND idade_minima IS NULL;
UPDATE public.cadastroturmas SET idade_minima = 13, idade_maxima = 17 WHERE nome = 'Adolescentes — 13 a 17 anos' AND idade_minima IS NULL;

-- ---------------------------------------------------------
-- Crianças: vínculo com o membro (para a presença), turma e autorizações
-- ---------------------------------------------------------
ALTER TABLE public.criancas ADD COLUMN IF NOT EXISTS id_membro INTEGER REFERENCES public.membros (id_membro);
ALTER TABLE public.criancas ADD COLUMN IF NOT EXISTS id_turma INTEGER REFERENCES public.cadastroturmas (id_turma);
ALTER TABLE public.criancas ADD COLUMN IF NOT EXISTS sexo VARCHAR(10) CHECK (sexo IS NULL OR sexo IN ('feminino', 'masculino'));
ALTER TABLE public.criancas ADD COLUMN IF NOT EXISTS alergias TEXT;
ALTER TABLE public.criancas ADD COLUMN IF NOT EXISTS data_cadastro DATE;
ALTER TABLE public.criancas ADD COLUMN IF NOT EXISTS autorizacao_responsavel BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.criancas ADD COLUMN IF NOT EXISTS autorizacao_imagem BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.criancas ALTER COLUMN data_cadastro SET DEFAULT CURRENT_DATE;

-- ---------------------------------------------------------
-- Usuários: telefone (login), último acesso, permissões e novos perfis
-- ---------------------------------------------------------
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS telefone VARCHAR(20);
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS ultimo_acesso TIMESTAMP;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS permissoes JSONB NOT NULL DEFAULT '{}';
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS observacoes TEXT;

ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS chk_usuario_perfil;
ALTER TABLE public.usuarios ADD CONSTRAINT chk_usuario_perfil CHECK (perfil IN
    ('ADMINISTRADOR', 'GESTOR', 'SECRETARIA', 'FINANCEIRO', 'VOLUNTARIO', 'VISUALIZACAO'));

-- Permissões padrão de quem ainda não tem nenhuma, conforme o perfil
UPDATE public.usuarios SET permissoes = CASE perfil
    WHEN 'ADMINISTRADOR' THEN '{"participantes":true,"voluntarios":true,"escalas":true,"criancas":true,"relatorios":true,"usuarios":true}'
    WHEN 'GESTOR'        THEN '{"participantes":true,"voluntarios":true,"escalas":true,"criancas":true,"relatorios":true,"usuarios":false}'
    WHEN 'SECRETARIA'    THEN '{"participantes":true,"voluntarios":true,"escalas":true,"criancas":true,"relatorios":true,"usuarios":false}'
    WHEN 'FINANCEIRO'    THEN '{"participantes":false,"voluntarios":false,"escalas":false,"criancas":false,"relatorios":true,"usuarios":false}'
    ELSE '{"participantes":false,"voluntarios":false,"escalas":true,"criancas":false,"relatorios":false,"usuarios":false}'
END::jsonb
WHERE permissoes = '{}'::jsonb;

-- ---------------------------------------------------------
-- Histórico de relatórios gerados
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.relatorios_gerados (
    id_relatorio SERIAL PRIMARY KEY,
    tipo VARCHAR(30) NOT NULL,
    data_inicial DATE,
    data_final DATE,
    formato VARCHAR(10) NOT NULL CHECK (formato IN ('pdf', 'excel', 'csv')),
    filtros JSONB NOT NULL DEFAULT '{}',
    total_registros INTEGER,
    id_usuario INTEGER REFERENCES public.usuarios (id_usuario),
    gerado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_escalas_data ON public.escalas (data_escala);
CREATE INDEX IF NOT EXISTS idx_eventos_data ON public.eventos (data_evento);
