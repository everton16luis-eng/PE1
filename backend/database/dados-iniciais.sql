-- =========================================================
-- Dados iniciais de uma instalação nova (entram no instalacao.sql)
-- Só as listas básicas que o sistema usa desde o primeiro dia.
-- Nenhuma pessoa, login, evento, escala ou lançamento financeiro.
-- Tudo pode ser alterado depois pelas telas do sistema.
-- =========================================================

-- Dados da igreja (Configurações)
INSERT INTO public.configuracoes_igreja (id, nome_igreja, cnpj, telefone, endereco, cidade, estado, horario_principal, fuso_horario, notificacoes, notificacoes_email)
VALUES (1, 'Igreja Novo Caminho', '65.202.907/0001-89', '(47) 98479-5832',
        'R. Mal. Rondon, 932 - Alto das Palmeiras, Canoinhas - SC, 89462-048',
        'Canoinhas', 'Santa Catarina', '08:00', 'America/Sao_Paulo', TRUE, TRUE);
SELECT setval('public.configuracoes_igreja_id_seq', 1);

-- Departamentos dos voluntários
INSERT INTO public.departamentos (nome, descricao, ativo) VALUES
    ('Recepção', 'Departamento responsável pela recepção', TRUE),
    ('Louvor', 'Departamento de música e louvor', TRUE),
    ('Kids', 'Departamento responsável pelas crianças', TRUE),
    ('Mídia', 'Departamento de comunicação e mídia', TRUE),
    ('Estacionamento', 'Organização do estacionamento', TRUE),
    ('Integração', 'Integração de visitantes e membros', TRUE);

-- Funções das escalas (qtd_voluntarios = por escala; vagas = tamanho desejado da equipe)
INSERT INTO public.funcoes (nome, descricao, ativo, qtd_voluntarios, vagas, dias_disponiveis) VALUES
    ('ESTACIONAMENTO', 'Responsável pelo estacionamento', TRUE, 1, 6, '{domingo,sexta,sabado}'),
    ('RECEPÇÃO', 'Responsável pela recepção', TRUE, 4, 18, '{domingo,quarta,sexta,sabado}'),
    ('FOTOS', 'Responsável pelos registros fotográficos', TRUE, 1, 4, '{domingo,sexta,sabado}'),
    ('PROJEÇÃO', 'Responsável pela projeção', TRUE, 1, 7, '{domingo,quarta,sabado}'),
    ('MESA DE SOM', 'Responsável pela mesa de som', TRUE, 1, 6, '{domingo,quarta,sexta,sabado}'),
    ('KIDS (2 A 4 ANOS)', 'Responsável pelas crianças de 2 a 4 anos', TRUE, 2, 5, '{domingo,sabado}'),
    ('KIDS (5 A 8 ANOS)', 'Responsável pelas crianças de 5 a 8 anos', TRUE, 1, 8, '{domingo,sabado}'),
    ('LÍDER PEDAGÓGICO', 'Responsável pela liderança pedagógica', TRUE, 1, 6, '{domingo,sabado}'),
    ('NEXT', 'Responsável pelo NEXT', TRUE, 1, 4, '{domingo,sabado}'),
    ('LOUVOR', 'Responsável pelo louvor', TRUE, 6, 17, '{domingo,quarta,sexta,sabado}'),
    ('GESTÃO DE CULTO', 'Responsável pela gestão do culto', TRUE, 2, 9, '{domingo,sexta,sabado}');

-- Turmas da lista de presença e das crianças (o responsável é escolhido depois, em Crianças → Gerenciar turmas)
INSERT INTO public.cadastroturmas (nome, idade_minima, idade_maxima, dia_semana, horario, ativo) VALUES
    ('Kids — 2 a 4 anos', 2, 4, 'Domingo', '09:00', TRUE),
    ('Kids — 5 a 8 anos', 5, 8, 'Domingo', '09:00', TRUE),
    ('Next', 9, 12, 'Domingo', '09:00', TRUE),
    ('Adolescentes — 13 a 17 anos', 13, 17, 'Domingo', '09:00', TRUE);

-- Categorias do financeiro
INSERT INTO public.categorias_financeiras (nome, tipo, ativo) VALUES
    ('Dízimos', 'RECEITA', TRUE),
    ('Ofertas', 'RECEITA', TRUE),
    ('Doações', 'RECEITA', TRUE),
    ('Eventos', 'RECEITA', TRUE),
    ('Energia Elétrica', 'DESPESA', TRUE),
    ('Água', 'DESPESA', TRUE),
    ('Manutenção', 'DESPESA', TRUE),
    ('Material de Limpeza', 'DESPESA', TRUE),
    ('Material Administrativo', 'DESPESA', TRUE),
    ('Serviços', 'DESPESA', TRUE),
    ('Despesas com Eventos', 'DESPESA', TRUE),
    ('Ação Social', 'DESPESA', TRUE),
    ('Missões', 'DESPESA', TRUE),
    ('Pessoal', 'DESPESA', TRUE);
