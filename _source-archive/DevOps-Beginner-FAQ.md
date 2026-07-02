# ❓ DevOps Beginner FAQ — Real Questions (jo seekhne waqt aate)

> Ye wo **asli sawaal** hain jo ek learner poochta — chhote par **important** (concepts ko jodne wale). Har Q: short answer + 🔑 key insight + 🎓 analogy. Topic-wise grouped.
> (Ye us learner ke actual questions se bani jo bootcamp kar raha tha — isliye genuine + relatable.)

---

## 🐳 DOCKER & IMAGES

**Q: Docker image kahan jaati — DockerHub, locally, ya kahin aur?**
- Build → pehle **laptop** pe. Share/deploy ke liye → **registry** (DockerHub public / GHCR / **ECR** AWS-private).
- 🔑 `docker push` laptop→registry, `docker pull` registry→server. **Registry = images ka GitHub.**

**Q: Pod image kaise use karta?**
- Pod image **store nahi karta** — `deployment.yaml` mein **naam** (`image: <ecr>:tag`) batata. Node ka **kubelet registry se PULL** karke chalata.
- 🔑 Image registry mein honi zaroori (warna node pull kahan se kare). Galat tag → **ImagePullBackOff.**
- 🎓 Pod menu pe dish ka naam likhta; kitchen (node) godam (registry) se dabba mangwata.

**Q: requirements.txt structure kya?**
- Python deps ki list. Har line = `package==version` (e.g. `fastapi==0.111.0`). `==` = exact pin (reproducible).
- 🔑 Node mein iska equivalent = `package.json`.

**Q: Package version kahan se pata kare?**
- **PyPI** (pypi.org) website, ya `pip index versions <pkg>`. Best: local pe chala ke `pip freeze > requirements.txt` (jo kaam kar raha wahi pin).
- ⚠️ Versions verify karo (roz update hoti) — memorized pe trust nahi.

**Q: Base image kaunsa (slim/full/alpine)?**
- **Slim se shuru** (default, ~150MB). Fail ho (lib missing) → system-lib add ya **full**. Alpine sabse chhoti par compatibility-risk.
- 🔑 Chhoti rakho jab tak compatibility na toote. Slim = sweet spot.

**Q: Image kahan banti, kahan chalti?**
- **Banti = laptop/CI (Docker).** **Chalti = node (containerd).** Do alag jagah.
- 🎓 Factory banata (Docker), shop bechta (containerd).

---

## 🛠️ TOOLS — kahan, kya, kaun

**Q: Laptop pe kya install, node pe kya?**
- **Laptop (control center):** git, docker, terraform, ansible, kubectl, aws-cli — yahaan se sab chalata.
- **Node (minimal worker):** containerd + kubelet (sirf containers run). **git/docker/terraform node pe NAHI.**
- 🎓 Laptop = manager (saare aujaar); node = labourer (1 aujaar).

**Q: Docker vs containerd?**
- **Docker** = full toolkit (build+run), laptop/CI pe. **containerd** = sirf runtime (run), nodes pe.
- 🔑 K8s 1.24+ ne Docker hata diya — nodes seedha containerd use karte.

**Q: Ansible har project mein use hoti?**
- **Nahi.** Immutable images (Docker/Packer) ya managed services (EKS/RDS) Ansible ko replace karte. Ansible mainly **self-managed servers** (kubeadm jaise) ke liye.

**Q: Terraform se software install + service start kar sakte (Ansible ki jagah)?**
- **Kar sakte (`user_data`/provisioner) par karna NAHI chahiye.** Terraform state ke andar nahi dekhta, re-run/drift handle nahi karta.
- 🔑 **Terraform = "kya exist kare" (infra). Ansible = "andar kya ho" (config).** Right tool, right job.

**Q: Mutable vs Immutable infra — Ansible kahan?**
- **Mutable:** running server ko badalte (Ansible runtime pe config). **Immutable:** image mein bake (Packer/Docker), machine replace.
- 🔑 Immutable mein Ansible **build-time** (image banate waqt) use hota, runtime pe nahi.

**Q: Dockerfile/Terraform file kahan rakhe?**
- **Dockerfile = per-service folder** (us service ke code ke saath — har service apna image). **Terraform = alag `infra/`** (system-wide).
- 🔑 Rule: "ek service ki cheez → service folder; poore system ki → alag top-folder."

---

## ☸️ KUBERNETES

**Q: Har service ka apna pod?**
- **Haan** — har microservice ka apna Deployment + apni pods + apni Service. Independently scale/deploy.
- 🔑 2 services ek pod mein NAHI (independent scaling/deploy ka point gaya). Exception: sidecar (ek service ka helper).
- 🎓 Food-court — har stall apna counter+staff.

**Q: Stateful pod bhi hota?**
- **Haan.** Stateless = **Deployment** (data nahi). Stateful = **StatefulSet** + **PersistentVolume** (alag disk, pod ke bahar — pod mare to data safe).

**Q: Stateless pod mare to replace kaise?**
- Deployment (reconciliation) dekhta "N chahiye, kam hain" → naya pod (same image, fresh). Kuch khota nahi (data tha hi nahi = cattle).

**Q: DB kahan chalta — pod ya alag machine? Safe kaise?**
- 2 options: (A) cluster mein stateful pod + PV (tu sambhaalo), (B) **Managed RDS = alag AWS machine** (AWS sambhaalta — backup/failover). **Capstone = RDS** (safest).
- 🎓 App pod = kiraye ka waiter; RDS = bank locker (bank sambhaalta).

**Q: Backup kiska — pod ya DB?**
- **DB (data) ka.** Pod stateless = data nahi = backup bekaar (image se ban jaata). **DR = DB backup** (RDS snapshot → restore). RPO=data-loss, RTO=recovery-time.

**Q: Pods ke IP badalte, user kaise pohche?**
- **Service** = fixed pata (kabhi nahi badalta). User Service ko baat karta, Service available pod ko bhejti.
- 🎓 Pizza-shop ka fixed number.

---

## 🔄 CI/CD & GITOPS

**Q: ci.yml standard naam hai?**
- **Folder `.github/workflows/` = FIXED.** Filename = teri marzi (`ci.yml`/`deploy.yml`) — convention: **kaam ke hisaab**, project-naam se nahi. Multiple files = multiple workflows.

**Q: git push → automation kaise?**
- `ci.yml` ek baar likho (manual setup). Phir har push pe Actions **khud** sab steps (test/build/push/manifest) chalati. **Tera kaam = sirf `git push`.**

**Q: Manifest update kya, kahan apply?**
- **Manifest** = K8s YAML (`deployment.yaml`). **Update** = image tag badalna (`sed`, Git mein — Actions). **Apply** = cluster pe deploy (Argo).
- 🔑 UPDATE (Git, Actions) aur APPLY (cluster, Argo) **alag** — CI cluster ko chhuti nahi.

**Q: Naya tag deployment.yaml mein KAISE aata?**
- `sed` (find-replace) file mein tag badalta → `git push` GitHub pe save. Robot wahi karta jo tu haath se. **Automatic** (ci.yml mein likha).

**Q: Manifest kahan rehti (git/local)?**
- **File hai** repo mein (`k8s/deployment.yaml`), **code ke saath same repo.** Asli copy **GitHub pe** (source of truth). Laptop=working copy, Argo=GitHub se padhti.

**Q: Git mein kya "state" stored, jo Argo padhti?**
- **Manifest YAML khud = desired state** (replicas, image, ports). **No separate state file** (Terraform se ulta — wahaan tfstate alag). Argo "actual" **live cluster se** padhti.

**Q: OutOfSync kab hota?**
- Git ≠ cluster. 2 wajah: 🅰️ **Git badla** (CI/push → Argo apply) · 🅱️ **cluster badla** (kubectl → Argo selfHeal).
- 🔑 Keyword: "git push" = apply; "kubectl" = selfHeal.

---

## 🧠 CONCEPTS (confuse karte)

**Q: Idempotent vs Reconciliation?**
- **Idempotent** = operation ka guna ("dobara chalau safe", **TU** trigger). **Reconciliation** = continuous loop ("khud mismatch theek karta", **loop** chalata).
- 🎓 Switch (tu dabao) vs Thermostat (khud adjust).
- 🔑 Terraform idempotent hai par continuously reconcile NAHI karta (drift tab fix jab TU apply). K8s/Argo dono karte.

**Q: Idempotency/Reconciliation tools hain?**
- **NAHI — concepts/properties hain** (tools nahi). Tools (Terraform/K8s/Argo) inhe **dikhate**. Idempotency = property; reconciliation = pattern.
- 🔑 Tool = cheez (use karta); concept = gun (dikhata).

---

## 💻 REAL-WORLD / PRACTICAL (lab gotchas)

**Q: PowerShell mein `&&` kaam nahi karta?**
- Windows PowerShell 5.1 mein `&&` invalid. Use **`;`** (dono chale) ya `A; if ($?) { B }` (conditional). bash mein `&&` chalta.

**Q: `curl -4 ifconfig.me` kya karta?**
- `ifconfig.me` website se poochta "mera public IPv4 kya hai." `-4` = IPv4 force. Computer apna public IP khud nahi jaanta (ISP deta) → bahar se poochna padta.

**Q: SSH "No such file or directory" (key banate)?**
- `.ssh` folder exist nahi karta. Pehle `New-Item -ItemType Directory -Force` se banao, fir key.

**Q: IPv4 vs IPv6 (SG cidr_blocks)?**
- SG `cidr_blocks` IPv4 maangta (`/32`). IPv6 (`2409:...`) alag field. `curl -4` se IPv4 lo.

**Q: RDS password error?**
- RDS password mein `/`, `@`, `"`, space **allowed nahi.** Sirf letters+numbers safest.

**Q: "not eligible for Free Tier" (EC2)?**
- Free-plan AWS account sirf **t3.micro** (free-eligible) deta, t3.medium (paid) nahi. Free pe kubeadm nahi chalta (2GB chahiye) → **k3s** (lightweight) use karo.

**Q: SSH "Connection timed out"?**
- M0 reflex: **network/SG issue** (na permission, na refused). SG `:22` rule tera current IP se match nahi (IP badal gaya?). IP update + apply, ya temp 0.0.0.0/0.

**Q: `kubectl get pods` kuch nahi dikhata?**
- `-A` flag chahiye (all namespaces). System pods **kube-system** mein, default namespace khaali. `kubectl get pods -A`.

**Q: kubeadm vs k3s?**
- Dono real K8s. **kubeadm** = full (2GB+, production). **k3s** = lightweight (~512MB, 1 command install, free-tier/edge). Concept same, k3s halka.

---

## 🎯 DESIGN / CAREER

**Q: Planning/design kaise seekhe? Process?**
- 6 steps: 1.Requirements (kya chahiye) → 2.Components mein todo → 3.Sahi tool per piece → 4.Flow map (request/deploy) → 5.**"Kya tootega?"** (failure-thinking) → 6.Simple se shuru, iterate.
- 🔑 Design "padhke" nahi, **baar-baar karke** aata. Real architectures padho, reverse-engineer, khud design karo.

**Q: Plan banana DevOps engineer ka kaam hai?**
- **Haan — yahi asli kaam.** Commands AI/Google de dega; **DESIGN + DECIDE = engineer.** Interview mein "kaise design karoge" poochenge (commands nahi). Planner=senior, button-pusher=junior.

**Q: Monolith vs Microservices?**
- Monolith = 1 bada app. Microservices = chhote independent services (apna image/deploy/scale), network se baat (service DNS). Ek down → baaki chalte (isolation).

**Q: Konsa project interview ke liye?**
- App fancy hona zaroori nahi — **OPS depth** (IaC/CI-CD/GitOps/K8s/observability) matters. **Complete simple > incomplete complex.** Microservices = zyada impressive (inter-service comm, matrix CI, multi-app GitOps).

---

> **Asli baat:** Ye sab "chhote" sawaal hi **concepts ko jodte** hain. Bada picture = chhote bridges ka jod. Jo sawaal aaye — wo **seekhne ka signal**, sharm ki baat nahi. 🚀
> Detail: [DevOps-Learning-Masterflow.md](DevOps-Learning-Masterflow.md) · [DevOps-Field-Manual.md](DevOps-Field-Manual.md) · [DevOps-Glossary.md](DevOps-Glossary.md)
