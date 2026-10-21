# Instalação e configuração

[← Voltar ao README](../README.md)

## Pré-requisitos

| Programa | Versão usada | Para quê |
|---|---|---|
| Node.js | 24 (funciona a partir do 20) | Servidor e testes |
| PostgreSQL | 18 (funciona a partir do 14) | Banco de dados; o `pg_dump`/`pg_restore` também são usados no backup e nos testes |
| Google Chrome ou Microsoft Edge | qualquer recente | Só para os testes de layout |

## 1. Instalar as dependências

```bash
npm install
```

## 2. Configurar o `.env`

O servidor lê as variáveis de `backend/src/.env` (o arquivo está no `.gitignore` e nunca deve ir para o repositório). Copie o modelo:

```bash
cp backend/src/.env.example backend/src/.env
```

| Variável | Obrigatória | Descrição |
|---|---|---|
| `PORT` | não (3000) | Porta do servidor |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | sim | Conexão com o PostgreSQL |
| `AUTH_SECRET` | **sim em produção** | Chave que assina os tokens de login. Sem ela o servidor gera uma chave temporária e todos precisam entrar de novo a cada reinício |
| `PG_DUMP_PATH` | não | Caminho do `pg_dump` para o backup. No Windows o sistema procura sozinho em `C:\Program Files\PostgreSQL\<versão>\bin` |
| `DB_NAME_TESTE` | não | Nome do banco de testes (padrão: `<DB_NAME>_teste`) |

Para gerar uma chave forte:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 3. Criar o banco

### Banco base

O esquema original (membros, voluntários, escalas, financeiro…) está no dump mais recente da raiz, `dump-igreja_sistema-202610060830.sql` (formato *custom* do `pg_dump`):

```bash
createdb -U postgres igreja_sistema
```

```bash
pg_restore -U postgres -d igreja_sistema --no-owner dump-igreja_sistema-202610060830.sql
```

### Migrações e dados de teste

Aplique as migrações na ordem e, se quiser dados de exemplo, o seed:

```bash
npm run db:setup
```

Isso executa, em ordem:

1. `db:presenca` — tabelas da lista de presença (`cadastroturmas`, `turmas`).
2. `db:paginas` — colunas e tabelas das páginas de gestão, novos perfis, `relatorios_gerados`.
3. `db:voluntario` — ligação login ↔ membro, recusas e ausências do voluntário.
4. `db:cadastro` — dados pessoais do visitante e ligação visitante → membro.
5. `db:seed` — ~6 meses de histórico + 2 meses de agenda; complementos; logins do portal.
6. `db:pessoas` — base universal de pessoas (leva visitantes, crianças e logins para o cadastro único).

Todas as migrações **só acrescentam** estruturas e podem ser rodadas mais de uma vez. O seed não roda duas vezes no mesmo banco (verifica o usuário `admin@novocaminho.org`). Detalhes em [Banco de dados](banco-de-dados.md).

> **Em produção** rode só as migrações (`db:presenca`, `db:paginas`, `db:voluntario`, `db:cadastro`, `db:pessoas`) e crie o primeiro administrador pela tela de registro: quando não existe nenhum administrador ativo, o primeiro cadastro vira administrador automaticamente.

## 4. Rodar

```bash
npm start
```

Acesse `http://localhost:3000`. Durante o desenvolvimento use `npm run dev` para reiniciar sozinho a cada alteração.

## 5. Conferir com os testes

```bash
npm test
```

Os testes criam e usam um banco separado (`igreja_sistema_teste`), cópia do principal — nunca escrevem no banco de verdade. Veja [Testes](testes.md).

## Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| Todos precisam entrar de novo após reiniciar | `AUTH_SECRET` não definido | Defina a chave no `.env` |
| "Muitas tentativas. Tente novamente em X minutos" | Proteção contra força bruta (10 erros por login / 50 por IP em 15 min) | Aguarde ou reinicie o servidor |
| Backup falha em Configurações | `pg_dump` não encontrado | Instale as ferramentas do PostgreSQL ou defina `PG_DUMP_PATH` |
| Textos como "Recep‡Æo" no banco | Script SQL rodado no terminal do Windows (CP850) | Rode os scripts com `node backend/database/executar.js arquivo.sql` (sempre UTF-8). O seed corrige os textos já afetados |
| Testes de layout falham ao abrir o navegador | Chrome/Edge não instalado | Instale um dos dois |
| `relation "turmas" does not exist` | Migrações não aplicadas | `npm run db:presenca && npm run db:paginas && npm run db:voluntario && npm run db:cadastro && npm run db:pessoas` |

## Restaurar um backup

Os backups ficam em `backups/` (formato *custom*). Para restaurar por completo (substitui o banco atual — pare o servidor antes):

```bash
pg_restore -U postgres -d igreja_sistema --clean --if-exists --single-transaction backups/backup-AAAAMMDD-HHMMSS.dump
```

> Se depois do backup foram criadas tabelas que dependem de tabelas existentes (por exemplo, após aplicar uma migração nova), o `--clean` pode falhar ao remover chaves. Como o `--single-transaction` desfaz tudo em caso de erro, o banco fica intacto; remova a tabela nova e repita.
