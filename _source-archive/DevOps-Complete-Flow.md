# 🌐 DevOps — Complete End-to-End Flow (Git → Production)

> **Ek nazar mein poora picture:** Git → GitHub → Actions → Terraform → Ansible → Docker → Kubernetes → GitOps (Argo CD).
> **Soch:** 2 alag timelines hain — 🏗️ **SETUP** (ek baar, kabhi-kabhi) + 🔄 **DELIVERY** (har code push pe). Inhe mat milao.

---

## 🧭 Sabse pehle — Mental Model (2 phases)

```
┌──────────────────────────────────────────────────────────────────┐
│  PHASE A — 🏗️ SETUP (ek baar banao, kabhi-kabhi chhedo)            │
│  "Ghar + kitchen taiyaar karo"                                     │
│                                                                    │
│     Terraform  ──►  Ansible                                        │
│     (infra)        (cluster setup)                                 │
│     EC2,VPC,RDS    kubeadm se K8s banao                            │
└──────────────────────────────────────────────────────────────────┘
                          ⬇️  (cluster ab READY — ek baar ka kaam)
┌──────────────────────────────────────────────────────────────────┐
│  PHASE B — 🔄 DELIVERY (har code push pe, roz-roz, automatic)      │
│  "Dish banao + serve karo, baar baar"                              │
│                                                                    │
│   Git ──► GitHub Actions ──► Docker image ──► Git(manifest) ──►    │
│   push    (CI: build/test)    (ECR push)      update             │
│                                                  ⬇️                 │
│                                       Argo CD (CD: pull+deploy)    │
│                                                  ⬇️                 │
│                                          Kubernetes (runtime)      │
└──────────────────────────────────────────────────────────────────┘
```

> 🔑 **Crux:** Terraform + Ansible = **neev** (ek baar). Git→Actions→Docker→Argo→K8s = **rozaana delivery** (har push). Niche dono detail mein.

---

## 🏗️ PHASE A — SETUP (one-time / rare)

```
 👨‍💻 Platform engineer
        │
        │ 1. terraform apply
        ▼
┌───────────────────────┐
│   TERRAFORM 🏗️         │   « Infra banao (declarative, state) »
│   ───────────────────  │
│   • VPC + subnets      │   ➜ AWS pe khaali machines + network + DB
│   • EC2 (1 master,     │      khade ho jaate
│     2 workers)         │   📌 USE CASE: "zameen + building" — raw infra
│   • RDS (Postgres)     │   🔁 KAB: ek baar (ya infra badle tab)
│   • ECR (registry)     │   💾 State: S3 + lock (team-safe)
└──────────┬────────────┘
           │ output: master_ip, worker_ips, rds_endpoint, ecr_url
           ▼
┌───────────────────────┐
│   ANSIBLE 🔧           │   « Machines ke ANDAR setup (agentless, idempotent) »
│   ───────────────────  │
│   • containerd install │   ➜ Raw EC2 → working Kubernetes cluster
│   • kubeadm init       │   📌 USE CASE: "kitchen mein stove-masale" — config
│     (master)           │   🔁 KAB: ek baar (cluster banane pe)
│   • workers join       │   📤 PUSH model: control node se SSH
│   • Calico (network)   │
└──────────┬────────────┘
           ▼
   ✅ Kubernetes CLUSTER READY (3 nodes, master tainted, workers ready)
   ── Ab ye cluster mahino chalega; har deploy pe dobara nahi banta ──
```

> 💬 **Comment:** Phase A "**Pets**" jaisा socho — soch-samajh ke, kabhi-kabhi. Terraform infra ka **kya exist kare** decide karta, Ansible uske **andar kya ho** decide karta. (M1 + M2)

---

## 🔄 PHASE B — DELIVERY (har push, automatic)

```
 👨‍💻 Developer
      │
      │ 1. git push  (sirf yahi manual — baaki sab automatic ⚡)
      ▼
┌──────────────┐
│  GIT/GitHub 📦│  « code + manifests + workflow ka ghar »
│  branch/PR    │  📌 USE CASE: version control, collaboration, SOURCE OF TRUTH
└──────┬───────┘
       │ push event (on: push: branches:[main])
       ▼
┌─────────────────────────────────────────────┐
│  GITHUB ACTIONS 🔄  (CI — PUSH model, bahar)   │
│  ─────────────────────────────────────────   │
│  Step 1: pytest            ← test gate 🚦      │   📌 USE CASE: build/test
│  Step 2: docker build      ← image banao 🐳    │      automate, image ready
│  Step 3: docker push ECR   ← registry pe ⬆️    │   🔁 KAB: har main-push
│  Step 4: deployment.yaml mein naya SHA tag     │   🔑 Cluster access: NAHI
│          likho + git commit + git push         │      (sirf Git update)
└──────────────────┬──────────────────────────┘
                   │ (Git mein image tag badla)
                   ▼
        ┌────────────────────────┐
        │  GIT (deployment.yaml)  │  ◄── 🤝 HANDSHAKE / SOURCE OF TRUTH
        │  image: ...:f9e8d7      │      (Actions likhti, Argo padhti)
        └───────────┬────────────┘
                    │ Argo watch kar rahi (pull)
                    ▼
┌─────────────────────────────────────────────┐
│  ARGO CD 🐙  (CD — PULL model, cluster ANDAR)  │
│  ─────────────────────────────────────────   │
│  • Git padho:    desired = f9e8d7             │   📌 USE CASE: auto-deploy +
│  • cluster dekho: actual = a1b2c3 (purana)    │      drift-proof + rollback
│  • MISMATCH → kubectl apply (khud)            │   🔁 KAB: Git change pe (+loop)
│  • selfHeal: manual change → Git wapas        │   🔑 Cluster access: HAI (andar)
└──────────────────┬──────────────────────────┘
                   ▼
┌─────────────────────────────────────────────┐
│  KUBERNETES ☸️  (Runtime — jahaan app chalti)  │
│  ─────────────────────────────────────────   │
│  Deployment 👔 → ReplicaSet → Pod 🍱 → app 🍛 │   📌 USE CASE: run + self-heal
│  Service ☎️ → stable IP + load balance         │      + scale + orchestrate
│  Reconciliation: pod mara → naya (desired=N)   │   🔁 KAB: 24/7 chalta
│  HPA: load↑ → pods↑   ·   probes: ready? heal? │
└─────────────────────────────────────────────┘
                   ▼
              🎉 Naya version LIVE
       (Developer ne sirf `git push` kiya tha)
```

> 💬 **Comment:** Phase B "**Cattle**" jaisा — automatic, disposable, baar-baar. Insaan ka kaam = **1 command (`git push`)**. Test→image→registry→manifest→deploy sab machine karti.

---

## 🔁 PUSH vs PULL — kahan kaunsa (yaad rakhne ka naqsha)

| Tool | Model | Kaun trigger/move karta |
|------|-------|--------------------------|
| **Ansible** | 📤 PUSH | Control node SSH se servers pe daalta |
| **GitHub Actions** | 📤 PUSH | Code push event → workflow chalta |
| **Argo CD** | 📥 PULL | Argo khud Git se kheech ke deploy karti |

> 🔑 Actions (push) **Git mein likhti** → Argo (pull) **Git se padhti** → beech mein **Git = sach.**

---

## 🧩 Har tool ka 1-line role (TL;DR)

| # | Tool | 1-line role | Phase |
|---|------|-------------|-------|
| 1 | **Git/GitHub** | code + config + source of truth | dono |
| 2 | **GitHub Actions** | CI: build, test, image, manifest update (push) | B |
| 3 | **Terraform** | infra banao: VPC/EC2/RDS/ECR (IaC, state) | A |
| 4 | **Ansible** | machine ke andar setup: kubeadm cluster (agentless) | A |
| 5 | **Docker** | app ko image mein pack (layers, cache) | B |
| 6 | **Kubernetes** | run+heal+scale (reconciliation, Deployment/Service) | B |
| 7 | **Argo CD** | CD: Git se cluster deploy (pull, selfHeal, rollback) | B |

---

## 🎬 Real Use-Case Story (sab ek saath)

> **Din 1 (setup):** Tu `terraform apply` chalata → AWS pe 3 EC2 + RDS + ECR + VPC ban-te. Phir `ansible-playbook` → un EC2 ko kubeadm se **K8s cluster** bana deta. Argo CD cluster mein install. **Cluster ready — ye ab mahino chalega.**
>
> **Din 2+ (rozaana):** Tu app mein feature add karta, `git push` karta. **Bas.**
> - GitHub Actions: test paas → Docker image (`:sha`) → ECR push → `deployment.yaml` mein naya tag → git push.
> - Argo CD: Git mein tag badla dekha → cluster pe naya pod deploy → purana hata. App **live**.
> - Bug nikla? `git revert && git push` → Argo purana wapas. **Rollback done.**
> - Kisi ne `kubectl` se chhed-chhad ki? Argo (selfHeal) Git wala wapas. **Drift-proof.**
>
> **Natija:** Developer sirf `git push` karta — infra fixed, delivery automatic, sab Git se traceable. **Yahi modern DevOps.** 🚀

---

## ⚠️ Common Traps (is flow mein)
- **Terraform state laptop pe** → team mein duplicate/corrupt. → S3 + lock.
- **`latest` image tag** → kaunsi version pata nahi. → `github.sha`.
- **AWS key code mein** → leak. → GitHub Secrets.
- **CI manifest-push → loop** → `paths:['app/**']` ya `[skip ci]`.
- **`kubectl` se manual fix (selfHeal on)** → Argo undo kar degi. → Git badlo.
- **Master pe app pod** → taint rokta. Workers pe chalte.

---

> Ye file recall ke liye — poore bootcamp ka "kaise sab judta hai" wala glue. Detail har module ke notes mein ([DevOps-Bootcamp-Notes.md](DevOps-Bootcamp-Notes.md)).
