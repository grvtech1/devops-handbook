# Capstone II — MicroShop

> **Core question:** Can I decompose a single service into real microservices — with inter-service DNS, matrix CI, and multi-app GitOps — and still ship the whole thing from a mono-repo to a self-managed Kubernetes cluster?

> **⏱️ Time:** Multi-day project · **🎚️ Level:** Advanced · **📋 Pehle chahiye:** [Capstone I](12-capstone-url-shortener.md), [M4](05-M4-kubernetes-core.md), [M9](11-M9-advanced-k8s-internals.md)
>
> **Is module ke baad tum kar paoge:**
> - Teen microservices deploy karo inter-service Kubernetes DNS ke saath (order-api → catalog-api)
> - Matrix CI aur multi-app Argo CD configure karo ek mono-repo se
> - Per-service Four Golden Signals dashboards set up karo aur path-based Ingress routing debug karo

**Prerequisites:** Complete Capstone I ([12-capstone-url-shortener.md](12-capstone-url-shortener.md)) first.  
**Builds on:** [11-M9-advanced-k8s-internals.md](11-M9-advanced-k8s-internals.md) (CoreDNS, Ingress) · [10-M8-observability-sre.md](10-M8-observability-sre.md) (Golden Signals) · [08-M7-gitops.md](08-M7-gitops.md) (Argo CD) · [07-M6-cicd.md](07-M6-cicd.md) (GitHub Actions) · [02-M1-terraform.md](02-M1-terraform.md) (Terraform ECR, RDS).

---

> ### ↩️ Recall gate — shuru karne se pehle
> Pichhle modules se 3 sawaal. **Pehle memory se jawab do, phir kholo.** (Yeh retrieve karna hi lifetime yaad rakhta hai — dobara padhna nahi.)
>
> 1. *(12)* URL Shortener capstone mein `terraform destroy` ke baad cluster naya bana — Argo CD ne bina kisi manual `kubectl apply` ke saari services kaise redeploy ki?
> 2. *(M9)* `catalog-api.default.svc.cluster.local` mein `.default.` kya represent karta hai — aur yeh FQDN shortname `catalog-api` se kab better hai?
> 3. *(M7)* App-of-apps pattern mein parent Application kya karta hai, aur yeh single Application se kab zyada sahi choice hai?
>
> <details><summary>Jawab</summary>
>
> 1. Argo CD pull model: cluster reconnect hone pe Argo Git se desired state compare karta → OutOfSync detect karta → `argocd/application.yaml` apply karte hi sab services automatically sync ho jaati hain (selfHeal + automated sync). &nbsp; 2. `.default.` = namespace. FQDN tab zaroori hai jab call alag namespace se ho — same namespace mein shortname `catalog-api` kaam karta, cross-namespace mein nahi. &nbsp; 3. Parent Application child Applications ko manage karta (Git se). Jab multiple teams independently deploy karein — per-service rollback aur sync status chahiye — tab app-of-apps single Application se better hai.
> </details>

## The 60-second version

MicroShop is a mini e-commerce system with three FastAPI services — `frontend`, `catalog-api`, and `order-api` — backed by Redis (cache) and Postgres (RDS). Every service is stateless; state lives outside the cluster. The project introduces five concepts that go beyond Capstone I:

1. **Inter-service communication via Kubernetes Service DNS** — order-api calls catalog-api by name, not IP.
2. **Matrix CI** — one GitHub Actions workflow fans out to build all three images in parallel.
3. **Multi-app Argo CD** — one Argo Application (or app-of-apps tree) manages all three Deployments declaratively.
4. **Redis cache-aside** — catalog-api checks Redis before hitting Postgres.
5. **Per-service observability** — Four Golden Signals dashboards, one per service.

This project is roughly 3× the work of Capstone I. It is also 3× the interview value.

---

## What's new vs Capstone I

| Dimension | Capstone I (URL Shortener) | Capstone II (MicroShop) |
|---|---|---|
| Services | 1 FastAPI app | 3 FastAPI services |
| Image repos (ECR) | 1 | 3 (`for_each`) |
| Inter-service calls | None | order-api → catalog-api via K8s DNS |
| CI strategy | Single build job | Matrix: 3 parallel builds |
| Argo CD applications | 1 Application | 1 Application watching k8s/ (upgrade: app-of-apps) |
| Cache | None | Redis (cache-aside, 60 s TTL) |
| Database | SQLite / flat file | Postgres on RDS (managed, stateful) |
| Ingress routing | Single path | Path-based: `/`, `/catalog`, `/order` |
| HPA | Optional | Per-service HPA |
| Observability | Cluster-level | Four Golden Signals per service |
| Repo layout | Simple flat | Mono-repo: `services/` `k8s/` `infra/` `argocd/` |
| "Star moment" | App deploys | Inter-service DNS call succeeds |

---

## Architecture: three services, one cache, one DB

```
                       INTERNET (users)
                            │
                     NodePort :30080
                            │
            ┌───────────────▼──────────────────────────┐
            │         K8s CLUSTER (3 EC2)               │
            │                                           │
            │   ┌─────────────────────────────────┐    │
            │   │  frontend pods (×1-2)            │    │
            │   │  ClusterIP svc: frontend:8000    │    │
            │   └──────────┬──────────┬────────────┘    │
            │              │          │                  │
            │   (svc DNS)  │          │ (svc DNS)        │
            │              ▼          ▼                  │
            │  ┌─────────────────┐  ┌──────────────────┐│
            │  │ catalog-api     │  │ order-api        ││
            │  │ pods (×1-2)     │  │ pods (×1-2)      ││
            │  │ svc: catalog-   │  │ svc: order-api   ││
            │  │ api:8000        │  │ :8000            ││
            │  └──────┬──────────┘  └──────┬───────────┘│
            │         │   ▲                │             │
            │  Redis  │   │ inter-service  │             │
            │  svc    │   └────────────────┘             │
            │  :6379  │   order-api → catalog-api ⭐     │
            │  ┌──────▼──┐                               │
            │  │  Redis  │         :5432 (private)       │
            │  │  pod    │──────────────────────────────▶│
            └───────────┼──────────────────────────────┘
                        │              RDS Postgres
                        │              (AWS managed, stateful)
            ECR (3 repos: catalog-api / order-api / frontend)
            S3 + DynamoDB (Terraform remote state)
```

**Golden rule:** The K8s cluster boundary is the stateless zone. Redis and RDS are outside (or semi-outside) that zone. All three services start with `replicas: 1`; HPA scales each independently.

---

## The star feature: inter-service comms via Service DNS

### Why DNS, not IP

When a Pod restarts in Kubernetes, its IP changes. Hardcoding IPs between services breaks immediately. Kubernetes solves this with **Service DNS** — every Service gets a stable DNS name, and CoreDNS (the in-cluster resolver, covered in [11-M9-advanced-k8s-internals.md](11-M9-advanced-k8s-internals.md)) resolves it to the current ClusterIP.

FQDN (Fully Qualified Domain Name — the full address including namespace):

```
<service-name>.<namespace>.svc.cluster.local
```

So `catalog-api` in the `default` namespace is reachable at:

```
catalog-api.default.svc.cluster.local
```

Within the same namespace, you can use the short form `catalog-api` (CoreDNS appends the rest automatically). MicroShop uses the short form in ConfigMap:

```yaml
# k8s/config.yaml — ConfigMap
data:
  CATALOG_URL: "http://catalog-api:8000"   # short-form DNS (same namespace)
  ORDER_URL:   "http://order-api:8000"
  REDIS_HOST:  "redis"                     # Redis service DNS
```

🇮🇳 **Hinglish intuition:** Service DNS = phone directory. Naam se number milta hai — IP yaad rakhne ki zaroorat nahi. `catalog-api` bol do, CoreDNS number dhundh lega. Pod restart ho, number change ho — naam wahi rahega.

> 🔮 **Predict pehle (socho, phir aage padho):** catalog-api down ho jaati hai. order-api jo use call karti hai — uska kya behaviour hona chahiye (aur galat design mein kya hota hai)?

### The actual inter-service call (order-api → catalog-api)

```python
# services/order-api/main.py — annotated
"""Order API — orders (Postgres). Calls catalog-api (INTER-SERVICE) for price/stock."""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import os, psycopg2, httpx                     # httpx = async-friendly HTTP client

app = FastAPI(title="order-api")

# CATALOG_URL injects via ConfigMap: "http://catalog-api:8000"
# Fallback = "http://catalog-api:8000" — never a bare IP
CATALOG_URL = os.environ.get("CATALOG_URL", "http://catalog-api:8000")

class OrderIn(BaseModel):
    product_id: str
    qty: int = 1

@app.post("/orders")
def create_order(body: OrderIn):
    # ⭐ INTER-SERVICE CALL — catalog-api se price/stock lo via service DNS
    try:
        resp = httpx.get(
            f"{CATALOG_URL}/products/{body.product_id}",
            timeout=5           # always set a timeout — no timeout = hanging pod
        )
    except Exception:
        raise HTTPException(503, "catalog-api unreachable")  # degrade gracefully

    if resp.status_code == 404:
        raise HTTPException(404, "Product not found")

    product = resp.json()
    if product["stock"] < body.qty:
        raise HTTPException(409, "Not enough stock")  # business logic here, not in catalog

    total = product["price"] * body.qty
    # ... write order to Postgres, return receipt
```

**What the Service manifest looks like on the catalog-api side:**

```yaml
# k8s/catalog-api.yaml (Service portion)
apiVersion: v1
kind: Service
metadata:
  name: catalog-api          # ← this name IS the DNS entry CoreDNS serves
spec:
  selector: { app: catalog-api }
  ports: [{ port: 8000, targetPort: 8000 }]   # ClusterIP (internal only)
```

The name `catalog-api` in `metadata.name` is exactly what CoreDNS registers. When order-api calls `http://catalog-api:8000`, CoreDNS resolves `catalog-api` to the ClusterIP of this Service, which load-balances to all healthy `app: catalog-api` pods.

### Testing the inter-service call (P5 — the star moment)

```bash
# Exec into order-api pod and call catalog-api by DNS name
kubectl exec -it deploy/order-api -- \
  curl http://catalog-api:8000/products/p1
# Expected: {"id":"p1","name":"Laptop","price":50000,"stock":5,"cached":false}

# Verify DNS resolution directly
kubectl exec -it deploy/order-api -- \
  nslookup catalog-api
# Answer: catalog-api.default.svc.cluster.local → 10.96.x.x (ClusterIP)

# Deliberate break: rename the Service, watch DNS fail
# kubectl edit svc catalog-api → name: catalog-api-v2
# order-api: curl → "catalog-api unreachable" (DNS NXDOMAIN)
# Fix: restore the name — reconciliation restores via Argo
```

> **Cross-link:** How CoreDNS serves these names, how kube-proxy wires ClusterIP to iptables rules — see [11-M9-advanced-k8s-internals.md](11-M9-advanced-k8s-internals.md) §CoreDNS and §kube-proxy.

---

## Redis: the cache-aside pattern

catalog-api uses Redis as a **cache-aside** (lazy-load) cache. The service never writes to Redis on create — it only populates on read misses.

```python
# services/catalog-api/main.py — annotated
import redis, json

REDIS_HOST = os.environ.get("REDIS_HOST", "redis")   # Service DNS: "redis"

def cache():
    # Always wrap in try — if Redis is down, we degrade to DB-only (no crash)
    try:
        return redis.Redis(host=REDIS_HOST, port=6379, socket_connect_timeout=2)
    except Exception:
        return None

@app.get("/products/{pid}")
def get_product(pid: str):
    r = cache()
    # Step 1: Try Redis (fast path — microseconds)
    if r:
        try:
            hit = r.get(f"product:{pid}")
            if hit:
                return {**json.loads(hit), "cached": True}   # ← cache hit
        except Exception:
            pass   # Redis error → fall through to DB (never crash on cache)

    # Step 2: Miss → hit Postgres (slow path — milliseconds)
    conn = db(); cur = conn.cursor()
    cur.execute("SELECT id,name,price,stock FROM products WHERE id=%s", (pid,))
    row = cur.fetchone(); conn.close()
    if not row:
        raise HTTPException(404, "Product not found")
    data = {"id": row[0], "name": row[1], "price": row[2], "stock": row[3]}

    # Step 3: Populate cache with 60 s TTL
    if r:
        try:
            r.setex(f"product:{pid}", 60, json.dumps(data))  # TTL = 60 s
        except Exception:
            pass   # write failure → not fatal

    return {**data, "cached": False}
```

### In-cluster Redis vs managed (ElastiCache)

| | In-cluster Redis pod (lab) | AWS ElastiCache (production) |
|---|---|---|
| Setup | `kubectl apply -f k8s/redis.yaml` | Terraform `aws_elasticache_cluster` |
| Persistence | None (pod restart = cache wipe) | Optional AOF/RDB snapshots |
| Cost | Free (uses cluster nodes) | ~$15–25/month (cache.t3.micro) |
| Recommendation | Lab/portfolio | Any production load |

The lab uses a ClusterIP Redis Service named `redis`. Because it has no persistence (`redis:7-alpine`, no volume mount), a pod restart wipes the cache — the app falls back to Postgres on the next miss, which is acceptable.

🇮🇳 **Hinglish intuition:** Cache = dukaan ka galla. Baar baar warehouse (Postgres) mein mat jao — galle mein rakh lo. Thoda time baad (TTL = 60 s) purana item hatao, taaza lo.

---

## Matrix CI: one workflow, three images

Without a matrix, you would write three nearly identical build jobs. With `strategy.matrix`, you write one job and GitHub Actions fans it out to N parallel runners.

```yaml
# .github/workflows/ci.yml — annotated (real file)
name: CI - Build & Push (3 services)

on:
  push:
    branches: [main]
    paths: ['services/**']   # ← only trigger when app code changes
                             #   prevents infinite loop on manifest commits

env:
  AWS_REGION: ap-south-1

permissions:
  contents: write            # CI bot needs Git write access to update manifests

jobs:
  # Job 1: MATRIX — 3 parallel runners, one per service
  build-push:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [catalog-api, order-api, frontend]   # ← expand here to add a 4th
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id:     ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region:            ${{ env.AWS_REGION }}
      - uses: aws-actions/amazon-ecr-login@v2
      - name: Build & push ${{ matrix.service }}
        run: |
          # Per-service ECR repo: microshop/catalog-api, microshop/order-api, etc.
          IMG=${{ secrets.ECR_REGISTRY }}/microshop/${{ matrix.service }}:${{ github.sha }}
          docker build -t $IMG ./services/${{ matrix.service }}  # context = service dir
          docker push $IMG
          # Tag = git SHA — immutable, traceable, no "latest" ambiguity

  # Job 2: manifest update — runs AFTER all 3 matrix jobs complete
  update-manifests:
    needs: build-push          # ← sequential dependency on matrix job
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Update image tags in k8s manifests
        run: |
          SHA=${{ github.sha }}
          ECR=${{ secrets.ECR_REGISTRY }}
          for svc in catalog-api order-api frontend; do
            # sed replaces the image line in each service's k8s YAML
            sed -i "s|image: .*microshop/$svc.*|image: $ECR/microshop/$svc:$SHA|" k8s/$svc.yaml
          done
          git config user.name  "ci-bot"
          git config user.email "ci@microshop.dev"
          git add k8s/
          git commit -m "ci: update images to $SHA [skip ci]" || echo "no changes"
          git push
          # [skip ci] prevents triggering another CI run on this commit
```

### Matrix fan-out: wall-clock time comparison

```
Without matrix (sequential):
  catalog-api build: 90 s
  order-api   build: 90 s   ← wait
  frontend    build: 60 s   ← wait
  Total wall-clock: ~4 min

With matrix (parallel):
  catalog-api build: 90 s
  order-api   build: 90 s   ← same time slot
  frontend    build: 60 s   ← same time slot
  Total wall-clock: ~90 s + manifest job overhead
```

🇮🇳 **Hinglish intuition:** Matrix CI = ek recipe, teen dishes ek saath. Ek chef ek dish banata — teen chef parallel mein teen dishes. Total time = sabse slow dish ka time (90 s), not sum (4 min).

**Adding a 4th service later:** Add `payment-api` to the matrix array. Zero other changes required.

```yaml
matrix:
  service: [catalog-api, order-api, frontend, payment-api]
```

---

## Multi-app GitOps: app-of-apps

### The actual MicroShop Argo CD Application

The lab uses a single Argo CD Application that watches the entire `k8s/` folder:

```yaml
# argocd/application.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: microshop
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/grvtech1/microshop.git
    targetRevision: main
    path: k8s                    # watches everything in k8s/
  destination:
    server: https://kubernetes.default.svc
    namespace: default
  syncPolicy:
    automated:
      prune: true                # file deleted from Git → resource deleted from cluster
      selfHeal: true             # manual kubectl change → Git state restored within 3 min
    syncOptions:
      - CreateNamespace=true
```

This is fine for a lab. One Application, one source path, all manifests synced together.

### Why upgrade to app-of-apps in production

When three independent teams own three services, you want independent sync, independent rollback, and independent health status per service.

**App-of-apps tree:**

```
argocd/
├── app-of-apps.yaml          ← parent Application (points to argocd/)
├── catalog-app.yaml          ← child: watches k8s/catalog-api.yaml
├── order-app.yaml            ← child: watches k8s/order-api.yaml
└── frontend-app.yaml         ← child: watches k8s/frontend.yaml

Argo CD sees:
  microshop-root  (parent)
  ├── catalog-api (child) — Synced ✅
  ├── order-api   (child) — OutOfSync ⚠️  ← only this rolled back
  └── frontend    (child) — Synced ✅
```

Each child Application can have its own sync policy, sync window, and RBAC. Rolling back `order-api` does not touch `catalog-api` or `frontend`.

| | Single Application | App-of-apps |
|---|---|---|
| Setup complexity | Low | Medium |
| Independent rollback per service | No — all or nothing | Yes |
| Per-service sync status | No | Yes |
| Suitable for | Lab, single team | Multi-team, production |
| When to upgrade | When 2+ teams deploy independently | Now, for MicroShop production |

> **Cross-link:** Argo CD sync mechanics, selfHeal loop, diff view — [08-M7-gitops.md](08-M7-gitops.md).

---

## Infra: Terraform ECR for three services

Capstone I provisioned one ECR repository. MicroShop provisions three using `for_each` — a single resource block expands to three repos:

```hcl
# infra/main.tf — ECR: 3 repos (per service)
resource "aws_ecr_repository" "repos" {
  for_each = toset(["catalog-api", "order-api", "frontend"])
  name     = "microshop/${each.key}"
}
# Produces:
#   microshop/catalog-api
#   microshop/order-api
#   microshop/frontend
```

Adding a fourth service requires adding one string to `toset([...])` — Terraform plans one new repo and leaves the other three untouched.

### RDS Postgres (managed, stateful)

```hcl
# infra/main.tf — RDS Postgres
resource "aws_db_instance" "pg" {
  identifier        = "microshop-pg"
  engine            = "postgres"
  engine_version    = "16"
  instance_class    = "db.t3.micro"        # ~$15/month — destroy after lab
  allocated_storage = 20
  db_name           = "microshop"
  username          = "appuser"
  password          = var.db_password      # tfvars — never hardcoded
  skip_final_snapshot = true               # lab only; prod = false + backup retention
  publicly_accessible = false              # never expose RDS to internet
}
```

RDS requires two subnets in different Availability Zones (AWS HA requirement). The infra provisions `public_a` (ap-south-1a) and `public_b` (ap-south-1b) for the DB subnet group.

### Moving to Terraform modules (production path)

The flat `infra/main.tf` works for a lab. For a dev/prod split, extract into modules:

```
infra/
├── modules/
│   ├── networking/   main.tf (VPC, subnets, IGW, SG)
│   ├── compute/      main.tf (EC2 master + workers)
│   ├── database/     main.tf (RDS, subnet group)
│   └── registry/     main.tf (ECR repos)
└── environments/
    ├── dev/          main.tf (calls modules, dev tfvars: t3.micro, 0 workers)
    └── prod/         main.tf (calls modules, prod tfvars: t3.medium, 2 workers, RDS multi-AZ)
```

Dev calls every module with smaller inputs; prod calls the same modules with HA inputs. One set of module code, two environment instantiations. See [02-M1-terraform.md](02-M1-terraform.md) §Modules for the module call syntax.

**Cost control:** `terraform destroy` in dev/prod nightly. RDS and EC2 are the main cost drivers (RDS alone = ~$15/month if left running).

---

## Per-service observability & ingress routing

### Four Golden Signals — per service

The Four Golden Signals (from Google SRE) apply independently to each service. A spike in order-api errors tells you something different from a spike in catalog-api latency.

> **Cross-link:** Full Golden Signals explanation, Prometheus scrape config, Grafana dashboard setup — [10-M8-observability-sre.md](10-M8-observability-sre.md).

| Signal | What it means | catalog-api | order-api | frontend |
|---|---|---|---|---|
| **Latency** | How long requests take | `/products` p99 latency (cache hit vs miss) | `/orders POST` p99 (includes catalog call) | `/` page load time |
| **Traffic** | Request rate | Products fetched per minute | Orders placed per minute | Homepage hits/min |
| **Errors** | Error rate (4xx/5xx) | DB errors, Redis timeouts | catalog-api 503s, stock 409s | upstream fetch failures |
| **Saturation** | How full the resource is | Redis memory %, DB connections | DB connection pool | Pod CPU % |

**Why per-service dashboards matter:** If frontend latency spikes, it could be a frontend bug, or it could be catalog-api latency bleeding through. Per-service dashboards let you trace the chain: frontend slow → catalog-api slow → Redis down → DB query time up. Without per-service visibility you see symptoms at the top and guess at the root cause.

### Path-based Ingress routing

An Ingress Controller (NGINX) terminates TLS (Transport Layer Security — HTTPS encryption) and routes by URL path:

```yaml
# k8s/ingress.yaml (add in P8)
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: microshop
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  tls:
  - hosts: [microshop.example.com]
    secretName: microshop-tls         # cert-manager provisions this
  rules:
  - host: microshop.example.com
    http:
      paths:
      - path: /catalog(/|$)(.*)
        pathType: Prefix
        backend: { service: { name: catalog-api, port: { number: 8000 } } }
      - path: /order(/|$)(.*)
        pathType: Prefix
        backend: { service: { name: order-api, port: { number: 8000 } } }
      - path: /
        pathType: Prefix
        backend: { service: { name: frontend, port: { number: 8000 } } }
```

> **Cross-link:** Ingress Controller setup, NGINX annotations, cert-manager TLS — [11-M9-advanced-k8s-internals.md](11-M9-advanced-k8s-internals.md).

> 🔧 **War story:** `/catalog` path pe nginx 404 aa raha tha — backend catalog-api pods ekdum theek the; Ingress rule mein `host: microshop.example.com` set tha lekin `curl` request mein `Host:` header nahi tha. `curl -H 'Host: microshop.example.com' http://<node-ip>:30080/catalog/products` se 200 mila, DNS entry add karne se permanently fix hua. Poori kahani + lesson → [Interview Bank](14-interview-bank.md).

### HPA (Horizontal Pod Autoscaler) per service

HPA (Horizontal Pod Autoscaler — automatically adds or removes pods based on load) is applied independently per service:

```yaml
# k8s/catalog-hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: catalog-api
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: catalog-api
  minReplicas: 1
  maxReplicas: 4
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 60   # scale out if avg CPU > 60%
```

Duplicate for `order-api` and `frontend` with appropriate min/max values. catalog-api is typically the hottest service (product browsing >> order placement), so it benefits most from autoscaling.

---

## Build order & scope discipline

**The rule:** Complete one service fully (Dockerfile → ECR → K8s Deployment → Service → health check passing) before starting the next. Do not scaffold all three services and try to debug three broken deployments at once.

```
Recommended build sequence:

Phase P1: Mono-repo scaffolding
  └─ Create services/catalog-api/, services/order-api/, services/frontend/

Phase P2: Dockerfiles → ECR (one at a time)
  └─ catalog-api Dockerfile + push → verify pull works → then order-api → then frontend

Phase P3: Terraform infra
  └─ terraform apply → VPC + EC2 + RDS + 3 ECR repos

Phase P4: Ansible kubeadm cluster
  └─ Same as Capstone I (cross-link 12)

Phase P5 (STAR): Deploy all 3 + Redis, test inter-service DNS ⭐
  kubectl apply -f k8s/redis.yaml         # Redis first (catalog-api depends on it)
  kubectl apply -f k8s/catalog-api.yaml   # catalog-api second (order-api depends on it)
  kubectl apply -f k8s/order-api.yaml     # order-api last
  kubectl apply -f k8s/frontend.yaml
  # Then: exec into order-api, call catalog-api by DNS → success = microservices proven

Phase P6: Matrix CI
  └─ Push ci.yml → watch 3 parallel jobs → manifests updated

Phase P7: Argo CD
  kubectl apply -f argocd/application.yaml
  # Watch Argo sync all 4 manifests (3 services + redis) from k8s/

Phase P8: Polish
  └─ Ingress + TLS, HPA, resource limits, Prometheus/Grafana dashboards
```

**Why startup order matters in P5:** catalog-api has a readinessProbe on `/health`. Postgres must be reachable for startup to succeed (the `init()` function creates the table). Apply Redis before catalog-api because catalog-api tries to connect to Redis at startup. Apply catalog-api before order-api because order-api calls catalog-api's `/health`-adjacent endpoint at first order.

**The deliberate break to run in P5:**
```bash
# Break: rename catalog-api Service to simulate DNS failure
kubectl patch svc catalog-api -p '{"metadata":{"name":"catalog-api-v2"}}'
# Now: POST /orders → "catalog-api unreachable" (503)
# Fix: restore the correct name (or via Argo selfHeal if the manifest is correct in Git)
kubectl apply -f k8s/catalog-api.yaml   # Argo will also self-heal within ~3 min
```

---

## The interview value (5 talking points)

MicroShop gives you five distinct, specific things to say in interviews that a single-service project cannot:

**1. Inter-service DNS**
> "In MicroShop, order-api calls catalog-api using Kubernetes Service DNS — `http://catalog-api:8000`. CoreDNS resolves the service name to the ClusterIP, which load-balances across pods. No hardcoded IPs, no service discovery library — Kubernetes handles it natively."

**2. Matrix CI**
> "Our GitHub Actions workflow uses a build matrix over three services. Three runners spin up in parallel, each building and pushing its own ECR image tagged with the git SHA. Wall-clock build time went from ~4 minutes sequential to ~90 seconds. A second job uses `needs: build-push` to update all three K8s manifests in one commit after all images are ready."

**3. GitOps with app-of-apps**
> "We manage all three services declaratively with Argo CD. The current setup uses one Application watching the `k8s/` folder with `selfHeal: true` — a manual `kubectl` change is rolled back within three minutes. The upgrade path is app-of-apps: one parent Application managing three child Applications, each with independent rollback and sync status."

**4. Per-service observability**
> "We tracked Four Golden Signals — latency, traffic, errors, saturation — separately for each service. This let us distinguish frontend slowness caused by a catalog-api cache miss from order-api slowness caused by a Postgres connection leak. Without per-service dashboards you see the symptom at the top and guess at the root cause."

**5. Stateful handling**
> "All three application services are stateless — no local disk, no local cache state. Postgres runs on RDS (managed, automated backups, multi-AZ available). Redis runs as an in-cluster pod for the lab; the production upgrade is ElastiCache. Because the app tier is fully stateless, HPA can scale any service horizontally without coordination."

---

## Summary

| What you built | Why it matters |
|---|---|
| 3 FastAPI services in a mono-repo | Real microservices decomposition |
| Inter-service DNS (order→catalog) | Proves K8s service discovery, interview gold |
| Redis cache-aside in catalog-api | Cache-hit vs miss visible in responses |
| Matrix CI (1 workflow → 3 images) | Parallelism, SHA tagging, manifest update |
| Single Argo Application (upgrade: app-of-apps) | GitOps at scale, selfHeal |
| 3 ECR repos via `for_each` | DRY Terraform |
| RDS Postgres (managed, external) | Correct stateful handling |
| Per-service Golden Signals | Observability in a distributed system |
| Path-based Ingress + TLS | Production-grade traffic routing |

The complexity jump from Capstone I is deliberate. Every concept you struggled with (DNS fail, matrix loop, inter-service 503) is a story you can tell precisely because you built it yourself.

---

## Self-check quiz

Pehle memory se jawab do, phir neeche kholo.

1. `order-api` calls `catalog-api` using the URL `http://catalog-api:8000`. What Kubernetes component resolves `catalog-api` to an IP address, and what kind of IP is returned?

2. What is the FQDN (Fully Qualified Domain Name) of the `catalog-api` Service in the `default` namespace? When would you need the FQDN instead of the short name?

3. In the matrix CI workflow, `update-manifests` has `needs: build-push`. What does this guarantee, and why is it essential here?

4. The catalog-api Redis integration wraps every Redis call in a `try/except` and falls through to Postgres on failure. What design principle does this implement, and what would break if you removed the try/except?

5. The current `argocd/application.yaml` points to the `k8s/` path and manages all services together. Describe one concrete scenario where this becomes a problem, and how app-of-apps solves it.

6. In `infra/main.tf`, the ECR repos use `for_each = toset([...])`. What happens in `terraform plan` when you add `"payment-api"` to the set? What happens to the existing three repos?

7. The lab Redis pod has no `volumeMount`. What happens to cached data when the Redis pod is killed and rescheduled? What changes in `k8s/redis.yaml` would give persistence?

8. HPA is configured with `minReplicas: 1` for `catalog-api`. A traffic spike hits 10× normal. Explain the sequence: HPA reads a metric → decides to scale → new pods start → pods receive traffic. Name two things that must be true before the new pods receive traffic.

<details><summary>Jawab dekho</summary>

1. CoreDNS resolves `catalog-api` to a ClusterIP — a stable virtual IP managed by kube-proxy. CoreDNS is the in-cluster DNS server; it maps `<service>.<ns>.svc.cluster.local` to the Service's ClusterIP.
2. FQDN: `catalog-api.default.svc.cluster.local`. Short name kaam karta same namespace mein. Cross-namespace call mein (e.g., `payments` namespace se `default` namespace ki service) FQDN zaroori hai.
3. `needs: build-push` ensures `update-manifests` runs ONLY when ALL matrix jobs succeed. Agar catalog-api build fail ho — us image ka ECR tag exist nahi karta — partial manifest update se production break hoga.
4. Cache-aside with try/except = graceful degradation. Without try/except: any Redis connection error → uncaught exception → 500 for ALL users even when Postgres is fine. Cache failure kabhi bhi service crash nahi karaayegi.
5. Single Application mein order-api rollback matlab saari services ka revert — frontend aur catalog-api bhi touch hote hain unnecessarily. App-of-apps: each child Application ka independent rollback; sirf order-api revert, baaki untouched.
6. `terraform plan` shows 1 resource to add (`microshop/payment-api` ECR repo). Existing 3 repos unchanged — Terraform only touches what changed in config.
7. Redis pod kill = cache wiped (ephemeral storage, no PVC). App falls back to Postgres on next read miss. Acceptable for lab. Persistence add karne ke liye: PVC create karo, Redis pod mein `/data` pe mount karo, `appendonly yes` config daalo.
8. Sequence: metrics-server CPU scrape karta → HPA computes `ceil(current × curr/target)` → Deployment controller new pods create karta. Before traffic: (1) readiness probe pass honi chahiye new pods pe; (2) kube-proxy ne iptables/IPVS rules update kiye hone chahiye naye EndpointSlice entry se.
</details>

---

## Interview questions

1. **"Walk me through what happens when a user places an order in MicroShop — from HTTP request to database write."**  
   Cover: user → frontend → order-api → catalog-api (DNS resolution, stock check) → order written to Postgres. Mention the 5 s timeout, the 503 fallback, and the fact that catalog-api may serve from Redis cache.

2. **"How would you handle the case where catalog-api is temporarily unavailable when an order comes in? What are the tradeoffs of your approach?"**  
   Current approach: return 503 immediately. Alternative: circuit breaker (Hystrix / resilience4j pattern), queue the order (async), or retry with exponential backoff. Tradeoff: consistency vs availability (CAP theorem framing).

3. **"Your matrix CI builds three images in parallel. What happens if catalog-api build succeeds but order-api build fails? Does the manifest update job run?"**  
   `needs: build-push` requires ALL matrix jobs to succeed. If one fails, the matrix job is marked failed, and `update-manifests` does not run. The cluster keeps the previous image for all services. Correct behavior — partial manifest update would leave catalog-api on new image and order-api on old image, potentially breaking the inter-service contract.

4. **"A junior engineer does `kubectl scale deploy/catalog-api --replicas=0` directly. What happens next?"**  
   Argo CD with `selfHeal: true` detects drift between the cluster state (0 replicas) and Git (1 replica). Within ~3 minutes Argo syncs and sets replicas back to 1. The engineer's change is overwritten. Correct action: change the manifest in Git.

5. **"Why do you store the Postgres password in a Kubernetes Secret rather than the ConfigMap, and what are the limitations of this approach?"**  
   Secrets are base64-encoded (not encrypted at rest by default). The limitation: the password is still in plaintext in the Git repo (via `terraform.tfvars`) and in the Secret manifest. Production upgrade: use AWS Secrets Manager + External Secrets Operator, or seal secrets with Sealed Secrets / SOPS. Cross-link [10-M8-observability-sre.md](10-M8-observability-sre.md) §secret management.

6. **"How would you deploy a breaking API change in catalog-api without downtime to order-api?"**  
   Version the API (`/v2/products/{pid}`), deploy new version alongside old, update order-api to call `/v2`, confirm stable, deprecate `/v1`. Or: canary deployment — shift 10% of traffic to new catalog-api pods via Argo Rollouts, watch error rate on order-api, promote or rollback.

---

## Production challenge

**✅ Sahi hua to aisa dikhega:** `kubectl exec -it deploy/order-api -- curl http://catalog-api:8000/products/p1` returns `{"id":"p1","name":"Laptop","price":50000,"stock":5,"cached":false}`; second request same endpoint pe `"cached":true` dikhata hai; `POST /orders` via order-api se ek receipt aata hai jisme `total` field hai; `kubectl logs deploy/order-api` mein `catalog-api` ka successful inter-service call dikhta hai; Argo CD mein `microshop` Application "Synced" green dikhta hai aur koi bhi manual `kubectl` change 3 min mein revert ho jaata hai.

Push your MicroShop to the next level with these three extensions:

**Challenge 1 — Add a payment-api (4th service)**  
Create `services/payment-api/` with a `/payments` POST endpoint. It receives an `order_id` and calls `order-api` to verify the order exists before recording the payment. Add it to the matrix (`service: [..., payment-api]`), provision a 4th ECR repo (one string in `for_each`), write the K8s manifests. The inter-service call chain becomes: frontend → order-api → catalog-api + frontend → payment-api → order-api.

**Challenge 2 — Add a message queue between order-api and catalog-api**  
Instead of order-api calling catalog-api synchronously, put SQS (AWS Simple Queue Service) or Redis Streams between them. order-api publishes an event `{"product_id": "p1", "qty": 1}` to the queue. catalog-api (or a new `inventory-worker` service) consumes it and decrements stock. This eliminates the synchronous dependency and teaches async microservices patterns. Contrast: what happens to consistency when the worker is slow?

**Challenge 3 — Canary deploy one service via Argo Rollouts**  
Install Argo Rollouts alongside Argo CD. Convert `catalog-api`'s Deployment to a Rollout with a canary strategy: 10% traffic to new version, pause, check error rate (Golden Signal: errors < 1%), then promote to 100%. Practice `kubectl argo rollouts abort` on a bad deploy. This teaches progressive delivery — the skill that separates senior from mid-level DevOps engineers.
