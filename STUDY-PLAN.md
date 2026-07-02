# Study Plan — DevOps Handbook

Pick a track, show up consistently, and let spaced review do the heavy lifting.
This plan isn't about cramming — it's about building durable mental models that
stick in interviews and on the job. Every week bakes in a quick revisit of last
week's material so nothing fades.

Three tracks are available. Choose ONE and stick with it.
Track your checkbox progress in [`PROGRESS.md`](PROGRESS.md).

---

## Pick Your Track

| Track | Pace | Hours/week | Total duration | Best for |
|-------|------|-----------|----------------|----------|
| **12-Week (default)** | Part-time | 6–8 hrs | 12 weeks | Working professionals, college students with classes |
| **6-Week accelerated** | Full-time / bootcamp | 25–30 hrs | 6 weeks | Career-switchers, people between jobs |
| **Weekend track** | 1 focused day/week | ~5 hrs/session | ~20 weeks | Busy schedules, slow-and-steady learners |

> Hinglish tip: Ek track choose karo aur usse chipke raho. Track switch karna = progress lose karna.
> Sab ~90 hours ka content hai — sirf tempo alag hai.

---

## The 12-Week Plan (Default)

Each week = ~6–8 hours across 3–4 sessions.
"Revisit flashcards" = prior module's deck in [`17-flashcards.md`](DevOps-Handbook/17-flashcards.md).

| Week | Read (chapters) | Do (labs) | Flashcards | Milestone / ✅ |
|------|----------------|-----------|------------|----------------|
| **1** | [00a Pre-flight](DevOps-Handbook/00a-preflight.md) · [00b Setup Runbook](DevOps-Handbook/00b-setup-runbook.md) · [01 M0 Foundations](DevOps-Handbook/01-M0-foundations.md) | Pre-flight checklist · all tools installed & verified | M0 intro deck | ✅ Tooling installed · Day-1 recall on 00a |
| **2** | [02 M1 Terraform](DevOps-Handbook/02-M1-terraform.md) | Terraform lab — provision infra | M0 flashcards (Day-3 revisit) · M1 deck | ✅ First `terraform apply` succeeds |
| **3** | [03 M2 Ansible](DevOps-Handbook/03-M2-ansible.md) | Ansible playbook lab | M1 flashcards (Day-3) · M2 deck | ✅ Playbook runs end-to-end |
| **4** | [04 M3 Docker](DevOps-Handbook/04-M3-docker.md) | Docker build + run + push lab | M2 flashcards (Day-3) · M3 deck | ✅ App containerised, image pushed |
| **5** | [05 M4 Kubernetes Core](DevOps-Handbook/05-M4-kubernetes-core.md) | K8s deploy + service lab | M3 flashcards (Day-3) · M4 deck | ✅ Pod running, Service exposed |
| **6** | [06 M5 Sizing & Cost](DevOps-Handbook/06-M5-sizing-and-cost.md) · [07 M6 CI/CD](DevOps-Handbook/07-M6-cicd.md) | CI/CD pipeline lab | M4 flashcards (Day-3) · M5 + M6 deck | 🏗️ **Toolchain complete** · pipeline green |
| **7** | [08 M7 GitOps](DevOps-Handbook/08-M7-gitops.md) · [09 Connected System](DevOps-Handbook/09-connected-system.md) | ArgoCD sync lab | M6 flashcards (Day-3) · M7 deck | 🧠 **Systems thinking unlocked** |
| **8** | [10 M8 Observability & SRE](DevOps-Handbook/10-M8-observability-sre.md) | Prometheus + Grafana lab | M7 flashcards (Day-3) · M8 deck | ✅ Dashboard live, alert fires |
| **9** | [11 M9 Advanced K8s Internals](DevOps-Handbook/11-M9-advanced-k8s-internals.md) | K8s internals lab — RBAC + CRDs | M8 flashcards (Day-3) · M9 deck · Day-7 recall M1–M4 | ✅ RBAC policies working |
| **10** | [12 Capstone I — URL Shortener](DevOps-Handbook/12-capstone-url-shortener.md) phase 1 | Code app · Dockerise · deploy to K8s | M9 flashcards (Day-3) | ✅ App deployed on cluster |
| **11** | [12 Capstone I](DevOps-Handbook/12-capstone-url-shortener.md) phase 2 — CI + GitOps + observability | CI pipeline + Argo sync + Grafana dashboard | All module flashcards · **Day-30 blank-page test** | 🚀 **First end-to-end deploy** · rollback tested |
| **12** | [13 Capstone II preview](DevOps-Handbook/13-capstone-microshop.md) · [14 Interview Bank](DevOps-Handbook/14-interview-bank.md) · [18 Career & Job-Ready](DevOps-Handbook/18-career-job-ready.md) | Mock interviews · resume + LinkedIn polish | Full flashcard sweep | 🎯 **Interview-ready** |

> Wk 12 bonus: skim [15 Roadmap M11–M18](DevOps-Handbook/15-roadmap-M11-M18.md) + [16 Reference Appendix](DevOps-Handbook/16-reference-appendix.md) to know what comes next.

---

## The 6-Week Accelerated Plan

Same 21 chapters, double the daily pace — ~2 chapters + 1 lab per day.
This works only if you treat it like a full-time job. No half-days.

| Week | Read | Labs | Flashcards | Milestone |
|------|------|------|------------|-----------|
| **1** | [00a](DevOps-Handbook/00a-preflight.md) · [00b](DevOps-Handbook/00b-setup-runbook.md) · [M0](DevOps-Handbook/01-M0-foundations.md) · [M1 Terraform](DevOps-Handbook/02-M1-terraform.md) | Pre-flight + Terraform lab | M0 + M1 decks | ✅ Infra provisioned |
| **2** | [M2 Ansible](DevOps-Handbook/03-M2-ansible.md) · [M3 Docker](DevOps-Handbook/04-M3-docker.md) · [M4 Kubernetes](DevOps-Handbook/05-M4-kubernetes-core.md) | Ansible + Docker + K8s labs | M2 + M3 + M4 decks | 🏗️ **Toolchain foundations** |
| **3** | [M5 Sizing](DevOps-Handbook/06-M5-sizing-and-cost.md) · [M6 CI/CD](DevOps-Handbook/07-M6-cicd.md) · [M7 GitOps](DevOps-Handbook/08-M7-gitops.md) | CI/CD pipeline + ArgoCD lab | M5 + M6 + M7 decks | 🏗️ **Full toolchain complete** |
| **4** | [09 Connected System](DevOps-Handbook/09-connected-system.md) · [M8 Observability](DevOps-Handbook/10-M8-observability-sre.md) · [M9 K8s Internals](DevOps-Handbook/11-M9-advanced-k8s-internals.md) | Prometheus/Grafana + RBAC lab | M8 + M9 decks · Day-7 recall all modules | 🧠 **Systems thinking** |
| **5** | [Capstone I](DevOps-Handbook/12-capstone-url-shortener.md) (full — all phases) | Build → Docker → K8s → CI → GitOps → Observe → Rollback | Full deck sweep · Day-30 blank-page test | 🚀 **End-to-end deploy** |
| **6** | [Capstone II preview](DevOps-Handbook/13-capstone-microshop.md) · [Interview Bank](DevOps-Handbook/14-interview-bank.md) · [Career](DevOps-Handbook/18-career-job-ready.md) · [Roadmap](DevOps-Handbook/15-roadmap-M11-M18.md) | Mock interviews | Final flashcard sweep | 🎯 **Interview-ready** |

> Accelerated track mein ek din bhi miss mat karo — momentum hi sab kuch hai.

---

## The Weekend Track (~20 Weeks)

One dedicated day per week, ~5 hours per session. Ideal when weekdays are not available.
Spaced review happens naturally across the week gap — use it.

| Weeks | Read | Lab / Activity | Notes |
|-------|------|---------------|-------|
| 1–2 | [00a](DevOps-Handbook/00a-preflight.md) · [00b](DevOps-Handbook/00b-setup-runbook.md) | Install all tools, verify pre-flight | Take your time — a broken setup costs 2× later |
| 3 | [M0 Foundations](DevOps-Handbook/01-M0-foundations.md) | Foundations quiz + M0 flashcards | |
| 4–5 | [M1 Terraform](DevOps-Handbook/02-M1-terraform.md) | Terraform lab both sessions | Wk 5 = revisit + deepen |
| 6 | [M2 Ansible](DevOps-Handbook/03-M2-ansible.md) | Ansible playbook lab | Day-1 recall on M1 this week |
| 7–8 | [M3 Docker](DevOps-Handbook/04-M3-docker.md) | Docker build/run/push lab | Wk 8 = extend lab with compose |
| 9–10 | [M4 Kubernetes Core](DevOps-Handbook/05-M4-kubernetes-core.md) | K8s deploy + service + ingress | 🏗️ Toolchain foundations done |
| 11 | [M5 Sizing & Cost](DevOps-Handbook/06-M5-sizing-and-cost.md) | Cost modelling exercise | |
| 12 | [M6 CI/CD](DevOps-Handbook/07-M6-cicd.md) | CI/CD pipeline lab | 🏗️ **Toolchain complete** |
| 13–14 | [M7 GitOps](DevOps-Handbook/08-M7-gitops.md) · [09 Connected System](DevOps-Handbook/09-connected-system.md) | ArgoCD lab + draw the system end-to-end | 🧠 **Systems thinking** |
| 15 | [M8 Observability & SRE](DevOps-Handbook/10-M8-observability-sre.md) | Prometheus + Grafana lab | |
| 16 | [M9 Advanced K8s Internals](DevOps-Handbook/11-M9-advanced-k8s-internals.md) | RBAC + CRD lab | Day-30 blank-page test this weekend |
| 17–18 | [Capstone I — URL Shortener](DevOps-Handbook/12-capstone-url-shortener.md) | Full build-to-deploy project | 🚀 **First end-to-end deploy** |
| 19 | [Interview Bank](DevOps-Handbook/14-interview-bank.md) · [Career](DevOps-Handbook/18-career-job-ready.md) | Mock Q&A + resume polish | |
| 20 | [Capstone II preview](DevOps-Handbook/13-capstone-microshop.md) · [Roadmap](DevOps-Handbook/15-roadmap-M11-M18.md) | Start Capstone II · pick next track | 🎯 **Interview-ready** |

---

## Daily Rhythm (60–90 min session)

Use this template every single session — it forces active recall before passive reading.

```
┌─────────────────────────────────────────────────────────────┐
│  5 min   │ Recall gate — prior chapter, no notes             │
│          │ "What did I learn? What was the lab? Key terms?"  │
├──────────┼──────────────────────────────────────────────────┤
│ 40–60 min│ Read chapter + complete lab (follow ✅ success    │
│          │ check — do not skip the lab)                      │
├──────────┼──────────────────────────────────────────────────┤
│ 10 min   │ Quiz — cover all answers, write from memory,      │
│          │ then reveal. Missed ones = tomorrow's recall gate  │
├──────────┼──────────────────────────────────────────────────┤
│  5 min   │ Flashcards — today's new cards in 17-flashcards   │
│          │ Add any missed quiz items as hand-written cards    │
└──────────┴──────────────────────────────────────────────────┘
```

### Rules that make the rhythm work

1. **Lab before next chapter** — never skip a lab to "read ahead". The lab is the chapter.
2. **Quiz cold** — write answers before you look. Wrong answers are data, not failure.
3. **Recall gate first** — the 5-minute recall at the top of each session is the single highest-ROI habit in this plan. Bahut log skip karte hain — wahi galti mat karo.
4. **Stuck on lab > 20 min?** — open [`16-reference-appendix.md`](DevOps-Handbook/16-reference-appendix.md) and the chapter's troubleshooting section before Googling. Search only after that.

### Spaced-Review Schedule

| Review event | When | What to do |
|-------------|------|-----------|
| **Learn** | Day 0 | Read chapter · do lab · do quiz |
| **Recall gate** | Day 1 | Answer recall questions cold — no notes, no scrolling |
| **Flashcards** | Day 3 | Run today's module deck in [`17-flashcards.md`](DevOps-Handbook/17-flashcards.md) |
| **Next-chapter recall** | Day 7 | Re-do prior chapter's recall gate completely cold |
| **Blank-page mastery test** | Day 30 | Draw 2 feedback loops, 8 tool bridges, 5 threads — zero notes |

> The Day-30 blank-page test is non-negotiable.
> Agar blank page pe draw kar sakte ho bina dekhe — concept truly absorbed hai.

Log these dates in the **Spaced-Review Log** in [`PROGRESS.md`](PROGRESS.md).

---

## Milestones

These are capability unlocks, not just chapter completions. Celebrate them.

### 🏗️ Toolchain Complete — *after M6 (Week 6)*
You can provision infra (Terraform), configure servers (Ansible), package apps (Docker),
run them on K8s, cost-model the cluster, and wire up a CI/CD pipeline.
**Verify:** `terraform`, `ansible`, `docker`, `kubectl`, `argocd` all respond in your terminal.
You can provision a VM, deploy a container, and trigger a build from a single git push.

### 🧠 Systems Thinking — *after Chapter 09 (Week 7)*
You can draw the entire DevOps loop from scratch: code → build → test → package →
provision → deploy → observe → feedback. You understand WHY each tool exists.
**Verify:** Explain to someone (rubber duck counts) how Terraform → Ansible → Docker →
K8s → CI/CD → GitOps connect as a single system without looking at notes.

### 🚀 First End-to-End Deploy — *Capstone I done (Week 11)*
A real URL Shortener app: coded, Dockerised, deployed to Kubernetes, CI pipeline green,
ArgoCD synced, Grafana dashboard live, rollback tested, and cluster cleaned up.
**Verify:** All 7 items in the Capstone checklist in PROGRESS.md are ticked. ✅

### 🎯 Interview-Ready — *after Chapter 14 + 18 (Week 12)*
You can answer 10 random questions from the interview bank without notes.
Your resume has a project section pointing to a real deployed app.
**Verify:** Do a 30-minute mock interview with someone (or record yourself) using
[`14-interview-bank.md`](DevOps-Handbook/14-interview-bank.md).

---

## What to Do When You're Stuck

| Situation | Action |
|-----------|--------|
| Lab not working | Re-read the lab's ✅ success check · check the reference appendix · check chapter troubleshooting section |
| Concept unclear | Re-read the chapter summary · run the flashcards for that module · draw the concept on paper |
| Lost motivation | Re-read your last milestone · check progress bars in PROGRESS.md · skip to flashcards for a quick win |
| Fell behind by a week | Don't restart — pick up where you left off, compress the missed week into extra weekend sessions |
| Lab environment broken | See [00b Setup Runbook](DevOps-Handbook/00b-setup-runbook.md) troubleshooting section |

---

## After the Plan

You've finished 12 weeks (or 6, or 20). Now what?

- **Get the job** → [`DevOps-Handbook/18-career-job-ready.md`](DevOps-Handbook/18-career-job-ready.md)
  Resume, portfolio, LinkedIn, negotiation, system-design rounds
- **Keep growing** → [`DevOps-Handbook/15-roadmap-M11-M18.md`](DevOps-Handbook/15-roadmap-M11-M18.md)
  Service mesh (Istio), platform engineering, FinOps, security pipelines, SRE deep-dive — 8 more modules
- **Stay sharp** → [`DevOps-Handbook/17-flashcards.md`](DevOps-Handbook/17-flashcards.md)
  Run the full deck once a month · add cards from things you encounter at work
- **Capstone II** → [`DevOps-Handbook/13-capstone-microshop.md`](DevOps-Handbook/13-capstone-microshop.md)
  Multi-service e-commerce app, real-world complexity, portfolio-grade project
- **Handbook spine** → [`DevOps-Handbook/00-INDEX.md`](DevOps-Handbook/00-INDEX.md)
  Jump back to any chapter or reference section anytime

> Ek journey khatam, doosri shuru.
> The roadmap file lists 8 advanced modules — pick the one that matches your next role or the gap in your current job.
