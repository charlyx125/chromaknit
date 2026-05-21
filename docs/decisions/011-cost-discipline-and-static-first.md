# Decision 011: Cost Discipline and the Static-First Migration

**Date:** May 2026
**Status:** Accepted (updated 2026-05-17: see end)
**Author:** Joyce Chong

---

## Context

In late April 2026 ChromaKnit shipped to LinkedIn. Across a five-day window the Railway free credits went from 80% to 100% utilisation while the app was effectively idle. The 30-day Railway metrics chart told the story cleanly: CPU at 0%, memory flat at ~500 MB, almost no requests, no errors, no traffic spikes.

The bill was for *existence*, not for *user activity*. The container was alive 24/7 holding rembg's U²-Net model in memory, and Railway charges per resource-hour regardless of whether requests arrive. Same shape as the AWS Lambda horror story, just on a per-resource-hour host instead of per-invocation.

This ADR records the diagnosis, the memory math behind it, the architectural response, and the discipline rules that prevent recurrence.

---

## How This Decision Was Reached

The reasoning trail is recorded here because the sequence of questions matters as much as the final answer. Most cost-discipline ADRs document the conclusion. This one also documents the eight steps of thinking that led to it, partly because the same pattern of questions applies to other architectural cost decisions and partly so a future reader (or a future ChromaKnit engineer) can audit whether the reasoning still holds when conditions change.

### 1. The 80% to 100% spike triggered the question that should have been asked at deploy time

The instinct that fired five days into production but should have fired five days before deployment was "if no one is using it, why is it costing money?" Vibe coding optimises for "make the feature work." It does not surface non-functional constraints unless those constraints are written down up front. Cost was not written down, so cost was not part of the reasoning. The lesson generalised: write down non-functional constraints before code, not after.

### 2. The 30-day metrics rejected the obvious hypothesis

The default reading of a cost spike is "too many users." Pulling the metrics killed that hypothesis cleanly: CPU at 0%, memory flat at ~500 MB across the entire month, almost no requests, almost no errors. The bill was for *existence*, not for *user activity*. That single observation reframed the problem from "throttle traffic" to "do not be alive when no one is using it."

### 3. The first instinct (find a cheaper host) failed the memory test

Render free, Railway free, Koyeb free, Fly.io free shared all hit the same wall: 512 MB ceiling versus ~530 MB idle baseline plus 700 MB peak under load. The container would OOM mid-request, the user would see an error, and zero compute time would be saved because the failed request still consumed CPU getting halfway through rembg.

The lesson: free tiers are not commodities. They are sized for tiny services that wake briefly and sleep. ChromaKnit's backend is a fat outlier (heavy memory, light CPU) that does not fit the typical free-tier shape. Picking the cheapest plan when your service does not match the plan's intended profile is a category error.

### 4. The cache-results workaround was rejected as solving the wrong problem

The most common engineering response to "compute is expensive" is "cache the results." That works when the cost is per-call. ChromaKnit's cost was per-resource-hour. Caching reduces *what the container does*, not *whether the container is alive*. A workaround that lets the container do less work while still consuming memory hours solves the wrong axis of the problem.

The lesson: distinguish the cost mechanism before picking the optimisation. Per-call costs (Lambda, OpenAI tokens, Cloudflare Workers) are reduced by caching and rate limits. Per-resource-hour costs (Railway, Hetzner, EC2) are reduced by uptime reduction and right-sized resource allocation.

### 5. The rewrite paths (Wasm rembg, no backend at all) were too big for the stakes

Path B (Wasm rembg in the browser) and Path C (full client-side) both eliminate the always-on memory baseline. Both have real engineering cost: 1 to 2 days for B, 2 to 3 days for C, plus cross-device variance risk on iOS Safari and older Android. The portfolio-stage personal tool did not justify the engineering investment unless the reframed problem demanded it. The reframe (next step) showed it did not.

### 6. The reframe came from looking at the audience honestly

The breakthrough was a single question: "do most of my users actually need a backend at all?" Looking at LinkedIn-driven traffic honestly: most visitors are passers-by trying samples. They click a sample yarn, click a sample garment, see what happens, close the tab. They are not uploading their own materials. The dominant flow runs on fixed inputs.

If the inputs are fixed, the outputs can be precomputed. If the outputs can be precomputed, the dominant flow does not need a backend. The backend exists only for the minority case (custom uploads), and the minority case can be served by a paused-most-of-the-time backend.

This reframe is the actual decision. Everything that follows in this ADR is bookkeeping on top of it.

### 7. Stress-testing the reframe across v2 functionality

The reframe only justifies the architecture if it covers v2 features, not just the current Auto mode.

- **Auto mode**: precomputed mask plus JS port = no backend.
- **Paint mode**: same precomputed mask + JS port handles brush strokes locally; commits stay in the browser; undo/redo operates on a local region stack.
- **Select mode**: flood-fill on Lab distance runs in the browser given the mask; tolerance slider is local; same recolour pipeline.

All three modes collapse to "the backend fires only for the user's first upload of their own asset." Future features pass the same test: anything expressible as "fixed inputs produce a fixed output" goes in the precompute pipeline; anything requiring user-specific state wakes the backend.

### 8. The discipline rule encodes the architectural posture

Architectures decay without enforcement. The three-part rule in CLAUDE.md exists so the next time someone (me, future-me, an AI assistant, a contributor) suggests "let's just add a quick backend call here for the demo," there is a clear regression test in code review: does the demo path still run from static assets? If not, the change is rejected.

The rule is short enough to remember and specific enough to enforce. Each clause maps to a distinct cost surface (static for demos covers per-call cost; backend for uploads is the architectural seam; paused when not developing covers idle uptime cost). All three clauses must hold simultaneously for the architecture to deliver £0 most months.

---

## The Memory Math

ChromaKnit's backend at idle, after a single rembg call has loaded the model:

| Component | Approximate memory |
|---|---|
| Python interpreter + FastAPI/Uvicorn baseline | ~80 MB |
| OpenCV (cv2) | ~50 MB |
| numpy, scikit-learn, matplotlib | ~80 MB |
| onnxruntime + rembg library | ~150 MB |
| U²-Net (u2netp) model loaded into onnxruntime | ~170 MB |
| Per-active-request peak (decoded image + intermediate buffers) | +50-100 MB |
| **Total at idle, post first call** | **~530 MB** |
| **Total during a rembg call** | **~620-700 MB** |

Two practical consequences:

1. The U²-Net model dominates. Once loaded it never unloads for the container's lifetime. Per-user session data (image bytes + mask, ~2-5 MB each) is a rounding error.
2. Any free tier with a 512 MB ceiling OOMs ChromaKnit during real uploads. Render free, Railway Free, Koyeb free, Fly.io free shared all sit below the threshold.

We are already on the lighter `u2netp` model variant. There is no smaller option in the rembg lineup. Removing the model from the backend entirely is the only way to fit under 512 MB.

---

## Provider Analysis

| Host | Free RAM | Auto-sleep | Verdict |
|---|---|---|---|
| Render free | 512 MB | Yes | OOMs on rembg call. Rejected. |
| Railway Free | 512 MB + $1 credits | No | Same OOM risk plus tiny credits. Rejected. |
| Fly.io free | 256 MB shared | Yes | Even tighter. Rejected. |
| Koyeb free | 512 MB | Yes | Same OOM risk. Rejected. |
| Northflank free | 1 GB | No (manual stop) | Memory fits but burns credits 24/7 like Railway. |
| Railway Hobby | ~1 GB | No (manual pause) | Memory fits, costs ~$0-5/month with discipline. **Chosen.** |
| Hetzner / VPS | 1-2 GB | n/a | Predictable but no free tier. £3-5/month minimum. |

There is no free tier in the market that gives 1 GB+ RAM AND auto-sleeps. The hosts that auto-sleep are memory-constrained because their economics depend on reclaiming memory when idle. Hosts with enough memory charge for the always-on container.

The constraint is structural, not a market gap that better shopping fixes.

---

## The Architectural Response: Static-First with Optional Dynamic

The reframe that drove this decision came from looking at the audience honestly. After the LinkedIn post the 30-day metrics showed the traffic pattern: an early burst of curiosity clicks during the post window, then a long tail of low-volume sample-driven exploration. ChromaKnit's audience is overwhelmingly passers-by trying the demo, not power users uploading their own yarn and garment photos. Real custom uploads were rare even during the most active week.

The original engineering instinct was to cache results to make the backend cheaper. Joyce's reframe was sharper: if the dominant flow is "click a sample yarn, click a sample garment, see a recolour," that flow does not need a backend at all. The expensive operations (colour extraction, rembg, HSV remap) all run on the same fixed inputs every time a visitor clicks the same sample. Compute that work once, ship the outputs as static files, and the dominant flow becomes free forever regardless of traffic.

That observation flips the architecture from "always-dynamic with caching" to "static-first with optional dynamic":

**Always-dynamic with caching** (the v1 architecture): the server does the work for every visitor; caches reduce repeated compute. Server is part of every flow. If the server is down, the app is down. The server has to be alive 24/7 because any request might arrive.

**Static-first with optional dynamic** (the v2 architecture): pre-compute the outputs of expensive operations on known inputs and ship them as static files. The server only fires when a request genuinely needs personalised work that could not have been pre-computed.

For ChromaKnit specifically:

- Sample yarn palettes are pre-computed at build time and committed to `chromaknit-frontend/public/samples/precomputed/yarns/{slug}.json`.
- Sample garment masks are pre-computed at build time and committed to `chromaknit-frontend/public/samples/precomputed/garments/{slug}-mask.png` plus a sidecar JSON with dimensions and brightness range.
- The JS port at `chromaknit-frontend/src/lib/recolourLocal.ts` runs the HSV remap client-side for any flow whose mask is local. Auto, Paint and Select modes all compose into the same client-side path when the underlying mask came from precomputed assets.
- The backend only fires for user-uploaded yarn (palette extraction) or user-uploaded garment (rembg). For everything else, the backend can stay paused.
- Static files served by Vercel cost £0 forever regardless of traffic.

Cost outcomes by user flow:

| Flow | Backend calls per visitor session |
|---|---|
| Sample yarn + sample garment, any mode | 0 |
| Custom yarn + sample garment | 1 (extract palette) |
| Sample yarn + custom garment | 1 (rembg session) |
| Custom yarn + custom garment | 2 |

For LinkedIn-passer-by traffic where most visitors try samples without uploading anything, this collapses to roughly zero backend calls. A passer-by who paints fifty strokes on a sample garment with a sample yarn still costs the backend nothing, because every layer of that interaction (palette, mask, recolour, paint commits, undo, redo) runs on local assets and the JS port.

**Why the audience-composition framing matters more than the engineering pattern**

Static-first as a generic engineering pattern is not novel. The insight specific to ChromaKnit is that the dominant user flow is sample-driven, which means the static path covers the dominant cost surface, not just an edge case. A different audience composition (custom-uploads-first) would have justified Path B or Path C instead, and a different decision would have followed. The cost discipline rule that comes out of this ADR is therefore not "always go static-first," it is "match the architecture to the audience composition, and re-examine when that composition shifts."

---

## Why This Beats the Alternatives

We considered three other architectural responses and rejected each.

**Path B: Wasm rembg in the browser (deferred).** Move rembg into a WebAssembly module that runs client-side. Backend memory drops to ~150 MB and fits any free tier. Trade-off: every visitor downloads a ~10 MB Wasm bundle on first load, performance varies wildly across devices (acceptable on desktop, rough on older Android), and adds a new failure mode ("Wasm failed to load"). Engineering cost realistically 1 to 2 days for cross-device reliability, not the 4 to 6 hours often quoted. The cost win is similar to static-first plus pause discipline, which is why this path was deferred until upload usage grows enough to justify the engineering investment.

**Path C: no backend at all (deferred).** Rewrite the entire pipeline in the browser. Best cost shape (£0 forever, predictable), bigger rewrite (2 to 3 days), and same device-variance concerns as Path B. Worth revisiting if uploads become a meaningful share of traffic.

**Tier downgrade (rejected).** Moving from Hobby to Free saves about $0.50/month on paper but breaks user uploads via OOM kills. Saving 50p in exchange for a broken feature is a bad trade.

The static-first migration captures the dominant cost win (no 24/7 model-in-memory bill) without taking on the device-variance risk of Path B or the rewrite scope of Path C. It also keeps the door open: if uploads ever justify it, Path B can be done later without re-architecting anything else.

---

## Code-Level Guardrails

The static-first migration handles the dominant idle-cost shape. A separate set of guardrails addresses the user-upload path that does still hit the backend, so that abuse or scripted bots cannot amplify the bill.

The four guardrails go into a single PR ahead of the next public deploy:

- **Rate limits via SlowAPI.** `/api/garments/session` 5/minute, `/api/colors/extract` 10/minute, `/api/garments/recolor` 20/minute. Easier to relax than tighten in production.
- **Daily budget counter.** A hard cap of 200 rembg calls/day, returning 503 with a friendly message when exceeded. Bounds worst-case scripted abuse to ~£1/day in compute.
- **`asyncio.Semaphore(1)` around rembg.** Serialises calls so two concurrent uploads cannot stack memory and OOM the container.
- **Bounded session store.** Hard cap on total live sessions, returns 429 at capacity. Prevents the "100 simultaneous uploads" scenario from accumulating unbounded memory.
- **Per-request timeout middleware.** Cap on long-running endpoints so a malformed input cannot hang a worker.

These guardrails are not strictly required for current traffic levels but become load-bearing the moment Phase 2 (paint mode) ships and the URL is more widely shared.

---

## The Discipline Rule

The architectural decision and the code guardrails both depend on a single behavioural rule, captured in `CLAUDE.md`:

> Anything in the demo experience must run from static assets. The backend is only for user-provided content. The backend stays paused when not actively developing. If a feature regresses any of these, that is a regression.

Three clauses, three distinct cost surfaces:

1. **"Static for demos"** addresses per-call compute cost.
2. **"Backend only for uploads"** is the architectural seam that makes (1) and (3) enforceable.
3. **"Paused when not developing"** addresses idle uptime cost.

The rule is enforceable in code review. A PR that adds a backend call to the sample flow, or fails to wake the backend explicitly during development, is a regression that should be caught before merge.

---

## What This Does Not Solve

To be honest about the limits of the chosen approach:

- **Memory baseline when the container is awake stays at ~530 MB.** Static-first reduces *time alive*, not *memory while alive*. Only Path B or Path C reduces the baseline. If the cost trajectory ever pushes us toward needing 24/7 backend uptime, we have to revisit.
- **No protection against a Vercel bandwidth spike.** Vercel Hobby caps at 100 GB/month free egress. A 10 MB Wasm bundle (if Path B is ever adopted) hits this at ~10,000 visitors. Not relevant today; flagged for whoever revisits Path B.
- **The static assets do not include user uploads.** A user who uploads their own yarn or garment expects it to work. The backend has to be unpaused for that path. If the backend is paused at the moment a real user uploads, they see an error. Acceptable trade-off given the audience composition (mostly demo visitors), but worth knowing.
- **Cross-tab or cross-device sync.** Each browser tab is its own world. Two tabs of the same user generate two server sessions. Out of scope until accounts arrive.

---

## When to Revisit This Decision

Reopen this ADR if any of the following becomes true:

- **Custom uploads become a meaningful share of traffic.** Currently rare. If they grow, the backend's always-on bill returns and Path B becomes attractive.
- **Vercel Hobby bandwidth or build limits start showing pressure.** Static assets shift cost from compute to bandwidth. Today both are well under their respective free-tier caps.
- **A real bill arrives despite the discipline rule.** That signals either the rule is being violated, the metrics are misleading, or the cost shape changed (new dependencies, larger image samples, etc.).
- **A new free-tier provider launches that gives both 1 GB+ RAM and auto-sleep.** Architecturally interesting, would change the analysis. Watch the JAMstack and edge-platform space.
- **A meaningful number of friends or community members ask for an ability the static path cannot provide** (account-bound saved palettes, shared galleries, anything that requires server-side state). At that point, the cost frame changes from "free-tier discipline" to "investment in real product," and a different ADR replaces this one.

---

## Decision

Adopt the static-first architecture. Stay on Railway Hobby with manual pause discipline. Add the four code-level guardrails before Phase 2 ships. Defer Path B and Path C. Enforce the three-part discipline rule in `CLAUDE.md` at code review.

Total expected monthly cost at current traffic patterns and discipline adherence: £0 most months, capped at the Hobby tier's $5 credit even in the worst case.

---

## Update: 2026-05-17 — Platform pivot to HuggingFace Spaces

**What changed.** ChromaKnit's backend moved from Railway Hobby to HuggingFace Spaces (Docker SDK, free CPU basic, 16 GB RAM, 2 vCPU, sleep-on-idle).

**Why.** The "Railway Hobby with manual pause discipline" decision above assumed the operator would remember to pause the project when not developing. In practice, Railway's pause behaviour returns connection-refused to public requests, which means an unpaused project bills 24/7 but a paused project breaks the upload feature for any real visitor. The discipline rule was structurally fragile: forgetting to unpause hurts users; remembering to unpause exhausts the credit. There was no "wake on request" middle ground.

HuggingFace Spaces solves the structural problem: it sleeps when idle, wakes on request (~30 to 60 seconds cold start), and bills £0 throughout. The visitor pays a one-time wake latency instead of the operator paying for always-on uptime. That trade matches ChromaKnit's traffic shape (mostly idle, occasional cold start acceptable).

**What this updates in the analysis above.**

- The Provider Analysis table was missing HuggingFace Spaces. Adding it: free CPU basic (16 GB RAM, sleep-on-idle, free), the cleanest fit for ChromaKnit's memory shape AND its idle profile.
- The "no free tier gives 1 GB+ RAM AND auto-sleeps" claim is now wrong. It was wrong at the time too; HF Spaces was missed in the original scan because it is positioned as an ML demo host rather than a generic Docker host.
- The discipline rule's third clause ("paused when not developing") is now automatic rather than manual: HF Spaces sleeps itself after ~48 hours of no traffic.

**What this does not change.**

- Static-first is still the right architecture. The dominant flow still runs from precomputed assets with zero backend involvement.
- The four code-level guardrails (rate limits, daily budget, semaphore, session cap, timeout) still apply; the only difference is that the backend's idle bill is zero instead of capped at the Hobby tier credit.
- The trade-off section ("memory baseline when awake stays at ~530 MB") still applies because the model still loads in the awake container. HF Spaces does not reduce *memory while alive*, just *time alive billed to operator*.

**Cold-start UX cost.** Users who upload their own garment after the Space has been idle for >48 hours see a 30 to 60 second cold start on their first request. The frontend shows a "warming up the backend" state after 5 seconds so they know it is not broken. Subsequent uploads within the same wake cycle are fast.

**Rollback.** The Railway project is paused, not deleted. If HuggingFace Spaces ever fails (build will not pass, cold starts grow too long, persistent CORS issues), unpause Railway and revert `chromaknit-frontend/.env.production` to point back at the Railway URL.
