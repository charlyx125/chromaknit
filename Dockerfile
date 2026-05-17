# Dockerfile for the ChromaKnit FastAPI backend, deploying to HuggingFace Spaces.
#
# Build:    docker build -t chromaknit-backend .
# Run:      docker run -p 7860:7860 chromaknit-backend
# Test:     curl http://localhost:7860/health
#
# Each section below has inline comments explaining the why, not just the what.
# If you are reading this to learn Docker, the migration plan in
# docs/claude/backend-migration.md walks through the design decisions.


# === SECTION 1: Base image ===
#
# python:3.11-slim is a stripped-down Debian image with Python 3.11 preinstalled.
# "slim" means no documentation, no locales, none of the rarely-used Debian
# packages. About 50 MB smaller than the regular python:3.11 image, which makes
# pulls and cold starts faster on HuggingFace Spaces.
#
# Trade-off: some Python packages depend on C libraries that slim does not
# include (e.g. opencv needs libglib). We install the few we need in the next
# section. Worth the slight extra apt step for the much smaller base.
#
# Pinning to 3.11 (not "latest") keeps builds reproducible. If python:3.11-slim
# updates underneath us we get bug fixes; if we pinned to 3.11.7-slim
# specifically we would freeze the patch version too, but that means manually
# updating to pick up security patches. 3.11-slim is the practical balance.
FROM python:3.11-slim


# === SECTION 2: System dependencies (apt packages) ===
#
# opencv-python-headless (used by core/garment_recolor.py and core/
# yarn_color_extractor.py) needs libglib at runtime. Even the "headless"
# variant which strips X11 GUI deps still calls into glib for some image
# operations.
#
# libgl1 is here defensively; some opencv-python-headless versions still
# dlopen libGL on Linux even though they do not actually use a display.
# Adding it costs ~12 MB and saves a debugging session.
#
# Why all in one RUN: each RUN creates a new image layer. Combining the
# update + install + cleanup keeps everything in one layer, which means the
# apt cache (around 30 MB of package metadata) does not get baked into the
# image. The "&& rm -rf /var/lib/apt/lists/*" at the end is the cleanup that
# keeps the layer slim.
#
# --no-install-recommends drops "suggested but not required" packages. Saves
# space, reduces attack surface.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*


# === SECTION 3: Non-root user ===
#
# By default Docker containers run as root. HuggingFace Spaces strongly
# prefers (and in some configurations requires) running as a non-root user
# with UID 1000. This is a real-world security best practice too: if the
# app gets compromised, the attacker is constrained to the user's permissions
# instead of root's.
#
# We create a user named "user" with UID 1000 (HF's convention) and switch
# to it before doing any pip install or COPY. Everything from here on
# happens as that user, including the model download and the running app.
#
# ENV HOME and PATH: pip install --user installs into /home/user/.local/bin,
# which is not on PATH by default. Adding it ensures uvicorn (installed via
# pip) is findable when CMD runs.
RUN useradd --create-home --uid 1000 user
USER user
ENV HOME=/home/user
ENV PATH=/home/user/.local/bin:$PATH

# WORKDIR sets the directory subsequent COPY/RUN/CMD instructions run from.
# /home/user/app is a sensible owned location for our user.
WORKDIR $HOME/app


# === SECTION 4: Python dependencies ===
#
# This is where layer caching matters most. Docker caches each instruction's
# output as a layer; if a layer's inputs have not changed since the last
# build, Docker skips re-running it and reuses the cache. Layers invalidate
# from the first changed instruction onwards.
#
# We COPY requirements.txt first and install dependencies BEFORE copying
# application code. That way, editing api/ or core/ does NOT invalidate the
# pip-install layer (which is the slow one, taking 3-5 minutes for rembg's
# heavy ML stack). Only changes to requirements.txt rebuild the dep layer.
#
# --chown=user:user: by default COPY uses root ownership on the destination.
# Since we are running as user, we want the user to own these files.
#
# pip install flags:
#   --no-cache-dir: do not keep pip's package cache (~150 MB for our deps).
#                   We will not pip install again at runtime, so caching it
#                   in the image is pure bloat.
#   --user: install into /home/user/.local/ instead of system Python.
#           Required because we are not root and cannot write to system
#           site-packages.
COPY --chown=user:user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt


# === SECTION 5: Pre-bake the rembg U2-Net model ===
#
# rembg downloads its U2-Net background-removal model on first use, into
# ~/.u2net/. The model is around 170 MB, and the download takes 10-20s.
#
# Two places to do this download:
#   - At BUILD TIME (here): the model lives inside the image. The image is
#     170 MB bigger but cold starts on HF Spaces skip the download. First
#     upload after the Space wakes is faster.
#   - At RUNTIME (first request): the image is smaller but cold starts
#     include the download. HF Spaces wipes the container's ephemeral disk
#     on each sleep, so the model has to redownload every wake.
#
# We choose build-time. The bigger image is paid once at deploy; the faster
# cold start is felt every time someone uses the upload feature.
#
# How: importing rembg.new_session('u2net') triggers the download because
# the constructor verifies/fetches the model file. We do not need to
# actually call remove() with a real image; just instantiating the session
# is enough.
RUN python -c "from rembg import new_session; new_session('u2net')"


# === SECTION 6: Application code ===
#
# Copy the FastAPI app and its core dependencies. Done AFTER pip install so
# editing app code does not retrigger the slow pip layer.
#
# We do NOT copy: chromaknit-frontend/, tests/, scripts/, examples/, etc.
# Those are excluded by .dockerignore at the repo root.
COPY --chown=user:user api/ ./api/
COPY --chown=user:user core/ ./core/


# === SECTION 7: Runtime configuration ===
#
# EXPOSE documents which port the container listens on. It does not actually
# publish the port; that happens at `docker run -p` time or via HF Spaces'
# routing layer. Think of EXPOSE as documentation for whoever runs the
# image.
#
# 7860 is HuggingFace Spaces' default app port. We will also tell HF the
# port via the Space's README.md frontmatter (app_port: 7860). The two need
# to match.
EXPOSE 7860


# === SECTION 8: Entrypoint ===
#
# CMD is the default command run when the container starts. uvicorn is the
# production-grade ASGI server FastAPI runs on top of.
#
# Flags:
#   api.main:app  - import the `app` symbol from api/main.py
#   --host 0.0.0.0 - listen on all interfaces. Default 127.0.0.1 only
#                    accepts connections from inside the container, which
#                    is wrong for a network service.
#   --port 7860    - matches EXPOSE above and the HF Space app_port.
#
# We use the JSON-array form of CMD ("exec form") rather than the shell
# form. Exec form means uvicorn is PID 1 inside the container and receives
# signals like SIGTERM directly, which lets it shut down gracefully when HF
# Spaces stops the container.
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "7860"]
