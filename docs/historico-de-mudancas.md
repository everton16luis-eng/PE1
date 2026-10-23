# Histórico de mudanças

[← Voltar ao README](../README.md)

Registro do que foi construído e corrigido em outubro de 2026, na ordem em que aconteceu.

## 1. Refatoração, dependências e layout responsivo

- **Servidor:** a rota de presença não carregava (faltava o `router`, havia um `r.` solto no controller e a rota não estava registrada). Também corrigi o script `npm run dev`.
- **Models:** corrigidos campos trocados (horário/voluntários nas escalas, `id_evento` ausente no evento criado, `apto_voluntario`). Listas vazias passaram a devolver `[]` em vez de `null`.
- **Frontend:** corrigida a variável `erro`/`error` e o link "Dashboard". O `API_URL` passou a ser relativo (`/api`).
- **CSS:** unificado. Removidas ~800 linhas duplicadas que estavam aninhadas dentro de `.content`. Entraram o menu em gaveta no celular, tabelas com rolagem e grids adaptáveis.
- **Lista de presença:** deixou de ser uma página separada, com dados fictícios, e virou uma tela do sistema ligada à API.
- **`.env`:** lido de `backend/src/.env` independentemente de onde o servidor é iniciado.

## 2. Banco de teste "em funcionamento"

- **Presença:** passou a registrar **membros** (decisão do usuário), com as tabelas `cadastroturmas` e `turmas` criadas.
- **Seed de 6 meses** (`seed.js`): famílias, visitantes que viraram membros, voluntários em rodízio, cerca de 940 escalas, presenças, crianças com responsáveis, financeiro com despesas realistas e usuários.
- **Codificação:** 15 nomes de departamentos e categorias gravados com codificação quebrada ("Recep‡Æo") foram corrigidos.
- **Dashboard:** "Escalas da semana" passou a filtrar a semana atual, "Próximos eventos" a partir de hoje, e os painéis de confirmações e o gráfico ficaram ligados aos dados reais.

## 3. Páginas que faltavam (a partir dos templates)

- **Páginas novas**, no padrão da página única: Login/Registro, Participantes, Voluntários, Funções, Escalas (calendário), Crianças/Turmas, Relatórios (PDF/Excel/CSV), Usuários e Configurações (com backup real). O Dashboard ganhou a faixa inferior do template.
- **Backend MVC** para cada área, com login por token e permissões por área.
- **Migração** `paginas.sql` e complemento do seed `seed-paginas.sql`.
- **Logo:** `img/terracota.png`, que faltava no site, foi copiado do projeto anterior.

## 4. Correções de cadastro, segurança e testes

- **Aba Registro:** aparecia em branco (o foco fazia a caixa rolar) e colidia com a classe `.registro` da presença. Agora segue o mesmo padrão do Login.
- **Vulnerabilidades encontradas pelos testes e corrigidas:**
  - escalada de privilégio (usuário não administrador criava administradores e trocava a senha do administrador);
  - ausência de limite de tentativas de login;
  - mensagens internas do banco expostas em erros;
  - falta de cabeçalhos de segurança.
- **Testes:** suíte com banco isolado, cobrindo acesso indevido, SQL injection, validação e layout.

## 5. Navegação e listas

- **Voltar e Avançar do navegador** funcionam em todas as páginas; recarregar mantém a página atual; formulários salvos ou cancelados não ficam no histórico; o título da aba acompanha a página.
- **Listas de Participantes, Voluntários, Funções e Crianças** só mostram nomes após uma busca ou o clique num filtro (os nomes nem ficam no HTML antes disso).

## 6. Ficha e portal do voluntário

- **Ficha do voluntário** (gestão): indicadores, próximas escalas (confirmar, recusar ou retirar), histórico, ausências, edição e acesso ao portal.
- **Minha área** (portal do voluntário): confirmar ou recusar escalas com motivo, ver a equipe, informar ausências, disponibilidade e contato, histórico e troca de senha.
- **Banco:** migração `voluntario.sql` (login ↔ membro, recusas e ausências) e seed `seed-voluntarios.js`.
- **Escalas e Dashboard** passaram a considerar recusas e ausências; o relatório de escalas ganhou o filtro "Recusadas".
- **Segurança:** o perfil Voluntário fica bloqueado fora do portal, tanto no servidor quanto na tela.
- **Testes:** 41 novos, totalizando 246.

## 7. Melhorias de uso e regras de cadastro

- **Sair no celular:** botão de sair no cabeçalho em telas pequenas.
- **Dashboard:** escalas da semana agrupadas por evento, com cor por tipo e detalhes expansíveis (funções, vagas, voluntários e confirmação).
- **Eventos:** editar e remover funcionando (antes os botões não faziam nada) e lista em cartões no celular. Novas rotas `PUT`/`DELETE /eventos/:id`.
- **Lista de presença:** a turma Next fica sempre por último (pelo nome, sem renomear nada no banco).
- **Cadastro de pessoas:** todo cadastro entra como visitante; promover a membro e definir apto/ativo é exclusivo do administrador. Migração `cadastro.sql`.
- **Relatórios:** o botão Visualizar tinha estilo quebrado porque as regras de `.form-actions` só valiam para `.primary`; agora valem também para `.secondary`.
- **Usuários:** deixou de listar os logins do portal do voluntário (nada foi apagado).
- **Testes:** 23 novos, totalizando 269.

## 8. Minha área por perfil, dashboard e listas responsivas

- **Minha área:** o `/portal` passou a responder a qualquer login com a classificação do banco. Voluntários continuam com as escalas em primeiro lugar e ganharam a programação da igreja como painel secundário; membros e visitantes veem os próximos eventos. Contas de Visualização também passaram a ver a Minha área.
- **Dashboard:** "Ver todas" (pendentes) e "Ver relatórios" não tinham ação; agora abrem o relatório de escalas já filtrado. A tag "Recusou" estava riscada por uma regra `line-through`, removida.
- **Listas** de Participantes, Voluntários, Escalas, Funções, Crianças, Turmas e Relatórios recentes: no celular e no tablet (até 860px) viram cartões com todos os campos e botões de 44px; no computador continuam em tabela. A busca e os filtros se reorganizam no celular.
- **Relatórios:** a prévia mostra todas as colunas (até 20 linhas); pendentes saem das mais próximas para as mais distantes.
- **Crianças:** cadastro inativo deixou de aparecer como "Ausente"; novo filtro "Inativas" quando houver.
- **Participantes:** membros com login mostram o perfil de acesso. (Os logins sem cadastro, listados por um tempo como "Contas", viraram pessoas do cadastro na seção 9.)
- **Testes:** 18 novos, totalizando 287.

## 9. Base universal de pessoas

- **Um cadastro por pessoa:** a tabela `membros` virou o cadastro universal (com `classificacao` visitante/membro). Visitantes, a criança sem pessoa e os logins sem pessoa (Administrador, Rosângela, Marcos, Cláudia e Everton) foram levados para ela pela migração `pessoas.sql` — nada foi apagado e os ids, escalas, funções, presenças e responsáveis foram preservados (backup antes em `backups/antes-da-base-universal-20261021.dump`).
- **Setores filtram a mesma base:** Participantes = todas; Crianças = menos de 18 anos pela data de nascimento (17 menores que não apareciam passaram a aparecer, para completar a ficha); Voluntários = ativos e aptos (ficha a completar, servindo ou pausado); Usuários = login de gestão, sempre de uma pessoa do cadastro.
- **Regras no servidor:** ficha de voluntário só para ativo e apto (e não altera mais a aptidão sozinha); escala só aceita voluntários elegíveis da função; ficha infantil só para menores, uma por pessoa; apto só para membros; novo login exige uma pessoa sem login; o pedido de acesso pela tela de login cria a pessoa.
- **Telas:** Participantes com filtro Menores; Voluntários e Crianças com "Completar ficha"; Usuários escolhe a pessoa do cadastro.
- **Rotas mudaram:** `POST /participantes/:id/membro` e `PATCH /participantes/:id` (o id é o da pessoa).
- **Testes:** 11 novos (`base-universal.test.js`); total 298.

## Relatório de Turmas

- Novo tipo **Turmas** em Relatórios, separado por evento (PDF e Excel com uma seção por evento; CSV em linhas), com filtros por turma e situação da sessão. Exige Relatórios e Crianças, também no download do histórico.
- **Testes:** 4 novos em `turmas-atendimento.test.js`.

## Turmas: recepção das crianças com etiqueta e retirada conferida

- **Página Turmas:** voluntário responsável abre a turma no evento (só com evento em andamento ou nos próximos 30 min), registra entrada conferindo a criança, imprime as etiquetas (criança + responsável, mesmo código e QR), registra a saída validando o código e a pessoa autorizada, e encerra a turma.
- **Etiquetas com dois códigos vinculados:** o da criança (à vista) só identifica e é recusado na saída; o código de retirada fica só na etiqueta do responsável. QR diferentes em cada etiqueta.
- **Segurança:** códigos aleatórios por atendimento, de uso único, invalidados pela 2ª via e pelo encerramento; tentativas recusadas auditadas; dados das crianças só com a turma aberta.
- **Encerramento automático** às 23h59 ou no fim do evento que passa da meia-noite, com recuperação ao iniciar o servidor; saídas regularizadas como automáticas e **alertas** para a administração (prioritário com criança presente), com tratamento registrado.
- **Gestão:** abas Sessões (com histórico completo), Alertas e Responsáveis (voluntários de cada turma); encerramento administrativo com motivo.
- **Crianças:** botão **Retirada** (quem pode buscar) e autorização no cadastro.
- **Eventos:** evento com atendimento de turma não pode ser removido.
- **Banco:** migração `atendimento-turmas.sql` (`npm run db:atendimento`); `instalacao.sql` atualizado. Dependência nova: `qrcode`.
- **Testes:** `turmas-atendimento.test.js` (17 testes) e a página Turmas no teste de layout.

## Acesso pela lista de participantes e troca rápida de página

- **Participantes:** botões **Dar acesso** (abre o Novo usuário com a pessoa escolhida) e **Editar acesso** (quem já tem login de gestão).
- **Novo usuário:**
  - quem já tem login aparece em "Já têm acesso", com **Editar acesso**. Antes, essas pessoas simplesmente não apareciam e não dava para escolher ninguém, como acontecia com quem se cadastrou pela tela de login;
  - a busca que deixa uma pessoa só já a escolhe, e a escolha não se perde ao continuar digitando.
- **Troca rápida de página:** uma página que ainda estava carregando não desenha mais por cima da página nova nem gera erro no console. Isso acontecia principalmente em Presença e Escalas. Cada página guarda a "geração" em que foi aberta (`paginaAtiva()`).
- **Testes:** 4 novos testes de interface.

## Instalação nova (banco limpo)

- `backend/database/instalacao.sql` traz a estrutura completa e as listas básicas para uma primeira instalação, sem nenhum dado de pessoas: `npm run db:instalar` num banco vazio.
- `dados-iniciais.sql` contém os dados da igreja, os departamentos, as funções, as turmas e as categorias financeiras. `npm run db:gerar-instalacao` gera de novo o arquivo depois de cada migração.
- **Testado do zero:**
  - estrutura idêntica à do banco atual;
  - migrações por cima sem erro;
  - primeiro cadastro virando administrador;
  - caminho completo (pessoa → membro → apto → voluntário → evento e escala → criança);
  - as 12 páginas abertas.

## Troca de vaga pelo próprio voluntário

- **Passar a vaga:** na Minha área, o voluntário escolhe quem assume a vaga dele, entre os voluntários da mesma função, disponíveis no dia da semana, sem ausência e sem outra escala no mesmo dia. Quem assume entra aguardando resposta e vê de quem veio a vaga.
- **Registro:** nova tabela `escala_trocas` (migração `trocas.sql`); a substituição feita pela equipe também passa a ser registrada, e o "Ver detalhes" da escala mostra a origem da vaga.
- **Pessoa recém-cadastrada:** a Minha área explica que quem define o voluntariado é a liderança. O menu do voluntário mostra "MINHA ÁREA" em vez de "ADMIN".
- **Guia do Voluntário:** apresentação passo a passo em `apresentacao/` (PowerPoint e PDF).
- **Testes:** `troca-vaga.test.js` (10 testes).

## Notificações

- **Central de avisos (sininho)** em todas as telas, inclusive no celular, com contador, "marcar todos como lidos", "limpar lidas" e toque para abrir a tela do aviso.
- **Web Push** (celular e computador, sem aplicativo): ativar/desativar por aparelho, aviso de teste, service worker `sw.js`, manifesto e ícones para "Adicionar à tela inicial" (PWA). Dependência nova: `web-push`.
- **Avisos automáticos:** escala nova, retirada, evento alterado ou removido, vaga recebida, troca entre voluntários, recusa (para a liderança) e lembretes às 18h (véspera e resumo de pendências), sem repetir.
- **Banco:** migração `notificacoes.sql`; chaves VAPID com `npm run push:chaves`.
- **Testes:** `notificacoes.test.js` (17 testes).

## Pendências conhecidas

- A tela de **Eventos** salva só o evento; funções e voluntários marcados nela não viram escala (use Escalas → Nova escala).
- O módulo **Financeiro** tem tabelas e dados, mas ainda não tem telas.
- Itens de produção (HTTPS, CORS, CSP, recuperação de senha por e-mail) estão em [Segurança](seguranca.md#limitações-conhecidas-e-recomendações-para-produção).
- **Possíveis duplicatas antigas:** 16 visitantes têm o mesmo nome de um membro e 2 nomes de visitante se repetem. Não foram unidos automaticamente (podem ser homônimos); falta uma ferramenta para unir cadastros.
- **Responsáveis:** a tabela `responsaveis` ainda guarda os contatos à parte (60 dos 65 têm o mesmo nome de um membro). Ligar cada responsável à pessoa do cadastro depende de conferência manual.
- **Edição de dados pessoais:** ainda não há tela para corrigir nome, nascimento ou contato de uma pessoa depois do cadastro.
- `frontend/backup.txt` é um rascunho antigo do HTML do dashboard e pode ser removido.
