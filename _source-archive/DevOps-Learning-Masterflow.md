# 🎓 DevOps Learning Masterflow — Sab Kuch Jud Jaaye

> **Ye doc sabse zaroori.** Baaki docs reference hain — ye **LEARNING-LOGIC** mein chalta: simple→complex, har tool ke baad "ye agle ko KYA deta" (bridge/handoff). Padh ke **sab connect** ho jaayega.
> **Spine:** ek restaurant chain (= teri app, live for users). **Rule:** har tool ek dish-pipeline ki ek kadi, aur **har kadi agli ko kuch HANDOFF karti** — wahi "connection" hai.

---

# 🧠 PART 0 — Mental Model (sabse pehle ye)

## 2 alag timelines (inhe MAT milao):
```
🏗️ SETUP (ek baar)          →  building + kitchen banao
🔄 DELIVERY (har push)       →  dish banao + serve, baar-baar
```
| | SETUP | DELIVERY |
|--|-------|----------|
| Tools | Terraform → Ansible | Git→Actions→Docker→Argo→K8s |
| Frequency | ek baar (ya infra badle) | har code change |
| Pets/Cattle | Pet 🐶 (soch-samajh) | Cattle 🐄 (automatic) |
| Restaurant | building khadi karna | roz dish serve karna |

> 🔑 **Sabse badi galti jo "connect nahi hone" deti:** Terraform/Ansible ko delivery ke saath mila dena. Wo **SETUP** hai (ek baar). Inhe alag rakho → aadha confusion khatam.

---

# 🔗 PART 1 — Tools, Learning Order Mein (+ har ka HANDOFF)

> Har tool 3 cheez se samjho: **(a) input kya leta · (b) kaam kya · (c) agle ko KYA deta (handoff).** Handoff = bridge.

## 1️⃣ Git/GitHub 📖 — sab ka ghar
- **Input:** tera code + config (Dockerfile, k8s YAML, ci.yml).
- **Kaam:** version control + **source of truth** (sach yahaan).
- **Handoff → Actions:** `git push` ek **event** banata jo Actions ko jagata.
- 🎓 Recipe-book — sab kuch likha, sabko dikhta.

## 2️⃣ Terraform 🏗️ — infra (SETUP)
- **Input:** `.tf` code ("3 server, 1 DB, network chahiye").
- **Kaam:** AWS pe **khaali infra** banata (EC2, VPC, RDS, ECR) + state S3 mein.
- **Handoff → Ansible:** banaye servers ke **IP `output`** karta → ye Ansible ki **inventory** mein jaate.
- 🎓 Thekedar — khaali building + tujhe **pate (IP)** deta.
- 🔢 *State S3+lock (team-safe), region ap-south-1, daily `destroy`.*

## 3️⃣ Ansible 🔧 — config (SETUP)
- **Input:** Terraform ke **IPs** (inventory) + playbooks.
- **Kaam:** un servers pe **SSH** karke `kubeadm` chalata → **K8s cluster** banata.
- **Handoff → Kubernetes:** ab ek **ready cluster** exist karta (jahan pods chal sakte).
- 🎓 Decorator — building ke andar **kitchen (K8s) ready** karta.
- 🔢 *Agentless (SSH+Python), 3 playbook: common→master→workers, Calico (DaemonSet, har node).*

## 4️⃣ Docker 📦 — packaging (DELIVERY)
- **Input:** tera code + `Dockerfile`.
- **Kaam:** code ko **image** mein pack (layers, deps-upar/code-neeche cache).
- **Handoff → Registry(ECR) → Pod:** `docker push` → image **ECR** mein → pod use karta naam se.
- 🎓 Packing — dish ko **identical dabba (image)** mein band.
- 🔢 *slim base, tag=git-sha (latest never), `0.0.0.0`.*

## 5️⃣ GitHub Actions 🔄 — CI (DELIVERY, push model)
- **Input:** push event + `ci.yml`.
- **Kaam (4 step):** test → `docker build` → `docker push` ECR → **`deployment.yaml` mein naya tag likho + git push**.
- **Handoff → Git → Argo:** manifest (Git) update karti — Argo wahaan se uthayegi.
- 🎓 Recipe-writer — dish pack karwata, warehouse bhejta, **menu pe naya likhta.**
- 🔢 *Secrets (code mein never), `paths:['app/**']` (loop rok), runner=ephemeral.*

## 6️⃣ Argo CD 🐙 — CD (DELIVERY, pull model)
- **Input:** Git ka `deployment.yaml` (desired state).
- **Kaam:** Git **padhti** (pull) → cluster se compare → mismatch → `kubectl apply` → selfHeal.
- **Handoff → Kubernetes:** cluster ko desired state pe le aati.
- 🎓 Head-waiter — menu padh ke kitchen ko bolta "ye banao", galat dish hataye (selfHeal).
- 🔢 *~3min poll, selfHeal/prune, rollback=`git revert`. Cluster ke ANDAR pod.*

## 7️⃣ Kubernetes ☸️ — runtime (DELIVERY)
- **Input:** Argo ka `kubectl apply` (deployment.yaml).
- **Kaam:** pods chalata (Deployment→ReplicaSet→Pod), self-heal, scale, Service se traffic.
- **Handoff → User:** Service (NodePort) → ready pods → user ko response.
- 🎓 Kitchen-manager — dish banata, jal jaaye to naya, bheed pe aur.
- 🔢 *Reconciliation (etcd=desired), probes (ready=traffic), Service+EndpointSlice, taint(master).*

---

# 🌉 PART 2 — 8 BRIDGES (har handoff, explicit)

> "Connect nahi ho raha" ka asli ilaaj — ye 8 handoffs. Har bridge: **A kya banata → B usse kya leta.**

### Bridge 1: Docker → Pod (registry beech mein)
```
docker build (laptop) → docker push (ECR warehouse) → deployment.yaml: image:<ECR>:sha
   → node ka kubelet ECR se PULL → container → POD
```
🔑 Pod image **store nahi** — naam batata, **node ECR se laata.** Galat tag → `ImagePullBackOff`.

### Bridge 2: Terraform → Ansible (IP handoff)
```
terraform apply → servers + output(master_ip, worker_ips)
   → ye IPs → ansible/inventory.ini → Ansible un IPs pe SSH
```
🔑 Handoff = **Terraform output IPs → Ansible inventory.** Galat IP → `UNREACHABLE`.

### Bridge 3: Ansible → Kubernetes (kubeadm)
```
Ansible 3 playbook → har node pe kubeadm:
   common(taiyaar) → master(init+token) → workers(join) → 3-node CLUSTER
```
🔑 Ansible = automation (commands chalata); **kubeadm = asli cluster banata.** swapoff bhool → init fail.

### Bridge 4: Push → Actions (event trigger)
```
git push (main) → GitHub "push event" → ci.yml ka on:push:[main] sun-ta → workflow chalta
```
🔑 Tu kuch start nahi karta — **event pe Actions khud jaagta** (push model). Feature branch → no trigger.

### Bridge 5: Actions → Git → Argo (manifest update) ⭐ sabse important
```
Actions: image banao+push → deployment.yaml mein naya tag (UPDATE, Git mein) → git push
   ── CI cluster ko CHHUA NAHI ──
Git: deployment.yaml badli (naya SHA = desired state)
```
🔑 **UPDATE = Git mein (Actions). APPLY = cluster mein (Argo).** Alag jagah, alag tool. CI ko cluster access nahi.

### Bridge 6: Argo → Kubernetes (Git → deploy)
```
Argo: Git padhi → "tag badla" → kubectl apply → naya ReplicaSet → rolling update → naya pod
```
🔑 Argo **pull** karti (Git se kheech), cluster ke andar se apply. selfHeal: manual change → Git wapas.

### Bridge 7: Pod → Service → User (traffic)
```
User → node:30080(NodePort) → kube-proxy(iptables) → Service(ClusterIP)
   → EndpointSlice(ready pods) → POD :8000 → response
```
🔑 Service = virtual IP; **EndpointSlice = ready pods ki list** (readiness→traffic). Pod Running par no traffic → slice mein nahi.

### Bridge 8: Pod → RDS (app → database)
```
Pod (app) → psycopg2 → RDS :5432 (private, SG-self) → INSERT/SELECT urls
```
🔑 App **stateless** (state DB mein); DB **stateful** (RDS, managed, backed-up). State bahar → pod disposable.

---

# 🎬 PART 3 — COMPLETE WALKTHROUGH (ek git push → live, sab kadi)

> Ab sab jod ke — ek change ka **poora safar**, har bridge cross karte hue:

```
DIN 0 (setup, ek baar):
  terraform apply  → AWS: VPC+3 EC2+RDS+ECR (+state S3)        [Bridge 2: IPs→inventory]
  ansible-playbook → un EC2 ko kubeadm se K8s cluster banao    [Bridge 3]
  Argo CD install (cluster mein)
  ✅ Restaurant ready — ye mahino chalega

DIN 1+ (har feature):
  1. tu code badla → git push (main)                          [Bridge 4: event]
  2. Actions jaagi:
       pytest → docker build → docker push ECR                [Bridge 1: image→ECR]
       deployment.yaml mein naya SHA → git push               [Bridge 5: manifest UPDATE]
  3. Argo ne Git dekhi → mismatch → kubectl apply              [Bridge 6: deploy]
  4. K8s: naya pod (image ECR se pull)                         [Bridge 1: node pull]
       rolling update (naya ready → purana hatta)
  5. User → NodePort → Service → naya pod                      [Bridge 7: traffic]
       pod → RDS query                                        [Bridge 8: DB]
  🎉 naya version LIVE — tune sirf `git push` kiya
```

> **Itna hi.** 8 bridge, ek chain. Har box tune seekha; har arrow ek handoff.

---

# 🕸️ PART 4 — CONNECTION WEB (sab kaise link)

```
                    📖 GIT (source of truth — sab ka center)
                   /        |          \
          [push event]  [manifest]   [Argo pulls]
              ↓             ↓             ↓
         🔄 ACTIONS ───→ updates ───→ 🐙 ARGO
              ↓ (docker)                  ↓ (apply)
          📦 ECR ──pull──→ ☸️ KUBERNETES ←──── (runs on)
                                ↓              \
                          🔧 ANSIBLE built it   → 🗄️ RDS (state)
                                ↑
                          🏗️ TERRAFORM (IPs)

  🧵 5 threads sab pe: Reconciliation · State-bahar · Preview · Push/Pull · Idempotent
```

## Har concept kahan fit (small details bhi):
| Concept | Kahan is project mein |
|---------|----------------------|
| Stateful/Stateless (M0) | app stateless, RDS stateful |
| State/idempotent (M1) | tfstate S3, `apply` baar-baar safe |
| Agentless/inventory (M2) | Ansible SSH, IPs inventory mein |
| Layer cache/registry (M3) | Dockerfile order, ECR |
| Reconciliation/probes (M4) | Deployment self-heal, readiness→traffic |
| Sizing/requests (M5) | t3.medium, pod limits, OOM se bacho |
| CI/secrets/sha (M6) | Actions, GitHub Secrets, git-sha tag |
| GitOps/selfHeal (M7) | Argo, Git=truth, rollback |
| Observability/SRE (M8) | golden signals, SLO, secrets |
| Blast radius/debug (M9) | daily destroy, kubectl logs/describe |

---

# 🎯 SELF-TEST (padhne ke baad — sab connect hua?)

Har sawaal ek bridge:
1. Terraform Ansible ko kya **deta**? → (IPs/inventory)
2. Ansible kis **tool** se cluster banata? → (kubeadm)
3. `git push` ke baad kaun **trigger** hota? → (Actions, event)
4. Manifest **update** kaun (kahan)? **apply** kaun (kahan)? → (Actions/Git ; Argo/cluster)
5. Image pod tak kaise? → (ECR push → node pull)
6. User request pod tak kaise? → (NodePort→Service→EndpointSlice→pod)
7. App state kahan? → (RDS, bahar)
8. Argo "actual state" kahan se padhti? → (live cluster, no state-file)

> Saare bridge bol paaye → **sab connect.** 🟢 Atke → us bridge ko upar (Part 2) phir padho.

---

# 🧩 PART 5 — KEY CLARIFICATIONS (jo confuse karti, ab clear)

> Ye wo chhoti cheezein jo "connect nahi hone" deti — ek-ek framed.

## 5.1 — Laptop vs Node (kaun-sa tool kahan)
| | 💻 LAPTOP (control center) | 🖥️ NODE (minimal worker) |
|--|---------------------------|--------------------------|
| Tools | git, **docker**, terraform, ansible, kubectl, aws-cli | **containerd** + kubelet (+kubeadm) |
| Kaam | yahaan se **sab commands chalata** (build/infra/config/cluster) | sirf **containers chalata** |
| Install kaun | tu manually (setup) | Ansible (kubeadm playbook) |
> 🔑 **Laptop = manager (saare aujaar). Node = labourer (ek aujaar: containers run).** Terraform/Ansible/Docker = laptop. containerd = node. git = **node pe NAHI**.

## 5.2 — Build vs Run (Docker vs containerd)
| | **Docker** | **containerd** |
|--|-----------|----------------|
| Kya | poora toolkit (build+run+CLI) | sirf runtime (run) |
| Kahan | laptop + CI runner (image **BANANE** ko) | nodes (image **CHALANE** ko) |
> 🔑 **BUILD ek jagah (laptop/CI = Docker), RUN doosri (nodes = containerd).** Image ECR mein bani-banai → node sirf pull+run. K8s 1.24+ ne Docker hata diya (containerd seedha). 🎓 Factory banata (Docker), shop bechta (containerd).

## 5.3 — git kahan rehti
- ✅ laptop (push), GitHub (store=truth), CI runner (checkout), Argo pod (pull).
- ❌ **cluster nodes pe NAHI** (unhe bana-banaya dabba milta, recipe-book nahi).

## 5.4 — `ci.yml` naming convention
- **Folder `.github/workflows/` = FIXED** (exact spelling, badal nahi sakte).
- **Filename = teri marzi** (`.yml`/`.yaml`) — convention: **kaam ke hisaab** (`ci.yml`, `deploy.yml`, `terraform-validate.yml`), project-naam se NAHI.
- **Multiple files** = multiple workflows (ci-main + ci-pr + cleanup — real repos aise). Andar `name:` = UI display.

## 5.5 — Manifest update: manual ya automatic?
- **`ci.yml` likhna = ek baar (manual setup).** Phir har `git push` pe Actions **saare steps khud** (automatic): test→build→ECR→`sed` tag→git push.
- Tera manual kaam har deploy = **sirf `git push`** (apne code ka). 🎓 Washing machine: program ek baar set, phir button daba ke bhool jao.
- "Naya tag kaise aata": **`sed`** (find-replace) `deployment.yaml` mein tag badalta → **git push** GitHub pe save.

## 5.6 — OutOfSync: 2 wajah + keyword trick ⭐
```
OutOfSync = Git ≠ cluster. Sirf 2 wajah:
  🅰️ GIT badla    (shabd: "git push"/"CI ne push")  → Argo APPLY (deploy)
  🅱️ CLUSTER badla (shabd: "kubectl edit/scale/del") → Argo selfHeal (wapas Git)
```
> 🔑 **Keyword trick:** action mein **"git/push"** = Git side (apply). **"kubectl"** = cluster side (selfHeal). Shabd se hi category pata.
> 🎓 git push = menu pe likha (kitchen update). kubectl = kitchen mein ghus ke kiya (menu wala wapas). **Git hamesha boss.**

## 5.7 — Stateful vs Stateless PODS (do tarah ke pods)
| | Stateless pod (web-app) | Stateful pod (DB-in-k8s) |
|--|-------------------------|--------------------------|
| Andar data? | **Nahi** (sab bahar/DB) | **Haan** (data andar) |
| K8s object | **Deployment** | **StatefulSet** |
| Storage | kuch nahi chahiye | **PersistentVolume (PV)** — alag disk, pod ke bahar |
| Replace | koi bhi pod, easy (cattle) | careful (data bachाना) |
> 🔑 **Stateful pod ko PV chahiye** = ek alag disk (jaise AWS EBS) jo **pod ke bahar** rehti. Pod mare → naya pod **wahi disk** se jud jaata → data safe. 🎓 Pod=almari, PV=bahar ka locker (almari toote, locker bacha).

## 5.8 — Stateless pod replace kaise (jab mare)
```
Pod mara → Deployment: "3 chahiye, 2 hain" (reconciliation) → naya pod
   → ECR se SAME image pull → fresh start → Service mein add
```
> 🔑 Stateless mein **kuch khota nahi** (pod ke andar data tha hi nahi). Naya = same image, fresh. **Cattle** — mara, naya banao.

## 5.9 — DB kahan chalाये (pod vs RDS) ⭐
| | 🅰️ DB-in-K8s (pod) | 🅱️ Managed RDS (capstone) |
|--|---------------------|---------------------------|
| Kahan | cluster mein stateful pod + PV | **alag AWS machine** (pod nahi, cluster nahi) |
| Sambhaalta | **TU** (backup/failover/patch) | **AWS** (sab khud) |
| Safety | zyada kaam+risk | ✅ AWS professionally safe |
> 🔑 **Capstone = RDS** — alag AWS-managed machine, app pods **network se `:5432`** pe connect. **AWS backup/failover/durable-storage deta = sabse safe.** 🎓 App pods=kiraye ke waiter (tere restaurant); RDS=bank locker (bank ki building, bank sambhaalta) — keemti data bank mein safe.

## 5.10 — Backup / DR (kiska backup?)
- **Pod ka backup NAHI** (stateless = data nahi; image se khud ban jaata).
- **DATA ka backup = DB (RDS) ka.** RDS automated snapshot (daily) → disaster → snapshot se restore.
- **RPO** = kitna purana data kho sakte (snapshot frequency). **RTO** = kitni jaldi wapas (restore time).
> 🔑 **DR ka asli sawaal = "DATA bacha?"** Data DB mein → DB backup = DR. 🎓 Waiter (pod) chala jaaye → naya; register (DB) jal jaaye → **copy (backup) se wapas.** Backup = data ka, pod ka nahi.

## 5.11 — Bridge 7 (User → Service → Pod) SIMPLE
```
Pods ke address BADALTE rehte (mare→naya→naya IP)
   → isliye beech mein SERVICE (fixed pata, kabhi nahi badalta)
User → Service → available pod
```
> 🔑 User **Service** ko baat karta (fixed), Service **available pod** ko bhejti. Pods badle, Service pata fix. 🎓 Pizza-shop number — tu number pe call, shop free delivery-boy bhejti.

## 5.12 — Bridge 8 (Pod → RDS) SIMPLE
```
Pod (app) → network :5432 → RDS (alag AWS machine) → INSERT/SELECT data
```
> 🔑 App **stateless** (state RDS mein), RDS **stateful** (data, AWS-managed). `DB_HOST` env-var se, `DB_PASSWORD` secret se (code mein never). **State bahar → pod disposable.**

---

> **Asli baat:** System "yaad" karne ki cheez nahi — ye **ek logical chain** hai. Har tool agle ko kuch **deta** (handoff). Wo 8 handoffs samajh → poora system **khud** jud jaata. Restaurant story + 8 bridges = sab. 🚀
