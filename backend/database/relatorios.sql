-- =========================================================
-- Histórico persistente de relatórios (com o arquivo gerado)
--   npm run db:relatorios
--
-- Cada relatório gerado tem um registro próprio em relatorios_gerados
-- e um arquivo em arquivos/relatorios/ (fora do git e de pastas
-- temporárias). Gerar de novo cria outro registro e outro arquivo:
-- nada é sobrescrito. Registros antigos continuam (sem arquivo).
-- Só acrescenta colunas (pode rodar mais de uma vez).
-- =========================================================

ALTER TABLE public.relatorios_gerados ADD COLUMN IF NOT EXISTS titulo VARCHAR(255);
ALTER TABLE public.relatorios_gerados ADD COLUMN IF NOT EXISTS id_evento INTEGER REFERENCES public.eventos (id_evento) ON DELETE SET NULL;
-- Caminho do arquivo relativo à pasta de arquivos (ex.: relatorios/relatorio-12-....pdf)
ALTER TABLE public.relatorios_gerados ADD COLUMN IF NOT EXISTS arquivo VARCHAR(255);
-- Nome sugerido no download
ALTER TABLE public.relatorios_gerados ADD COLUMN IF NOT EXISTS nome_arquivo VARCHAR(255);
ALTER TABLE public.relatorios_gerados ADD COLUMN IF NOT EXISTS tamanho_bytes INTEGER;
-- SHA-256 do conteúdo: detecta arquivo alterado ou corrompido antes de entregar
ALTER TABLE public.relatorios_gerados ADD COLUMN IF NOT EXISTS hash_arquivo VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_relatorios_gerados_data ON public.relatorios_gerados (gerado_em DESC);
CREATE INDEX IF NOT EXISTS idx_relatorios_gerados_evento ON public.relatorios_gerados (id_evento);
