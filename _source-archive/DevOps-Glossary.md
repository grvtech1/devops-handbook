# 📖 DevOps Glossary — Har Term, Simple Matlab + Memory Hook

> Koi bhi term aaye → yahaan dekho. Format: **Term** → *simple Hinglish matlab* → 🎓 *memory hook*.
> Module ke hisaab se grouped (taaki context ke saath yaad rahe).

---

## 🟦 M0 — Foundation

| Term | Matlab (simple) | 🎓 Hook |
|------|-----------------|---------|
| **DevOps** | Code→live ka poora raasta automate (speed+safety+repeatable) | recipe+machine, har baar same |
| **Provisioning** | Infra (machine/network) **banana** | ghar khada karna |
| **Configuration** | Machine ke **andar** software setup | kitchen mein stove-masale |
| **Packaging** | App ko box/image mein **pack** | dish ko dabbe mein |
| **Orchestration** | Boxes ko **chalana + sambhalna** | manager |
| **Stateful** | Andar keemti **data zinda** — phenko to gaya | Pet 🐶 (paalo) — DB |
| **Stateless** | Andar **kuch nahi** — har request fresh | Cattle 🐄 (replace) — web server |
| **Pet vs Cattle** | Paalo-fix karo VS maaro-naya banao | bimaar gaay = nayi gaay |

---

## 🟩 M1 — Terraform

| Term | Matlab | 🎓 Hook |
|------|--------|---------|
| **IaC** (Infra as Code) | Infra ko **code** mein likho (console click nahi) | blueprint |
| **Terraform** | Infra banane wala tool (declarative+state) | builder 🏗️ |
| **Declarative** | "Kya chahiye" batao (kaise = tool sochta) | "3 servers chahiye" |
| **Imperative** | "Kaise karna" har step khud likho | ulta declarative |
| **State / `tfstate`** | Terraform ki **diary** — "kya banaya" + IDs | diary 📔 |
| **Idempotent** | Kitni baar bhi chalao, result same (SET, not +=) | switch dabao, on hi rahega |
| **`init`** | Setup: provider/plugins download | project shuru |
| **`plan`** | **Preview** — kya badlega (karta nahi) | bill dekhna 🧾 |
| **`apply`** | Asal mein banata/badalta | payment 💳 |
| **Provider** | AWS/Azure se baat karne wala plugin | adapter |
| **Resource** | Ek cheez jo banti (EC2, VPC) | ek eent |
| **Backend** | State kahan rakhi (local/S3) | diary ki almari |
| **Remote state** | State S3 (shared) mein, laptop pe nahi | shared almari |
| **Lock** (DynamoDB) | Ek waqt mein ek hi `apply` (corruption rok) | taala 🔒 |
| **Drift** | Reality bahar se badli, **state intact** | menu wahi, dish koi badal gaya |
| **Lost-state** | State file **gayi** → TF andha → duplicate | diary jal gayi |
| **Orphaned resource** | Zinda hai, par TF ko pata nahi (maalik nahi) | bina maalik ki gaay |
| **`user_data` / cloud-init** | Boot pe ek-baar chalne wala startup script | ghar ban-te bulb laga do |
| **Provisioner** | TF ke andar shell chalana (last resort 🚫) | builder se interior — galat |

---

## 🟨 M2 — Ansible

| Term | Matlab | 🎓 Hook |
|------|--------|---------|
| **Ansible** | Server ke andar config karne wala (agentless) | setup-wala 🔧 |
| **Agentless** | Target pe agent install nahi (sirf SSH+Python) | plumber, copy nahi chhodta |
| **Agent** | Server pe permanent chowkidar (Puppet/Chef mein) | — (Ansible mein NAHI) |
| **Control node** | Jahan Ansible install + tu chalata | tera HQ |
| **Managed node** | Target server (sirf SSH+Python) | jahan kaam |
| **Bastion** | Security gate/jump server (private tak pohchne) | society ka main gate 🏰 |
| **Push model** | Control node **bhejta** (tab chale jab tu chalao) | maalik bulata |
| **Pull model** | Target **khud kheech** ke laata | naukar khud aata |
| **Inventory** | "Kahan" — server IPs + groups | guest list |
| **Playbook** | "Kya" — YAML tasks ki list | recipe |
| **Module** (ansible) | Ek idempotent aujaar (`apt`,`copy`) | ek tool |
| **Task** | Ek module ka ek invocation | recipe ki ek line |
| **`state=present`** | "Ye hona chahiye" (check-then-act) | declarative-ish |
| **`ok`** | Pehle se theek, kuch nahi kiya | — |
| **`changed`** | Ansible ne kaam kiya (kuch badla) | — |
| **Convergence** | 2nd run pe sab `ok` (healthy) | sab set |
| **Handler** | Special task, sirf `notify` pe chalta | bawarchi (bell pe) |
| **`notify`** | Bell — sirf `changed` pe bajegi | 🔔 |
| **`--check`** | Dry-run (dikhao, karo mat) | Ansible ka `plan` |

---

## 🟧 M3 — Docker

| Term | Matlab | 🎓 Hook |
|------|--------|---------|
| **Docker** | App ko image mein pack karne wala | packer 📦 |
| **Image** | Read-only blueprint (code+libs+runtime) | recipe 📜 / class |
| **Container** | Image ka running instance | dish 🍛 / object |
| **Layer** | Dockerfile ki har line = ek save-point | game checkpoint 💾 |
| **Cache** | Pichla kaam dobara na karo, save se utha | kal ka aata |
| **Cache invalidation** | Change ke point se NEECHE sab rebuild | seedhi: neeche toot |
| **Build context** | `docker build .` ka folder (`.`) | jis box se COPY |
| **`.dockerignore`** | Context se files hatao | .gitignore jaisा |
| **Registry** | Images ka GitHub/warehouse | app store |
| **`push`/`pull`** | Laptop→reg / reg→server | upload/download |
| **Docker Hub / GHCR / ECR** | Public / GitHub / AWS registry | alag warehouses |
| **Tag** | Image ka version-label (`:v1`) | sticky note |
| **`latest` (trap)** | Mutable label, "newest" guarantee nahi | jhootha note ⚠️ |
| **SHA / digest** | Image ka immutable fingerprint | exact ID |
| **Mutable infra** | Machine ko badalte rehte (runtime config) | Pet 🐶 + Ansible |
| **Immutable infra** | Sab image mein bake, machine replace karo | Cattle 🐄 + Packer |
| **Packer** | Image (AMI) banane wala (build-time bake) | model-ghar banata |
| **AMI** | AWS machine image (EC2 ka blueprint) | EC2 ki recipe |

---

## 🟦 M4 — Kubernetes

| Term | Matlab | 🎓 Hook |
|------|--------|---------|
| **Kubernetes / K8s** | Orchestrator (run+heal+scale) | manager 👨‍🍳 |
| **Reconciliation loop** | Desired vs current, mismatch→fix (24/7) | chowkidar |
| **Desired state** | "Kya hona chahiye" (replicas:3) | menu/order |
| **Current state** | Abhi asal mein kya chal raha | reality |
| **Deployment** | Desired state rakhta, self-heal, scale | manager 👔 |
| **ReplicaSet** | "N pods zinda rakho" karta (Deployment banata) | floor-manager |
| **Pod** | Container ka wrapper, smallest unit (1+ container) | tiffin 🍱 |
| **Sidecar** | Pod mein helper container (saath chale) | motorcycle sidecar |
| **Service** | Stable IP/DNS + load balancer (pods ke aage) | fixed phone ☎️ |
| **Label** | Pod/node pe sticker (`app=myapp`) | naam-patti 🏷️ |
| **Selector** | Service jis label ko dhoondhe (→pod, traffic) | "ye mera" |
| **`nodeSelector`/affinity** | Pod jis node-label pe chale (→placement) | "main yahan baithunga" |
| **Readiness probe** | "Traffic ke ready?" fail→traffic rok (mara nahi) | 🚦 |
| **Liveness probe** | "Zinda?" fail→maar ke restart | 💓 |
| **Running vs Ready** | Chal raha VS kaam ke taiyaar | dukaan khuli vs galla set |
| **Node** | Cluster ki ek machine | ek ghar |
| **Master/Control plane** | Cluster ka dimaag (decisions) | manager office 🧠 |
| **Worker** | Pods yahan chalti | factory floor 💪 |
| **Taint** | Node pe "No-Entry board" (pods rok) | 🚷 |
| **Toleration** | Pod ka "pass" jo taint ko tolerate kare | VIP pass |
| **`NoSchedule`** | Taint ka type — yahan schedule mat karo | — |
| **kubeadm** | Self-managed K8s banane ka tool | khud ghar banao |
| **EKS** | AWS-managed K8s (control plane AWS ka) | flat kiraye pe |
| **Namespace** | Cluster ke andar logical separation | alag kamre |
| **kubectl** | K8s se baat karne ka command | remote control |
| **NodePort** | Service ko bahar expose karna (port) | self-managed ka darwaza |

---

## 🟪 M5 — Sizing

| Term | Matlab | 🎓 Hook |
|------|--------|---------|
| **Sizing / Right-sizing** | Sahi CPU/RAM/machine chunna | naap ke kapde |
| **Instance family** | Machine ka type (kaam ke hisaab se) | — |
| **M/C/R/I/P/T** | general/CPU/RAM/IO/GPU/burst | bhookh ke hisaab |
| **Generation** | Naming mein `6` = 6th gen (naya=behtar) | — |
| **Graviton (`g`)** | AWS ARM chip (~20% sasta+efficient) | — |
| **Burstable (T)** | Sasta, credits pe chalta (spike ke liye) | credit system |
| **Requests** | Minimum guaranteed (scheduling) | reserved seat |
| **Limits** | Maximum ceiling | "room se bahar mat" |
| **Throttle** | CPU limit cross → slow (mara nahi) | 🐢 |
| **OOMKilled / `137`** | RAM limit cross → maar ke restart | 💀 RAM kam |
| **On-Demand** | Full price, jab chaaho | dev/test |
| **Reserved** | Commit (1-3yr), ~40-70% off | baseline 24/7 |
| **Spot** | ~70-90% off, AWS cheen sakta | stateless only |
| **HPA** | Pods badhata (load↑) | zyada waiter |
| **Cluster Autoscaler** | Nodes badhata (pods fit nahi) | zyada table |
| **CPU credits** | T-series ka burst budget (khatam→throttle) | — |
| **Headroom** | Buffer (100% mat bharo) | ~20-30% khaali |
| **Fragmentation** | Total free hai par ek node pe fit nahi | bus seat saath nahi |
| **EBS / IOPS / gp3 / io2** | AWS disk / disk-speed / disk-types | storage knob |

---

## 🟫 M6 — CI/CD

| Term | Matlab | 🎓 Hook |
|------|--------|---------|
| **CI** | Build + test + package (image ready) | — |
| **CD** | Release + deploy (live) | — |
| **Pipeline** | Automated steps ka chain | assembly line |
| **Workflow** | GitHub Actions ki YAML file | recipe |
| **Trigger (`on`)** | Kab chale (push/PR) | ghanti |
| **Job / Runner / Step** | Kaam-group / machine / ek command | dept/worker/task |
| **`uses` vs `run`** | Ready-made action vs shell command | — |
| **Branch filter** | `[main]` = sirf main pe trigger | main-gate only |
| **Pull Request (PR)** | Merge se pehle review wali request | — |
| **Feature branch** | Naya kaam alag branch mein | — |
| **Branch protection** | `main` lock (PR+CI pass chahiye) | — |
| **Secrets** | Encrypted credentials (code mein nahi) | locker 🔐 |
| **`github.sha`** | Commit ka unique ID (image tag) | exact version |
| **Test gate** | Test fail→pipeline ruke | 🚦 |
| **Artifact** | Build ka output (image/file) | — |
| **Manifest** | K8s YAML (deployment.yaml) | — |
| **Manifest-update** | CI Git mein naya tag likhe (deploy nahi) | menu update |
| **`GITHUB_TOKEN`** | Default token (loop protection deta) | — |
| **`paths` filter** | Sirf in files pe trigger (loop rok) | — |

---

## 🟥 M7 — GitOps

| Term | Matlab | 🎓 Hook |
|------|--------|---------|
| **GitOps** | Git=truth, cluster Git se match karta | menu=boss |
| **Argo CD / Flux** | GitOps tools (Git se deploy) | head-waiter 🧑‍🍳 |
| **Application** (Argo) | Argo ko naukri-parchi (kya watch karo) | — |
| **Sync / Synced / OutOfSync** | Cluster=Git? (match/mismatch) | — |
| **Healthy / Degraded** | Pods theek / kharab | — |
| **selfHeal** | Drift→Git wala wapas (auto-undo manual) | menu wapas |
| **prune** | Git se delete→cluster se delete | — |
| **Rollback (`git revert`)** | Git ulta karo→Argo purana deploy | time machine ↩️ |
| **Source of truth** | Git = sach (jo Git mein, wahi cluster) | menu |
| **branch=environment** | main→prod, staging→staging | — |

---

## 🧵 5 GOLDEN THREADS (sab ko jodne wale)
| Thread | Ek line |
|--------|---------|
| **Reconciliation** | desired batao, tool maintain kare (TF/Ansible/K8s/Argo) |
| **State bahar→disposable** | keemti data bahar, baaki replace-able |
| **Preview before apply** | `plan`/`--check`/`--dry-run`/test-gate |
| **Push vs Pull** | bahar se bheje (push) vs khud kheche (pull) |
| **Idempotent** | kitni baar bhi chalao, result same |

---

## ⚖️ CONCEPTS vs TOOLS (confuse mat karna)
**Tools** = cheezein jo tu use karta (Terraform, Ansible, Docker, K8s, Argo, Packer).
**Concepts/properties/patterns** = gun/tareeke jo tools **dikhate** (tool nahi):
| Concept | Kya hai | Tools jo dikhate |
|---------|---------|------------------|
| **Idempotency** | property/behavior (operation ka guna — dobara safe) | TF, Ansible, K8s, Argo |
| **Reconciliation** | process/control-loop pattern (khud compare→fix) | K8s, Argo (continuous); TF/Ansible (on-trigger) |
| **Declarative** | style (kya chahiye batao) | TF, K8s, Argo |
| **Stateless/Stateful** | property (andar data hai ya nahi) | app/DB |
| **Mutable/Immutable** | approach (badlo vs replace) | Ansible vs Packer/Docker |

### Idempotent vs Reconciliation (ek-ek line)
- **Idempotent** = "dobara chalau to safe" — **TU** trigger karta. 🎓 switch (dabao, ON rahega).
- **Reconciliation** = "khud lagataar mismatch theek karta" — **loop** karta (tu nahi). 🎓 thermostat (khud adjust).
- 🤯 **Terraform idempotent hai par continuously reconcile NAHI karta** (drift tab fix jab TU `apply` chalao). K8s/Argo dono karte (khud, 24/7).

## 🩺 ERROR/STATUS REFLEX (turant pehchaano)
| Dikha | Matlab |
|-------|--------|
| `UNREACHABLE`/timeout | network/machine nahi mili |
| `Permission denied` | access/haq nahi (galat key) |
| `OOMKilled` / `137` | RAM kam |
| `CrashLoopBackOff` | pod baar-baar crash (logs dekho) |
| `Pending` | schedule nahi hua (fragmentation/IP/taint) |
| `OutOfSync` (Argo) | cluster≠Git |
| `READY 0/1` | Running par readiness fail |

---

> Naya term mile to yahaan add hoga. Detail: [DevOps-Field-Manual.md](DevOps-Field-Manual.md) · Recall: [DevOps-Master-Recall.md](DevOps-Master-Recall.md).
