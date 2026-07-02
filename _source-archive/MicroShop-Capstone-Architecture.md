# 🛒 MicroShop — Microservices Capstone (Interview-Grade)

> **Project:** Chhota e-commerce — **3 microservices + Redis + Postgres** on AWS, self-managed K8s, full Git→Production pipeline.
> **Kyun ye:** mehnat + full practice + sab concepts clear + **interview pe strong** (microservices, inter-service comm, observability — sab dikhata).
> **Region:** ap-south-1 · **Cost:** daily `terraform destroy` (~$0-5 total).

---

## 🎯 1. App kya karti

Ek mini online-shop:
```
User → Frontend (products dekho, order karo)
Frontend → Catalog API (product list/details)
Frontend → Order API (order place karo)
Order API → Catalog API (price/stock check)   ← INTER-SERVICE call (star feature)
Catalog API → Redis (fast product cache) + Postgres (products)
Order API → Postgres (orders)
```

### 3 Microservices:
| Service | Stateless? | Kaam | Tech |
|---------|-----------|------|------|
| **frontend** | ✅ | UI serve, API calls | Python FastAPI (ya simple HTML) |
| **catalog-api** | ✅ | products CRUD, cache | FastAPI + Redis + Postgres |
| **order-api** | ✅ | orders, catalog ko call | FastAPI + Postgres |

### 2 Data stores (stateful):
| Store | Kaam | Kahan |
|-------|------|-------|
| **Postgres** | products + orders (durable) | **RDS** (managed) |
| **Redis** | product cache (fast) | RDS-side ya cluster-pod (choose) |

---

## 🗺️ 2. Architecture (full)

```
                          🌍 INTERNET (users)
                                │ ingress (P8) / NodePort
                                ▼
              ┌──────────────── K8s CLUSTER (3 EC2) ──────────────┐
              │                                                    │
              │   [Service: frontend] → frontend pods ×2          │
              │            │                                       │
              │       ┌────┴─────────────┐                        │
              │   [Svc: catalog]    [Svc: order]                  │
              │    catalog pods ×2   order pods ×2                 │
              │        │    │            │    │                    │
              │   (DNS)│    │       (DNS)│    │ inter-service:     │
              │        │    │            └────┤ order→catalog      │
              │        ▼    ▼                 ▼                    │
              │    [Redis]  └──── :5432 ──────┴──→ (out to RDS)    │
              └────────────────────────────────────┬──────────────┘
                                                    │ :5432 private
                                          🗄️ RDS Postgres (AWS, stateful)
              📦 ECR (3 image repos)  ·  🪣 S3+DynamoDB (tfstate)
```

> 🔑 **Star = inter-service comm:** `order-api` calls `catalog-api` via **service DNS** (`catalog-api.default.svc.cluster.local`) — yahi "microservices" prove karta (M4 DNS bridge).

---

## 📂 3. Repo structure (mono-repo)

```
microshop/
├── services/
│   ├── frontend/    (main.py, Dockerfile, requirements.txt, test)
│   ├── catalog-api/ (main.py, Dockerfile, requirements.txt, test)
│   └── order-api/   (main.py, Dockerfile, requirements.txt, test)
├── infra/           (Terraform: VPC/EC2/RDS/ECR×3)
├── ansible/         (kubeadm cluster)
├── k8s/
│   ├── frontend-deployment.yaml + service.yaml
│   ├── catalog-deployment.yaml + service.yaml
│   ├── order-deployment.yaml + service.yaml
│   ├── redis.yaml
│   └── secret.yaml
├── argocd/          (3 Applications, ya 1 app-of-apps)
└── .github/workflows/ (ci.yml — matrix build for 3 services)
```

---

## 🗺️ 4. 8-Phase Plan (microservices version)

| Phase | Kaam | Module | Microservices twist | Deliberate break |
|-------|------|--------|---------------------|------------------|
| **P1** | Git mono-repo, 3 service folders, branching | M0/M6 | mono-repo layout | secret commit → rotate |
| **P2** | 3 Dockerfiles → 3 ECR repos (layer cache) | M3 | **3 images** | bad layer / wrong context |
| **P3** | Terraform: VPC/EC2/RDS/ECR×3, remote state | M1 | 3 ECR repos | state lock / wrong AZ |
| **P4** | Ansible: kubeadm cluster + Calico | M2 | (same) | SSH unreachable / swap |
| **P5** | Deploy all 3 + Redis, **inter-service DNS test** | M4 | **order→catalog call!** ⭐ | wrong service name → DNS fail |
| **P6** | GitHub Actions CI (**matrix** for 3 services, sha, manifest) | M6 | matrix build | hardcoded key / loop |
| **P7** | Argo CD (3 Applications / app-of-apps, selfHeal) | M7 | multi-app | manual kubectl → selfHeal |
| **P8** | Polish: ingress (path routes), monitoring (Prom/Grafana), HPA, limits, TLS | M8 | per-service routes + dashboards | OOM / no limits |

> 🔑 **Microservices = same 8 phases, par 3x** (har service ka apna image/deployment/service). Structure dohraana — par **inter-service call (P5) + matrix CI (P6) + multi-app Argo (P7)** = naye interview-gold concepts.

---

## 🎤 5. Interview talking points (ye project se)

- *"3-service microservices on self-managed K8s — **inter-service communication** via Kubernetes service DNS."*
- *"**Matrix CI** — ek workflow, 3 services build/push parallel."*
- *"**GitOps with Argo** — app-of-apps pattern, 3 services declaratively managed, self-heal + rollback."*
- *"**Observability** — Prometheus metrics, Grafana dashboards, Four Golden Signals per service."*
- *"**Stateful handling** — Postgres on RDS (managed), Redis cache, app tier fully stateless + auto-scaled (HPA)."*
- *"**Ingress** with path-based routing (`/`, `/catalog`, `/order`) + TLS."*

---

## ⚠️ 6. Scope discipline (taaki COMPLETE ho)
- **Ek service poora karo** (P1-P2) → phir agla. Sab parallel mat shuru.
- **Inter-service call (P5)** = star — ispe time do.
- **Daily `terraform destroy`** (cost).
- Phase fail/confuse → repeat (rule).
- Frontend ko **simple** rakho (HTML/JSON OK — UI fancy nahi, ops depth important).

---

## 🧵 7. Golden threads (is project mein)
1. **Reconciliation** — 3 Deployments self-heal, Argo 3 apps.
2. **State bahar → disposable** — 3 stateless services, state Redis+RDS mein.
3. **Preview before apply** — terraform plan, CI tests, argo diff.
4. **Push vs Pull** — Actions push, Argo pull (3 apps).
5. **Idempotent** — terraform, ansible, kubectl (3x).
6. **Service DNS** — inter-service glue (order→catalog).

---

> **Ye project = URL shortener se 3x mehnat, par 3x interview-value.** Microservices + inter-service comm + matrix CI + multi-app GitOps + observability = **mid/senior-level portfolio.** Complete karna = strong signal. 🚀
> Reference: [DevOps-Learning-Masterflow.md](DevOps-Learning-Masterflow.md) (bridges) · [Capstone-DeepDive-Internals.md](Capstone-DeepDive-Internals.md) (internals).
