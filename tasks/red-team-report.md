# Red-team report — ChromaKnit (multi-yarn branch)

Date: 2026-05-19
Stance: attacker with full source visibility. Goal: degrade the demo for legitimate users, exhaust the maintainer's third-party quotas, surface every soft-DoS and information-disclosure path I can.

Threat-model reminder for honesty: no money on the line (HF Spaces free CPU basic, Vercel Hobby — both 503 not invoice), no user data, no auth surface. So I cannot steal credentials, drain a wallet, or pivot to other systems. What I can do is **make the site unavailable, embarrass the maintainer, and burn out the third-party tools they depend on**. That is the entire engagement.

Static analysis only. No live testing.

---

## V1. Global rate limit (rate limiter sees the proxy IP, not the client)

**Category:** OWASP A04 Insecure Design / A05 Security Misconfiguration. Rate-limiter keyed on a value the deployment topology renders constant.

**Location:** [api/main.py:45](../api/main.py#L45)
```
limiter = Limiter(key_func=get_remote_address, default_limits=[])
```
`slowapi.util.get_remote_address` reads `request.client.host`. Inside the HF Spaces container, every connection arrives from the platform's edge proxy. Every "per-IP" key is the same IP. The decorator `@limiter.limit("60/minute")` on the three POST handlers ([api/main.py:243,413,479](../api/main.py#L243)) becomes a **global** 60-per-minute throttle for all users combined.

**Attack scenario:**
```
# From any single machine, sustain 60 requests/minute against the cheapest endpoint:
while true; do
  for i in $(seq 1 70); do
    curl -s -o /dev/null -w "%{http_code}\n" \
      -X POST "https://charlyx125-chromaknit-backend.hf.space/api/colors/extract" \
      -F "file=@1px.png;type=image/png" \
      -F "n_colors=1" &
  done
  wait
  sleep 60
done
```
After the 60th request inside any 60-second window, every subsequent request from **any** user (the attacker, the recruiter currently looking at the demo, the maintainer's own browser) gets `429 Too Many Requests`. The Limiter is keyed on the proxy IP, so all traffic shares one bucket.

**Impact:** Reliable denial-of-service. The exact category the project's threat model names ("demo is broken right now during a recruiter visit"). Zero attacker cost, zero attacker skill. No log signal that distinguishes attacker from legitimate users, because every request looks like it came from the same IP.

**Likelihood:** Trivial. Anyone who reads `slowapi.util.get_remote_address` in source — or just notices the demo URL — can do this.

**Fix:**
- Configure slowapi to read the client IP from a forwarded header. HF Spaces sets `X-Forwarded-For` at the edge. Replace `key_func=get_remote_address` with a custom keyer that reads `request.headers.get("x-forwarded-for", request.client.host).split(",")[0].strip()` and trust the leftmost value with `proxy_count=1`. Document the trust boundary in a comment so a future deploy move that puts the app on a different edge doesn't silently re-introduce the spoofable header.
- Belt-and-braces: also drop the per-route limit from `60/minute` to something tighter so the global cap stops being a useful weapon even if IP attribution fails.

**Detection:** Currently invisible. The 429s show up in HF Spaces' default logs but the source IP field is the proxy's, so no rate-limit graph slices by attacker. Add `extra={"client_ip": ..., "x_forwarded_for": ...}` to the 429 handler so an oncaller can grep for the actual XFF value in [core/log_config.py](../core/log_config.py) JSON output and see the burst source.

---

## V2. Per-session recolour cache has no entry cap, no byte cap

**Category:** OWASP A04 Insecure Design (resource exhaustion). Server-side cache growth driven entirely by attacker-chosen input.

**Location:** [api/sessions.py:44](../api/sessions.py#L44) (`recolor_cache: dict[str, bytes]`) and [api/main.py:523](../api/main.py#L523) (`session.recolor_cache[cache_key] = png_bytes`). Cache key is `f"{colors_part}|{weights_part}"` ([api/sessions.py:114-116](../api/sessions.py#L114-L116)). Cache key space is effectively unbounded — every distinct palette/percentage tuple stores a fresh PNG.

**Attack scenario:**
1. Upload a single garment to `/api/garments/session`. Receive a `session_id` (good for 30 minutes of idle TTL).
2. Loop, sending `/api/garments/recolor` with the same `session_id` but a different colour permutation each time. Even tiny tweaks bypass the cache. Pseudo:
```
SID=$(curl -s -X POST .../api/garments/session -F file=@small.png | jq -r .session_id)
for r in $(seq 0 255); do
  for g in $(seq 0 16 255); do
    HEX=$(printf "#%02x%02x00" $r $g)
    curl -s -o /dev/null -X POST .../api/garments/recolor \
      -F "session_id=$SID" \
      -F "colors=[\"$HEX\",\"#000000\"]"
  done
done
```
Each response stores `png_bytes` in `session.recolor_cache`. A downscaled 800×800 PNG averages ~300–700 KB. At 60 requests/minute (the global limit, V1), that's roughly 30 MB of cache per minute, per active attacker session, against a 2 GB HF Spaces container. Over the full 30-minute session TTL: roughly **0.9 GB of resident memory pinned in a single dict** before TTL eviction sweeps. Combined with the in-memory garment image and mask ([api/sessions.py:38-39](../api/sessions.py#L38-L39)) and the default Python heap that doesn't return memory to the OS even when keys are deleted, the worker OOMs.

**Impact:** Worker OOM → container restart → cold start (~30–60 s, plus the model-download mismatch in V6 means several minutes before the first recolour completes again). Loss of all live sessions for every legitimate user. Repeatable indefinitely; one machine, one session, one script.

**Likelihood:** Moderate. Requires noticing the cache key is `(colors|weights)` per session ([api/sessions.py:106-116](../api/sessions.py#L106-L116)) and that there is no eviction inside a session. Anyone reading the audit's "B3" item or `make_recolor_cache_key` will spot it.

**Fix:**
- Cap `recolor_cache` to N most-recent entries (LRU) — `collections.OrderedDict` plus pop-oldest when len exceeds, say, 32. The intended use case is "user flips between 2–10 yarns"; 32 is generous.
- Also cap aggregate `SessionStore` memory: track total cached bytes across sessions, evict whole sessions when the byte budget is exceeded.

**Detection:** Currently nothing watches `len(session.recolor_cache)` or aggregate session-store size. The `recolor computed and cached` log line ([api/main.py:524-527](../api/main.py#L524-L527)) records cache writes but not cache size; without a Prometheus-style gauge there is no way to notice the dict is at 500 MB until the OOM. Add a `len(cache)` field to that log line and a periodic `session_store size` heartbeat so the growth is visible in logs.

---

## V3. Formspree quota exhaustion via public form ID

**Category:** OWASP A04 Insecure Design (no abuse model for the integration). Plus A05 (the secret is not a secret — it's in the JS bundle).

**Location:** [chromaknit-frontend/src/components/ReportIssue.tsx:11](../chromaknit-frontend/src/components/ReportIssue.tsx#L11)
```
const FORMSPREE_URL = "https://formspree.io/f/mqewplpo";
```
This URL ships to every browser that loads the site. It is not authenticated. Formspree free tier caps at ~50 submissions per month before silently dropping further submissions.

**Attack scenario:**
```
for i in $(seq 1 100); do
  curl -s -X POST "https://formspree.io/f/mqewplpo" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -H "Origin: https://chromaknit.vercel.app" \
    -d "{\"category\":\"recoloring\",\"details\":\"automated spam $i\"}" &
done
wait
```
Formspree has its own spam filters and rate limits, but they are tuned for "a couple of submissions per hour from many origins", not for "drain a single form's monthly quota". A few hundred targeted submissions burn the monthly allowance.

**Impact:**
1. Maintainer's real issue-report channel goes dark for ~30 days (until quota resets). Recruiters or friends hitting "Report an issue" get the success modal but the report is dropped silently — worst-of-both UX failure.
2. Maintainer's Formspree inbox fills with garbage, masking any genuine signal that landed before the quota tripped.

**Likelihood:** Trivial. View source, find the form ID, curl loop. Or use any of the public Formspree-spam tools.

**Fix:**
- Move the issue-report POST behind the ChromaKnit backend: a new `/api/feedback` endpoint that the frontend calls (subject to V1's rate limit) and that forwards to Formspree server-side. This converts the integration into a *server-to-server* call where the Formspree form ID can be set as a server env var and is never exposed to clients.
- Or: add a captcha (Cloudflare Turnstile free, hCaptcha free) to the ReportIssue modal. Drops the cost of "burn 100 quota slots" from zero seconds to several minutes of human-solving time.
- Cheapest interim mitigation: a server-side proxy with a 2-per-minute per-IP cap. Costs nothing but a small endpoint.

**Detection:** Currently none. The maintainer would notice only by checking Formspree's dashboard. There is no signal in app logs because the POST is direct browser→Formspree.

---

## V4. `_parse_percentages` accepts NaN, Infinity, negative weights, and 10⁶-element arrays

**Category:** OWASP A03 Injection (input validation gap with a crash path).

**Location:** [api/main.py:379-389](../api/main.py#L379-L389)
```
def _parse_percentages(percentages: str) -> list[float] | None:
    if not percentages.strip():
        return None
    try:
        parsed = json.loads(percentages.strip())
        if isinstance(parsed, list):
            return parsed
    except (json.JSONDecodeError, ValueError):
        pass
    return None
```
Returns the list verbatim if `isinstance(parsed, list)`. No element-type, range, or length check.

**Attack scenarios:**

(a) `Infinity` / `NaN` poisoning. Note Python's `json.loads` accepts `NaN`, `Infinity`, `-Infinity` by default (a CPython extension to strict JSON):
```
curl -X POST .../api/garments/recolor \
  -F "session_id=$SID" \
  -F "colors=[\"#FF0000\",\"#00FF00\",\"#0000FF\"]" \
  -F "percentages=[NaN, Infinity, -Infinity]"
```
This reaches [core/garment_recolor.py:84-95](../core/garment_recolor.py#L84-L95) `_get_color_mapping`:
```
cumulative = 0.0
for color_idx, weight in enumerate(weights):
    cumulative += weight                                # NaN propagates
    pixel_end = int(round(cumulative * total_pixels))    # int(round(NaN)) raises ValueError
```
`int(round(float('nan')))` raises `ValueError: cannot convert float NaN to integer`. Uncaught inside `recolorer.apply_colors`. Propagates back through `run_in_thread_with_timeout`, which lets it bubble. FastAPI returns 500 with a generic body. Repeated requests = sustained 500s = log noise + masks real failures.

(b) Negative weights:
```
percentages=[-1e30, -1e30, 1.0]
```
`cumulative` goes very negative, `pixel_end = int(round(-1e30 * total_pixels))` → `OverflowError: cannot convert float infinity to integer`. Uncaught. 500.

(c) Length explosion:
```
percentages=[0.1, 0.1, 0.1, ...]  (10,000 elements, fits in 1 MB form-field limit)
```
`json.loads` allocates 10,000 floats. Modest. But the early branch in `_get_color_mapping` checks `len(weights) != num_colors` and falls back to the unweighted path, so this doesn't poison output. The only damage is the parse cost and a 10K-element list living through the request. Soft DoS only.

(d) Recursion-bomb via deeply nested JSON, also hits `_parse_color_list` at [api/main.py:349-364](../api/main.py#L349-L364):
```
colors=$(python -c 'print("[" * 2000 + "0" + "]" * 2000)')
curl -X POST .../api/garments/recolor -F session_id=$SID -F "colors=$colors" -F "percentages="
```
`json.loads` raises `RecursionError` once Python's default 1000-deep recursion limit blows. `_parse_color_list`'s except clause only catches `(JSONDecodeError, ValueError)`. `RecursionError` is neither. Uncaught. 500.

**Impact:** Cheap crash-paths that produce 500s. Combined with V1's global rate limit you can mix bogus and legitimate requests to (1) drown the maintainer's logs in 500s; (2) make legitimate users see 500s when they happen to share the proxy IP's bucket; (3) provide cover for actual exploration by tagging every probe with a fresh 500.

**Likelihood:** Moderate. Requires reading the source to know that `NaN`/`Infinity` survive Python's json parser; experienced attackers know this reflex.

**Fix:**
- In `_parse_percentages`, validate every element with `not math.isfinite(x) or not (0.0 <= x <= 1.0)` → reject. Cap list length (≤ 16 elements is enough for any palette the UI offers).
- In `_parse_color_list`, broaden the except clause to `(json.JSONDecodeError, ValueError, RecursionError)` and (still) return a static 400 detail without `f'Error: {exc}'` — see V8.
- For belt-and-braces, set `json.loads(..., parse_constant=lambda c: (_ for _ in ()).throw(ValueError(f"invalid JSON constant {c}")))` so `NaN`/`Infinity` literals don't parse at all.

**Detection:** 500s emitted by FastAPI's default exception path go to stdout via the uvicorn access log, but the structured JSON logger ([core/log_config.py](../core/log_config.py)) only sees what handlers explicitly log. There is no `logger.exception(...)` in the recolor handler around `apply_colors`. The traceback prints to uvicorn's stderr, which HF captures, but without a routine to alert on 500-rate spikes, nobody notices. Add an `app.exception_handler(Exception)` that logs the traceback structured and returns a static message.

---

## V5. JSON parse RecursionError reaches the unhandled-exception path

**Category:** OWASP A05 Security Misconfiguration. Subtype of V4 but with a different code path (so worth its own row).

**Location:** [api/main.py:349-364](../api/main.py#L349-L364) — `_parse_color_list` wraps `json.loads` in `try/except (JSONDecodeError, ValueError)`. `RecursionError` is a subclass of `Exception`, not `ValueError`.

**Attack scenario:** Same as V4(d). A nested-array `colors` field with > ~990 brackets triggers `RecursionError` inside `json.loads`. Not caught. 500.

**Impact:** Same as V4: noise, 500s, cover.

**Likelihood:** Moderate. Standard Python json-DoS technique.

**Fix:** Expand the except tuple. Or pre-check the input length and reject anything > a few KB before parsing.

**Detection:** Same as V4.

---

## V6. Pre-baked rembg model is the wrong model

**Category:** Bug, not a security finding, but it converts every first-request-after-cold-start into a soft DoS. Worth recording in the red-team report because **a single GET /health-driven sleep cycle from an attacker amplifies the cold-start cost on every legitimate user's first upload**.

**Location:**
- [Dockerfile:135](../Dockerfile#L135): `RUN python -c "from rembg import new_session; new_session('u2net')"`. Downloads `u2net.onnx` (~170 MB) at build time.
- [core/garment_recolor.py:59](../core/garment_recolor.py#L59): `session = new_session("u2netp")`. Asks for **u2netp** (a different, smaller model file `u2netp.onnx`) at request time.

The runtime never uses the pre-baked file. The first `/api/garments/session` after a cold start triggers a download to `~/.u2net/u2netp.onnx` (~5 MB). The download takes a few seconds — usually within the 30-second per-operation timeout — but if the download is slow or HuggingFace's proxy is congested, the first request after cold start can 408.

**Attack scenario:**
1. Wait for the HF Space to auto-sleep (idle ~5 minutes — platform-dependent, but predictable).
2. Send one POST. The Space wakes up, downloads u2netp, the first request after that completes in ~5–10 s.
3. If the attacker hits the warming-up window with five concurrent uploads, the first one races the model download (slow) and the others race each other (thread-pool contention plus model not yet loaded). Multiple 408s.

**Impact:** Reliable "first-impressions are broken" effect. Every recruiter visit after an idle period has a high chance of seeing the warming-up spinner persist past 30 seconds.

**Likelihood:** Moderate. Either spotted by reading Dockerfile vs. core code, or discovered the first time the demo is used after a long idle.

**Fix:** Change [Dockerfile:135](../Dockerfile#L135) to `new_session('u2netp')` so the actual runtime model is the one baked into the image.

**Detection:** None today. The cold-start timing is invisible in logs because no handler emits `model loaded in X ms` or `model download started`. Add a `logger.info("rembg session created", extra={"model": "u2netp", "duration_ms": ...})` in `remove_background` and the regression would have been visible.

---

## V7. PIL header-only parse on attacker-chosen formats

**Category:** OWASP A06 Vulnerable & Outdated Components — but speculatively, since the pinned versions may already be patched.

**Location:** [api/main.py:124-141](../api/main.py#L124-L141), `validate_image_dimensions`. Calls `PIL.Image.open(path)` without specifying `formats=...`. PIL auto-detects format from magic bytes. Supported formats include TIFF, ICO, GIF, MPO, JPEG2000, BLP, EPS, PCX — each with their own historical CVE record.

**Attack scenario:** Craft a malformed TIFF whose header (ImageWidth/ImageLength tags) declares a small footprint but whose IFD chain references millions of additional IFDs. PIL's `Image.open(path).size` must walk the IFD chain to compute dimensions. A 4 MB file with 100K IFD entries can spin PIL for seconds. Combined with the per-operation timeout (30 s) and the thread-pool size (~8 default executor threads), eight such uploads queued at the global 60/min rate limit can keep all threads pinned in CPU-bound IFD walking.

**Impact:** Soft thread-pool exhaustion that the dimension cap doesn't catch (because PIL is what *enforces* the cap, and the cap-check is what consumes the time).

**Likelihood:** Requires insider knowledge of TIFF internals or knowledge of a specific PIL CVE. Theoretical until a working PoC is built.

**Fix:**
- Restrict the formats PIL will identify: `PIL.Image.open(path, formats=("JPEG", "PNG", "WEBP"))`.
- Add an outer `signal.alarm` or `asyncio.wait_for`-wrapped variant of `validate_image_dimensions` so even a hostile header has a deadline.

**Detection:** Same gap as V4/V5. A `logger.warning("validate_image_dimensions slow", extra={"duration_ms": ..., "format": img.format})` would surface this category instantly.

---

## V8. Raw exception text in 400 detail (info disclosure)

**Category:** OWASP A05 Security Misconfiguration. Also fails the §12 pre-deploy checklist explicitly.

**Location:** [api/main.py:355-364](../api/main.py#L355-L364):
```
except (json.JSONDecodeError, ValueError) as exc:
    raise HTTPException(
        status_code=400,
        detail=(
            'Invalid color format. Use either:\n'
            '- JSON array: ["#FF0000", "#00FF00"]\n'
            '- Comma-separated: #FF0000,#00FF00\n'
            f'Error: {exc}'
        ),
    )
```

**Attack scenario:**
```
curl -X POST .../api/garments/recolor \
  -F session_id=$SID \
  -F "colors=[\"#FF0000\", malformed]" \
  -F "percentages="

# Response: 400, detail ends with "Error: Expecting value: line 1 column 12 (char 11)"
```
The reflected detail reveals (a) the parser is Python's `json` module, (b) the parser's internal column-counting style. Combined with `/docs` enabled in production ([api/main.py:144-149](../api/main.py#L144-L149) — no `docs_url=None`), an attacker has a complete schema *and* a confirmation that the server is FastAPI on Python.

**Impact:** Reconnaissance. Confirms the stack, narrows CVE-search to Python/FastAPI/json. Tiny on its own; aggregates with V6 (rembg model paths) and `/docs` exposure to produce a complete fingerprint.

**Likelihood:** Trivial. Any malformed-input probe surfaces this.

**Fix:** Replace `f'Error: {exc}'` with a static suffix. Log the real `exc` server-side via `logger.warning("colors parse failed", extra={"exc_class": type(exc).__name__})` so the operator keeps the signal without leaking it to the client. Drop the parse-mode hint ("JSON array: [...]") if you want to be paranoid; it's also a stack tell.

**Detection:** The 400s don't reach the structured logger today. A `logger.warning` on the parse-failure path closes both the disclosure and the visibility gaps in one change.

---

## V9. `file.filename` reflected unsanitised in `/api/colors/extract` response

**Category:** OWASP A03 Injection (defence-in-depth gap — not currently exploitable).

**Location:** [api/main.py:316](../api/main.py#L316): `"filename": file.filename` in the success body.

**Attack scenario:** Upload a file named `<img src=x onerror=alert(document.cookie)>.jpg`. JSON-encoding by FastAPI protects against breaking the response shape, but the value is echoed verbatim. The current frontend ([App.tsx:217](../chromaknit-frontend/src/App.tsx#L217)) does *not* render `data.filename` anywhere — instead, the label comes from `file.name.replace(/\.[^.]+$/, "")` on the client. So today this is **not exploitable**.

But: if any future code path renders the API's `filename` field via `dangerouslySetInnerHTML`, or if anyone else builds a client against this API and trusts the field, this becomes a stored-XSS pipe. The server should sanitise at the source.

**Impact:** Today, nothing. Future, latent XSS surface.

**Likelihood:** Theoretical today; trivial the day someone touches the wrong render path.

**Fix:** Sanitise on the server: `file.filename = re.sub(r"[^\w.\-]", "_", file.filename)[:120]` before echoing. Or stop echoing entirely (the client knows the filename it uploaded).

**Detection:** Wouldn't show up. The echo is invisible to the operator unless they audit responses.

---

## V10. CORS `allow_credentials=True` with `allow_methods=["*"]` / `allow_headers=["*"]`

**Category:** OWASP A05 Security Misconfiguration. Today's mitigation is "no cookies are set", which makes this latent rather than active.

**Location:** [api/main.py:183-190](../api/main.py#L183-L190).

**Attack scenario today:** None. The server sets no cookies and the frontend's `fetch` doesn't include credentials by default. The combination `allow_credentials=True` + matched origin echo + no cookies means the credentials flag is unused, and CORS does not let an attacker read responses cross-origin from any non-allowlisted origin.

**Attack scenario if anyone adds a cookie:** The moment a single `Set-Cookie` lands (e.g. session-id-as-cookie for convenience, an analytics cookie, a CSRF cookie, anything), `allow_credentials=True` plus the regex origin match means an attacker who controls *any* origin matching the regex can make credentialed cross-origin requests. The regex is anchored on `charlyx125` and on the `vercel.app` TLD, which is the only thing keeping the door shut.

**Impact:** Latent CSRF/credential-replay surface that activates silently on the day someone "just adds a small cookie".

**Likelihood:** Theoretical today.

**Fix:** Set `allow_credentials=False` until the day a cookie is intentionally introduced. Narrow `allow_methods` to the actual set (`["GET", "POST", "OPTIONS"]`) and `allow_headers` to (`["Content-Type", "Accept"]`).

**Detection:** Would not be detected from logs.

---

## V11. `requirements.lock` installed without `--require-hashes`

**Category:** OWASP A06 Vulnerable & Outdated Components / supply chain.

**Location:** [Dockerfile:112](../Dockerfile#L112) (`pip install --no-cache-dir --user -r requirements.lock`) and [.github/workflows/tests.yml:25](../.github/workflows/tests.yml#L25) (`pip install -r requirements.lock`). Neither uses `--require-hashes`. SECURITY.md §8 explicitly accepts this for the hobby tier — but for an attacker who controls a registry mirror or who can poison a CI cache, the door is open.

**Attack scenario:** Not from the public internet (PyPI integrity holds). But if a future fork ever runs CI in an environment with a private PyPI mirror (corporate or community-hosted), a compromised mirror can substitute any pinned version with a malicious wheel of the same name and pinned version. Pip will not detect the swap without hashes.

**Impact:** RCE in CI runner / Docker build container.

**Likelihood:** Theoretical for the current single-maintainer setup; realistic for any team that adopts the code.

**Fix:** Regenerate the lockfile with `pip-compile --generate-hashes` inside the Docker image (using the same Python 3.11) so hashes match the deploy environment.

**Detection:** Out of scope without supply-chain telemetry.

---

## V12. `/docs`, `/redoc`, `/openapi.json` enable rapid reconnaissance

**Category:** OWASP A05 (deliberately accepted). Not a vulnerability per the project policy, but for the attacker it is the recon entry point that surfaces every other endpoint, parameter, and validation rule in one place.

**Location:** [api/main.py:144-149](../api/main.py#L144-L149) — FastAPI defaults preserved.

**Attack scenario:** `curl https://...hf.space/openapi.json | jq` produces a complete operation list, parameter schemas, response schemas, status codes. Zero recon work for the attacker. Pair with V8 (json parser fingerprint) and the Server: header to confirm the stack.

**Impact:** Saves the attacker 20 minutes of guessing.

**Likelihood:** Trivial.

**Fix:** Per the project policy, none. This is a §13 accepted risk. From an attacker's view, the cost of attacking ChromaKnit is one curl request lower than it should be.

**Detection:** None today. `/openapi.json` requests are not logged any differently from `/`.

---

## V13. Tempfile cleanup is best-effort; `os.path.exists` is the wrong guard

**Category:** OWASP A04 Insecure Design (TOCTOU; latent).

**Location:** [api/main.py:319-322](../api/main.py#L319-L322), [api/main.py:472-475](../api/main.py#L472-L475):
```
finally:
    if os.path.exists(temp_path):
        os.unlink(temp_path)
```
On a single-tenant container `/tmp/` is per-process so no other actor can race the path. But if HF Spaces' container model ever changes to a shared-tmp setup, the `exists` check is TOCTOU-vulnerable: another process can swap the path between the check and the unlink. The right pattern is `try: os.unlink(temp_path); except FileNotFoundError: pass`.

**Attack scenario:** None against current deployment.

**Impact:** None today.

**Likelihood:** Theoretical.

**Fix:** Trivial; remove the existence check.

---

## V14. Session-store eviction is iterate-then-mutate without a lock

**Category:** OWASP A04 Insecure Design (concurrency).

**Location:** [api/sessions.py:92-100](../api/sessions.py#L92-L100):
```
def _evict_expired(self) -> None:
    now = time.time()
    expired_ids = [
        sid for sid, s in self._sessions.items()
        if now - s.last_accessed > self._ttl
    ]
    for sid in expired_ids:
        del self._sessions[sid]
```
Today this runs inside the single asyncio worker, so there is no interleaving point — coroutines only yield at `await`, and `_evict_expired` has no awaits. Safe today. But:

**Attack scenario after a future change:** the moment `_evict_expired` is called from a thread (e.g. a background sweep) or the deployment moves to multi-worker, two simultaneous `create()` calls can race against the eviction and produce `RuntimeError: dictionary changed size during iteration`. The 500 path is then attacker-reachable.

**Impact:** Latent.

**Likelihood:** Activates on multi-worker move. Not exploitable today.

**Fix:** Wrap the body in `threading.Lock` (or `asyncio.Lock` for full async). Combined with the existing §13 row "Single-worker in-memory session store", this is bundled with the Redis migration.

---

## V15. `/health` and `/` discloses version

**Category:** OWASP A05 Security Misconfiguration (low).

**Location:** [api/main.py:217-226](../api/main.py#L217-L226), [api/main.py:232-235](../api/main.py#L232-L235): both reflect `"version": "2.0.0"`.

**Attack scenario:** `curl .../health` → `{"status":"healthy","version":"2.0.0"}`. Combined with FastAPI's default `Server: uvicorn` header and OpenAPI metadata at `/docs`, an attacker knows the exact stack and version in three requests.

**Impact:** Trivial recon. CVE-matching against pinned deps becomes a paste-into-Snyk operation.

**Likelihood:** Trivial.

**Fix:** Drop the version field from `/health` (leave it on `/`, since `/` is the welcome route documented for humans). Or, if branding-friendly, return a static "v2" without the patch level.

---

## V16. localStorage hydration trusts the version field but not the yarn shape

**Category:** OWASP A03 (input validation) — only if attacker has localStorage access (XSS or extension).

**Location:** [chromaknit-frontend/src/hooks/useAppState.ts:262-273](../chromaknit-frontend/src/hooks/useAppState.ts#L262-L273):
```
const parsed = JSON.parse(raw);
if (parsed?.version !== STORAGE_VERSION) return;
if (!Array.isArray(parsed.yarns)) return;
dispatch({ type: "HYDRATE_YARNS", yarns: parsed.yarns });
```
No per-element validation: yarns could be `[{label: "<img onerror=...>", palette: ["javascript:alert(1)"], ...}]`. Today React's JSX text rendering ([YarnPalette.tsx:84](../chromaknit-frontend/src/components/YarnPalette.tsx#L84)) escapes `{yarn.label}`. The `style={{ background: dominantColor }}` ([YarnPalette.tsx:70](../chromaknit-frontend/src/components/YarnPalette.tsx#L70)) trusts `dominantColor` to be a hex — CSS injection via `background: red; url(javascript:...)` is possible in old browsers but blocked by modern CSS parsers. `src={yarn.previewUrl}` for an attacker-supplied `javascript:` URL: modern browsers ignore non-http(s)/data URLs in `img src` for navigation purposes (the image just fails to load); no JS execution.

**Attack scenario:** Only if the attacker has another XSS or a browser extension to seed localStorage.

**Impact:** Today, none. Latent if a future render path uses `dangerouslySetInnerHTML` or a different CSS context for the dominant colour.

**Likelihood:** Theoretical.

**Fix:** Validate yarn shape on hydrate: assert string types, length caps, hex regex on every palette element.

---

## V17. No Content-Security-Policy / Referrer-Policy / X-Content-Type-Options

**Category:** OWASP A05. SECURITY.md §13 accepts this; for the attacker it removes one defence-in-depth layer per missing header.

**Location:** API never sets headers beyond CORS. Frontend HTML at [chromaknit-frontend/index.html](../chromaknit-frontend/index.html) sets none.

**Attack scenario:** If V9 (filename echo) ever becomes a stored-XSS path, the absence of CSP turns "alert(document.cookie)" into "eval anything from anywhere". The absence of `Referrer-Policy` means every outbound `<a>` and font load sends the full Referer including any query string the URL ever picks up.

**Impact:** Cumulative — amplifies the severity of any other content-injection vuln by ~one CVSS step.

**Likelihood:** Trivial to discover (curl -I), only exploitable in conjunction with something else.

**Fix:** Add at minimum `Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; connect-src 'self' https://*.hf.space https://formspree.io; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com` and `X-Content-Type-Options: nosniff` on the frontend HTML response. Vercel's `vercel.json` is the right place.

---

## V18. Google Fonts is an undisclosed third-party data egress

**Category:** OWASP A09 Security Logging & Monitoring Failures (privacy/GDPR variant).

**Location:** [chromaknit-frontend/index.html:7](../chromaknit-frontend/index.html#L7).

**Attack scenario:** As an attacker, this is not exploitable. As a regulatory scenario, it is the textbook UK GDPR violation: personal data (IP, Referer) shared with a US processor without user-visible disclosure. Not my job to enforce, but I would flag this to the engagement contact because the maintainer is taking on legal risk they may not be aware of.

**Impact:** Reputational/legal only. Not exploit-grade.

**Likelihood:** Already in effect on every pageview. The "exploit" is "competitor or disgruntled visitor files a complaint".

**Fix:** Self-host the two used families (Cormorant Garamond + DM Sans) under `chromaknit-frontend/public/fonts/`, or add a user-visible privacy note alongside Formspree.

---

## V19. Sample-path JSON fetch trusts client-built slug

**Category:** OWASP A01 Broken Access Control (latent path-traversal-shaped surface).

**Location:** [chromaknit-frontend/src/App.tsx:272-273](../chromaknit-frontend/src/App.tsx#L272-L273) and [App.tsx:393-395](../chromaknit-frontend/src/App.tsx#L393-L395):
```
const slug = slugify(label);
const response = await fetch(`/samples/precomputed/yarns/${slug}.json`);
```
`slugify` is `label.toLowerCase().replace(/ /g, "-")` — *only* spaces are replaced. Every other character including `..`, `/`, NUL, control characters, and URL-special characters passes through. Today both call sites receive hardcoded labels from the `YARN_SAMPLES`/`GARMENT_SAMPLES` arrays — safe. But the moment any user-supplied label feeds either path (e.g. a future "rename your sample" feature), an attacker controls part of the fetched URL.

**Attack scenario today:** none. Attack scenario after the next feature change: `slugify("../../../api/secret")` returns `../../../api/secret`, and the fetch points at the wrong place.

**Impact:** Latent. Identical to the §13 row "slugify as path builder" — already accepted with the explicit reactivation trigger of "any feature that passes user-supplied labels into a URL".

**Likelihood:** Theoretical today.

**Fix:** Whitelist-validate the slug (`/^[a-z0-9-]{1,64}$/`) at the slugify call sites, not just at the inputs.

---

## Top 3 most exploitable

Ranked by likelihood × impact.

**1. V1 — Global rate limit on a proxy IP.** Trivial, zero attacker cost, high impact (demo unavailable for everyone), no detection signal. This is what I'd hit first. One bash loop running on a coffee-shop Wi-Fi from anywhere on the planet kills the demo for as long as I leave it running. The exact scenario the project's own threat model names as "real but bounded" — except "bounded" assumes nobody is actively griefing.

**2. V2 — Per-session cache stuffing → worker OOM.** Moderate to discover (need to read sessions.py), zero cost to execute, high impact (container restart + cold-start + V6 model-download race compounds to several minutes of downtime per attack cycle). The cache has no cap, the session has no per-IP attribution (V1), and the OOM cascade fires the V6 cold-start path on recovery. This is the multi-step kill chain.

**3. V3 — Formspree quota burn.** Trivial, public form ID in the JS bundle, attacks an off-platform third party, drains the maintainer's monthly issue-report quota for ~30 days. Not flashy but durable: there is no way for the maintainer to revoke the form ID without editing and redeploying, and even then any tab still open on the old version keeps spamming.

If I had four picks, V4 (NaN/Infinity crash path) would be next because it lets me litter the logs with 500s as cover for the other three.

## What I couldn't break

Honest list of what held up.

- **Session-ID guessability.** UUID4 from `uuid.uuid4()` at [api/sessions.py:70](../api/sessions.py#L70). 122 bits of entropy. Cannot enumerate. ✓
- **Hex-colour input validation.** `HEX_COLOR_RE = ^#[0-9A-Fa-f]{6}$` ([api/main.py:31](../api/main.py#L31)) is anchored, length-bounded, character-class-bounded. No ReDoS, no bypass via fullwidth-hash or unicode lookalikes (the regex matches bytes, not unicode classes).
- **CORS regex bypass.** The regex is correctly anchored at start (`^`) and end (`\.vercel\.app$`) and the `charlyx125` literal in the middle blocks both same-account impersonation by other Vercel users and prefix-injection ([tests/test_api.py:76-92](../tests/test_api.py#L76-L92) verifies five attack shapes). I tried mentally constructing `https://chromaknit-anything-charlyx125.vercel.app.attacker.com` — fails the trailing anchor. `https://chromaknit‍-charlyx125.vercel.app` — `‍` isn't `[a-zA-Z0-9-]`. The regex held.
- **Path traversal on the upload path.** Tempfile paths come from `tempfile.mkstemp` — server-generated, no attacker input. ✓
- **SSRF.** The backend never fetches a user-provided URL. Rembg fetches its model from a hardcoded URL inside the library. No way to redirect.
- **Magic-byte / polyglot file attacks.** Even though magic-byte validation isn't implemented, the response is always a freshly re-encoded PNG ([api/main.py:518](../api/main.py#L518)). User bytes never reach a renderer. The accepted-risk reasoning holds; I couldn't find a serve-back surface.
- **Decompression bombs.** `validate_image_dimensions` ([api/main.py:114-141](../api/main.py#L114-L141)) blocks the 25 MP cap with a header-only check before cv2.imread. PIL bombs (TIFF IFD chain, see V7) are speculative.
- **Recoloured-output XSS.** PNG bytes contain image data only. No mechanism to smuggle JS through cv2.imencode.
- **Frontend XSS via React JSX.** Every dynamic field I inspected is rendered as text content (React-escaped) or as an attribute value React handles. No `dangerouslySetInnerHTML`. No `eval` / `Function` constructor. Yarn labels, dominant colours, and previewUrls all funnel through safe React APIs.
- **Auth bypass / IDOR / privilege escalation.** There is no auth and no per-user state. Nothing to escalate to.
- **Crypto misuse.** No crypto is used in app code. UUID4 from `os.urandom` is the only randomness, and it's used correctly.
- **CSRF.** No cookies, no Authorization headers. Cross-origin POST from an attacker page hits the proxy IP rate-limit bucket (V1) but cannot act "as" a user because there is no user concept.
- **Prompt injection / LLM jailbreaks / system-prompt extraction.** No LLM in the codebase. Entire OWASP-for-LLM section is N/A.
- **Open redirect.** No redirect logic anywhere.
- **JWT alg=none / weak crypto.** No JWTs.

## What I didn't look at (out of scope for static analysis)

- **HuggingFace Spaces infrastructure.** The platform's edge proxy, sleep/wake behaviour, log retention, log access permissions, Docker host kernel CVEs, container-escape primitives. Treated as a trusted vendor surface. A real engagement would include vendor pentest reports.
- **Vercel infrastructure.** Same. Their CDN, build pipeline, environment-variable storage, and any platform-level CSRF/clickjacking primitives are out of scope.
- **PyPI and npm registries.** Treated as authentic; supply-chain attacks reduced to V11.
- **Live traffic.** No fuzzing, no Burp Suite session, no actual rate-limit reach test. The bash loops in this report are written from the manual, not from live execution.
- **DNS / TLS configuration.** Did not inspect cert transparency logs, DNS records, or TLS cipher choices. HF Spaces and Vercel terminate TLS; vendor-managed.
- **GitHub repo permissions.** Could not inspect collaborator list, branch protection, GitHub Actions secrets, or Dependabot configuration. A "main branch is unprotected" or "actions write tokens are leaked" finding is out of reach.
- **Browser-side state across users.** Did not inspect what a shared browser (kiosk, family computer) reveals to the next user via localStorage `chromaknit:state` — that requires runtime testing on a real install.
- **Social engineering surface.** The maintainer's email is exposed via Formspree replies and via the GitHub commit history. Phishing the maintainer is outside this engagement.
- **Cost telemetry.** I cannot verify the actual platform billing / quota behaviour without an account login. The "£0, platform-protected" claim in SECURITY.md is taken at face value.
- **The HuggingFace Space's README frontmatter** — the platform reads it for `app_port` and similar settings. Did not see the README's Space-side configuration; could affect everything from sleep behaviour to runtime user.
- **Production env-var configuration.** I cannot see what `LOG_LEVEL` is set to in production, nor whether other env vars are set on the Space that the code doesn't reference. Configuration drift between repo and platform is invisible to static analysis.

---

End of report. Nineteen findings, three I'd actually use, half a dozen others that compound if used together.
