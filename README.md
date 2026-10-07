# FARISA

Plataforma (SaaS) para personal trainers: cada personal tem a própria página, com a marca dele, a área do aluno, fichas de treino com vídeo e GIF, avaliação física, agenda e recebimento dos alunos direto na conta dele.

- **Vitrine da plataforma:** `/` (para personais conhecerem e criarem a conta).
- **Página de cada personal:** `/p/<endereço>` (site dele + área do aluno).
- **Painel do personal:** `/personal/`.
- **Administração (dono da plataforma):** `/admin/`.

## Planos

Dois planos para o personal: **Grátis** (permanente, com limite de alunos e de espaço) e **Ilimitado** (mensal, pago por Pix ou cartão, sem renovação automática). Os valores e limites são editados em Admin → Planos.

## Rodar no computador

```bash
npm install
npm --prefix backend install
npm run db:migrate:local
npm run dev
```

O site abre na porta 5173 e a API na 8787. `Ctrl+C` encerra os dois.

## Publicar

A publicação é automática: todo `git push` na branch `main` publica o site na Cloudflare Pages.

```bash
npm run db:migrate:remote   # só quando houver arquivo novo em backend/migrations-d1
git add -A && git commit -m "o que mudou" && git push
```

Se o primeiro comando der o erro **7403**, o login da Cloudflare expirou:

```bash
npx --prefix backend wrangler logout
npm run wrangler:login
```

## Comandos úteis

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Site e API no computador |
| `npm run build` | Monta o site em `dist/` |
| `npm test` | Testes automáticos (rode depois do build) |
| `npm run db:migrate:remote` | Aplica as mudanças de banco no site publicado |
| `npm run backup` | Baixa uma cópia do banco para `backups/` (fora do GitHub) |
| `npm run agendador:publicar` | Publica o agendador dos avisos diários (só quando ele mudar) |
| `npm run admin` | Cria o administrador ou troca a senha dele |
| `npm run senha` | Troca a senha de um personal |
| `npm run demo:reset:remote` | Recria a conta de demonstração da vitrine |

## Estrutura

- `index.html`: vitrine, página do personal, área do aluno e painel (uma página só).
- `admin/index.html` + `src/admin`: administração.
- `src/modules`, `src/styles`: telas e estilos.
- `public`: ícones, banners, manifestos, Termos e Política de Privacidade.
- `functions/api`: a API (chama `backend/src`). `functions/p`: título e prévia de compartilhamento da página de cada personal.
- `backend/src`: rotas da API. `backend/migrations-d1`: mudanças do banco, em ordem.
- `agendador`: worker que chama o site duas vezes por dia (avisos de vencimento).
- `tests`: testes automáticos.

## Chaves e segredos

Chaves reais ficam **somente** nos Secrets da Cloudflare (Pages → Settings → Variables and Secrets). Nunca no código, no GitHub ou em conversas. No computador, ficam em `backend/.dev.vars` (ignorado pelo git).

Detalhes da API, dos segredos e dos e-mails: `backend/README.md`.
