# Élise — Fullstack Pro (React + NestJS + Gemini)

Assistante confidentielle de santé féminine — AI Innovation Challenge 2026, e-Warriors ESATIC.

## Stack
- **Frontend** : React 18 + Vite (port 5173)
- **Backend** : NestJS 10 + TypeORM + SQLite (port 3001, préfixe `/api`)
- **IA** : Google Gemini (`gemini-1.5-flash`) via `@google/generative-ai`, avec **fallback local** si pas de clé
- **Safety Engine** : classification GREEN/YELLOW/ORANGE/RED + urgences CI (185 / 1308 / 139)

## Lancement rapide

```bash
# 1. Backend
cd backend
cp .env.example .env   # puis mets ta clé GEMINI_API_KEY dedans (optionnel, marche sans)
npm install
npm run start:dev      # http://localhost:3001/api/chat/status

# 2. Frontend (autre terminal)
cd frontend
npm install
npm run dev            # http://localhost:5173
```

Sans clé Gemini, l'app marche en **mode local** (mots-clés + réponses expertes). Avec clé, classification + réponses via Gemini.

## Endpoints
- `POST /api/chat` `{message}` → `{answer, level, label, reason, via}`
- `GET /api/chat/history`, `GET /api/chat/status`, `GET /api/resources`

## Obtenir une clé Gemini (gratuit)
1. https://aistudio.google.com → Get API Key
2. Mets-la dans `backend/.env` : `GEMINI_API_KEY=ta_cle`
3. Relance le backend → badge "Gemini ON" dans le frontend.

## Déploiement (Railway)

Le backend sert aussi le **build statique du frontend** (via `@nestjs/serve-static`) :
**un seul service, un seul domaine**, pas de CORS ni de reverse-proxy à configurer.

La config est dans `railway.json` à la racine (build Nixpacks, start, health check).
Le backend lit `process.env.PORT` → compatible avec le port que Railway assigne.

### Étapes
1. Pousse le projet sur GitHub (le `.gitignore` exclut `node_modules`, `dist`, `.env`)
   ```bash
   git remote add origin https://github.com/<toi>/elise-fullstack.git
   git push -u origin master
   ```
2. Sur [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo** → sélectionne le repo
   (Railway détecte `railway.json` automatiquement, builder **Nixpacks**)
3. ⚠️ **Root Directory doit être vide** (la racine du repo) : le build fait
   `cd backend && ... && cd ../frontend && ...`. Si Root Directory pointe sur `backend`,
   la commande échoue avec `cd: can't cd to backend`.
   Le `package.json` à la racine du repo n'est qu'un detecteur Node/npm pour railpack
   (aucune dépendance) — ne pas le supprimer.
4. Dans **Variables** du service, ajoute :
   - `ANTHROPIC_API_KEY` = ta clé Anthropic (obtenue sur https://console.anthropic.com → API keys)
   - `CLAUDE_MODEL` (optionnel, défaut `claude-haiku-4-5-20251001`)
5. **Settings → Networking → Generate Domain** → `https://ton-app.up.railway.app`

### Alternative sans GitHub (CLI)
```bash
npm i -g @railway/cli
railway login
railway init   # à la racine du projet
railway up
```

Build exécuté par Railway (Nixpacks) :
```bash
cd backend && npm ci && npm run build && cd ../frontend && npm ci && npm run build
# démarrage : node backend/dist/main.js
```

Testé en local avec ces commandes exactes : `/` (SPA), `/assets/*`, `/logo-elise.png`,
`GET /api/chat/status` (health check) → **200**, `POST /api/chat`, `POST /api/chat/stream` (SSE),
`GET /api/resources` → OK.

### Notes de production
- `start:prod` = `node dist/main.js` (le `start` reste `ts-node` pour le dev)
- **Sans `ANTHROPIC_API_KEY`**, l'app tourne en fallback local (mots-clés) — mettez la clé dans les Variables Railway
- L'historique du chat est **en mémoire** : perdu à chaque redémarrage (pas de BDD branchée,
  TypeORM/SQLite sont installés mais inutilisés)
- Le streaming SSE fonctionne sur Railway (le proxy gère le flush ; le header
  `X-Accel-Buffering: no` est déjà envoyé)
- ⚠️ Ne commitez jamais `backend/.env` — Railway gère les secrets via ses Variables
