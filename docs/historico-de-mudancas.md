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
- **Testes:** 13 novos, totalizando 282.

## Pendências conhecidas

- A tela de **Eventos** salva só o evento; funções e voluntários marcados nela não viram escala (use Escalas → Nova escala).
- O módulo **Financeiro** tem tabelas e dados, mas ainda não tem telas.
- Itens de produção (HTTPS, CORS, CSP, recuperação de senha por e-mail) estão em [Segurança](seguranca.md#limitações-conhecidas-e-recomendações-para-produção).
- `frontend/backup.txt` é um rascunho antigo do HTML do dashboard e pode ser removido.
