# 🔧 Capstone Lab Gotchas — Real Production Learnings (P1–P8)

> Ye sab **asli lab mein hua** — textbook nahi, live AWS pe. Har gotcha = ek real failure + root cause + fix + lesson.
> Format: ❌ Symptom → 🔍 Root Cause → ✅ Fix → 💡 Lesson (interview-grade insight).

---

## 📦 P2 — Docker / ECR

### G1: `aws ecr get-login-password` — master node pe fail

- ❌ **Symptom:** `aws` command not found on master (EC2 node)
- 🔍 **Root cause:** AWS CLI alag install hoti hai — EC2 instance pe by default nahi. ECR login ke liye `aws ecr get-login-password` AWS CLI needs.
- ✅ **Fix:** Token **laptop pe generate** karo → output copy → master pe manually paste:
  ```bash
  # laptop pe
  aws ecr get-login-password --region ap-south-1 | docker login \
    --username AWS --password-stdin 336129194698.dkr.ecr.ap-south-1.amazonaws.com
  # token copy → master pe kubectl create secret docker-registry
  ```
- 💡 **Lesson:** Har node pe AWS CLI hona zaroori nahi — production mein **node IAM role** (instance profile) ya **pull-secret** better hai. ECR auth = short-lived token (~12 hours), rotate karna padta.

---

## 🏗️ P3 — Terraform / AWS

### G2: t3.micro vs t3.medium — free-tier trap

- ❌ **Symptom:** Terraform apply ke baad billing alert — t3.medium is NOT free tier eligible
- 🔍 **Root cause:** K8s minimum requirements `t3.medium` (2 vCPU, 4GB) — but **free tier = t3.micro only** (1 vCPU, 1GB)
- ✅ **Fix:** `instance_type = "t3.micro"` + `worker_count = 0` (single-node k3s instead of kubeadm) + **2GB swap** for k3s API server RAM
- 💡 **Lesson:** Always check free-tier eligibility BEFORE `terraform apply`. k3s = k3s (Rancher's lightweight K8s) = runs on 1GB RAM with swap. Production pe `kubeadm`, lab pe `k3s`.

### G3: RDS password — forbidden characters

- ❌ **Symptom:** Terraform RDS resource fails — `InvalidParameterValue: MasterUserPassword`
- 🔍 **Root cause:** RDS password mein `/`, `@`, `"`, space **forbidden** — AWS master password restriction
- ✅ **Fix:** Letters + numbers only: `"MicroShop2026Secret"` (no special chars)
- 💡 **Lesson:** Ye rule `terraform.tfvars` mein aata — **validate at boundary** (infra provisioning time). Production mein **Secrets Manager** (auto-rotate) use karo, tfvars mein hardcode mat.

### G4: `my_ip` IPv6 issue — SG rule broken silently

- ❌ **Symptom:** SSH timeout even though SG rule added with `my_ip = "$(curl ifconfig.me)/32"`
- 🔍 **Root cause:** `curl ifconfig.me` returned **IPv6 address** → SG IPv4 CIDR rule mein IPv6 → mismatch → timeout (no error, just silent)
- ✅ **Fix:** `curl -4 ifconfig.me` (force IPv4)
- 💡 **Lesson:** Security Group rules IPv4/IPv6 alag — IPv6 address IPv4 rule se match nahi karta. AWS CLI silent mein accept karta par traffic block hota.

---

## ☸️ P4/P5 — k3s Cluster

### G5: k3s API server TLS timeout — RAM OOM

- ❌ **Symptom:** `kubectl get nodes` → `TLS handshake timeout`; `sudo crictl ps | grep kube-apiserver` → blank (empty)
- 🔍 **Root cause:** t3.micro sirf **1GB RAM** — k3s API server (~500MB) + pods = OOM kill. Kernel ne k3s process maar diya.
- ✅ **Fix (do steps):**
  ```bash
  # Step 1: Swap add karo
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile

  # Step 2: k3s restart
  sudo systemctl restart k3s
  sleep 15
  kubectl get nodes  # Ready
  ```
- 💡 **Lesson:** k3s API server = single binary, but still needs ~500MB RAM. 1GB tight hai — **swap = lifeline** for lab. Production pe minimum 2GB RAM (t3.small+). Aur `fallocate` swap **reboot pe gayab** hota — persistence ke liye `/etc/fstab` mein add karo (see G6).

### G6: Swap reboot-persistence — fallocate trap

- ❌ **Symptom:** After EC2 reboot (stop/start), swap gone → k3s OOM again
- 🔍 **Root cause:** `sudo swapon /swapfile` = current session swap. **Reboot pe reset.** fstab mein nahi tha.
- ✅ **Fix (permanent swap):**
  ```bash
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  # Verify
  sudo swapon --show
  cat /etc/fstab | grep swap
  ```
- 💡 **Lesson:** `swapon` = one-time. `/etc/fstab` = permanent (har boot pe auto-mount). Production mein instance store ya EBS-backed swap configure karo.

### G7: Worker join — private IP, not public

- ❌ **Symptom:** Worker `K3S_URL=https://<PUBLIC_IP>:6443` → connection refused / TLS error
- 🔍 **Root cause:** K8s API server **private IP pe listen** karta within VPC. Public IP route VPC ke andar nahi jaata properly for node-to-node traffic.
- ✅ **Fix:** Master ka **private IP** use karo:
  ```bash
  # Master pe
  ip addr | grep 'inet ' | grep -v 127  # 10.0.x.x
  # Worker pe
  K3S_URL=https://10.0.1.30:6443 K3S_TOKEN="..." sh -
  ```
- 💡 **Lesson:** VPC ke andar nodes **private IP se baat** karte — public IP inbound traffic ke liye, node-to-node ke liye private. `kubectl get nodes -o wide` mein `INTERNAL-IP` wala use karo.

---

## 🔄 P6 — GitHub Actions CI

### G8: `update-manifests` job fail — `contents: write` missing

- ❌ **Symptom:** CI update-manifests job fails with `remote: Permission to repo.git denied to github-actions[bot]`
- 🔍 **Root cause (2 places):**
  1. `ci.yml` mein `permissions: contents: write` missing → GitHub token read-only by default
  2. GitHub repo Settings → Actions → General → **"Read and write permissions"** unchecked
- ✅ **Fix (dono jagah karo):**
  ```yaml
  # ci.yml mein
  permissions:
    contents: write
  ```
  + GitHub UI: `Settings → Actions → General → Workflow permissions → Read and write`
- 💡 **Lesson:** GitHub Actions GITHUB_TOKEN ka **minimum permission** hota by default — deliberately. Manifest update workflow ko Git push karna hai → **explicit write permission** required. Ye `secrets.GITHUB_TOKEN` alag hai — wo same token hai, par uski capabilities permission scope se control hoti.

### G9: `sed: No such file or directory` — naming mismatch

- ❌ **Symptom:** `sed: can't read k8s/catalog-api.yaml: No such file or directory`
- 🔍 **Root cause:** Manifest files `catalog.yaml` / `order.yaml` named the, par CI loop mein service names `catalog-api` / `order-api` use ho rahe the:
  ```bash
  for svc in catalog-api order-api frontend; do
    sed -i "..." k8s/$svc.yaml   # expects catalog-api.yaml
  ```
- ✅ **Fix:** Rename manifests to match service names exactly:
  ```bash
  mv k8s/catalog.yaml k8s/catalog-api.yaml
  mv k8s/order.yaml k8s/order-api.yaml
  git add -A && git commit -m "fix: rename manifests to match service names"
  ```
- 💡 **Lesson:** CI script aur file names mein **exact match** zaroori. Convention: `k8s/<service-name>.yaml` where `<service-name>` == Docker image name == matrix service name == K8s deployment name. Ek jagah badla → sab jagah badlo.

### G10: CI manifest-update loop — `[skip ci]` + paths filter

- ❌ **Symptom (potential):** CI triggers khud apne manifest commit pe → infinite loop
- 🔍 **Root cause:** CI pushes `ci: update images to $SHA` commit → wo push phir CI trigger → phir update → loop
- ✅ **Fix (2-layer defense):**
  ```yaml
  # Layer 1: path filter (sirf services/** trigger)
  on:
    push:
      paths: ['services/**']

  # Layer 2: commit message skip
  git commit -m "ci: update images to $SHA [skip ci]"
  ```
- 💡 **Lesson:** `paths` filter = **structural** (manifest changes services/** se nahi, k8s/** se hain). `[skip ci]` = **explicit bailout** (agar path filter kabhi miss kare). Do layers better than one.

### G11: Matrix CI — parallel builds cost & speed

- 💡 **Concept:** Matrix strategy = **1 job definition, N parallel executions**:
  ```yaml
  strategy:
    matrix:
      service: [catalog-api, order-api, frontend]
  # → 3 runners start simultaneously, independent
  # Wall-clock = max(slowest service), not sum(all services)
  ```
- **vs Sequential:** 3 builds sequential = 3× slow. Matrix = parallel = **3× faster** (same total compute, less wall-clock).
- **Interview Q:** *"3 Docker images build karne ka best CI pattern?"* → Matrix build — fan-out to N runners, `needs:` se sync.

---

## 🐙 P7 — Argo CD / GitOps

### G12: Argo CD on t3.micro — RAM pressure

- ❌ **Symptom:** Argo pods slow to start / Pending; kubectl commands slow/timeout
- 🔍 **Root cause:** Argo CD is heavy (~1GB RAM total for all components: server, repo-server, application-controller, redis, dex). t3.micro 1GB + 2GB swap = tight
- ✅ **Fix:** Swap ensure karo (G5/G6) + patience. Production mein **minimum 2-4GB RAM** for Argo.
- 💡 **Lesson:** Argo CD production install = 6-7 pods. Lab mein swap-backed chalata hai. Free-tier pe "it works" = demo-grade. Production = separate namespace, resource limits, HA mode.

### G13: `--validate=false` — API server under stress

- ❌ **Symptom:** `kubectl apply -f argocd/application.yaml` → `TLS handshake timeout` during validation
- 🔍 **Root cause:** K8s API server validation step (openapi schema fetch) takes time/resources when API server is under load
- ✅ **Fix:** `kubectl apply -f argocd/application.yaml --validate=false` — skips server-side validation
- 💡 **Lesson:** `--validate=false` tab use karo jab API server chal raha ho par slow ho. Ye **workaround**, not best practice — production mein validation ON rahna chahiye.

### G14: selfHeal — Git ka wapas aana

- 💡 **Live demo recap:**
  ```bash
  # Drift create kiya
  kubectl scale deployment catalog-api --replicas=3   # Git mein replicas:1

  # Argo ne 30s mein detect kiya → OutOfSync
  # selfHeal=true → automatically reverted to replicas:1
  ```
- **What happened internally:**
  1. Argo App Controller → watches cluster state
  2. Cluster state ≠ Git state (OutOfSync)
  3. `selfHeal: true` → Argo applies Git manifest → back to 1 replica
- **Interview Q:** *"koi developer ne prod pe galti se kubectl scale kar diya — automate kaise rokein?"*
  → Argo CD + `selfHeal: true`. Git = source of truth. Manual change → auto-revert.

### G15: Pull vs Push model — GitOps ka core

```
PUSH (old way):                          PULL (GitOps — Argo):
CI → (has cluster creds) → kubectl       CI → Git manifest update
     ← risky: creds expose,                    ↓
       CI compromised = cluster gone     Argo → watches Git
                                              → pulls + applies
                                              ← safer: creds cluster-side,
                                                CI never touches cluster
```
- **Push = CI needs cluster access** (secret management burden, blast radius if CI compromised)
- **Pull = Argo inside cluster watches Git** (cluster creds never leave cluster, immutable audit trail in Git)
- **Ye MicroShop mein:** CI → `k8s/*.yaml` update → Git → Argo pull → cluster sync ✅

---

## 🚀 billfree-techops — Live kubeadm Deploy (P8, real session)

> Ye sab **aaj live hua** — Terraform se kubeadm cluster (1 control-plane + 2 workers, t3.medium/large)
> khada karke, ArgoCD GitOps se 6 microservices + Postgres + Redis + web deploy kiya, aur browser tak pahunchaya.

### G16: SSH/6443 "Connection refused" — SG purane (rotated) IP pe locked

- ❌ **Symptom:** `ssh` (22) aur `kubectl` (6443) dono → **"Connection refused"** (timeout nahi). Pehle scp chala, baad mein refused.
- 🔍 **Root cause:** `ssh_allowed_cidr` / `api_allowed_cidr` SG mein **apply-time ke IP** (`157.49.x`) pe locked the. Mobile/dynamic ISP ne **public IP rotate** kar diya → naya IP SG list mein nahi → block. CGNAT pe block **RST** ban ke aaya (isliye "refused", silent timeout nahi). Upar se `curl ifconfig.me` ne **IPv6** diya — asli IPv4 chhupa.
- ✅ **Fix:**
  ```bash
  curl -s -4 ifconfig.me            # asli current IPv4
  # infra/terraform/terraform.tfvars: ssh_allowed_cidr/api_allowed_cidr → naya /32 (ya temp 0.0.0.0/0)
  terraform apply                   # sirf SG rule update, instances waise hi (IP same)
  ```
- 💡 **Lesson:** "My IP" pe SG lock karna → ISP IP rotate kare toh toot-ta. Diagnose: **current source IP vs SG rule** compare karo. **timeout = SG ne drop kiya** (silent); **refused/RST = host tak pahuncha par port band / CGNAT reset**. Real prod: home-IP /32 nahi — **bastion / VPN / SSM Session Manager**. (Related: [[G4]] IPv6 trap.)

### G17: `kubectl` → `localhost:8080 connection refused` (kubeconfig hi nahi)

- ❌ **Symptom:** master pe `kubectl get nodes` → `dial tcp 127.0.0.1:8080: connection refused`
- 🔍 **Root cause:** kubectl ko **koi kubeconfig nahi mila** → default purane insecure port **localhost:8080** pe gir gaya (jahan kuch nahi). `ubuntu` user ke `~/.kube/config` set nahi tha.
- ✅ **Fix (standard kubeadm post-init step):**
  ```bash
  mkdir -p $HOME/.kube
  sudo cp /etc/kubernetes/admin.conf $HOME/.kube/config
  sudo chown $(id -u):$(id -g) $HOME/.kube/config
  kubectl get nodes
  ```
- 💡 **Lesson:** `localhost:8080` = "kubectl ko config nahi mila" ka pakka signal. `admin.conf` (kubeadm-generated) ko `~/.kube/config` mein copy. kubectl ek **client** hai — kahin se bhi chal sakta valid kubeconfig ke saath; cluster pe hona zaroori nahi. (Interview mein bahut aata.)

### G18: `postgres-0` hamesha `Pending` — kubeadm pe default StorageClass nahi

- ❌ **Symptom:** `postgres-0 0/1 Pending`; DB-dependent services (ticket/analytics/calllog/report) `0/1` (readiness fail). `kubectl get pvc` → `data-postgres-0 Pending`; `kubectl get sc` → **khaali**.
- 🔍 **Root cause:** StatefulSet ka `volumeClaimTemplate` bina `storageClassName` ke PVC maangta → **default SC** chahiye. Fresh **kubeadm cluster mein koi default SC / dynamic provisioner nahi hota** (managed EKS/GKE mein hota). PVC unbound → pod Pending.
- ✅ **Fix:**
  ```bash
  kubectl apply -f https://raw.githubusercontent.com/rancher/local-path-provisioner/v0.0.30/deploy/local-path-storage.yaml
  kubectl patch storageclass local-path -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'
  # purani Pending PVC default SC retroactively pick nahi karti → recreate karwao:
  kubectl -n billfree delete pvc data-postgres-0
  kubectl -n billfree delete pod postgres-0     # StatefulSet dono dobara banata
  ```
- 💡 **Lesson:** PVC Pending → **pehle `kubectl get sc`** dekho. SC nahi = dynamic storage nahi. `local-path` = node-ki-local-disk (single cluster ke liye theek; HA nahi). **Pehle se bani PVC baad mein add hue default SC se bind nahi hoti — recreate.** Prod: cloud pe **EBS CSI driver**.

### G19: Ingress pe raw IP → "404 Not Found / nginx" (host-based routing)

- ❌ **Symptom:** Browser mein `http://<node-ip>` → **"404 Not Found, nginx"**. Saare app pods `1/1 Running`.
- 🔍 **Root cause:** ingress-nginx **Host header** se route karta. Raw IP pe koi hostname match nahi → default backend → **404**. (Yeh 404 actually **proof hai ki ingress zinda hai**.) Browser ne `https` pe force bhi kiya (TLS cert nahi).
- ✅ **Fix:** hostname ko node-public-IP pe map karo + `http` use karo:
  ```bash
  # laptop /etc/hosts (Windows: C:\Windows\System32\drivers\etc\hosts, admin)
  <node-public-ip>  billfree.example api.billfree.example
  # browser: http://billfree.example   (https nahi)
  # isolate test: curl -H "Host: billfree.example" http://<node-ip>/ -I  → 200
  ```
- 💡 **Lesson:** **"IP pe 404 nginx" = ingress up hai, bas hostname match nahi hua.** Ingress = L7 host/path routing. Lab mein DNS nahi → `/etc/hosts`. Prod: asli DNS (Route 53) → node/LB. App-serving vs browser/DNS issue alag karne ke liye **`curl -H "Host:"`** sabse pehla tool.

---

## 🧵 Connection Map — Ye Sab Kaise Jud-te

```
Code change (services/**)
        │
        ▼ GitHub Actions triggered (path filter)
   Matrix build (G11)
   3 services parallel → ECR (SHA tag)
        │
        ▼ update-manifests job (needs: build-push)
   k8s/*.yaml → image tag update (G8: write permission, G9: filename match)
   git commit "[skip ci]" (G10: loop prevention)
        │
        ▼ Argo CD polling Git (30s interval)
   OutOfSync detected → apply → Synced
        │
        └─► selfHeal (G14) — drift detected → Git wala wapas

   Cluster health:
   k3s API server (G5/G6: swap) → Running
   Worker join (G7: private IP) → 2 nodes
   ECR pull (G1: pull-secret) → images available
```

---

## 📋 Quick Troubleshoot Reference

| Symptom | Check | Fix |
|---------|-------|-----|
| `TLS handshake timeout` | `free -h` (RAM?) | `sudo swapon /swapfile && sudo systemctl restart k3s` |
| CI push fails "Permission denied" | `permissions:` in yaml + repo settings | Add `contents: write` in both places (G8) |
| `sed: No such file` in CI | manifest filenames | Rename k8s/*.yaml to match service names (G9) |
| Argo App OutOfSync → not self-healing | `selfHeal: true` in application.yaml | Check `kubectl describe application -n argocd` |
| Worker can't join cluster | Using public IP? | Use master's private IP `10.0.x.x` (G7) |
| ECR pull fails on node | pull-secret | `kubectl get secret ecr-secret` — recreate if expired (G1) |
| Swap gone after reboot | `/etc/fstab` | `echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab` (G6) |
| RDS connection refused | SG + password chars | Letters+numbers only in password, SG :5432 self-rule (G3) |
| SSH/6443 "Connection refused" | `curl -4 ifconfig.me` vs SG rule | IP rotate hua — tfvars CIDR update + `terraform apply` (G16) |
| `kubectl` → `localhost:8080` refused | `~/.kube/config` hai? | `cp /etc/kubernetes/admin.conf ~/.kube/config` (G17) |
| pod/PVC `Pending` | `kubectl get sc` (khaali?) | local-path provisioner + default SC + PVC recreate (G18) |
| Ingress IP pe "404 nginx" | Host header bhej rahe? | `/etc/hosts` hostname map + `http://` (G19) |

---

> **Lab se seekhna = textbook se better.** Ye 19 gotchas = real prod failures compressed. Interview mein "kisne galti ki aur kyun fix kiya" — ye stories hain. Sirf theory nahi, **lab war stories.** 🏆
