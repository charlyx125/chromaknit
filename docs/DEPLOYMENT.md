# ChromaKnit Deployment Guide

## Live URLs

| Service | URL | Host |
|---------|-----|------|
| Frontend | https://chromaknit.vercel.app | Vercel |
| Backend API | https://chromaknit-production.up.railway.app | Railway |

---

## Architecture

```
┌─────────────────────────────────────────┐
│  Vercel (Frontend)                      │
│  React + TypeScript + Vite              │
│  https://chromaknit.vercel.app          │
└─────────────────────────────────────────┘
                    │
                    │ HTTPS
                    ▼
┌─────────────────────────────────────────┐
│  Railway (Backend API)                  │
│  FastAPI + Python                       │
│  chromaknit-production.up.railway.app   │
└─────────────────────────────────────────┘
```

---

## Why Railway

The backend was initially trialed on Render's free tier, but Render was ruled out due to **cold starts** — its free tier spins down after 15 minutes of inactivity, causing 30-60 second delays on the first request. For a portfolio project shared with recruiters, this was unacceptable.

Railway's free tier provides $5/month credit with no automatic spin-down. The server stays warm, so the first request is as fast as any other (~1-8 seconds depending on operation).

The trade-off: Railway's $5 credit is consumed by uptime hours. A single backend service running 24/7 costs roughly $3-5/month, which fits within the free credit. The frontend stays on Vercel (completely free, no limits for static sites) to keep Railway usage low.

### Additional Fix: opencv-python-headless

Railway's container environment does not include GUI system libraries (libxcb, libX11). The original `opencv-python` package requires these. Switching to `opencv-python-headless` resolved the deployment crash — it provides the same OpenCV functionality without GUI dependencies, which is correct for a headless API server.

---

## Deployment Configuration

### Backend (Railway)

**Service Settings:**
- **Source:** GitHub repo `charlyx125/chromaknit`
- **Branch:** `main`
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `uvicorn api.main:app --host 0.0.0.0 --port $PORT`
- **Domain:** `chromaknit-production.up.railway.app` (Port 8080)

**Environment Variables:**
No service variables required. CORS is configured to allow both production and development origins without an `ENVIRONMENT` flag.

**Memory & Performance Optimizations:**
- Frontend resizes images before uploading (yarn: 400x400, garment: 500x500) to reduce network transfer and server load
- Server-side image downscaling as safety net (400px for extraction, 800px for recoloring)
- MiniBatchKMeans with n_init=3 replaces KMeans with n_init=10 for faster color extraction
- rembg is lazy-loaded to reduce startup memory
- rembg uses the lightweight `u2netp` model (~50% less memory than default `u2net`)
- Server starts at ~200MB, peaks at ~400MB during recoloring

**Production Performance (Railway free tier):**
- Color extraction: **~700ms** (was 72s before optimizations)
- Garment recoloring: **~2.5s** (was 34s before optimizations)

### Frontend (Vercel)

**Project Settings:**
- **Root Directory:** `chromaknit-frontend`
- **Framework:** Vite
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

**Environment Variables:**
| Key | Value |
|-----|-------|
| `VITE_API_URL` | `https://chromaknit-production.up.railway.app` |

---

## CORS Configuration

The backend allows requests from these origins (configured in `api/main.py`):

**Production:**
- `https://chromaknit.vercel.app`
- `https://chromaknit-*.vercel.app` (preview deployments)

**Development:**
- `http://localhost:5173`
- `http://localhost:3000`

---

## Updating Deployments

### Backend (Railway)
Push to `main` branch → Auto-deploys

### Frontend (Vercel)
Push to `main` branch → Auto-deploys

---

## Troubleshooting

### "Failed to fetch" Error

1. **Check if backend is running:** Visit https://chromaknit-production.up.railway.app/health
2. **If not responding:** Check Railway dashboard for deploy logs
3. **If CORS error:** Ensure the frontend URL is in the allowed origins in `api/main.py`

### Out of Memory (OOM) Crashes

**Symptoms:** Server crashes during recoloring, logs show memory errors

**Cause:** rembg + onnxruntime can exceed available RAM

**Solution:** Lazy loading is implemented. If still crashing:
- Use smaller images (<1MB)
- Monitor memory usage in Railway's Metrics tab

### OpenCV Import Errors

**Symptom:** `ImportError: libxcb.so.1: cannot open shared object file`

**Cause:** Using `opencv-python` instead of `opencv-python-headless`

**Solution:** Ensure `requirements.txt` uses `opencv-python-headless>=4.8.0`

### CORS Errors

**Symptom:** Browser console shows "blocked by CORS policy"

**Cause:** Frontend URL not in allowed origins

**Solution:** Add the Vercel URL to `origins` list in `api/main.py`

---

## Monitoring

### Railway Dashboard
- **Deployments:** Deploy history, build logs
- **Metrics:** Memory usage, CPU, network
- **Logs:** Real-time server logs

### Health Check
```bash
curl https://chromaknit-production.up.railway.app/health
# {"status":"healthy","version":"2.0.0"}
```

---

**Last Updated:** April 8, 2026 — Backend deployed on Railway (Render was trialed but ruled out due to cold starts)
