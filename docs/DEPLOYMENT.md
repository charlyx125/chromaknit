# ChromaKnit Deployment Guide

## Live URLs

| Service | URL | Host |
|---------|-----|------|
| Frontend | https://chromaknit.vercel.app | Vercel |
| Backend API | https://chromaknit.onrender.com | Render |

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
│  Render (Backend API)                   │
│  FastAPI + Python                       │
│  https://chromaknit.onrender.com        │
└─────────────────────────────────────────┘
```

---

## Important: Cold Start Delay

**Render free tier spins down after 15 minutes of inactivity.**

When the service is idle and receives a new request:
- First request takes **30-60 seconds** while the server "wakes up"
- Subsequent requests are fast (~1-8 seconds depending on operation)

### What Users See

1. User uploads yarn image
2. Spinner shows "Extracting colors..."
3. **If server was asleep:** 30-60 second wait (one-time)
4. Colors appear, app works normally

### Why This Happens

Render free tier:
- 512MB RAM limit
- Spins down after 15 min inactivity
- Cold start requires: Python boot → package imports → uvicorn start

### Solutions

| Option | Cost | Cold Start |
|--------|------|------------|
| Render Free | $0/month | 30-60s after idle |
| Render Starter | $7/month | None (always on) |
| Railway Free | $0/month | ~20s (more RAM) |

---

## Deployment Configuration

### Backend (Render)

**Service Settings:**
- **Type:** Web Service
- **Environment:** Python 3
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `uvicorn api.main:app --host 0.0.0.0 --port $PORT`
- **Health Check:** `/health`

**Environment Variables:**
| Key | Value |
|-----|-------|
| `ENVIRONMENT` | `production` |
| `PYTHON_VERSION` | `3.11.0` |

**Memory Optimization:**
- rembg is lazy-loaded to reduce startup memory
- Server starts at ~200MB, peaks at ~500MB during recoloring

### Frontend (Vercel)

**Project Settings:**
- **Root Directory:** `chromaknit-frontend`
- **Framework:** Vite
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

**Environment Variables:**
| Key | Value |
|-----|-------|
| `VITE_API_URL` | `https://chromaknit.onrender.com` |

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

### Backend (Render)
Push to `main` branch → Manual deploy in Render dashboard

### Frontend (Vercel)
Push to `main` branch → Auto-deploys

---

## Troubleshooting

### "Failed to fetch" Error

1. **Check if backend is awake:** Visit https://chromaknit.onrender.com/health
2. **If 502 error:** Wait for cold start, or check Render logs
3. **If still failing:** Check Render dashboard for OOM errors

### Out of Memory (OOM) Crashes

**Symptoms:** Server crashes during recoloring, logs show "Ran out of memory"

**Cause:** rembg + onnxruntime exceed 512MB on Render free tier

**Solution:** Lazy loading is implemented. If still crashing:
- Use smaller images (<1MB)
- Upgrade to Render Starter ($7/mo)

### CORS Errors

**Symptom:** Browser console shows "blocked by CORS policy"

**Cause:** Frontend URL not in allowed origins

**Solution:** Add the Vercel URL to `origins` list in `api/main.py`

---

## Monitoring

### Render Dashboard
- **Events:** Deploy history, crashes
- **Logs:** Real-time server logs
- **Metrics:** Memory usage, CPU

### Health Check
```bash
curl https://chromaknit.onrender.com/health
# {"status":"healthy","version":"2.0.0"}
```

---

**Last Updated:** February 5, 2026
