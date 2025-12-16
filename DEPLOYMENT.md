# Production Deployment

This project has two parts:
- `back/` — Express + WebSocket server with PostgreSQL.
- `front/` — Next.js 16 app that talks to the backend via HTTPS and WS.

Below is a minimal checklist to bring both up in production.

## Prerequisites
- Node.js 20+ and npm.
- PostgreSQL 14+.
- A reverse proxy/SSL terminator (nginx, Caddy, etc.) to expose HTTPS/WSS to the internet.

## Backend (`back/`)
1) Install deps and build:
```bash
cd back
npm ci
npm run build
```
2) Prepare database (run once):
```bash
psql "$DATABASE_URL" -f utils/db/gen_tables.sql
```
3) Configure environment (`back/.env` in production, example):
```
NODE_ENV=production
PORT=4000
DATABASE_URL=postgres://user:pass@host:5432/dbname
ADMIN_LOGIN=admin
ADMIN_PASSWORD=strong-password
APP_SECRET=change-me
BLACK_BOX_MUSIC_PATH=/media/sfx/black_box.mp3
```
4) Start:
```bash
npm start
```
Serve `/media` statics are already exposed by the server; point `NEXT_PUBLIC_MEDIA_BASE` to the same host.

## Frontend (`front/`)
1) Install deps and build:
```bash
cd front
npm ci
npm run build
```
2) Configure environment (`front/.env.production` or runtime env vars), example:
```
NEXT_PUBLIC_API_BASE=https://your-backend-domain
NEXT_PUBLIC_WS_URL=wss://your-backend-domain/ws
NEXT_PUBLIC_MEDIA_BASE=https://your-backend-domain
```
3) Start:
```bash
npm start
```
Behind a reverse proxy, route:
- `GET/POST/etc /api/*`, `/ws`, `/media/*`, `/health` → backend
- Everything else → frontend `next start` app

## Process management
Use a supervisor (systemd, pm2, docker, etc.) to keep `npm start` for both apps running and to auto-restart on crash/deploy.

## Quick health checks
- Backend: `curl https://your-backend-domain/health` should return `{"ok":true}`.
- WebSocket: connect to `wss://your-backend-domain/ws` after the backend is up.
- Frontend: `npm run build` must pass before deploying.
