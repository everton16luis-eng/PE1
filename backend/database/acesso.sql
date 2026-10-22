-- =========================================================
-- Ativação x autorização das contas criadas pela tela de login
--   npm run db:acesso
--
-- Regra nova: toda conta criada pela tela de login já nasce ATIVA,
-- como usuário padrão (sem nenhuma área de gestão — só a Minha área).
-- Antes ela ficava pendente e recebia por padrão a área "escalas",
-- o que abria o Dashboard, Eventos e Escalas a quem só pediu acesso.
--
-- Só mexe em contas com a marca do cadastro pela tela de login
-- (observações "Cadastro feito pela tela de login", perfil VISUALIZACAO)
-- e que ainda estão exatamente com as permissões padrão antigas.
-- Contas que um administrador configurou (outro perfil ou outras
-- permissões) ficam como estão. Não muda a classificação das pessoas.
-- Pode rodar mais de uma vez.
-- =========================================================

-- 1. Permissões padrão antigas → nenhuma área de gestão
UPDATE public.usuarios
SET permissoes = '{"participantes":false,"voluntarios":false,"escalas":false,"criancas":false,"relatorios":false,"usuarios":false}'::jsonb
WHERE perfil = 'VISUALIZACAO'
  AND observacoes = 'Cadastro feito pela tela de login'
  AND permissoes = '{"participantes":false,"voluntarios":false,"escalas":true,"criancas":false,"relatorios":false,"usuarios":false}'::jsonb;

-- 2. Cadastros que ainda aguardavam liberação (nunca entraram) passam a valer
UPDATE public.usuarios
SET ativo = TRUE
WHERE perfil = 'VISUALIZACAO'
  AND observacoes = 'Cadastro feito pela tela de login'
  AND NOT ativo
  AND ultimo_acesso IS NULL;
