# M3 — Docker & Containers

> **Core question:** How do you package an application so it runs identically on a laptop, in a CI runner, and in production — without "it worked on my machine" being a valid excuse?

> **⏱️ Time:** ~60 min padho + 30 min lab · **🎚️ Level:** Beginner→Intermediate · **📋 Pehle chahiye:** [M0](01-M0-foundations.md)
>
> **Is module ke baad tum kar paoge:**
> - Docker image build karna — layer order trick se cache optimize karna aur `docker history` se verify karna
> - Multi-stage Dockerfile likhna production ke liye: slim base, non-root user, build toolchain out
> - Docker Compose se multi-container stack chalana, debug karna, aur named volumes ka fark samajhna

> ### ↩️ Recall gate — shuru karne se pehle
> Pichhle modules se 3 sawaal. **Pehle memory se jawab do, phir kholo.** (Yeh retrieve karna hi lifetime yaad rakhta hai — dobara padhna nahi.)
>
> 1. *(M2)* Ansible mein `ok` aur `changed` mein kya farak hai — aur doosre run mein `changed=0` ka kya matlab hota hai?
> 2. *(M1)* Terraform ka `tfstate` file Git mein kabhi commit kyun nahi karna chahiye?
> 3. *(M0)* DevOps stack mein "packaging" layer ka kya kaam hai — aur Docker se pehle "it works on my machine" problem kyun hoti thi?
>
> <details markdown="1"><summary>Jawab</summary>
>
> 1. `ok` = system already desired state mein tha, Ansible ne kuch nahi kiya. `changed` = Ansible ne fix kiya. `changed=0` doosre run mein = convergence — idempotency ka proof. &nbsp; 2. `tfstate` mein sensitive data plaintext mein hota hai (DB passwords, private keys). Git history permanent hai — ek baar commit hua toh practically leak. S3 + encryption + restricted IAM use karo. &nbsp; 3. Packaging = app aur uski saari dependencies ko ek portable unit mein bundle karna (Docker image). Pehle: OS version, library versions, runtime sab environments mein different hote — dev pe kaam karta, prod pe crash. Docker ne sab ek saath freeze kiya.
> </details>

**Module map:** [00-INDEX](00-INDEX.md) · [01-M0](01-M0-foundations.md) · [02-M1](02-M1-terraform.md) · [03-M2](03-M2-ansible.md) · **04-M3 (you are here)** · [05-M4-K8s](05-M4-kubernetes-core.md) · [06-M5](06-M5-sizing-and-cost.md) · [07-M6-CI/CD](07-M6-cicd.md) · [08-M7](08-M7-gitops.md) · [09-connected](09-connected-system.md) · [10-M8](10-M8-observability-sre.md) · [11-M9](11-M9-advanced-k8s-internals.md) · [12-capstone-url](12-capstone-url-shortener.md) · [13-capstone-shop](13-capstone-microshop.md) · [14-interview-bank](14-interview-bank.md) · [15-roadmap](15-roadmap-M11-M18.md) · [16-appendix](16-reference-appendix.md)

---

## The 60-second version

Docker packages your app and every dependency it needs — runtime, libraries, config — into a single portable unit called an **image**. That image runs as a **container**: an isolated process on any machine that has Docker. The image is built once; it runs identically everywhere.

Technically, a container is not a VM. It is a Linux process isolated using **namespaces** (private view of filesystem, network, process tree) and constrained using **cgroups** (CPU and RAM limits). Containers share the host kernel; they are milliseconds-to-start, megabytes-in-size.

The image is composed of **layers** — one per Dockerfile instruction — cached like a game checkpoint. Change any instruction and every instruction below it rebuilds. Put rarely-changing dependencies above frequently-changing code and your builds go from two minutes to three seconds.

Images live in a **registry** (DockerHub, GitHub Container Registry (GHCR), or AWS Elastic Container Registry (ECR)). A CI pipeline builds and pushes; a Kubernetes kubelet pulls and runs. Tag images with an exact git SHA (Secure Hash Algorithm commit ID), never with the mutable `latest` tag.

---

## Why this exists — what it replaced

### The "it works on my machine" problem

Before containers, deploying software meant shipping code and hoping the target machine had the right:
- Language runtime (Python 3.8 vs 3.11)
- System libraries (`libssl`, `libpq`)
- Configuration (timezone, locale, mount paths)
- Package versions (Flask 1.x vs 2.x)

A developer's laptop had macOS. Staging ran Ubuntu 18.04. Production ran Ubuntu 20.04 with security patches applied three months later. Each environment drifted independently. The phrase "it works on my machine" was the standard answer to every production outage.

**What came before containers:**

| Era | Approach | Problem |
|-----|----------|---------|
| 2000s | Copy binaries to server | Library version hell; hard to reproduce |
| 2005–2015 | Virtual Machines (VMs) — full OS per app | Heavyweight: GBs of disk, minutes to start; 10 VMs per physical host |
| 2010–2015 | Configuration management (Ansible, Chef) | "Snowflake servers" — managed but still diverged over time |
| 2013+ | Containers (Docker) | Freeze the environment; one image runs everywhere |

**Containers did not replace VMs.** VMs still run underneath: your EC2 instance is a VM. Docker runs *inside* that VM (or inside your laptop). Containers replaced the "here's a pile of install instructions" approach to packaging applications.

---

## Container vs VM — first principles: namespaces and cgroups

This is the single most frequently-asked Docker question in senior interviews. The answer must go beyond "containers are lighter."

### The kernel-sharing insight

A VM contains:
- A full **guest operating system** with its own kernel
- Virtualized hardware (virtual CPU, virtual disk, virtual NIC — Network Interface Card)
- A hypervisor (VMware, VirtualBox, KVM) that multiplexes real hardware across guest VMs

A container contains:
- The application and its dependencies
- Nothing else — it **shares the host's kernel**

Isolation in a container comes from two Linux kernel primitives:

**Namespaces** give each container a private view of system resources:

| Namespace | What it isolates |
|-----------|-----------------|
| `pid` | Process tree — container sees only its own processes |
| `net` | Network stack — own IP, own port space |
| `mnt` | Filesystem — own root (`/`) via an overlay |
| `uts` | Hostname — container has its own hostname |
| `ipc` | Inter-process communication — shared memory |
| `user` | User IDs — UID 0 in container ≠ UID 0 on host |

**cgroups** (control groups) enforce resource limits:
- CPU quota (`cpu.shares` / `cpu.cfs_quota_us` + `cpu.cfs_period_us`) — Kubernetes expresses this as millicores, but the native cgroup primitive is `cpu.shares` and CPU bandwidth quotas
- Maximum RAM — exceed it and the process is killed (OOMKilled, exit code 137)
- I/O bandwidth
- Network priority

Without namespaces: all processes would see all other processes — no isolation. Without cgroups: one noisy container would starve the whole host.

### ASCII diagram: VM stack vs Container stack

```
VM STACK                              CONTAINER STACK
─────────────────────────────         ─────────────────────────────
  ┌─────────┐  ┌─────────┐             ┌──────────┐ ┌──────────┐
  │  App A  │  │  App B  │             │  App A   │ │  App B   │
  ├─────────┤  ├─────────┤             │  + libs  │ │  + libs  │
  │  Guest  │  │  Guest  │             └────┬─────┘ └────┬─────┘
  │  OS A   │  │  OS B   │              namespace  namespace
  │ (kernel)│  │ (kernel)│              cgroup      cgroup
  └────┬────┘  └────┬────┘                  │             │
       │             │               ┌──────▼─────────────▼──────┐
  ┌────▼─────────────▼────┐          │     HOST KERNEL (shared)   │
  │   HYPERVISOR (KVM)    │          └───────────────────────────┘
  ├───────────────────────┤          ┌───────────────────────────┐
  │     HOST KERNEL       │          │     HOST OS (Linux)        │
  ├───────────────────────┤          ├───────────────────────────┤
  │     HARDWARE          │          │     HARDWARE               │
  └───────────────────────┘          └───────────────────────────┘

  Each VM has its own kernel          All containers share one kernel
  2–8 VMs per physical host           100s of containers per host
  Minutes to start, GBs of disk       Milliseconds to start, MBs of disk
  Stronger isolation (separate kernel) Lighter (kernel-level namespaces)
```

### Comparison table

| Dimension | Virtual Machine (VM) | Container |
|-----------|---------------------|-----------|
| Isolation | Full guest OS kernel | namespaces + cgroups |
| Startup time | 30s – 3min | < 1 second |
| Typical size | 2–20 GB | 50–500 MB |
| Density | ~10 per host | ~100s per host |
| Security boundary | Separate kernel | Shared kernel (stronger config needed) |
| Use case | Full OS needs, legacy apps, strong isolation | Microservices, CI jobs, serverless |
| State | Mutable (in-place update) | Immutable (replace, don't modify) |

🇮🇳 **Hinglish intuition:** VM = alag makaan, apni neev, apna pani-bijli. Container = ek imarat mein alag flat — apna darwaza, apna saman, par building ki neev share. Zyada log reh sakte, sasta, jaldi tayaar.

---

## Images, layers, and the cache

### Image vs Container — the class/object pattern

| | Image | Container |
|--|-------|-----------|
| What it is | Read-only blueprint | Running instance of an image |
| Analogy | Recipe / class / blueprint | Dish / object / running process |
| Built by | `docker build` | `docker run` |
| Mutable? | No — immutable once built | Yes — thin writable layer on top |
| Relationship | 1 image | → many containers |
| Persists after stop? | Yes (image stays) | Container state is lost (unless you have a volume) |

🇮🇳 **Hinglish intuition:** Image = recipe (likhit, nahi badlegi). Container = jo dish bani (plate pe, kha ke khatam). Ek recipe se kai dishes bana sakte.

### Layers — every Dockerfile instruction is a save-point

When Docker builds an image, each instruction in the Dockerfile creates a **layer** — a diff on top of the previous state. The final image is a stack of these immutable layers.

```
LAYER STACK                       What each layer contains
─────────────────────────         ──────────────────────────────────────────
  ┌─────────────────────┐
  │   COPY . .          │  ← Layer 5: your application source code
  ├─────────────────────┤
  │   RUN pip install   │  ← Layer 4: installed Python packages (~200 MB)
  ├─────────────────────┤
  │   COPY requirements │  ← Layer 3: requirements.txt file
  ├─────────────────────┤
  │   WORKDIR /app      │  ← Layer 2: directory created
  ├─────────────────────┤
  │   FROM python:3.12  │  ← Layer 1: base OS + Python runtime (~120 MB)
  └─────────────────────┘

  Each layer is content-addressed (SHA256 hash of its content).
  Layers are shared across images — if two images share a base,
  they literally share that layer on disk.
```

🇮🇳 **Hinglish intuition:** Layer = game ka save-point 💾. Ek kaam ke baad save. Dobara usi jagah se shuru, purana kaam dobara nahi karna.

> 🔮 **Predict pehle (socho, phir aage padho):** Dockerfile ki upar wali ek line badli. Neeche ke saare layers ka cache ka kya hota hai — aur kyun?

### Cache invalidation — the top-down cascade rule

Docker caches every layer. On rebuild, it checks each layer:
- If the instruction **and its inputs** are unchanged → **cache hit**: reuse instantly (0 seconds)
- If anything changed → **cache miss**: rebuild this layer AND every layer below it

**Cache invalidation flows top-down, never up.** Change layer 3 and layers 4 and 5 must rebuild; layers 1 and 2 are safe.

```
CACHE INVALIDATION CASCADE
──────────────────────────
Layer 1  FROM python:3.12-slim     ✅ cache hit  (unchanged)
Layer 2  WORKDIR /app              ✅ cache hit  (unchanged)
Layer 3  COPY requirements.txt .   💥 CACHE MISS (file changed)
Layer 4  RUN pip install ...       🔄 FORCED REBUILD (downstream)
Layer 5  COPY . .                  🔄 FORCED REBUILD (downstream)
Layer 6  CMD ["python", "app.py"]  🔄 FORCED REBUILD (downstream)

Change requirements.txt → pip install reruns (~2 min).
Change app.py only → if ordered correctly, pip install cache holds.
```

### The layer-order trick — the single most impactful build optimization

Code changes frequently. Dependencies change rarely. If you copy everything first and then install dependencies, every code change invalidates the install layer.

**Wrong order — slow:**
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY . .                          # ← Code + requirements bundled together
RUN pip install -r requirements.txt  # Cache broken on EVERY code change
CMD ["python", "app.py"]
```

**Correct order — fast:**
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .           # ← Dependencies list FIRST (rarely changes)
RUN pip install -r requirements.txt  # Cache survives code changes
COPY . .                          # ← Code LAST (changes every commit)
CMD ["python", "app.py"]
```

With the correct order, editing `app.py` only rebuilds the last `COPY` layer. The expensive `pip install` stays cached. Build time drops from 2 minutes to 3 seconds.

🇮🇳 **Hinglish intuition:** Neev (foundation = deps) pehle, aur saal mein ek-do baar badlegi. Paint (code) baad mein, roz badlegi. Paint badlo toh neev dobara nahi daalte.

**The rule:** put rarely-changing instructions at the top; put frequently-changing instructions at the bottom.

### Build context and .dockerignore

When you run `docker build .`, the `.` is the **build context** — the directory Docker sends to the build daemon. The `COPY` instruction can only reference files within this context.

The build context is sent over a socket (or network). Sending `node_modules/` (500 MB), `.git/` (gigabytes on large repos), or secrets files is wasteful and dangerous.

**`.dockerignore`** works exactly like `.gitignore` — it excludes files from the build context:

```
# .dockerignore
node_modules/
.git/
.env
*.log
__pycache__/
.pytest_cache/
```

**Critical gotcha:** if you see a `COPY requirements.txt .` fail with "file not found," the root cause is almost always that `.dockerignore` excluded the file, or the file is outside the build context — not that the `COPY` instruction is wrong. The error surfaces at `COPY`; the root cause is in context/ignore config.

---

## The Dockerfile

### Instructions you must know cold

| Instruction | Phase | What it does |
|-------------|-------|-------------|
| `FROM image:tag` | Build | Base image to build on. Always the first instruction. |
| `WORKDIR /path` | Build | Sets (and creates) the working directory inside the image for all following instructions. |
| `COPY src dest` | Build | Copies files from the build context into the image. |
| `RUN command` | Build | Executes a shell command at build time. Creates a layer. Used for package installs, compiling, etc. |
| `ENV KEY=value` | Build | Sets environment variables that persist into containers. |
| `ARG name` | Build | Build-time variable (not available at runtime). Pass with `--build-arg`. |
| `EXPOSE port` | Build | Documents the port the app listens on. Informational — does not actually publish the port. |
| `CMD ["cmd","arg"]` | Runtime | Default command when the container starts. Can be overridden at `docker run`. |
| `ENTRYPOINT ["cmd"]` | Runtime | The fixed executable that always runs. `CMD` becomes its arguments. |

### RUN vs CMD vs ENTRYPOINT — the classic interview question

| | `RUN` | `CMD` | `ENTRYPOINT` |
|--|-------|-------|-------------|
| When | Build time | Runtime (container start) | Runtime (container start) |
| Creates a layer? | Yes | No | No |
| Purpose | Install packages, compile, setup | Default command or default args | Fixed executable |
| Can be overridden? | N/A | Yes — `docker run myapp python other.py` | Only with `--entrypoint` flag |
| Example | `RUN apt-get install -y curl` | `CMD ["app.py"]` | `ENTRYPOINT ["python"]` |

**The ENTRYPOINT + CMD pattern:**

```dockerfile
ENTRYPOINT ["python"]    # Always runs python
CMD ["app.py"]           # Default argument: python app.py
```

Running `docker run myimage` → executes `python app.py`.
Running `docker run myimage debug.py` → executes `python debug.py` (CMD overridden by argument).
Running `docker run --entrypoint bash myimage` → executes `bash` (ENTRYPOINT overridden, useful for debugging).

Use `ENTRYPOINT` when the container is a single-purpose executable (like a CLI tool). Use `CMD` when you want a default that can be easily swapped.

### Multi-stage builds — the production-critical pattern

A compiled language (Go, Java, TypeScript) needs a full toolchain to build but only the compiled artifact to run. Shipping `node`, `npm`, `gcc`, and build headers to production is:
- Wasteful (hundreds of MBs)
- A security risk (more attack surface)
- Slower to pull (larger image)

Multi-stage builds use one Dockerfile with multiple `FROM` instructions. Only the final stage ships.

### Annotated multi-stage Dockerfile (Node.js TypeScript app)

```dockerfile
# ─────────────── Stage 1: Build ────────────────────────────────────────────
# Use the full Node image with npm and the TypeScript compiler.
# This stage is DISCARDED — it never ships to production.
FROM node:20 AS build
WORKDIR /app

# Dependencies first (rarely change → cache survives code changes)
COPY package.json package-lock.json ./
RUN npm ci                            # Reproducible install (respects lock file)

# Source code last (changes every commit → only this layer rebuilds)
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build                     # Compile TypeScript → dist/

# ─────────────── Stage 2: Runtime ──────────────────────────────────────────
# Minimal Alpine Linux image (~5 MB base) with only the Node runtime.
# "AS build" above lets us reference it with --from=build.
FROM node:20-alpine AS runtime
WORKDIR /app

# Only copy what we actually need to run: compiled output + prod dependencies
COPY --from=build /app/dist ./dist
COPY package.json package-lock.json ./
RUN npm ci --omit=dev                 # Install ONLY production dependencies

# Non-root user: never run as root inside containers
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Document the port (kubectl and compose can read this)
EXPOSE 3000

# Health check: Docker will mark the container unhealthy if this fails
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3000/health || exit 1

# Fixed entrypoint; no shell wrapping (exec form, not shell form)
CMD ["node", "dist/server.js"]
```

**What this achieves:**
- Build stage: ~1.2 GB (Node + all dev dependencies + compiler)
- Runtime stage: ~180 MB (Alpine + runtime only)
- No TypeScript compiler, no test frameworks, no source maps ship to production
- Runs as a non-root user

### Image optimization checklist

| Optimization | Why | How |
|-------------|-----|-----|
| Small base image | Fewer packages = smaller attack surface + faster pulls | `alpine`, `slim`, `distroless` |
| Layer order | Maximize cache hits | deps before code |
| Combine RUN commands | Fewer layers, smaller image | `RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*` |
| Multi-stage | Drop build toolchain | `FROM ... AS build` then `COPY --from=build` |
| .dockerignore | Smaller build context, no secrets | Exclude `node_modules`, `.git`, `.env` |
| No secrets in layers | They survive in `docker history` even if deleted later | Use secrets at runtime via env vars |
| Non-root user | Least-privilege | `adduser` + `USER` instruction |

---

## Registries, tags, and the `latest` trap

### Where images live

```
BUILD → PUSH → PULL flow
────────────────────────────────────────────────────────────
Developer laptop                  Registry                  K8s Node
┌─────────────────┐    push    ┌───────────────┐   pull  ┌──────────────┐
│  docker build   │ ─────────► │  myapp:abc123 │ ───────► │  kubelet     │
│  (local cache)  │            │  (ECR/GHCR)   │         │  (containerd) │
└─────────────────┘            └───────────────┘         └──────────────┘

  1. Developer (or CI runner) builds the image locally
  2. docker push uploads it to the registry
  3. When a Pod is scheduled, the kubelet on the target node
     pulls the image from the registry
  4. kubelet hands it to containerd to start the container
```

### Registries explained

| Registry | Who runs it | Access | Common use |
|----------|------------|--------|------------|
| **Docker Hub** | Docker Inc. | Public by default, private tiers | Open-source images, public base images |
| **GHCR** (GitHub Container Registry) | GitHub | Tied to GitHub repo permissions | Apps whose source is on GitHub |
| **ECR** (Elastic Container Registry) | AWS | Private, IAM-controlled | Production workloads in AWS; the capstone uses this |
| **GitLab Container Registry** | GitLab | Tied to GitLab project | All-GitLab shops |

ECR paths look like: `123456789.dkr.ecr.ap-south-1.amazonaws.com/myapp:abc1234`

To push to ECR:
```bash
# Authenticate Docker to ECR (generates a temp token valid 12h)
aws ecr get-login-password --region ap-south-1 | \
  docker login --username AWS --password-stdin \
  123456789.dkr.ecr.ap-south-1.amazonaws.com

# Build and push
docker build -t myapp:abc1234 .
docker tag myapp:abc1234 123456789.dkr.ecr.ap-south-1.amazonaws.com/myapp:abc1234
docker push 123456789.dkr.ecr.ap-south-1.amazonaws.com/myapp:abc1234
```

### Tags vs digests — and the `latest` trap

A **tag** is a human-readable mutable label pointing to an image. The same tag can be reassigned to a different image at any time.

```
myapp:latest  →  image A    (today)
myapp:latest  →  image B    (after someone pushes a new build)
```

**The `latest` tag is not "the latest" — it is whatever was pushed last with that tag.** It has no version guarantee.

🇮🇳 **Hinglish intuition:** `latest` = sticky note jo anyone kisi bhi box pe chipka sakta. "Latest" likha hai, par box badal sakta. Delivery wala galat box le jaayega.

**Problems with `latest` in production:**
1. Two pods, same tag, different actual images (one node cached an old pull)
2. Rollback is impossible — you cannot `helm rollback` to `:latest`-2
3. Auditing is impossible — no traceability from running container to source commit

**What to use instead:**

```bash
# Pin to an exact tag (immutable in your process — never reassign)
myapp:v2.3.1

# Or pin to the image digest (SHA256 — truly immutable, the image content hash)
myapp@sha256:a3b1c2d4e5f6...

# Best practice in CI: tag by git SHA (links image to exact commit)
docker build -t myapp:$(git rev-parse --short HEAD) .
# → myapp:abc1234
```

A digest is the SHA256 hash of the image manifest. It is computed by the registry and never changes for a given image. Even if someone pushes a new `v2.3.1` tag, your manifest pinned to a digest will always pull the original.

> Cross-link: CI/CD pipelines (see [07-M6-cicd.md](07-M6-cicd.md)) automatically tag images with `${{ github.sha }}` — connecting every running container to an exact line of git history. GitOps (see [08-M7-gitops.md](08-M7-gitops.md)) then reads that tag from the manifest to deploy.

### ImagePullBackOff — what it means and how to fix it

When a Kubernetes node cannot pull an image, the Pod enters `ImagePullBackOff`. The node retries with exponential back-off.

Common causes:

| Cause | Symptom | Fix |
|-------|---------|-----|
| Tag does not exist | `manifest unknown` | Check the exact tag in the registry |
| Registry credentials missing | `pull access denied` | Add `imagePullSecret` to the Pod spec; configure ECR auth |
| Network cannot reach registry | `connection timed out` | Check VPC/subnet routing, NAT gateway, security group |
| Wrong registry URL in manifest | `repository not found` | Correct the image field in `deployment.yaml` |

> 🔧 **War story:** Subah CI push hua, pods theek the. Dopahar 2 baje naya pod schedule hua — `ImagePullBackOff`. ECR auth token 12 ghante mein expire ho jaata hai; node ka cached token stale tha, registry ne naya pull reject kar diya. Poori kahani + lesson → [Interview Bank](14-interview-bank.md).

> Cross-link: see [05-M4-kubernetes-core.md](05-M4-kubernetes-core.md) for Pod lifecycle and how kubelet interacts with the container runtime.

---

## Compose, volumes, and networks

### Docker Compose — local multi-container development

Docker Compose lets you define an entire multi-container application in a single YAML file and start everything with one command. It is a local development and testing tool — not a production orchestrator (that is Kubernetes's job).

```yaml
# docker-compose.yml — web app + Redis cache + PostgreSQL database
services:
  web:
    build: .                           # Build image from local Dockerfile
    ports:
      - "3000:3000"                    # host:container
    environment:
      - DATABASE_URL=postgres://user:pass@db:5432/mydb
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis
    volumes:
      - ./src:/app/src                 # Bind mount: live code reload in dev

  db:
    image: postgres:16-alpine          # Pull from registry, don't build
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: mydb
    volumes:
      - pgdata:/var/lib/postgresql/data  # Named volume: data survives `compose down`

  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data

volumes:                               # Named volumes managed by Docker
  pgdata:
  redisdata:
```

```bash
docker compose up -d            # Start all services in background
docker compose ps               # Show status of all services
docker compose logs -f web      # Follow logs for the web service
docker compose exec web bash    # Shell into the running web container
docker compose down             # Stop and remove containers and networks
docker compose down -v          # Also remove named volumes (wipes data)
```

### Volumes — data persistence beyond the container's life

A container's writable layer is **ephemeral** — it disappears when the container is removed. For anything that must survive (database files, uploads, logs), use a **volume**.

| Volume type | Definition | Use case |
|------------|------------|----------|
| **Named volume** | Docker-managed, lives in Docker's storage area (`/var/lib/docker/volumes/`) | Database data, anything that must survive container replacement |
| **Bind mount** | Maps a host directory into the container (`./src:/app/src`) | Local development — code changes on host immediately visible in container |
| **tmpfs** | In-memory only, not persisted | Secrets or scratch data that must never touch disk |

### Networks — DNS-based inter-container communication

Compose automatically creates a private network for all services in the file. Services resolve each other **by service name** using Docker's embedded DNS.

In the example above:
- The `web` service reaches the database at `db:5432` — the hostname `db` resolves to the container's IP automatically
- If the database container restarts and gets a new IP, DNS resolution still works — the name `db` always resolves to the current container

You do not need to hard-code IP addresses. This is exactly how Kubernetes Services work — a stable DNS name in front of pods with changing IPs. Compose is the local preview of that pattern.

🇮🇳 **Hinglish intuition:** Compose services = ek flat complex mein alag flats. Naam se phone karo — DNS number dhoondhta. IP yaad karne ki zaroorat nahi. Kubernetes Service wahi concept, production scale pe.

---

## Real production example

A production container deployment chain looks like this:

```
Developer pushes code
        │
        ▼
GitHub Actions CI (see 07-M6-cicd.md)
  ├── Run tests
  ├── docker build -t myapp:$GIT_SHA .
  ├── docker push ECR/myapp:$GIT_SHA
  └── Update k8s/deployment.yaml image tag to $GIT_SHA
        │
        ▼
Argo CD detects manifest change (see 08-M7-gitops.md)
  └── kubectl apply → Deployment updated
        │
        ▼
Kubernetes rolling update
  ├── New pods scheduled on nodes
  ├── kubelet pulls myapp:$GIT_SHA from ECR
  ├── containerd starts containers
  ├── Readiness probes pass → pods join Service
  └── Old pods terminated
        │
        ▼
Traffic now served from new image
```

Key properties of this chain:
- The image tag is the git SHA — every running container is traceable to a commit
- No `latest` — rollback is `git revert` the manifest + Argo CD re-applies
- The build never touches the cluster — only the image goes to the registry
- ECR lives in the same AWS region as the cluster — fast pulls, private network

---

## Commands, explained

Every command below includes a one-line "why" — what you are actually doing and when you reach for it.

```bash
# ── Building ─────────────────────────────────────────────────────────────────

docker build -t myapp:1.0 .
# WHY: Convert your Dockerfile + build context into a layered image named myapp:1.0.
# The dot (.) is the build context — the directory Docker reads COPY from.

docker build --no-cache -t myapp:1.0 .
# WHY: Force a full rebuild ignoring all cached layers.
# Use when you suspect stale cache is hiding a problem.

docker history myapp:1.0
# WHY: See every layer, its size, and the command that created it.
# Use to debug bloated images or to audit what's baked in.

# ── Running ───────────────────────────────────────────────────────────────────

docker run -d -p 8080:3000 --name mycontainer myapp:1.0
# WHY: Start a container in detached mode (-d = background), mapping host port
# 8080 to container port 3000, with a friendly name for later commands.

docker run --rm -it myapp:1.0 bash
# WHY: Start an interactive shell in a throwaway container.
# --rm removes it when you exit. Use to poke around the image.

# ── Inspecting ────────────────────────────────────────────────────────────────

docker ps
# WHY: See running containers — their names, ports, status, and uptime.

docker ps -a
# WHY: See ALL containers including stopped ones. Useful when a container
# immediately exits (check status and exit code).

docker logs mycontainer
# WHY: See stdout/stderr from the container process.
# First tool to reach for when a container misbehaves.

docker logs -f mycontainer
# WHY: Stream live logs. Equivalent to `tail -f`.

docker exec -it mycontainer bash
# WHY: Open a shell in an already-running container.
# Use to inspect state, run ad-hoc commands, debug.

docker inspect mycontainer
# WHY: Get full JSON metadata — IP address, mounts, env vars, restart policy.
# Use when you need low-level details.

# ── Registries ────────────────────────────────────────────────────────────────

docker pull nginx:1.25-alpine
# WHY: Download an image from a registry to local cache.
# Docker does this automatically on `docker run` if not cached.

docker tag myapp:1.0 myrepo/myapp:1.0
# WHY: Add a registry-prefixed tag before pushing.
# The tag must match the registry path for push to work.

docker push myrepo/myapp:1.0
# WHY: Upload the locally-built image to a registry so other machines can pull it.

# ── Cleanup ───────────────────────────────────────────────────────────────────

docker rmi myapp:1.0
# WHY: Remove an image from local cache (frees disk space).

docker system prune -a
# WHY: Remove all stopped containers, ALL unused images (not just dangling),
# unused networks, and build cache. Does NOT remove volumes by default —
# add --volumes to also prune them. Use on a dev machine running low on disk. Never use in production.

# ── Compose ───────────────────────────────────────────────────────────────────

docker compose up -d
# WHY: Start all services defined in docker-compose.yml in background.
# Builds images if needed, creates volumes and networks.

docker compose down
# WHY: Stop and remove containers and networks. Volumes are preserved.

docker compose down -v
# WHY: Also removes named volumes. USE WITH CAUTION — wipes database data.

docker compose logs -f
# WHY: Stream logs from all services simultaneously (each prefixed with service name).
```

---

## Beginner mistakes vs Senior insights

| Situation | Beginner | Senior |
|-----------|----------|--------|
| Base image choice | `FROM ubuntu:latest` (1.2 GB, mutable tag) | `FROM python:3.12-slim` or `distroless/python3` (50–150 MB) |
| Dependency install | `COPY . .` then `RUN pip install` | `COPY requirements.txt .` → `RUN pip install` → `COPY . .` |
| Build context | Ignore `.dockerignore` — sends `node_modules/` (500 MB) on every build | `.dockerignore` excludes everything unnecessary; build context is < 1 MB |
| Tagging | Push `:latest` to production | Pin every production image to git SHA or semver; never use `:latest` |
| Secrets | `ENV API_KEY=secret123` in Dockerfile | Inject at runtime via env vars, Kubernetes Secrets, or AWS Secrets Manager |
| Multi-stage | One big image with compiler + runtime | Multi-stage: build stage discarded; runtime image is minimal |
| Debugging | `docker run` and hope | `docker logs`, `docker exec -it bash`, `docker inspect`, `--no-cache` rebuild |
| Container process | Wrap CMD in shell script | Use exec form `CMD ["node", "app.js"]` — PID 1 gets signals correctly |
| Root user | Default (root in container) | Add non-root user; `USER appuser` |
| Data persistence | Write to container filesystem | Mount named volume for anything that must survive container replacement |
| Network between containers | Hard-code IP addresses | Use service names (Docker DNS); same as K8s Service DNS |

---

## Memory shortcuts

| Concept | One-liner | Hinglish hook |
|---------|-----------|---------------|
| Container vs VM | Share kernel (namespaces+cgroups) vs own kernel | Flat vs makaan |
| Image vs Container | Blueprint vs running instance | Recipe vs dish |
| Layer | One Dockerfile instruction = one cached diff | Game save-point 💾 |
| Cache invalidation | Change a layer → everything below rebuilds | Seedhi neeche toot (stairs break downward) |
| Layer order trick | Deps above, code below | Neev pehle, paint baad mein |
| Build context | Folder sent to daemon; COPY only reaches inside it | Jis dabba se copy karo |
| .dockerignore | Exclude from context (like .gitignore) | Guest list mein mat daalo |
| Multi-stage | Build stage discarded; only runtime ships | Chef ki kitchen vs customer ki table |
| Registry | Where images live between build and run | Images ka GitHub/warehouse |
| `latest` trap | Mutable label; no reproducibility | Jhootha sticky note — koi bhi label badal sakta |
| Digest / SHA | Immutable image fingerprint | Aadhaar number — kabhi nahi badalta |
| ImagePullBackOff | Node cannot pull image (bad tag / bad auth / no network) | Godam se dabba aa nahi raha |
| Volume | Data lives outside container lifecycle | Baahar ka locker — container maaro, data safe |
| Compose DNS | Services reach each other by service name | Pizza shop ka fixed phone number |

---

## Summary

- **Containers** solved dependency hell and environment drift by packaging the application and all its dependencies into a single immutable unit. They are not VMs — they share the host kernel and use **namespaces** (isolation) and **cgroups** (resource limits).
- An **image** is the immutable blueprint; a **container** is a running instance. One image, many containers — just like class and object.
- Every Dockerfile instruction is a **layer**. Layers are cached. Cache invalidation cascades top-down. The **layer-order trick** — dependencies before code — keeps expensive install steps cached across code changes.
- The **build context** is what gets sent to the Docker daemon. Use `.dockerignore` to exclude `node_modules`, `.git`, and secrets.
- Use **multi-stage builds** to keep build toolchains out of production images. Runtime images should be small, non-root, and contain only what the app needs to run.
- Images live in **registries** (DockerHub / GHCR / ECR). `docker push` uploads; the kubelet pulls the image (via containerd) on each node. A bad tag or missing auth causes **ImagePullBackOff**.
- Never use `latest` in production. Tag by **git SHA** (immutable, traceable) or semver. Pin critical images to a **digest** for absolute reproducibility.
- **Docker Compose** manages multi-container stacks locally. Services communicate by DNS service name. Named volumes persist data. This is the local preview of what Kubernetes does at scale.

---

## Self-check quiz

Pehle memory se jawab do, phir neeche kholo.

Answer these before moving to the lab. If you cannot answer, go back to the relevant section.

1. Explain container vs VM at the kernel level. What are the two Linux primitives that make container isolation work? What does each one do?

2. You edit `app.py` (a Python application). Your Dockerfile has `COPY . .` before `RUN pip install -r requirements.txt`. How many layers rebuild? Now fix the Dockerfile and describe which layers rebuild after the same edit.

3. Your CI pipeline pushes `myapp:latest` to DockerHub every build. What will happen when two nodes in a K8s cluster have been running at different times and pull `:latest`? Why is rollback difficult?

4. A junior engineer asks why `docker build` seems slow only after they modified `requirements.txt` but fast when they only changed a Python source file. Explain what is happening in terms of layers and cache.

5. What is the build context? Write a `.dockerignore` entry that excludes the `node_modules` directory and all `.log` files.

6. A Pod is in `ImagePullBackOff`. Walk through your diagnosis. What are three distinct root causes, and how do you identify which one applies?

7. You have a Go application. The Go compiler binary is 400 MB. The compiled binary is 12 MB. Describe the multi-stage Dockerfile strategy and what the final image will contain.

8. Container A (`web`) needs to connect to Container B (`db`) in the same Compose stack. What hostname does Container A use? Why does it work even when Container B restarts and gets a new IP?

<details markdown="1"><summary>Jawab dekho</summary>

1. Container = Linux process isolated via **namespaces** (pid, net, mnt, uts, ipc, user — har namespace ek private view deta hai: process tree, network, filesystem, hostname) aur **cgroups** se constrain (CPU/RAM/IO limits). Host kernel share hota — no guest OS, no hypervisor. VM = full guest OS + kernel on virtualized hardware via hypervisor. Container: milliseconds start, MBs. VM: minutes, GBs. VM isolation stronger (separate kernel); container density zyada (100s per host).
2. Wrong order (`COPY . .` then `pip install`): `app.py` edit karo → `COPY . .` layer cache miss → `pip install` bhi force rebuild — 2+ min wasted. Correct order (`COPY requirements.txt` → `pip install` → `COPY . .`): `app.py` edit karo → sirf last `COPY . .` layer rebuild — pip install cache hit karta. Ek cheap layer, seconds mein.
3. `:latest` mutable hai — jo last push kare wo pointer move karta. Do nodes alag time pe `:latest` pull karein → different images (inconsistent state). Rollback impossible — "latest minus one" ko reference nahi kar sakte. Fix: git SHA tag use karo (`myapp:abc1234`) — immutable, har running container exact commit se traceable, rollback = manifest revert.
4. `requirements.txt` change → `COPY requirements.txt .` layer cache miss → ALL downstream layers cascade rebuild (top-down rule), including expensive `pip install`. Code-only change (`app.py`) with correct order → sirf last `COPY . .` layer rebuilds — `pip install` cache hit kyunki uski inputs nahi badi. Build time: minutes se seconds.
5. Build context = directory (`.`) jo `docker build` pe Docker daemon ko send hota. `COPY` sirf is context ke andar ki files access kar sakta. `.dockerignore` entries: `node_modules/` (folder exclude) aur `*.log` (sare log files exclude).
6. `kubectl describe pod <name>` → Events section exact error message dikhata. Teen causes: (1) tag exist nahi → `manifest unknown` → registry mein exact tag verify karo; (2) auth failure → `pull access denied` → `imagePullSecret` check karo ya node IAM role ke liye ECR permissions (`ecr:GetAuthorizationToken`, `ecr:BatchGetImage`); (3) network → `connection timed out` → NAT gateway, security group egress rules, VPC routing check karo.
7. Stage 1 (`FROM golang AS build`): source copy, `go build` run — full toolchain present, ~12 MB binary banta. Stage 2 (`FROM scratch` ya `alpine AS runtime`): `COPY --from=build /app/binary .` — sirf compiled binary ships. Final image: ~15 MB, no Go compiler, no source code — attack surface near-zero.
8. Container A hostname `db` use karta (Compose service name). Docker Compose private bridge network banata with embedded DNS — service names auto-resolve to container IPs. `db` restart kare, nayi IP le le — DNS re-resolves automatically. Yahi pattern Kubernetes Service ka hai (`db.default.svc.cluster.local`) — stable name, ephemeral IPs behind it. IP yaad karne ki zaroorat kabhi nahi.
</details>

---

## Hands-on lab

**Goal:** Build, run, and optimize a real containerized application. Observe cache behavior. Then compose a multi-service stack.

### Part A — build, run, inspect

1. Create a project directory with a small Python Flask application:

```
my-app/
├── app.py
├── requirements.txt
└── Dockerfile
```

`app.py`:
```python
from flask import Flask
app = Flask(__name__)

@app.route("/")
def home():
    return "Hello from container v1\n"

@app.route("/health")
def health():
    return {"status": "ok"}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
```

`requirements.txt`:
```
flask==3.0.3
```

`Dockerfile` (deliberately wrong order first):
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY . .
RUN pip install -r requirements.txt
EXPOSE 5000
CMD ["python", "app.py"]
```

2. Build and time it:
```bash
docker build -t myapp:v1 .        # First build — all layers execute
time docker build -t myapp:v1 .   # Second build — fully cached (observe speed)
```

3. Edit `app.py` — change the message to `v2`. Rebuild and observe which layers execute:
```bash
docker build -t myapp:v2 .   # Which layers hit cache? Which rebuild?
```
Answer: `COPY . .` and `RUN pip install` both rebuild. pip install is wasted.

4. Fix the Dockerfile (correct layer order):
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 5000
CMD ["python", "app.py"]
```

5. Rebuild. Edit `app.py` again. Rebuild. Observe that `pip install` is now cached.

6. Run and test:
```bash
docker run -d -p 5000:5000 --name myapp myapp:v2
curl http://localhost:5000
curl http://localhost:5000/health
docker logs myapp
docker exec -it myapp bash          # Poke around inside
docker inspect myapp | grep IPAddress
```

7. Examine layers:
```bash
docker history myapp:v2            # See each layer, its size, its command
```

### Part B — multi-stage optimization

Convert to a multi-stage build. Add a build-time step (simulate compilation):

```dockerfile
FROM python:3.12 AS build
WORKDIR /app
COPY requirements.txt .
RUN pip install --target=/install -r requirements.txt

FROM python:3.12-slim AS runtime
WORKDIR /app
COPY --from=build /install /usr/local/lib/python3.12/site-packages
COPY . .
RUN addgroup --system app && adduser --system --group app
USER app
EXPOSE 5000
CMD ["python", "app.py"]
```

```bash
docker build -t myapp:slim .
docker images | grep myapp          # Compare sizes
```

### Part C — Compose with two services

Add a Redis counter to the app:

`requirements.txt`:
```
flask==3.0.3
redis==5.0.8
```

`app.py`:
```python
from flask import Flask
import redis, os

app = Flask(__name__)
r = redis.Redis(host=os.getenv("REDIS_HOST", "redis"), port=6379)

@app.route("/")
def home():
    count = r.incr("hits")
    return f"Hello! This page has been visited {count} times.\n"

@app.route("/health")
def health():
    return {"status": "ok"}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
```

`docker-compose.yml`:
```yaml
services:
  web:
    build: .
    ports:
      - "5000:5000"
    environment:
      - REDIS_HOST=redis
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data

volumes:
  redisdata:
```

```bash
docker compose up -d
curl http://localhost:5000    # Returns "visited 1 times"
curl http://localhost:5000    # Returns "visited 2 times"
docker compose down           # Stop containers — volume preserved
docker compose up -d          # Restart
curl http://localhost:5000    # Counter continues from where it left off (volume!)
docker compose down -v        # Now destroy the volume
docker compose up -d
curl http://localhost:5000    # Counter resets to 1
```

**What to record as proof:** terminal output of `docker build` showing cache hits/misses, `docker images` showing size difference, `docker compose ps` showing both services running, `curl` output showing the counter incrementing.

**✅ Sahi hua to aisa dikhega:** `docker images | grep myapp` mein `myapp:slim` ka size `myapp:v1` se clearly kam dikhega (slim base + multi-stage ka fark). `docker compose ps` mein `web` aur `redis` dono `running` status mein. `curl http://localhost:5000` counter increment karta dikhega; `docker compose down` + `docker compose up -d` ke baad counter same number se continue karega — named volume kaam kar raha hai. `docker compose down -v` ke baad restart karo toh counter 1 se start — volume destroy proof.

---

## Interview questions

**Q: What is the difference between a container and a VM? Go beyond "containers are lightweight."**

A container is a process on the host OS isolated using Linux **namespaces** (private view of network, filesystem, process tree) and constrained with **cgroups** (CPU and RAM limits). All containers share the host kernel — there is no guest OS, no hypervisor overhead. A VM runs its own kernel on virtualized hardware managed by a hypervisor. Containers start in milliseconds (they are just processes), are megabytes in size, and allow hundreds per host. VMs give a stronger isolation boundary (separate kernel) but at the cost of GBs of overhead and minutes to start. In practice you run both: your EC2 instance is a VM; your Docker containers run inside it.

---

**Q: Explain Docker image layers and how the cache works. How would you use this to optimize build speed?**

Each Dockerfile instruction creates an immutable layer — a content-addressed diff on the previous state. On rebuild, Docker checks whether the instruction and its inputs are unchanged; if so, it reuses the cached layer (instant). Once a cache miss occurs, all subsequent layers rebuild. Cache invalidation is top-down only. The optimization: put rarely-changing instructions (FROM, dependency installs) at the top; put frequently-changing instructions (COPY source code) at the bottom. This way, editing application code only rebuilds the last few layers — the expensive package install stays cached.

---

**Q: What is the `latest` tag problem? What should you use instead?**

`latest` is a mutable label — whoever pushes last with `:latest` moves the pointer. Two nodes pulling `:latest` at different times may get different images. Rollback is impossible because you cannot reference a specific prior state. In CI/CD pipelines, tag every image with the git commit SHA (`myapp:a3b1c2d`) — this ties the image to an exact commit, makes rollback trivial (revert the manifest, Argo re-deploys), and makes audit trails complete. For absolute reproducibility, pin to the image digest (`myapp@sha256:...`) which is computed from the image content and is immutable even if a tag is reassigned.

---

**Q: What is a multi-stage build and when do you use it?**

A multi-stage build uses multiple `FROM` statements in one Dockerfile. Each `FROM` starts a new stage; only the last stage (or a named stage you target) ships. The earlier stages are discarded at the end of the build — their files exist only in the intermediate layers Docker never exports. Use it when your build toolchain is larger than your runtime: a Go binary needs the Go compiler to build (300+ MB) but the final binary is 10 MB and needs only a minimal base to run. A TypeScript app needs `tsc` and dev dependencies to compile but only needs `node` and production dependencies to serve. Multi-stage shrinks production images by 60–90% and removes build tools from the attack surface.

---

**Q: A Pod is stuck in `ImagePullBackOff`. Walk me through your diagnosis.**

First: `kubectl describe pod <name>` and read the Events section — it shows the exact pull error message. Three distinct causes: (1) the tag does not exist in the registry — verify the exact tag name against the registry UI or CLI; (2) authentication failure — the node cannot prove it is allowed to pull; for ECR this means the node IAM role needs `ecr:GetAuthorizationToken` and `ecr:BatchGetImage`; for private registries you need an `imagePullSecret` referenced in the Pod spec; (3) network failure — the node cannot reach the registry endpoint; check VPC routing, NAT Gateway for private subnets, and security group egress rules.

---

**Q: How do two containers in a Compose stack communicate? How does this relate to Kubernetes?**

Compose creates a private bridge network and adds all services to it. Docker's embedded DNS resolves service names to container IPs — so the `web` container reaches the database at `db:5432` by hostname, regardless of what IP the database container was assigned. If the database restarts with a new IP, DNS resolution still works. This is the local equivalent of a Kubernetes Service: a stable DNS name (`db.default.svc.cluster.local`) that load-balances to pods whose IPs change. Both solve the same problem — decoupling callers from the ephemeral IPs of the things they call.

---

## Production challenge

You have been handed a Python microservice with this Dockerfile:

```dockerfile
FROM ubuntu:20.04
RUN apt-get update && apt-get install -y python3 python3-pip git curl wget vim
COPY . /app
RUN pip3 install -r /app/requirements.txt
WORKDIR /app
ENV SECRET_KEY=supersecret123
CMD python3 app.py
```

The image is 2.1 GB. It is tagged `:latest` and pushed every deploy. It runs as root.

**Your tasks:**

1. List every problem with this Dockerfile (aim for at least 8).
2. Rewrite it addressing all problems: correct layer order, slim base image, multi-stage if appropriate, non-root user, no secrets in layers, exec-form CMD.
3. How do you handle `SECRET_KEY` in production? Name two mechanisms.
4. The team pushes `:latest` to ECR. How do you change the CI pipeline to use immutable tags? What flag/variable do you use in GitHub Actions to get the commit SHA?
5. After your fix, the image is 180 MB and the build takes 8 seconds for code-only changes. Describe to a junior engineer exactly why the build is fast now — layer by layer.

*(Reference answer: [14-interview-bank.md](14-interview-bank.md) — Production Dockerfile review.)*

---

*Next: [05-M4-kubernetes-core.md](05-M4-kubernetes-core.md) — the platform that runs your containers in production, self-heals them, and scales them without human intervention.*
