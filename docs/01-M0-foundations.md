# M0 — Foundations & Mental Model

> **Core question:** Before you touch a single tool, can you explain what problem DevOps actually
> solves — and why every tool in this book exists?

---

> **⏱️ Time:** ~45 min padho · **🎚️ Level:** Beginner · **📋 Pehle chahiye:** kuch nahi (optionally [00a Pre-flight](00a-preflight.md))
>
> **Is module ke baad tum kar paoge:**
> - DevOps ke teen pillars aur chaaron layers (Terraform → Ansible → Docker → K8s) bina dekhe explain karo
> - Stateful vs stateless ka distinction use karke kisi bhi workload ko confidently classify karo
> - Outer loop (setup) aur inner loop (delivery) ko trace karo — `git push` se live pod tak

## The 60-second version

**DevOps is the discipline of automating the entire path from code to production — reliably,
repeatably, and fast.** It replaced a world where developers wrote code and threw it over the wall
to a separate Operations team who manually configured servers, deployed apps, and took the blame
when production broke.

Three pillars drive every decision in this book:

| Pillar | What it means in practice |
|--------|--------------------------|
| **Speed** | Ship features in minutes, not weeks |
| **Safety** | Automated tests, previews, rollbacks — humans cannot break prod by fat-fingering |
| **Repeatability** | Run the same automation ten times; get the same result every time |

**Memory hook:** Think of it as a recipe machine. Before DevOps, every chef cooked differently on
every server. DevOps is the recipe *plus* the machine that guarantees the same dish every time,
no matter who is in the kitchen.

---

## Why DevOps exists — what it replaced

In the pre-DevOps world two teams lived in different buildings with opposing goals:

- **Dev (Developers):** Ship features fast. "It works on my machine."
- **Ops (Operations):** Keep production stable. "Don't touch anything that works."

Software sat in a handoff queue for days or weeks. A developer delivered a zip file and a prayer.
The Ops engineer clicked through a cloud console, forgot one environment variable, and caused an
outage at 2 a.m. No audit trail. No rollback. Blame-game (the original "throw it over the wall"
culture).

**DevOps collapses this wall.** The same team owns the code, the pipeline, and production health.
Every deployment step is encoded in files that live in Git (the version-control system that
tracks every change), are reviewable by any team member, and are reproducible by a machine.

> 🇮🇳 **Hinglish intuition:** Pehle developer ne dabba (code) diya, ops ne kholne ki koshish ki
> — na key, na instructions. DevOps matlab: dabba khud khulta hai, aur khulne ka tarika code
> mein likha hai.

---

## First principles — servers, processes, state, and ports

You cannot understand DevOps tools without understanding what they operate on. Five minutes here
pays off for the rest of the book.

**Server**
A server is a computer running continuously, waiting to serve requests. It has a CPU (Central
Processing Unit — the brain that executes instructions), RAM (Random Access Memory — fast
temporary workspace), a disk (persistent storage), and a network card. In a cloud like AWS
(Amazon Web Services) you rent a virtual server called an EC2 (Elastic Compute Cloud) instance.

**OS and process**
The OS (Operating System — Linux on most production servers) manages hardware and runs programs.
When you launch a program the OS creates a *process*: a running instance with its own slice of
RAM and CPU time. If the process crashes, the program stops. A container is a lightweight,
isolated process with its own filesystem view.

**State**
State is any data that persists beyond a single request or process restart. Data held only in RAM
disappears when the process dies (ephemeral). Data written to a database or file on disk survives
restarts (persistent). This distinction drives most architectural decisions in this book — it is
the foundation of the Stateful vs Stateless concept.

**Network port**
A port is a numbered doorway on a server. Port 80 = HTTP (HyperText Transfer Protocol, the web).
Port 443 = HTTPS (HTTP Secure). Port 22 = SSH (Secure Shell, for remote terminal login). Multiple
services share a server by each using a different port. A Security Group in AWS is a firewall that
controls which ports accept traffic from the internet.

> 🇮🇳 **Hinglish intuition:** Server ek makan hai. Process ek kiraaydaar. RAM furniture hai
> (gaya to gaya). Disk almirah hai (tehta rehta). Port darwaza ka number hai — SSH ka darwaza
> 22 pe hai, wahi se andar jaate hain.

---

## The four layers of a running system

Getting an application from a developer's laptop to live production requires four distinct
activities, each owned by a dedicated tool:

```
┌───────────────────────────────────────────────────────────────────┐
│  LAYER 4 — ORCHESTRATION  ·  Kubernetes (K8s)                     │
│  "Run the boxes, heal them on crash, scale them on load"          │
├───────────────────────────────────────────────────────────────────┤
│  LAYER 3 — PACKAGING      ·  Docker                               │
│  "Pack the app + all its dependencies into a portable image"      │
├───────────────────────────────────────────────────────────────────┤
│  LAYER 2 — CONFIGURATION  ·  Ansible                              │
│  "Install and configure software inside the machine"              │
├───────────────────────────────────────────────────────────────────┤
│  LAYER 1 — PROVISIONING   ·  Terraform                            │
│  "Create the raw machine (and network, database) on the cloud"    │
└───────────────────────────────────────────────────────────────────┘
```

**Provisioning** — Creating raw infrastructure: virtual servers, networks (VPC — Virtual Private
Cloud), databases, storage buckets. Before this step nothing exists. Terraform expresses all of
this as code (IaC — Infrastructure as Code) in `.tf` files stored in Git, replacing manual console
clicks with a reproducible blueprint.

**Configuration** — Installing software inside those blank machines. A raw EC2 instance cannot run
Kubernetes. Ansible (agentless — it connects over SSH with no agent pre-installed on the target)
installs the container runtime, runs `kubeadm` to bootstrap the cluster, and configures system
services.

**Packaging** — Bundling your application with every library and dependency into a single, portable
Docker image. The image is *immutable*: build it once, run it identically on any machine with a
container runtime. No more "it worked on my laptop."

**Orchestration** — Running, healing, and scaling packaged images across a cluster of machines.
Kubernetes (the "8" in K8s counts the letters between K and s) watches a declared desired state,
detects failures, and continuously reconciles the cluster to match your specification — 24/7,
without human intervention.

| Layer | Activity | Tool | Restaurant analogy |
|-------|----------|------|--------------------|
| 1 | Provisioning | **Terraform** | Build the restaurant building and gas lines |
| 2 | Configuration | **Ansible** | Equip the kitchen: stove, utensils, shelves |
| 3 | Packaging | **Docker** | Seal each dish in a labelled, airtight container |
| 4 | Orchestration | **Kubernetes** | Head chef: replaces cooks who collapse, calls in more when busy |

**Order is fixed:** you cannot configure a server that does not exist; you cannot orchestrate
images that have not been packaged. Always: Terraform → Ansible → Docker → Kubernetes.

> 🇮🇳 **Hinglish intuition:** T → A → D → K. Ghar banao (TF) → andar saaman rakho (Ansible)
> → dish pack karo (Docker) → manager rakho jo kitchen chalaye (K8s). Ulta nahi chalta.

**Concepts vs tools — a critical distinction**
Idempotency, reconciliation, and declarative style are *concepts* (properties and patterns).
Terraform, Ansible, Docker, and Kubernetes are *tools* (software you install). Tools implement
concepts; do not confuse the two. Never say "I used reconciliation" as if it were a product.

---

## Stateful vs Stateless, Pets vs Cattle

This is the single most important foundational distinction in DevOps. Every architecture and
operational decision flows from it.

**Stateful** means the process holds or owns data that cannot be lost. Destroy the instance and
you lose information. A database is the canonical stateful workload.

**Stateless** means each request is fully self-contained. The process holds no memory of past
requests. Destroy it, spin up a fresh copy — users notice nothing.

| | Stateful | Stateless |
|---|----------|-----------|
| Data inside the instance? | Yes — persistent, valuable | No — ephemeral |
| Replace the instance freely? | No — you lose data | Yes — start fresh |
| Canonical example | Postgres / MySQL database | Web API, worker, CI runner |
| Kubernetes object | `StatefulSet` + PersistentVolume | `Deployment` |
| Operational posture | **Pet** — nurse it | **Cattle** — replace it |

**Pets vs Cattle**
- **Pet** (stateful): Named, irreplaceable. One gets sick — you stay up nursing it back to health.
  A database is a pet. Losing it means losing data.
- **Cattle** (stateless): Numbered, anonymous, disposable. One crashes — replace it in seconds.
  Kubernetes does exactly this: a crashed pod is replaced automatically, not repaired manually.

> 🔮 **Predict pehle (socho, phir aage padho):** Ek API jo sirf Postgres se padhti hai — apne andar kuch store nahi karti — woh stateful hai ya stateless?

**Common misconceptions — read these carefully:**

1. "The database is stateful because it is *important*." Wrong. Stateful means data lives *inside*
   the instance. Importance is irrelevant.
2. "An app that uses a database is stateful." Wrong. If the app stores *nothing* internally —
   pushes all state to an external DB — the app is **stateless**. The database is stateful. The
   app's compute layer is cattle.
3. "All Kubernetes pods are cattle." No. `StatefulSet` pods have stable identities and their own
   persistent volumes. Standard `Deployment` pods are cattle.

> 🇮🇳 **Hinglish intuition:** Pet wala bilaa — naam hai, bimaar hua to ilaaj. Cattle wali gaay
> — bimaar hua to nayi le aao. DB = bilaa. Web server = gaay. Dhoka: "DB use karne wali app
> stateless ho sakti hai" — kyunki usne apna data bahar rakh diya. Golden thread: **state bahar
> nikaalo, compute disposable ban jaata hai.**

---

## The two loops

Everything in DevOps splits into two distinct loops. Confuse them and every tutorial feels chaotic.

```
┌──────────────────────────────────────────────────────────────────────┐
│  OUTER LOOP — SETUP  (runs once, or rarely on infrastructure change) │
│  Think: Pets. Deliberate. Human-triggered.                           │
│                                                                      │
│   terraform apply  ──►  EC2 nodes + VPC + RDS + ECR created on AWS  │
│         │                                                            │
│         ▼                                                            │
│   ansible-playbook ──►  containerd installed, kubeadm forms cluster  │
│         │                                                            │
│         ▼                                                            │
│   ✅  Kubernetes cluster LIVE — this runs for months unchanged        │
└───────────────────────────────┬──────────────────────────────────────┘
                                │  cluster is ready
┌───────────────────────────────▼──────────────────────────────────────┐
│  INNER LOOP — DELIVERY  (runs on every git push, fully automatic)    │
│  Think: Cattle. Event-driven. Machine-executed.                      │
│                                                                      │
│   git push (developer's only manual step)                            │
│      │                                                               │
│      ▼                                                               │
│   GitHub Actions (CI — Continuous Integration)                       │
│      test → docker build → push to ECR → update deployment.yaml     │
│      │                                                               │
│      ▼                    (Git is the handshake)                     │
│   Argo CD (CD — Continuous Delivery)                                 │
│      detects Git change → kubectl apply → rolling update in K8s      │
│      │                                                               │
│      ▼                                                               │
│   🎉  New version LIVE  ·  developer did exactly one thing            │
└──────────────────────────────────────────────────────────────────────┘
```

**Why two loops?** The outer loop builds the platform — it changes infrequently and requires
deliberate work. The inner loop ships software — it runs dozens of times per day and must be
fully automated. Never rebuild your cluster every time you deploy code: that is the outer loop
bleeding into the inner loop.

**The GitOps handshake**
GitHub Actions (the CI side) never touches the Kubernetes cluster directly. Instead it updates a
manifest file (a YAML file describing desired cluster state) in Git. Argo CD, running *inside*
the cluster, watches Git and applies changes. Git is the single source of truth. Rollback = `git
revert` — Argo reconciles the rest.

> 🇮🇳 **Hinglish intuition:** Outer loop = ghar banana (sirf ek baar). Inner loop = roz khana
> banana. Developer ka kaam = `git push`. Baaki sab machine karta. Agar rollback chahiye:
> `git revert` → Argo purana deploy — no panic, no SSH, no 2 a.m. heroics.

---

## How to think like an engineer

### The 6-step design process

The difference between a senior and a junior DevOps engineer is not knowing more commands — it is
knowing how to *design*. AI and search engines can give you commands. Design is the skill that
cannot be commoditised.

1. **Requirements** — What does the system need to do? Who are the users? What are the SLOs
   (Service Level Objectives — reliability targets, e.g. 99.9% uptime)?
2. **Components** — Decompose the system into logical pieces: services, databases, queues, caches.
3. **Tool selection** — Match each component to the right tool. Do not reach for the most
   impressive tool; reach for the correct one.
4. **Flow map** — Draw how a user request moves through the system. Draw how a deployment flows
   from `git push` to a live pod. Both paths must be explicit before you write any code.
5. **Failure thinking** — Ask: "What breaks first? What happens when the database is unreachable?
   What if a pod crashes mid-request?" A senior engineer's first instinct is to find the failure.
6. **Iterate** — Start as simple as possible. Add complexity only when a real requirement demands it.

> 🇮🇳 **Hinglish intuition:** Planner = senior. Button-pusher = junior. Interview mein "kaise
> design karoge" poochenge — commands nahi. Design "baar baar karke" aata, padhke nahi.

### The debugging reflex

When production breaks, the error *type* identifies the problem *layer*. Develop this reflex and
you diagnose faster than any team member who reads error messages linearly.

| Error / Status | Layer with the problem | First action |
|---------------|----------------------|--------------|
| `UNREACHABLE` / connection timeout | **Network** — machine never reached | Check Security Groups, VPC routes |
| `Permission denied` (Ansible/SSH) | **Authentication** — wrong key or user | Verify key path and username |
| Syntax / parse error | **Your code or config** — logic mistake | Read the file and line number |
| `ImagePullBackOff` | **Registry** — wrong image tag or missing auth | Check ECR credentials and tag |
| `OOMKilled` / exit code `137` | **RAM** — pod exceeded memory limit | Raise memory limit or fix leak |
| `CrashLoopBackOff` | **Application** — container starts then crashes | Read application logs |
| `Pending` (K8s pod) | **Scheduling** — no node fits the request | Check CPU/RAM/IP availability |

Key principle: *"The error appears where it is detected, not where it originated."* A `pip install`
failure inside a Docker `RUN` step is usually caused by a missing `COPY` above it — not by pip.
The error layer points you to the right area; the root cause may be one step upstream.

### Monolith vs Microservices

A **monolith** is one large application: all features in one codebase, deployed as one artifact,
scaled as one unit. Simple to start, hard to change independently at scale.

**Microservices** split the application into small, independent services — each with its own
Docker image, Kubernetes Deployment, and release cadence. A payment service and a product catalogue
service deploy independently; one crash does not take the other down.

| | Monolith | Microservices |
|---|----------|---------------|
| Deployment | One artifact | Per-service image + manifest |
| Scaling | Whole app scales together | Scale only the bottleneck service |
| Failure isolation | One crash = total outage | One service down, others live |
| Complexity | Low to start | Higher: networking, tracing, matrix CI |
| K8s fit | One Deployment | One Deployment per service |

Both are valid. Start with a monolith for a new product; move to microservices when team size or
independent scaling requirements justify the added complexity.

---

## Real production example

**Day 1 — Outer loop (runs once):**
```
# Platform engineer
terraform apply      # EC2 nodes, VPC, RDS (Postgres), ECR registry — created on AWS
ansible-playbook     # containerd + kubeadm → Kubernetes cluster formed
# Argo CD installed into the cluster
```
The cluster is live. This work is complete and will not run again for months.

**Day 2+ — Inner loop (triggered by every code change):**
```
git push origin main   # developer's only manual step
```
Automated sequence:
1. GitHub Actions: `pytest` runs — test gate. Fail = pipeline stops. No broken code ships.
2. Docker image built, tagged `app:<git-sha>` (e.g. `app:f9e8d7c`), pushed to ECR.
3. Actions updates `k8s/deployment.yaml` to `image: <ecr>/app:f9e8d7c`, commits, pushes to Git.
4. Argo CD detects the Git change, runs `kubectl apply` — Kubernetes performs a rolling update.
5. Bug found? `git revert && git push` — Argo redeploys the previous SHA. Rollback in < 2 minutes.

---

## Beginner mistakes vs Senior insights

| Beginner | Senior |
|----------|--------|
| Click cloud console to create servers | Write Terraform; everything is Git history |
| Run setup script twice, get errors | Use idempotent tools — re-runs are always safe |
| Rebuild the cluster on every deploy | Outer loop (cluster) vs inner loop (code) are separate |
| Put secrets in code or Dockerfile | Secrets in environment variables or a secrets manager |
| Tag Docker images with `latest` | Pin every image to a commit SHA for traceability |
| SSH into prod and fix manually | Fix in Git; Argo reconciles — no ad-hoc ops |
| "It works on my machine" | Same immutable image built once, runs everywhere |
| Ask "which tool?" before understanding the need | Ask "what does the system need?" then pick tools |

---

## Memory shortcuts

| Analogy | Concept |
|---------|---------|
| Recipe machine — same dish every time | DevOps: speed + safety + repeatability |
| Building → kitchen → sealed dish → head chef | Terraform → Ansible → Docker → K8s |
| Pet vs Cattle | Stateful vs Stateless |
| Outer loop / inner loop | Setup (rare) vs Delivery (continuous) |
| `git push` — developer's only job | Full CI/CD automation |
| Error type = problem layer | Debugging reflex |
| Planner vs button-pusher | Senior vs junior engineering mindset |
| Git = menu (source of truth) | GitOps — Argo deploys what Git says |

**The golden thread** tying every module together:
> *State bahar nikaalo — compute disposable ban jaata hai.*
> (Move state outside the compute layer — the compute becomes replaceable cattle.)

This one idea explains stateless web apps, remote Terraform state in S3, Kubernetes cattle pods,
and why Spot instances only work for stateless workloads.

---

## Summary

DevOps is not a tool — it is the discipline of automating and safeguarding the path from code to
production. It replaced manual, error-prone operations with code-driven, reproducible pipelines.

Every system in this course rests on four ordered layers: Provisioning (Terraform) → Configuration
(Ansible) → Packaging (Docker) → Orchestration (Kubernetes). Each layer exists because the layer
below cannot do the job above it.

The stateful/stateless distinction determines whether you can freely replace infrastructure or must
preserve it. Pets and Cattle are the operational posture that follows from that distinction.

The two-loop model prevents the most common beginner confusion: setup is the outer loop (rare,
deliberate), delivery is the inner loop (continuous, automatic). Git is the handshake.

Thinking like an engineer means designing before building, using the debugging reflex when things
break, and knowing that your value is in design decisions — not in memorising commands.

**Chapters ahead:**
- [02-M1-terraform.md](02-M1-terraform.md) — Provisioning in depth: state, drift, lost-state, modules
- [03-M2-ansible.md](03-M2-ansible.md) — Configuration in depth: playbooks, handlers, idempotency
- [04-M3-docker.md](04-M3-docker.md) — Packaging in depth: layers, caching, multi-stage builds
- [05-M4-kubernetes-core.md](05-M4-kubernetes-core.md) — Orchestration in depth: Deployments, Services, probes
- [09-connected-system.md](09-connected-system.md) — How all four layers work together end-to-end
- [16-reference-appendix.md](16-reference-appendix.md) — Glossary, acronym index, cheat-sheets

---

## Self-check quiz

Answer from memory before revealing answers.

1. Name the three pillars of DevOps.
2. What is the difference between Provisioning and Configuration?
3. A web API reads from a Postgres database but stores nothing internally. Is the API stateful or
   stateless? Is the Postgres instance stateful or stateless?
4. You declare 3 servers in Terraform and run `terraform apply` 5 times. How many servers exist?
5. What is the outer loop? What is the inner loop?
6. You see `UNREACHABLE` when Ansible tries to connect. Which layer has the problem?
7. Why should you never use `latest` as a Docker image tag in production?
8. What is the difference between idempotency and reconciliation?

<details markdown="1">
<summary>Answers</summary>

1. Speed, Safety, Repeatability.
2. Provisioning creates the raw machine (infrastructure). Configuration installs and configures
   software inside that machine.
3. The API is stateless — it holds no data internally; it delegates state to the DB. The Postgres
   instance is stateful — the data lives inside it.
4. 3 servers. Terraform is idempotent: it reconciles to the desired count, it does not add.
5. Outer loop = setup (Terraform + Ansible, runs once to build the cluster). Inner loop = delivery
   (git push → CI/CD → K8s, runs on every code change).
6. Network layer — the machine was never reached. Check Security Groups and routing.
7. `latest` is a mutable label. Any subsequent push can overwrite it silently. You lose
   traceability and the ability to roll back. Use commit SHAs instead.
8. Idempotency is a property of a single operation: safe to re-run, same result. Reconciliation is
   a continuous control loop: compares desired state to actual state and fixes drift — 24/7 without
   human triggering (Kubernetes, Argo CD). Terraform is idempotent but only reconciles when you
   run `terraform apply`.
</details>

---

## Hands-on lab

No cloud account. No software installation required.

**Exercise 1 — Draw the stack from memory**
Take a blank sheet of paper. Draw the four-layer stack (Provisioning → Orchestration). For each
layer write: the tool name, the activity it performs, and the restaurant analogy. Check against
the table in "The four layers" section.

**Exercise 2 — Classify workloads**
Label each as Stateful or Stateless, and Pet or Cattle:
- A Redis cache holding user session tokens
- A Node.js API that reads sessions from Redis and stores nothing internally
- A Postgres database
- A GitHub Actions CI runner that builds Docker images
- An Nginx server serving static HTML files

**Exercise 3 — Trace a deployment**
Write in order every step that occurs between `git push origin main` and a new pod being live.
Use only tool and concept names — no commands needed. Compare with the inner-loop diagram.

**Exercise 4 — Apply the debugging reflex**
For each error below, identify which layer caused it and one probable root cause:
- `OOMKilled` on a Kubernetes pod
- `ImagePullBackOff` when a pod starts
- `Permission denied` when Ansible connects to a server

**✅ Sahi hua to aisa dikhega:**
- *Ex-1:* chaaron layers + tool + analogy bina dekhe likh diye (Provisioning=Terraform, Configuration=Ansible, Packaging=Docker, Orchestration=Kubernetes).
- *Ex-2:* Redis(session) aur Postgres = **Stateful / Pet**; Node API, CI runner, Nginx-static = **Stateless / Cattle**.
- *Ex-3:* `git push → CI test → docker build → ECR push → manifest update → Argo sync → rolling update → pod live` — koi step chhoota nahi.
- *Ex-4:* `OOMKilled` = sizing/RAM layer · `ImagePullBackOff` = image/registry layer (tag ya auth galat) · `Permission denied` = wrong SSH key (na network, na app).

Sab match ho gaya? To M0 pakka — [M1 pe jao](02-M1-terraform.md).

---

## Interview questions

1. **"Explain DevOps to someone who has never heard the term."**
   Cover: what it replaced (manual dev→ops handoff, blame culture), the three pillars, and the
   idea that the entire code-to-production path is automated and version-controlled.

2. **"What is the difference between a stateful and stateless service?"**
   Stateful holds persistent data internally — destroy the instance and lose data. Stateless holds
   nothing — destroy and replace with zero loss. Bonus: correct the "app using a DB is stateful"
   misconception.

3. **"Walk me through the four layers of a production system."**
   Provisioning → Configuration → Packaging → Orchestration, with the tool and rationale for each.

4. **"A pod is stuck in `CrashLoopBackOff`. How do you debug it?"**
   Error type = application layer (the container starts then crashes). Run `kubectl logs <pod>` to
   read the application output. The error type told you where to look.

5. **"What is the difference between CI and CD?"**
   CI (Continuous Integration): build, test, package — produces a deployable artifact. CD
   (Continuous Delivery/Deployment): releases and deploys that artifact to staging or production.

6. **"Why is Infrastructure as Code important?"**
   Reproducibility, auditability (Git history is your change log), no single human knowledge
   dependency, drift detection, and disaster recovery (rebuild infrastructure from code).

7. **"What is GitOps and why does it improve security?"**
   Git is the single source of truth for desired state. The CD tool (Argo CD) pulls from Git —
   the CI system never needs cluster access. A compromised CI pipeline cannot directly damage
   the cluster.

---

## Production challenge

**Scenario:** A team deploys a Node.js monolith on a single EC2 server. Deployments are manual:
SSH in, pull latest code, restart with `pm2`. The server runs out of RAM twice a month and
requires manual rebooting. One engineer once overwrote the production config by accident.
There is no rollback procedure.

**Your design task (no code, diagrams welcome):**

1. Identify which of the four layers is missing or broken.
2. Propose the tool from this chapter that fixes each gap.
3. Is the Node.js app stateful or stateless? (It currently stores sessions in RAM.)
4. What architectural change would make the app stateless and safe to treat as cattle?
5. Sketch (in words) how the two loops would look for this team after adopting the full stack.

There is no single correct answer. The quality of your *reasoning* — not the specific tools you
choose — is what matters. A senior engineer explains *why*, not just *what*.

---

*Navigate: [← 00-INDEX.md](00-INDEX.md) · [02-M1-terraform.md →](02-M1-terraform.md)*

*See also: [09-connected-system.md](09-connected-system.md) — end-to-end connected system walkthrough*
*· [14-interview-bank.md](14-interview-bank.md) — full interview question bank*
*· [16-reference-appendix.md](16-reference-appendix.md) — glossary and acronym index*
