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
| POST | `/auth/registro` | público | `{ nome, email, telefone?, senha }` (senha ≥ 6). Cria usuário `VISUALIZACAO` **inativo**, aguardando liberação. Se não houver administrador ativo, o primeiro cadastro vira administrador ativo. Campos como `perfil`/`ativo` enviados são ignorados |
| GET | `/auth/me` | login ou portal | Dados do usuário logado (`id_usuario`, `nome`, `perfil`, `permissoes`, `id_membro`…) — nunca inclui o hash da senha |

## Dashboard

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/dashboardPessoas` | login | `{ total_visitantes, total_membros, total_voluntarios, total_escalas }` |
| GET | `/escalasSemana` | login | Escalas da semana atual por função: `data_escala`, `evento`, `funcao`, `horario`, `confirmados`, `pendentes`, `recusados` |
| GET | `/confirmacoesPendentes` | login | 5 próximos escalados que ainda não responderam (recusas não entram) |
| GET | `/graficoConfirmacoes` | login | Mês atual: `{ confirmados, pendentes, ausentes }` (ausentes inclui recusas) |
| POST | `/criarEvento` | login | *Legado, não usado pelo frontend.* `{ nome, data_evento }` |
| POST | `/criarFuncao` | login | *Legado, não usado pelo frontend.* `{ nome, descricao, ativo, qtd_voluntarios }` |

## Eventos

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/eventos` | login | Todos os eventos, do mais recente ao mais antigo |
| GET | `/eventosDisponiveis` | login | Próximos 4 eventos a partir de hoje |
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
| GET | `/participantes` | `participantes` | `{ resumo, participantes }` — membros e visitantes juntos (`tipo`, `nome`, `email`, `telefone`, `data`, `ativo`) |
| POST | `/participantes` | `participantes` | **Visitante:** `{ tipo: "visitante", nome, data_visita, telefone?, observacoes? }`. **Membro:** `{ tipo: "membro", nome, data_nascimento?, telefone?, email?, estado_civil?, endereco?, numero?, bairro?, data_entrada_igreja?, data_batismo?, participa_celula?, id_funcao?, observacoes? }` — com `id_funcao` o membro já é cadastrado como voluntário nessa função |

## Voluntários

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/voluntarios` | `voluntarios` | `{ resumo, voluntarios }` — funções, disponibilidade, última escala, status |
| GET | `/voluntarios/candidatos` | `voluntarios` | `{ membros, departamentos }` — membros que ainda não são voluntários |
| POST | `/voluntarios` | `voluntarios` | `{ id_membro, funcoes: [id], disponibilidade: [dia], id_departamento?, ativo?, telefone?, email?, observacoes? }` |
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

O voluntário é identificado **pelo login** (`usuarios.id_membro`); nenhuma rota aceita id de voluntário. Login sem cadastro de voluntário → 404 com orientação.

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/portal` | portal | Mesma estrutura da ficha, **sem** `observacoes` e `acesso` |
| PATCH | `/portal/escalas/:idEscala` | portal | `{ resposta: "confirmar" \| "pendente" \| "recusar", motivo? }` — só escalas **futuras** e do próprio voluntário (senão 404) |
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
| POST | `/escalas` | `escalas` | `{ data, horario, id_funcao, qtd_voluntarios, voluntarios: [id], observacoes?, id_evento? }`. Sem `id_evento`, envie `evento: { nome, tipo_evento, hora_inicio, hora_fim }` para criar o evento junto. Não aceita mais voluntários que `qtd_voluntarios` |
| PATCH | `/escalas/:id/participantes/:idVoluntario` | `escalas` | `{ confirmado }` — também limpa uma recusa |

## Crianças e turmas

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/criancas` | `criancas` | `{ resumo, criancas, turmas }` — idade, turma, responsável principal, `presente_hoje` |
| POST | `/criancas` | `criancas` | `{ nome, data_nascimento, sexo, id_turma, autorizacao_responsavel: true, autorizacao_imagem?, ativo?, data_cadastro?, alergias?, observacoes?, responsavel: { nome, parentesco: "mae"\|"pai"\|"avo"\|"tio"\|"responsavel", telefone, email? } }` — cria também o membro e o responsável |
| GET | `/turmas` | `criancas` | `{ resumo, turmas, responsaveis }` |
| POST | `/turmas` | `criancas` | `{ nome, idade_minima, idade_maxima, dia_semana, horario, id_membro_responsavel?, ativo?, observacoes? }` |
| PUT | `/turmas/:id` | `criancas` | Mesmo corpo |
| DELETE | `/turmas/:id` | `criancas` | 409 se houver crianças ou presenças (sugere inativar) |

## Relatórios

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/relatorios` | `relatorios` | `{ resumo, recentes }` (10 últimos gerados) |
| GET | `/relatorios/:tipo` | `relatorios` (`usuarios` também exige `usuarios`) | `{ tipo, titulo, colunas, linhas, filtros }`. Filtros não reconhecidos são **ignorados** |
| POST | `/relatorios/historico` | `relatorios` | `{ tipo, formato: "pdf"\|"excel"\|"csv", data_inicial?, data_final?, filtros?, total_registros? }` |

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
| GET | `/usuarios` | `usuarios` | `{ usuarios, resumo }` |
| POST | `/usuarios` | `usuarios` | `{ nome, email, senha (≥ 6), perfil, ativo?, telefone?, observacoes?, permissoes? }` |
| PUT | `/usuarios/:id` | `usuarios` | Mesmo corpo; `senha` opcional (vazia mantém a atual) |

Regras para quem **não** é administrador (403): não cria nem promove administradores, não edita contas de administrador, não altera o próprio perfil ou as próprias permissões e não concede permissões que não possui. O sistema não deixa ficar sem administrador ativo (400).

## Configurações

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/configuracoes` | login | Dados da igreja, preferências e datas de backup |
| PUT | `/configuracoes` | admin | `{ nome_igreja, cnpj? (00.000.000/0000-00), telefone?, endereco?, cidade?, estado?, horario_principal?, fuso_horario?, notificacoes, notificacoes_email }` |
| POST | `/configuracoes/backup` | admin | Gera o backup agora: `{ arquivo, tamanho, ultimo_backup, proximo_backup }` |
