# Decision 009: Frontend Persistence Strategy

**Date:** May 2026
**Status:** Accepted
**Author:** Joyce Chong

---

## Context

v2's multi-yarn palette needs to survive page reloads. Users add yarns over time and expect them to still be there next session. v2 has no accounts and no server-side user data (deliberate constraint), so persistence has to be browser-local.

Constraint: keep this dead simple. No database, no backend changes, no auth. localStorage is the right tool.

---

## Why persistence, not caching

A cache and a persisted store are easy to conflate — they often use the same underlying storage mechanisms (localStorage, IndexedDB, browser memory, server dicts) — but they answer different questions:

- **Cache**: "How do I avoid recomputing or re-fetching this?" Defining trait: the data is recoverable from a primary source. If the cache is wiped, recompute or re-fetch. No data loss.
- **Persistence**: "Where does this data live?" Defining trait: there is no other source. If the store is wiped, the data is gone.

For ChromaKnit yarn palettes, **there is no primary source elsewhere**. The user added those yarns; no API endpoint serves them; no server has a copy. localStorage isn't a cache of yarn data — it IS the yarn data. Treating it as a cache (with eviction, TTLs, "fall back to re-fetch" logic) would be wrong: there is nothing to fall back to.

Other v2 storage *is* caching, by contrast:

- The recolour result blob (slice 1.C) is keyed by yarn id and stored in browser memory. Lose it, hit `/api/garments/recolor` again, get the same bytes. Cache.
- The rembg mask in the server session (slice 1.B) is keyed by garment hash. Lose it, run rembg again, get the same mask. Cache.

So this ADR is about persistence specifically. The caching layers above are governed by their own decisions (server-session TTL, in-memory recolour cache eviction).

---

## What We Persist

| Data | Where | Why |
|---|---|---|
| Yarn palette (`yarns[]`) | localStorage | User-owned, no other source — true persistence |
| `activeYarnId` | not persisted | Working state; resetting each session is fine |
| Garment image + rembg mask | server session (slice 1.B) | Caching: expensive to recompute, recoverable from upload |
| Recolour result blobs | browser memory (slice 1.C) | Caching: cheap to recompute via API |
| User-uploaded yarn images | localStorage as base64 data URLs | After 400px resize, ~30-80KB each; ~50 yarns fit within the 5MB cap |

---

## Schema

Storage key: `chromaknit:state`.

Payload shape:

```json
{
  "version": 1,
  "yarns": [{ "id", "label", "previewUrl", "palette", "percentages", "status" }]
}
```

Versioning is non-negotiable. Future shape changes (Phase 2 will add `regions[]`) bump the version; payloads with mismatched versions are silently dropped on hydrate. No migrations in v2 — users lose their saved yarns once on the upgrade. Acceptable tradeoff for not maintaining migration code on a single-user-base project.

---

## Lifecycle

1. **On mount**, `useAppState` reads `chromaknit:state`, validates `version === 1`, dispatches `HYDRATE_YARNS`. Failures (missing key, malformed JSON, version mismatch) silently start fresh.
2. **On every `yarns` change**, the hook writes the current array back. Wrapped in `try/catch` — quota-exceeded or private-browsing failures don't crash the app.
3. **The first persist call after mount is skipped** via a ref guard. Without this, the persist effect runs before the hydrate dispatch updates state, briefly overwriting saved yarns with the empty initial state. Inline comment in `src/hooks/useAppState.ts` documents this gotcha.

---

## Edge Case Behaviors

| Scenario | Behavior | Rationale |
|---|---|---|
| User clears browsing data | Yarns gone next visit | Browser-managed storage; deliberate user action |
| Private/incognito browsing | App works; nothing persists | `try/catch` around `setItem` absorbs quota/security errors |
| Quota exceeded (~5MB) | Persist silently no-ops; current session unaffected | Best-effort persistence; user sees their work in-session |
| Schema version mismatch | Saved data dropped on hydrate; start fresh | No migrations in v2; one-time loss on upgrade |
| Two tabs open | Drift independently; last write wins | Cross-tab sync via the `storage` event deferred to Phase 3+ |
| Different device or browser | Each has its own localStorage bucket; no sync | Cross-device sync requires accounts; deferred to Phase 3+ |
| Safari (desktop or iOS) inactive 7+ days | Saved data evicted by Intelligent Tracking Prevention | Apple privacy feature; acceptable for non-critical UI state |

---

## Safari ITP

Worth calling out: Safari evicts first-party localStorage from sites that have not received user interaction in 7 days. This is documented privacy behavior (Intelligent Tracking Prevention), not a bug we can patch. For ChromaKnit, iOS and macOS Safari users may lose their palette if they do not return within a week.

This is acceptable for v2 because the yarn palette is user preferences, not data the user cannot recreate. The escalation path, if loss becomes a real complaint, is accounts + server-side palette sync — out of scope for v2.

---

## Decision

Persist yarn palettes to localStorage with a versioned envelope. Use the hydrate-on-mount + persist-on-change pattern with the first-persist-skip guard. Accept browser-local limits including ITP. Defer cross-device sync until accounts are introduced.

Revisit if: yarn data starts including non-trivial blobs (e.g., raw image files instead of resized data URLs) and pushes past the 5MB cap; Safari/iOS users start reporting palette loss as a frequent complaint; or the schema needs to evolve frequently enough that "drop on mismatch" becomes user-hostile.
