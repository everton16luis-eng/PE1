# Igreja Novo Caminho — Sistema de Gestão

Sistema web para a gestão de uma igreja: membros e visitantes, voluntários e suas escalas, ministério infantil (crianças, turmas e lista de presença), relatórios, usuários e configurações — com um **portal próprio para o voluntário** confirmar escalas e informar ausências.

- **Backend:** Node.js + Express 5, padrão MVC (rotas → controllers → models), PostgreSQL via `pg`.
- **Frontend:** HTML, CSS e JavaScript puros, em uma única página (`index.html`) que troca o conteúdo por funções `gerencia...()`; responsivo do celular ao desktop.
- **Testes:** 363 testes automatizados (`node:test` + `playwright-core`) de segurança, SQL injection, regras de negócio e layout.

## Funcionalidades

| Área | O que faz |
|---|---|
| Login | Entrada por e-mail ou telefone, cadastro com aprovação do administrador, sessão com token assinado |
| Dashboard | Totais, escalas da semana, confirmações pendentes, gráfico do mês, próximos eventos |
| Eventos | Criação de eventos e lista de todos os eventos |
| Lista de presença | Entrada e saída de membros nas turmas, por data |
| Participantes | Membros e visitantes, cadastro (membro pode já virar voluntário) |
| Voluntários | Lista, cadastro e **ficha completa** (escalas, histórico, ausências, acesso ao portal) |
| Escalas | Calendário mensal, escalas do dia, confirmação, nova escala com verificação de ausências |
| Funções | Funções dos voluntários, vagas da equipe e dias de uso |
| Crianças / Turmas | Cadastro com responsável e autorizações; turmas por faixa etária |
| Relatórios | 7 relatórios com filtros, pré-visualização e exportação PDF, Excel e CSV |
| Usuários | Perfis e permissões por área, com proteção contra escalada de privilégio |
| Configurações | Dados da igreja, preferências e **backup real** do banco (manual e automático) |
| Minha área (portal) | O voluntário vê as próprias escalas, confirma ou recusa, informa ausências, troca a senha; membros e visitantes veem os próximos eventos da igreja |

## Início rápido

```bash
npm install
```

1. Crie `backend/src/.env` a partir de [`backend/src/.env.example`](backend/src/.env.example).
2. Crie o banco: para uma instalação nova (banco limpo), `npm run db:instalar`; para desenvolver com dados de teste, restaure o banco base e rode `npm run db:setup`. Veja [Instalação](docs/instalacao.md).
3. Inicie o servidor:

```bash
npm start
```

Acesse `http://localhost:3000` e entre com um dos usuários de teste (senha `Teste@123`):

| Login | Perfil |
|---|---|
| `admin@novocaminho.org` | Administrador |
| `secretaria@novocaminho.org` | Secretaria |
| `tesouraria@novocaminho.org` | Financeiro (só relatórios) |
| `voluntario1@novocaminho.org` … `voluntario3@` | Voluntário (portal) |

> Esses logins só existem depois de rodar o seed de teste (`npm run db:seed`). Não use essas senhas em produção.

## Scripts

| Comando | O que faz |
|---|---|
| `npm start` | Inicia o servidor na porta `PORT` (padrão 3000) |
| `npm run dev` | Inicia com recarga automática (nodemon) |
| `npm test` | Recria o banco de testes e roda **todos** os testes |
| `npm run test:seguranca` | Só os testes de segurança e SQL injection |
| `npm run test:layout` | Só os testes de interface no navegador |
| `npm run db:instalar` | Instalação nova: estrutura completa e dados iniciais num banco vazio, sem dados de teste |
| `npm run db:gerar-instalacao` | Gera de novo o `instalacao.sql` depois de uma migração nova |
| `npm run db:setup` | Aplica todas as migrações e o seed de teste |
| `npm run db:presenca` / `db:paginas` / `db:voluntario` / `db:cadastro` / `db:pessoas` / `db:acesso` / `db:relatorios` / `db:trocas` / `db:notificacoes` / `db:atendimento` | Aplica cada migração isoladamente |
| `npm run db:seed` | Gera ~6 meses de dados de teste + complementos |

## Estrutura

```
├── backend/
│   ├── database/        migrações (.sql), seeds e executor de scripts
│   └── src/
│       ├── config/      conexão, segurança, backup, erros, regras compartilhadas
│       ├── middlewares/ autenticação, permissões e bloqueio do portal
│       ├── models/      consultas SQL (parametrizadas)
│       ├── controllers/ validação e respostas HTTP
│       ├── routes/      endereços da API
│       └── server.js    aplicação Express
├── frontend/
│   ├── index.html       página única
│   ├── css/style.css    estilos (responsivos)
│   ├── js/              um arquivo por área + script.js (núcleo e rotas)
│   └── img/             logo
├── tests/               testes automatizados e banco de testes
├── backups/             backups gerados (fora do git)
└── docs/                documentação
```

## Documentação

| Documento | Para quem |
|---|---|
| [Instalação e configuração](docs/instalacao.md) | Quem vai instalar ou rodar o sistema |
| [Arquitetura](docs/arquitetura.md) | Quem vai programar: como o código está organizado e como criar uma página nova |
| [Banco de dados](docs/banco-de-dados.md) | Tabelas, relacionamentos, migrações, seeds e backups |
| [API](docs/api.md) | Referência de todos os endpoints |
| [Segurança](docs/seguranca.md) | Login, perfis, permissões e proteções |
| [Testes](docs/testes.md) | Como rodar e escrever testes |
| [Manual da gestão](docs/manual-gestao.md) | Secretaria, líderes e administradores |
| [Manual do voluntário](docs/manual-voluntario.md) | Voluntários usando a Minha área |
| [Histórico de mudanças](docs/historico-de-mudancas.md) | O que foi construído e corrigido |

## Licença

[MIT](LICENSE) © 2026 Everton Vieira
