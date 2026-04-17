# Decision 007: Scaling Strategy

**Date:** April 2026
**Status:** Documented (not yet needed)
**Author:** Joyce Chong

---

## Context

ChromaKnit's API runs image processing (K-means clustering, background removal, pixel remapping) that is CPU-heavy and takes 3-7 seconds per request. Understanding how the system handles multiple users at once is critical for when the app scales beyond a handful of concurrent users.

---

## Current Setup

- **Server:** One Railway instance
- **Process:** One Uvicorn worker (default)
- **Clients:** Multiple (any number of users can visit the site)
- **Behaviour:** Requests are processed one at a time. If User A is recolouring an image and User B submits one, User B waits in a queue until User A's request finishes.

---

## Key Concepts

### Server vs Worker vs API

Think of a restaurant:

- **Server** = the kitchen. It's the physical space where food gets made (CPU, memory, disk). You can have one kitchen or open multiple locations.
- **Worker** = a cook in the kitchen. Each cook can prepare one dish at a time. More cooks means more dishes prepared at the same time. But too many cooks in a small kitchen and they get in each other's way (too many workers on too few CPU cores).
- **API** = the menu and ordering system. It defines what customers can order and how they place orders. Every kitchen follows the same menu. The menu doesn't scale — kitchens and cooks do.

### Why One Worker Is a Bottleneck

FastAPI supports async I/O, which helps with lightweight tasks (receiving uploads, sending responses). But the actual image processing (OpenCV, NumPy, K-means) is CPU-bound. While one request is crunching pixels, the CPU is fully occupied. Async doesn't help here because there's nothing to "wait on" — the CPU is just doing math. Other requests queue up behind it.

---

## Scaling Path

### Step 1: Add Workers (use what you already have)

Change the Railway start command:

```
uvicorn api.main:app --host 0.0.0.0 --port $PORT --workers 4
```

This runs 4 independent Python processes on the same server. 4 requests can be processed at the same time. No code changes needed.

**Rule of thumb:** 2 workers per CPU core. 1 core = 2 workers, 2 cores = 4 workers. Too many workers on too few cores will slow things down as they compete for CPU time.

**This is not scaling.** This is just using the resources you're already paying for.

### Step 2: Vertical Scaling (bigger machine)

Upgrade your Railway instance to more CPU cores and RAM. More cores = more workers you can run effectively.

- 1 core → 2 workers
- 2 cores → 4 workers
- 4 cores → 8 workers

This is vertical scaling: making one machine more powerful.

### Step 3: Horizontal Scaling (more machines)

Add more Railway replicas. Each replica is a separate server running your full app independently. Railway load-balances traffic across replicas automatically.

This is horizontal scaling: adding more machines rather than making one bigger.

### Step 4: Task Queue (decouple API from processing)

For very high traffic, separate the API from the heavy processing:

1. API receives the request and puts it on a queue (e.g. Celery, Bull)
2. API returns immediately with a job ID
3. Separate worker services pick jobs off the queue and process them
4. Client polls for the result or gets notified when it's ready

This lets you scale the API and the processing independently. Overkill for now, relevant at hundreds of concurrent users.

---

## Race Conditions

### Why ChromaKnit Doesn't Have This Problem (Yet)

Each API request is fully independent:

1. Receives its own uploaded file
2. Saves it to its own temp file
3. Processes it independently
4. Returns the result
5. Cleans up

No shared state between requests. No race conditions possible.

### When It Would Become a Problem

Race conditions appear when multiple processes read and write the same shared data at the same time. Realistic scenarios for ChromaKnit if it grows:

**Scenario 1: User accounts with saved palettes**

User opens the app on phone and laptop, saves two different palettes at the same moment. Both processes read the current palette list, both append to it, both write it back. The second write overwrites the first. One palette is lost.

**Scenario 2: Usage-based rate limiting**

Free users get 10 recolours per day. User clicks recolour twice fast. Both requests read the usage count (9), both pass the check, both increment to 10. User gets 11 recolours instead of 10.

### How to Prevent Race Conditions

**Atomic database operations (simplest, covers 90% of cases):**

```sql
-- Instead of read-then-write, do it in one operation
UPDATE usage SET count = count + 1 WHERE user_id = 'joyce'
```

The database guarantees only one process touches the row at a time.

**Row-level locking via transactions:**

```python
with db.transaction():
    user = get_user(user_id, lock=True)  # locks the row
    user.palettes.append(palette)
    save_user(user)
# lock released, next process can proceed
```

The second request waits until the first finishes.

**Optimistic concurrency (no locks, retry on conflict):**

```python
user = get_user(user_id)            # version = 5
user.palettes.append(palette)
save_user(user, expected_version=5)  # fails if version changed
# if it fails, re-read and retry
```

No waiting. If two processes collide, one fails and retries. Works well when collisions are rare.

---

## When to Act

| Signal | Action |
|--------|--------|
| Occasional slow responses under normal use | Add workers (`--workers 4`) |
| Consistently slow with workers maxed out | Vertical scale (more CPU/RAM on Railway) |
| Vertical limits hit or cost inefficient | Horizontal scale (add replicas) |
| Shared state introduced (user accounts, saved data) | Add database with atomic operations |
| Hundreds of concurrent users | Consider task queue architecture |

---

## Decision

Document the scaling path now. Do not implement any changes until there is a measurable performance problem. The current single-worker setup is sufficient for the current user base. The first action when scaling is needed is adding `--workers` to the start command.
