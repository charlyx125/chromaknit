# Decision 010: Garment Session Storage

**Date:** May 2026
**Status:** Accepted
**Author:** Joyce Chong

---

## Context

ChromaKnit v2 adds a multi-yarn palette where the user clicks between yarns to see the same garment recoloured with each one. The original endpoint shape (`POST /api/garments/recolor` with the file plus colours in one request) re-runs background removal on every yarn click. rembg costs roughly 1.7 seconds and several hundred megabytes of peak memory per call. Re-running it for every yarn switch is wasteful and visibly slow.

The fix is to upload the garment once, run rembg once, cache the resulting image plus mask, and let subsequent recolour requests reference the cached pair by id.

---

## Two Concerns, One Storage Layer

This decision covers two related but distinct concerns that share the same storage layer:

1. **The garment session itself.** State that has to outlive a single request: the loaded image, the rembg foreground mask, the dimensions. There is no other source for the mask once it is computed (rembg is deterministic but expensive). This is a cache of an expensive computation, not user-owned data.
2. **The recolour result cache.** Per-session memo of the recoloured PNG bytes keyed by the colour palette. Lives inside the session because cache lifetime should not exceed session lifetime.

ADR 009 explains the persistence-versus-caching distinction in more detail. The yarn palette is persistence (no other source); the garment session and its recolour cache are caching (recoverable from re-running the pipeline).

---

## Storage Choice: In-Memory Dict

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| Process-local Python dict | Zero infra, zero deploy steps, fastest possible reads | Lost on Railway redeploy, does not survive multi-process workers | **Chosen for v2** |
| Redis | Survives redeploys, supports multi-worker, builtin TTL | Extra infra to provision and pay for, second failure mode | Defer until needed |
| SQLite or filesystem | No external deps, persists | Disk I/O per recolour request, locks on concurrent writes | Wrong shape for hot-path cache |
| Cloud blob (S3, GCS) | Persists, scales | Network latency per access, overkill for a 1-MB-class object | Wrong shape |

The in-memory dict is the right tool for v2's posture: a single Railway dyno, one user, no auth, no cross-process coordination needed. If we later add multiple workers (`uvicorn --workers N`) or replicas, sessions created by worker A would not be visible to worker B and recoluors would fail with 404 mid-session. The escalation path is to swap the implementation behind the same `SessionStore` interface; estimated about a day of work.

---

## TTL Strategy: Sliding 30 Minutes

Three options considered:

- **Fixed TTL from creation.** Predictable memory footprint, but kicks active users off mid-session. Rejected.
- **Sliding TTL from last access.** Active users keep their session alive; idle sessions evict. Chosen.
- **No TTL, manual eviction only.** Memory grows unboundedly. Rejected.

Thirty minutes is a guess based on expected session length (a knitter exploring a few yarn options, taking a coffee break, coming back). If memory pressure ever becomes an issue we can shorten this. There is no metric driving this number; it is a tunable.

Eviction is **lazy**: every `create()` and `get()` call sweeps for expired sessions before doing its own work. No background thread. The trade-off is that a stale session may live in memory until the next call. For our scale this is fine; if traffic patterns ever leave long quiet periods between requests, a periodic sweep task would be worth adding.

---

## Cache Key: Normalised (Colours, Weights)

Recolour cache keys are built by `make_recolor_cache_key(colors, weights)`:

- **Colours are lowercased.** `#FFAA00` and `#ffaa00` produce the same key, so cache hits do not depend on the casing the frontend happened to send.
- **Weights are formatted to four decimal places.** Floating-point arithmetic in the frontend can produce values like `0.30000000000000004` that are semantically identical to `0.3`. Without rounding, identical user inputs would miss the cache.
- **Colour order is preserved in the key.** Two palettes with the same colours in different order produce different keys. The recolour algorithm sorts internally by brightness, but the cache treats input order as significant. This is a slight pessimisation (we may compute the same output twice) and a slight insurance policy (if the algorithm ever changes to honour input order, the cache stays correct).

---

## What This Does Not Solve

- **Cross-device or cross-tab sync.** Each tab has its own browser-side state and creates its own server-side session. Two tabs uploading the same garment produce two independent sessions. Acceptable for v2; addressed only when accounts arrive in Phase 3 or later.
- **Memory bounds.** No global cap on total session memory. A motivated user could fill memory by creating many sessions; rate-limiting and a global session cap would be the response if abuse ever happens. Out of scope for v2.
- **Image bytes are not stored.** Sessions hold the loaded numpy image and the mask. The original file bytes are discarded after rembg completes. The frontend keeps the original as a blob URL for its own display purposes. If we ever need server-side access to the original (e.g. to re-process at higher quality), we would store the bytes too.

---

## Decision

Use a process-local in-memory `SessionStore` with sliding 30-minute TTL. Each session holds the loaded image, the rembg mask, and a per-session recolour cache keyed by normalised colour palette inputs. Defer Redis or other cross-process storage until multi-worker scaling becomes necessary; the swap is interface-bounded and tractable.

Revisit if: Railway memory pressure forces us to shorten the TTL, the API moves to multi-worker mode, abuse patterns force a global session cap, or the cache key normalisation produces false positives that mask real recolour-engine behaviour.
