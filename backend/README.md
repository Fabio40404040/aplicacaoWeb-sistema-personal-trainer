# FARISA Personal — Cloudflare Workers + D1

O backend usa Cloudflare D1 (SQLite), sem PostgreSQL ou Hyperdrive. HTML, CSS e JavaScript continuam separados no frontend.

## Testar localmente

1. Na pasta backend, execute npm install.
2. No primeiro npm run dev, uma chave de sessão aleatória local será criada automaticamente em .dev.vars, sem substituir uma configuração existente.
3. Execute npm run db:migrate:local.
4. Execute npm run dev. O Worker escuta na porta 8787.
5. Na raiz do projeto, execute npm run dev. O Vite encaminha /api para o Worker local.

O banco local é persistido pelo Wrangler em .wrangler/state. Não é o banco de produção.

## Publicar na Cloudflare

1. Autentique o Wrangler com npx wrangler login.
2. Crie o banco com npx wrangler d1 create farisa-coach.
3. Em wrangler.jsonc, substitua database_id pelo ID retornado. O binding deve continuar DB.
4. Execute npm run db:migrate:remote.
5. Cadastre as chaves de produção com `npx wrangler secret put SESSION_SECRET` e `npx wrangler secret put BREVO_API_KEY`.
6. Ajuste ALLOWED_ORIGIN para a origem HTTPS do frontend.
7. Execute npm run deploy.
8. Defina VITE_API_URL com a URL do Worker antes de compilar/publicar o frontend.

Não publique com o ID composto por zeros. Nenhum banco remoto é criado pelos comandos locais.

## Primeiro personal

Gere o hash com node scripts/hash-password.mjs SUA_SENHA e insira no D1:

```sql
INSERT INTO trainers (name, email, password_hash)
VALUES ('Fábio Santos', 'contato@farisa.example', 'COLE_AQUI_O_HASH_GERADO');
```

O registro do aluno é separado da conta do personal. Tokens de aluno não acessam a administração. A vinculação autorizada entre contas de aluno e fichas de treino ainda está pendente; o painel mostra a espera por liberação.

## Recuperação de senha

O aluno e o personal possuem fluxos separados de recuperação. O Worker envia os links pela API HTTPS de e-mails transacionais do Brevo.

No ambiente local, copie as variáveis de `.dev.vars.example` para `.dev.vars`: use uma chave de API do Brevo em `BREVO_API_KEY`, um remetente validado em `EMAIL_FROM` e, opcionalmente, `BREVO_FROM_NAME` e `BREVO_REPLY_TO`. O nome antigo `BREVO_FROM_EMAIL` continua aceito por compatibilidade. Sem provedor configurado, o desenvolvimento local mostra um botão com o link para facilitar o teste, mas não envia e-mail.

Para produção, valide o remetente ou domínio no Brevo, configure `EMAIL_FROM`, ajuste `PUBLIC_SITE_URL` para a URL HTTPS publicada e cadastre `BREVO_API_KEY` como secret do Worker. Nunca coloque a chave do Brevo no frontend ou no repositório.

Os tokens expiram em 30 minutos, são armazenados somente como hash e consumidos em um batch transacional D1. A troca de senha invalida as sessões anteriores da respectiva conta. Configure limitação de requisições na Cloudflare antes de disponibilizar os endpoints publicamente.

## Migrações

As migrações ficam em migrations-d1 e são aplicadas pelo Wrangler.

Documentação: https://developers.cloudflare.com/d1/get-started/ e https://developers.brevo.com/docs/send-a-transactional-email

## Painel do administrador

O menu "Administração" do painel aparece só para o administrador da plataforma. Ele lista todos os personal trainers cadastrados, com o número de alunos, alunos com acesso, fichas, data de cadastro e último acesso.

Quem é administrador:

- os e-mails em `ADMIN_EMAILS` (separados por vírgula), se essa variável existir no `wrangler.jsonc`;
- sem `ADMIN_EMAILS`, o personal dono do site (o primeiro cadastrado).

O servidor confere isso em toda chamada de `/api/admin/*` (`src/routes/admin.js`). O último acesso vem da migração 020.

## Recuperação de senha

"Esqueci a senha" funciona para personal e aluno. No site publicado, o e-mail sai pela Brevo: cadastre o segredo `BREVO_API_KEY` no Cloudflare. `EMAIL_FROM` precisa ser um remetente validado na Brevo.

## Remoção da antiga conta de demonstração

`npm run demo:remover` (na pasta principal) apaga a conta `demo@farisa.example`, os alunos fictícios e tudo deles, no banco do computador e no do site publicado (`scripts/remover-demo.sql`). As outras contas não são tocadas.
