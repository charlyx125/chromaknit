# ChromaKnit Deployment Guide

## Live URLs

| Service | URL | Host |
|---------|-----|------|
| Frontend | https://chromaknit.vercel.app | Vercel Hobby (free) |
| Backend API | https://charlyx125-chromaknit-backend.hf.space | HuggingFace Spaces (Docker SDK, free CPU basic) |

---

## Architecture

```
┌─────────────────────────────────────────┐
│  Vercel Hobby (Frontend)                │
│  React + TypeScript + Vite              │
│  https://chromaknit.vercel.app          │
│  Free, no usage limits for static sites │
└─────────────────────────────────────────┘
                    │
                    │ HTTPS
                    ▼
┌─────────────────────────────────────────┐
│  HuggingFace Spaces (Backend API)       │
│  FastAPI + Python in a Docker container │
│  charlyx125-chromaknit-backend.hf.space │
│  Free, sleep-on-idle after ~48 hours    │
│  Cold start: ~30 to 60 seconds          │
└─────────────────────────────────────────┘
```

Sample yarns and sample garments are precomputed and served as static assets by Vercel; they never hit the backend. Only user-uploaded yarn and garment images hit the backend.

---

## Why HuggingFace Spaces

The backend was first deployed on Railway (April 2026), then migrated to HuggingFace Spaces (May 2026). Full reasoning is in [ADR 011](decisions/011-cost-discipline-and-static-first.md). Short version:

- **Railway** bills per resource-hour. The backend was alive 24/7 holding the rembg U²-Net model in memory (~530 MB baseline) and burned the free credit through idle uptime alone.
- **HuggingFace Spaces** sleeps when idle, wakes on request, bills £0 either way. The cost trade is shifted to the user (one-time cold start of 30 to 60 seconds on their first upload after a long idle period) rather than the operator (always-on uptime billing).
- The cold start is mitigated client-side by a "warming up the backend, give it about 30 seconds" message that appears after 5 seconds. Warm-path uploads never see this copy.

Free tier specs:

- 2 vCPU, 16 GB RAM, Docker SDK
- Sleeps after ~48 hours of no traffic
- Build time capped at 30 minutes (we use ~7 minutes including the rembg model bake-in)
- Per-file 10 MB limit in the Space repo (we orphan-branch the deploy to exclude the >10 MB demo MP4)

---

## Deployment Configuration

### Backend (HuggingFace Spaces)

**Space settings:**
- **Owner / Space name:** `charlyx125 / chromaknit-backend`
- **SDK:** Docker
- **Hardware:** CPU basic (free)
- **Visibility:** Public (free tier requires this)
- **App port:** 7860 (HF convention; set via YAML frontmatter in `README.md`)

**Dockerfile lives at the repo root.** Build steps:

1. Base image `python:3.11-slim` with `libgl1` and `libglib2.0-0` apt packages.
2. Switches to non-root user with UID 1000 (HF convention).
3. Installs Python deps from `requirements.txt`.
4. Bakes the rembg U²-Net model into the image at build time so cold starts skip the model download.
5. Copies `api/` and `core/` only. Frontend, tests, docs, examples are excluded via `.dockerignore`.
6. CMD: `uvicorn api.main:app --host 0.0.0.0 --port 7860`.

**Deploy mechanism:** the Space has its own git remote at `https://huggingface.co/spaces/charlyx125/chromaknit-backend`. Pushing to that remote's `main` branch triggers HuggingFace to rebuild the Docker image automatically. Local repo has two remotes:

- `origin` → GitHub (`git@github.com-personal:charlyx125/chromaknit.git`)
- `hfspace` → HuggingFace Space

**Memory & performance:**
- Frontend resizes images before uploading (yarn: 400x400, garment: 500x500) to reduce network transfer and server load.
- Server-side image downscaling as safety net (400 px for extraction, 800 px for recolouring).
- MiniBatchKMeans with `n_init=3` replaces KMeans with `n_init=10` for faster color extraction.
- rembg uses the lightweight `u2netp` model (~50% less memory than default `u2net`).
- Container memory peaks at ~700 MB during a recolour call, comfortably under the 16 GB ceiling.

### Frontend (Vercel)

**Project Settings:**
- **Root Directory:** `chromaknit-frontend`
- **Framework:** Vite
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

**Environment Variables:**
| Key | Value |
|-----|-------|
| `VITE_API_URL` | `https://charlyx125-chromaknit-backend.hf.space` |

`VITE_API_URL` is also set in `chromaknit-frontend/.env.production` as a default. Vercel project env vars override the file at build time, so if both are set ensure they agree (or remove the Vercel env var and let `.env.production` take effect).

---

## CORS Configuration

The backend allows requests from these origins (configured in `api/main.py`):

**Production:**
- `https://chromaknit.vercel.app`
- `https://chromaknit-git-main-charlyx125.vercel.app`
- `https://chromaknit-charlyx125.vercel.app`
- `https://chromaknit-git-multi-yarn-charlyx125.vercel.app` (preview deploys for the multi-yarn branch)
- `https://huggingface.co`
- `https://charlyx125-chromaknit-backend.hf.space`

**Development:**
- `http://localhost:5173`
- `http://localhost:3000`
- `http://127.0.0.1:5173`
- `http://127.0.0.1:3000`

---

## Updating Deployments

### Backend (HuggingFace Spaces)

Push to the `hfspace` remote's `main` branch. HF builds the Docker image and redeploys automatically. Watch the build in the Space's Logs tab; first build is ~7 minutes, subsequent builds with cached layers are faster.

### Frontend (Vercel)

Push to `main` on GitHub → Vercel auto-deploys.

---

## Troubleshooting

### "Failed to fetch" error

1. **Check if backend is awake:** Visit https://charlyx125-chromaknit-backend.hf.space/health. If the Space has been idle for >48 hours, the first hit may take 30 to 60 seconds while the container wakes. The frontend's "warming up" UX accounts for this.
2. **If still not responding after wake:** Open the Space dashboard at https://huggingface.co/spaces/charlyx125/chromaknit-backend and check the Logs tab.
3. **If CORS error in browser console:** Ensure the frontend's origin is in the allowed origins in `api/main.py`.

### Cold-start latency feels too long

Expected behaviour on the free tier; the cold start is 30 to 60 seconds. The frontend swaps the spinner copy to "warming up the backend, give it about 30 seconds" after 5 seconds so the user knows it isn't broken.

If cold starts are unacceptable for a future use case, options are:

- Upgrade to a paid HF Spaces tier with persistent compute (loses the £0 target).
- Roll back to the paused Railway service (see Historical context below).
- Migrate to a different always-on host.

### Build fails on push to HF Space

1. Open the Space's Logs tab — full Docker build output is there.
2. Common causes: missing system library (add to the apt-get line in the Dockerfile), exceeded 30-minute build cap (rare; would need a much heavier dep change), syntax error in `README.md` YAML frontmatter.

### Files rejected by HF on push

HF Spaces rejects:

- Files larger than 10 MB unless they are stored via Git LFS / Xet.
- Most binary files in the repo (PNG, JPG, MP4, etc.) unless Xet is enabled.

The deploy uses an orphan branch with only the backend source files (`Dockerfile`, `requirements.txt`, `api/`, `core/`, `README.md`, `.gitignore`, `.dockerignore`) so this hasn't been an issue. If you want to include any images or media in the Space repo, set up Xet first.

### CORS errors

**Symptom:** Browser console shows "blocked by CORS policy"

**Cause:** Frontend's origin not in allowed origins

**Solution:** Add the Vercel URL to `origins` list in `api/main.py`, commit, push to GitHub and to the HF Space.

---

## Monitoring

### HuggingFace Space dashboard
- **App tab:** live preview of the API root (returns the welcome JSON).
- **Logs tab:** real-time container logs; shows build output and runtime stderr.
- **Files tab:** what HF sees in the repo. Confirms the right files were pushed.
- **Settings tab:** hardware tier, secrets, restart Space.

### Health check
```bash
curl https://charlyx125-chromaknit-backend.hf.space/health
# {"status":"healthy","version":"2.0.0"}
```

If the Space is sleeping, the first `curl` triggers a wake and may take 30 to 60 seconds. The second `curl` within a few minutes will be fast.

---

## Historical context: Railway (April-May 2026)

The backend was originally deployed on Railway Hobby. The Railway project is **paused, not deleted**, so it can be rolled back to in case HuggingFace Spaces fails.

| Setting | Value |
|---|---|
| Service | `chromaknit-production.up.railway.app` |
| Branch | `main` |
| Start command | `uvicorn api.main:app --host 0.0.0.0 --port $PORT` |
| Status | Paused (not billing) |

**Rollback path** if HuggingFace Spaces fails:

1. Unpause the Railway service from the Railway dashboard.
2. Set `chromaknit-frontend/.env.production` back to `VITE_API_URL=https://chromaknit-production.up.railway.app` (or update the Vercel env var).
3. Trigger a Vercel rebuild (push any commit to `main`).

Reasoning for the migration is documented in [ADR 011](decisions/011-cost-discipline-and-static-first.md). Short version: Railway bills per resource-hour and the backend was alive 24/7 holding a 530 MB model in memory, burning the free credit through idle uptime. HuggingFace Spaces sleeps on idle and bills £0.

---

**Last Updated:** May 17, 2026 — Backend migrated from Railway to HuggingFace Spaces. Railway service paused, kept as rollback option.
