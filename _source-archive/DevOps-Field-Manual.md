# 📘 DevOps Field Manual — "From Zero to Cluster" (M0–M7)

> Har topic + sub-topic, **explanation ke saath**, dual-lens (🎓 analogy + 🏭 real-world). Padhke samajhne ke liye — recall ke liye [DevOps-Master-Recall.md](DevOps-Master-Recall.md), quick-lookup ke liye [DevOps-Bootcamp-Notes.md](DevOps-Bootcamp-Notes.md).

---

# 🟦 M0 — FOUNDATION

## DevOps kya hai aur kyun
Pehle developers code likhte the, alag "operations" team use server pe daalti thi. Beech mein deri, galti, "mere machine pe to chal raha tha" wala blame-game. **DevOps** matlab dono ko jodna + poora raasta (code → build → test → deploy → monitor) **automate** karna.
- **3 faayde:** Speed (jaldi release), Safety (reliable, kam galti), Repeatability (har baar same).
- 🎓 Pehle har dish chef apne mood se banata (alag swaad); DevOps = ek **recipe + machine** jo har baar bilkul same banaye.

## 4 Tools = 4 Layers 🍽️
Production tak app le jaane mein 4 alag kaam, 4 alag tools:
| Tool | Kaam | Kyun chahiye |
|------|------|--------------|
| **Terraform** 🏗️ | Infra banao (server, network, DB machine) | Haath se AWS console click = chaos, no record |
| **Ansible** 🔧 | Machine ke andar software install/config | Khaali server kisi kaam ka nahi, setup chahiye |
| **Docker** 📦 | App ko image (box) mein pack | "Har jagah same chale" guarantee |
| **Kubernetes** 👨‍🍳 | Images ko chalao + sambhaalo | Crash/scale khud handle ho |
> **Order: T → A → D → K** (building → setup → pack → manager).

## Stateful vs Stateless
Ye sabse buniyaadi concept hai — "machine ke andar keemti data hai ya nahi."
- **Stateful** 🐶: andar **data/session zinda** hai jo time ke saath banta. Phenk do → data gaya. Isliye **paalte/fix karte** (Pet). Example: **Database.**
- **Stateless** 🐄: andar **kuch nahi** — har request self-contained, kuch yaad nahi. Maaro/naya banao, kuch nahi khota (Cattle). Example: **web server.**
- 🔑 **Sookshma baat:** ek app **jo DB use karta wo stateless** ho sakta — kyunki usne apni state **bahar (DB)** mein rakhi. **DB khud stateful** hai (wahaan data zinda). Ye gad-mad mat karna.
- 🏭 Stateless islihe achha: koi bhi instance/pod chale, load balancer kahin bhej de, sticky session nahi chahiye → **scale aasaan.**

## Error-type = Problem-location 🩺 (debugging reflex)
Error ka **type** dekh ke pata chalta hai problem **kahan**:
- `UNREACHABLE` / timeout → machine hi nahi mili / **network** (request pohchi hi nahi)
- `Permission denied` → machine mil gayi, par **andar ghusne ka haq nahi** (galat key/user)
- `syntax / parse error` → **teri likhi cheez** galat
> 🔑 "Error jahan dikhe, jad wahi ho zaroori nahi" — kabhi error ek jagah, asli galti doosri (Docker mein dekhенge).

---

# 🟩 M1 — PROVISIONING (Terraform)

## Infrastructure as Code (IaC)
Infra ko **haath se** banana (console click) = koi record nahi, "kisne kya banaya" pata nahi, banda gaya to knowledge gaya. **IaC** = infra ko **code** (`.tf` file) mein likho. Wo file Git mein jaati, koi bhi padh ke samajh le, dobara bana sake.

## 3 magic words
- **Declarative:** tu sirf **"kya chahiye"** likhta ("3 servers"). **"Kaise"** banega — Terraform khud sochta. (Ulta = imperative, jahan har step khud likho.)
- **State (`tfstate`):** Terraform ki **diary** — "maine kya-kya banaya" ka record + asli resource IDs (`i-0abc123`). Isi se wo real world se compare karta.
- **Idempotent:** "3 chahiye" likha → kitni bhi baar `apply` karo, **3 hi** rahenge (SET=3, not +=3). Wo desired (3) vs actual compare karke decide karta.

## Commands flow
- **`terraform init`** — provider/plugins download + backend (S3) setup. Project shuru karne pe, ek baar.
- **`terraform plan`** — **preview**: dikhata `+`(add) `~`(change) `-`(destroy) `-/+`(replace), par **kuch karta nahi.** 🧾 (bill dekhna)
- **`terraform apply`** — asal mein banata/badalta. 💳 (payment)
> 🔑 **"Plan padhe bina apply mat karo"** = seatbelt. Andha apply prod uda deta.

## Remote State (S3 + Lock)
`tfstate` agar **tere laptop pe** hai → tu akela theek, par team mein 2 problem:
1. **Sharing:** teammate ke paas diary nahi → uska Terraform sochega "kuch exist nahi" → **duplicate** infra bana dega.
2. **Safety:** 2 log ek saath `apply` → diary mein adhura-adhura likha → **corrupt.**
- **Fix:** diary ko **S3** (shared bucket) mein rakho (= sharing solve), aur **Lock** (DynamoDB / `use_lockfile`) lagao taaki ek waqt mein ek hi likhe (= safety solve).

## Drift vs Lost-state (⚠️ confuse mat karna)
- **Drift** 🌊: kisi ne Terraform ke **bahar** (console pe haath se) infra badal diya. State (diary) **intact** hai. `plan` chalао → mismatch dikhega, aur reality ko **wapas code wali** state pe le aayega.
- **Lost-state** ☠️: `tfstate` file **kho gayi** (laptop format). Code Git mein safe, par diary gayi. Ab Terraform **andha** — bhool gaya kya banaya. 5 server zinda hain par wo unhe **pehchanta nahi (orphan)**, sochta "0 hai, 5 chahiye" → **5 naye** → **total 10.**
- 🔑 **Farak:** drift mein **state file hai** (TF theek kar deta); lost-state mein **state file gayi** (TF duplicate bana deta).
- 🚑 Recovery: `terraform import <resource> <id>` — orphan ko manually diary mein wapas jodo.

## Secrets in state
Terraform har resource ki detail diary mein likhta — including **DB password (plaintext)**. Isliye: state **kabhi Git mein commit nahi**, S3 pe **encryption + restricted IAM.**

---

# 🟨 M2 — CONFIGURATION (Ansible)

## Ansible kya karta
Terraform ne khaali machine bana di. Ansible us machine ke **andar** ghus ke software install + config karta (nginx, docker, kubeadm). = **Configuration management.**

## Agentless
Doosre purane tools (Puppet/Chef) ko **har server pe ek agent** pehle install karna padta tha. **Ansible ko nahi** — wo seedha **SSH** se ghus ke kaam karta, kaam khatam, nikal gaya. Koi permanent agent nahi = **agentless.**
- **Control node:** wo ek machine jahaan **Ansible install** hai aur jahaan se tu chalata.
- **Managed nodes (targets):** unpe **kuch nahi** chahiye — bas **SSH + Python** (jo Linux pe pehle se hote).
- 🎓 Plumber har ghar jaata (SSH), kaam karke nikal jaata — har ghar mein apni copy nahi chhodta.
- ⚠️ "Master" shabd Ansible mein **nahi** (wo K8s ka). Ansible = **control node.**

## Push-based
Ansible **PUSH** model: control node se tu command **push** karta servers pe (jab tu `ansible-playbook` chalata, tabhi). Target khud kuch nahi maangta. (Argo = pull, ulta — M7.)

## Building blocks
- **Inventory:** "**kahan** chalाना" — target servers ke IP + groups (`[webservers]`, `[db]`). File.
- **Playbook:** "**kya** chalाना" — YAML mein tasks ki list.
- **Module:** ek kaam ka idempotent aujaar (`apt`, `copy`, `service`).
- **Task:** ek module ka ek invocation (`apt: name=nginx state=present`).

## Idempotency: `ok` vs `changed`
Tu **"kya hona chahiye"** likhta (`state=present` = "nginx hona chahiye"), "kaise" nahi. Ansible khud check karta:
- **`changed`** = Ansible ne **kaam kiya** (install/start). Kuch badla.
- **`ok`** = pehle se theek tha, **kuch nahi kiya.**
- 🔑 **Healthy playbook:** 1st run `changed`, **2nd run sab `ok`** (changed=0) = convergence. Agar 2nd run pe bhi `changed` aaye → task non-idempotent (shel use kiya?).

## Module > shell
- `apt: state=present` = **smart** (check karta nginx hai? nahi to install, hai to chhodo). Idempotent.
- `shell: apt-get install...` = **andha** (har baar command chalata). Agar command ka side-effect hai (jaise `echo >> file` = har baar append: hello, hello hello...) → **duplicate/corruption.**
- 🔑 Jahaan module mile, shell mat use karo. Shell = last resort.

## Handlers + notify 🔔
Side-effect (jaise nginx restart) **sirf tab** karo jab kuch **sach mein badle.**
- Task pe `notify: Restart nginx` = **bell** (sirf `changed` pe bajegi).
- `handlers:` block = bell sunke chalta (playbook ke end mein, ek baar).
- Config **same** → copy task `ok` → notify nahi → **restart nahi → no downtime.** Config badli → `changed` → notify → restart.

## `--check`
`ansible-playbook --check` = dry-run (sirf dikhao kya `changed` hoga, karo mat). `--diff` = file changes line-by-line. = Ansible ka `terraform plan`.

---

# 🟧 M3 — PACKAGING (Docker)

## Image vs Container
- **Image** 📜 = **read-only blueprint** (code + libraries + runtime + config sab packed). Static, badalti nahi. = recipe / class.
- **Container** 🍛 = image ka **running instance** (apna process, network, filesystem, IP). = dish / object.
- 🔑 Ek image se **kai containers** ban sakte. Ek container stop ho jaaye to bhi wo **image nahi** ban jaata — wo bas ruka hua container hai.

## Layers
Dockerfile ki **har line = ek layer** (us kaam ke baad ka "save point" 💾). Image = layers ka stack.
- 🎓 Har kaam ke baad ek checkpoint save hota (video game jaise).

## Caching (M3 ka dil)
Build karte waqt Docker har layer ko **cache** karta. Dobara build pe: jis layer ka **input same** → **cache se utha leta** (skip, instant), jis pe **change** → wahi se aage rebuild.
- **Cache invalidation rule:** jis layer pe change aaya, **wo + uske NEECHE sab** rebuild. **Upar wali safe** (cache se). Cache top-down tootta, upar nahi chadhta.
- 🎓 Seedhi (stairs): upar wali seedhi chadh chuke, neechli todke banai → upar pe farak nahi.

## ⭐ Layer order trick (#1 skill)
2 cheezein image mein aati: **deps** (kam badalti) aur **code** (roz badalti).
- **Galat:** `COPY . .` (sab ek saath) → `RUN install`. Code badlo → poori layer tooti → install dobara → slow.
- **Sahi:** `COPY requirements.txt .` → `RUN pip install` → `COPY . .`. Deps ki **apni alag layer upar**; code **neeche.** Code badlo → sirf last layer tooti → **install cache se** → fast.
- 🔑 **"Kam-badalti UPAR, zyada-badalti NEECHE."** (`requirements.txt`/`package.json` = deps list jo project mein pehle se hoti.)

## Build context + .dockerignore
- `docker build .` ka **`.`** = **build context** (jo folder Docker ko diya). `COPY` **sirf is folder se** copy kar sakta — bahar ki file = no access.
- `.dockerignore` = `.gitignore` jaisा, files ko context se **hatata** (secrets, node_modules).
- 🐛 Gotcha: `RUN pip install` "file not found" → asli jad **context/COPY** (requirements.txt context mein thi hi nahi, ya .dockerignore ne block kiya). Error RUN pe dikha, jad upar.

## Registry
Image laptop pe banti — server tak kaise pohche? Beech mein **registry** (images ka GitHub/warehouse).
- **`docker push`** = laptop → registry (upload ⬆️). **`docker pull`** = registry → server (download ⬇️).
- Types: **Docker Hub** (public default), **GHCR** (GitHub), **ECR** (AWS private — capstone).

## Tags + `latest` trap
Image ko version-label dete: `myapp:v1`, `myapp:latest`.
- ⚠️ **`latest` mutable hai** — "newest" guarantee nahi, bas ek label jo move kar sakta. Aaj v1.0, kal koi v1.1 ko `latest` push kar de.
- **Problem:** server pe `pull latest` → kaunsi image? pata nahi. "Laptop pe chala, server pe crash" (dono ka latest alag). **Rollback impossible.**
- ✅ **Prod mein pinned version** (`v1.2.3`) ya **`@sha256:...` digest** (immutable, exact image hamesha). Capstone = `git-sha` tag.

---

# 🟦 M4 — ORCHESTRATION (Kubernetes)

## Mantra + Docker vs K8s
**K8s = "desired state batao, main 24/7 maintain karunga, chahe kuch bhi toote."** Docker ek container chala deta + bhool jaata. K8s extra deta: **self-heal + auto-scale + service/load-balance** (multi-machine orchestration).

## Reconciliation loop
K8s ke dimaag mein ek chowkidar **har waqt** poochta: "desired kya tha (replicas:3)? actual kitne (2)?" Mismatch → **naya pod** banata → 3. Loop **kabhi nahi rukता** — isiliye raat 2 baje bhi khud heal.

## Objects (chain)
```
Deployment 👔 → ReplicaSet → Pod 🍱 → Container 🍛
Service ☎️ (pods ke aage)
```
- **Deployment:** "N pod hamesha chahiye" — desired state rakhta, self-heal, scale, rolling update. **Tu hamesha Deployment banata** (bare pod nahi).
- **ReplicaSet:** Deployment seedhe pods nahi banata — wo ReplicaSet banata jo "N zinda rakho" karta. Naya version → naya ReplicaSet (rolling update).
- **Pod:** container ka wrapper (tiffin 🍱), **smallest deployable unit.** 1 container normal; 2+ = **sidecar** (helper, same network+storage). IP **badalta** (crash→naya→naya IP).
- **Bare pod** (Deployment bina) crash → **naya nahi banta** (koi desired state hi nahi → reconciliation kuch nahi karta).

## Service
Pods ke IP badalte rehte. **Service** = ek **stable IP/DNS naam** (kabhi nahi badalta) + **load balancer.** User Service ko request bhejta, Service healthy pods mein baant deti.
- Service pods ko **label/selector** se pehchanti (`app=myapp`). Naya pod same label → Service khud add kar leti.
- 🎓 Fixed phone number — delivery boys badalte, number same.

## Probes 🩺 (`Running` ≠ `Ready`)
- **`Running`** = container chal raha. **`Ready`** = app kaam ke liye taiyaar (DB connect, startup done).
- **Readiness probe:** "traffic ke ready ho?" Fail → Service se **hata** (traffic rok), pod **maarta nahi**.
- **Liveness probe:** "zinda ho? atka to nahi?" Fail → pod **maar ke restart**.
- 🐛 Pod Running par users ko app nahi → (1) **label/selector mismatch** ya (2) **readiness fail** (`READY 0/1`).

## Nodes: Master vs Worker
- **Master/control-plane** 🧠 = cluster ka dimaag (decisions, reconciliation). App pods **yahaan nahi** chalte.
- **Worker** 💪 = teri pods yahaan chalti.
- **Taint** (`NoSchedule`) = master pe "No-Entry board" 🚷 — aam pods ko rokta (master overload na ho).
- **Self-managed (kubeadm):** tu master khud sambhaalta (seekhne best, capstone). **EKS:** AWS control plane sambhaalta (aasaan, mehnga).

## Pod limits per node
Ek node pe pods ki limit — jo **pehle khatam** wo rok deti: **CPU**, **RAM**, **IP pool** (sneaky), **~110 hard cap.**
- 🐛 "RAM free hai par pod Pending" → IP exhaustion ya 110 cap.

## Label ke 2 istemaal (confuse mat karna)
- **Service `selector`** → **POD** ka label dhoondhta → **traffic** routing.
- **`nodeSelector`/affinity** → **NODE** ka label dhoondhta → pod ki **placement.**
- 🔑 Service→POD (traffic), Pod→NODE (placement). Same tool, alag kaam.

---

# 🟪 M5 — SIZING

## App ki bhookh → family
Har app kisi ek cheez ki zyada bhookhi: **CPU** (calculation), **RAM** (memory), **IO** (disk).
| Family | Bhookh | Use |
|--------|--------|-----|
| **M** | balanced | default web API |
| **C** | CPU | video encode, ML, crunching |
| **R** | RAM | Redis, in-memory DB |
| **I** | IO/disk | DB disk-heavy, file server |
| **P** | GPU | ML training |
| **T** | burstable/idle | chhote idle tools |

## Naming decode (`c6g.xlarge`)
`c` = family · `6` = generation (naya = behtar/sasta) · `g` = **Graviton** (AWS ARM chip, ~20% sasta+efficient) · `xlarge` = size.

## Right-sizing process
"Kitna chahiye pata nahi" → perfectly upfront pata nahi chalta. Isliye: **Estimate** (app type se guess, T/M se shuru) → **Measure** (asli usage dekho: `kubectl top`, CloudWatch) → **Right-size** (adjust).
- ⚠️ Sabse bada lena = **paisa waste** (idle pe bhi full bill). Cloud mein scale-up sasta → chhote se shuru.

## Requests vs Limits 🏭
- **`requests`** = minimum **guaranteed**; scheduler isse dekh ke node choose karta ("itna pakka milega").
- **`limits`** = maximum **ceiling** ("itne se aage nahi").
- **CPU limit cross → THROTTLE** (slow, zinda 🐢). **RAM limit cross → OOMKilled** (maar+restart, exit **`137`** 💀).
- 🔑 Reflex: `137`/`OOMKilled` = RAM kam.

## Cost: On-Demand / Reserved / Spot
- **On-Demand:** full price, jab chaaho (dev/test).
- **Reserved/Savings:** 1-3 saal commit, ~40-70% sasta (predictable baseline 24/7).
- **Spot:** ~70-90% sasta, par AWS **kabhi bhi cheen** sakta → **sirf stateless/disposable** (cheen gaya, K8s naya banata). **DB pe NEVER.**

## Autoscaling
- **HPA** (Horizontal Pod Autoscaler) = **pods** badhata (load↑ → 3→10). "Zyada waiter."
- **Cluster Autoscaler** = **nodes** badhata (pods fit nahi → naya node). "Zyada table."

## Gotchas
- **T-series CPU-credit trap:** idle→credits jama, spike→kharch. Credits khatam → CPU baseline pe **throttle** (app slow, confusing). T sirf kabhi-spike ke liye.
- **Headroom:** node 100% mat bharo (~20-30% buffer).
- **Pod Pending despite free CPU/RAM:** (1) fragmentation (request kisi ek node pe fit nahi), (2) maxPods/IP khatam, (3) taint/affinity block. → `kubectl describe pod` Events padho.

---

# 🟫 M6 — CI/CD (GitHub Actions)

## CI vs CD
- **CI** (Continuous Integration) = code ko **build + test + package** (image ready).
- **CD** (Continuous Delivery/Deployment) = us image ko **release + deploy** (staging→prod).

## Workflow (`.github/workflows/ci.yml`)
- **Trigger (`on`)** = kab chale (push/PR). **Job** = kaam ka group. **Runner (`runs-on`)** = machine (GitHub deta). **Step** = ek command.
- `run:` = shell command; `uses:` = ready-made action (marketplace se reuse).
- **Push-based:** event (push) → workflow trigger.

## Branch filter
```yaml
on: { push: { branches: [main] } }
```
Sirf **main** ke push pe chalega. **Feature branch push → trigger nahi** (filter mein nahi). PR trigger alag se add karte (merge se pehle test).

## Production essentials
- **Secrets:** AWS key code mein **never** → **GitHub Secrets** (encrypt, runtime inject) → `${{ secrets.AWS_KEY }}`.
- **SHA tag:** `docker build -t $ECR:${{ github.sha }}` — har commit = unique immutable image. (latest never.)
- **Test gate:** `pytest` build se pehle → fail → pipeline **ruk jaaye** (toota code prod mein nahi).

## ⭐ Manifest-update (CI → CD handoff)
2 raaste deploy ka:
- **Push (Raasta 1):** CI khud `kubectl apply` → cluster access **chahiye** (CI hack = cluster gaya).
- **Manifest-update (Raasta 2) 🌟:** CI sirf `deployment.yaml` mein **naya tag likh ke git push** — cluster ko **chhuti nahi.** **Argo** Git dekh ke deploy karti.
  - Faayde: CI ko **cluster access nahi** (security), **Git = truth** (rollback, audit).
- 🎓 CI = menu likhta; Argo = rasoiya jo menu padh ke banata. CI ko kitchen chaabi nahi.

## ⚠️ Loop trap
CI ka manifest-push khud ko dobara trigger kar sakta (infinite loop). Fix: **`paths: ['app/**']`** (sirf app code pe chale), **`[skip ci]`** commit, ya **`GITHUB_TOKEN`** built-in protection (PAT use kiya to loop).

---

# 🟥 M7 — GitOps (Argo CD)

## Core
**Git = single source of truth (desired state); Argo controller cluster ko Git se match karta** (reconciliation, desired=Git). Git badlo → cluster badlega. Cluster haath se badlo → Argo Git wala wapas.

## PUSH vs PULL
- **GitHub Actions = PUSH** 📤 (event → trigger, bahar chalti).
- **Argo CD = PULL** 📥 (cluster ke **andar** baithi, **khud Git se kheech** ke laati; koi use bhejta nahi).
- Beech mein **Git = handshake.** Actions likhti, Argo padhti.

## Application object
Argo ko naukri-parchi:
```yaml
kind: Application
spec:
  source: { repoURL, path: k8s, targetRevision: main }   # kahan/kaunsa folder/branch padho
  destination: { server, namespace }                      # kahan deploy
  syncPolicy: { automated: { selfHeal: true, prune: true } }
```

## Sync states
- **Synced** ✅ (cluster=Git) vs **OutOfSync** ⚠️ (cluster≠Git).
- **Healthy** 💚 (pods ready) vs **Degraded** ❤️‍🩹 (pods kharab).
- 🔑 Dono alag: Synced ho sakta par Degraded (deploy ho gaya, par pod crash).

## selfHeal vs prune
- **selfHeal** = cluster mein koi **badla** (drift) → Argo Git wala **wapas** laati (reconcile).
- **prune** = Git se kuch **delete** kiya → Argo cluster se bhi **delete** (warna orphan).

## Rollback
`git revert <bad-commit>` + `git push` → Argo purana version wapas deploy.
- **Behtar kyun:** Git history = deployment history (time machine), no panic/manual kubectl, audit trail, cluster khud reconcile.

## Actions + Argo = partners 🤝
Competitors nahi — **partners.** Actions = build (push), Argo = deploy (pull), **Git = handshake.** branch=environment pattern (`main`→prod, `staging`→staging).

## ⚠️ selfHeal gotcha (production)
`selfHeal:true` ke saath **manual `kubectl` change UD jaata** (Argo Git wala wapas laati). Emergency mein replicas badhana? → **Git badlo** (deployment.yaml→push), ya **auto-sync/selfHeal temporarily OFF** karke manual fix. GitOps = "Git ke through hi badlo."

---

# 🧵 5 Golden Threads (sab ko jodte hain)
1. **Reconciliation** — desired batao, tool maintain karta (Terraform/Ansible/K8s/Argo — ek idea, 4 tools).
2. **State bahar → compute disposable** — stateless app, TF state S3, K8s cattle, Spot.
3. **Preview before apply** — TF `plan`, Ansible `--check`, K8s `--dry-run`, CI test gate.
4. **Push vs Pull** — Ansible/Actions push, Argo pull (Git beech).
5. **Idempotent** — TF/Ansible/K8s (SET, not +=).

---

> **Aage:** M8 (Operate — observability/SRE/secrets/reliability/DR), M9 (Practical survival kit), M10 (Capstone). Recall: [DevOps-Master-Recall.md](DevOps-Master-Recall.md).
