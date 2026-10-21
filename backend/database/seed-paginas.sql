-- =========================================================
-- Complemento do seed de teste para as colunas das páginas
-- (rode depois de paginas.sql e seed.js). Pode rodar mais de
-- uma vez: só preenche o que ainda está vazio.
-- =========================================================

-- Crianças -> membro correspondente (mesmo nome e nascimento)
UPDATE criancas c
SET id_membro = m.id_membro,
    data_cadastro = COALESCE(c.data_cadastro, m.data_entrada_igreja)
FROM membros m
WHERE c.id_membro IS NULL
  AND m.nome_completo = c.nome_completo
  AND m.data_nascimento = c.data_nascimento;

UPDATE criancas SET data_cadastro = CURRENT_DATE - (id_crianca % 200) WHERE data_cadastro IS NULL;

-- Crianças -> turma pela idade
UPDATE criancas c
SET id_turma = t.id_turma
FROM cadastroturmas t
WHERE c.id_turma IS NULL
  AND t.ativo
  AND date_part('year', age(c.data_nascimento)) BETWEEN t.idade_minima AND t.idade_maxima;

-- Autorizações das crianças já cadastradas
UPDATE criancas
SET autorizacao_responsavel = TRUE,
    autorizacao_imagem = (id_crianca % 5 <> 0)
WHERE autorizacao_responsavel = FALSE;

-- Alergias que estavam nas observações
UPDATE criancas
SET alergias = observacoes, observacoes = NULL
WHERE alergias IS NULL
  AND observacoes ~* '(alergia|intoler|glúten|asma)';

-- Responsável de cada turma: voluntários do departamento Kids
UPDATE cadastroturmas t
SET id_membro_responsavel = r.id_membro
FROM (
    SELECT id_turma, ROW_NUMBER() OVER (ORDER BY id_turma) AS n FROM cadastroturmas
) tn
JOIN (
    SELECT v.id_membro, ROW_NUMBER() OVER (ORDER BY v.id_voluntario) AS n
    FROM voluntarios v
    JOIN departamentos d ON d.id_departamento = v.id_departamento
    WHERE d.nome = 'Kids' AND v.ativo
) r ON r.n = tn.n
WHERE t.id_turma = tn.id_turma AND t.id_membro_responsavel IS NULL;

-- Membros que participam de célula
UPDATE membros SET participa_celula = ((id_membro * 7) % 10) < 6 WHERE participa_celula IS NULL;

-- Disponibilidade dos voluntários = dias em que já serviram
UPDATE voluntarios v
SET disponibilidade = d.dias
FROM (
    SELECT ep.id_voluntario,
           ARRAY_AGG(DISTINCT (ARRAY['domingo','segunda','terca','quarta','quinta','sexta','sabado'])
                     [EXTRACT(DOW FROM es.data_escala)::int + 1])::varchar(10)[] AS dias
    FROM escala_participantes ep
    JOIN escalas es ON es.id_escala = ep.id_escala
    GROUP BY ep.id_voluntario
) d
WHERE d.id_voluntario = v.id_voluntario AND v.disponibilidade = '{}';

UPDATE voluntarios SET disponibilidade = '{domingo}' WHERE disponibilidade = '{}';

-- Funções: descrição, dias de uso e tamanho da equipe
UPDATE funcoes SET descricao = CASE UPPER(nome)
    WHEN 'RECEPÇÃO' THEN 'Recepcionar membros e visitantes na entrada dos cultos'
    WHEN 'LOUVOR' THEN 'Ministração de música e condução do louvor'
    WHEN 'MESA DE SOM' THEN 'Operação da mesa de som e microfones'
    WHEN 'PROJEÇÃO' THEN 'Projeção de letras, avisos e mídias'
    WHEN 'FOTOS' THEN 'Registro fotográfico dos cultos e eventos'
    WHEN 'KIDS (2 A 4 ANOS)' THEN 'Cuidado e ensino das crianças de 2 a 4 anos'
    WHEN 'KIDS (5 A 8 ANOS)' THEN 'Ensino bíblico das crianças de 5 a 8 anos'
    WHEN 'NEXT' THEN 'Acompanhamento dos pré-adolescentes de 9 a 12 anos'
    WHEN 'LÍDER PEDAGÓGICO' THEN 'Planejamento das aulas do ministério infantil'
    WHEN 'ESTACIONAMENTO' THEN 'Organização do estacionamento e acesso'
    WHEN 'GESTÃO DE CULTO' THEN 'Coordenação da ordem e dos horários do culto'
    ELSE descricao
END
WHERE descricao IS NULL OR descricao = '';

UPDATE funcoes f
SET dias_disponiveis = d.dias
FROM (
    SELECT es.id_funcao,
           ARRAY_AGG(DISTINCT (ARRAY['domingo','segunda','terca','quarta','quinta','sexta','sabado'])
                     [EXTRACT(DOW FROM es.data_escala)::int + 1])::varchar(10)[] AS dias
    FROM escalas es
    GROUP BY es.id_funcao
) d
WHERE d.id_funcao = f.id_funcao AND f.dias_disponiveis = '{}';

UPDATE funcoes f
SET vagas = GREATEST(f.qtd_voluntarios, COALESCE(v.total, 0) + (f.id_funcao % 3))
FROM (SELECT f2.id_funcao, COUNT(vf.id_voluntario) AS total
      FROM funcoes f2 LEFT JOIN voluntario_funcoes vf ON vf.id_funcao = f2.id_funcao
      GROUP BY f2.id_funcao) v
WHERE v.id_funcao = f.id_funcao AND f.vagas IS NULL;

-- Usuários: telefone e último acesso
UPDATE usuarios SET telefone = '(47) 3622-10' || LPAD(id_usuario::text, 2, '0') WHERE telefone IS NULL;
UPDATE usuarios
SET ultimo_acesso = CURRENT_TIMESTAMP - ((id_usuario % 4) || ' days')::interval - ((id_usuario * 37 % 600) || ' minutes')::interval
WHERE ultimo_acesso IS NULL AND ativo;

-- Histórico de relatórios gerados nos últimos meses
INSERT INTO relatorios_gerados (tipo, data_inicial, data_final, formato, filtros, total_registros, id_usuario, gerado_em)
SELECT r.tipo, r.ini, r.fim, r.formato, '{}'::jsonb, r.total,
       (SELECT id_usuario FROM usuarios WHERE perfil = 'ADMINISTRADOR' ORDER BY id_usuario LIMIT 1),
       r.gerado
FROM (VALUES
    ('participantes', date_trunc('month', CURRENT_DATE - INTERVAL '3 month')::date, (date_trunc('month', CURRENT_DATE - INTERVAL '2 month') - INTERVAL '1 day')::date, 'pdf',   180, CURRENT_TIMESTAMP - INTERVAL '80 days'),
    ('escalas',       date_trunc('month', CURRENT_DATE - INTERVAL '2 month')::date, (date_trunc('month', CURRENT_DATE - INTERVAL '1 month') - INTERVAL '1 day')::date, 'excel', 262, CURRENT_TIMESTAMP - INTERVAL '50 days'),
    ('voluntarios',   NULL::date, NULL::date, 'pdf', 64, CURRENT_TIMESTAMP - INTERVAL '35 days'),
    ('criancas',      NULL::date, NULL::date, 'csv', 50, CURRENT_TIMESTAMP - INTERVAL '20 days'),
    ('presencas',     date_trunc('month', CURRENT_DATE - INTERVAL '1 month')::date, (date_trunc('month', CURRENT_DATE) - INTERVAL '1 day')::date, 'pdf', 230, CURRENT_TIMESTAMP - INTERVAL '19 days')
) AS r(tipo, ini, fim, formato, total, gerado)
WHERE NOT EXISTS (SELECT 1 FROM relatorios_gerados)
  AND EXISTS (SELECT 1 FROM usuarios WHERE perfil = 'ADMINISTRADOR');
