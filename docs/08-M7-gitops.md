# M7 — GitOps & Argo CD

> **Core question:** CI just committed a new image tag into a Kubernetes manifest in Git.
> How does the cluster pull the right version from Git, and how does it heal itself when someone
> manually drifts it away?

> **⏱️ Time:** ~45 min padho + 30 min lab · **🎚️ Level:** Intermediate · **📋 Pehle chahiye:** [M4](05-M4-kubernetes-core.md), [M6](07-M6-cicd.md)
>
> **Is module ke baad tum kar paoge:**
> - Argo CD Application YAML likhkar ek repo ko cluster se wire karo — selfHeal aur prune explain karo
> - Sync states (Synced/OutOfSync/Healthy/Degraded) padhkar bata sako kya galat hai aur kyun
> - Push vs pull model ka security difference explain karo — interview mein ek line mein

**Cross-links:** This module picks up from [07-M6-cicd.md](07-M6-cicd.md) (CI wrote the manifest)
and feeds into [09-connected-system.md](09-connected-system.md) (the full end-to-end chain).

---

> ### ↩️ Recall gate — shuru karne se pehle
> Pichhle modules se 3 sawaal. **Pehle memory se jawab do, phir kholo.** (Yeh retrieve karna hi lifetime yaad rakhta hai — dobara padhna nahi.)
>
> 1. *(M6)* CI ne naya Docker image ECR pe push kar diya. Ab cluster mein deploy karne ke liye CI kya karta hai — seedha `kubectl apply` chalaata hai ya kuch aur?
> 2. *(M4)* Kubernetes ka reconciliation loop kya compare karta hai, aur jab fark mile toh loop kya action leta hai?
> 3. *(M1)* `terraform apply` do baar lagatar chalao — doosri baar bhi nayi VPC banti hai kya? Is property ka naam kya hai?
>
> <details markdown="1"><summary>Jawab</summary>
>
> 1. CI sirf k8s manifest mein image tag update karta hai aur Git mein commit+push karta hai — cluster ko seedha chhuta nahi. &nbsp; 2. Desired state (spec) vs current state (live pods/objects) — loop current ko desired tak drive karta hai, hamesha. &nbsp; 3. Nahi — already exist karta hai toh chhodh deta hai. Is property ko **idempotency** kehte hain.
> </details>

## The 60-second version

GitOps is one idea stated cleanly: **Git is the single source of truth for what the cluster should
look like.** An agent living *inside* the cluster continuously reads Git, compares what it finds
there against live cluster state, and applies any difference. You never run `kubectl apply` from a
laptop again. When something drifts — a developer scales a Deployment by hand, a pod restart resets
a config — the agent puts it back.

**Argo CD** is the dominant implementation of this pattern. It watches a Git repo path on a branch,
runs a three-way diff every ~3 minutes, and applies when the diff is non-empty. It ships as a
Kubernetes controller — it runs *in* the cluster it manages.

---

## Why this exists / what it replaced

Before GitOps, deploying meant someone (or a CI job) running:

```bash
kubectl apply -f k8s/deployment.yaml   # from a laptop, or a CI runner
```

That one line hides four problems:

| Problem | Consequence |
|---------|-------------|
| CI runner needs cluster credentials (kubeconfig) | Leaked CI = leaked cluster |
| No audit trail of who applied what | "Who changed prod?" — no one knows |
| Cluster drifts from what Git says | "Works in staging" — because staging was never touched |
| Rollback = someone remembers the old image tag | Panic, not process |

GitOps closes all four gaps by making Git the authority and automating the apply step.

🇮🇳 **Hinglish intuition:** Pehle deploy karna tha toh koi bhi chef kitchen mein ghus ke kuch bhi
banata. Ab Git = menu, aur sirf ek head-waiter (Argo) kitchen dekh sakta. Menu badlo → khana badal
jaata. Koi seedha ghusa → head-waiter menu wala wapas laga deta.

---

## GitOps in one idea: Git is the desired state

The K8s reconciliation loop (learned in M4) compares desired state with current state and fixes any
gap. GitOps extends that same loop outward: **Git holds the desired state; the cluster holds the
current state; Argo CD is the loop that bridges them.**

```
GIT (desired state)                 CLUSTER (current state)
────────────────────                ──────────────────────
k8s/deployment.yaml   ←── Argo ──→  live Deployment object
  image: app:a1b2c3    3-way diff    image: app:old-sha
  replicas: 2          detects gap   replicas: 2
                                     (OutOfSync on image)
                          ↓
                    kubectl apply    ← Argo applies Git version
                          ↓
                    cluster matches Git → Synced
```

**Three-way diff** is the key mechanism. Argo compares:
1. **Git desired** — what the YAML in the repo says
2. **Live cluster** — what `kubectl get` would return today
3. **Last-applied annotation** — what was applied last time (to detect drift vs intentional change)

Any gap between (1) and (2) is an OutOfSync condition. Argo applies (1) to fix it.

---

## Push vs Pull, and why pull is safer

This is **Golden Thread 4** (Push vs Pull). Understand it once and it explains Ansible vs Argo, CI
vs GitOps, and why GitOps is the production-safe pattern.

```
PUSH model (old way / GitHub Actions direct deploy)
────────────────────────────────────────────────────
  CI runner ──[has kubeconfig]──► kubectl apply ──► Cluster
      ↑
  If CI is compromised, attacker has cluster access too.
  Credentials must live outside the cluster (GitHub Secrets).

PULL model (GitOps / Argo CD)
──────────────────────────────
  Git repo  ◄── Argo CD polls (inside cluster) ──► kubectl apply
                     ↑
             Argo runs AS A POD inside the cluster.
             Cluster credentials never leave the cluster.
             CI only writes to Git — it never touches the cluster.
```

| Dimension | Push (CI direct) | Pull (Argo CD) |
|-----------|-----------------|----------------|
| Who holds cluster creds? | CI runner (outside) | Argo pod (inside cluster) |
| Blast radius if CI is hacked | Cluster exposed | Only Git repo exposed |
| Audit trail | CI logs (ephemeral) | Git commits (permanent) |
| Rollback mechanism | Re-run old CI job | `git revert` |
| Drift detection | None — no one is watching | Continuous (every ~3 min) |
| Network requirement | CI must reach cluster API | Cluster reaches Git (outbound only) |

🇮🇳 **Hinglish intuition:** Push mein CI ke paas kitchen ki chaabi hai — CI hack hua toh kitchen
gaya. Pull mein chaabi kitchen ke andar hi hai. Bahar wala sirf menu (Git) likh sakta, andar nahi
ja sakta.

Cross-link: M2 Ansible is also push-based — `ansible-playbook` pushes config from control node.
GitOps chose pull deliberately because the security model is superior at cloud scale.

---

## Argo CD: the Application object & the reconciliation loop

Argo CD is installed as a set of pods in an `argocd` namespace. Its core concept is the
**Application** — a Custom Resource Definition (CRD, meaning a new object type Argo adds to
Kubernetes) that says: "watch this Git repo path on this branch, and deploy it to this cluster
namespace."

### Teaching-sized application.yaml

```yaml
apiVersion: argoproj.io/v1alpha1       # Argo's API group, not core K8s
kind: Application                      # the CRD Argo adds to your cluster
metadata:
  name: url-shortener
  namespace: argocd                    # Argo lives here; your app deploys elsewhere
spec:
  project: default                     # Argo project for access control (default = open)

  source:
    repoURL: https://github.com/you/url-shortener.git   # which repo to watch
    targetRevision: main                                 # which branch (branch = environment)
    path: k8s                                            # which folder inside the repo

  destination:
    server: https://kubernetes.default.svc   # this cluster (in-cluster)
    namespace: default                       # target namespace for your app

  syncPolicy:
    automated:
      selfHeal: true   # if cluster drifts from Git, auto-revert (see section 8)
      prune: true      # if a manifest is deleted from Git, delete from cluster too
```

Apply it once: `kubectl apply -f argocd/application.yaml`. Argo then runs the loop forever.

### The reconciliation loop (step by step)

```
Every ~3 minutes (or on webhook from Git):
  1. Argo fetches latest commit from Git (targetRevision=main)
  2. Renders the manifests (raw YAML, Helm, Kustomize, etc.)
  3. Runs 3-way diff: Git desired vs live cluster vs last-applied
  4. If diff is empty  → status = Synced. Done.
  5. If diff found     → status = OutOfSync
       └─ if automated sync enabled → kubectl apply (Git wins)
       └─ if manual sync           → wait for human to click Sync
  6. Checks pod health → Healthy or Degraded
```

🇮🇳 **Hinglish intuition:** Argo = rasoiya jo har 3 minute mein menu (Git) padhta hai, kitchen
(cluster) dekhta hai, aur jo fark ho woh banata/hataata hai. Menu hamesha boss.

---

## Sync states & the OutOfSync keyword trick

Argo reports two independent status dimensions. Read both — they answer different questions.

### Status table

| Status | Meaning | Example |
|--------|---------|---------|
| **Synced** | Cluster matches Git exactly | Deployment image matches Git tag |
| **OutOfSync** | Cluster differs from Git | Someone `kubectl scale`d manually |
| **Healthy** | Pods are running and ready | All replicas Ready, probes passing |
| **Degraded** | Pods are not ready | CrashLoopBackOff, ImagePullBackOff |
| **Progressing** | Rolling update in flight | New ReplicaSet starting up |
| **Unknown** | Argo cannot determine health | Custom resource with no health check |

> **Critical nuance:** Synced and Healthy are independent axes.
> A deploy can be **Synced but Degraded** — Argo applied the manifest successfully, but the pod
> itself is crashing (wrong image, bad env var, OOMKilled). Synced only means "cluster matches
> Git"; Healthy means "the workload is actually working."

### OutOfSync — only 2 root causes, and the keyword trick

```
OutOfSync = Git ≠ cluster. Exactly 2 causes:

  Cause A: GIT changed     Keywords: "git push", "CI committed", "PR merged"
           → Git is ahead of cluster
           → Argo will APPLY (deploy the new version)

  Cause B: CLUSTER changed  Keywords: "kubectl edit", "kubectl scale", "kubectl delete"
           → Cluster drifted from Git
           → selfHeal will REVERT (put Git's version back)
```

**The trick:** Scan the scenario for the keyword. If the story says `git push` or "CI updated the
manifest" — that is Cause A, Argo *applies*. If it says `kubectl scale` or "someone edited the live
object" — that is Cause B, selfHeal *reverts*. The words in the story tell you which side moved.

🇮🇳 **Hinglish intuition:**
- "git push" = menu pe naya likha → Argo kitchen ko update karta (apply).
- "kubectl" = koi seedha kitchen mein ghusa → Argo menu wala wapas laata (selfHeal).
- Git hamesha boss — cluster kabhi boss nahi.

---

## selfHeal, prune, and rollback

### selfHeal

> 🔮 **Predict pehle (socho, phir aage padho):** selfHeal ON hai. Tum production me `kubectl scale` karke replicas 3→5 kar do. ~3 min baad kya hota hai?

`selfHeal: true` tells Argo: if the live cluster diverges from Git (Cause B above), automatically
re-apply Git's version without waiting for a human.

```bash
# Demo: create drift
kubectl scale deployment url-shortener --replicas=5   # Git says replicas: 2

# Within ~30 seconds:
# Argo detects: live=5, Git=2 → OutOfSync (Cause B)
# selfHeal: true → kubectl apply → replicas back to 2
kubectl get deployment url-shortener   # READY: 2/2
```

> 🔧 **War story:** Production mein ek slow pod issue tha — engineer ne `kubectl scale deployment app --replicas=5` kiya quick hotfix ke liye (Git mein replicas: 3 tha). 3 minute baad pods wapas 3 ho gaye. Log confused: "Kisi ne mera change revert kiya kya?" Root cause: selfHeal:true — Argo cluster ko Git ki taraf wapas kheeench laata hai, silently. Lesson: Argo ke saath `kubectl` changes temporary hain — permanent change sirf Git se hoga. Poori kahani + lesson → [Interview Bank](14-interview-bank.md).

### prune

`prune: true` tells Argo: if a manifest exists in the cluster but is no longer in Git, delete it.

Without prune: you rename `service.yaml` to `api-service.yaml` in Git, push — Argo creates
`api-service`, but the old `service` object stays as an orphan, potentially routing stale traffic.

With prune: Argo deletes what Git no longer declares. Git is the complete desired state.

> **Risk:** If you accidentally delete a manifest from Git (bad merge, wrong file), Argo will
> delete that object from the cluster. Always review what you're removing from the repo.

### Rollback = git revert

```bash
# Something broke after the last deploy. Roll back:
git log --oneline k8s/deployment.yaml   # find the bad commit SHA
git revert <bad-commit-sha>             # creates a new "undo" commit
git push                                # Argo sees the revert, applies previous state

# Cluster is back to the last good version. No manual kubectl, no panic.
```

This is why Git history = deployment history. `git log` is your deployment timeline.
`git revert` is your time machine. Argo is the mechanism that makes the revert actually run.

🇮🇳 **Hinglish intuition:** Rollback = time machine ↩. Git history mein jaao, ek commit ulto
karo, push karo — Argo purana version wapas deploy. Koi haath-pair marne ki zaroorat nahi.

---

## The Actions + Argo partnership

GitHub Actions and Argo CD are **not competitors**. They are partners with a clean division of
responsibility separated by a Git commit.

```
                    git push (your code)
                          │
                          ▼
              ┌─── GitHub Actions (CI) ──────────────────┐
              │  1. pytest / unit tests                   │
              │  2. docker build → ECR (SHA tag)          │
              │  3. sed image tag in k8s/deployment.yaml  │
              │  4. git commit + push (manifest update)   │
              └───────────────────────────────────────────┘
                          │
                          │  Git now has new manifest commit
                          │
                          ▼
              ┌─── Argo CD (CD) ──────────────────────────┐
              │  polls Git every ~3 min                   │
              │  detects new image tag → OutOfSync        │
              │  kubectl apply → new ReplicaSet           │
              │  rolling update → new pods ready          │
              │  old pods terminate → Synced + Healthy    │
              └───────────────────────────────────────────┘
                          │
                          ▼
                     cluster running new version
```

**CI cluster ko chhuta nahi.** Actions writes to Git. Argo reads from Git and writes to the
cluster. The cluster credentials live only inside the cluster, never in CI.

### Partnership table

| Concern | GitHub Actions (CI) | Argo CD (CD) |
|---------|--------------------|--------------| 
| Model | Push (event-driven) | Pull (polling) |
| Runs where | GitHub-hosted runner (outside cluster) | Pod inside cluster |
| Cluster access | None | Yes (in-cluster ServiceAccount) |
| Responsibility | Build, test, package image, update manifest | Watch Git, apply manifests |
| Source of truth writes | Git manifest (image tag) | Does not write Git |
| Trigger | `git push` event | Git diff (polling or webhook) |
| Rollback mechanism | Re-run old workflow | `git revert` |

### branch = environment

The cleanest multi-environment pattern: one Argo Application per environment, each pointing at a
different branch.

```yaml
# prod application
targetRevision: main        # prod cluster watches main branch

# staging application
targetRevision: staging     # staging cluster watches staging branch
```

Promoting to production = merging staging into main. The prod cluster reconciles automatically.
No separate deploy command, no env-specific scripts.

🇮🇳 **Hinglish intuition:** CI = menu likhne wala (Git pe). Argo = rasoiya jo menu padh ke banata.
CI ko kitchen chaabi nahi chahiye — menu likhna hi uska kaam. Rasoiya menu padh ke khud banata.
Dono partners hain, competitors nahi.

---

## Real production example (incl. the selfHeal hotfix gotcha)

### Normal deploy flow (the happy path)

```
10:32  Developer pushes a bug fix to main
10:32  Actions triggered → tests pass → docker build → ECR push
10:33  Actions updates k8s/deployment.yaml: image: app:abc1234
10:33  Actions git push → new commit on main
10:36  Argo polls Git → detects image tag changed → OutOfSync (Cause A)
10:36  Argo applies manifest → new ReplicaSet starts
10:37  New pods pass readiness probe → old pods terminate
10:37  Argo status: Synced + Healthy
10:37  Users on new version. Zero manual steps after git push.
```

### The selfHeal production gotcha

Imagine this scenario at 2 AM:

```
02:14  Production alert: app response time spiking, requests queueing
02:15  On-call engineer: "I'll scale replicas to 10 to absorb traffic"
02:15  kubectl scale deployment url-shortener --replicas=10
02:15  replicas jump to 10 ... momentary relief ...
02:18  Argo reconciles: Git says replicas=2, cluster says 10 → OutOfSync (Cause B)
02:18  selfHeal: true → Argo applies Git manifest → replicas back to 2
02:18  Queue builds up again. Engineer is confused. 🔥
```

**Why this happens:** selfHeal is always watching. It does not know that this was an emergency
manual intervention — it only knows Git says 2 and the cluster says 10. Git wins.

**The correct procedure for emergency manual changes with selfHeal enabled:**

```bash
# Step 1: Temporarily disable auto-sync for this application
argocd app set url-shortener --sync-policy none   # or via UI: disable auto-sync

# Step 2: Now your manual kubectl changes will stick
kubectl scale deployment url-shortener --replicas=10

# Step 3: Fix the root cause (find and fix the performance issue)

# Step 4: Update Git to match your emergency change (reconcile with Git)
# Edit k8s/deployment.yaml: replicas: 10 (or fix the real problem)
git add k8s/deployment.yaml && git commit -m "ops: scale up for incident X"
git push

# Step 5: Re-enable auto-sync
argocd app set url-shortener --sync-policy automated
```

**Senior insight:** The real fix is to always go through Git, even in emergencies. If you need
10 replicas, commit `replicas: 10` and push — Argo applies it in under 3 minutes. Only disable
auto-sync when the time constraint is genuinely sub-3-minutes, and always reconcile Git afterward.

> A Git commit with message `"ops: emergency scale-up for latency incident 2024-01-15"` is both
> the fix and the audit trail. A manual `kubectl` is neither.

🇮🇳 **Hinglish intuition:** selfHeal = chowkidar jo 24/7 jaag ke manually ki gayi chhed-chhaad
wapas theek karta. Emergency mein chowkidar ko thodi der ke liye baitha do (auto-sync off), kaam
karo, phir Git ko sahi karo, phir chowkidar ko wapas khada karo.

---

## Commands, explained

```bash
# Install Argo CD into your cluster
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
# Why: Argo CD runs as pods inside the cluster it manages

# Get the initial admin password
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d
# Why: Argo generates a random password on install; this retrieves it

# Access the Argo CD UI locally (it has no external LoadBalancer by default)
kubectl port-forward svc/argocd-server -n argocd 8080:443
# Why: Forward localhost:8080 to the Argo server; visit https://localhost:8080

# Register your Application (the CRD that tells Argo what to watch)
kubectl apply -f argocd/application.yaml
# Why: This is the one-time declaration — Argo loops on it forever after

# Check application status
argocd app get url-shortener
# Why: Shows sync status, health, current image, recent events in one view

# See what Argo would change before actually syncing (dry-run equivalent)
argocd app diff url-shortener
# Why: "Preview before apply" — Golden Thread 3; confirm the diff is what you expect

# Manually trigger a sync (when automated sync is off, or to sync immediately)
argocd app sync url-shortener
# Why: Forces Argo to apply Git state now, without waiting for the poll interval

# Rollback: create a revert commit in Git, then push
git revert <bad-commit-sha>
git push
# Why: Argo detects the new commit, applies the reverted manifest; cluster returns to prior state
# Do NOT use `argocd app rollback` in GitOps — it rolls back the cluster but not Git (split brain)

# Temporarily disable auto-sync (for emergency manual changes)
argocd app set url-shortener --sync-policy none
# Why: Prevents selfHeal from fighting your manual kubectl changes during an incident

# Re-enable auto-sync after reconciling Git
argocd app set url-shortener --sync-policy automated
```

---

## Beginner mistakes vs Senior insights

| Beginner does | Senior does | Why it matters |
|---------------|-------------|----------------|
| `kubectl apply` from laptop to deploy | `git push` (let Argo deploy) | No audit trail, no drift detection on manual apply |
| Treats Synced = Healthy | Checks both axes separately | Synced+Degraded = deployed but broken — very different |
| Runs `argocd app rollback` | Runs `git revert` + `git push` | `argocd rollback` rolls cluster back but leaves Git ahead — creates split brain |
| Leaves `prune: false` | Sets `prune: true` intentionally | Orphaned objects accumulate; stale Services can misroute traffic |
| Disables `selfHeal` to allow manual fixes | Keeps `selfHeal: true`, uses Git for all changes | If it is not in Git it does not exist; selfHeal enforces that |
| Points all environments at one branch | Uses branch-per-environment or path-per-environment | Staging deploy must not trigger production deploy |
| Stores kubeconfig in CI for direct deploy | Stores nothing; CI only writes Git | Leaked CI credentials = leaked cluster if using push model |
| Uses `argocd app sync --force` to fix a broken deploy | Investigates why sync fails, fixes root cause | Force-sync can apply a broken manifest — fix Git, not the symptom |

---

## Memory shortcuts

- **Argo = rasoiya** who reads the Git menu and cooks. CI writes the menu. Argo cooks.
- **selfHeal = chowkidar** who reverts unauthorized kitchen changes, 24/7.
- **rollback = time machine ↩** — `git revert` takes you back; Argo is the engine.
- **OutOfSync keyword trick:** "git push" in the story → apply; "kubectl" in the story → selfHeal.
- **Synced ≠ Healthy** — know both axes; they fail independently.
- **Pull > Push** because cluster creds never leave the cluster.
- **branch = environment** — main→prod, staging→staging. Merge to promote.
- **3-way diff:** Git desired vs live cluster vs last-applied = Argo's source of decisions.

---

## Summary

| Concept | One sentence |
|---------|-------------|
| GitOps | Git is the single source of truth; cluster reconciles to match it continuously |
| Argo CD | The pull-model agent (a pod inside the cluster) that runs the GitOps reconciliation loop |
| Application object | The CRD that tells Argo which repo/path/branch to watch and where to deploy |
| Synced / OutOfSync | Whether cluster matches Git right now |
| Healthy / Degraded | Whether the deployed workload is actually working |
| selfHeal | Auto-revert of manual cluster changes back to Git state |
| prune | Auto-delete of cluster objects that were removed from Git |
| Rollback | `git revert` + `git push`; Argo applies the reverted manifest |
| Push vs Pull | CI/Ansible push (outside-in); Argo pull (inside-out, creds stay inside) |
| branch = environment | Each branch maps to an environment; merge = promote |

---

## Self-check quiz

Pehle memory se jawab do, phir neeche kholo.

1. A developer runs `kubectl scale deployment app --replicas=0` on production. `selfHeal: true` is
   set. What happens, and which OutOfSync cause is this?

2. CI pushes a new image tag to `k8s/deployment.yaml` on the main branch. Argo is polling.
   Describe the exact sequence from that commit to a Healthy cluster.

3. What is the difference between **Synced + Degraded** and **OutOfSync + Healthy**? Give a
   realistic scenario for each.

4. Why does `git revert` produce a better rollback than `argocd app rollback`?

5. An engineer wants to make an emergency change during an incident but `selfHeal` is on.
   Walk through the correct procedure.

6. You have three environments: dev, staging, prod. Design a Git branching strategy and three
   Argo Application objects to serve them. Promotion to prod = one `git merge`.

7. CI currently runs `kubectl apply` directly after build. What are the two security risks, and
   how does the manifest-update + Argo pattern remove them?

8. Explain the 3-way diff. Why does Argo need three inputs rather than just comparing Git to the
   live cluster?

<details markdown="1"><summary>Jawab dekho</summary>

1. Cause B (cluster changed — `kubectl` ne kiya). selfHeal detects replicas=0 vs Git ka declared value aur ~30s–3min mein wapas Git wala count apply kar deta hai.
2. Argo ~3 min poll ke baad naya image tag dekhta hai → OutOfSync (Cause A) → manifest apply karta hai → naya ReplicaSet starts → pods readiness probe pass karte hain → purane pods terminate → status: Synced + Healthy.
3. Synced+Degraded: Argo ne manifest apply kar diya (cluster=Git) lekin pods crash ho rahe hain (e.g. bad image tag → ImagePullBackOff). OutOfSync+Healthy: kisi ne manually replicas badhaye (`kubectl scale`) — pods sab running hain (Healthy) lekin Git se alag hain (OutOfSync). Dono axes independent hain.
4. `git revert` ek naya commit banata hai — Git aur cluster dono sync rehte hain Argo ke apply ke baad. `argocd app rollback` cluster wapas le jaata hai lekin Git ko nahi — next Argo sync rollback undo kar deta hai (split brain).
5. (1) Auto-sync band karo: `argocd app set <app> --sync-policy none`. (2) Manual `kubectl` change karo. (3) Root cause fix karo. (4) Git update karo desired state se match karne ke liye + push. (5) Auto-sync wapas on karo: `--sync-policy automated`.
6. Teen branches: dev/staging/main(prod). Teen Argo Applications — har ek apni branch watch karta hai (`targetRevision: dev/staging/main`). `staging→main` merge = prod automatically deploy. No separate deploy command.
7. (1) CI ke paas kubeconfig hai — CI hack = cluster exposed. (2) Koi permanent audit trail nahi. Manifest-update+Argo mein: CI sirf Git mein likhta hai; Argo (cluster ke andar) creds hold karta hai; Git commit = audit trail.
8. Teen inputs: (1) Git desired, (2) live cluster, (3) last-applied annotation. Sirf (1) vs (2) se Argo intentional in-cluster change aur drift mein fark nahi kar sakta — teeno chahiye accurate diff ke liye.
</details>

---

## Hands-on lab

**Environment:** k3s or kind cluster, any public Git repo.

### Lab 1 — Install Argo CD and point it at a repo

```bash
# Start a local cluster (kind)
kind create cluster --name gitops-lab

# Install Argo CD
kubectl create namespace argocd
kubectl apply -n argocd -f \
  https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl -n argocd wait pod --all --for=condition=Ready --timeout=120s

# Port-forward to UI
kubectl port-forward svc/argocd-server -n argocd 8080:443 &

# Get password
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d && echo
```

### Lab 2 — Create an Application and watch the first sync

```bash
# Create a public GitHub repo with k8s/deployment.yaml:
#   apiVersion: apps/v1
#   kind: Deployment
#   metadata: {name: demo}
#   spec:
#     replicas: 1
#     selector: {matchLabels: {app: demo}}
#     template:
#       metadata: {labels: {app: demo}}
#       spec:
#         containers:
#         - name: demo
#           image: nginx:1.25

# Apply your Application CRD
kubectl apply -f argocd/application.yaml   # pointing at your repo's k8s/ folder

# Watch sync happen
argocd app get demo-app --watch
# Expected: OutOfSync → Synced → Healthy
```

### Lab 3 — Trigger a deploy by updating Git

```bash
# Change nginx:1.25 to nginx:1.26 in your repo, commit, push
sed -i 's/nginx:1.25/nginx:1.26/' k8s/deployment.yaml
git add k8s/deployment.yaml
git commit -m "feat: bump nginx to 1.26"
git push

# Within ~3 minutes, watch Argo detect and apply
argocd app get demo-app --watch
# Observe: OutOfSync (Cause A: Git changed) → Synced
kubectl get pods   # new pod with nginx:1.26
```

### Lab 4 — Manual drift and selfHeal

```bash
# Cause drift: scale manually
kubectl scale deployment demo --replicas=4   # Git says replicas: 1

# Watch selfHeal kick in (within ~30 seconds to 3 minutes)
kubectl get deployment demo --watch
# Replicas: 4 ... then back to 1

# Check Argo events
argocd app get demo-app
# Event: "Synced to <commit>" — selfHeal fired
```

### Lab 5 — Rollback with git revert

```bash
# Record the "bad" commit SHA
BAD=$(git rev-parse HEAD)

# Revert it
git revert $BAD --no-edit
git push

# Argo detects the revert commit → applies nginx:1.25 again
argocd app get demo-app --watch
kubectl get deployment demo -o jsonpath='{.spec.template.spec.containers[0].image}'
# nginx:1.25 is back
```

> **Lab note (small nodes):** Argo CD's full install (~1 GB RAM for all components) will stress a
> t3.micro or single-node kind cluster. Add swap on EC2: `fallocate -l 2G /swapfile && chmod 600
> /swapfile && mkswap /swapfile && swapon /swapfile`. Make it permanent: add to `/etc/fstab`.
> Use `kubectl apply --validate=false` if the API server is slow under load. In production, size
> the Argo namespace to at least 2–4 GB RAM across its pods.

**✅ Sahi hua to aisa dikhega:** Argo UI mein app pehle OutOfSync dikhti hai, phir Synced+Healthy ho jaati hai nayi image commit ke baad (Lab 3); `kubectl scale` karte hi ~30s–3min mein replicas apne aap Git wali value pe wapas aa jaate hain — selfHeal ne revert kiya (Lab 4); `git revert` push karne par `argocd app get demo-app` mein purana nginx image tag wapas dikhta hai aur cluster match karta hai (Lab 5).

---

## Interview questions

**Q1: What are the two causes of OutOfSync in Argo CD, and how do you distinguish them in a
scenario question?**

Cause A: Git changed (CI pushed a new manifest) — Argo will apply it. Cause B: Cluster drifted
from Git (someone ran kubectl) — selfHeal will revert it. Distinguish by keyword: "git push"
or "CI committed" = Cause A; "kubectl edit/scale/delete" = Cause B.

**Q2: Why is the pull model (Argo CD) more secure than the push model (CI running kubectl apply)?**

In the pull model, cluster credentials never leave the cluster — Argo runs as a pod inside and uses
its own ServiceAccount. In the push model, CI must hold a kubeconfig outside the cluster. If the CI
system is compromised in push mode, the attacker gets cluster access. In pull mode, they only get
access to the Git repo.

**Q3: A developer says "I need to scale up immediately in production — I can't wait 3 minutes for
Argo." How do you handle this with selfHeal enabled?**

Disable auto-sync: `argocd app set <app> --sync-policy none`. Make the manual `kubectl` change.
Fix the root cause. Then update Git to reflect the new desired state, push, and re-enable auto-sync.
The better long-term answer: always go through Git so the change is audited and selfHeal is not
fighting you.

**Q4: What is the difference between Synced and Healthy in Argo CD, and give an example where they
are in conflicting states?**

Synced means cluster matches Git. Healthy means pods are running and ready. They are independent.
Example of Synced + Degraded: CI pushed a manifest with a bad image tag. Argo applied it (Synced),
but pods are in ImagePullBackOff (Degraded). Example of OutOfSync + Healthy: a developer manually
increased replicas to 10; current pods all pass health checks (Healthy), but Git says replicas=2
(OutOfSync).

**Q5: Why should you use `git revert` for rollback rather than `argocd app rollback`?**

`argocd app rollback` rolls the cluster back to a previous Argo snapshot but does not create a Git
commit. This leaves Git ahead of the cluster — a split-brain state where Git says one thing and the
cluster is running something else. The next sync will undo your rollback. `git revert` creates a
new commit that undoes the bad change; Argo syncs to that commit, and Git and cluster agree. Audit
trail is preserved.

**Q6: Explain the "branch = environment" pattern and how it enables safe promotion.**

Each environment has its own Argo Application pointing at a different branch. Staging watches the
`staging` branch; production watches `main`. A developer merges their feature branch into `staging`
— the staging cluster reconciles. After QA passes, they merge `staging` into `main` — the prod
cluster reconciles. Promotion is a `git merge`, not a separate deploy script. The Git history is
the promotion history.

**Q7: What does `prune: true` do, and what is the risk of setting it?**

With `prune: true`, Argo deletes cluster objects that are no longer declared in Git. This is correct
behavior — it prevents orphaned Services, ConfigMaps, and Deployments from accumulating. The risk:
if someone accidentally removes a manifest from the Git repo (bad merge, wrong delete), Argo will
delete that object from the cluster. Always review what you are removing from the repo before
pushing.

---

## Production challenge

You are the platform engineer for a company running three microservices (api, worker, frontend)
across dev, staging, and prod environments on AWS EKS.

**Requirements:**
1. A single Git repo holds manifests for all three services and all three environments.
2. A `git push` to the `dev` branch by any developer should deploy only to dev.
3. Promotion from dev to staging requires a PR approval.
4. Promotion to prod requires two approvals and a passing CI run.
5. Any manual `kubectl` change to prod is automatically reverted within 5 minutes.
6. Rollback to any prior version of any service must be possible in under 10 minutes, using only
   Git operations.

Design the Argo CD Application objects, the Git branching model, and the CI workflow triggers to
satisfy all six requirements. Describe what happens at each stage when a developer pushes a bug fix
that starts in dev and must reach prod by end of day.

> **Hint:** This requires three Argo Applications (one per environment), branch protection rules,
> `selfHeal: true` on prod only, and the manifest-update pattern in CI. The app-of-apps pattern
> can help manage the three Applications as a single deployable unit.
