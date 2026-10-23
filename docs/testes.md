# Testes automatizados

[← Voltar ao README](../README.md)

São **359 testes**, escritos com o executor nativo do Node (`node:test`) e, para a interface, `playwright-core` controlando o Chrome ou o Edge já instalados (sem baixar navegador).

## Como rodar

```bash
npm test
```

Isso recria o banco de testes e roda tudo (cerca de 1 minuto). Para rodar só uma parte:

```bash
npm run test:seguranca
```

```bash
npm run test:layout
```

Um arquivo específico (o banco de testes precisa existir):

```bash
node --test tests/voluntario.test.js
```

## Banco de testes isolado

`tests/preparar-banco.js` apaga e recria `igreja_sistema_teste` como **cópia** do banco principal (`pg_dump` + `pg_restore`). Os testes sobem a API apontando para esse banco e recusam rodar se o banco não terminar em `_teste`, então **nunca escrevem nos dados reais**. Requer as ferramentas do PostgreSQL (veja `PG_DUMP_PATH` em [Instalação](instalacao.md)).

## O que cada arquivo cobre

| Arquivo | Cobre |
|---|---|
| `seguranca-acesso.test.js` | Todas as rotas sem login (401); tokens falsos, adulterados, expirados, de usuário desativado ou apagado; mensagens de login que não revelam contas; força bruta (429); registro não escolhe perfil; matriz de permissões por área; escalada de privilégio; hash de senha nunca exposto; tentativas de ler `.env`, `.git` e `package.json`; cabeçalhos de segurança; JSON malformado e corpo gigante |
| `sql-injection.test.js` | 12 ataques (`' OR '1'='1`, `; DROP TABLE`, `UNION SELECT`, `pg_sleep`…) no login, em parâmetros de URL, IDs, filtros de relatório e campos de cadastro. Verifica que nenhuma tabela perdeu registros, que os textos são gravados literalmente e que não vaza mensagem do banco. Também valida 14 entradas inválidas (400) |
| `voluntario.test.js` | Portal: bloqueio de todas as rotas de gestão, dados só do próprio voluntário, confirmar/recusar/"mudei de ideia", não responder escala alheia nem passada, ausências (conflitos e períodos inválidos), preferências, troca de senha. Ficha: permissão, edição, recusa e retirada de escala. Acesso ao portal: criação, perfil e permissões, duplicidade, bloqueio |
| `melhorias.test.js` | Cadastro sempre como visitante (campos de privilégio ignorados); promoção a membro e apto/ativo só por administrador, com as regras de consistência; Usuários sem contas do portal; turma Next por último; editar e remover eventos (permissão, validação, escalas junto); formato das escalas da semana; Minha área por classificação (voluntário, membro, visitante); relatório de pendentes |
| `base-universal.test.js` | Base universal de pessoas: integridade (toda visita, ficha e login aponta para uma pessoa), um cadastro passando pelos setores (Participantes, Crianças < 18, Voluntários = ativo e apto, Usuários = login de gestão), quem faz 18 anos sai de Crianças, ficha infantil e de voluntário sem duplicar a pessoa, pedido de acesso cria a pessoa, classificação só pelo administrador, escala só com voluntários elegíveis |
| `turmas-atendimento.test.js` | Turmas: abertura só com evento elegível (30 min antes, nunca depois do fim); vínculo do voluntário; voluntário sem acesso à gestão; entrada (sem duplicar, quem fez); dados só para quem opera; etiquetas com dois códigos e dois QR distintos, sem contatos; código da etiqueta da criança recusado na saída (digitado ou QR); saída com o código de retirada da própria criança e pessoa autorizada; reuso, outra criança, outra sessão, 2ª via; duas retiradas simultâneas; volta depois de sair; encerramento manual exige todos fora; encerramento administrativo; evento com atendimento não é removido; encerramento automático às 23h59 e após a meia-noite, recuperação, idempotência, alertas e tratamento; vínculos pela administração |
| `layout.test.js` | Login e registro no mesmo padrão em celular, tablet e desktop; todas as páginas sem erro de JavaScript e sem rolagem horizontal; título não sobreposto; menu lateral no celular; calendário; listas que só aparecem após busca/filtro; botões Voltar/Avançar e recarregar; formulários não ficam no histórico; ficha do voluntário; portal (confirmar e recusar pela tela); XSS; menu de usuário restrito; troca rápida de página sem desenhar a página antiga; acesso pela lista de participantes (Dar acesso, "Já têm acesso") |
| `apoio.js` | Funções comuns: sobe a API no banco de testes (`iniciar`, `encerrar`), faz requisições (`api`), cria usuários com perfil/permissões (`criarUsuario`), conta registros (`contar`), encontra voluntário com escalas (`voluntarioComEscalas`) |

## Escrevendo um teste

```js
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar, encerrar, api, criarUsuario, NENHUMA } = require('./apoio');

let usuario;
before(async () => {
    await iniciar();
    usuario = await criarUsuario({ perfil: 'SECRETARIA', permissoes: { ...NENHUMA, criancas: true } });
});
after(encerrar);

test('quem só tem "criancas" não vê participantes', async () => {
    const r = await api('/api/participantes', { token: usuario.token });
    assert.equal(r.status, 403);
});
```

Boas práticas usadas no projeto:

- Cada arquivo cria os próprios usuários (e-mails `@exemplo.test`) e não depende da ordem de outros arquivos.
- Para toda rota nova, teste: sem login (401), sem permissão (403), entrada inválida (400) e o caminho feliz.
- Em testes de tela, registre erros de JavaScript (`pagina.on('pageerror')`) e confira que a lista final está vazia.
- Os dados do seed mudam com a data; busque o que o teste precisa no banco (ex.: `voluntarioComEscalas`) em vez de fixar ids.
