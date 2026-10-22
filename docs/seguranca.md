# Segurança

[← Voltar ao README](../README.md)

## Login e sessão

- **Senhas** são guardadas como `scrypt$<sal>$<hash>` (sal aleatório por usuário; comparação em tempo constante). O hash nunca sai da API.
- **Token** (`backend/src/config/seguranca.js`): `<dados em base64url>.<assinatura HMAC-SHA256>` com `id`, `perfil` e validade de **12 horas**, assinado com `AUTH_SECRET`. Qualquer alteração no conteúdo invalida a assinatura.
- A cada requisição o usuário é **recarregado do banco**: desativar ou apagar um usuário derruba o acesso imediatamente, mesmo com token válido.
- **No navegador** o token fica no `sessionStorage` (só a aba) ou no `localStorage` quando "Lembrar de mim" está marcado. "Sair" apaga os dois.
- **Mensagens de login** são iguais para e-mail inexistente e senha errada (não revela quem tem conta).
- **Força bruta:** após 10 tentativas erradas para o mesmo login, ou 50 vindas do mesmo IP, em 15 minutos, o login responde **429** até a janela passar (`backend/src/config/limiteLogin.js`).
- **Registro público** cria usuário `VISUALIZACAO` **ativo**, sem nenhuma área de gestão (usuário padrão): entra na hora, mas só vê a Minha área. Ativação e autorização são separadas — quem dá áreas de gestão é um administrador, em Usuários. Campos como `perfil`, `ativo` e `permissoes` enviados no registro são ignorados.

## Perfis e permissões

Cada usuário tem um **perfil** e um conjunto de **permissões por área**. O administrador tem acesso a tudo.

| Área (permissão) | Libera |
|---|---|
| `participantes` | Participantes |
| `voluntarios` | Voluntários, ficha do voluntário, Funções |
| `escalas` | Escalas (e o item Eventos no menu) |
| `criancas` | Crianças, Turmas (e o item Lista de presença no menu) |
| `relatorios` | Relatórios (o de Usuários exige também `usuarios`) |
| `usuarios` | Usuários; criar/bloquear acesso de voluntário ao portal |

Permissões padrão aplicadas pela migração a quem não tinha nenhuma:

| Perfil | Permissões |
|---|---|
| `ADMINISTRADOR` | Todas (sempre) |
| `GESTOR`, `SECRETARIA` | Todas, menos `usuarios` |
| `FINANCEIRO` | Só `relatorios` |
| `VOLUNTARIO` | Nenhuma — só o portal |
| `VISUALIZACAO` | Só `escalas` |

Regras do servidor (o frontend apenas esconde o que o usuário não pode usar):

- **Dashboard, Eventos, Lista de presença e leitura das Configurações** exigem apenas login de gestão.
- **Alterar Configurações e fazer backup:** só administrador.
- **Quem não é da equipe de gestão** (perfil Voluntário e usuário padrão, sem nenhuma área marcada) só acessa `/api/auth/me` e `/api/portal/*` (`restringirAreaDeGestao`, regra em `config/acesso.js`); todo o resto — Dashboard, Configurações, Eventos, listas de apoio — responde 403. No navegador, qualquer endereço leva à Minha área (`/auth/me` devolve `gestao`).
- **Portal:** o voluntário é identificado pelo login (`usuarios.id_membro`). Nenhuma rota do portal aceita id de voluntário, então um voluntário não consegue ver nem alterar dados de outro. As observações internas da equipe não são enviadas ao portal, e só escalas futuras podem ser respondidas.

### Contra escalada de privilégio

Quem tem a permissão `usuarios` mas **não** é administrador:

- não cria administradores nem promove alguém a administrador;
- não edita contas de administrador (inclusive a senha);
- não altera o próprio perfil nem as próprias permissões;
- só concede permissões que ele mesmo possui (pode manter as que o usuário editado já tinha).

Além disso, o sistema recusa deixar a igreja sem nenhum administrador ativo.

## Proteções da aplicação

| Ameaça | Proteção |
|---|---|
| SQL injection | Todas as consultas usam parâmetros (`$1, $2…`). Filtros de relatório só aceitam valores de listas fixas; o resto é ignorado. Coberto por testes com 12 ataques clássicos em todos os parâmetros |
| XSS | Todo texto do banco inserido como HTML passa por `escapar()`; o restante usa `textContent`. Testado com `<img onerror>` |
| Vazamento de detalhes internos | `responderErro` troca erros do banco por mensagens amigáveis; 500 é sempre genérico. JSON malformado → 400 sem stack trace |
| Clickjacking | `X-Frame-Options: DENY` |
| Tipo de arquivo adulterado | `X-Content-Type-Options: nosniff` |
| Identificação do servidor | `X-Powered-By` removido |
| Vazamento de URL | `Referrer-Policy: same-origin` |
| Recursos do dispositivo | `Permissions-Policy` bloqueia câmera, microfone e localização |
| Cache de dados sensíveis | `Cache-Control: no-store` nas respostas da API |
| Requisições gigantes | Corpo limitado a 100 KB (413) |
| Arquivos do servidor | Só a pasta `frontend/` é pública; arquivos ocultos (`.env`) são negados. Testado com tentativas de *path traversal* |
| Perda de dados | Backup manual e automático (`pg_dump`); migrações só acrescentam estruturas; seeds e testes rodam em transação ou em banco separado |

## Segredos

- `backend/src/.env` está no `.gitignore` — **nunca** o envie ao repositório. Use `backend/src/.env.example` como modelo.
- Gere um `AUTH_SECRET` forte e único por ambiente. Trocar a chave desconecta todos os usuários.
- A pasta `backups/` também está fora do git: os arquivos contêm todos os dados, inclusive os hashes de senha.

## Limitações conhecidas e recomendações para produção

| Item | Situação | Recomendação |
|---|---|---|
| HTTPS | O servidor fala HTTP | Publicar atrás de um proxy com HTTPS (Nginx, Caddy, serviço de hospedagem) |
| CORS | Aberto (`cors()`) | Restringir à origem do site se a API for usada só por ele |
| Content-Security-Policy | Não definida (há estilos em linha) | Definir após remover os `style="..."` em linha |
| Token no navegador | `localStorage`/`sessionStorage` | Aceitável com o escape de XSS atual; para mais segurança, migrar para cookie `HttpOnly` |
| Limite de login | Em memória (zera ao reiniciar; não é compartilhado entre vários servidores) | Usar um armazenamento compartilhado se houver mais de uma instância |
| Recuperação de senha | Não há envio por e-mail; o administrador redefine em Usuários | Implementar fluxo com link de uso único |
| Rotas legadas | `POST /criarEvento` e `POST /criarFuncao` (só login, validação mínima) | Remover quando confirmado que nada mais as usa |
| Dependências | `npm audit` aponta 3 alertas no `nodemon` (via `braces`), só em desenvolvimento | Atualizar quando houver versão corrigida |
| Senhas de teste | Seeds usam `Teste@123` | Nunca rodar os seeds em produção |
