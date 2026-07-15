# 29 — The 10-Day Confidence Sprint: Revise · Do · Prove

> **Ye chapter kab padhen:** Jab concepts *clear ho chuke hain* aur ab **haath ka bharosa** (confidence) chahiye — real project pe karke, recall karke, bol ke. Ye [27 — 10-Day Learning Plan](27-10-day-plan.md) ka **agla step** hai.
>
> - **[27 — Learning Plan](27-10-day-plan.md)** = *pehli baar* — restaurant analogy se sab connect karo (understand).
> - **29 (yeh) — Confidence Sprint** = *dusri baar* — padhna band, **karo + recall karo + bolo** (drill).

---

## The one honest truth about this sprint

Tera content gap mein nahi hai — **execution mein hai.**

Is handbook mein 28 module hain: recall gates, flashcards, incident playbook (26 issues), 2 capstones, chaos engineering. Ye kisi paid bootcamp se behtar hai. Par agar [progress.md](progress.md) ke checkbox **untick** hain aur spaced-review log **khaali** hai — to matlab *padha bahut, drill nahi kiya*. Aur confidence content se nahi, **reps** se aata hai.

Ye 10 din isi ek cheez ke liye hain: **har concept ko apne do real projects pe karo** — VANTA-Boutique (kind, local) aur Billfree-techops (AWS, production) — padho mat, *karo*.

!!! tip "🎨 Visual dashboard"
    Isi sprint ka ek interactive, daily-open dashboard bhi hai: **`10_Day_Confidence_Sprint.html`** (repo root). Roz kholo, aaj ka din expand karo, 3 lanes karo, tick karo. Ye chapter reference + progress tracking ke liye; wo daily driver ke liye.

---

## Gap analysis — saaf baat (jo actually gaps hain)

| Bucket | Kya | Sprint mein |
|--------|-----|-------------|
| ✅ **Poora + gehra** | Linux, Git, Docker, K8s core+config+storage, CI/CD, GitOps, Helm, Kustomize, Terraform, Ansible, Observability, Incident playbook, Chaos | Bas **drill** karo |
| ⚠️ **Patla** (concept hai, hands-on kam) | Secrets maturity (Vault / SealedSecrets / External Secrets), Service mesh (Istio/mTLS), Azure/AZ-900 | Ek mini-lab / abhi optional |
| ⏭️ **Abhi skip** (10-din ke baad) | Roadmap [M11–M18](15-roadmap-M11-M18.md) — progressive delivery, supply-chain security, distributed systems | Baad mein |

> 🇮🇳 **Hinglish intuition:** Tere paas gadi (content) already hai — bas chalayi nahi. Ye sprint driving lessons hai, nayi gadi kharidna nahi.

---

## Har din ka format — 3 lanes

Har din yehi teen lanes, isi order mein. Kabhi sirf padho mat.

| Lane | Time | Kya |
|------|------|-----|
| ↩️ **Revise** | ~15 min | Us din ke chapter ka *recall gate* **memory se** — dobara padho nahi, dobara *nikaalo*. Yehi [active recall](00-INDEX.md) hai (spaced-review system). |
| ▸ **Do** | 60–90 min | Terminal kholo. VANTA/Billfree pe **actual commands**. Todo, banao, badlo. Haath se — koi tumhare liye execute na kare. |
| ✅ **Prove** | ~15 min | Blank page pe diagram banao, ya loud bolo jaise interview mein. Atka? **Wahi kal ka revise.** |

---

## The 10-day map

```mermaid
flowchart LR
  D1["Day 1\nLinux·Git·Docker"]:::a
  D2["Day 2\nK8s Core"]:::a
  D3["Day 3\nConfig·Secret·Storage"]:::b
  D4["Day 4\nNetworking"]:::c
  D5["Day 5\nCI/CD"]:::c
  D6["Day 6\nGitOps·Helm"]:::d
  D7["Day 7\nTerraform·Ansible"]:::e
  D8["Day 8\nObservability"]:::b
  D9["Day 9\nBreak & Fix"]:::e
  D10["Day 10\nEnd-to-end + Interview"]:::c
  D1-->D2-->D3-->D4-->D5-->D6-->D7-->D8-->D9-->D10
  classDef a fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20
  classDef b fill:#fff3e0,stroke:#e65100,color:#bf360c
  classDef c fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
  classDef d fill:#f3e5f5,stroke:#6a1b9a,color:#4a148c
  classDef e fill:#fce4ec,stroke:#880e4f,color:#880e4f
```

---

## Day 1 — Fundamentals drill: Linux · Git · Docker

*zameen pakki karo*

=== "↩️ Revise (15 min)"
    - [21 — Linux toolkit](21-linux-toolkit.md) + [04 — Docker](04-M3-docker.md) ke recall gates, memory se
    - Ek line: image vs container vs registry vs layer?

=== "▸ Do (60–90 min)"
    - **VANTA:** frontend ka Dockerfile padho → `docker build` → `docker run` → browser
    - `docker exec -it <id> sh` — andar ghuso, files/env dekho
    - Linux debug drill: `top`, `df -h`, `ss -tlnp`, `journalctl`, `tail -f`
    - Git: branch banao → change → commit → merge → `git log --oneline`

=== "✅ Prove (15 min)"
    - Blank page: `Dockerfile → build → image → run → container` flow likho
    - Loud bolo: "layer caching se rebuild fast kaise hota hai?"

📖 [21-linux-toolkit](21-linux-toolkit.md) · [04-M3-docker](04-M3-docker.md) · [22-command-cheatsheets](22-command-cheatsheets.md)

---

## Day 2 — Kubernetes Core: self-heal, scale, rollout

*cook + manager + counter*

=== "↩️ Revise"
    - [05 — K8s Core](05-M4-kubernetes-core.md) + [26 — Objects map](26-k8s-objects-map.md) recall gates
    - Pod vs ReplicaSet vs Deployment — kaun kya, labels ka role?

=== "▸ Do"
    - **VANTA (kind ready hai):** `kubectl get pods,deploy,svc,rs -L app` — label flow dekho
    - Self-heal: `kubectl delete pod <frontend-pod>` → khud wapas aata hai
    - Scale: `kubectl scale deploy frontend --replicas=4` → watch
    - Rollout: image badlo → `kubectl set image` → `kubectl rollout status` → `kubectl rollout undo`

=== "✅ Prove"
    - Blank page: self-heal loop (desired vs actual → controller → new pod)
    - Loud: "rolling update mein zero downtime kaise?"

📖 [05-M4-kubernetes-core](05-M4-kubernetes-core.md) · [26-k8s-objects-map](26-k8s-objects-map.md)

---

## Day 3 — Config · Secret · Storage: break & fix

*masala + pantry*

=== "↩️ Revise"
    - ConfigMap vs Secret vs PVC — kab kaun? (visual: `Helm_ConfigMap_Secret_Init_samjho.html`)

=== "▸ Do"
    - **VANTA:** ek ConfigMap banao, frontend env usse inject karo, restart, verify
    - Secret banao `kubectl create secret generic` → Pod mein `secretRef`
    - **Billfree:** postgres StatefulSet + `volumeClaimTemplates` padho — PVC lifecycle
    - **Break:** galat secret key do → Pod fail → `describe`/`logs` se fix

=== "✅ Prove"
    - Loud: "Secret Git mein kyun nahi? base64 encryption kyun nahi?"
    - Pod restart pe PVC ka data kyun bacha rehta hai — samjhao

📖 [05-M4-kubernetes-core](05-M4-kubernetes-core.md) (config/storage) · [11-M9-advanced-k8s-internals](11-M9-advanced-k8s-internals.md)

---

## Day 4 — Networking: Service · Ingress · DNS · NetworkPolicy

*request → pod tak*

=== "↩️ Revise"
    - Service 4 types, CoreDNS, kube-proxy, Calico

=== "▸ Do"
    - **VANTA:** pod-to-pod — ek pod mein `exec` → `wget cartservice:7070` — DNS se baat
    - `kubectl get svc,endpoints` — Service ke peeche kaunse pod IPs
    - **Billfree:** ingress-nginx + host/path routing padho; NetworkPolicy yaml
    - **Break:** Service ka selector label galat karo → traffic gir jaye → fix

=== "✅ Prove"
    - Blank page: User → DNS → Ingress → Service → Pod — poora hop draw
    - Loud: "Calico vs Service — kaun packet ko kahan pahunchata?"

📖 [11-M9-advanced-k8s-internals](11-M9-advanced-k8s-internals.md) · [20-confusions-and-tradeoffs](20-confusions-and-tradeoffs.md)

---

## Day 5 — CI/CD: follow one commit

*test kitchen*

=== "↩️ Revise"
    - CI vs CD, runner, image tag handoff, Trivy scan — kyun zaroori

=== "▸ Do"
    - **Billfree:** `.github/workflows` padho — test → build → push → tag update
    - Ek chhota code change → push → GitHub Actions run live dekho
    - Trace: image kahan build/push hui, config repo mein tag kaise badla
    - **VANTA (local):** `docker build` → `kind load` → `kubectl set image`

=== "✅ Prove"
    - Loud: "CI cluster ko touch kyun nahi karta? handoff kahan hai?"
    - Blank page: git push → … → running pod (har box likho)

📖 [07-M6-cicd](07-M6-cicd.md) · [19-cicd-hands-on-flow](19-cicd-hands-on-flow.md)

---

## Day 6 — GitOps + Helm: ArgoCD sync & drift

*manager + meal deal*

=== "↩️ Revise"
    - Pull vs push CD, auto-sync, self-heal, prune; Helm chart vs values (visual: `Helm_ConfigMap_Secret_Init_samjho.html`)

=== "▸ Do"
    - **VANTA:** ArgoCD `kind` pe install → Application connect → sync dekho
    - **Drift test:** `kubectl scale` se manually badlo → ArgoCD wapas Git jaisa kar de
    - **Billfree:** Helm chart + values structure padho; `helm template` se rendered YAML
    - ApplicationSet + app-of-apps pattern samjho

=== "✅ Prove"
    - Loud: "rollback GitOps mein kaise? (git revert)"
    - Kustomize vs Helm — ek line mein farak

📖 [08-M7-gitops](08-M7-gitops.md) · [28-helm-real-projects](28-helm-real-projects.md)

---

## Day 7 — Outer loop: Terraform · Ansible · AWS

*building banao*

=== "↩️ Revise"
    - IaC kyun, state file, plan-before-apply, idempotency, push vs pull

=== "▸ Do"
    - **Billfree:** `infra/terraform` padho — compute, network, cloud-init (kubeadm)
    - `terraform plan` chalao — kya banega, state kya kehti hai
    - Safe lab: ek S3 bucket `apply` → verify → `destroy`
    - Ansible playbook padho — nodes pe kya configure hota (containerd, kubeadm)

=== "✅ Prove"
    - Loud: "Terraform → Ansible → K8s — kaun kya banata, handoff kahan?"
    - tfstate delete ho jaye to kya hota — samjhao

📖 [02-M1-terraform](02-M1-terraform.md) · [03-M2-ansible](03-M2-ansible.md) · [06-M5-sizing-and-cost](06-M5-sizing-and-cost.md)

---

## Day 8 — Observability & SRE: 2 a.m. drill

*health inspector*

=== "↩️ Revise"
    - RED vs USE metrics, logs vs metrics vs traces, SLO/alert

=== "▸ Do"
    - **VANTA:** `kube-prometheus-stack` Helm se install → Grafana port-forward
    - 4 dashboards: compute, networking, node-exporter, ArgoCD
    - **Billfree:** ServiceMonitor + PrometheusRule padho — thresholds (error 5%, p95 1s)
    - Load daalo (loadgenerator) → CPU/latency graph move karte dekho

=== "✅ Prove"
    - Loud: "app slow hai — main pehle kya dekhun, kis order mein?"

📖 [10-M8-observability-sre](10-M8-observability-sre.md)

---

## Day 9 — Break & fix: Incident + Chaos

*yahi confidence deta hai*

=== "↩️ Revise"
    - Debug order: `describe` → events → `logs --previous` → root cause
    - Exit codes: 137 (OOM/SIGKILL), 1, 0 — kya matlab

=== "▸ Do — jaan-boojh ke todo, phir fix karo"
    - **VANTA — CrashLoop:** liveness timeout 1s karo → CrashLoop → diagnose → fix
    - **OOMKilled:** memory limit bahut kam karo → 137 → badhao
    - **ImagePullBackOff:** galat image tag → describe se pakdo
    - **PVC Pending / Service no endpoints:** playbook ke 26 issues mein se 5 chuno

=== "✅ Prove"
    - Har issue: symptom → diagnose command → fix → prevent — likho
    - Ye war-stories interview mein sona hai

📖 [23-production-incident-playbook](23-production-incident-playbook.md) · [25-production-gauntlet-chaos](25-production-gauntlet-chaos.md)

---

## Day 10 — Grand opening: end-to-end + interview

*sab jodo, bolo*

=== "↩️ Revise"
    - [09 — Connected System](09-connected-system.md): 2 loops + 8 bridges + 5 golden threads

=== "▸ Do — one commit to prod"
    - **Billfree:** ek chhota change → push → CI green → ArgoCD sync → Grafana check — poora flow ek baar khud
    - VANTA + Billfree dono ka README/docs polish — portfolio ready

=== "✅ Prove — the final test"
    - **Blank page (no notes):** 2 loops + 8 bridges + 5 threads draw karo
    - **Whiteboard talk:** "git push se user tak" 10 min bolo, loud
    - **STAR stories:** VANTA aur Billfree se 3 real "maine kya kiya" answers likho

📖 [09-connected-system](09-connected-system.md) · [14-interview-bank](14-interview-bank.md) · [18-career-job-ready](18-career-job-ready.md)

---

## Har din chalta rahega — the recall habit

!!! note "🔁 5-min daily recall (ye chhodna mat)"
    | Kab | Kya |
    |-----|-----|
    | **Subah** | Kal wale din ka recall gate — memory se, 5 min |
    | **Din mein** | Aaj ka *Do* lane — haath se, terminal pe |
    | **Raat** | [17 — Flashcards](17-flashcards.md) — us din ke module ke, 5 min |
    | **[progress.md](progress.md)** | Aaj ke checkbox tick karo — *dikhta progress hi motivation hai* |

---

## 10 din baad — "confident" ka matlab

- **Padha nahi — kiya.** Har din progress tick hua, har concept apne project pe chala.
- **Recall aaya.** Blank page pe 2 loops + 8 bridges bina notes ke bana sakte ho.
- **Bol sakte ho.** "git push se user tak" 10 min whiteboard pe, + VANTA/Billfree ki 3 STAR stories.
- **Toota, phir theek kiya.** CrashLoop/OOM/502 khud banaye aur fix kiye — yehi "2.5-saal experience" *dikhna* hai.

> 🇮🇳 **Final baat:** Ye sprint ka maqsad naya seekhna nahi — jo aata hai use *haath* aur *zubaan* mein laana hai. Har din: revise karo (memory), karo (terminal), prove karo (blank page + loud). 10 din baad tum confident nahi *mehsoos* karoge — confident *hoge*.

---

*Connected pages: [27 — 10-Day Learning Plan (conceptual)](27-10-day-plan.md) · [09 — Connected System](09-connected-system.md) · [23 — Incident Playbook](23-production-incident-playbook.md) · [17 — Flashcards](17-flashcards.md) · [progress.md](progress.md)*
