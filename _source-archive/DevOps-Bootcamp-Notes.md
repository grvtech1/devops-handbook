# 🚀 DevOps Bootcamp — Field Notes (M0 → M4)

> **Maqsad:** Recall ke liye ek hi jagah sab kuch. Har concept **2 lens** se — 🎓 *learning/analogy* + 🏭 *real-world*. Har module ke ant mein **recall Q&A** + **gotchas**.
> **Progress:** M0 (74) ✅ · M1 (94) 🏆 · M2 (98) 🏆 · M3 (89) ✅ · M4 (97) 🏆 · M6 CI ✅ · M7 GitOps ✅
> **Lab Gotchas (P1–P7):** [Capstone-LabGotchas.md](Capstone-LabGotchas.md) — 15 real failures from live AWS lab
> **Terraform Modules:** [Terraform-Modules-DeepDive.md](Terraform-Modules-DeepDive.md) — modules + environments, dev vs prod, real-world scenarios
> **Golden thread (poore bootcamp ka dhaaga):** *"State bahar nikaalo → compute disposable ban jaata hai."*

---

## 📑 Table of Contents
- [M0 — Foundation](#m0--foundation)
- [M1 — Provisioning (Terraform)](#m1--provisioning-terraform)
- [M2 — Configuration (Ansible)](#m2--configuration-ansible)
- [M3 — Packaging (Docker)](#m3--packaging-docker)
- [M4 — Orchestration (Kubernetes)](#m4--orchestration-kubernetes)
- [🧠 Universal Rules](#-universal-rules-cross-module)
- [🔁 Master Recall Sheet](#-master-recall-sheet-rapid-fire)

---

# M0 — Foundation

### DevOps kya hai
**Code likhne se lekar live chalne tak ka poora raasta — automate + reliable.** Taaki insaan haath se na kare (galti), aur *"mere machine pe chal raha tha"* kabhi na ho.
- 3 pillar: **Speed** (jaldi) + **Safety** (reliable) + **Repeatability** (automation/consistency).

### 4 Tools = 4 Layers 🍽️ (Restaurant)
| Tool | Role | Kaam | Stage |
|------|------|------|-------|
| **Terraform** 🏗️ | Builder | Infra banata (EC2, VPC, DB machine) | Provisioning |
| **Ansible** 🔧 | Setup-wala | Machine ke **andar** software install/config | Configuration |
| **Docker** 📦 | Packer | App ko **box (image)** mein band — "har jagah same" | Packaging |
| **Kubernetes** 👨‍🍳 | Manager | Boxes chalata + sambhaalta (heal, scale) | Orchestration |

> **Order:** ghar (Terraform) → andar saaman (Ansible) → dish pack (Docker) → manager (K8s). **T → A → D → K.**

### Stateful vs Stateless
| | Stateful 🐶 (Pet) | Stateless 🐄 (Cattle) |
|--|------------------|----------------------|
| 🎓 | Andar **keemti data zinda** — paalo/fix karo | Andar **kuch nahi** — maaro/naya banao |
| 🏭 | DB — phenk do to data gaya. K8s `StatefulSet` | Web server — har request self-contained, sticky session nahi |
| Define | Pichhli requests ka context/session **yaad** rakhti | Har request ke baad **bhool** jaati |

> ⚠️ **Galatfehmi:** "DB important hai isliye stateful" — **galat.** Stateful = *andar data zinda hai*, importance se lena-dena nahi.
> ⚠️ **App jo DB use karta = stateless** (state DB mein dhakeli). **DB khud = stateful.** Do mat milao.

### 🩺 Error-type = Problem-location (debugging reflex)
| Error | Problem kahan |
|-------|---------------|
| `UNREACHABLE` / timeout | Machine hi nahi / **network** |
| `Permission denied` | Machine hai, par **andar ghusne ka haq nahi** (galat key/user) |
| `syntax / parse error` | **Teri likhi cheez** galat |

### 🔁 M0 Recall Q&A
- **Q: DB stateful kyun?** → Andar data/session **zinda** store hai; phenko to gaya.
- **Q: `UNREACHABLE` = teri galti ya nahi?** → Teri config nahi, **network/machine** (reached hi nahi).
- **Q: 4 tools sahi order?** → Terraform → Ansible → Docker → Kubernetes.

---

# M1 — Provisioning (Terraform)

### Core: Infrastructure as Code (IaC)
Infra ko **code** (`.tf`) likho → Git mein → single source of truth. Haath se console click **band.**

### 3 magic words
| Word | 🎓 | 🏭 |
|------|----|----|
| **Declarative** | "Kya chahiye" batao | "3 servers" — kaise banega Terraform sochta (ulta = imperative) |
| **State (`tfstate`)** | Terraform ki **diary** | JSON file: resource IDs (`i-0abc`) ↔ code ka map |
| **Idempotent** | SET = 5, **not** += 5 | 100 baar `apply` → wahi 5 (desired vs actual compare) |

### Commands (rozaana)
| Command | Kaam | 🎓 |
|---------|------|----|
| `terraform init` | provider/plugins download + backend setup | project shuru |
| `terraform plan` | **preview** — `+`add `~`change `-`destroy `-/+`replace (kuch karta nahi) | bill dekhna 🧾 |
| `terraform apply` | asal mein banata/badalta | payment 💳 |

> 🔑 **"Plan padhe bina kabhi apply mat karo."** = seatbelt.

### Remote State (team problem)
- **Problem 1:** state laptop pe → teammate ke paas nahi → duplicate infra banata.
- **Problem 2:** 2 log ek saath `apply` → state **corrupt**.
- **Solution:** **S3** (shared diary = sharing) + **Lock** (DynamoDB / `use_lockfile`, Terraform 1.10+ = safety, ek waqt mein ek).

### ⚠️ Lost State vs Drift (yeh confuse mat karna!)
| | **Drift** 🌊 | **Lost State** ☠️ |
|--|------------|-------------------|
| Kya hua | Reality **bahar se** badli (console pe haath se) | `tfstate` file **kho gayi** |
| State diary | **Intact** ✅ | **Gayi** ❌ |
| TF ko pata? | Haan — `plan` mismatch, **wapas revert** karta | Nahi — **andha**, bhool gaya |
| Result | Manual change undo | Orphan + **duplicate** (5 → 10) |

> 🚑 Lost state recovery: `terraform import <resource> <id>` — ek-ek manually diary mein wapas jodo.

### 🎁 Bonus
- **State mein plaintext secrets** aate (DB password). → Kabhi **Git mein commit nahi**; S3 encrypt + IAM restrict.

### 🔁 M1 Recall Q&A
- **Q: 5 servers, 3 baar apply → kitne?** → 5 (idempotent, SET not +=).
- **Q: tfstate kho gayi, 5 zinda → apply?** → Orphan + 5 naye = **10** (lost state).
- **Q: Console pe haath se badla → plan?** → Drift; wapas code (desired) pe revert dikhayega.

---

# M2 — Configuration (Ansible)

### Core
Config management — server ke **andar** setup. **Agentless · Push-based · Idempotent.**

### Agentless 🔑
- Ansible **sirf control node** pe install. Target servers (managed nodes) pe **kuch nahi** — bas **SSH + Python**.
- 🎓 Plumber har ghar **jaata** hai (SSH), kaam karke nikal jaata — koi permanent copy nahi chhodta.
- ⚠️ **"Master" shabd Ansible mein NAHI** (wo K8s ka hai). Ansible = **control node**.
- **Bastion** = security gate/jump server (public subnet) jisse private servers tak pohchte.

### Push vs Pull
| | PUSH (Ansible) | PULL (Argo CD / agent model) |
|--|----------------|------------------------------|
| Trigger | **Control node** ("main jaake karwaata") | **Target khud** kheech ke laata (loop) |
| Kab | Tu `ansible-playbook` daboge tabhi | Apne aap, continuous |

### Building blocks
| Block | 🎓 | 🏭 |
|-------|----|----|
| **Inventory** | guest list (groups) | "Kahan" — IPs + `[webservers]`,`[db]` |
| **Playbook** | recipe | "Kya" — YAML tasks |
| **Module** | ek-step ka aujaar | `apt`,`copy`,`service` — idempotent |
| **Task** | recipe ki ek line | `apt: name=nginx state=present` |

### Idempotency: `ok` vs `changed`
- `state=present` = "hona chahiye" (check-then-act). `changed` = kaam hua; `ok` = pehle se theek.
- **Healthy playbook:** 1st run = `changed`, 2nd run = **`ok` (changed=0)** = convergence.
- ⚠️ **Module > shell.** `shell:`/`command:` **andha** (har baar chalta, idempotency bypass → side-effects repeat, jaise `echo >> file` = hello, hello hello, ...).

### Handlers + notify 🔔 (boss-level)
- Restart jaisा side-effect **sirf tab** karo jab kuch **sach mein badle**.
- `notify: Restart nginx` = **bell** (sirf `changed` pe bajegi). `handlers:` block = bell sunke chalta (playbook ke end mein, ek baar).
- Config same → copy `ok` → notify nahi → **koi restart, koi downtime.** ✅

### 🎁 Bonus
- `--check` = Ansible ka `terraform plan` (dry-run). `--diff` = line-by-line file changes.

### 🔁 M2 Recall Q&A
- **Q: agentless = target pe kya chahiye?** → SSH + Python.
- **Q: 2nd run pe task `changed` (sab installed) → problem?** → Haan, task non-idempotent (shell?) — fix the task.
- **Q: config unchanged, nginx restart na ho — kaise?** → Handler + `notify` (sirf `changed` pe).

---

# M3 — Packaging (Docker)

### Image vs Container
| Image 📜 | Container 🍛 |
|---------|-------------|
| Read-only **blueprint** (code+libs+runtime+config) | Image ka **running instance** (apna process/network/FS/IP) |
| Recipe / **Class** | Dish / **Object** |
| Ek image | → kai containers ban sakte |

### Layers + Caching (M3 ka dil)
- Dockerfile ki **har line = ek layer** (har kaam ke baad ek "save point" 💾, game checkpoint jaisa).
- **Caching:** same input → cache se uthao (skip, instant). `pip install`/`npm install` slow → isiliye cache critical.
- **Cache break rule:** jis layer pe **change** → **wo + uske NEECHE sab** rebuild. **Upar wali safe** ✅ (cache top-down tootti, upar nahi chadhti).

### ⭐ Layer Order trick (#1 interview point)
> **"Jo KAM badalti (deps) → UPAR. Jo ZYADA badalti (code) → NEECHE."**
```dockerfile
FROM python:3.12
COPY requirements.txt .          # deps LIST pehle (kam badalti → cache safe)
RUN pip install -r requirements.txt
COPY . .                         # code baad (roz badalta → sirf yahi rebuild)
CMD ["python", "app.py"]
```
- Kyun alag COPY? → code ko **alag neeche** layer mein rakho taaki roz ka code change `pip install` (upar) ko **chhue na** → cache bachi → build fast.
- 🎓 Ghar: neev (kam badalti) neeche/pehle, paint (roz badal sakta) baad mein.

### Build Context
- `docker build .` mein `.` = **build context** (jo folder Docker ko diya).
- `COPY` **sirf is context se** copy kar sakta — bahar ki file = no access. `.dockerignore` files ko context se hataata.
- 🐛 Gotcha: `RUN pip install` "file not found" → asli jad **COPY/context** (requirements.txt context mein thi hi nahi / `.dockerignore` ne block kiya). *Error jahan dikhe, jad wahi ho zaroori nahi.*

### Registry 📦
- Images ka **GitHub/warehouse**. `docker push` (laptop → reg ⬆️), `docker pull` (reg → server ⬇️).
- Types: **Docker Hub** (public default), **GHCR** (GitHub), **ECR** (AWS, private — capstone).

### ⚠️ `latest` tag trap
- `latest` = **mutable label**, "newest" guarantee **nahi** (sticky note jo move ho sakta).
- Problem: inconsistent deploy ("laptop pe chala, server pe crash"), **rollback impossible**.
- ✅ Prod mein **pinned version** (`v1.2.3`) ya **`@sha256:...` digest** (immutable). Capstone = `git-sha` tag.

### 🔁 M3 Recall Q&A
- **Q: deps upar code neeche kyun?** → Code roz badalta (sirf wahi rebuild), deps kam (cache bachi).
- **Q: Layer 3 badli (5 layers) → kya rebuild?** → L1,L2 cache; L3,L4,L5 rebuild.
- **Q: prod mein `latest`?** → Never — mutable, rollback impossible; use sha/version.

---

# M4 — Orchestration (Kubernetes)

### Core mantra
**K8s = "desired state batao, main use 24/7 maintain karunga, chahe kuch bhi toote."**
Docker 1 container chalata; K8s extra deta: **self-heal + auto-scale + service/load-balance** (multi-machine orchestration).

### Reconciliation Loop (Control Loop) — self-heal ka engine
- Lagataar: **Desired State vs Current State** compare. Mismatch → fix.
- `replicas: 3`, pod crash → current 2 ≠ desired 3 → naya pod → 3 phir se. (Raat 2 baje bhi, kyunki loop kabhi nahi rukta.)
- Docker mein ye chowkidar **hai hi nahi** — wo container chala ke bhool jaata.

### 3 core objects
```
DEPLOYMENT 👔  → "3 pod hamesha" (desired state, self-heal, scale, rolling update)
     ↓
   POD 🍱      → tiffin (1+ container), smallest unit, IP BADALTA
     ↓
 CONTAINER 🍛 → teri app

 SERVICE ☎️    → pods ke AAGE: stable IP/DNS + load balancer
```
- **Bare Pod** (Deployment bina) crash → **naya nahi banta** (koi controller/desired-state nahi). Production mein **hamesha Deployment.**
- **Service** = stable "fixed phone number" — pods ke IP badalte rahein, Service ka pata fix. Pods ko **label/selector** (`app=myapp`) se "apna" maanta.
- **Readiness probe** (`/health`): pod "ready" hone par hi Service traffic deta (aadha-paka pod skip).

### Sidecar
- 1 pod mein 2+ container jab **saath rehna zaroori** (same network+storage). Main app + helper (logs/proxy/metrics). 🎓 Motorcycle + sidecar.

### Nodes: Master vs Worker
| Master / Control Plane 🧠 | Worker 💪 |
|--------------------------|----------|
| Cluster ka **dimaag** (decisions, reconciliation) | Asli **kaam** — teri **pods yahaan chalte** |
| Manager ka office 👔 | Factory floor 🏭 |

- **Master pe app pods nahi chalte** → **Taint** (`node-role.kubernetes.io/control-plane:NoSchedule`) = "No-Entry board" 🚷. Master apna dimaag-kaam shaanti se kare; overload = cluster brain down.
- **Self-managed (kubeadm):** tu master sambhaalta (seekhne best, capstone). **EKS:** AWS control plane sambhaalta (aasaan, mehnga).

### Pod limits per node (jo pehle khatam, wo rok deti)
1. **CPU** 2. **RAM** 3. **IP pool** (← sneaky, log bhool jaate) 4. **~110 pod hard cap**
- 🐛 "RAM free hai, pod `Pending` kyun?" → 90% baar **IP exhaustion** ya **110 cap.**

### 🏷️ "Label" ke 2 alag istemaal (confuse mat karna!)
Dono labels use karte, **par maqsad bilkul alag:**

| Mechanism | Kaun dhoondhta | Kiska label | Faisla |
|-----------|---------------|-------------|--------|
| **Service `selector`** | Service | **Pod** ka label | Traffic kis pod ko jaaye 🚦 (routing) |
| **`nodeSelector`/affinity** | Pod | **Node** ka label | Pod kis node pe chale 🖥️ (placement) |

```yaml
# 1) Service → POD (traffic)         # 2) Pod → NODE (placement)
Pod:     labels: {app: myapp}        Node: labels: {disktype: ssd}
Service: selector: {app: myapp}      Pod:  nodeSelector: {disktype: ssd}
```
- 🎓 **Service → POD** (upar se traffic): "traffic kahan jaaye." **Pod → NODE** (pod kahan baithe): "pod kahan chale."
- Same tool (labels), alag kaam: ek **traffic** ke liye, doosra **scheduling** ke liye.
- 🔗 Pending-debug reason 3 (affinity/nodeSelector) = pod ko matching **node** label nahi mila → Pending (placement fail) — Service wale label se alag.

### 🩺 Readiness vs Liveness Probe (`Running` ≠ `Ready`)
- **`Running`** = container chal raha. **`Ready`** = app kaam ke liye taiyaar (DB connect, startup done).
- **Readiness probe** 🚦 = "traffic ke ready ho?" Fail → Service se **hata** (traffic rok), pod **maarta nahi**.
- **Liveness probe** 💓 = "zinda ho? atka to nahi?" Fail → pod **maar ke restart**.
- 🐛 Gotcha: pod `Running` par users ko app nahi (Service traffic nahi de raha) → **2 reasons:** (1) **label/selector mismatch**, (2) **readiness probe fail** (`kubectl get pods` mein `READY 0/1`).
- 🎓 Readiness = "customer le sakte ho?" (na → gaahak mat bhejo, dukaan band nahi). Liveness = "behosh to nahi?" (haan → uthaake naya).

### 🎁 Bonus: Deployment → ReplicaSet → Pod 🪆
- Deployment seedhe pods nahi banata — wo **ReplicaSet** banata, ReplicaSet "N pods zinda rakho" karta.
- Deployment = version/rolling-update/rollback. ReplicaSet = gin-ti. Naya version → naya ReplicaSet, purana dhीरे khaali = **rolling update.**

### 🔁 M4 Recall Q&A
- **Q: bare pod crash → recreate?** → Na (no Deployment = no desired state = reconciliation kuch nahi karta).
- **Q: pod IP badalte, user kaise pohche?** → Service (stable IP/DNS + LB).
- **Q: master pe pods kyun nahi?** → Taint (NoSchedule); master = dimaag, kaam workers pe.
- **Q: CPU/RAM free, pod Pending?** → IP pool khatam ya 110 cap.

---

# M5 — Sizing 📏

### App ki "Bhookh" 🍽️ → Family
| Bhookh | Family | Example |
|--------|--------|---------|
| **CPU** 🧮 | **C** (compute) | video encode, ML, crunching |
| **RAM** 🧠 | **R** (memory) | Redis, in-memory DB, big datasets |
| **IO** 💾 | **I** (storage/IO) | DB disk-heavy, file server |
| Balanced | **M** (general) | default web API |
| GPU | **P** | ML training/graphics |
| Burstable/idle | **T** (tiny) | small idle tools, kabhi spike |

### Instance naming decode (`c6g.xlarge`)
- `c` = **family** (kaam) · `6` = **generation** (naya=behtar/sasta) · `g` = **Graviton** (AWS ARM chip, ~20% sasta+efficient) · `xlarge` = **size** (large<xlarge<2xlarge...).

### Right-sizing process ♻️ — **Estimate → Measure → Right-size**
1. **Estimate** 🔮 app type se rough guess (T/M se shuru) 2. **Measure** 📊 asli usage (`kubectl top`, CloudWatch) 3. **Right-size** 🎯 adjust.
- ⚠️ Sabse bada lena = **paisa barbaad** (idle pe bhi full bill). Cloud mein scale-up sasta → chhote se shuru.
- ⚠️ "Ande ek tokri mein" — ek bahut bada server gira to sab gaya; kai chhote behtar.

### 🏭 Production essentials
- **Requests vs Limits:** `requests` = guaranteed min (**scheduler isse node choose karta**); `limits` = max ceiling. 🎓 reserved seat vs "room se bahar mat jao".
- **CPU limit cross → THROTTLE** (slow, zinda 🐢). **RAM limit cross → OOMKilled** (maar+restart, exit **`137`** = SIGKILL 💀). Reflex: `137`/`OOMKilled` = **RAM kam**.
- **Cost:** On-Demand (full price, dev) · **Reserved/Savings** (1-3yr commit, ~40-70% off, baseline 24/7) · **Spot** (~70-90% off, par AWS **cheen sakta** → sirf **stateless/disposable**, DB pe NEVER).
- **Autoscaling:** **HPA** = **pods** badhata (zyada waiter) · **Cluster Autoscaler** = **nodes** badhata (zyada table) · VPA = pod size.
- ⚠️ **T-series CPU-credit trap:** idle → credits jama, spike → kharch. Credits khatam → CPU baseline pe **throttle** (app slow, confusing). T sirf kabhi-kabhi-spike ke liye; lagataar high CPU = C/M lo.
- **Headroom:** node 100% mat bharo, ~20-30% buffer (spike/OS/restarts).
- 🏭 **DB sizing nuance:** Postgres RAM se pyaar karta (shared_buffers + page cache → kam disk read). Aksar **R-family + fast EBS (gp3/io2)** best; compute family se aata, storage/IOPS alag knob (EBS). Managed = **RDS** (AWS tune karta).

### 🐛 Pod `Pending` (free resources hote hue bhi) — 3 reasons
| # | Wajah | `kubectl describe pod` Events |
|---|-------|------------------------------|
| 1 | **Fragmentation** — request kisi **ek** node pe fit nahi (scheduler tod nahi sakta; total free bikhra) | `Insufficient cpu/memory` |
| 2 | **maxPods (~110)** ya **IP pool** khatam (CPU/RAM nahi) | node full / IP error |
| 3 | **Taint** (no matching toleration) ya **nodeSelector/affinity** no match | `untolerated taint` / `didn't match node selector` |
> 🏭 Hamesha **`kubectl describe pod <name>` → Events** padho — scheduler khud exact reason likhta. 🎓 fragmentation=bus seat saath nahi; maxPods/IP=parking pass khatam; taint=VIP-only table.

### 🔁 M5 Recall Q&A
- **Q: 3 bhookh + family?** → CPU=C, RAM=R, IO=I.
- **Q: pata nahi size?** → Estimate→Measure→Right-size; bada=waste.
- **Q: 137/OOMKilled?** → RAM kam (limit badhao ya R-family). CPU cross = throttle, kill nahi.
- **Q: Spot kahan?** → Stateless/disposable only (cheen gaya, K8s naya banata). DB pe never.
- **Q: HPA vs CA?** → HPA pods, CA nodes.

---

# M6 — CI/CD (GitHub Actions) 🔄

### CI vs CD
- **CI** (Continuous Integration) = **Build + Test + Package** (deployable image/artifact ready).
- **CD** (Continuous Delivery/Deployment) = **Release + Deploy** (tested image ko staging/prod live).
- Insaan ka kaam = sirf **`git push`**; baaki automatic.

### GitHub Actions building blocks (`.github/workflows/ci.yml`)
| Cheez | Kya | 🎓 |
|-------|-----|----|
| **Trigger (`on`)** | kab chale (push/PR/schedule) | ghanti |
| **Job** | kaam ka group | department |
| **Runner** (`runs-on`) | machine jahan chale (GitHub deta) | kiraye ka worker+PC |
| **Step** | ek command/action | task |
- `run:` = shell command · `uses:` = ready-made action (`actions/checkout`, `aws-actions/...`) marketplace se.
- **Push-based** (M2 yaad): event → Actions trigger. (Argo = pull, M7.)

### Triggers / branch filter
```yaml
on:
  push: { branches: [main] }       # SIRF main push pe (feature branch → NO trigger)
  pull_request: { branches: [main] } # PR khula → test chalao (merge se pehle)
```
- ⚠️ `branches: [main]` = filter. List mein nahi = trigger nahi. 🎓 chowkidar sirf main-gate sunता.

### Production essentials
- **Secrets** 🔐: AWS key code mein NEVER. **GitHub Secrets** → `${{ secrets.AWS_KEY }}` (encrypt, runtime inject). 🎓 locker ki chaabi.
- **SHA tag** 🏷️: `docker build -t $ECR:${{ github.sha }}` — har commit = unique immutable image (latest NEVER). Traceable + rollback.
- **Test gate** 🚦: `pytest` build/deploy se pehle → fail → pipeline ruk jaaye (toota code prod mein nahi).

### ⭐ Manifest-update trick (CI → CD handoff, GitOps-ready)
**2 raaste deploy ka:**
| | Raasta 1 (Push) | Raasta 2 (Manifest-update) 🌟 capstone |
|--|-----------------|----------------------------------------|
| Deploy | CI khud `kubectl apply` | CI sirf **Git mein `deployment.yaml` tag update** + push |
| Cluster access | CI ko **chahiye** 🔑 | CI ko **NAHI** ❌ (Argo deploy karti) |
| Truth | Git mein nahi | **Git = source of truth** |
- Flow: `git push` → Actions (test→image build→ECR push→`deployment.yaml` mein naya SHA→git push) → **Argo Git watch karti → kubectl apply** → naya pod.
- 🎓 CI = menu (Git) likhta; Argo = rasoiya jo menu padh ke banata. CI ko kitchen chaabi nahi.
- Faayde: (1) CI ko cluster access nahi (security — CI hack hua to cluster safe), (2) Git=truth (rollback=`git revert`, audit, drift-detect).

### ⚠️ Infinite loop trap (CI manifest-push khud ko trigger karta)
CI `git push` (manifest update) → `main` pe naya commit → workflow phir trigger → phir push → ♾️ (do aaine aamne-saamne). **Fixes:**
1. **`GITHUB_TOKEN`** built-in protection: default token se push → GitHub doosra workflow **trigger nahi** karta. ⚠️ PAT use kiya to protection nahi → loop.
2. **`paths` filter:** `on: push: paths: ['app/**']` → sirf app code pe chale, manifest (`k8s/`) commit pe nahi.
3. **`[skip ci]`** commit message → workflow skip.

### 🔁 M6 Recall Q&A
- **Q: CI vs CD?** → CI build+test+package; CD release+deploy.
- **Q: `branches:[main]`, feature push?** → No trigger (filter).
- **Q: AWS key kahan?** → GitHub Secrets (code mein never). Tag = SHA.
- **Q: Manifest-update, CI deploy karti?** → Na; sirf Git tag update; Argo deploy. CI ko cluster access nahi.

---

# M7 — GitOps (Argo CD) 🐙

### Core
**Git = single source of truth (desired state); Argo controller continuously cluster ko Git se match karta** (reconciliation, desired=Git). Git badlo → cluster badlega. Cluster haath se badlo → Argo Git wala wapas (selfHeal).

### PUSH vs PULL (M2/M6 connect)
- **GitHub Actions = PUSH** 📤 (event → trigger, bahar). **Argo CD = PULL** 📥 (cluster ke andar, khud Git se kheech).
- Beech mein **Git = handshake/source of truth.** Actions likhti, Argo padhti.

### Application object (Argo ko naukri-parchi)
```yaml
kind: Application
spec:
  source: { repoURL: <git>, path: k8s, targetRevision: main }   # kahan/kaunsa folder/branch
  destination: { server: <cluster>, namespace: default }         # kahan deploy
  syncPolicy:
    automated: { selfHeal: true, prune: true }
```

### Sync states (UI)
- **Synced** ✅ cluster=Git · **OutOfSync** ⚠️ cluster≠Git · **Healthy** 💚 pods ready · **Degraded** ❤️‍🩹 pods kharab. (Synced ≠ Healthy: deploy ho gaya par pod crash = Synced+Degraded.)

### selfHeal vs prune
- **selfHeal** = cluster mein **badla** (drift) → Git wala wapas (reconcile).
- **prune** = Git se **delete** → cluster se bhi delete (warna orphan).

### Rollback = `git revert` ↩️
`git revert <bad-commit>` + `git push` → Argo purana wapas deploy. **Behtar kyun:** Git history=deployment history (time machine), no panic/manual kubectl, audit trail, cluster khud reconcile.

### Actions + Argo = partners 🤝
| | Actions (CI) | Argo (CD) |
|--|-------------|-----------|
| Model | PUSH | PULL |
| Kaam | build/test/image + **Git update** | Git padho + **cluster deploy** |
| Cluster access | NAHI | HAI (andar) |
- branch=environment pattern: `main`→prod app, `staging`→staging app.

### ⚠️ selfHeal gotcha (production!)
`selfHeal:true` ke saath **manual `kubectl` change UD jaata** (Argo Git wala wapas laati). Emergency mein replicas badhana? → **Git badlo** (deployment.yaml→push), ya **auto-sync/selfHeal temporarily OFF** karke manual. GitOps = "Git ke through hi badlo."

### 🔁 M7 Recall Q&A
- **Q: GitOps?** → Git=desired/truth; cluster reconciles to match.
- **Q: Argo model?** → PULL (khud Git se kheech; koi bhejta nahi).
- **Q: selfHeal + kubectl manual?** → Argo undo kar degi (drift→Git wapas). Git badlo.
- **Q: rollback?** → `git revert` + push; Argo purana deploy.
- **Q: Actions vs Argo?** → Partners; Actions=build(push), Argo=deploy(pull), Git=handshake.

---

# 🧠 Universal Rules (cross-module)

1. **"Preview before apply"** har achhe tool mein: Terraform `plan` · Ansible `--check` · K8s `--dry-run`.
2. **Idempotency** = Terraform + Ansible + K8s sab ki aatma: "desired batao, kitni baar bhi chalao, result same."
3. **Error-type = problem-location** (UNREACHABLE→network, Permission→access, syntax→teri galti).
4. **Golden thread:** state bahar → compute disposable (stateless app, remote tfstate, cattle pods — sab isi se).
5. **"Error jahan dikhe, jad wahi ho zaroori nahi"** (Docker RUN fail, jad COPY/context).
6. **Kam-badalti cheez upar/pehle, zyada-badalti neeche/baad** (Docker layers; general design sense).

---

# 🔁 Master Recall Sheet (rapid-fire)

| # | Sawaal | Jawab |
|---|--------|-------|
| 1 | 4 tools order | Terraform → Ansible → Docker → K8s |
| 2 | Stateful kyun | Andar keemti data/session zinda |
| 3 | `plan` vs `apply` | plan = preview (safe); apply = execute |
| 4 | Idempotent (5 servers, 3x apply) | 5 (SET, not +=) |
| 5 | Remote state 2 cheez | S3 (sharing) + Lock (safety) |
| 6 | Drift vs Lost-state | Drift = reality badli, state OK; Lost = state gayi, andha |
| 7 | Agentless target needs | SSH + Python |
| 8 | `changed` vs `ok` | changed = kaam hua; ok = pehle se theek |
| 9 | Handler/notify | side-effect sirf `changed` pe (no needless restart) |
| 10 | Image vs Container | blueprint vs running instance (class vs object) |
| 11 | Docker layer order | deps upar (cache), code neeche (roz badalta) |
| 12 | Registry commands | push (laptop→reg), pull (reg→server) |
| 13 | `latest` prod | Never — mutable; use sha/version |
| 14 | Reconciliation | desired vs current, mismatch → fix (self-heal) |
| 15 | Bare pod no-heal | No Deployment = no desired state |
| 16 | Service | stable IP/DNS + LB; label/selector se pods |
| 17 | Master taint | NoSchedule; app pods workers pe |
| 18 | Pod/node limit | CPU, RAM, IP pool, ~110 cap |

---

> **Agle modules (aane wale):** M5 Sizing · M6 CI/CD (GitHub Actions) · M7 GitOps (Argo CD) · M8 Operate (Observability/SRE/Secrets) · M9 Practical Survival Kit · M10 Capstone (URL Shortener).
> *Ye file har module ke baad update hoti rahegi.*
