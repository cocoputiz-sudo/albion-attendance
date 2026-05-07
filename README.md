# Bomb Attendance Tracker — Albion Online

Sistema de attendance para CTAs de guild, com kills e re-gear.

## Estrutura

```
albion-attendance/
├── src/
│   ├── server.js      ← API Express + todas as rotas
│   └── db.js          ← Conexão PostgreSQL + criação das tabelas
├── public/
│   └── index.html     ← Frontend completo (HTML/CSS/JS)
├── package.json
├── railway.toml
└── .env.example
```

## Deploy no Railway (passo a passo)

### 1. Criar conta e projeto
1. Acesse [railway.app](https://railway.app) e crie uma conta
2. Clique em **New Project**

### 2. Adicionar banco PostgreSQL
1. No projeto, clique em **+ New** → **Database** → **PostgreSQL**
2. O Railway vai provisionar o banco automaticamente
3. A variável `DATABASE_URL` é injetada automaticamente no serviço Node

### 3. Fazer upload do código
**Opção A — GitHub (recomendado):**
1. Crie um repositório no GitHub e faça push desta pasta
2. No Railway: **+ New** → **GitHub Repo** → selecione o repositório
3. Railway detecta Node.js automaticamente via `railway.toml`

**Opção B — Railway CLI:**
```bash
npm install -g @railway/cli
railway login
railway link          # selecione o projeto criado
railway up            # faz deploy
```

### 4. Configurar variáveis de ambiente
No painel do Railway, no serviço Node, vá em **Variables** e adicione:

| Variável | Valor |
|----------|-------|
| `ADMIN_PASS` | `exemplo123` (ou outra senha) |
| `NODE_ENV` | `production` |

> A `DATABASE_URL` já é injetada automaticamente pelo PostgreSQL do Railway.

### 5. Gerar domínio público
1. No serviço Node → **Settings** → **Networking** → **Generate Domain**
2. Copie o link e envie para os membros do guild

---

## Rodando localmente

```bash
# Instalar dependências
npm install

# Criar arquivo .env
cp .env.example .env
# Edite .env com sua DATABASE_URL local (ou use o Railway dev)

# Iniciar servidor de desenvolvimento
npm run dev

# Acesse: http://localhost:3000
```

## Usuários

- **Player:** seleciona o próprio nick, sem senha. Pode marcar só a si mesmo.
- **Admin:** usa a senha definida em `ADMIN_PASS`. Controle total.

## Banco de dados

As tabelas são criadas automaticamente na primeira inicialização (`src/db.js`):

- `attendance` — presença por player/data/CTA
- `kills` — kills registrados com print opcional
- `regear` — pedidos de re-gear com print obrigatório e status (pending/approved/denied)

## Segurança

> ⚠️ Este sistema usa autenticação simples por senha/nick. Para um guild ele é suficiente, mas não use para aplicações com dados sensíveis.

- A senha admin trafega no header `x-admin-pass` — use HTTPS (Railway provisiona automaticamente)
- Players são autenticados pelo nick — qualquer pessoa que saiba o nick pode entrar como aquele player
- Se quiser mais segurança, adicione senhas individuais por player no futuro
