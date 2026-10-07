# FARISA — API (Cloudflare Pages Functions + D1 + R2)

A API roda como Pages Function (`functions/api/[[path]].js` chama `backend/src/index.js`), no mesmo endereço do site, em `/api`. Banco: Cloudflare D1 (`farisa-coach`). Arquivos (vídeos, PDFs, GIFs): Cloudflare R2 (`farisa-personal-media`).

`backend/wrangler.jsonc` serve só para rodar a API no computador e aplicar migrações; a publicação é feita pelo Pages (arquivo `wrangler.jsonc` da pasta principal).

## Rodar no computador

```bash
npm install
npm run db:migrate:local
npm run dev        # porta 8787
```

O banco local fica em `.wrangler/state` e não tem relação com o do site publicado. Copie `.dev.vars.example` para `.dev.vars` e preencha o que for testar; sem a chave da Brevo, os e-mails não saem e o "esqueci a senha" mostra o link na tela.

## Segredos em produção

Cadastre em Pages → Settings → Variables and Secrets (ou `npx wrangler pages secret put NOME`). Depois de cadastrar, publique de novo para valer.

| Segredo | Para quê |
| --- | --- |
| `SESSION_SECRET` | Assina as sessões (e, por reserva, protege os dados de recebimento) |
| `BREVO_API_KEY` | Envio de e-mails |
| `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_PUBLIC_KEY` | Conta Mercado Pago da plataforma (assinaturas) |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Confere os avisos de pagamento do Mercado Pago |
| `MERCADO_PAGO_CLIENT_ID`, `MERCADO_PAGO_CLIENT_SECRET` | Conexão da conta Mercado Pago de cada personal |

Variáveis (não secretas, em `wrangler.jsonc` da pasta principal): `PUBLIC_SITE_URL`, `PUBLIC_API_URL`, `ALLOWED_ORIGIN`, `EMAIL_FROM`, `BREVO_FROM_NAME`, `SESSION_TTL_SECONDS`.

## Contas e acesso

- **Personal:** cria a própria conta na vitrine (plano Grátis). Tabela `trainers`.
- **Aluno:** se cadastra pela página do personal (`/p/<endereço>`) ou é criado por ele. Tabelas `student_accounts` (login) e `students` (ficha).
- **Administrador:** tabela `platform_admins`, separada. Criar ou trocar a senha: `npm run admin` (na pasta principal). O login pede a senha e um código enviado por e-mail.
- **Demonstração:** contas de `backend/demo/demo-seed.sql`, sempre somente leitura no servidor.

Sessão de aluno não acessa o painel; sessão de personal só vê os próprios dados; sessão de administrador não abre o painel nem a área do aluno (só pelo "acesso de suporte", com motivo e registro).

## Pagamentos

- **Alunos → personal:** na conta Mercado Pago que o personal conectar (OAuth) ou pela chave Pix dele (conferência manual). O valor é sempre calculado no servidor.
- **Personal → plataforma (Ilimitado):** Pix ou cartão na conta da plataforma, um mês por pagamento.
- Aviso do Mercado Pago: `POST /api/payments/mercadopago/webhook` (com assinatura). Estorno ou contestação tira o acesso.

## E-mails

Enviados pela Brevo (`lib/recovery-email.js`, `lib/notify.js`): redefinição de senha, boas-vindas com confirmação de e-mail, novo aluno, Pix para conferir, pagamento confirmado, plano vencendo e recibo da assinatura. Os avisos de vencimento rodam por `POST /api/public/cron`, chamado duas vezes por dia pelo worker da pasta `agendador`.

## Migrações

Ficam em `migrations-d1`, numeradas em ordem. Para criar uma mudança de banco, adicione o próximo número e rode `npm run db:migrate:remote` (na pasta principal) antes de publicar. Nunca edite uma migração que já foi aplicada.

## Proteções

Limite de tentativas em login, cadastro, redefinição de senha e cartão (`lib/rate-limit.js`); "Sair" invalida o token (`revoked_sessions`); textos limitados a 10 mil caracteres; erros do servidor ficam em `error_log` (Admin → Registro de ações → Erros do sistema).
