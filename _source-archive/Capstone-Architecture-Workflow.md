# 🏗️ Capstone Architecture & Workflow — URL Shortener (Complete Blueprint)

> **Project:** URL Shortener (FastAPI + Postgres) on AWS, self-managed Kubernetes, Git→Production.
> **Ye doc:** poora system architecture + har component + networking + security + data-flow + end-to-end workflow. Har M0–M9 concept yahaan **asal mein** jud-ta hai.
> **Region:** ap-south-1 (Mumbai) · **Cost:** ~$2-3/day → daily `terraform destroy`.

---

## 🎯 1. App kya karti (the product)

```
POST /shorten  {"url":"https://very-long-url.com/x"}  →  {"short":"abc123"}
GET  /abc123                                          →  redirect to long URL
GET  /health                                          →  {"status":"ok"}   (K8s probe)
```
- **Stateless API** (FastAPI) — koi data app mein nahi → **K8s ke liye perfect** (cattle, scale, self-heal).
- **Stateful DB** (Postgres/RDS) — saare URLs yahaan → **managed, backed-up.**
- 🧵 **M0 thread:** *stateless app + stateful DB = state bahar → app disposable.*

---

## 🗺️ 2. FULL SYSTEM ARCHITECTURE (one diagram)

```
                          🌍 INTERNET (users)
                                │
                                ▼
              ┌─────────────────────────────────────────┐
              │           AWS  (ap-south-1)               │
              │  ┌─────────────────────────────────────┐ │
              │  │  VPC  10.0.0.0/16                     │ │
              │  │                                       │ │
              │  │  ┌── Public Subnet (10.0.1.0/24) ──┐  │ │
              │  │  │                                  │  │ │
              │  │  │  🖥️ EC2 master  (t3.medium)      │  │ │
              │  │  │     control-plane (tainted 🚷)   │  │ │
              │  │  │  🖥️ EC2 worker-0 (t3.medium)     │  │ │
              │  │  │  🖥️ EC2 worker-1 (t3.medium)     │  │ │
              │  │  │     │  pods chalte (Calico CNI)  │  │ │
              │  │  │     │  NodePort :30080            │  │ │
              │  │  └─────┼────────────────────────────┘  │ │
              │  │        │ :5432 (private)               │ │
              │  │  ┌── Subnet-A + Subnet-B (RDS needs 2 AZ)│ │
              │  │  │  🗄️ RDS Postgres (db.t3.micro)    │  │ │
              │  │  │     STATEFUL · publicly_accessible=false│
              │  │  └──────────────────────────────────┘  │ │
              │  │                                       │ │
              │  │  Security Group: 22(SSH/my-IP) ·      │ │
              │  │   6443(k8s-api) · 30000-32767(NodePort)│ │
              │  │   · 5432(DB self) · all-internal-self  │ │
              │  └─────────────────────────────────────┘ │
              │  📦 ECR (private Docker registry)          │
              │  🪣 S3 (tfstate) + 🔒 DynamoDB (lock)       │
              └─────────────────────────────────────────┘
```

**Component → kyun (M-module):**
| Component | Kya | Module |
|-----------|-----|--------|
| **VPC + Subnets** | network isolation (2 AZ RDS ke liye) | M1 |
| **EC2 ×3** | 1 master + 2 worker (self-managed K8s) | M1, M4 |
| **RDS Postgres** | stateful DB (managed, backed-up) | M0, M5 |
| **ECR** | private Docker image registry | M3 |
| **S3 + DynamoDB** | remote tfstate + lock (team-safe) | M1 |
| **Security Group** | firewall (kaunsa port kisko khula) | M1, M8 |

---

## 🔌 3. NETWORKING & PORTS (kaun kisse baat karta)

```
User ─HTTP→ Worker EC2 :30080 (NodePort) ─→ Service ─→ Pod :8000 (FastAPI)
                                                          │
                                              Pod ─:5432→ RDS Postgres (private)

Admin ─SSH :22→ master EC2 (sirf YOUR_IP se)
Worker ─:6443→ master (k8s API, internal)
Pods ─Calico→ Pods (cross-node networking, CNI)
```
- **NodePort :30080** = self-managed K8s ka "darwaza" (EKS hota to LoadBalancer milta). M4.
- **RDS private** (`publicly_accessible=false`) — sirf cluster se reachable, internet se nahi. 🔐 M8 least-privilege.
- **SG ingress 22 sirf YOUR_IP** — SSH poori duniya ko nahi. M8.

---

## 🔄 4. END-TO-END DELIVERY WORKFLOW (the money flow)

```
👨‍💻 DEV: code badla → git push (main)        ← sirf yahi MANUAL
        │
        ▼
🔄 GITHUB ACTIONS (CI — push model, M6)
   ├─ pytest (test gate 🚦)
   ├─ docker build -t $ECR:$GIT_SHA ./app   (layer cache, M3)
   ├─ docker push $ECR:$GIT_SHA             (ECR, M3)
   └─ sed deployment.yaml → image:$GIT_SHA  → git commit + push  (manifest-update)
        │   (paths:['app/**'] → loop se bacho, M6)
        ▼
📖 GIT (k8s/deployment.yaml — naya SHA)     ← SOURCE OF TRUTH 🤝
        │
        ▼ (Argo watch — pull model, M7)
🐙 ARGO CD (CD — cluster ke andar)
   ├─ Git padho: desired = new SHA
   ├─ cluster dekho: actual = old SHA  → OutOfSync
   ├─ kubectl apply (khud)  → naya ReplicaSet, rolling update (M4)
   └─ selfHeal: drift → Git wapas
        │
        ▼
☸️ KUBERNETES (runtime, M4)
   Deployment → ReplicaSet → Pod ×2 → FastAPI container
   readiness/liveness probe (/health) → ready pods ko Service traffic
   Service (NodePort) → load balance → pods
   reconciliation: pod mara → naya · HPA: load↑ → pods↑
        │
        ▼
   🎉 naya version LIVE — dev ne sirf git push kiya tha
```

---

## 🏗️ 5. SETUP WORKFLOW (one-time, before delivery)

```
👨‍💻 terraform apply (M1)
   └─ S3 backend + lock → VPC → subnets → IGW → route → SG
      → EC2 ×3 → RDS → ECR    (infra ready, ~5 min)
        │ outputs: master_ip, worker_ips, rds_endpoint, ecr_url
        ▼
👨‍💻 ansible-playbook (M2 — agentless, SSH)
   ├─ 1-common.yml  : sab nodes — containerd + kubeadm + kubelet
   ├─ 2-master.yml  : kubeadm init + Calico + join-command banao
   └─ 3-workers.yml : workers ko cluster mein join karo
        │
        ▼
   ☸️ K8s CLUSTER READY (3 nodes) + Argo CD install
   ── ye mahino chalega; har deploy pe dobara nahi ──
```
> 🧵 **2 phases (M-recall):** 🏗️ SETUP (Terraform+Ansible, ek baar, "Pets") vs 🔄 DELIVERY (Git→Actions→Docker→Argo→K8s, har push, "Cattle").

---

## 📂 6. REPO STRUCTURE (sab ek jagah)

```
url-shortener/
├── app/
│   ├── main.py              # FastAPI (/shorten, /{code}, /health)
│   ├── requirements.txt     # deps (fastapi, uvicorn, psycopg2)
│   ├── Dockerfile           # deps UPAR, code NEECHE (M3 cache)
│   └── test_main.py         # pytest (CI gate, M6/M8)
├── infra/                   # Terraform (M1)
│   ├── main.tf · variables.tf · outputs.tf · backend.tf
├── ansible/                 # Config (M2)
│   ├── inventory.ini · 1-common.yml · 2-master.yml · 3-workers.yml
├── k8s/                     # Manifests (M4)
│   ├── deployment.yaml      # replicas:2, probes, resources, secretRef
│   ├── service.yaml         # NodePort :30080
│   └── secret.yaml          # DB password (M8 — base64≠encrypted!)
├── argocd/
│   └── application.yaml     # selfHeal:true, prune:true (M7)
├── .github/workflows/
│   └── ci.yml               # test→build→push→manifest-update (M6)
└── .gitignore               # .env, *.tfstate*, __pycache__ (M1, M8)
```

---

## 🛡️ 7. SECURITY & RELIABILITY (M8 layered)

| Layer | Kya | Module |
|-------|-----|--------|
| **Secrets** | DB pass → K8s Secret (+encryption-at-rest), code mein never | M8 |
| **Least privilege** | RDS private, SG sirf zaroori ports, IAM scoped | M8 |
| **tfstate** | S3 (encrypted) + lock, Git mein never (plaintext secrets!) | M1 |
| **Image tag** | `git-sha` (immutable), latest never | M3 |
| **Probes** | readiness (traffic gate) + liveness (restart) | M4 |
| **Self-heal** | Deployment (pod) + Argo (drift) | M4, M7 |
| **Rollback** | `git revert` → Argo redeploys | M7 |
| **Resource limits** | requests/limits (OOM/throttle se bacho) | M5 |
| **Backup/DR** | RDS automated backups (RPO/RTO) | M8 |

---

## 🗺️ 8. 8-PHASE BUILD ORDER (mirror M1–M7)

| Phase | Kaam | Module | Deliberate break |
|-------|------|--------|------------------|
| **P1** | Git + branching + .gitignore | M0/M6 | secret commit → rotate |
| **P2** | Docker + ECR (layer cache, sha) | M3 | bad layer order / build context |
| **P3** | Terraform (VPC/EC2/RDS/ECR, remote state) | M1 | state lock / wrong AZ |
| **P4** | Ansible (kubeadm: common/master/workers + Calico) | M2 | SSH unreachable / swap on |
| **P5** | Manual deploy (probes, NodePort, prove self-heal+scale) | M4 | wrong label → no traffic |
| **P6** | GitHub Actions CI (secrets, sha, manifest-update) | M6 | hardcoded key / loop |
| **P7** | Argo CD (Application, selfHeal, rollback) | M7 | manual kubectl → selfHeal undo |
| **P8** | Polish (tests, branch-protection, limits, ingress+TLS) | M8 | OOM / no limits |

---

## 🧵 9. GOLDEN THREADS in this project (sab jud-te)

1. **Reconciliation** — Terraform(state), K8s(pods), Argo(Git↔cluster) sab maintain karte.
2. **State bahar → disposable** — app stateless, DB=RDS, tfstate=S3, pods=cattle.
3. **Preview before apply** — `terraform plan`, CI test gate, Argo dry preview.
4. **Push vs Pull** — Actions push (Git update), Argo pull (deploy).
5. **Idempotent** — terraform apply, ansible playbook, kubectl apply.

---

## ⚠️ 10. PRODUCTION LANDMINES (is project mein dhyaan, M9)

- 🔴 **Daily `terraform destroy`** — warna bill ($73/month agar chhoda).
- 🔴 **Blast radius:** `terraform destroy` = poora infra; double-check directory.
- 🔴 **Secret in Git** = rotate immediately (P1 break).
- 🔴 **`latest` tag** = never; sha use.
- 🔴 **`kubectl edit`** = Argo selfHeal undo karegi; Git badlo.
- 🔴 **Friday deploy** = avoid.

---

> **Ye blueprint = poora bootcamp ek project mein.** Har box ek module hai, har arrow ek concept. Build karte waqt isे dekhte raho — "main abhi kahan hoon, kya jud raha." 🚀
> Reference commands: [capstone-project-guide.md](../../Downloads/capstone-project-guide.md) · Concepts: [DevOps-Field-Manual.md](DevOps-Field-Manual.md)
