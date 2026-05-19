# SECURITY.md audit, section by section

Date: 2026-05-19
Scope: entire repository at HEAD on branch `multi-yarn`.
Method: read SECURITY.md, grep + targeted file reads. No code modified.

Conventions:
- Status: compliant / partial / non-compliant / not applicable
- Risk: critical (exploitable now in production) / high (exploitable under realistic conditions) / medium (defence-in-depth gap) / low (best-practice drift)

---

## Staff-engineer review (2026-05-19)

The section-by-section audit below applies SECURITY.md verbatim. This review applies threat-model judgment and overrides the audit where they disagree.

### Threat model

ChromaKnit is a hobby/portfolio project. Stated and verified properties:

- **Money at stake: £0, platform-protected.** HF Spaces free CPU basic does not bill compute overage; the Space hits concurrency limits and serves 503s rather than incurring cost. Vercel Hobby has a hard 100 GB bandwidth cap, also enforced by 503 not by invoice. The £0 target in [CLAUDE.md](CLAUDE.md) is enforced by the platforms, not by app-level rate limits.
- **Data at stake: none.** No PII collected. No persisted user images (30-minute in-memory session, see [api/sessions.py:25](api/sessions.py#L25)). No accounts. No databases.
- **Users at stake: ~0 today, expected ~handful (recruiters, friends, ADR readers).** "Denial of service for legitimate users" is a real but bounded concern.
- **Adversaries we defend against:** random internet scanners; low-effort griefers who find the URL on the maintainer's CV.
- **Adversaries we explicitly do not defend against:** targeted attackers, competent abusers with infrastructure, anyone willing to spend more than a half-hour on this.
- **Reputational risk:** "the demo is broken right now during a recruiter's visit." Real but bounded.

The audit's `risk` column was calibrated against a "real production app with paying users" model. Against the ChromaKnit threat model, several findings drop a tier or two.

### Sanity-check of the audit's high-risk findings

**§5 rate-limiting marked high — REAL but DEMOTE to medium.** The audit's framing ("HF Spaces compute and Vercel bandwidth are paid surfaces") is wrong for the actual plans in use: free CPU basic on HF Spaces and Hobby on Vercel both cap by 503, not by bill. The remaining risk is UX degradation during abuse, which matters but is not "high exploitable" given the user count.

**§12 cumulative "high" — DECOMPOSE, not a separate rating.** It is a meta-rating of items that are reassessed individually below.

**§3 magic-byte gap marked medium — DEMOTE to low.** I over-flagged this. There is no upload-then-serve flow anywhere; the response is always a freshly re-encoded PNG of the *recoloured* output, never the user's original bytes. Polyglot files (PNG-with-HTML, SVG-with-script) have no rendering surface here. The actual file-upload risk surface is the decompression bomb, which is a separate finding (A1) and stays at medium.

**§8 dependencies marked medium-high — SPLIT.** Frontend `^` ranges are cosmetic because CI uses `npm ci` (verified [.github/workflows/tests.yml:49](.github/workflows/tests.yml#L49)), which respects the lockfile and refuses to mutate it. The actual risk is the backend's `requirements.txt` where `pip install` re-resolves on every Docker rebuild. Demote frontend to low; backend stays medium.

**§1 secrets marked medium — DEMOTE to low.** No secrets exist. The audit reasoned defensively about a future state where secrets get added, but that's not the current risk. Reactivates the day a secret is introduced.

### Re-rated risk table

| Finding | Audit risk | Staff risk | Decision | Why |
|---|---|---|---|---|
| §1 no gitleaks hook | medium | low | accept | No secrets exist. Hook becomes mandatory the day the first secret is introduced. |
| §1 no `.env.example` | medium | low | accept | Two env vars, both documented inline ([config.ts:1](chromaknit-frontend/src/config.ts#L1), [log_config.py:48](core/log_config.py#L48)). |
| §1 no log redaction helper | medium | low | accept | No sensitive fields are logged today; revisit when adding a field that could contain user content. |
| §1 tracked `.env.development`/`.env.production` | medium | low | **fix** | Cheap; either `git rm --cached` or relax the ignore rule for consistency. |
| §3 no magic-byte check | medium | low | accept | No serve-back. Polyglots harmless. |
| §3 percentages not strictly validated | medium | low | accept | Worst case: a malformed weights array produces a wrong-looking recolour for the requester only. No persistence, no fan-out. |
| §3 no decompression-bomb guard (A1) | medium | medium | **resolved** | Pillow header pre-flight added in `validate_image_dimensions` ([api/main.py](api/main.py)); rejects > 25 MP before cv2 decode. Tests `test_extract_colors_rejects_decompression_bomb` and `test_create_session_rejects_decompression_bomb`. See commit `guard image uploads against decompression bombs (SECURITY.md §3)`. |
| §3 no `colors` field length cap | medium | low | accept | Starlette caps request bodies (default 1 MB form field). Verified by reading Starlette source separately; revisit if hit. |
| §5 no rate limit | high | medium | **fix (light)** | Platform-protected £0, but worker is single. Add slowapi with generous defaults (60/min) — main goal is to stop a runaway client from pinning the only worker, not to enforce a quota. |
| §5 no operation timeouts (A8) | high | medium-high | **resolved** | `run_in_thread_with_timeout` helper added in [api/main.py](api/main.py); wraps `downscale_image`, `extract_dominant_colors`, `GarmentRecolorer.prepare`, `GarmentRecolorer.apply_colors`. 30-second default deadline; 408 on timeout. Tests `test_extract_colors_returns_408_on_operation_timeout` and `test_create_session_returns_408_on_operation_timeout`. See commit `add per-operation timeouts on CPU-bound calls (SECURITY.md §5)`. |
| §5 no kill switch | high (via §12) | low | accept | Hobby project. If abuse appears, "Pause Space" button in HF dashboard is the kill switch. Documented here so it's not re-flagged. |
| §6 mutating endpoints lack explicit authz check | n/a (compliant for policy) | accepted by policy | accept | "Anyone can use it" is the deliberate product choice. Session-ID unguessability (UUID4 = 122 bits) + the rate limit above is the threat-model boundary. SECURITY.md §6 should note this exception. |
| §6 session_id not bound to client | low | low | accept | Replay does nothing not already permitted by the "anyone can use it" policy. |
| §8 frontend `^` ranges | medium-high | low | accept | `npm ci` + lockfile makes builds reproducible. Cosmetic conflict with SECURITY.md wording. |
| §8 backend unpinned deps | medium-high | medium | **fix** | Each Docker rebuild re-resolves. `pip-compile --generate-hashes` into `requirements.lock`. |
| §8 no audit in CI | medium-high | low | accept (now) / **fix (when convenient)** | Zero-user supply chain is mostly a maintainer-laptop risk. Add `pip-audit` step when next touching CI. |
| §9 wildcard methods/headers | low | low | accept | API has only POST/GET/OPTIONS in practice and accepts standard browser headers. Narrowing is hygiene, not security. |
| §9 hardcoded Vercel preview origins | low | low | **fix** | Operational, not security. Preview deploys break on new branches and tempt looser configs under pressure. Use `allow_origin_regex`. |
| §10 `Error: {exc}` leak | low | low | accept | JSONDecodeError detail is parser-internal and harmless. Cleaner messaging is nice but not security-load-bearing. |
| §11 no `.env.example` | low | low | accept | See §1 row above. |
| A1 decompression bombs | medium | medium | **fix** | See §5 timeouts row. Same code change handles both. |
| A2 slugify-as-path-builder | low | accept | accept | Verified all `slugify` callers (App.tsx:272, App.tsx:393) receive only hardcoded sample labels. Uploaded yarn labels never reach slugify→URL. Reactivates if a future feature passes user labels into a URL builder. |
| A3 Formspree egress undisclosed to users | low | low | accept | One low-traffic feedback channel. Add a sentence to the privacy footer the next time the README is edited. |
| A4 `/docs` enabled in production | low | accept | accept | For a portfolio piece this is a *feature*, not a bug: it lets a recruiter see the API surface. Treat as deliberate. |
| A5 no global multipart cap | medium | low | accept | Starlette's default form parser caps individual fields; verify exact limit if abuse pattern appears. |
| A6 single-worker session store | low (operational) | accept | accept | Already explicit in [api/sessions.py:56-58](api/sessions.py#L56-L58). Will revisit when scaling. |
| A7 no security headers | low | accept | accept | API returns JSON/PNG; frontend is static. CSP-equivalent value is near zero. Add HSTS and X-Content-Type-Options at the edge if a CDN is ever introduced. |

### What to actually fix, in order

1. **Decompression-bomb guard + per-operation timeouts** ([api/main.py](api/main.py) upload paths + rembg/cv2/kmeans calls). Single PR. Pillow header pre-flight (reject `width*height > 25M`) plus `asyncio.wait_for(..., timeout=30)` around the three CPU-bound calls. Closes the only realistic Space-crash vectors.
2. **Light per-IP rate limit.** slowapi, generous defaults (e.g. 60 req/min/IP), single decorator on the three POST endpoints. Goal is "stop a runaway client from pinning the worker," not "enforce a quota."
3. **Pin backend deps.** `pip-compile --generate-hashes` → `requirements.lock`, switch Dockerfile and CI to install from the lock. Frontend already fine via `npm ci`.
4. **CORS preview regex.** Replace the hardcoded preview-origin list with `allow_origin_regex` so new Vercel branches don't break under deadline pressure.
5. **Resolve the tracked-vs-ignored `.env.*` inconsistency.** Either `git rm --cached` the two files or amend the ignore rule. Cosmetic but the contradiction is a footgun.

Items 1 and 2 together close ~80% of the realistic risk surface and are about half a day's work. Items 3-5 are tidy-up that can land any time.

### Accepted risks (do not re-flag without new information)

Recorded explicitly so a future audit pass against SECURITY.md doesn't re-discover these as bugs:

- **No pre-commit secret scanner.** Nothing to scan today. Install when the first secret is introduced.
- **No `.env.example`.** Two env vars, documented inline. Add when the count goes above ~5.
- **No log-redaction helper.** Nothing sensitive is logged. Add when a logger call grows a free-text user field.
- **No magic-byte validation.** No serve-back, no rendering surface for polyglots. Decompression-bomb guard alone covers the realistic risk.
- **Percentages not strictly validated.** Worst case affects only the requesting client's own recolour output.
- **No `colors` field length cap.** Starlette default form cap is sufficient until proven otherwise.
- **No kill switch env var.** HF dashboard "Pause Space" button serves the same purpose for a project at this scale.
- **No `npm audit` / `pip-audit` in CI.** Add opportunistically, not blocking.
- **CORS wildcard `allow_methods` and `allow_headers`.** Defence-in-depth gap on a deliberately public API. Narrowing later is cheap if motivated.
- **"Anyone can use it" with no auth check on mutating endpoints.** Deliberate. UUID4 + light rate limit is the boundary.
- **`/docs` enabled in production.** Portfolio feature, not bug.
- **No security headers (CSP / HSTS / etc.) set at the app layer.** Static frontend + JSON/PNG API; near-zero protective value.
- **Single-worker in-memory session store.** Documented. Will revisit at scaling time.
- **Slugify-as-path-builder pattern.** Currently safe because all callers receive hardcoded labels. Reactivates if a future feature uses user-supplied labels in a URL.
- **Formspree third-party egress not in a user-visible privacy note.** One low-traffic feedback channel. Add to README footer opportunistically.
- **No global multipart request-size cap.** Starlette default deemed sufficient; revisit on evidence of abuse.

A SECURITY.md amendment should record these as an "Accepted for hobby-tier deployments" appendix so future re-reads of the standard don't keep flagging them.

### What this changes about SECURITY.md itself

The audit treated SECURITY.md as binding doctrine for this project. On reflection it is calibrated for a production app with paying users; ChromaKnit is not that. Two structural fixes to SECURITY.md would prevent the same kind of false-positive flagging next time:

1. **Add a threat-model preamble.** A SECURITY.md without a threat model is just a checklist. Stating "this project assumes free-tier deployment, no PII, no auth, single-digit users" up front tells future-Claude (and future-me) when to apply a rule strictly and when to apply it as defence in depth.
2. **Mark LLM-specific rules as dormant.** §4 entirely, §5 LLM caps, §6 cookie/password rules, §11 JS-framework patterns. All listed under "Rules that don't apply" in this audit. They should be inline in SECURITY.md as `(dormant — activates when X is introduced)` rather than removed.

Both changes are doc-only and don't affect the standard's strength for the parts that do apply.

---

## §1. Secrets and credentials

**Status:** partial
**Risk:** medium

**Evidence**
- No literal API keys, tokens, or secrets present in tracked source. Searched `(API_KEY|SECRET|TOKEN|PASSWORD|sk-ant|sk-proj|Authorization)` across `*.py *.ts *.tsx *.yml *.yaml *.json *.md *.env*`; only matches are documentation, SECURITY.md itself, ADR text, and npm `js-tokens`.
- `.env.local` and `.env` are gitignored at [.gitignore:34-35](.gitignore#L34-L35). Verified: `git check-ignore .env.local .env` exits 0 for both.
- `.env*` covered for the frontend at [chromaknit-frontend/.gitignore:25-27](chromaknit-frontend/.gitignore#L25-L27), but two env files are tracked in git anyway: [chromaknit-frontend/.env.development](chromaknit-frontend/.env.development) and [chromaknit-frontend/.env.production](chromaknit-frontend/.env.production). Their only content is `VITE_API_URL`, a genuinely public value (the Vite `VITE_` prefix exposes the variable to client bundles), so this is not a leak. It is however a contradiction with the gitignore line, because the files predate the ignore rule and `git` does not retroactively untrack.
- No `.env.example` exists at the repo root; SECURITY.md §11 says "verify every `process.env.*` reference exists in `.env.example`". Backend reads `LOG_LEVEL` at [core/log_config.py:48](core/log_config.py#L48); frontend reads `VITE_API_URL` at [chromaknit-frontend/src/config.ts:1](chromaknit-frontend/src/config.ts#L1).
- No `gitleaks` or `git-secrets` configuration anywhere. Glob `**/.pre-commit*` and `**/.husky/**` return no matches. CI workflow at [.github/workflows/tests.yml](.github/workflows/tests.yml) runs pytest + npm lint + npm build only; no secret scanning step.
- Logging: structured JSON formatter at [core/log_config.py:25-40](core/log_config.py#L25-L40) preserves every caller-supplied `extra={...}` field verbatim. There is no redaction helper. Nothing currently logs an `Authorization` header or token (none are received), but the formatter has no defence in depth: any future `logger.info(..., extra={"api_key": v})` would leak.

**Gaps**
- No pre-commit secret scanner installed; SECURITY.md says "Refuse to commit if the hook is missing."
- No `.env.example` documenting which env vars are expected.
- No redaction helper in the JSON logger; a single line in future code can leak.
- Frontend `.env.development` / `.env.production` are tracked despite the ignore rule. Cosmetic today, but the inconsistency means a developer cannot rely on the ignore rule to keep new env files out of commits.

**Recommended fix**
Install `gitleaks` (or `git-secrets`) as a pre-commit hook and a CI job. Add a `.env.example` at the repo root that lists `LOG_LEVEL` (server) and `VITE_API_URL` (client, public) so SECURITY.md §11 has something to check against. Add a small `redact()` helper in `core/log_config.py` that masks keys matching `(?i)(authorization|api[_-]?key|token|password|secret)` regardless of where in the payload they appear, and wire it into `JsonFormatter.format`. Decide whether the two tracked `.env.*` files should be `git rm --cached`'d to match the ignore rule, or whether the ignore rule should be relaxed to "only ignore `.env.local`" so the public ones can stay tracked without contradiction.

---

## §2. Server vs client boundary

**Status:** compliant
**Risk:** low

**Evidence**
- No LLM provider SDK imported anywhere. Searched `(anthropic|openai|claude\.ai|gpt-|api\.openai\.com|api\.anthropic\.com)` across the codebase; only matches are SECURITY.md, ADRs, and the interview-prep PDF script.
- No database, KV, or storage credentials in frontend source. `chromaknit-frontend/src/` has no DB drivers, no Supabase/Firebase imports.
- Only client-side fetches: `${API_BASE_URL}/api/*` ([App.tsx:223,319,556](chromaknit-frontend/src/App.tsx#L223)) and the Formspree feedback endpoint ([components/ReportIssue.tsx:11](chromaknit-frontend/src/components/ReportIssue.tsx#L11), public).
- Backend service runs as non-root inside Docker ([Dockerfile:71-72](Dockerfile#L71-L72)).

**Gaps**
None for the current stack.

**Recommended fix**
None required. Re-check this section the first time an LLM call, database connection, or third-party SDK is added.

---

## §3. Untrusted input handling

**Status:** partial
**Risk:** medium

**Evidence**
- Hex color regex defined at [api/main.py:26](api/main.py#L26) and applied in `_parse_color_list` at [api/main.py:245-278](api/main.py#L245-L278). Color list validated as a non-empty list of `^#[0-9A-Fa-f]{6}$`. Good.
- Percentages parser at [api/main.py:281-291](api/main.py#L281-L291) accepts any JSON list; it does not validate that elements are floats, that they are bounded `[0, 1]`, that the list length matches the color list length, or that they sum to ≈1.
- File size: Pydantic-driven `n_colors` is bounded `1..10` via `Form(..., ge=1, le=10)` at [api/main.py:150](api/main.py#L150). File size is fast-checked via advertised `file.size` at [api/main.py:188](api/main.py#L188) / [api/main.py:306](api/main.py#L306) and authoritatively checked by streaming cap in `save_upload_capped` at [api/main.py:32-59](api/main.py#L32-L59). Test: [tests/test_api.py:268-286](tests/test_api.py#L268-L286).
- MIME prefix check on `file.content_type` at [api/main.py:179](api/main.py#L179) and [api/main.py:301](api/main.py#L301). `content_type` is client-supplied and trivially spoofable.
- **No magic-byte check anywhere.** Searched `(magic.?byte|imghdr|filetype|magic\.)` against `**/*.py`: no matches. Validation relies on `cv2.imread()` returning `None` for non-decodable bytes ([api/main.py:103-104](api/main.py#L103), [core/utils.py:10-16](core/utils.py#L10-L16)). This is detection by failure, not by inspection. A polyglot file (e.g. a PHP/HTML payload prefixed with PNG header bytes, or an SVG with embedded scripts) can pass the content_type and extension checks and only fail at decode time, by which point the bytes have already been streamed and written to disk.
- **No decompression-bomb guard.** `cv2.imread()` decodes the full image into RAM before `downscale_image()` runs ([api/main.py:101-112](api/main.py#L101-L112)). A 200-megapixel PNG (~5 MB compressed, fits inside the 5 MB cap) can balloon to ~800 MB once decoded, which will OOM the HF Spaces free CPU tier (2 GB RAM).
- `session_id` from form data ([api/main.py:378](api/main.py#L378)) is accepted as an arbitrary string and used only as a dict key in [api/sessions.py:87](api/sessions.py#L87). No traversal or injection risk: it is never used to build a file path. Acceptable.
- `_parse_color_list` JSON parse has no upper bound on the input string length before `json.loads`. python-multipart form-field defaults are large enough that a multi-megabyte `colors` string is possible.

**Gaps**
- No magic-byte validation; SECURITY.md §3 says "Never trust the extension" and explicitly lists magic bytes as a required check.
- No decompression-bomb guard. cv2 has no equivalent of `PIL.Image.MAX_IMAGE_PIXELS`.
- Percentages list lacks element-level validation (type, range, length match, NaN).
- Color list JSON has no length cap before parse.
- Spoofable `content_type` is the only barrier before bytes are written to a tempfile.

**Recommended fix**
Run a Pillow pre-flight on every upload: open the buffer with `PIL.Image.open(io.BytesIO(head))` on just the first ~64 KB to validate magic bytes and read declared dimensions, reject anything not in `{PNG, JPEG, WEBP}` and anything whose `width * height > 25_000_000` pixels, then hand off to cv2 for actual decode. Add Pydantic-style validation to `_parse_percentages`: require each element to be a finite float in `[0, 1]`, require the list length to equal the color list length when both are present, and accept a small tolerance on the sum. Cap the raw `colors` form field at, say, 4 KB before parsing JSON. None of these is more than 20-30 lines of code.

---

## §4. Prompt injection defence

**Status:** not applicable
**Risk:** n/a

**Evidence**
- No LLM provider call exists anywhere in the codebase (see §2).
- All "intelligence" is classical: scikit-learn KMeans for color extraction ([core/yarn_color_extractor.py:60-64](core/yarn_color_extractor.py#L60-L64)), rembg/U²-Net for background removal ([core/garment_recolor.py:50-65](core/garment_recolor.py#L50-L65)), HSV remap for recolouring ([core/garment_recolor.py:99-143](core/garment_recolor.py#L99-L143)).

**Gaps**
None today. This section reactivates the moment any LLM call is introduced; flag it as dormant rather than ignored.

**Recommended fix**
Mark §4 as "dormant" in SECURITY.md, with a note: "activates if and when an LLM call is introduced, including a chat helper, image captioning, or palette naming."

---

## §5. Rate limiting and abuse

**Status:** non-compliant
**Risk:** high

**Evidence**
- **No rate limiting middleware.** Searched `(rate.?limit|RateLimit|slowapi|limiter)` against `**/*.{py,ts,tsx}`: only matches are the interview-prep PDF script and a frontend comment at [App.tsx:207](chromaknit-frontend/src/App.tsx#L207) describing "Phase C rate limits" as future work.
- **No kill switch.** Searched `(MAINTENANCE_MODE|kill.?switch)`: matches only in SECURITY.md and CLAUDE.md. No code path inspects a maintenance flag.
- **No network/operation timeouts** in backend. `cv2.imread`, `rembg.remove`, K-means clustering all run unbounded. Searched `(timeout|asyncio\.wait_for)` against `**/*.py`: no matches. CLAUDE.md says "All long-running operations must have timeouts (default: 30s)."
- **No retry caps.** Frontend does not retry on error (good); backend has nothing that would retry.
- Caching does exist per session: [api/sessions.py:106-116](api/sessions.py#L106-L116) and [api/main.py:398-402](api/main.py#L398-L402). Same `(session, colors, percentages)` returns cached PNG. ✓ for SECURITY.md "Cache aggressively."
- HF Spaces free tier sleeps after idle, which acts as a soft natural cap, but a single attacker can keep the Space awake and burn CPU minutes and bandwidth indefinitely by re-uploading. No quota enforcement.

**Gaps**
- No per-IP rate limit. CLAUDE.md mandates this for all API endpoints; SECURITY.md mandates it for endpoints triggering paid calls. Even with no LLM bill, the HF Spaces compute and Vercel bandwidth are paid surfaces.
- No timeouts on rembg, cv2, K-means. A pathological image can pin the single Space worker indefinitely, denying service to other users (one process, no replicas).
- No maintenance kill switch.

**Recommended fix**
Add a per-IP rate limit using `slowapi` (FastAPI-native, two new dependencies, ~30 lines). Defaults from SECURITY.md: 10 req/min, 20 req/day, applied to `/api/colors/extract`, `/api/garments/session`, `/api/garments/recolor`. Wrap the rembg call and the K-means call in `asyncio.wait_for` with a 30 second budget. Add a `MAINTENANCE_MODE` env var that short-circuits all three endpoints to a static 503 response. None of these is more than half a day's work; collectively they close the biggest exposure in the audit.

---

## §6. Authentication and authorisation

**Status:** compliant for the stated "anyone can use it" policy
**Risk:** low

**Evidence**
- No authentication is configured anywhere. The product policy is "anyone can use it" per CLAUDE.md and the v2 plan memory.
- `session_id` is generated server-side using `uuid4()` at [api/sessions.py:71](api/sessions.py#L71). UUID4 carries 122 bits of entropy; brute-forcing a valid session is not realistic.
- No client-sent user IDs are trusted anywhere. The frontend never claims an identity to the backend.
- Frontend uses `localStorage` only for the yarn palette (non-secret user data): [chromaknit-frontend/src/hooks/useAppState.ts:259-283](chromaknit-frontend/src/hooks/useAppState.ts#L259-L283). No tokens, no credentials.
- No passwords stored or handled anywhere.
- API routes that mutate state (`/api/garments/session`, `/api/garments/recolor`) accept any caller. That matches the "anyone can use it" policy; SECURITY.md §6 says "even when 'anyone can use it' is the policy" the route should have an explicit authorisation check. Today, there is no check at all because there is no concept of identity.

**Gaps**
- Session IDs are not bound to anything (not even loosely to the originating IP or first-seen UA). Anyone who sniffs or guesses a session UUID can replay against that session. Threat model: bug-bounty-low because the UUID is unguessable and the impact of replay is "recolour the same garment with a chosen palette", which is the public functionality anyway.
- §6's "API routes that mutate require an explicit authorisation check" rule is technically unsatisfied. This is a doctrine vs reality mismatch SECURITY.md should resolve.

**Recommended fix**
Decide explicitly: either keep "anyone can use it" and amend SECURITY.md to acknowledge that mutating endpoints in this project rely on rate limiting + session-ID unguessability for protection, or add a lightweight CSRF-style origin check (`X-Requested-With` header or `Origin` header validation) so that random third-party sites cannot use a victim's browser to drive the API. The cookie rules in §6 do not apply because sessions live on the server keyed by an opaque ID returned in the response body.

---

## §7. Data and privacy

**Status:** compliant
**Risk:** low

**Evidence**
- Logging at [core/log_config.py](core/log_config.py): structured JSON, only `extra={...}` fields are written, not full request bodies. Examples in [api/main.py:357-363](api/main.py#L357-L363) and [api/main.py:417-420](api/main.py#L417-L420) log `session_id`, `width`, `height`, cache key, byte counts — no image bytes, no filenames-as-content.
- One filename field is echoed back in the response body at [api/main.py:218](api/main.py#L218); that field is the user's own filename, returned to the same user. Not logged server-side.
- Image data lives in memory only ([api/sessions.py:28-44](api/sessions.py#L28-L44)) with a sliding 30-minute TTL ([api/sessions.py:25](api/sessions.py#L25), [api/sessions.py:92-100](api/sessions.py#L92-L100)). No disk persistence except temp upload files which are unlinked in `finally` ([api/main.py:222-224](api/main.py#L222-L224), [api/main.py:371-373](api/main.py#L371-L373)).
- No PII collection: no email, no name, no IP fields written to any store. Formspree feedback ([components/ReportIssue.tsx:53-77](chromaknit-frontend/src/components/ReportIssue.tsx#L53-L77)) sends only `category` and free-text `details` — but does so to a third party (see Additional Risks).
- No LLM provider involved, so retention defaults rule is dormant.

**Gaps**
- Formspree third-party data flow is not explicitly documented as a privacy disclosure to end users.
- Logger has no field-level redaction in case future code starts adding `extra={...}` fields that contain user-supplied text.

**Recommended fix**
Add a one-paragraph privacy note to the frontend (footer or modal) covering: "feedback you submit through the Report Issue dialog is sent to Formspree to reach the maintainer." Combine with the §1 redaction helper recommendation so that any future log line is defended in depth.

---

## §8. Dependencies

**Status:** non-compliant
**Risk:** medium-high

**Evidence**
- Frontend `package.json` at [chromaknit-frontend/package.json:13-34](chromaknit-frontend/package.json#L13-L34) uses `^` ranges on every dependency and devDependency. SECURITY.md §8 explicitly: "Pin versions in `package.json` (no `^` or `~` for production)."
- Frontend `package-lock.json` is committed and present. ✓
- Backend `requirements.txt` at [requirements.txt](requirements.txt) uses `>=` minimums with no upper bounds: `opencv-python-headless>=4.8.0`, `numpy>=1.24.0`, `scikit-learn>=1.3.0`, `matplotlib>=3.8.0`, plus completely unpinned `rembg`, `onnxruntime`, `fastapi`, `uvicorn[standard]`, `python-multipart`.
- No Python lockfile: no `Pipfile.lock`, no `poetry.lock`, no `requirements*.txt` with hashes.
- CI workflow [.github/workflows/tests.yml](.github/workflows/tests.yml) runs `npm ci` (good for reproducibility once the lockfile is trusted) but does not run `npm audit` or `pip-audit` or `safety`. No supply-chain check in CI.
- No SBOM generation, no Dependabot configuration (no `.github/dependabot.yml`).

**Gaps**
- Floating version ranges on both stacks. A compromised release of any dep (e.g. `rembg`, which fetches a large ML model on startup) lands on the next pip install or `npm install` in the next deploy.
- No automated vulnerability scan blocks merges.
- Python has no lockfile of any kind.

**Recommended fix**
Pin frontend dependencies to exact versions (replace `^` with literal versions in `package.json`; the lockfile already has the resolved versions, so this is a mechanical change). Generate a Python lockfile with `pip-compile --generate-hashes` (from `pip-tools`) into `requirements.lock` and use that in CI and the Dockerfile. Add `npm audit --audit-level=high` and `pip-audit -r requirements.lock` steps to [.github/workflows/tests.yml](.github/workflows/tests.yml), failing the build on high/critical findings. Optionally enable Dependabot for both ecosystems to get automated PRs.

---

## §9. CORS and same-origin

**Status:** partial
**Risk:** low

**Evidence**
- CORS configured with an explicit allowlist at [api/main.py:70-95](api/main.py#L70-L95). No `Origin` reflection. ✓
- `allow_credentials=True` ([api/main.py:92](api/main.py#L92)) is paired with specific origins, not wildcard. ✓
- `allow_methods=["*"]` and `allow_headers=["*"]` ([api/main.py:93-94](api/main.py#L93-L94)). Wildcards, broader than required (the API only needs `GET, POST, OPTIONS` and a small set of headers). SECURITY.md §11 lists `cors() with no options` as a classic insecure default; the FastAPI shape is similar in spirit even if not literally that pattern.
- Vercel preview origins: only one branch-specific URL is whitelisted (`https://chromaknit-git-multi-yarn-charlyx125.vercel.app`). New preview branches will be blocked by CORS until [api/main.py:76](api/main.py#L76) is edited and the Space redeployed.
- `https://huggingface.co` is in the allowlist ([api/main.py:85](api/main.py#L85)) so that the Space dashboard can call the API for its `/docs` UI. Broader than strictly needed for the frontend flow; acceptable for the Space embed.
- The interview-prep file itself flags hardcoded CORS as a known gap ([chromaknit-interview-reference.py:475](chromaknit-interview-reference.py#L475), [chromaknit-interview-reference.py:489](chromaknit-interview-reference.py#L489), [chromaknit-interview-reference.py:557](chromaknit-interview-reference.py#L557)).

**Gaps**
- Wildcard methods/headers.
- Hardcoded preview URLs do not scale; the practical effect is broken previews, not a security hole, but it pushes engineers towards looser configurations under deadline pressure.

**Recommended fix**
Replace `allow_origins=[...]` with `allow_origin_regex=r"^https://chromaknit(-git-[a-z0-9-]+)?-charlyx125\.vercel\.app$"` for the Vercel pattern, plus a short literal list for production, localhost, and the Space's own origin. Narrow `allow_methods` to `["GET", "POST", "OPTIONS"]` and `allow_headers` to `["Content-Type", "Accept"]`. Move the origins/regex into an env variable so adding a new origin does not require a code change.

---

## §10. Error handling

**Status:** partial
**Risk:** low

**Evidence**
- `HTTPException(detail=...)` is the standard error shape. Most details are user-facing-safe strings ("File too large", "Invalid hex color format", "Session not found or expired").
- One detail leaks parser internals: at [api/main.py:264](api/main.py#L264), `Error: {exc}` interpolates the raw `json.JSONDecodeError` or `ValueError` message into the response. JSONDecodeError messages include character positions and a snippet of the offending input; not a meaningful exposure but contrary to "Never expose internal errors to users."
- Custom 404 handler at [api/main.py:427-447](api/main.py#L427-L447) returns a generic "endpoint not found" shape, with a passthrough for `HTTPException(404)` raised on purpose (session expired). ✓
- Server-side, `logger.exception(...)` is used at [core/garment_recolor.py:64](core/garment_recolor.py#L64); stack traces stay in the JSON logs and do not reach clients.
- FastAPI default for uncaught exceptions: "Internal Server Error" body, no stack trace. ✓ (debug mode is not enabled.)
- Frontend `ErrorBoundary` at [chromaknit-frontend/src/components/ErrorBoundary.tsx:23](chromaknit-frontend/src/components/ErrorBoundary.tsx#L23) uses `console.error` for stack traces. Browser console only; not a server-side exposure.
- No 403-vs-404 distinction needed because there is no auth.

**Gaps**
- `Error: {exc}` in `_parse_color_list` is a minor leak of internal exception detail.
- The 500-level details in `/api/garments/session` and `/api/garments/recolor` ("Could not encode foreground mask", "Could not apply colours") are generic and safe, but consistent practice would be to log the real reason and return an opaque "internal error" detail.

**Recommended fix**
Replace the `Error: {exc}` interpolation in `_parse_color_list` with a static "color value could not be parsed" message and `logger.warning(..., extra={"exc": str(exc)})` for the internal record. Consider a uniform pattern: log full context with `logger.exception` server-side, return a short generic detail to the client.

---

## §11. AI-specific failure modes

**Status:** partial
**Risk:** low

**Evidence**
- No JWT, no `crypto.createCipher`, no `express.json()`, no hand-rolled email regex. Searched `(dangerouslySetInnerHTML|eval\(|innerHTML\s*=|new Function)` across the frontend: no matches.
- `cors() with no options` — N/A; FastAPI CORS is explicitly configured (see §9).
- `express.json() with no size limit` — N/A; size enforcement lives in `save_upload_capped` at [api/main.py:32-59](api/main.py#L32-L59) and is tested.
- No `TODO`, `FIXME`, `XXX`, `HACK` markers in any `*.py *.ts *.tsx` file. Searched explicitly; zero matches.
- Made-up env vars: only two real env-var references — `LOG_LEVEL` ([core/log_config.py:48](core/log_config.py#L48)) and `VITE_API_URL` ([chromaknit-frontend/src/config.ts:1](chromaknit-frontend/src/config.ts#L1)). No `.env.example` to validate them against.
- Skipped error handling: every `await fetch(...)` in [App.tsx](chromaknit-frontend/src/App.tsx) is wrapped in try/catch; backend cv2/rembg paths have try/except.
- `email.includes('@')`-style fake validation: none found.

**Gaps**
- No `.env.example` means there is nothing to grep against to catch a future hallucinated env var.
- `Error: {exc}` echo of a parser exception (also flagged in §10) is the kind of "plausible but wrong" insecure default this section warns against.

**Recommended fix**
Combine with §1: add `.env.example` listing `LOG_LEVEL` (server) and `VITE_API_URL` (client). Add a CI step that greps `os.getenv\|process\.env\|import\.meta\.env` and asserts every referenced key appears in `.env.example`. Catches every future hallucinated env-var reference for free.

---

## §12. Pre-deploy checklist

**Status:** non-compliant (multiple items fail)
**Risk:** high (cumulative)

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | No secrets in source code (gitleaks clean) | ❌ no scanner | §1 |
| 2 | `.env.local` in `.gitignore` | ✅ | [.gitignore:35](.gitignore#L35) |
| 3 | Secrets named without public prefix | ✅ (no secrets exist) | §1 |
| 4 | LLM provider spending cap | n/a | no LLM |
| 5 | LLM provider billing alerts | n/a | no LLM |
| 6 | LLM calls only from server routes | n/a | no LLM |
| 7 | Rate limit deployed and tested | ❌ | §5 |
| 8 | Input validation on every API route | ⚠️ partial | colors ✓; percentages partial; magic bytes ✗ — §3 |
| 9 | Prompt injection regex tested | n/a | no LLM |
| 10 | LLM response validation + retry + fallback | n/a | no LLM |
| 11 | Try/catch around every cache write and external call | ✅ | upload path, recolour path |
| 12 | Timeouts on every LLM and network call | ❌ | no timeouts anywhere; §5 |
| 13 | Structured logging, secrets redacted from logs | ⚠️ logging ✓, no redaction helper | §1, §7 |
| 14 | No TODO / FIXME / XXX markers | ✅ | §11 |
| 15 | `npm audit` clean (no high/critical) | ❌ not in CI | §8 |
| 16 | Lockfile committed | ⚠️ frontend ✓; backend ✗ | §8 |
| 17 | Error responses don't expose stack traces | ⚠️ traces hidden, but `Error: {exc}` leaks parser detail | §10 |
| 18 | Kill switch wired and tested | ❌ | §5 |

**Gaps**
Top three blocking items, in priority order:
1. Rate limit deployed and tested (item 7) — without this, the abuse-cost surface in §5 is real.
2. Network/operation timeouts (item 12) — a pathological upload pins the single worker.
3. Magic-byte validation (item 8) — closes the only realistic file-upload attack vector.

Items 1, 15, 18 (gitleaks, npm audit, kill switch) are cheap to add and close the rest.

**Recommended fix**
Treat this checklist as the punch list for the next deploy. None of the failed items require architectural change; the largest is "add a rate limiter and exercise it" which is about 30 lines of code plus a test. Doing items 1, 7, 12, 15, and 18 together is a half-day's work and would flip §12 to compliant for everything except LLM-specific items, which remain dormant.

---

## Rules that don't apply

Each item below is in SECURITY.md but does not bind any code today. Listed so they don't get checked against and silently passed.

- **§2 third sentence ("Service role keys ... server-only")** — there are no Supabase / Firebase / admin SDK keys anywhere. Reactivates if a database or admin SDK is added.
- **§4 in full (Prompt injection defence)** — no LLM call exists in the codebase. Reactivates the moment any LLM provider is called from server code, including chat helpers, image captioning, or palette naming.
- **§5 LLM-specific items** — "Provider-level hard caps", "Billing alerts at 25%/50%/75% of daily cap", "kill switch ... returns a static response without calling the LLM" are LLM-shaped. The per-IP rate limit, cache, and a generic maintenance kill switch DO apply and are flagged as gaps in §5.
- **§6 cookie session rules ("`httpOnly`, `Secure`, `SameSite=Lax` cookies. Never in `localStorage`")** — no session cookies; sessions are opaque server-side UUIDs returned in the JSON response body. The "never trust client-sent user IDs" and "API routes that mutate require an explicit authorisation check" parts of §6 do still apply.
- **§6 password rules ("`bcrypt`, `argon2` ... never store plaintext")** — no passwords are stored or handled.
- **§7 LLM data retention rule** — N/A. PII rules still apply.
- **§11 JS-specific patterns ("`cors()` with no options", "`express.json()` with no size limit", "JWT without algorithm whitelist", "`crypto.createCipher`")** — N/A; the backend is FastAPI/Python. The general "plausible but wrong" warnings (skipped error handling, hallucinated package names, fake validation, made-up env vars) DO still apply.

For each of the above, the right move is to mark them "dormant" inline in SECURITY.md rather than delete them, so they re-activate when the relevant tech is introduced.

---

## Additional risks found

Risks present in this codebase that SECURITY.md does not currently cover, plus proposed additions.

### A1. Image decompression bombs (medium)

[api/main.py:103-112](api/main.py#L103-L112) calls `cv2.imread(path)` which fully decodes the image into memory before `downscale_image()` runs. A pixel-bomb (small compressed PNG/JPEG that explodes to hundreds of megapixels) passes the 5 MB upload cap and the magic-byte check (if it gets added) but OOMs the HF Spaces 2 GB container.

**Proposed SECURITY.md addition**, under §3:
> For image uploads, validate decoded dimensions before decoding the full image. Use a header-only inspection (`PIL.Image.open(buf).size` without `.load()`) and reject anything that would exceed a configured pixel budget (default 25 MP).

### A2. Static asset path traversal vector via slugify (low today, medium if extended)

[chromaknit-frontend/src/App.tsx:17-19](chromaknit-frontend/src/App.tsx#L17-L19) defines `slugify` as just `toLowerCase().replace(/ /g, "-")`. Today's callers pass hardcoded labels from [YarnPicker.tsx:9-23](chromaknit-frontend/src/components/YarnPicker.tsx#L9-L23) so the slugged label is safe. If user-supplied yarn labels are ever passed to `slugify` and used in a URL path (e.g. `/samples/precomputed/yarns/${slug}.json`), the function will pass through `../`, `\`, control characters, and unicode normalisation tricks.

**Proposed SECURITY.md addition**, under §3:
> Any value used to construct a URL path or filesystem path must be whitelist-validated (`^[a-z0-9-]+$`), not just "cleaned" by replacement. Replacement-based slugifiers are not safe for path construction.

### A3. Third-party data egress to Formspree (low)

[chromaknit-frontend/src/components/ReportIssue.tsx:11](chromaknit-frontend/src/components/ReportIssue.tsx#L11) hardcodes a Formspree endpoint and POSTs free-text `details` from the user. SECURITY.md §7 says "never send to third-parties without documented reason." This is a documented reason — user feedback to the maintainer — but the documentation lives in code comments rather than where users can see it.

**Proposed SECURITY.md addition**, under §7:
> Document every third-party data egress (analytics, feedback forms, error reporting) in a user-visible privacy note. "Documented reason" means the user can see it, not that a code comment exists.

### A4. Public Swagger `/docs` UI in production (low)

FastAPI's `/docs` and `/redoc` are reachable on the production Space (no `docs_url=None` in the [`FastAPI(...)`](api/main.py#L63) constructor). They expose all endpoints, parameter shapes, and validation rules to anyone who finds the Space URL. Not a vulnerability per se but reduces friction for abuse.

**Proposed SECURITY.md addition**, under §10:
> Disable OpenAPI docs (`docs_url=None`, `redoc_url=None`, `openapi_url=None`) in production for any API that is not deliberately public. If documentation is wanted, gate it behind an env flag that is off by default.

### A5. Multipart request size has no global cap (medium)

Per-field size is enforced by `save_upload_capped` ([api/main.py:32-59](api/main.py#L32-L59)) but Uvicorn / Starlette have no global request-body cap. A 1 GB multipart body with junk fields plus one image will buffer through python-multipart before the endpoint runs, exhausting memory on the 2 GB container.

**Proposed SECURITY.md addition**, under §3:
> Set a server-wide max request size (Uvicorn `--limit-max-requests`, Starlette middleware, or reverse-proxy enforcement) at no more than ~10 MB above the largest expected upload. Per-field caps in route handlers are not a substitute.

### A6. Single-worker in-memory session store (low security, high reliability)

[api/sessions.py:120](api/sessions.py#L120) is a module-level singleton dict. If the Space is ever scaled to multiple Uvicorn workers (Docker `gunicorn -w 4` or HF concurrency setting), sessions become non-deterministically missing across requests. Not a security vulnerability but a reliability cliff worth noting in deploy docs.

**Proposed SECURITY.md addition**, under §12 pre-deploy checklist:
> Stateful in-memory stores are documented in deploy config as requiring single-worker mode, or migrated to an external store before scaling.

### A7. No security headers on responses (low)

The FastAPI app does not set `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, or `Strict-Transport-Security`. HF Spaces' edge sets HSTS for the `*.hf.space` domain, but the API responses themselves carry no headers and the frontend HTML at [chromaknit-frontend/index.html] does not set CSP.

**Proposed SECURITY.md addition**, under §9 or as a new §9b:
> Set sensible defaults for `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a minimal `Content-Security-Policy` (`default-src 'self'; img-src 'self' data: blob:; connect-src 'self' <api host>`) on every HTML response. Set them at the framework level so individual handlers can't forget.

### A8. No timeout on `rembg` / `cv2` operations (high)

Already flagged in §5 but worth duplicating as an additional risk because SECURITY.md frames timeouts as an LLM concern ("Timeouts on every LLM and network call" in §12 item 12). The actual risk surface here is local computation, not network.

**Proposed SECURITY.md addition**, under §5:
> "Timeouts" applies to every long-running operation, not just network calls. CPU-bound work (image decode, ML inference, K-means) on shared workers needs an `asyncio.wait_for` budget so one bad request cannot starve every other user.
