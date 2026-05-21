# SECURITY.md

Standing security rules for AI-assisted coding on this project. Claude Code: read this file at the start of every coding task. If a line in this file conflicts with a user request, surface the conflict before proceeding. Never silently weaken a rule below.

These rules exist because AI-generated code is plausible by default but not safe by default. The model will happily produce code that exposes secrets, skips validation, or trusts user input unless told not to, every time.

This document was audited and refined on 2026-05-19 (see tasks/security-audit.md). Several rules originally written as "production app with paying users" are marked **dormant** where they do not apply to ChromaKnit's stack and threat model; they reactivate the day the relevant capability is introduced.

## 0. Threat model

Every rule below should be read against this threat model. A rule is required where it protects against a realistic adversary in this model, and defence-in-depth where it does not.

- **Project shape.** Hobby and portfolio piece. Single maintainer. No paying users. No SLAs.
- **Money at stake.** £0, platform-protected. HF Spaces free CPU basic does not bill compute overage. Vercel Hobby caps at 100 GB/month bandwidth and serves 503s rather than invoicing. The £0 target in CLAUDE.md is enforced by the platforms, not by app-level controls.
- **Data at stake.** No PII collected. No persisted user images (sessions evict after 30 minutes in process memory). No accounts, no databases, no third-party data stores.
- **Users at stake.** Effectively zero today, expected single-digit (recruiters, friends, ADR readers).
- **Adversaries we defend against.** Random internet scanners. Low-effort griefers who find the URL on the maintainer's CV. Compromised npm or PyPI releases of pinned dependencies.
- **Adversaries we explicitly do not defend against.** Targeted attackers. Nation-state. Anyone willing to spend more than thirty minutes on this. Insider threat (single maintainer).
- **Reputational risk.** "The demo is broken right now during a recruiter visit." Real but bounded.

When a rule says "required for production," treat that as required here unless this section excludes it. When the original SECURITY.md draft assumed paying users, LLM API costs, or auth, look for a `(dormant — ...)` annotation below.

## 1. Secrets and credentials

- Never write a literal API key, token, password, or secret into source code, even in examples, comments, or test fixtures. If demonstrating shape, use `sk-ant-XXXX...` or `<REDACTED>`.
- Environment variable naming: server-only secrets use plain names (`ANTHROPIC_API_KEY`, `DATABASE_URL`). Anything client-exposed uses the framework's public prefix only when the value is genuinely public. Secrets must never have a public prefix.
- `.env.local` and `.env*` files containing secrets must be in `.gitignore` before the first commit. Verify with `git check-ignore .env.local`.
- Public-value env files (today: `chromaknit-frontend/.env.development`, `chromaknit-frontend/.env.production` carrying `VITE_API_URL`) may be tracked. If a value is genuinely public and lives behind a public prefix, the ignore rule for that path should be relaxed so the gitignore does not contradict the tracked file. Inconsistent state is a footgun.
- **Required from the moment any secret is introduced:** install a `gitleaks` or `git-secrets` pre-commit hook and a matching CI step. Refuse to commit if the hook is missing. Today, no secrets exist; this becomes mandatory at the point a first secret enters the project.
- Separate keys per environment: dev keys never reach production environment variables.
- Key rotation: rotate any key that has ever been pasted into a shared chat, sent over email, or shown in a screenshot. Rotate before first public deploy regardless.
- **Required from the moment any logger call grows a field that can carry user content or credentials:** add a redaction helper that masks `(?i)(authorization|api[_-]?key|token|password|secret)` keys in `extra={...}` payloads. Today, nothing sensitive is logged; this becomes mandatory the day that changes.

## 2. Server vs client boundary

- LLM API calls happen server-side only. Never call Anthropic, OpenAI, or any LLM provider from client code. *(dormant — no LLM is called from any layer of this project. Reactivates if a chat helper, image captioning, or palette-naming feature is introduced.)*
- Database, KV, and storage credentials are server-side only. *(dormant — no database, KV, or storage is used.)*
- Service role keys (Supabase, Firebase admin SDK, etc.) are server-only. Anon keys are the only ones safe for client use. *(dormant — no such SDKs in use.)*
- If a client component imports an SDK that takes a secret, that is a bug. Stop and refactor.

## 3. Untrusted input handling

Treat every input that did not originate in your own code as hostile.

- User form input must be validated with Zod (or equivalent) at the API boundary. Pydantic / FastAPI `Form(..., ge=, le=)` constraints satisfy this for the Python backend.
- URL parameters, query strings, route params: validate before use.
- File uploads must validate file size client-side AND server-side. Use a streaming cap as the authoritative server-side check; client-advertised size is hint-only.
- File uploads must validate MIME type. The `Content-Type` header is client-supplied and spoofable; treat it as a fast-reject only.
- **Magic-byte validation is required when the upload's raw bytes are served back to a user, embedded in HTML, or otherwise reach a rendering surface. It is defence-in-depth (low priority) when the pipeline always re-encodes the upload into a fresh output (the current ChromaKnit case: `/api/garments/recolor` always returns a freshly encoded PNG of the recoloured image, never the user's original bytes).** Polyglot files (PNG-with-HTML, SVG-with-script) only matter if they can reach a renderer.
- **Image decompression bombs.** For any image upload, validate decoded dimensions before decoding the full image. Use a header-only inspection (`PIL.Image.open(buf).size` without `.load()`) and reject anything exceeding a configured pixel budget (default 25 megapixels). `cv2.imread` has no equivalent guard; a 5 MB compressed image can decode to >800 MB and OOM a 2 GB container.
- **Path construction from any non-trusted value.** Any value used to build a URL path or filesystem path must be whitelist-validated (`^[a-z0-9-]+$`), not "cleaned" by replacement. Replacement-based slugifiers are unsafe for path construction; they pass through `../`, control characters, and unicode normalisation tricks.
- **Global request-body cap.** Per-field caps in handlers are not a substitute for a server-wide request size limit. Trust Starlette's default per-field caps until evidence of abuse, then move to an explicit reverse-proxy or middleware enforcement.
- LLM responses must be validated with Zod. Retry once on failure, fall back on second failure. *(dormant — no LLM responses are received.)*
- External API responses: validate. Third parties change schemas.
- Headers (`User-Agent`, `Referer`, `X-Forwarded-For`) can be spoofed. Do not use for security decisions.

Default mental model: anything I did not construct myself is malformed until proven otherwise.

## 4. Prompt injection defence

*(dormant — no user input reaches any LLM prompt because there is no LLM. The rules below are preserved verbatim so they reactivate the moment any LLM call is introduced.)*

Any user input that reaches an LLM prompt is an attack surface.

- Whitelist over blacklist. For fields like `location` or `name`, define what is allowed (for example `^[A-Za-z ,]{1,60}$`) and reject everything else.
- Length limits on every text field that reaches a prompt.
- Never interpolate raw user input into the system prompt. User input goes in the user message.
- For free-text fields, wrap input in delimiters (`<<<USER_INPUT>>>...<<<END>>>`) and instruct the model to treat content as data, not instructions. Still validate the output.
- Test adversarial inputs before deploy: instruction overrides, system prompt extraction, context confusion, data exfiltration, output corruption.
- Log suspicious inputs but do not act on them automatically.

## 5. Rate limiting and abuse

- **Per-IP rate limit on any endpoint that triggers CPU-bound work on a shared worker, whether or not paid.** Default: 60 requests per minute per IP, sized so that one runaway client cannot pin the single worker on HF Spaces free CPU basic. (A stricter quota is not required because billing is platform-protected; the goal of this limit is shared-worker availability, not cost control.)
- **Per-operation timeouts apply to CPU-bound work, not only network calls.** `asyncio.wait_for` (or thread-level deadline) around rembg inference, OpenCV decode, K-means clustering. Default budget: 30 seconds per operation. A pathological image must not be able to pin the only Uvicorn worker.
- Provider-level hard caps (Anthropic Console, OpenAI usage limits). Set before first deploy. *(dormant — no LLM provider in use.)*
- Billing alerts at 25%, 50%, 75% of daily cap. *(dormant — no metered billing surface in use; platform free tier caps with 503 instead.)*
- A kill switch. **For hobby-tier deployments, the platform's pause-Space button is the accepted kill switch.** A `MAINTENANCE_MODE` env var becomes required if and when the project moves to a tier where the platform pause is not immediate or visible to operators.
- Cache aggressively. The per-session recolour cache at [api/sessions.py](api/sessions.py) and `make_recolor_cache_key` satisfy this for the recolour path.
- No retries on user-facing errors. One retry, then fall back.

## 6. Authentication and authorisation

- API routes that mutate require an explicit authorisation check, even when "anyone can use it" is the policy. **Exception for ChromaKnit:** the "anyone can use it" policy is deliberate. The boundary against abuse is rate limit (§5) plus session-ID unguessability (UUID4, 122 bits). This exception is reviewed if the project ever stores per-user state or accepts content that fans out to other users.
- Never trust client-sent user IDs. Verify server-side that the session matches.
- Session tokens: `httpOnly`, `Secure`, `SameSite=Lax` cookies. Never in `localStorage`. *(dormant — sessions are opaque server-side UUIDs returned in the JSON response body, not cookies. Reactivates if cookie-based auth is added.)*
- Password handling: use vetted libraries (`bcrypt`, `argon2`). Never hand-roll. Never store plaintext. *(dormant — no passwords stored or handled.)*

## 7. Data and privacy

- Do not log full request bodies containing user-generated content. Log structured metadata instead.
- PII: minimise collection, never log in plaintext, never send to third-parties without documented reason.
- **Every third-party data egress must be disclosed in a user-visible privacy note, not only in code comments.** Today the only third-party egress is the Formspree feedback channel in [chromaknit-frontend/src/components/ReportIssue.tsx](chromaknit-frontend/src/components/ReportIssue.tsx). Add a one-line disclosure to the frontend footer or README the next time either is edited.
- Know your LLM provider's data retention defaults. Opt out for sensitive applications. *(dormant — no LLM provider in use.)*
- Cache TTLs: data with personal context should expire. Session cache evicts after 30 minutes of idle time at [api/sessions.py:25](api/sessions.py#L25); satisfied.

## 8. Dependencies

- **Use a lockfile-respecting install in CI and production. Floating ranges in manifests are acceptable only if the lockfile is the source of truth and CI uses `npm ci` / `pip install --require-hashes`.** The frontend already satisfies this via `npm ci` and a committed `package-lock.json`.
- **Backend (Python) must have a version-pinned lockfile, installed from in both the Dockerfile and CI.** Generate with `pip-compile --output-file=requirements.lock requirements.txt` (from `pip-tools`). Hashes (`--generate-hashes`) are preferred and required for any project with paying users or PII; for ChromaKnit's hobby tier the version pins alone are accepted because dev (Python 3.13) and prod (Python 3.11 in Docker) wheel hashes do not match and dev-time hash generation against the deploy interpreter would require running pip-compile inside the Docker container. Re-activates to "hashes required" if the project ever stores user data, accepts auth, or moves to a deployment with consistent dev/prod Python versions.
- `npm audit` and `pip-audit` run in CI. Fail builds on high or critical vulnerabilities. (Opportunistic for ChromaKnit: add the step the next time CI is touched; not a deploy blocker on its own given the user count.)
- Lockfiles committed (`package-lock.json`, `requirements.lock`). Never gitignored.
- Be suspicious of obscure packages with few downloads, recently published, or typo-squat names.
- Do not install packages you do not need.

## 9. CORS and same-origin

- API routes default to same-origin only.
- If cross-origin is needed, whitelist specific origins. Never reflect the `Origin` header blindly.
- **For environments with rotating preview URLs (Vercel preview deploys, Netlify deploy previews, etc.), use `allow_origin_regex` rather than a hand-edited list of specific origins.** A hand-edited list breaks new preview branches by default and tempts looser configurations under deadline pressure. Today's [api/main.py](api/main.py) origin list should move to a regex matching `^https://chromaknit(-git-[a-z0-9-]+)?-charlyx125\.vercel\.app$` plus a small literal allowlist for production and localhost.
- Narrow `allow_methods` and `allow_headers` to what the API actually accepts. Wildcards work but are wider than required.
- Cookies + CORS: `credentials: 'include'` requires explicit `Access-Control-Allow-Credentials: true` and a specific origin.

## 10. Error handling

- Never expose internal errors to users. Catch, log internally, return a generic message externally.
- Stack traces never reach the browser in production. FastAPI's default behaviour (debug mode off) satisfies this.
- Do not interpolate raw exception text into client-facing `detail` fields. A pattern like `f"Error: {exc}"` leaks parser internals; log the real `exc` server-side and return a short generic message to the client.
- Error messages should not confirm or deny resource existence for auth-protected resources.
- Return 404 instead of 403 for unauthorised access to existing resources.
- **OpenAPI / Swagger docs in production.** Disable `/docs`, `/redoc`, and `/openapi.json` (`docs_url=None, redoc_url=None, openapi_url=None`) for any API that is not deliberately public. **Exception for ChromaKnit:** `/docs` is deliberately enabled in production because this is a portfolio piece and the API surface is part of the demo. Revisit this exception if the API ever serves anything that should not be enumerable.

## 11. AI-specific failure modes

Things AI-generated code does more often than human code. Apply at every code review.

- Plausible-looking but wrong validation (`email.includes('@')` is not email validation).
- Outdated patterns (deprecated APIs, for example `crypto.createCipher`). *(JS-specific; treat as dormant when working in Python.)*
- Hallucinated package names or function signatures.
- Confidently insecure defaults: `cors()` with no options, `express.json()` with no size limit, JWT without algorithm whitelist. *(JS-specific. The FastAPI equivalent is whatever the framework's permissive default would be; review every CORS / body / auth middleware as if its defaults are wrong.)*
- Skipped error handling (`await fetch(...).then(r => r.json())` with no try/catch).
- `TODO: add auth here` left as a real TODO. Grep for `TODO`, `FIXME`, `XXX` before deploy.
- Made-up environment variables. Verify every `process.env.*`, `import.meta.env.*`, and `os.getenv(...)` reference exists in `.env.example`. (When `.env.example` does not yet exist, add one if and when the env-var count goes above five.)

## 12. Pre-deploy checklist

Before any deploy, all required items must be true. Items marked *(dormant)* do not block today; they reactivate when the corresponding capability is introduced.

Required:
- [ ] Backend Python lockfile committed and used by Dockerfile and CI (§8)
- [ ] Per-IP rate limit deployed and tested on POST endpoints (§5)
- [ ] Per-operation timeouts on rembg, cv2 decode, K-means (§5)
- [ ] Image decompression-bomb guard on upload (§3)
- [ ] CORS uses `allow_origin_regex` for Vercel previews (§9)
- [ ] Input validation on every API route (§3)
- [ ] Try/catch around every cache write and external call
- [ ] Structured logging on; no stack traces returned to clients (§10)
- [ ] No `TODO`, `FIXME`, `XXX` markers in deployed code (§11)
- [ ] Lockfiles committed (`package-lock.json`, `requirements.lock`)
- [ ] Error responses do not interpolate raw exception text (§10)

Required-once: become deploy-blocking the day the corresponding capability is introduced:
- [ ] `gitleaks` (or `git-secrets`) pre-commit hook and CI step (§1, required from the first secret)
- [ ] Log-redaction helper in JSON formatter (§1, required from the first logged user-content field)
- [ ] Magic-byte validation on uploads (§3, required if any served-back / rendered surface is added)
- [ ] Server-wide max request size at reverse-proxy or middleware level (§3, required on evidence of multipart abuse)
- [ ] `npm audit` and `pip-audit` in CI (§8, recommended on next CI edit)
- [ ] `.env.example` listing every env-var reference (§11, required when env-var count exceeds five)

Dormant:
- [ ] LLM provider spending cap (§5, *dormant*)
- [ ] LLM provider billing alerts (§5, *dormant*)
- [ ] LLM calls only from server routes (§2, *dormant*)
- [ ] Prompt injection regex tested against adversarial inputs (§4, *dormant*)
- [ ] LLM response validation + retry + fallback (§3, *dormant*)
- [ ] `MAINTENANCE_MODE` env-var kill switch (§5, *dormant for hobby tier; platform pause-button is accepted*)

If any required item fails, deploy is blocked.

## 13. Accepted risks

These are explicit, documented exceptions to rules above. Recorded so a future audit pass does not re-flag them as bugs. Each entry has a reason and a re-activation trigger.

- **No `gitleaks` / `git-secrets` hook today.** Reason: no secrets exist in the project. Re-activates: the day the first secret is added.
- **No `.env.example`.** Reason: two env vars (`LOG_LEVEL`, `VITE_API_URL`), both documented inline in code. Re-activates: env-var count exceeds five, or any env-var becomes a secret.
- **No log-redaction helper.** Reason: no field that could carry user content or credentials is logged today. Re-activates: a logger call grows a free-text user field or a credential field.
- **No magic-byte validation on uploads.** Reason: pipeline always re-encodes upload to a freshly produced PNG; user bytes never reach a renderer. Re-activates: any feature that serves raw user bytes back or embeds them in HTML.
- **Percentages array elements not strictly validated** at `_parse_percentages`. Reason: worst case affects only the requesting client's own recolour output; no fan-out. Re-activates: percentages are ever persisted, shared between users, or used to gate access.
- **No explicit `colors` form-field length cap.** Reason: Starlette's default form-field limits suffice. Re-activates: evidence of multipart abuse.
- **No `MAINTENANCE_MODE` kill switch.** Reason: HF Spaces dashboard "Pause Space" button is the operational kill switch at hobby tier. Re-activates: deployment moves to a tier where platform pause is not immediate, or a service-level commitment exists.
- **No `npm audit` / `pip-audit` step in CI today.** Reason: zero-user supply-chain risk is primarily to the maintainer's laptop, which has different defences. Re-activates: next CI edit, or any user-facing deployment with auth.
- **Frontend `^` ranges in `package.json`.** Reason: CI uses `npm ci` which respects the committed lockfile; floating ranges in the manifest are cosmetic. Re-activates: CI ever switches to `npm install`.
- **CORS wildcard `allow_methods` and `allow_headers`.** Reason: defence-in-depth gap on a deliberately public API; narrowing is hygiene, not security. Re-activates: API ever accepts custom headers or non-CRUD methods.
- **"Anyone can use it" with no auth check on mutating endpoints.** Reason: deliberate product policy; UUID4 session IDs plus rate limit are the boundary. Re-activates: any per-user state, any content that fans out to other users, any cost surface that scales with usage.
- **`/docs` enabled in production.** Reason: portfolio piece; the API surface is part of the demo. Re-activates: API ever serves anything that should not be enumerable.
- **No security headers (`Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`) set at the app layer.** Reason: API returns JSON and PNG only; frontend is static; protective value is near zero at this scale. Re-activates: any introduction of HTML rendered from non-trusted content, or any move to a non-CDN-fronted deployment.
- **Single-worker in-memory session store.** Reason: documented at [api/sessions.py:56-58](api/sessions.py#L56-L58); single-worker is the deploy mode. Re-activates: ever scale to multiple workers or replicas.
- **`slugify` as path builder.** Reason: today all callers receive hardcoded sample labels; no user input reaches a `slugify`-into-URL path. Re-activates: any feature that passes user-supplied labels into a URL or filesystem path.
- **Formspree third-party egress without a user-visible privacy disclosure.** Reason: one low-traffic feedback channel; reason for the egress is documented in code comments. Re-activates: next README or footer edit (close it then), or any additional third-party egress.

A finding that is on this list is not a deploy blocker. A finding that is not on this list and not in §12 has not been triaged; treat it as required.

## How Claude Code should use this file

1. Read this file at the start of every task touching API, auth, secrets, user input, deploy config, or dependencies.
2. Before writing code that handles untrusted input, an LLM call, a secret, or a network boundary, state which sections apply and what defences will be implemented.
3. If a user request would violate any rule, surface it before proceeding. A `(dormant)` annotation is not permission to weaken; it is a statement that the rule does not currently bind because the capability is absent.
4. If a request would violate a rule that is on the §13 accepted-risks list, treat it as permitted but still surface that the project is taking the accepted-risk path. Do not silently expand the accepted-risk list.
5. On every commit involving security-relevant code, the commit message references which section(s) apply.

This file is not a suggestion. It is the standard the project is built to.
