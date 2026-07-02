# 🧠 DevOps Master Recall — "Ek Nazar Mein Sab Jud Jaaye"

> Ise **ek baar** dhyaan se padho — har module ek doosre se **kaise judta** hai wo dikhega. Recall isiliye aata hai kyunki cheezein **connected** hoti hain, alag-alag nahi.

---

## 🍽️ THE ONE STORY (poora bootcamp ek restaurant)

> Tujhe ek **restaurant chain** kholni hai (= app production mein chalाni hai):
>
> 1. 🏗️ **Building + kitchen banao** → **Terraform** (zameen, building, gas-line = EC2, VPC, RDS)
> 2. 🔧 **Kitchen ke andar stove-masale set karo** → **Ansible** (machine ke andar software, kubeadm se K8s)
> 3. 📦 **Har dish ko sealed dabbe mein pack karo** → **Docker** (image — "har branch pe same swaad")
> 4. 👨‍🍳 **Manager rakho jo kitchen chalaye** → **Kubernetes** (cook gire to naya, bheed badhe to aur cook)
> 5. 📋 **Recipe-book likhne wala** → **GitHub Actions** (code se dish-pack banao + menu update karo)
> 6. 📖 **Menu = official sach** → **Git** (jo menu pe likha, wahi banta)
> 7. 🧑‍🍳 **Head-waiter jo menu padh ke kitchen ko chalata** → **Argo CD** (Git dekh ke deploy, galat dish hataye)
> 8. 📏 **Sahi size ka kitchen/cook** → **Sizing** (CPU/RAM bhookh ke hisaab se)
> 9. 📊 **CCTV + feedback + fire-safety** → **Operate** (observability, SRE, backup — M8)
>
> **Ek line:** *Building (Terraform) → setup (Ansible) → pack (Docker) → manager (K8s) → recipe-writer (Actions) → menu (Git) → head-waiter (Argo). Sahi-size mein (Sizing), CCTV ke saath (Operate).*

---

## 🧵 5 GOLDEN THREADS (ye har module mein lautte hain — yahi "glue")

Ye 5 ideas baar-baar aate — inhe pakda to sab connect:

### 1️⃣ "Desired state batao, main maintain karunga" (Reconciliation)
> Tu bolta "kya chahiye", tool khud "kaise" karta + bigad jaaye to theek karta.
- **Terraform:** desired infra (`.tf`) ↔ state ↔ reality → `apply` fix karta
- **Ansible:** `state=present` → check-then-act
- **Kubernetes:** `replicas:3` → pod mara → naya (reconciliation loop)
- **Argo CD:** Git = desired → cluster drift → selfHeal wapas
> 🔑 **Ek hi idea, 4 tools.** Isiliye M4 ka reconciliation seekha to M7 ka selfHeal free mein samajh aaya.

### 2️⃣ "State bahar → compute disposable" (Stateful/Stateless)
> Keemti data bahar rakho, baaki sab phenkne-layak (cattle).
- Stateless app (state DB mein) · Terraform state S3 mein (laptop disposable) · K8s pods cattle · Spot sirf stateless pe
> 🔑 Jo bhi "disposable" hai, uski state kahin **bahar** hai.

### 3️⃣ "Preview before apply" (pehle dikhao, fir karo)
- Terraform **`plan`** · Ansible **`--check`** · K8s **`--dry-run`** · CI **test gate**
> 🔑 Har achha tool "trailer pehle, picture baad mein" deta. Andha apply = disaster.

### 4️⃣ "PUSH vs PULL" (kaun trigger karta)
- **PUSH** 📤 (bahar se bhejta): Ansible, GitHub Actions
- **PULL** 📥 (khud kheech ke laata): Argo CD
> 🔑 Actions Git mein **likhti** (push) → Argo Git se **padhti** (pull) → Git = beech ka sach.

### 5️⃣ "Idempotent" (kitni baar bhi chalao, result same)
- Terraform `apply` · Ansible playbook · K8s desired state
> 🔑 SET, not +=. Yahi "safe to re-run" banata.

---

## 🗺️ ONE-GLANCE CONNECTION MAP

```
        🧵 Threads neeche sab ko jodte hain
        ┌──────────────────────────────────────────────────────┐
        │ Reconciliation · State-bahar · Preview · Push/Pull · Idempotent │
        └──────────────────────────────────────────────────────┘

🏗️ SETUP (ek baar)                    🔄 DELIVERY (har push)
─────────────────                     ─────────────────────────────────
TERRAFORM ──► ANSIBLE                 GIT ─► ACTIONS ─► DOCKER ─► GIT ─► ARGO ─► K8s
(infra)      (kubeadm                 push  (CI:        (image)  (mani  (CD:    (run,
 EC2/VPC/     K8s cluster)                   test+               -fest   pull+    heal,
 RDS/ECR)                                    build)              update) deploy)  scale)
   │            │                                                          │
   └─ state:    └─ agentless                                    selfHeal/reconcile
      S3+lock      SSH+Python                                   probes · Service · taint
                                                                      │
                          📏 SIZING: in sabko sahi CPU/RAM/family de
                          📊 OPERATE: in sabko dekho/naapo/bachao (M8)
```

---

## 🔑 MEMORY HOOKS (analogy → concept, ek table)

| Analogy 🎓 | Concept 🏭 | Module |
|-----------|-----------|--------|
| Pet 🐶 vs Cattle 🐄 | Stateful vs Stateless | M0 |
| Restaurant 4 log | Terraform/Ansible/Docker/K8s | M0 |
| Diary 📔 | Terraform state (tfstate) | M1 |
| Bill dekhna 🧾 | `terraform plan` | M1 |
| Plumber (ghar jaata, copy nahi chhodta) | Ansible agentless | M2 |
| Bell 🔔 (sirf change pe) | handler + notify | M2 |
| Recipe 📜 vs Dish 🍛 | Image vs Container | M3 |
| Save-point 💾 / game checkpoint | Docker layer cache | M3 |
| Tiffin 🍱 (manager tiffin uthata, khana nahi) | Pod (smallest unit) | M4 |
| Chowkidar (24/7 ginta) | reconciliation loop | M4 |
| Fixed phone number ☎️ | Service | M4 |
| No-Entry board 🚷 | taint (master) | M4 |
| Naap ke kapde silao | right-sizing | M5 |
| Reserved seat vs "room se bahar mat jao" | requests vs limits | M5 |
| Menu likhne wala vs head-waiter | Actions (push) vs Argo (pull) | M6/M7 |
| Git = boss/menu 📖 | source of truth | M6/M7 |
| Time machine ↩️ | `git revert` rollback | M7 |

---

## ⚡ 60-SECOND SELF-TEST (padhne ke baad ye bol — aaye to recall pakka)

1. T→A→D→K — kaun kya? (builder/setup/pack/manager)
2. 5 golden threads kaunse?
3. tfstate gayi → kitne server? (lost-state)
4. Drift vs lost-state — state file kahan?
5. Docker: deps upar code neeche — kyun?
6. Reconciliation kaunse 4 tools mein? (TF/Ansible/K8s/Argo)
7. Actions=push, Argo=? , beech mein?
8. selfHeal on + manual kubectl = ?
9. OOMKilled/137 = ? ; CPU cross = ?
10. Manifest-update: CI cluster ko chhuti hai? (na — sirf Git)

> Saare aaye → tu connected samajh raha. Atke → us module ka [DevOps-Bootcamp-Notes.md](DevOps-Bootcamp-Notes.md) padho.

---

> **Asli baat:** Modules alag nahi — **ek kahani** hai jo **5 threads** se bandhi hai. Restaurant story + threads yaad → sab khud connect ho jaata. 🚀
