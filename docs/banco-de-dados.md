# Banco de dados

[← Voltar ao README](../README.md)

PostgreSQL, esquema `public`, codificação UTF-8. O esquema base veio do dump `dump-igreja_sistema-202610060830.sql`; as tabelas e colunas novas vêm das migrações em `backend/database/`.

## Relacionamentos principais

```mermaid
erDiagram
    membros ||--o| voluntarios : "pode ser"
    membros ||--o| usuarios : "login (id_membro, obrigatório)"
    membros ||--o{ turmas : "presenças"
    membros ||--o| criancas : "cadastro infantil (id_membro)"
    voluntarios }o--|| departamentos : "pertence"
    voluntarios ||--o{ voluntario_funcoes : ""
    funcoes ||--o{ voluntario_funcoes : ""
    voluntarios ||--o{ voluntario_ausencias : "informa"
    eventos ||--o{ escalas : "tem"
    funcoes ||--o{ escalas : "para"
    escalas ||--o{ escala_participantes : "escalados"
    voluntarios ||--o{ escala_participantes : ""
    cadastroturmas ||--o{ turmas : "presenças"
    cadastroturmas ||--o{ criancas : "matrícula"
    cadastroturmas }o--o| membros : "responsável"
    criancas ||--o{ crianca_responsavel : ""
    responsaveis ||--o{ crianca_responsavel : ""
    usuarios ||--o{ relatorios_gerados : "gerou"
```

## Tabelas por área

### Pessoas

| Tabela | Descrição | Colunas importantes |
|---|---|---|
| `membros` | **Cadastro universal de pessoas.** Toda pessoa do sistema tem um registro aqui (visitantes, membros, crianças, voluntários, quem tem login) | `nome_completo`, `data_nascimento`, `telefone`, `email`, `endereco`, `estado_civil`, **`classificacao`** (`visitante`/`membro`), `data_primeira_visita`, `data_entrada_igreja`, `informacoes_batismo`, `ativo`, `apto_voluntario`, `voluntario`, `participa_celula`, `observacoes` |
| `visitantes` | Histórico de visitas (até a base universal, era o cadastro de visitantes). Não recebe mais cadastros novos | `nome`, `data_visita`, `id_membro` (a pessoa na base universal), `promovido_em` |

### Voluntariado e escalas

| Tabela | Descrição | Colunas importantes |
|---|---|---|
| `voluntarios` | Membro que serve como voluntário | `id_membro`, `id_departamento`, `data_inicio_voluntariado`, `data_batismo`, `numero_mes_batizado` (mês do batismo, 1–12), `ativo`, `disponibilidade` (`varchar[]`: `domingo`, `segunda`…`sabado`), `observacoes` (internas — não aparecem no portal) |
| `departamentos` | Recepção, Louvor, Kids, Mídia, Estacionamento, Integração | `nome` (único), `descricao`, `ativo` |
| `funcoes` | Funções exercidas nas escalas | `nome` (único), `descricao`, `ativo`, `qtd_voluntarios` (**por escala**), `vagas` (tamanho desejado da equipe), `dias_disponiveis` (`varchar[]`), `observacoes` |
| `voluntario_funcoes` | Funções de cada voluntário (N:N) | PK (`id_voluntario`, `id_funcao`) |
| `eventos` | Cultos, reuniões e eventos | `nome`, `data_evento`, `hora_inicio`, `hora_fim`, `tipo_evento` (`culto`, `culto-jovens`, `culto-infantil`, `evento`, `reuniao`) |
| `escalas` | Uma função dentro de um evento | `id_evento`, `id_funcao`, `qtd_voluntarios`, `data_escala`, `horario` (chegada da equipe), `descricao`, `observacoes` |
| `escala_participantes` | Voluntários escalados | PK (`id_escala`, `id_voluntario`, `id_funcao`), `confirmado`, `recusado`, `motivo_recusa`, `respondido_em` |
| `voluntario_ausencias` | Períodos em que o voluntário não pode ser escalado | `id_voluntario`, `data_inicio`, `data_fim` (≥ início), `motivo` |

**Situação de um voluntário na escala:**

| Situação | `confirmado` | `recusado` |
|---|---|---|
| Aguardando resposta | `false` | `false` |
| Confirmado (ou presente, se já passou) | `true` | `false` |
| Recusou (com `motivo_recusa`) | `false` | `true` |
| Ausente (escala passada sem confirmação) | `false` | `false` e `data_escala < hoje` |

### Ministério infantil e presença

| Tabela | Descrição | Colunas importantes |
|---|---|---|
| `cadastroturmas` | Turmas (Kids 2–4, Kids 5–8, Next, Adolescentes…) | `nome` (único), `idade_minima`, `idade_maxima`, `id_membro_responsavel`, `dia_semana`, `horario`, `ativo` |
| `turmas` | **Registros de presença** (o nome é histórico) | `id_turma`, `id_membro`, `nome`, `data`, `hora_entrada`, `hora_saida`; único (`id_turma`, `id_membro`, `data`) |
| `criancas` | Cadastro infantil | `nome_completo`, `data_nascimento`, `id_membro` (para a presença), `id_turma`, `sexo`, `alergias`, `data_cadastro`, `autorizacao_responsavel`, `autorizacao_imagem`, `ativo` |
| `responsaveis` | Pais/responsáveis | `nome_completo`, `telefone`, `email`, `parentesco` |
| `crianca_responsavel` | Responsáveis de cada criança (N:N) | `responsavel_principal`, **`autorizado_retirada`** (pode buscar a criança na turma; padrão `false`), `autorizacao_atualizada_em`/`_por` |
| `turma_voluntarios` | Voluntários que operam cada turma (além do responsável principal) | PK (`id_turma`, `id_voluntario`), `vinculado_em`, `vinculado_por` |
| `turma_sessoes` | **Atendimento** de uma turma num evento (abrir → encerrar) | `id_turma`, `id_evento` (obrigatório), `status` (`aberta`/`encerrada`), `aberta_em`/`_por`, `encerrada_em`/`_por`, `processada_em`, `tipo_encerramento` (`manual`, `administrativo`, `automatico_limite_diario`, `automatico_fim_evento`), `motivo_encerramento`. Uma aberta por turma; uma por turma e evento |
| `turma_atendimentos` | Entrada e saída de cada criança na sessão | `id_sessao`, `id_crianca`, `entrada_em`/`_por`, **quem deixou a criança** (`id_responsavel_entrada` ou só `entregue_por_nome` para outra pessoa — obrigatório nas entradas), `saida_em`/`_por`, `tipo_saida` (`manual` = conferida; `automatica`; `administrativa`), `id_responsavel_retirada`. Único: criança presente uma vez por sessão (voltou = novo registro) |
| `turma_codigos` | Códigos das etiquetas: **dois, vinculados** no mesmo registro | `id_atendimento`, `id_sessao`, `codigo` + `token_crianca` (etiqueta da **criança**, exposta: só identifica, nunca retira), `codigo_retirada` + `token` (etiqueta do **responsável**: o único aceito na saída) — códigos de 6 caracteres, sem repetir na sessão; tokens aleatórios nos QR; `id_responsavel`, `status` (`ativo`/`utilizado`/`invalidado`), emissão, uso, invalidação (quem, quando, motivo), `segunda_via_de`. Um ativo por atendimento |
| `turma_auditoria` | Histórico de tudo: abertura, entradas, saídas, etiquetas, conferências, tentativas recusadas, encerramentos | `id_sessao`, `id_atendimento`, `id_codigo`, `acao`, `detalhe`, `id_usuario`, `automatico`, `criado_em` |
| `turma_alertas` | Turma encerrada automaticamente (esquecida) | `id_sessao` (único), `motivo`, `prioritario` (havia criança presente), `presentes_no_encerramento`, `saidas_regularizadas`, `deveria_encerrar_em`, `encerrada_em`, `processada_em`, `status` (`pendente`/`tratado`), `tratado_por`/`_em`, `observacao_tratamento` |

> **Lista de presença × Turmas:** a Lista de presença (`turmas`) continua como estava. O atendimento das turmas (`turma_*`) é o fluxo com evento, etiqueta e retirada conferida. A view `vw_eventos_janela` calcula início, fim (com virada da meia-noite) e o limite diário de cada evento no fuso da igreja.

> A "presença de hoje" de uma criança é um registro em `turmas` para o `id_membro` dela na data atual. Por isso, ao cadastrar uma criança, o sistema também cria um membro.

### Sistema

| Tabela | Descrição | Colunas importantes |
|---|---|---|
| `usuarios` | Logins | `nome`, `email` (único), `telefone`, `senha_hash` (`scrypt$sal$hash`), `perfil`, `ativo`, `permissoes` (JSON por área), `ultimo_acesso`, `observacoes`, `id_membro` (único quando preenchido — liga ao portal) |
| `configuracoes_igreja` | Dados da igreja (1 linha) | `nome_igreja`, `cnpj`, `telefone`, `endereco`, `cidade`, `estado`, `horario_principal`, `fuso_horario`, `notificacoes`, `notificacoes_email`, `ultimo_backup`, `proximo_backup` |
| `relatorios_gerados` | Histórico de relatórios | `tipo`, `data_inicial`, `data_final`, `formato` (`pdf`/`excel`/`csv`), `filtros` (JSON), `total_registros`, `id_usuario`, `gerado_em` |

**Perfis** (`usuarios.perfil`): `ADMINISTRADOR`, `GESTOR`, `SECRETARIA`, `FINANCEIRO`, `VOLUNTARIO`, `VISUALIZACAO`.
**Permissões** (`usuarios.permissoes`): `{ "participantes", "voluntarios", "escalas", "criancas", "relatorios", "usuarios" }` com `true/false`. Veja [Segurança](seguranca.md).

### Financeiro (sem tela ainda)

As tabelas existem no banco e o seed as preenche, mas o sistema ainda não tem páginas para elas:

| Tabela | Descrição |
|---|---|
| `categorias_financeiras` | Categorias de `RECEITA`/`DESPESA` (Dízimos, Ofertas, Energia, Pessoal…) |
| `fornecedores` | Fornecedores |
| `contas` | Contas a `PAGAR`/`RECEBER`, `status` `PAGO`/`PENDENTE` |
| `movimentacoes_financeiras` | Entradas e saídas (ligadas à conta quando houver) |
| `documentos_financeiros` | Boletos, notas, recibos |

### Views

| View | Usada em |
|---|---|
| `vw_dashboard` | Cards do Dashboard |
| `vw_resumo_pessoas` | Cards de Participantes |
| `vw_voluntarios_disponiveis` | Membros aptos ainda não marcados como voluntários (formulário de Eventos e card de Voluntários) |
| `vw_escalas_semana` | Legado — o Dashboard agora consulta as tabelas diretamente para considerar recusas |

## Migrações

Ficam em `backend/database/` e são executadas por `executar.js` (sempre em UTF-8, pela mesma conexão do `.env`). Todas são idempotentes.

| Script | Arquivo | O que cria/altera |
|---|---|---|
| `npm run db:presenca` | `presenca.sql` | `cadastroturmas`, `turmas` (presença) e 3 turmas iniciais |
| `npm run db:paginas` | `paginas.sql` | Colunas novas em `membros`, `voluntarios`, `funcoes`, `cadastroturmas`, `criancas`, `usuarios`; novos perfis; permissões padrão; `relatorios_gerados`; índices |
| `npm run db:voluntario` | `voluntario.sql` | `usuarios.id_membro`, colunas de recusa em `escala_participantes`, `voluntario_ausencias` |
| `npm run db:cadastro` | `cadastro.sql` | Campos pessoais em `visitantes` (`email`, `data_nascimento`, `estado_civil`, `endereco`) e a ligação `id_membro`/`promovido_em` usada quando o administrador promove o visitante a membro |
| `npm run db:pessoas` | `pessoas.sql` | **Base universal**: `membros.classificacao` e `data_primeira_visita`; leva visitantes, a criança sem pessoa e os logins sem pessoa para a base (como visitantes) e liga cada um; `criancas.id_membro` e `usuarios.id_membro` passam a ser obrigatórios (uma ficha infantil por pessoa); visões de resumo contam pela classificação. Não apaga pessoas nem muda ids |
| `npm run db:acesso` | `acesso.sql` | Contas criadas pela tela de login: ativas e sem áreas de gestão (usuário padrão) |
| `npm run db:relatorios` | `relatorios.sql` | Histórico de relatórios com o arquivo gerado (`titulo`, `id_evento`, `arquivo`, `hash_arquivo`…) |
| `npm run db:notificacoes` | `notificacoes.sql` | `notificacoes` (central de avisos de cada login), `push_inscricoes` (aparelhos que ativaram o Web Push) e `avisos_enviados` (lembretes automáticos sem repetir) |
| `npm run db:atendimento` | `atendimento-turmas.sql` | Turmas: `turma_voluntarios`, `turma_sessoes`, `turma_atendimentos`, `turma_codigos`, `turma_auditoria`, `turma_alertas`, a view `vw_eventos_janela` e `crianca_responsavel.autorizado_retirada` (ninguém autorizado por padrão) |
| `npm run db:trocas` | `trocas.sql` | `escala_trocas`: histórico de trocas de vaga (quem saiu, quem entrou, quando e se foi o voluntário ou a equipe) |

### Instalação nova

| Script | Arquivo | O que faz |
|---|---|---|
| `npm run db:instalar` | `instalacao.sql` | Cria tudo num banco **vazio**: estrutura completa e os dados iniciais. Não inclui pessoas, logins, eventos, escalas nem finanças |
| `npm run db:gerar-instalacao` | `gerar-instalacao.js` | Gera de novo o `instalacao.sql` a partir do banco do `.env` (estrutura via `pg_dump --schema-only`) somado a `dados-iniciais.sql`. Rode depois de cada migração nova |

`dados-iniciais.sql` contém os dados da igreja, os departamentos, as funções, as turmas e as categorias financeiras. É escrito à mão e entra no `instalacao.sql`.

Para rodar um `.sql` avulso:

```bash
node backend/database/executar.js backend/database/arquivo.sql
```

## Seeds (dados de teste)

| Arquivo | O que gera |
|---|---|
| `seed.js` | ~6 meses de histórico e ~2 meses de agenda, relativos à data da execução: 176 membros em famílias, visitantes, 64 voluntários, eventos, ~940 escalas, presenças, crianças e responsáveis, financeiro completo e 4 usuários. Corrige textos com codificação quebrada. Roda em transação única e não roda duas vezes |
| `seed-paginas.sql` | Preenche as colunas novas a partir dos dados existentes (turma pela idade, disponibilidade pelos dias em que serviu, vagas, histórico de relatórios) |
| `seed-voluntarios.js` | 3 logins do portal (`voluntario1..3@novocaminho.org`), 3 recusas e 3 ausências |

Todos usam a senha de teste `Teste@123`. **Não rode os seeds em produção.**

## Backups

- **Manual:** Configurações → Backup → *Executar agora* (só administrador).
- **Automático:** o servidor verifica a cada 15 minutos e, ao passar de `proximo_backup`, gera o backup e agenda o próximo para o dia seguinte às 03:00.
- Os arquivos ficam em `backups/backup-AAAAMMDD-HHMMSS.dump` (fora do git). Para restaurar, veja [Instalação](instalacao.md#restaurar-um-backup).

## Particularidades

- `escalas` tem **duas** chaves estrangeiras para `eventos` (uma com `ON DELETE CASCADE` e outra sem). Para apagar um evento, apague antes as escalas dele.
- `membros.voluntario` é uma marca antiga usada pela view `vw_voluntarios_disponiveis`; quem é voluntário de fato está na tabela `voluntarios`.

## Base universal de pessoas

A tabela `membros` é o cadastro único de pessoas. Os setores não guardam outra cópia da pessoa; só filtram essa base (critérios em `backend/src/models/pessoasModel.js`):

| Setor | Critério | Complemento do setor |
|---|---|---|
| Participantes | todas as pessoas | — |
| Crianças | `data_nascimento` depois de "hoje − 18 anos" (sem data, não entra) | `criancas` (turma, alergias, autorizações) + `crianca_responsavel` |
| Voluntários | `ativo` **e** `apto_voluntario` | `voluntarios` (funções, dias, escalas; `ativo` = servindo/pausado) |
| Usuários | login (`usuarios.id_membro`) com perfil de gestão | `usuarios` (e-mail, senha, perfil, permissões) |

- Todo cadastro novo entra como **visitante**, ativo, não apto e sem login (`pessoasModel.criar`). Isso vale para o Cadastro, a "Nova criança" e o pedido de acesso pela tela de login.
- Ter um cadastro **não** cria login; ter um login **exige** um cadastro.
- `criancas.nome_completo` e `criancas.data_nascimento` ficaram como legado: o nome e a data oficiais são os da pessoa.
- `responsaveis` continua separada: são contatos dos responsáveis, ainda não ligados à base de pessoas (ver pendências no histórico).
- Datas sem horário (`date`) chegam ao navegador como `AAAA-MM-DDT03:00:00Z` (meia-noite de Brasília). O frontend usa `formatarDataSimples`, que lê só os 10 primeiros caracteres.
- Funções antigas de teste ("Gari", "Garia", "Gariaaa") continuam no banco; podem ser inativadas na página Funções.
