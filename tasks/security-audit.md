# SECURITY.md audit, section by section

> **Read this first.** Every gap below is classified against the threat model in [SECURITY.md §0](../SECURITY.md#L9) (hobby portfolio, no PII, £0, platform-protected billing, no targeted adversary) and cross-referenced against the accepted risks register in [SECURITY.md §13](../SECURITY.md). A finding marked `low` or `accepted §13` is not a deferred bug; it is a control that the threat model says is not load-bearing today. Reactivation triggers for each accepted risk are stated inline.

Date: 2026-05-19
Branch: `multi-yarn` at HEAD.
Scope: entire repository. Discovery only; no code modified in this pass.

Risk legend (per task brief):
- critical: exploitable now in production
- high: exploitable under realistic conditions
- medium: defence-in-depth gap
- low: best-practice drift

Findings that match a row in [SECURITY.md §13 Accepted risks](../SECURITY.md) are flagged but treated as `partial-by-design`, not as audit failures. New findings (not in §13 and not in §12) are escalated to required.

---

## §1. Secrets and credentials

**Status:** compliant (with two accepted risks per §13).

**Evidence:**
- No literal API keys, tokens, or secrets in source. Grep for `(api[_-]?key|secret|password|token|bearer)\s*[:=]` and provider key prefixes (`sk-`, `ghp_`, `AIza`, `AKIA`) over `.py/.ts/.tsx/.js/.json/.yaml/.html` returned zero matches.
- `.env` and `.env.local` ignored at repo root: [.gitignore:34-35](../.gitignore#L34-L35). `git check-ignore .env.local` returns the file (confirmed ignored). No root-level `.env*` files exist on disk.
- Tracked public-value env files: [chromaknit-frontend/.env.development:1](../chromaknit-frontend/.env.development#L1) (`VITE_API_URL=http://localhost:8000`) and [chromaknit-frontend/.env.production:1](../chromaknit-frontend/.env.production#L1) (`VITE_API_URL=https://charlyx125-chromaknit-backend.hf.space`). Both contain only the `VITE_`-prefixed (public) value.
- Frontend `.gitignore` is consistent with the tracked state: [chromaknit-frontend/.gitignore:30-32](../chromaknit-frontend/.gitignore#L30-L32) ignores `.env`, `.env.local`, `.env.*.local` but not `.env.development`/`.env.production`. `git check-ignore` returns no match for the tracked files. This resolves the contradiction called out in earlier audit notes.
- Only env-var references in code: [chromaknit-frontend/src/config.ts:1](../chromaknit-frontend/src/config.ts#L1) (`VITE_API_URL`) and [core/log_config.py:48](../core/log_config.py#L48) (`LOG_LEVEL`). Total: 2 vars. Stays under the §13 "≤5 vars" `.env.example` threshold.
- JSON formatter at [core/log_config.py:25-40](../core/log_config.py#L25-L40) emits `extra={...}` keys verbatim. Reviewed every `logger.*` call site: no field carries user-supplied text or credentials. Closest is `path` in [core/garment_recolor.py:203](../core/garment_recolor.py#L203), which is a server-side output path, not user input. The §13 "no log-redaction helper" accepted risk holds.

**Gaps:**
- No `gitleaks`/`git-secrets` pre-commit hook or CI step. Documented as §13 accepted risk (no secrets exist yet).
- No `.env.example`. Documented as §13 accepted risk (≤5 vars).
- No log-redaction helper in [core/log_config.py](../core/log_config.py). Documented as §13 accepted risk (no logged user-content field).

**Risk level:** low. All open gaps are §13 accepted risks; reactivation triggers are clearly defined.

**Recommended fix:** Hold. No action required while the §13 triggers remain unmet. Next time a secret, a user-content log field, or a sixth env var is added, the corresponding §13 row reactivates and the matching control becomes deploy-blocking. Worth a one-line note in commit messages whenever a new env var or logger field lands so the §13 thresholds get re-checked.

---

## §2. Server vs client boundary

**Status:** not applicable (entirely dormant in §2 of SECURITY.md).

**Evidence:**
- Grep for `anthropic|openai|cohere|claude|gpt|LLM|llm|completion` across `.py/.ts/.tsx/.js/.json/.yaml/.yml` matched exactly one line: a passing reference to "completion" in a comment at [api/main.py:84](../api/main.py#L84). No LLM client SDK is imported anywhere.
- No database, KV, storage, or auth SDKs in `requirements.lock` or `chromaknit-frontend/package.json`.
- Only client-side env access ([chromaknit-frontend/src/config.ts:1](../chromaknit-frontend/src/config.ts#L1)) reads `VITE_API_URL`, a genuinely public value.

**Gaps:** none.

**Risk level:** low (none active).

**Recommended fix:** none today. Reactivate the §2 rules the day an LLM client, database SDK, or service-role credential is introduced.

---

## §3. Untrusted input handling

**Status:** partial (with three accepted risks per §13). Net effect: compliant for the active threat model.

**Evidence:**
- Form constraints: `n_colors` is `Form(default=5, ge=1, le=10, ...)` at [api/main.py:247](../api/main.py#L247). Hex colour validation via `HEX_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")` at [api/main.py:31](../api/main.py#L31), applied per element in [_parse_color_list](../api/main.py#L343-L376).
- File size: client-side hint check in [api/main.py:285](../api/main.py#L285) and [api/main.py:404](../api/main.py#L404); authoritative streaming cap in [save_upload_capped](../api/main.py#L48-L75) using `UPLOAD_CHUNK_SIZE = 1 MB` and `MAX_FILE_SIZE = 5 MB`.
- MIME type: `Content-Type` startswith `image/` checks at [api/main.py:276](../api/main.py#L276) and [api/main.py:399](../api/main.py#L399). Used only as fast-reject; the streaming cap is authoritative.
- Image decompression-bomb guard: [validate_image_dimensions](../api/main.py#L114-L141) opens via `PIL.Image.open(path)` without `.load()`, then rejects on `width*height > MAX_IMAGE_PIXELS = 25_000_000`. Runs before `cv2.imread`. Test coverage at [tests/test_api.py:212-229](../tests/test_api.py#L212-L229).
- Magic-byte validation: absent. §13 accepted risk: every recolour response is a freshly re-encoded PNG ([api/main.py:518](../api/main.py#L518), `cv2.imencode(".png", recolorer.recolored_image)`); user bytes never reach a rendering surface.
- `_parse_color_list` strictly validates that every element is a `#RRGGBB` string ([api/main.py:369-374](../api/main.py#L369-L374)).
- `_parse_percentages` ([api/main.py:379-389](../api/main.py#L379-L389)) returns `None` on any failure and does NOT validate that elements are numeric or in `[0, 1]`. §13 accepted risk (worst case affects only the requesting client's own recolour output).
- Global request-body cap: not set in middleware. Relies on Starlette's per-field defaults. §13 accepts this until evidence of multipart abuse.
- Path construction: [scripts/precompute_samples.py:86-88](../scripts/precompute_samples.py#L86-L88) defines `slugify(label) = label.lower().replace(" ", "-")`. Mirrored frontend-side at [chromaknit-frontend/src/App.tsx:17-19](../chromaknit-frontend/src/App.tsx#L17-L19). Used to build URLs to `/samples/precomputed/yarns/{slug}.json` ([App.tsx:272-273](../chromaknit-frontend/src/App.tsx#L272-L273)) and `/samples/precomputed/garments/{slug}.json` ([App.tsx:393-395](../chromaknit-frontend/src/App.tsx#L393-L395)). Both call sites receive only hardcoded sample labels from `YARN_SAMPLES`/`GARMENT_SAMPLES` arrays ([chromaknit-frontend/src/components/YarnPicker.tsx:9-23](../chromaknit-frontend/src/components/YarnPicker.tsx#L9-L23), [chromaknit-frontend/src/components/GarmentStage.tsx:70-76](../chromaknit-frontend/src/components/GarmentStage.tsx#L70-L76)). User-uploaded yarn labels at [chromaknit-frontend/src/components/YarnPicker.tsx:50](../chromaknit-frontend/src/components/YarnPicker.tsx#L50) (`file.name.replace(/\.[^.]+$/, "")`) flow into `onYarnUpload`, which does NOT call `slugify`. §13 accepted risk holds.
- Header trust for security: rate-limit key uses `get_remote_address` from `slowapi.util` ([api/main.py:20](../api/main.py#L20), [api/main.py:45](../api/main.py#L45)), which reads `request.client.host`, not `X-Forwarded-For`. No code reads `X-Forwarded-For`, `Referer`, or `User-Agent` for security decisions. Compliant. See "Additional risks found / B1" for a related blast-radius concern downstream of this choice.

**Gaps:**
- `_parse_percentages` does not validate element types/ranges. Accepted §13.
- No magic-byte check. Accepted §13.
- No global request-body cap at middleware/proxy level. Accepted §13.

**Risk level:** low. All open gaps are §13 accepted risks. Active controls (size cap, dimension cap, type check, hex regex, Form ge/le bounds) are present and covered by tests.

**Recommended fix:** Hold today. The percentages-array validation gap is the closest to becoming real — if percentages are ever persisted, shared between users, or used to gate access (e.g. analytics or quota), tighten `_parse_percentages` to assert each element is a float in `[0, 1]` and the sum is `≈ 1.0` before reactivating any of those features.

---

## §4. Prompt injection defence

**Status:** not applicable (dormant in §4 of SECURITY.md).

**Evidence:** no LLM is called anywhere (see §2 evidence). No user input reaches any prompt because there is no prompt.

**Gaps:** none.

**Risk level:** low (none active).

**Recommended fix:** none today. If a chat helper, image captioning, or palette-naming feature is added, the entire §4 ruleset reactivates.

---

## §5. Rate limiting and abuse

**Status:** compliant (with one accepted risk per §13).

**Evidence:**
- Per-IP rate limit: [api/main.py:45](../api/main.py#L45) instantiates `Limiter(key_func=get_remote_address, default_limits=[])`. `DEFAULT_RATE_LIMIT = "60/minute"` at [api/main.py:37](../api/main.py#L37). Applied to all three POST handlers: [api/main.py:243](../api/main.py#L243) (`/api/colors/extract`), [api/main.py:413](../api/main.py#L413) (`/api/garments/session`), [api/main.py:479](../api/main.py#L479) (`/api/garments/recolor`). 429 exception handler wired at [api/main.py:153](../api/main.py#L153). Test at [tests/test_api.py:187-209](../tests/test_api.py#L187-L209).
- Per-operation timeouts: [run_in_thread_with_timeout](../api/main.py#L78-L111) with `DEFAULT_OPERATION_TIMEOUT_SECONDS = 30.0` ([api/main.py:36](../api/main.py#L36)). Wraps the CPU-bound calls at [api/main.py:296](../api/main.py#L296) (downscale_image), [api/main.py:298](../api/main.py#L298) (`extractor.extract_dominant_colors`, the K-means + decode path), [api/main.py:435](../api/main.py#L435) (downscale_image), [api/main.py:438](../api/main.py#L438) (`recolorer.prepare`, the rembg path), and [api/main.py:509-511](../api/main.py#L509-L511) (`recolorer.apply_colors`). Test at [tests/test_api.py:157-184](../tests/test_api.py#L157-L184).
- Caching: recolour cache keyed per session at [api/sessions.py:106-116](../api/sessions.py#L106-L116) and looked up at [api/main.py:502-506](../api/main.py#L502-L506).
- No retries on user-facing errors observed in handlers; the frontend's `fetch` calls do not retry either ([chromaknit-frontend/src/App.tsx](../chromaknit-frontend/src/App.tsx)).
- Provider-level caps, billing alerts, kill switch via env: dormant (no LLM provider, HF Spaces dashboard pause is the §13-accepted kill switch).

**Gaps:**
- `MAINTENANCE_MODE` env-var kill switch absent. §13 accepted risk.
- One operational sharpening: the in-thread timeout (note at [api/main.py:82-94](../api/main.py#L82-L94)) cannot preempt running Python code; the request handler returns 408 but the worker thread keeps running. Already documented inline; not a §13 row because it is the honest limit of Python sync interrupts, not a missing control. See "Additional risks found / B2" for the related thread-pool exhaustion mode.

**Risk level:** low.

**Recommended fix:** Hold. Watch for two reactivation signals: (a) a deployment tier where the platform pause button is no longer immediate or visible — at that point `MAINTENANCE_MODE` must be wired; (b) any evidence in logs that the thread-pool saturation mode is being triggered in practice — at that point lower `DEFAULT_OPERATION_TIMEOUT_SECONDS`, lower the rate limit, or both.

---

## §6. Authentication and authorisation

**Status:** partial-by-design (§13 accepted exception). Net effect: compliant for the active threat model.

**Evidence:**
- No login, sign-up, account, or session-cookie surface in the codebase. Grep for `cookie`, `Set-Cookie`, `bcrypt`, `argon2`, `password` returned no app-level matches.
- The only "session" is the opaque per-garment object at [api/sessions.py:28-44](../api/sessions.py#L28-L44), keyed by `uuid4()` ([api/sessions.py:70](../api/sessions.py#L70)). Returned in the JSON response body of [/api/garments/session](../api/main.py#L412-L475); not stored in a cookie. Per §13 the unguessable UUID4 (122 bits) plus the rate limit (§5) is the deliberate boundary.
- `POST /api/garments/recolor` ([api/main.py:478-528](../api/main.py#L478-L528)) verifies the session exists in the in-memory store before serving. There is no per-user identity to check, so "anyone with the session id can recolour" is correct under the §13 exception.
- No service-role keys, no admin SDK, no password handling, no token storage.

**Gaps:**
- "Anyone can use it" without an explicit auth check is the §13-accepted policy.

**Risk level:** low.

**Recommended fix:** Hold. The §13 reactivation triggers are well-scoped: any per-user state, any content that fans out to other users, or any cost surface that scales with usage. The day any of those land, replace the implicit "rate limit + opaque session id" boundary with an explicit auth check.

---

## §7. Data and privacy

**Status:** partial. Two open issues: the Formspree third-party egress lacks a user-visible disclosure (§13 accepted today, with a defined reactivation trigger); the Google Fonts egress is undisclosed and undocumented (not in §13, see "Additional risks found / B5").

**Evidence:**
- No PII collected on the API: handlers accept image uploads, a hex palette, and percentages. No name/email/contact fields.
- No persisted user images. Session TTL enforced at [api/sessions.py:25](../api/sessions.py#L25) (`SESSION_TTL_SECONDS = 30 * 60`) and exercised in `_evict_expired` ([api/sessions.py:92-100](../api/sessions.py#L92-L100)).
- Log fields surveyed (full list at [api/main.py:459-466](../api/main.py#L459-L466), [api/main.py:505](../api/main.py#L505), [api/main.py:524-527](../api/main.py#L524-L527), and core/* loggers): only `session_id` (UUID4), image `width`/`height`, byte counts, cache key, and internal stage labels are logged. No request bodies, no filenames, no user-supplied text.
- Formspree egress at [chromaknit-frontend/src/components/ReportIssue.tsx:11](../chromaknit-frontend/src/components/ReportIssue.tsx#L11) (`https://formspree.io/f/mqewplpo`) and POST in [ReportIssue.tsx:61](../chromaknit-frontend/src/components/ReportIssue.tsx#L61). Body includes the chosen category label and a user-typed free-text `details` field. SECURITY.md §7 explicitly requires "user-visible privacy note, not only in code comments." Today the only mention is in source comments and [SECURITY.md:189](../SECURITY.md#L189).
- Google Fonts egress at [chromaknit-frontend/index.html:7](../chromaknit-frontend/index.html#L7) (`https://fonts.googleapis.com/...`). Loads CSS and fonts; each pageview hands Google an IP + Referer.
- No third-party analytics scripts, telemetry, or RUM tooling observed.

**Gaps:**
- Formspree third-party egress without user-visible privacy disclosure. §13 accepted today; the §13 trigger says "Re-activates: next README or footer edit (close it then), or any additional third-party egress." The Google Fonts egress arguably **is** an "additional third-party egress" — pulling this trigger reactivates the disclosure obligation now.
- Google Fonts egress not enumerated in §7 of SECURITY.md or in §13 accepted risks. See "Additional risks found / B5".

**Risk level:** medium for both. Reputational/legal risk only (UK GDPR), no exploit path.

**Recommended fix:** Treat the Google Fonts presence as the trigger that reactivates the §13 "Formspree disclosure" row. Add a single user-visible privacy note (footer link, or short paragraph in `README.md` and on the frontend) that names both third parties (Formspree for issue reports, Google Fonts for typography), states what data they receive (free-text issue body and category; IP and Referer for font loads), and links to their respective policies. Update [SECURITY.md §7](../SECURITY.md#L93) to enumerate Google Fonts as the second documented egress so future audits do not re-flag it.

---

## §8. Dependencies

**Status:** compliant on the deploy-blocking items; two accepted risks per §13 (`^` ranges in `package.json`; no `npm audit` / `pip-audit` in CI).

**Evidence:**
- Backend lockfile present and used in both Dockerfile and CI:
  - [requirements.lock](../requirements.lock) is fully version-pinned, generated by `pip-compile --output-file=requirements.lock requirements.txt`.
  - Dockerfile installs from it at [Dockerfile:111-112](../Dockerfile#L111-L112): `COPY ... requirements.lock .` then `pip install --no-cache-dir --user -r requirements.lock`.
  - CI installs from it at [.github/workflows/tests.yml:25](../.github/workflows/tests.yml#L25): `pip install -r requirements.lock`.
  - No `--require-hashes` flag. §8 explicitly accepts this for the hobby tier because dev (3.13) and prod (3.11) wheel hashes do not match; reactivates if those become consistent.
- Frontend lockfile present and used:
  - [chromaknit-frontend/package-lock.json](../chromaknit-frontend/package-lock.json) committed.
  - CI runs `npm ci` at [.github/workflows/tests.yml:49](../.github/workflows/tests.yml#L49), which refuses to mutate the lockfile.
  - [chromaknit-frontend/package.json:13-34](../chromaknit-frontend/package.json#L13-L34) uses `^` ranges for runtime and dev deps. §13 accepts this because CI uses `npm ci`.
- No `npm audit` or `pip-audit` step in CI. §13 accepted risk (opportunistic, defer to next CI edit).
- Stray manifest: [requirements-api.txt](../requirements-api.txt) (`-r requirements.txt` plus three loose fastapi/uvicorn/python-multipart pins) is not consumed by Dockerfile or CI. Harmless but dust; not a §13 row. See "Additional risks found / B7".
- No obviously typo-squatted, unmaintained, or low-download packages in either lockfile on inspection. Standard ML/web stack (`fastapi`, `uvicorn`, `slowapi`, `opencv-python-headless`, `numpy`, `scikit-learn`, `rembg`, `onnxruntime`, `pillow`, `matplotlib`, `pymatting`, `react`, `vite`, `vitest`).
- Lockfile installation paths verified for both environments.

**Gaps:**
- No supply-chain vulnerability scan in CI. §13 accepted.
- `^` ranges in `package.json`. §13 accepted.
- Duplicate Python requirements manifest [requirements-api.txt](../requirements-api.txt). Documentation drift hazard; not a security issue today.

**Risk level:** low.

**Recommended fix:** Hold for the §13-accepted items. Tackle the duplicate manifest opportunistically next time `requirements.txt` is edited: either delete `requirements-api.txt` or replace it with a one-line comment noting that the deploy manifest is `requirements.lock`. The §13 row "no `npm audit` / `pip-audit`" reactivates on the next CI edit per its own trigger; add the two steps then.

---

## §9. CORS and same-origin

**Status:** compliant on the deploy-blocking item (Vercel-preview regex); one accepted risk per §13 (wildcard `allow_methods`/`allow_headers`).

**Evidence:**
- Vercel-preview regex implemented at [api/main.py:177-181](../api/main.py#L177-L181): `^https://chromaknit(-(?:[a-zA-Z0-9-]+-)?charlyx125)?\.vercel\.app$`. Anchored on the `charlyx125` account to prevent `chromaknit-*` impersonation under another Vercel account.
- Literal origin allowlist at [api/main.py:165-176](../api/main.py#L165-L176): localhost dev ports, `huggingface.co`, and the Space's own origin.
- Origin echo behaviour verified by tests at [tests/test_api.py:57-92](../tests/test_api.py#L57-L92): seven known origins accepted, five attack shapes (wrong TLD, wrong scheme, prefix injection, no `-charlyx125` anchor, different account) rejected.
- `allow_methods=["*"]` and `allow_headers=["*"]` at [api/main.py:188-189](../api/main.py#L188-L189). §13 accepted (deliberate looseness on a public API; narrowing is hygiene).
- `allow_credentials=True` at [api/main.py:187](../api/main.py#L187). With `allow_origin_regex`, Starlette/CORSMiddleware echoes the matched origin specifically, not `*`, so the credentialed-CORS spec requirement is satisfied. No cookie-based auth exists, so the credential flag is effectively unused.

**Gaps:**
- Wildcard methods/headers. §13 accepted.

**Risk level:** low.

**Recommended fix:** Hold. Reactivation per §13 row: narrow `allow_methods` to `["GET", "POST", "OPTIONS"]` and `allow_headers` to the small set the frontend actually sends (`Content-Type`, `Accept`) the day the API ever accepts custom headers or non-CRUD methods.

---

## §10. Error handling

**Status:** **partial**, one non-trivial gap (raw exception interpolation in a 400 detail) that is on the §12 required checklist but not on §13. Treated as a required fix.

**Evidence:**
- FastAPI debug mode off by default; uvicorn at [Dockerfile:178](../Dockerfile#L178) does not enable `--reload` or debug. Stack traces do not reach clients.
- Generic 404 handler at [api/main.py:534-555](../api/main.py#L534-L555) preserves intentional 404 details (e.g. "Session not found") and swaps the "Not Found" string for a friendly body.
- `/docs`, `/redoc`, `/openapi.json` left at FastAPI defaults (enabled). §13 accepted (portfolio piece).
- **Gap: raw exception interpolation in a 400 response.** [api/main.py:355-364](../api/main.py#L355-L364) inside `_parse_color_list` constructs the `detail=` as `'Invalid color format. ...' + f'Error: {exc}'`. This is the exact anti-pattern called out in [SECURITY.md §10](../SECURITY.md#L118) ("Do not interpolate raw exception text into client-facing `detail` fields. A pattern like `f"Error: {exc}"` leaks parser internals") and on the §12 required-pre-deploy list ("Error responses do not interpolate raw exception text"). The wrapped exception is `json.JSONDecodeError` or `ValueError`, whose `str()` is typically bounded ("Expecting value: line 1 column 1 (char 0)") but is still parser-internal output and is exactly the kind of thing the rule exists to forbid.
- 4xx/5xx handlers elsewhere use static strings or echo only validated/derived values (filename echo at [api/main.py:316](../api/main.py#L316) reflects `file.filename`, which is client-supplied — minor leak surface; see "Additional risks found / B6").
- No `pass`/`bare except` patterns swallow exceptions silently in handlers; failures bubble to FastAPI's exception machinery (which returns 500 with a generic message, not a trace).

**Gaps:**
- Raw exception interpolation at [api/main.py:355-364](../api/main.py#L355-L364). On §12 required list; not §13 accepted.

**Risk level:** medium. Low exploit value (the wrapped exceptions are stdlib parsers with bounded output), but it is the specific pattern SECURITY.md §10 names as forbidden, and it would block a clean §12 sign-off.

**Recommended fix:** Replace the `f'Error: {exc}'` line in `_parse_color_list` with a static message and move the real exception into a server-side `logger.warning("color-list parse failed", extra={"exc": str(exc)})` (or similar) so the operator still sees the parser detail without sending it to the client. Audit the other handlers' `detail=` strings while you are there: filename echo and stage labels are the next thing to harden if a future request demands tightening.

---

## §11. AI-specific failure modes

**Status:** compliant.

**Evidence:**
- No `TODO`, `FIXME`, or `XXX` markers in `.py/.ts/.tsx/.js/.jsx` sources (Grep returned zero matches).
- No deprecated crypto APIs (no `createCipher`, no `MD5`/`SHA1` used for security). N/A for hashing; the only "hash" surface is the cache key string, not cryptographic.
- No skipped error handling on `fetch` paths in the frontend: every `fetch` call in [chromaknit-frontend/src/App.tsx](../chromaknit-frontend/src/App.tsx) wraps in try/catch and handles `response.ok`, `AbortError`, and JSON-decode failures. The Formspree call at [ReportIssue.tsx:53-77](../chromaknit-frontend/src/components/ReportIssue.tsx#L53-L77) also has try/catch.
- All `os.getenv`/`import.meta.env` references resolve to real declared env vars (verified: `LOG_LEVEL`, `VITE_API_URL`). §13 accepts no `.env.example` while the count stays ≤5.
- CORS defaults not left at the framework's most permissive ("compliant by review" — see §9).
- Plausible-looking-but-wrong validation: not observed. Form-level constraints (`ge`/`le` on `n_colors`) are real range checks; hex regex is anchored and full-match.
- No hallucinated package names: every dependency in `requirements.lock` and `package.json` resolves to a real PyPI/npm package.

**Gaps:** none.

**Risk level:** low.

**Recommended fix:** none. Continue grepping `TODO|FIXME|XXX` and verifying env-var existence in pre-deploy reviews; today both pass.

---

## §12. Pre-deploy checklist

**Status:** partial. 10 of 11 required items pass; one fails (raw exception interpolation, §10 above).

**Evidence (item by item):**

| Required item | Status | Reference |
| --- | --- | --- |
| Backend Python lockfile committed and used by Dockerfile and CI | pass | [requirements.lock](../requirements.lock), [Dockerfile:111-112](../Dockerfile#L111-L112), [.github/workflows/tests.yml:25](../.github/workflows/tests.yml#L25) |
| Per-IP rate limit deployed and tested on POST endpoints | pass | [api/main.py:45,243,413,479](../api/main.py#L45); test [tests/test_api.py:187-209](../tests/test_api.py#L187-L209) |
| Per-operation timeouts on rembg, cv2 decode, K-means | pass | [api/main.py:78-111,296,298,435,438,509](../api/main.py#L78-L111); test [tests/test_api.py:157-184](../tests/test_api.py#L157-L184) |
| Image decompression-bomb guard on upload | pass | [api/main.py:114-141](../api/main.py#L114-L141); test [tests/test_api.py:212-229](../tests/test_api.py#L212-L229) |
| CORS uses `allow_origin_regex` for Vercel previews | pass | [api/main.py:177-186](../api/main.py#L177-L186); tests [tests/test_api.py:57-92](../tests/test_api.py#L57-L92) |
| Input validation on every API route | pass | Form `ge`/`le`, `_parse_color_list`, `_parse_percentages`, dimension and size caps. |
| Try/catch around every cache write and external call | pass on external calls; thin on cache writes. Cache writes are dict assignment in process memory ([api/main.py:523](../api/main.py#L523), [api/sessions.py:78,89](../api/sessions.py#L78)); failure would be `MemoryError`, which FastAPI will turn into a 500 with a generic body. Not a real exploit; see "Additional risks found / B3" for a related session-store growth concern. |
| Structured logging on; no stack traces returned to clients | pass | [core/log_config.py](../core/log_config.py) JSON formatter; FastAPI debug off. |
| No `TODO`, `FIXME`, `XXX` markers in deployed code | pass | Grep returned zero. |
| Lockfiles committed | pass | `requirements.lock`, `chromaknit-frontend/package-lock.json` both tracked. |
| **Error responses do not interpolate raw exception text** | **fail** | [api/main.py:355-364](../api/main.py#L355-L364) — see §10 above. |

Required-once items (deploy-blocking only when their trigger fires): all currently dormant — no secrets, no logged user-content field, no served-back uploads, no multipart-abuse evidence, no env-var count over five.

Dormant items (LLM, billing, MAINTENANCE_MODE): N/A.

**Gaps:** one required item fails (raw exception interpolation).

**Risk level:** medium. The failed item is "defence-in-depth" in absolute terms but is on the required list and would block a clean §12 sign-off per the section's own rules.

**Recommended fix:** Close §10's gap (one-paragraph fix described there) and the §12 checklist passes. No other §12 row needs work today.

---

## Rules that don't apply

Rules from SECURITY.md that are correctly dormant for this codebase. Each is preserved verbatim in SECURITY.md and reactivates the day its trigger fires.

- **§2 server-vs-client boundary for LLM/database/storage SDKs.** Reason: no LLM, no database, no KV, no storage SDK in the codebase ([requirements.lock](../requirements.lock), [chromaknit-frontend/package.json](../chromaknit-frontend/package.json), grep for provider names returned nothing). Reactivates the day any such SDK is imported.
- **§3 LLM-response validation with Zod, retry, fallback.** Reason: no LLM responses to validate. Reactivates with §2.
- **§4 prompt-injection ruleset (all six bullets).** Reason: no user input reaches any prompt because there is no prompt. Reactivates the moment any LLM call is introduced.
- **§5 provider-level hard caps and billing alerts.** Reason: no metered third-party API in use; HF Spaces free CPU basic and Vercel Hobby cap by 503, not by invoice. Reactivates if a metered billing surface (paid LLM, paid DB tier, paid CDN) is introduced.
- **§5 `MAINTENANCE_MODE` env-var kill switch.** Reason: HF Spaces dashboard "Pause Space" is the operational kill switch at hobby tier (§13 accepted). Reactivates on tier upgrade where the platform pause is no longer immediate.
- **§6 cookie session attributes (`httpOnly`, `Secure`, `SameSite=Lax`).** Reason: sessions are opaque server-side UUIDs returned in the JSON response body ([api/main.py:467-472](../api/main.py#L467-L472)), not cookies. Reactivates if cookie-based auth is added.
- **§6 password hashing (`bcrypt`, `argon2`).** Reason: no passwords stored or handled. Reactivates if accounts are introduced.
- **§7 LLM-provider data retention defaults.** Reason: no LLM provider. Reactivates with §2.
- **§10 OpenAPI `/docs` disabled in production.** Reason: §13-accepted exception; `/docs` is deliberately enabled because the API is part of the portfolio demo. Reactivates if the API serves anything that should not be enumerable.
- **§11 JS-only patterns (`crypto.createCipher`, `express.json()`, JWT algorithm whitelist).** Reason: backend is FastAPI (Python); frontend is React with no Express layer and no JWTs. Reactivates if a Node backend or JWT auth is added.

## Additional risks found

Risks present in this codebase that SECURITY.md does not currently cover. Each entry includes the gap, suggested risk level, and proposed addition to SECURITY.md or §13.

### B1. Rate-limit key is per-source-IP, but the source is behind a proxy

**Gap:** [api/main.py:45](../api/main.py#L45) uses `slowapi.util.get_remote_address`, which reads `request.client.host`. The deployment runs behind HuggingFace Spaces' edge proxy ([Dockerfile:178](../Dockerfile#L178), `--host 0.0.0.0` on a Space). Inside the container, every incoming connection arrives from the proxy IP, not from the real client IP. The "per-IP" rate limit is therefore effectively a **global** 60-per-minute throttle: one griefer can starve every legitimate user, and many legitimate users can together hit the cap. The SECURITY.md §5 rationale ("one runaway client cannot pin the single worker") still mostly holds — the throttle still bounds the worker — but the SECURITY.md §3 advice ("Headers (`X-Forwarded-For`, ...) can be spoofed. Do not use for security decisions") creates a real tension: trusting the proxy header is the correct fix for IP attribution, untrusted clients can spoof the header in environments where the proxy doesn't strip it.

**Suggested risk level:** medium. Realistic griefer can pin the rate limit and degrade the demo for everyone else. Not exploitable for cost (platform-protected). Not exploitable for data.

**Proposed SECURITY.md addition:** add a §5 sub-bullet noting that "per-IP" only works when the framework actually sees the client IP. For HF Spaces specifically, document whether the platform strips/normalises `X-Forwarded-For` at the edge, and either (a) tighten the global limit to a value that is acceptable as a global throttle, or (b) configure slowapi to read `X-Forwarded-For` with a documented trust boundary (`proxy_count=1`). Also add a §13 row capturing whichever decision is taken, so future audits know it was deliberate.

### B2. Timeout cannot preempt running Python code; thread-pool exhaustion mode

**Gap:** Already partially documented inline at [api/main.py:82-94](../api/main.py#L82-L94). The 30-second per-operation timeout returns 408 to the client and frees the event loop, but the worker thread keeps running to completion in the default `ThreadPoolExecutor`. The default executor has ~8 threads; under sustained load (or eight pathological uploads), the pool saturates and subsequent uploads queue indefinitely behind zombie threads. The rate limit (§5) and the dimension cap (§3) mitigate this, but they do not eliminate it. SECURITY.md §5 says "A pathological image must not be able to pin the only Uvicorn worker" — strictly speaking, eight of them can, transitively.

**Suggested risk level:** low to medium. Requires sustained adversarial input; the dimension cap and rate limit substantially shrink the window. Worst case is "demo unavailable" until the threads finish (~30 s × 8 = 4 min in the worst case).

**Proposed SECURITY.md addition:** add a §5 sub-bullet acknowledging the limit of Python sync interrupts, and either (a) accept it explicitly in §13 with this exact framing, or (b) cap the thread pool to a known size with `loop.set_default_executor(ThreadPoolExecutor(max_workers=N))` and pair with a queue-overflow 503. Lean toward (a); the platform-protected cost model means availability-only consequences.

### B3. Session store has no concurrent-session cap, only TTL

**Gap:** [SessionStore](../api/sessions.py#L47-L103) evicts by 30-minute idle TTL but has no upper bound on the number of concurrent sessions. Each session holds a downscaled BGR image plus a rembg foreground mask in RAM. The downscale step at [api/main.py:435](../api/main.py#L435) caps to 800 px before storage, which substantially limits this — actual per-session footprint is ~2 MB — but the unbounded count is still a defence-in-depth gap. A burst of uploads across a long enough window (or many users at once) could grow the store without bound, OOMing the 2 GB HF Spaces container before TTL eviction sweeps. The rate limit (§5) and the proxy issue (B1 above) interact here: per-IP attribution would matter for capping per-user session growth, but is currently global.

**Suggested risk level:** low. Realistic abuse is bounded by the existing rate limit and dimension cap; the gap is "no second line of defence if the first ones are bypassed."

**Proposed SECURITY.md addition:** add a §5 or §3 sub-bullet that any in-memory store of user-derived bytes must have an explicit max-entry count, not only a TTL. Could be captured in §13 as an accepted risk with the existing rate limit + downscale chain as the justification.

### B4. Session-store eviction is not concurrency-safe

**Gap:** [_evict_expired](../api/sessions.py#L92-L100) builds a list of expired ids, then deletes them from `self._sessions`. The CPython GIL protects each individual dict operation but does not protect the iterate-then-mutate pattern from interleaving with a concurrent `create()` or `get()` from another request. In single-worker single-thread deployment (the current mode per [api/sessions.py:55-58](../api/sessions.py#L55-L58)), this is harmless because every public method is called inside the same asyncio event loop and Python coroutines yield only at `await` points. But the moment the deploy mode changes to multi-worker or to a sync-heavy pattern where `get`/`create` are called from threads (e.g. inside `run_in_thread_with_timeout`), a `RuntimeError: dictionary changed size during iteration` becomes possible.

**Suggested risk level:** low. Today's deploy mode (single Uvicorn worker, sessions accessed only inside the event loop) eliminates the race.

**Proposed SECURITY.md addition:** none required for the active threat model; the existing §13 row "Single-worker in-memory session store" already names the multi-worker reactivation trigger, which would also necessitate a lock here. A future Redis swap (suggested in [api/sessions.py:55-57](../api/sessions.py#L55-L57)) bypasses this entirely.

### B5. Google Fonts is an undisclosed third-party data egress

**Gap:** [chromaknit-frontend/index.html:7](../chromaknit-frontend/index.html#L7) loads CSS and webfonts from `https://fonts.googleapis.com`, which means each pageview hands Google an IP and Referer. SECURITY.md §7 names "Every third-party data egress must be disclosed in a user-visible privacy note" and lists only Formspree as the documented egress. Under UK/EU privacy interpretation, the Google Fonts call is a personal-data transfer that a strict reading would require disclosure for. The same egress is also present in the tracked mockup file [landing-mockup.html:7](../landing-mockup.html#L7).

**Suggested risk level:** medium. Reputational/legal, not exploit-grade. The 2022 LG München ruling against undisclosed Google Fonts loading is the precedent commonly cited.

**Proposed SECURITY.md addition:** add Google Fonts to the §7 enumerated egresses, and either (a) self-host the two used families (Cormorant Garamond + DM Sans) to remove the egress, or (b) add Google Fonts to the user-visible privacy note alongside Formspree. Track in §13 if accepting; explicitly call out which families and which page surfaces.

### B6. Client-supplied filename echoed unsanitised in a response body

**Gap:** [api/main.py:316](../api/main.py#L316) returns `"filename": file.filename` in the success body of `/api/colors/extract`. The filename is fully client-controlled. JSON encoding protects against straight injection, but the value is echoed back to the frontend and could be rendered in some UI surfaces (or might be in future). A path-traversal-shaped filename (`"../../etc/passwd"`) is harmless because the value is never used as a path, but a sufficiently long or unicode-confusable filename could surprise a future UI. Not currently exploitable.

**Suggested risk level:** low. Defence-in-depth only.

**Proposed SECURITY.md addition:** add a §3 sub-bullet that any client-supplied string echoed in a response should be length-capped and (where appropriate) normalised before echo. Or add a §13 accepted-risk row acknowledging the echo with a clear reactivation trigger ("any UI surface that renders the returned `filename` as HTML").

### B7. Stray `requirements-api.txt` manifest, not consumed by Dockerfile or CI

**Gap:** [requirements-api.txt](../requirements-api.txt) (`-r requirements.txt` plus three loose fastapi/uvicorn/python-multipart pins) is committed but not referenced by [Dockerfile](../Dockerfile) or [.github/workflows/tests.yml](../.github/workflows/tests.yml). A future maintainer (or AI agent) reading "requirements-api.txt" as the deploy manifest could re-introduce floating ranges in production by editing it instead of `requirements.txt`/`requirements.lock`. Pure documentation/cleanup risk.

**Suggested risk level:** low.

**Proposed SECURITY.md addition:** add a §8 sub-bullet "Only one Python requirements manifest is the source of truth; remove or annotate any stray manifest files." Not §13-worthy unless deliberately kept.

### B8. No CSRF defence (currently safe by construction)

**Gap:** Mutating endpoints (`/api/colors/extract`, `/api/garments/session`, `/api/garments/recolor`) accept POST without any CSRF token, custom header check, or origin verification beyond CORS. Today this is safe because (a) there is no cookie-based session, so a cross-origin POST cannot be made "on behalf of" a logged-in user; (b) `allow_credentials=True` is set but no credentials are actually carried; (c) CORS limits where the response can be read, which is enough for a no-auth public API.

**Suggested risk level:** low (none today).

**Proposed SECURITY.md addition:** add a §6 sub-bullet "If cookie-based auth is introduced, CSRF defence (token or `SameSite=Strict` + custom-header check) becomes required at the same commit, not in a follow-up." Pairs naturally with the existing §6 cookie-attribute rule.

---

## Summary

| Section | Status | Risk | Action today |
| --- | --- | --- | --- |
| §1 Secrets | compliant (3 §13 accepts) | low | hold |
| §2 Server/client boundary | not applicable | low | hold |
| §3 Untrusted input | partial (3 §13 accepts) | low | hold |
| §4 Prompt injection | not applicable | low | hold |
| §5 Rate limiting & abuse | compliant (1 §13 accept) | low | hold |
| §6 Auth | partial-by-design (§13) | low | hold |
| §7 Data & privacy | partial | medium | disclose third-party egresses (Formspree + Google Fonts) |
| §8 Dependencies | compliant (2 §13 accepts) | low | hold |
| §9 CORS | compliant (1 §13 accept) | low | hold |
| §10 Error handling | **partial — required gap** | medium | remove `f'Error: {exc}'` interpolation at [api/main.py:355-364](../api/main.py#L355-L364) |
| §11 AI-specific failure modes | compliant | low | hold |
| §12 Pre-deploy checklist | partial (1 fail via §10) | medium | unblocks once §10 is fixed |

Deploy-blocking today: §10's raw-exception interpolation gap, which transitively fails §12.

Next non-blocking work to surface to the user: the §7 disclosure for Google Fonts + Formspree, and the B1 rate-limit-behind-proxy framing (which is the most likely real-world abuse mode against the current deployment).
