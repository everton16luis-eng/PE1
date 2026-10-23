# Referência da API

[← Voltar ao README](../README.md)

Base: `http://localhost:3000/api`. Corpo e respostas em JSON (limite de 100 KB por requisição).

## Convenções

**Autenticação.** Exceto `POST /auth/login` e `POST /auth/registro`, todas as rotas exigem o cabeçalho:

```
Authorization: Bearer <token>
```

O token vem do login, vale 12 horas e é recusado na hora se o usuário for desativado ou apagado.

**Coluna "Acesso"** nas tabelas abaixo:

| Valor | Significa |
|---|---|
| público | Sem login |
| login | Qualquer usuário logado, **exceto** perfil Voluntário |
| `área` | Administrador ou usuário com essa permissão marcada (`participantes`, `voluntarios`, `escalas`, `criancas`, `relatorios`, `usuarios`) |
| admin | Só perfil `ADMINISTRADOR` |
| portal | Qualquer login ligado a um cadastro de voluntário (inclusive perfil Voluntário) |

**Formatos.** Datas `AAAA-MM-DD`; horários `HH:MM`; IDs inteiros positivos (qualquer outra coisa na URL → 400).

**Erros.** Sempre `{ "erro": "mensagem" }`:

| Código | Quando |
|---|---|
| 400 | Dados inválidos, JSON malformado, campo maior que o permitido |
| 401 | Sem token, token inválido/expirado, usuário inativo |
| 403 | Sem permissão para a área; perfil Voluntário fora do portal; tentativa de escalar privilégio |
| 404 | Registro não encontrado (ou não pertence ao usuário) |
| 409 | Duplicado (e-mail, nome de função/turma, presença) ou registro em uso |
| 413 | Corpo da requisição grande demais |
| 429 | Muitas tentativas de login (com cabeçalho `Retry-After`) |
| 500 | Erro interno — mensagem genérica; o detalhe fica só no log do servidor |

---

## Autenticação

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| POST | `/auth/login` | público | `{ login, senha }` — `login` é e-mail ou telefone. Devolve `{ token, usuario }`. 401 login/senha errados (mesma mensagem para e-mail inexistente); 403 usuário pendente/inativo; 429 após 10 erros para o mesmo login ou 50 do mesmo IP em 15 min |
| POST | `/auth/registro` | público | `{ nome, email, telefone?, senha }` (senha ≥ 6). Cria usuário `VISUALIZACAO` **ativo**, sem nenhuma área de gestão (usuário padrão: só a Minha área). Se não houver administrador ativo, o primeiro cadastro vira administrador ativo. Campos como `perfil`/`ativo`/`permissoes` enviados são ignorados |
| GET | `/auth/me` | login ou portal | Dados do usuário logado (`id_usuario`, `nome`, `perfil`, `permissoes`, `id_membro`…) e `voluntario` (a pessoa tem ficha de voluntário: dá direito à Minha área) — nunca inclui o hash da senha |

## Dashboard

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/dashboardPessoas` | login | `{ total_visitantes, total_membros, total_voluntarios, total_escalas }` |
| GET | `/escalasSemana` | login | Eventos da semana atual que têm escalas: `[{ id_evento, nome, data, hora_inicio, hora_fim, tipo_evento, vagas, escalados, confirmados, pendentes, recusados, faltam, funcoes: [{ id_escala, funcao, horario, qtd_voluntarios, confirmados, pendentes, recusados, voluntarios: [{ nome, confirmado, recusado, motivo_recusa }] }] }]` |
| GET | `/confirmacoesPendentes` | login | 5 próximos escalados que ainda não responderam (recusas não entram) |
| GET | `/graficoConfirmacoes` | login | Mês atual: `{ confirmados, pendentes, ausentes }` (ausentes inclui recusas) |
| POST | `/criarEvento` | login | *Legado, não usado pelo frontend.* `{ nome, data_evento }` |
| POST | `/criarFuncao` | login | *Legado, não usado pelo frontend.* `{ nome, descricao, ativo, qtd_voluntarios }` |

## Eventos

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/eventos` | `escalas` | Todos os eventos, do mais recente ao mais antigo, com `realizado` / `em_andamento` (pelo horário de término real), `total_escalas`, `total_voluntarios`, `total_confirmados` |
| GET | `/eventos/:id` | `escalas` | Detalhes somente leitura: `{ evento, funcoes: [{ ..., participantes: [{ situacao }] }], resumo }` |
| PUT | `/eventos/:id` | `escalas` | `{ nome, data_evento, tipo_evento, hora_inicio?, hora_fim? }` — fim depois do início; a data das escalas do evento acompanha a nova data. **409** se o evento já foi realizado |
| DELETE | `/eventos/:id` | `escalas` | Remove o evento **e as escalas dele** (numa transação). 404 se não existir; **409** se já foi realizado (histórico) |
| GET | `/eventosDisponiveis` | login | Próximos 4 eventos que ainda não terminaram (por data e horário) |
| POST | `/novoEvento` | login | `{ nome, data_evento, hora_inicio?, hora_fim?, tipo_evento?, criado_em? }` |
| GET | `/funcoes` | login | Lista simples de funções (`id_funcao`, `nome`, `descricao`, `qtd_voluntarios`) |
| GET | `/voluntariosDisponiveis` | login | Membros aptos ainda não marcados como voluntários |

## Lista de presença

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/presenca/membros` | login | Membros ativos (`id_membro`, `nome_completo`, `data_nascimento`) |
| GET | `/presenca/turmas` | login | Turmas **ativas** |
| POST | `/presenca/turmas` | login | `{ nome }` — 409 se já existir |
| GET | `/presenca?data=AAAA-MM-DD` | login | Registros do dia (`id_registro`, `nome_turma`, `nome_membro`, `hora_entrada`, `hora_saida`) |
| POST | `/presenca` | login | `{ id_turma, id_membro, data }` — registra entrada com a hora atual. 409 se já presente nessa turma/data |
| PATCH | `/presenca/:id/saida` | login | Registra a saída. 404 se não existe ou já saiu |

## Participantes

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/participantes` | `participantes` | `{ resumo, participantes }` — **todas as pessoas da base universal**, uma linha por pessoa (`id` = `id_membro`, `tipo` = classificação `visitante`/`membro`, `nome`, `email`, `telefone`, `data` = entrada na igreja ou primeira visita, `ativo`, `apto`, `voluntario`, `menor`, `idade`, `perfil`/`id_usuario` do login). `perfil` e `id_usuario` só vão para quem tem a permissão `usuarios` (ou é administrador) |
| POST | `/participantes` | `participantes` | `{ nome, data_visita?, data_nascimento?, telefone?, email?, estado_civil?, endereco?, numero?, bairro?, observacoes? }` — cria **uma pessoa** na base universal, sempre como visitante, ativa, não apta e sem login. `tipo`, `classificacao`, `apto_voluntario`, `id_funcao` e `perfil` são ignorados. Devolve a pessoa com `id` |
| POST | `/participantes/:id/membro` | `participantes` **e** perfil `ADMINISTRADOR` | `{ data_entrada_igreja?, data_batismo?, participa_celula? }` — muda a classificação da pessoa para membro (a mesma pessoa, sem cópia; não fica apta). 404 inexistente, 409 já é membro |
| PATCH | `/participantes/:id` | `participantes` **e** perfil `ADMINISTRADOR` | `{ ativo?, apto_voluntario? }` — só **membros ativos** podem ser aptos; inativar remove o apto; voluntário servindo não pode ser inativado nem perder o apto aqui (409). Nada é apagado |

## Voluntários

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/voluntarios` | `voluntarios` | `{ resumo, voluntarios }` — **pessoas ativas e aptas** (base universal). Cada linha traz a ficha quando existe (`tem_ficha`, `id_voluntario`, funções, disponibilidade, última escala, `ativo` = servindo/pausado); sem ficha, aparece para completar. `resumo`: `total`, `ativos`, `inativos` (pausados), `sem_ficha` |
| GET | `/voluntarios/candidatos` | `voluntarios` | `{ membros, departamentos }` — pessoas ativas e aptas que ainda não têm ficha |
| POST | `/voluntarios` | `voluntarios` | `{ id_membro, funcoes: [id], disponibilidade: [dia], id_departamento?, ativo?, telefone?, email?, observacoes? }` — só para pessoa **ativa e apta** (400 caso contrário); 409 se já tem ficha. Não altera a aptidão |
| PATCH | `/voluntarios/:id/status` | `voluntarios` | `{ ativo }` |

### Ficha do voluntário

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/voluntarios/:id` | `voluntarios` | Ficha: dados, `funcoes`, `disponibilidade`, `observacoes`, `acesso` (login do portal), `estatisticas` (`realizadas`, `presentes`, `proximas`, `aguardando`, `recusadas`, `ultima`, `proxima`), `proximas` (com `colegas`), `historico` (30 últimas), `ausencias` (futuras), `por_funcao` |
| PUT | `/voluntarios/:id` | `voluntarios` | `{ funcoes, disponibilidade, id_departamento?, ativo?, telefone?, email?, observacoes? }` — devolve a ficha atualizada |
| PATCH | `/voluntarios/:id/escalas/:idEscala` | `voluntarios` | `{ resposta: "confirmar" \| "pendente" \| "recusar", motivo? }` — `motivo` obrigatório para recusar. Vale também para escalas passadas |
| DELETE | `/voluntarios/:id/escalas/:idEscala` | `voluntarios` | Retira o voluntário de uma escala **futura** |
| POST | `/voluntarios/:id/ausencias` | `voluntarios` | `{ data_inicio, data_fim, motivo? }` — devolve a ausência e `conflitos` (escalas no período) |
| DELETE | `/voluntarios/:id/ausencias/:idAusencia` | `voluntarios` | Remove a ausência (só se for desse voluntário) |
| POST | `/voluntarios/:id/acesso` | `voluntarios` **e** `usuarios` | `{ email, senha }` — cria login de perfil `VOLUNTARIO`, sem permissões de gestão, ligado ao membro. 409 se já tiver acesso ou e-mail repetido |
| PATCH | `/voluntarios/:id/acesso` | `voluntarios` **e** `usuarios` | `{ ativo }` — bloqueia/libera o login do portal. Não altera logins de gestão (400) |

## Portal do voluntário

A pessoa é identificada **pelo login** (`usuarios.id_membro`); nenhuma rota aceita id de voluntário. `GET /portal` responde a qualquer login com `classificacao` vinda do banco; as demais rotas exigem cadastro de voluntário (senão 404 com orientação).

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/portal` | login | **Voluntário** (a pessoa do login tem ficha de voluntário, servindo ou pausada): mesma estrutura da ficha, **sem** `observacoes` e `acesso`, mais `classificacao: "voluntario"` e `eventos`. Demais logins: `{ classificacao: "membro" \| "visitante", nome, eventos }`, conforme a classificação da pessoa. `eventos` = 12 próximos eventos a partir de hoje, por data e horário |
| PATCH | `/portal/escalas/:idEscala` | portal | `{ resposta: "confirmar" \| "pendente" \| "recusar", motivo? }` — só escalas **futuras** e do próprio voluntário (senão 404) |
| GET | `/portal/escalas/:idEscala/substitutos` | portal | `{ substitutos: [{ id_voluntario, nome }] }` — quem pode assumir a vaga: voluntário ativo e apto da **mesma função**, que marcou o **dia da semana** como disponível, **sem ausência** na data e **sem outra escala** no mesmo dia. Só o nome (nenhum contato). 404 se a vaga não é do voluntário ou já passou |
| POST | `/portal/escalas/:idEscala/passar` | portal | `{ id_voluntario }` — o próprio voluntário passa a vaga (sem a equipe). Quem assume entra **aguardando resposta**; a troca vai para `escala_trocas` (`feita_por: "voluntario"`). 409 se a pessoa não está livre, 404 se a vaga não é dele |
| PUT | `/portal/preferencias` | portal | `{ disponibilidade: [dia], telefone?, email? }` — ao menos um dia |
| POST | `/portal/ausencias` | portal | `{ data_inicio, data_fim, motivo? }` — fim ≥ início e ≥ hoje; devolve `conflitos` |
| DELETE | `/portal/ausencias/:idAusencia` | portal | Só as próprias |
| PUT | `/portal/senha` | portal | `{ senha_atual, nova_senha }` (nova ≥ 6) |

## Funções

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/funcoes/gestao` | `voluntarios` | `{ resumo, funcoes }` — com `voluntarios` (ativos) e `vagas_abertas` |
| POST | `/funcoes` | `voluntarios` | `{ nome, qtd_voluntarios ≥ 1, vagas ≥ 0, ativo?, descricao?, dias_disponiveis?, observacoes? }` — 409 nome repetido |
| PUT | `/funcoes/:id` | `voluntarios` | Mesmo corpo do POST |

## Escalas

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/escalas/calendario?ano=&mes=` | `escalas` | Dias do mês com eventos: `data`, `eventos`, `escalas`, `pendentes`, `recusados` (só datas futuras contam como pendentes) |
| GET | `/escalas/dia?data=` | `escalas` | `{ eventos, escalas }` — cada escala com `participantes` (`confirmado`, `recusado`, `motivo_recusa`, `ausente`) e totais |
| GET | `/escalas/voluntarios?funcao=&data=` | `escalas` | Voluntários ativos da função, com `disponivel` (dia da semana e sem ausência), `ausente` e `motivo_ausencia` |
| POST | `/escalas` | `escalas` | `{ data, horario, id_funcao, qtd_voluntarios, voluntarios: [id], observacoes?, id_evento? }`. Sem `id_evento`, envie `evento: { nome, tipo_evento, hora_inicio, hora_fim }` para criar o evento junto. Não aceita mais voluntários que `qtd_voluntarios`. Todos os voluntários precisam estar **ativos e aptos**, com ficha servindo e a função (400 caso contrário) |
| GET | `/escalas/pendentes` | `escalas` | Atribuições aguardando resposta (nem confirmadas nem recusadas), de hoje em diante: `id_escala`, `id_voluntario`, `voluntario`, `evento`, `data_escala`, `horario`, `funcao`... |
| GET | `/escalas/:id` | `escalas` | Uma escala, no formato de `/escalas/dia`, com `data_escala` e `realizado` |
| PATCH | `/escalas/:id/participantes/:idVoluntario` | `escalas` | `{ confirmado }` — também limpa uma recusa |
| POST | `/escalas/:id/participantes/:idVoluntario/substituir` | `escalas` | `{ id_voluntario }` — a mesma vaga passa ao novo voluntário (ativo, apto e da função), com a confirmação de volta a "aguardando". 409 se o novo já está na escala ou o evento já foi realizado |

## Crianças e turmas

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/criancas` | `criancas` | `{ resumo, criancas, turmas }` — **pessoas da base com menos de 18 anos** (calculado hoje pela data de nascimento; sem data, não entra). Com a ficha infantil quando existe (`tem_ficha`, turma, responsável principal, alergias) e `presente_hoje`. `resumo.sem_ficha` = menores sem ficha |
| POST | `/criancas` | `criancas` | Ficha infantil: `{ id_membro?, nome?, data_nascimento?, sexo, id_turma, autorizacao_responsavel: true, autorizacao_imagem?, ativo?, data_cadastro?, alergias?, observacoes?, responsavel: { nome, parentesco: "mae"\|"pai"\|"avo"\|"tio"\|"responsavel", telefone, email? } }`. Com `id_membro`, completa a ficha de uma pessoa já cadastrada (400 se tiver 18 anos ou mais, 409 se já tem ficha). Sem ele, cria a pessoa na base (visitante, menor de 18 — senão 400) e a ficha |
| GET | `/turmas` | `criancas` | `{ resumo, turmas, responsaveis }` |
| POST | `/turmas` | `criancas` | `{ nome, idade_minima, idade_maxima, dia_semana, horario, id_membro_responsavel?, ativo?, observacoes? }` |
| PUT | `/turmas/:id` | `criancas` | Mesmo corpo |
| DELETE | `/turmas/:id` | `criancas` | 409 se houver crianças ou presenças (sugere inativar) |

## Relatórios

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/relatorios` | `relatorios` | `{ resumo, recentes }` — histórico (até 200, mais novos primeiro) com `titulo`, `evento`, `tem_arquivo` |
| GET | `/relatorios/eventos` | `relatorios` | Eventos (futuros e realizados) para o relatório por evento |
| GET | `/relatorios/evento/:id` | `relatorios` | Dados do relatório do evento (pré-visualização), mesmo formato de `GET /eventos/:id` |
| POST | `/relatorios/gerar` | `relatorios` | `{ tipo: "evento", id_evento }` (PDF) ou `{ tipo, formato: "pdf"\|"excel"\|"csv", filtros?, opcoes? }`. Gera no servidor, grava o arquivo em `arquivos/relatorios/` e o registro em `relatorios_gerados` (tudo ou nada) |
| GET | `/relatorios/historico/:id/arquivo` | `relatorios` (`usuarios` também exige `usuarios`) | O arquivo salvo, sem gerar de novo (`?download=1` = anexo). 404 sem arquivo; 409 se o conteúdo não confere com o hash registrado |
| GET | `/relatorios/:tipo` | `relatorios` (`usuarios` também exige `usuarios`) | `{ tipo, titulo, colunas, linhas, filtros }`. Filtros não reconhecidos são **ignorados** |

Filtros aceitos em `/relatorios/:tipo` (todos opcionais; `inicio`/`fim` em todos onde há data):

| Tipo | Filtros |
|---|---|
| `participantes` | `tipo=membros\|visitantes`, `status=ativos\|inativos` |
| `voluntarios` | `status=ativos\|inativos`, `id_funcao` (o período conta as escalas) |
| `escalas` | `status=confirmadas\|pendentes\|recusadas`, `id_funcao` |
| `presencas` | `id_turma` |
| `criancas` | `id_turma`, `status=ativos\|inativos` (o período conta as presenças) |
| `funcoes` | `status=ativas\|inativas`, `vagas=com_vagas\|lotadas` |
| `usuarios` | `perfil`, `status=ativos\|inativos\|pendentes` |

## Usuários

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/usuarios` | `usuarios` | `{ usuarios, resumo, pessoas }` — pessoas com login de **gestão** (todos os perfis menos `VOLUNTARIO`, inclusive inativos e pendentes); o nome vem do cadastro da pessoa. `pessoas` = cadastros ainda sem login |
| POST | `/usuarios` | `usuarios` | `{ id_membro, email, senha (≥ 6), perfil, ativo?, telefone?, observacoes?, permissoes? }` — o acesso é dado a uma **pessoa do cadastro** (400 sem `id_membro`, 404 inexistente, 409 se ela já tem login). `perfil` `VOLUNTARIO` é recusado (400): o acesso ao portal é criado na ficha do voluntário |
| PUT | `/usuarios/:id` | `usuarios` | Mesmo corpo, sem `id_membro`; `senha` opcional (vazia mantém a atual). O nome não muda por aqui (é o da pessoa). Contas `VOLUNTARIO` não são editadas aqui (400) |

Regras para quem **não** é administrador (403): não cria nem promove administradores, não edita contas de administrador, não altera o próprio perfil ou as próprias permissões e não concede permissões que não possui. O sistema não deixa ficar sem administrador ativo (400).

## Notificações

Cada login só vê e altera os **próprios** avisos e aparelhos (o id vem do token). Liberado também para voluntários e usuários sem área de gestão.

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/notificacoes` | login | `{ nao_lidas, notificacoes (30 mais recentes: tipo, titulo, mensagem, rota, lida, criado_em), aparelhos, push_disponivel }` |
| POST | `/notificacoes/:id/lida` | login | Marca um aviso como lido (404 se não for do login) |
| POST | `/notificacoes/lidas` | login | Marca todos como lidos |
| GET | `/notificacoes/push/chave` | login | `{ chave, disponivel }` — chave pública VAPID para ativar o push |
| POST | `/notificacoes/push` | login | `{ inscricao: { endpoint (https), keys: { p256dh, auth } }, aparelho? }` — ativa neste aparelho. 503 sem chaves VAPID no servidor |
| DELETE | `/notificacoes/push` | login | `{ endpoint }` — desativa neste aparelho |
| POST | `/notificacoes/push/teste` | login | Envia um aviso de teste para o próprio login |

Avisos automáticos (tipo → quem recebe):

| Tipo | Quando | Quem recebe |
|---|---|---|
| `escala_nova` | Escala criada ou voluntário colocado por substituição | Voluntário |
| `escala_retirada` | Equipe tira o voluntário da escala (ou o substitui) | Voluntário |
| `escala_alterada` | Evento muda de dia ou de horário de início | Escalados no evento |
| `escala_removida` | Evento removido | Escalados no evento |
| `vaga_recebida` / `troca_voluntarios` | Voluntário passa a vaga | Quem assumiu / liderança |
| `recusa` | Voluntário toca em "Não posso ir" | Liderança (com o motivo) |
| `lembrete` | Véspera da escala, a partir das 18h (`LEMBRETE_HORA`) | Cada escalado, uma vez |
| `pendencias` | Diário, a partir das 18h, se houver | Liderança: pendências dos próximos 2 dias |

"Liderança" = administradores e equipe com a área **Escalas**. Os lembretes automáticos respeitam a opção **Notificações** em Configurações.

## Configurações

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/configuracoes` | login | Dados da igreja, preferências e datas de backup |
| PUT | `/configuracoes` | admin | `{ nome_igreja, cnpj? (00.000.000/0000-00), telefone?, endereco?, cidade?, estado?, horario_principal?, fuso_horario?, notificacoes, notificacoes_email }` |
| POST | `/configuracoes/backup` | admin | Gera o backup agora: `{ arquivo, tamanho, ultimo_backup, proximo_backup }` |
