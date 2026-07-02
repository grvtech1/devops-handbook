# Flashcard Deck — har module ke must-remember Q→A
### Roz 5 minute. Yehi ek aadat sabse zyada lifetime retention deti hai.

> **Kaise use karein (active recall):**
> 1. Sirf **left column (Sawaal)** dekho — right column ko haath/kaagaz se dhak lo.
> 2. Memory se jawab bolo (ya likho). *Retrieve karo, re-read mat karo.*
> 3. Phir right column kholo aur check karo. Galat nikla? Us card pe ⭐ lagao — kal usse pehle karo.
> 4. **Spaced schedule:** naya module → Day 1, Day 3, Day 7, Day 30. (See [00-INDEX §0.1](00-INDEX.md#01-how-to-remember-this-for-life--the-spaced-review-system).)
>
> 🇮🇳 **Hinglish intuition:** Flashcard = memory ka dumbbell. Ek baar uthana nahi, *baar-baar badhte gap pe* uthana muscle (yaaddaasht) banata hai.
>
> **Anki users:** har module table ko copy karke pipe (`|`) separator se import kar sakte ho — Front = Sawaal, Back = Jawab.

Deck size: **~190 cards** across M0–M9 + the connected-system (SYS) + both capstones. Jump: [M0](#m0--foundations) · [M1](#m1--terraform) · [M2](#m2--ansible) · [M3](#m3--docker) · [M4](#m4--kubernetes-core) · [M5](#m5--sizing--cost) · [M6](#m6--cicd) · [M7](#m7--gitops) · [SYS](#sys--the-connected-system) · [M8](#m8--observability--sre) · [M9](#m9--advanced-k8s-internals) · [CAP1](#cap1--capstone-url-shortener) · [CAP2](#cap2--capstone-microshop)

---

## M0 — Foundations
*Teaching chapter: [01-M0-foundations.md](01-M0-foundations.md)*

| Sawaal (Front) | Jawab (Back) |
|---|---|
| DevOps kya solve karta hai? | Dev (change chahiye) vs Ops (stability chahiye) ki wall todta — automation + Git se Speed, Safety, Repeatability. |
| 3 pillars kaunse hain? | **Speed** (jaldi ship), **Safety** (galti se bacho / rollback), **Repeatability** (har baar same result). |
| Provisioning vs Configuration? | Provisioning = khaali machine banao (**Terraform**). Configuration = us machine ke andar software install/setup (**Ansible**). |
| Packaging vs Orchestration? | Packaging = app + dependencies ek dabbe me band (**Docker**). Orchestration = bahut dabbe reliably chalao + heal (**Kubernetes**). |
| 4 layers aur unke tools? | Provisioning=Terraform, Configuration=Ansible, Packaging=Docker, Orchestration=Kubernetes. Mantra: **T→A→D→K**. |
| Stateful vs Stateless? | Stateful = data andar rakhta (maaro to data gaya) — DB. Stateless = kuch nahi rakhta (maaro, same replacement aa jaata) — API. |
| "App jo DB use karti hai woh stateful hai" — sahi? | **Galat.** App khud stateless hai; state DB me hai. App disposable, DB nahi. (Classic interview trap.) |
| Pets vs Cattle? | Pet = naam-wala, pyaar se sambhaala, mare to dukh (special server). Cattle = numbered, koi bhi ek jaisa, mare to naya (disposable pod). |
| Two loops kya hain? | Outer/setup (Terraform+Ansible, kabhi-kabhi, Pets) + Inner/delivery (push→CI→Argo→K8s, har push, Cattle). Dono cluster pe milte hain. |
| Error-type → layer reflex? | Error ka *type* location batata hai: UNREACHABLE=network, Permission denied=SSH key, OOMKilled=RAM, CrashLoopBackOff=app/logs. |
| Idempotency vs Reconciliation? | Idempotency = ek operation dobara chalao, kuch naya nahi (switch). Reconciliation = loop lagataar desired vs current fix karta (thermostat). |
| Junior vs senior — asli fark? | Commands Google/AI de dega. Engineer **DESIGN + DECIDE** karta — "kaise banaoge, kyun" — wahi interview me poochte hain. |
| Monolith vs microservices? | Monolith = ek bada app (simple start, deploy/scale tight). Microservices = chhote independent services (flexible, par network/ops complexity badhti). |

---

## M1 — Terraform
*Teaching chapter: [02-M1-terraform.md](02-M1-terraform.md)*

| Sawaal (Front) | Jawab (Back) |
|---|---|
| IaC kya hai? | Text files me infrastructure describe karna — Git me, reviewable, reproducible, auditable. No ClickOps. |
| Declarative vs imperative — ek line? | Declarative = "kya chahiye" batao (destination); imperative = "kaise karo" likho (steps). Terraform declarative hai. |
| `terraform plan` kya karta hai? | Safe dry-run — code + state + real AWS compare karta, kuch badalta nahi. Bill dekhna pehle, payment baad me. |
| `terraform apply` ke baad? | Real API calls, real cost, state update. Payment ho gayi — wapas nahi. |
| tfstate file kya hai, kyun critical? | Terraform ki diary 📔 — kya banaya, real cloud IDs. Gayi to TF andha — sab naya banata, duplicates. |
| tfstate S3 me kyun, laptop pe kyun nahi? | Laptop = sirf tumhare paas; teammate ka TF andha; simultaneous apply = state corrupt. S3 = shared almari + DynamoDB = taala 🔒. |
| Drift kya hai, recover kaise? | Reality badli, state intact. `plan` drift dikhata; `apply` reality ko code pe wapas laata. |
| Lost-state vs drift (trap!)? | Lost-state = diary jal gayi → TF zero sochta → sab rebuild → duplicates/orphans. Drift = diary intact, reality badli → `apply` se theek. **Alag recovery.** |
| Orphaned resource, fix? | Cloud me exist karta, state me nahi — bina maalik ki gaay. Bill aa raha. Fix: `terraform import aws_instance.web i-0abc...`. |
| Module = kya, kaise? | Black-box: inputs=variables, outputs=outputs, andar hidden. Root modules ko **wire** karta — modules aapas me directly baat nahi karte. |
| Dev vs prod me alag tfstate key kyun? | `destroy` dev me = sirf dev ka state; prod untouched. Ek shared key = dev destroy se prod offline. |
| Provisioner `remote-exec` kyun avoid? | Sirf creation pe chalta, re-apply pe nahi — not idempotent; failures state me invisible. Use Ansible instead. |
| `skip_final_snapshot = true` prod me kyun deadly? | Accidental `destroy` = DB permanently gone, no snapshot, no undo. Prod me hamesha `false`. |
| Idempotent apply — hook? | `count = 3` code 100 baar apply = 3 servers. Light switch: sau baar ON dabao, ON hi rehta — 100x brighter nahi. |

---

## M2 — Ansible
*Teaching chapter: [03-M2-ansible.md](03-M2-ansible.md)*

| Sawaal (Front) | Jawab (Back) |
|---|---|
| Ansible kya hai — ek line? | Agentless, push-based configuration management. SSH + Python se desired state enforce karta, safely repeatable. |
| Agentless ka matlab? | Managed nodes pe koi agent install nahi — sirf SSH + Python. Plumber kaam kare, apni copy chhode bina nikal jaaye. |
| Push vs pull — Ansible kahan? | Ansible = push (tum trigger karo, immediate SSH). Argo CD = pull (agent poll karta). Push = on-demand; pull = continuous. |
| Inventory file ka kaam? | "Kahan" — managed nodes ki list + groups. Playbook = "kya karo"; inventory = "kahan karo". |
| `ok` vs `changed` (interview)? | `ok` = already correct, kuch nahi kiya. `changed` = Ansible ne fix kiya. 2nd run me `changed=0` = convergence = idempotency ka proof. |
| Module vs shell — kyun module? | Module smart: pehle check, phir act. Shell andha: blindly chalata (`echo >> file` har run append = corruption). Shell tabhi jab module na ho, `creates:`/`when:` se guard. |
| Handler kya, kyun regular task nahi? | Handler sirf `changed` pe fire karta (notify 🔔 se). Config same → no restart → no downtime. Regular task har run restart = needless downtime. |
| `--check` kya karta hai? | Dry-run — kya WOULD change, kuch badalta nahi. Ansible ka `terraform plan`. |
| kubeadm init pe `creates:` guard kyun? | "Yeh file exist karti hai to kaam ho chuka — skip". Bina guard re-run = doosra `kubeadm init` cluster corrupt kar sakta. |
| 3-playbook K8s order kyun? | common → master → workers. Dependency chain: containerd pehle, phir `kubeadm init`, phir workers join. Order enforce karo. |
| EKS/RDS pe Ansible kyun kam? | EKS = no master EC2 to SSH; RDS = managed, no host. Ansible ka job evaporate. Rakho: bastion config, fleet ops, on-prem. |
| ansible-vault kya karta hai? | Secrets file AES-256 encrypt. Git me plaintext creds kabhi nahi. Runtime `--ask-vault-pass` se decrypt. |
| Convergence — definition + proof? | System desired state reach karke hold kar raha. Proof: 2nd run = `changed=0`. Golden interview answer. |

---

## M3 — Docker
*Teaching chapter: [04-M3-docker.md](04-M3-docker.md)*

| Sawaal (Front) | Jawab (Back) |
|---|---|
| Container kya hai — kernel level? | Linux process, isolated via **namespaces** (private views) + **cgroups** (CPU/RAM limits). Host kernel share; no guest OS. |
| Container vs VM — 3 differences? | Container: ms start, MBs, 100s/host, shared kernel. VM: minutes, GBs, ~10/host, own kernel. Flat vs makaan. |
| Image vs container — hook? | Image = recipe (read-only blueprint, `docker build`). Container = pakwaan (running instance, `docker run`). Ek image → kai containers. |
| Layer kya hai — hook? | Har Dockerfile instruction = ek immutable layer. Cache hit = instant. Save-point 💾. |
| Cache invalidation kab? | Koi instruction/input change → us layer pe cache miss → **neeche ke saare** layers rebuild. Top-down only, upar kabhi nahi. |
| Layer-order trick? | Dependencies (rarely change) **upar**, code (roz badalta) **neeche**. Code edit → sirf last COPY rebuild; `pip install` cached. 2 min → 3 sec. |
| Build context + .dockerignore kyun? | Context = daemon ko bheji directory (`docker build .`). `.dockerignore` se `node_modules/`, `.git/`, `.env` exclude — chhota context, secrets safe. |
| Multi-stage build kyun? | Build stage = bada toolchain; runtime stage = sirf output + prod deps. Build stage discard → image 60-90% chhota, attack surface kam. |
| `latest` tag trap? | Mutable label — jo last push kare pointer move. 2 nodes alag time pull → different images; rollback impossible. Use git SHA: `myapp:abc1234`. |
| RUN vs CMD vs ENTRYPOINT? | RUN = build-time (layer). CMD = runtime default (override-able). ENTRYPOINT = fixed executable. ENTRYPOINT + CMD = fixed + swappable args. |
| ImagePullBackOff — diagnose? | `kubectl describe pod` → Events. (1) tag nahi → `manifest unknown`; (2) auth → `pull access denied` → imagePullSecret/ECR IAM; (3) network → timeout → NAT/SG. |
| Compose DNS — kaise? | Docker embedded DNS service names → container IPs. `web` → `db:5432`, IP yaad nahi karna. K8s Service ka same idea. |
| `docker history` kab? | Har layer + size + command dekhne ke liye — bloated image debug ya audit. |

---

## M4 — Kubernetes Core
*Teaching chapter: [05-M4-kubernetes-core.md](05-M4-kubernetes-core.md)*

| Sawaal (Front) | Jawab (Back) |
|---|---|
| Reconciliation loop kya karta? | Desired vs current ka fark dhoondh ke band karta — 24/7. Chowkidar jo hamesha ginta. |
| Pod vs Container? | Pod = tiffin 🍱 (shared network+storage). Container = andar ki dish (app process). Ek pod me ek/zyada containers. |
| Bare pod prod me kyun nahi? | Bare pod ke upar koi desired state nahi — crash = K8s naya nahi banata. Hamesha Deployment. |
| Deployment→ReplicaSet→Pod — tum kisse baat karte ho? | Sirf Deployment (scale, rollback). ReplicaSet+Pod K8s khud manage karta. |
| Service kyun zaroori? | Pod IP har baar badle; Service = stable virtual IP + DNS jo kabhi nahi badalti. Fixed phone number ☎️. |
| Labels ke 2 use? | (1) Traffic routing: Service selector → pod label. (2) Placement: pod nodeSelector → node label. |
| Readiness fail = ? | Pod endpoints se hata, traffic band — kill NAHI. Pass hone pe wapas add. Traffic signal 🚦. |
| Liveness fail = ? | Pod kill + restart — stuck/deadlock hatao. Pulse check 💓. |
| Running vs Ready? | Running = process alive. Ready = readiness pass, traffic milega. READY 0/1 = alive par probe fail → koi traffic nahi. |
| Master pe app pods kyun nahi? | NoSchedule taint 🚷. App pods master overload karein → control plane crash → poora cluster mute. |
| Pod Pending, CPU/RAM free — 3 wajah? | (1) IP pool khatam, (2) 110-pod cap hit, (3) nodeSelector/taint mismatch. Dekho: `kubectl describe pod` Events. |
| Deployment vs StatefulSet? | Deployment = stateless cattle 🐄 (koi bhi pod same). StatefulSet = stateful pet 🐶 (stable naam pod-0/1, apna PV). DB → RDS behtar. |
| PersistentVolume kya? | Pod ke bahar ki disk — locker 🔒 jo pod maarne pe bhi zinda. Naya pod same PV se judta, data safe. |
| k3s vs kubeadm vs EKS? | k3s = free-tier/studio flat. kubeadm = khud-banaya ghar. EKS = managed flat. |
| `imagePullPolicy` trap? | Mutable tag (`:latest`/`:prod`) + `IfNotPresent` = node purani cached image chalata rahega, deploy "hua" par pod purana. Fix: immutable SHA tag. |
| `restartPolicy` — Deployment vs Job? | Deployment/StatefulSet = `Always` (hamesha restart). Job/CronJob = `OnFailure`/`Never` (success pe ruk jao). Isliye web pod wapas aata, complete Job nahi. |
| Service ke 4 port fields? | `containerPort` (app sun raha) = `targetPort` (Service kis pod-port pe bheje) ← `port` (Service ka apna port) ← `nodePort` (bahar ka gate, NodePort only). `targetPort` ≠ `containerPort` = #1 "connection refused" bug. |
| initContainer vs sidecar? | initContainer = main se **pehle** chal ke exit (wait-for-DB, migration); fail = pod `Init:0/1` atka. Sidecar = main ke **saath** chalta rehta (log shipper, proxy). |

---

## M5 — Sizing & Cost
*Teaching chapter: [06-M5-sizing-and-cost.md](06-M5-sizing-and-cost.md)*

| Sawaal (Front) | Jawab (Back) |
|---|---|
| Instance family kaise choose? | Pehle "bhookh": balanced=M, CPU=C, RAM=R, extreme RAM=X, IO=I, GPU=P/G, spiky-dev=T. Family galat to koi size nahi bachata. |
| `m6g.xlarge` decode? | m=general | 6=6th gen | g=Graviton ARM (~20% sasta) | xlarge=4 vCPU/16 GB. |
| T-series CPU-credit trap? | Idle pe credits earn, burst pe spend. Credits=0 → baseline cap (~10-20%) pe lock — app slow, no error. Dekho CloudWatch `CPUCreditBalance`. |
| exit 137 = ? | OOMKilled — RAM limit cross. `describe pod` confirm; `top pod` actual dekho; `memory.limits` badhao ya R-family. |
| CPU throttle kaise pehchano? | Silent slow API, no error, no restart. CPU limit cross → process slow par alive. Limits badhao ya C-family. |
| requests vs limits? | request = reserved seat (scheduler placement). limit = deewar (CPU cross→throttle alive; RAM cross→OOMKilled/137). Dono zaroori prod me. |
| Fragmentation → Pending kyun? | Total free kaafi, par koi *ek* node poori request fit nahi karta. Bus me seats hain par saath nahi. CA naya node add karega. |
| On-Demand vs Reserved vs Spot? | On-Demand=dev/unpredictable. Reserved/Savings=24/7 baseline (40-70% off). Spot=stateless only (70-90% off, 2-min warning — DB pe kabhi nahi). |
| HPA kya scale karta? | Pod count — CPU%/custom metric pe. Nodes nahi. |
| Cluster Autoscaler kab? | Jab pod Pending (koi node fit nahi) → naya node. Chain: HPA → pods Pending → CA → node → schedule. |
| VPA kya, conflict? | Pod ke requests vertically resize (restart hota). HPA ke saath CPU-target conflict = oscillation. VPA recommendation-mode me rakho. |
| Headroom kyun? | 20-30% buffer: spike se pehle HPA react, rolling update ke liye, OS/kubelet overhead. 100% bhara = Pending. |
| DB sizing rule? | Primary prod DB kabhi K8s pod me nahi — RDS/Aurora. Backups/failover/patching AWS sambhaale. |

---

## M6 — CI/CD
*Teaching chapter: [07-M6-cicd.md](07-M6-cicd.md)*

| Sawaal (Front) | Jawab (Back) |
|---|---|
| CI vs Delivery vs Deployment (3 line)? | CI = test+build+package har push. Delivery = artifact hamesha prod-ready, human approve. Deployment = koi gate nahi, auto prod. |
| Runner kya, kyun ephemeral? | Fresh VM jo ek job chalata phir khatam. Koi prior state nahi → deterministic. Isliye har run deps install (ya cache). |
| `github.sha` tag kyun, `latest` nahi? | Immutable — ek SHA hamesha same image. Rollback exact. `latest` mutable = rollback ambiguous. |
| `needs:` kya karta? | Job dependency — build-push tab chale jab test pass. Test fail = build-push cancel. |
| Manifest-update pattern? | CI cluster ko chhuta nahi — sirf `k8s/deployment.yaml` me tag update + Git commit. Argo andar se apply karta. **CI ke paas cluster creds nahi.** |
| CI infinite loop + 3 fixes? | CI manifest commit → woh CI trigger → loop. Fix: (1) `paths:` filter, (2) `[skip ci]` in message, (3) `GITHUB_TOKEN` (bot commit re-trigger nahi karta). |
| `contents: write` kyun, dono jagah? | TOKEN default read-only. YAML me `permissions: contents: write` AND repo Settings→Actions→Read+write. Ek bhi miss = "Permission denied". |
| Matrix build kya karta? | Ek job def → N parallel runners. Wall-clock = sabse slow service (sum nahi). 4+6+3 min sequential vs 6 min parallel. |
| `if:` condition kab? | Push jobs ko PR pe rokne: `if: github.ref == 'refs/heads/main'`. PR pe sirf test, push nahi. |
| CI se seedha `kubectl apply` kyun nahi? | CI ke paas cluster creds honge — compromised runner = prod access. Manifest-update me blast radius = sirf Git repo. |
| `uses:` vs `run:`? | `uses:` = tested marketplace action (edge cases handle). `run:` = khud ka shell. Checkout/auth/login ke liye `uses:` prefer. |
| Test gate kya karta? | Fail = kuch ship nahi hota. Broken code image hi nahi banti. |

---

## SYS — The Connected System
*Teaching chapter: [09-connected-system.md](09-connected-system.md)*

| Sawaal (Front) | Jawab (Back) |
|---|---|
| Do loops + kahan milte hain? | Outer (Terraform+Ansible, infra, Pets, rarely) + Inner (CI+Docker+Argo+K8s, delivery, Cattle, every push). Milte hain **Kubernetes cluster** pe. |
| Bridge 1 + failure? | Terraform→Ansible: `terraform output` IPs → `inventory.ini`. Toot: wrong IP → `UNREACHABLE`. |
| Bridge 2? | Ansible→K8s: 3 playbooks (common→init→join) → live cluster. Toot: no containerd/wrong token → join fail. |
| Bridge 3? | Docker→Pod: image ECR push, kubelet pull. Toot: bad tag/no auth → `ImagePullBackOff`. |
| Bridge 4? | git push→CI: `on: push:` trigger. Toot: wrong branch filter → kabhi nahi chalta. |
| Bridge 5 (⭐) kya + kyun star? | CI→Git manifest: CI tag update + commit, cluster **seedha nahi chhuta**. Interviewers yahi probe karte. Isliye CI ko cluster creds nahi chahiye. |
| Bridge 6? | Git→Argo→K8s: Argo changed manifest pull + apply → rolling update. Toot: `OutOfSync` never syncs → purana version. |
| Bridge 7? | Pod→Service→User: EndpointSlice ready pods route; NodePort/Ingress expose. Toot: no ready pods → 503. |
| Bridge 8? | Pod→RDS: `psycopg2 → rds:5432` env-var host. Toot: wrong SG/password → timeout/auth error. |
| Thread 1 — Reconciliation? | Loop desired vs current compare karke drive karta — hamesha. TF/Ansible manually; K8s/Argo continuously. |
| Thread 2 — State outside? | Durable state (tfstate, DB) compute se bahar → pods/servers Cattle. Kill+replace freely, no data loss. |
| Thread 3 — Preview before apply? | `terraform plan`, `ansible --check`, `kubectl --dry-run`, CI test gate. Bill dekho phir payment. |
| Thread 4 — Push vs Pull? | Push (Ansible/Actions): initiator ke paas target creds. Pull (Argo): agent andar se Git read, creds bahar nahi. Git = neutral middle. |
| Thread 5 — Idempotency? | Same op dobara = same result, no duplicates. `apply` 2x = same VPC. Switch, counter nahi. |
| Blast-radius boundary? | Har layer ka alag owner. Design karte waqt: "kis owner ko batana? Yeh box fail = kya toot ta?" = architecture review ka 80%. |

---

## M8 — Observability & SRE
*Teaching chapter: [10-M8-observability-sre.md](10-M8-observability-sre.md)*

| Sawaal (Front) | Jawab (Back) |
|---|---|
| 3 pillars + har ek ka sawaal? | Metrics (Prometheus): kitna/kitne/kitni-baar over time? Logs (Loki): is ek request me exactly kya hua? Traces (OTel+Jaeger): time kahan/kis span me gaya? |
| Prometheus pull model? | Prometheus khud app ka `/metrics` scrape karta har ~15s — push nahi. Same pull idea jaise Argo CD. |
| Counter vs Gauge? | Counter sirf badhta, restart pe reset → hamesha `rate()` se query. Gauge upar-neeche (memory, queue) → raw value theek. |
| Histogram latency ke liye kyun? | Buckets store karta (`<100ms`, `<500ms`) → p50/p95/p99 nikal sakte. Average se p99 nahi milta. |
| Cardinality explosion kya? | High-cardinality label (`user_id`, `order_id`) → millions of series → Prometheus RAM explode → OOMKilled. Labels bounded rakho. |
| SLI / SLO / SLA? | SLI = jo measure karo. SLO = internal target (stricter). SLA = external contract (penalty). SLO hamesha SLA se strict (buffer). |
| Error budget + governance? | `100% − SLO`. Budget bacha → risky features ship. Budget khatam → sirf reliability. Number politics ko replace karta. |
| 4 Golden Signals? | Latency, Traffic, Errors, Saturation. Yeh 4 = almost any service ki health picture. |
| Alert on symptoms vs causes? | Cause: `CPU>80%` (user ko feel nahi = fatigue). Symptom: `error_rate>1% for 5m` (user suffer). Symptom pe page; cause dashboard pe silent. |
| `for: 5m` threshold se important kyun? | Threshold = kab trigger; `for:` = kab page. 30s spike self-resolve — bina `for:` 3am fake page. Real incidents persist. |
| Structured logging kyun? | JSON + `trace_id` har line → queryable, trace se join, no code change during incident. `print()` = 3am regex hell. |
| p99 vs average? | Average tail chhupata (99% fast, 1% dying = average theek dikhega). p99 real user pain dikhata. |

---

## M9 — Advanced K8s Internals
*Teaching chapter: [11-M9-advanced-k8s-internals.md](11-M9-advanced-k8s-internals.md)*

| Sawaal (Front) | Jawab (Back) |
|---|---|
| Startup probe kya karta? | Boot ke dauran liveness+readiness ko hold karta; slow-start apps ko CrashLoopBackOff se bachata. |
| Readiness fail consequence? | Pod EndpointSlice se remove — traffic band, pod alive, restart NAHI. |
| Liveness fail consequence? | Container restart (kill) — SIGTERM phir SIGKILL. |
| Liveness footgun kya? | Liveness me DB/external check — DB slow → saare pods cascade restart. DB check readiness me daalo. Smoke detector jo poori building khali kara de. |
| QoS Guaranteed kaise? | requests == limits (CPU aur memory dono, dono set). Last to evict. |
| QoS BestEffort kab? | Koi requests/limits set nahi. Memory pressure pe pehle evict. Titanic lifeboat priority sabse neeche. |
| Graceful shutdown race + fix? | SIGTERM aur EndpointSlice-removal async — SIGTERM pehle aa sakta jab requests abhi aa rahe. Fix: `preStop: sleep 5`. |
| HPA formula? | `ceil(currentReplicas × currentMetric / targetMetric)`. ceil = round up. |
| HPA scale-down slow kyun? | 300s stabilization window — transient drop pe pod hataane se flapping rokta. |
| HPA unknown/50% kab? | metrics-server nahi, ya pods me requests set nahi. |
| CoreDNS FQDN format? | `<service>.<namespace>.svc.cluster.local` → ClusterIP resolve. |
| nginx Ingress 404 — pehla check? | Request ka `Host:` header Ingress rule ke `host:` se match karta? `curl -H 'Host: ...'` se test. |
| EndpointSlice kya karta? | Ready pods ka live list; kube-proxy isse padh ke iptables/IPVS rules banata. |
| iptables vs IPVS kab? | 500+ Services pe: iptables O(n), IPVS O(1) hash — measurably faster at scale. |
| RBAC blast radius? | Pod cluster-admin + compromise = attacker ko full cluster (Secrets, pod create, data delete). Least privilege do. |

---

## CAP1 — Capstone: URL Shortener
*Chapter: [12-capstone-url-shortener.md](12-capstone-url-shortener.md)*

| Sawaal (Front) | Jawab (Back) |
|---|---|
| Kaunsi 3 APIs? | `POST /shorten` → {short}; `GET /{code}` → 302 redirect; `GET /health` → {status:ok}. |
| State pods me kyun nahi? | Pod delete = data gone. RDS = managed, private subnet, survives pod deaths. App stateless = cattle. |
| S3 backend + DynamoDB lock? | S3 = remote tfstate (team-safe); DynamoDB = lock (ek waqt ek apply). |
| CI me `github.sha` kyun? | Immutable, traceable. Rollback exact (git revert → purana SHA → Argo same deploy). `latest` = ambiguous. |
| CI infinite loop kaise rokein? | `paths: ['app/**']` filter + `[skip ci]` tag — dono layers. |
| Argo `selfHeal: true`? | Manual `kubectl` change detect karke ~3 min me Git state restore. |
| `type: LoadBalancer` self-managed pe pending kyun? | No cloud-controller-manager → koi ELB provision nahi. Fix: NodePort (ya MetalLB). |
| `publicly_accessible = false` RDS benefit? | RDS ka public IP nahi; internet se unreachable even if SG galat. Defense-in-depth. |
| Rollback kaise? | `git revert <bad-commit>` → Argo new SHA detect → rolling update to old image. No manual kubectl. |
| `terraform destroy` VPC pe hang — cause? | K8s LoadBalancer ne AWS ELB banaya jo TF track nahi karta. Fix: K8s resources pehle delete. |
| kubeadm idempotency Ansible me? | `args: creates: /etc/kubernetes/admin.conf` — file exist = task skip. |
| Setup loop vs delivery loop? | Setup = terraform+ansible (ek baar, slow). Delivery = push→CI→Argo (har push, automated). |
| Self-managed vs EKS — honest jawab? | Self-managed = internals seekhe (etcd, kubeadm, CNI). Prod me EKS — control-plane HA AWS manage karta. |

---

## CAP2 — Capstone: MicroShop
*Chapter: [13-capstone-microshop.md](13-capstone-microshop.md)*

| Sawaal (Front) | Jawab (Back) |
|---|---|
| Inter-service call kaise? | order-api → `http://catalog-api:8000` via K8s Service DNS; CoreDNS short name resolve same namespace me. |
| CoreDNS FQDN cross-namespace kyun? | Short name sirf same namespace. Alag namespace: `catalog-api.default.svc.cluster.local`. |
| Matrix CI 3 services parallel? | `strategy.matrix.service: [catalog-api, order-api, frontend]` — 3 runners parallel; ~90s vs ~4 min sequential. |
| `needs:` update-manifests me kya guarantee? | Sirf tab chale jab SAARI matrix jobs pass — partial manifest update se inter-service contract break rokta. |
| Cache-aside (Redis)? | Read → Redis check; miss → Postgres; result Redis me TTL pe store. Write on miss only. |
| Redis pod kill = cache data? | Sab wipe (no PVC). App next miss pe Postgres fallback. Lab ke liye acceptable. |
| App-of-apps kab better? | Multiple teams independent deploy — per-service rollback/sync/RBAC chahiye tab. |
| `for_each toset(...)` se? | Set me listed ECR repos bante; ek string add = ek naya repo, baaki unchanged. |
| Star-moment test command? | `kubectl exec -it deploy/order-api -- curl http://catalog-api:8000/products/p1` — response = inter-service DNS kaam kar raha. |
| Redis fail pe try/except? | DB se serve (fallback), cache miss treat. Users ko 500 nahi. |
| Per-service Golden Signals kyun? | Frontend slow = catalog lag ya frontend bug? Per-service latency/error bina root cause guess. |
| catalog-api order-api se pehle deploy kyun? | order-api startup pe catalog call karta; catalog ready nahi to order readiness fail. |

---

*Deck khatam. Roz ek module + ⭐-wale purane cards. 30 din me → [09 ka blank-page test](09-connected-system.md) do: 2 loops + 8 bridges + 5 threads bina dekhe.*

*Back to [00-INDEX](00-INDEX.md) · Full glossary + reflex tables → [16-reference-appendix](16-reference-appendix.md)*
