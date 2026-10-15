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

## Déploiement (Render)

Le backend sert aussi le **build statique du frontend** (via `@nestjs/serve-static`) :
**un seul service, un seul domaine**, pas de CORS ni de reverse-proxy à configurer.

1. Pousse le projet sur GitHub (le `.gitignore` exclut `node_modules`, `dist`, `.env`)
2. Sur [render.com](https://render.com) → **New → Blueprint** → connecte ton repo
   (`render.yaml` à la racine configure tout : build, start, health check)
3. Dans les **Environment** du service, ajoute :
   - `ANTHROPIC_API_KEY` = ta clé (Sync → jamais commitée)
   - `FRONT_URL` = l'URL publique rendue par Render (ex. `https://elise.onrender.com`)
4. Deploy → `https://ton-app.onrender.com` sert l'app + l'API sur `/api`.

Build effectué par Render :
```bash
cd backend && npm ci && npm run build && cd ../frontend && npm ci && npm run build
# démarrage : node backend/dist/main.js
```

Testé en local en mode "prod" : `/` (SPA), `/assets/*`, `/logo-elise.png`,
`/api/chat/status`, `POST /api/chat`, `POST /api/chat/stream` (SSE), `/api/resources` → OK.

> ⚠️ Render free : la machine dort après ~15 min d'inactivité (1er appel ~30 s).
> Pour un hackathon/demo, préfère un plan payant ou un keep-alive.

### Notes de production
- `start:prod` = `node dist/main.js` (le `start` reste `ts-node` pour le dev)
- L'historique du chat est **en mémoire** : perdu à chaque redémarrage (pas de BDD branchée,
  TypeORM/SQLite sont installés mais inutilisés)
- Le streaming SSE fonctionne sur Render ; si tu mets un proxy devant (Nginx), désactive le
  buffering (`proxy_buffering off;` — le header `X-Accel-Buffering: no` est déjà envoyé)
