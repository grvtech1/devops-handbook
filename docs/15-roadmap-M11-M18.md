# Principal Track Roadmap — M11–M18

> **Renumbering note:** The source planning file (`DevOps-Principal-Track-M10-M18.md`) labels
> Observability & SRE as "M10." In this handbook it was written as **M8** (`10-M8-observability-sre.md`).
> All module references below use the handbook numbering. If the source file says M10, read M8.

---

## You are here

```
SKILL LADDER — WHERE EACH PHASE PUTS YOU
─────────────────────────────────────────────────────────────────────
  M0  Foundations     │ Linux, networking, Git — the floor
  M1  Terraform       │ Infrastructure-as-code — stop clicking
  M2  Ansible         │ Configuration management — idempotent ops
  M3  Docker          │ Container thinking — cattle, not pets
  M4  Kubernetes core │ Orchestration — self-healing at cluster scale
  M5  Sizing & cost   │ Right-size before it bleeds
  M6  CI/CD           │ Automate the path to production
  M7  GitOps          │ Git is the source of truth
  M8  Observability   │ Evidence-based production — SLI/SLO/error budget
  M9  Advanced K8s    │ Internals, schedulers, controllers, networking depth
─────────────────────────────────────────────────────────────────────
  ↑ After M9: you can BUILD and OPERATE a system
  ↓ M11–M18: you can RUN it at scale, safely, cheaply,
             and let other teams self-serve

  M11 Incident response   │ When it breaks at 2 am — structured recovery
  M12 Advanced K8s/Plat   │ One cluster → fifty teams, safely
  M13 Progressive delivery│ Ship to thousands before millions
  M14 Distributed systems │ Why scale breaks consistency — and how to recover
  M15 Data at scale       │ Replication, sharding, real DR (not just snapshots)
  M16 Security & supply   │ End-to-end trust — image, secret, policy, pipeline
  M17 Cost / FinOps       │ Explain the bill, forecast, eliminate waste
  M18 Platform engineering│ IDP, golden paths, self-service — the capstone
─────────────────────────────────────────────────────────────────────
  Time horizon:  2.5 yr engineer → 5 yr+ / Senior → Staff / Principal
```

**M0–M9** closes the gap between "I don't know what a container is" and
"I can build and ship a production service." That's the bootcamp win.

**M11–M18** closes a different gap: the one between "I shipped this service"
and "I own this system at scale — its reliability, security, cost, and the
experience of every team that depends on it." This is the delta interviewers
are actually testing when they ask "tell me about a major incident you led" or
"how does your team decide when to freeze deploys."

You do not need to rush this track. Each module is 2–4 weeks of serious
self-study plus hands-on lab time. Read real postmortems, rebuild real things.

---

## The map at a glance

| Module | Core production question | Builds on | Key new territory |
|--------|--------------------------|-----------|-------------------|
| **M11** — Incident Response | "It broke — now what?" | M8 | Severity, runbooks, blameless postmortem, MTTR |
| **M12** — Advanced K8s / Platform | "1 cluster → 50 teams?" | M4, M7, M9 | Service mesh, CRDs/operators, OPA Gatekeeper |
| **M13** — Progressive Delivery | "Ship to 1,000 before 1M?" | M7, M8 | Canary, blue-green, Argo Rollouts, feature flags |
| **M14** — Distributed Systems | "Why does scale break consistency?" | M0, M4 | CAP theorem, Kafka, consensus, distributed locks |
| **M15** — Data at Scale | "Snapshot ≠ DR strategy?" | M9, M14 | Replication, sharding, multi-region, real DR |
| **M16** — Security & Supply Chain | "Is this image trustworthy end-to-end?" | M3, M6, M8 | SBOM, cosign, Vault, SAST/DAST, policy-as-code |
| **M17** — Cost & FinOps | "Bill 10x'd — why?" | M5 | Showback/chargeback, spot/reserved mix, forecasting |
| **M18** — Platform Engineering | "1,000 engineers, 1 platform team?" | all | IDP, golden paths, self-service, Backstage |

---

## M11 — Incident Response & On-Call

**Core production question:** "The alert fired at 2 am — what do you do in the
next 15 minutes, and how do you make sure it never happens the same way again?"

**Builds on:** M8 (Observability & SRE) — the alert you wrote in M8's lab is
the trigger for M11. Error budget exhaustion is the input; incident lifecycle
is the response.

**What it introduces:** Severity levels (SEV1–SEV4), incident commander role,
runbooks, war-room communication patterns, blameless postmortem, MTTR (Mean
Time to Recovery), error-budget-driven paging policy.

**Why it matters — the senior-vs-mid gap it closes:**
A mid-level engineer fixes the bug. A senior engineer leads the recovery,
communicates status to stakeholders every 15 minutes, writes a postmortem that
prevents recurrence, and tracks MTTR as a first-class metric. The first skill
is technical; the second is organizational. Most engineers don't learn it until
they're already in the hot seat.

**Key concepts to learn:**
- Severity matrix: SEV1 = production down for all users; SEV4 = cosmetic issue.
  Every org has its own thresholds — know yours cold before you're on-call.
- Incident commander vs. tech lead split: one person talks (status updates,
  stakeholder communication, coordination); one person investigates. Never the
  same person.
- Runbooks: pre-written step-by-step playbooks for known failure modes.
  Good runbook = any on-call engineer, at any experience level, can execute it
  at 3 am. Bad runbook = wall of prose that requires the author to explain it.
- Blameless postmortem: the 5-Whys analysis, contributing factors, and action
  items go into a shared doc — no names in the "what went wrong" section.
  Blame creates incentives to hide problems; blamelessness creates incentives
  to surface them.
- Error-budget-driven paging: if the error budget (from M8) is nearly exhausted,
  the threshold for paging drops — you treat even small SLO burns as urgent
  because you have little margin left.
- MTTR as a KPI: teams measure median time from alert-fire to user-impact-resolved.
  A week-on-week MTTR trend tells you whether your runbooks and on-call rotation
  are improving or degrading.
- Post-incident review cadence: weekly or bi-weekly review of all postmortems
  ensures action items don't rot in a doc nobody reads.

**War story hook:** A startup's entire payment service goes dark on Black Friday.
The on-call engineer fixes the database connection pool in 40 minutes — but
spent 25 of those minutes in Slack pinging three different people asking
"who owns this?" because no severity matrix, no incident commander, no runbook
existed. The fix took 15 minutes. The chaos took 25.

**Self-study starting point:** Read Google's SRE Book Chapter 14 (Emergency
Response) and Chapter 15 (Postmortem Culture) — both free online. Then write
a runbook for one failure mode in your url-shortener capstone (`12-capstone-url-shortener.md`):
"DB connection fails — how to diagnose and recover." Make it executable by
someone who has never seen your code.

---

## M12 — Advanced Kubernetes / Platform

**Core production question:** "You started with one cluster and one team. Now
you have fifty teams. How do you keep them from stepping on each other?"

**Builds on:** M4 (Kubernetes core), M7 (GitOps), M9 (Advanced K8s internals).
M9's deep-dive into controllers, schedulers, and networking is the prerequisite
for understanding why CRDs and operators exist.

**What it introduces:** Service mesh (Istio/Linkerd), Custom Resource Definitions
(CRDs), Kubernetes operators, OPA Gatekeeper (policy-as-code for the cluster),
multi-tenancy patterns (namespaces, RBAC, resource quotas, network policies),
cluster federation.

**Why it matters:** A single-team cluster is easy. The complexity spike at
"multiple teams on one cluster" is where most mid-level engineers hit a wall —
they know K8s but don't know how to make it safe for teams that don't know K8s.

**Key concepts to learn:**
- CRDs extend the Kubernetes API with custom types. `ServiceMonitor` (from M8's
  Prometheus lab) is a CRD. An operator is a controller that watches a CRD and
  acts — the reconciliation loop you understand from M4, but for your own domain.
- Service mesh (Istio, Linkerd): mTLS between pods, traffic shaping, retries,
  circuit breaking — all without changing application code. Understand the
  sidecar injection model and when the overhead is worth it.
- OPA Gatekeeper: policy-as-code for the admission controller. Enforce "no
  containers running as root," "all pods must have resource limits," "images
  must come from approved registries" — cluster-wide, automatically, at deploy time.
- Multi-tenancy: namespaces + RBAC + ResourceQuota + LimitRange + NetworkPolicy
  = a team gets their own "lane" that cannot starve other teams' CPU or connect
  to their pods.
- Cluster API / GitOps for cluster lifecycle: manage clusters themselves
  declaratively, the same way you manage workloads (GitOps from M7, but applied
  to the clusters, not just what runs inside them).
- Operator pattern: encode operational knowledge (backup, failover, upgrade) into
  code. Postgres operator, Redis operator — they know the domain, you don't
  write the YAML for every operation.

🇮🇳 **Hinglish intuition:** M4 mein ek school ka classroom tha. M12 mein
poori university hai — har department (team) ka apna room, apna budget, apna
CCTV — but ek hi building (cluster) mein. Campus security (OPA Gatekeeper)
decides kya allowed hai, kya nahi.

**War story hook:** A shared staging cluster at a fintech had no ResourceQuotas.
One team's memory leak consumed all cluster memory. Three other teams' staging
environments silently stopped scheduling new pods for 6 hours. No alerts — the
pods were just "Pending." Nobody noticed until a demo failed.

**Self-study starting point:** Build a CRD + controller from scratch using
`kubebuilder`. Even a trivial "CronTab" example teaches you the entire operator
pattern. Then deploy OPA Gatekeeper to your kind cluster and write one policy:
reject any Pod that sets `runAsRoot: true`.

---

## M13 — Progressive Delivery

**Core production question:** "How do you ship a change to 1,000 users to
validate it before you expose it to 1,000,000 — and automatically roll it back
if the metrics say it's bad?"

**Builds on:** M7 (GitOps) for the deployment pipeline, M8 (Observability) for
the metrics that drive automatic promotion or rollback decisions.

**What it introduces:** Canary releases, blue-green deployments, Argo Rollouts
(the GitOps-native progressive delivery controller), feature flags (LaunchDarkly,
Unleash, OpenFeature), analysis templates (automated SLO-based gates).

**Why it matters:** "Deploy more safely" sounds obvious, but the implementation
gap is wide. Most teams doing blue-green are doing it manually — toggle the
load balancer, cross your fingers. Argo Rollouts adds automated metric analysis
(reading from the Prometheus setup of M8) and auto-aborts if the canary's
error rate exceeds the baseline. That's the difference between hope and evidence.

**Key concepts to learn:**
- Canary vs. blue-green: canary shifts a percentage of live traffic to the new
  version (e.g., 5% → 25% → 50% → 100%); blue-green keeps two full
  environments and cuts over at once. Different risk/cost tradeoffs.
- Argo Rollouts: a drop-in replacement for Deployment that understands canary
  steps, pause-and-wait, and analysis templates that query Prometheus before
  promoting to the next step.
- Analysis templates: a CRD (yes, from M12) that codifies "query Prometheus,
  compare canary vs. stable error rate, succeed/fail based on threshold." The
  rollout is automated, auditable, and consistent — not a human judgment call
  at midnight.
- Feature flags decouple deploy from release: the code ships to 100% of
  infrastructure but the feature is visible to 1% of users. A flag is flipped
  in a UI, no redeploy needed. Enables dark launches, A/B testing, instant kill
  switches.
- Traffic splitting at the service mesh layer (M12 Istio/Linkerd) vs. at the
  ingress layer vs. at the application layer — each has different granularity
  and overhead.
- Rollback strategy: automated (Argo Rollouts aborts and rolls back on metric
  failure) vs. manual (a human hits "abort"). Know when each is appropriate.

**War story hook:** A large e-commerce company's checkout team shipped a payment
refactor straight to 100% on a Friday afternoon. Conversion rate dropped 18% in
20 minutes. The rollback took 14 minutes because it was a full redeployment.
With a canary at 5% and an automated error-rate gate, they would have caught it
in 2 minutes and auto-rolled back with zero manual intervention.

**Self-study starting point:** Replace your capstone's `Deployment` with an Argo
Rollouts `Rollout` resource. Define a canary strategy with three steps
(10% → 40% → 100%) and an analysis template that queries the p99 latency you
already have from M8's Prometheus setup. Then intentionally ship a bad version
and watch it auto-abort.

---

## M14 — Distributed Systems

**Core production question:** "Why does adding more machines sometimes make
consistency *worse* — and what design patterns handle that at scale?"

**Builds on:** M0 (networking fundamentals), M4 (pods as distributed units),
M9 (K8s internals — you've already seen the reconciliation loop as a distributed
consensus mechanism without calling it that).

**What it introduces:** CAP theorem (Consistency, Availability, Partition
tolerance — pick two), consensus algorithms (Raft, the mechanism behind etcd
in every K8s cluster), message queues and event streaming (Kafka, SQS),
idempotency at scale, distributed locks, saga pattern for distributed transactions.

**Why it matters:** You can build and ship a monolith without understanding
distributed systems. You cannot build a reliable microservice mesh without it.
This is theory-with-teeth: every design decision has a failure mode you will
eventually see in production.

**Key concepts to learn:**
- CAP theorem: in the presence of a network partition, you choose between
  Consistency (every read sees the latest write) or Availability (every request
  gets a response, possibly stale). Most real systems choose AP and handle
  eventual consistency explicitly.
- Raft consensus: the algorithm etcd uses (the K8s brain). Understand leader
  election and log replication at a conceptual level — it explains why etcd
  quorum matters (from M9) and why losing 2 of 3 control-plane nodes is fatal.
- Kafka: a distributed, ordered, durable log. Producers append; consumers read
  at their own pace. Partitions enable parallelism; consumer groups enable
  fan-out. Key use cases: event sourcing, decoupling services, audit logs,
  real-time pipelines.
- Idempotency: an operation you can safely retry without double-effects. Every
  message queue guarantees at-least-once delivery; your consumer must be
  idempotent (deduplicate by message ID, or use natural idempotent operations
  like upsert-by-key).
- Distributed locks (Redis SETNX, etcd leases): used when exactly-once
  execution across multiple instances matters (cron job, payment processing).
  Understand the failure mode: lock holder dies, lock expires, two holders
  proceed simultaneously — this is why distributed locks are not a silver bullet.
- Saga pattern: for distributed transactions (order service, payment service,
  inventory service all need to agree). Choreography (events) vs. orchestration
  (central saga orchestrator). Compare to 2-phase commit and understand why
  sagas are preferred at scale.

🇮🇳 **Hinglish intuition:** CAP theorem ek thali mein teen cheezein hain —
consistency, availability, aur partition tolerance. Thali chhoti hai: teeno
ek saath nahi aate. Network partition toh aayega hi (that's reality) — toh
bata, consistency chahiye ya availability? Yahi decide karna hai every time
you design a data API.

**War story hook:** A ride-sharing company's surge pricing service used a
distributed lock (Redis) to calculate and update pricing per zone. Under a
Redis failover, the lock was not transferred — two instances calculated surge
simultaneously for the same zone and wrote conflicting prices. One user was
charged 3x, another 1x, for the same ride at the same time.

**Self-study starting point:** Read Martin Kleppmann's "Designing Data-Intensive
Applications" Part II (chapters 5–9). Then add a Kafka consumer to your
capstone: every URL shortening event is published to a Kafka topic; a separate
consumer reads it and writes to an analytics table. Handle at-least-once
delivery by deduplicating on `url_code`.

---

## M15 — Data at Scale

**Core production question:** "Your database is now the bottleneck, your
backup is 24 hours old, and your disaster recovery (DR) plan says 'restore
from snapshot' — how long does that take at 10 TB, and is that acceptable?"

**Builds on:** M9 (stateful workloads in K8s, PVCs, storage classes), M14
(replication is a distributed systems problem — the theory lives there).

**What it introduces:** Read replicas, replication lag, database sharding
(horizontal partitioning), connection pooling (PgBouncer), Redis for
caching + as a write buffer, multi-region active-active vs. active-passive,
backup strategies (logical vs. physical, point-in-time recovery), RTO and RPO
as design constraints.

**Why it matters:** Stateless services scale horizontally by adding pods (M4).
Stateful systems — databases — do not. The senior engineer understands every
layer of the data tier: caching, connection pooling, replication, and real DR.
The mid-level engineer knows "add a read replica." The principal engineer knows
when a read replica is not enough, and what the alternatives cost.

**Key concepts to learn:**
- Read replicas: async replication from primary to one or more replicas.
  Replicas serve SELECTs; the primary handles writes. Replication lag is the
  gap — a replica may return stale data if the primary just wrote it.
- Sharding: split the data horizontally across multiple database instances
  (e.g., users A–M on shard 1, N–Z on shard 2). Enables write scale but
  adds routing complexity and makes cross-shard queries expensive or impossible.
- Connection pooling (PgBouncer): Postgres has a hard limit on open connections
  (~100–500 depending on instance size). PgBouncer sits in front and multiplexes
  thousands of app connections down to a managed pool. Without it, "too many
  connections" is a common production failure mode as you scale pods.
- Redis: understand it as a cache (read-through, write-through, TTL), as a
  rate-limiter (INCR + EXPIRE), and as a Pub/Sub bus. Also understand what
  happens when Redis restarts and the cache is cold — cache stampede.
- RTO vs. RPO: Recovery Time Objective (how long can you be down?) and Recovery
  Point Objective (how much data can you afford to lose?). A daily snapshot gives
  you RPO = 24 hours — that means you could lose a full day of data. Is that
  acceptable for your product? It almost never is.
- Point-in-time recovery (PITR): continuous WAL (Write-Ahead Log) shipping to
  object storage means you can restore to any second in the past, not just your
  last snapshot. The difference between "we lost 24 hours of orders" and "we
  lost 4 minutes."
- Multi-region: active-passive (primary in us-east-1, replica in eu-west-1,
  failover is manual or semi-automated) vs. active-active (both regions serve
  writes, conflict resolution needed). The latter is dramatically harder.

**War story hook:** A SaaS company's DR plan said "restore from nightly snapshot."
Nobody had tested it. During a real incident, the restore of a 6 TB database
took 11 hours — their RTO was "2 hours." They had been running with a false
sense of safety for two years.

**Self-study starting point:** Set up Postgres streaming replication locally
(primary + one replica). Simulate replication lag by pausing the replica and
writing to the primary. Then measure how stale the replica is. Then set up
PITR using WAL-G to S3-compatible storage (MinIO locally). Prove you can
restore to a specific minute.

---

## M16 — Security & Supply Chain

**Core production question:** "An image arrives in your registry — how do you
know it contains no critical CVEs, was built from the source you think it was,
hasn't been tampered with in transit, and the secrets it uses at runtime were
rotated last week?"

**Builds on:** M3 (Docker — images and registries), M6 (CI/CD — the pipeline
is where most supply chain attacks happen), M8 (policy enforcement at runtime).

**What it introduces:** SAST (Static Application Security Testing), DAST
(Dynamic Application Security Testing), SBOM (Software Bill of Materials),
image signing with cosign (Sigstore), Vault for secrets management, admission
controllers for image policy, least-privilege RBAC, policy-as-code (OPA/Kyverno).

**Why it matters:** The SolarWinds attack, the Log4Shell incident, the xz-utils
backdoor — all supply chain compromises. Security is no longer a checkbox at
the end of the sprint; it is a thread that runs through every stage of your
delivery pipeline. A principal engineer designs that thread; a mid-level engineer
is often unaware it needs to exist.

**Key concepts to learn:**
- SAST: static analysis of source code for known vulnerability patterns (SQL
  injection, hardcoded secrets, insecure deserialization) — runs in CI, before
  the image is built. Tools: Semgrep, Bandit (Python), SonarQube.
- DAST: dynamic testing of a running application for runtime vulnerabilities
  (OWASP Top 10 class issues). Needs a running environment — typically a
  staging deployment. Tools: OWASP ZAP, Burp Suite.
- SBOM (Software Bill of Materials): a machine-readable inventory of every
  package inside your container image. When Log4Shell dropped, teams with SBOMs
  knew in minutes which images were affected; teams without SBOMs spent days
  auditing manually.
- cosign + Sigstore: cryptographically sign container images at build time
  (CI pipeline); verify the signature at deploy time (admission controller).
  If the signature is absent or invalid, the pod never starts. Closes the
  "who actually built this image?" question end-to-end.
- Vault (HashiCorp): dynamic secrets — Vault issues short-lived database
  credentials to your app at startup, rotating them automatically. No long-lived
  secrets in environment variables or K8s Secrets (which are base64, not
  encrypted, by default).
- Least-privilege: every pod's ServiceAccount should have the minimum RBAC
  needed — nothing more. "Give it cluster-admin and see if it works" is a
  production anti-pattern that is also a blast radius multiplier in a breach.
- Policy-as-code (OPA Gatekeeper, Kyverno): enforce security policies at
  the K8s admission layer — same concept as M12 but now specifically for
  security posture (no root containers, no privileged pods, images must be
  signed, no hostNetwork unless explicitly approved).

**War story hook:** A startup's CI pipeline built images using `FROM python:latest`
pinned to "latest." A supply chain compromise of the upstream image introduced
a crypto-miner into the base layer. Their images inherited it silently for
three weeks. An SBOM + cosign signature verification at deploy time would have
caught the unexpected change in the base layer on day one.

**Self-study starting point:** Add four security gates to your capstone's CI
pipeline (`07-M6-cicd.md`): (1) Semgrep SAST scan, (2) `trivy image` CVE scan,
(3) Syft to generate an SBOM and attach it as a pipeline artifact, (4) cosign
to sign the built image. All four should fail the build on high-severity
findings. This is the minimum viable secure supply chain.

---

## M17 — Cost & FinOps

**Core production question:** "Your AWS bill just doubled quarter-on-quarter.
Your CTO asks why. You have 20 minutes. What do you say — and how do you build
a system where this question never catches anyone off guard again?"

**Builds on:** M5 (Sizing & Cost — the per-pod and per-node cost fundamentals).
M17 scales that thinking to the org: showback, chargeback, forecasting, and
commitment planning.

**What it introduces:** FinOps (Financial Operations — the practice of
cloud cost accountability), showback (report cost by team/service, no billing),
chargeback (teams are actually billed internally), spot/preemptible instances,
reserved instances and savings plans, capacity forecasting, waste identification
(idle resources, over-provisioned instances, orphaned storage).

**Why it matters:** Cloud cost is engineering debt made visible. A principal
engineer can read a cost report, attribute it to specific services, and design
the architecture changes that address it. This skill is rare and highly valued —
most engineers treat the cloud bill as somebody else's problem.

**Key concepts to learn:**
- FinOps (Financial Operations): a cultural and technical practice where
  engineering teams own their cloud spend the same way they own uptime. The
  three phases: Inform (visibility) → Optimize (action) → Operate (ongoing).
- Showback vs. chargeback: showback = "here is what your team spent, FYI."
  Chargeback = "here is what your team spent, and it comes out of your
  team's budget." Chargeback changes behavior; showback informs it.
- Tagging strategy: cost attribution only works if every resource has consistent
  tags (`team`, `service`, `environment`). Enforce this via policy-as-code
  (OPA/Sentinel in Terraform) so new resources cannot exist without tags.
- Spot / preemptible instances: up to 70-90% cheaper than on-demand, but can
  be reclaimed with 2 minutes warning (AWS Spot) or 30 seconds (GCP Preemptible).
  Stateless workloads (web pods, batch jobs) are good candidates; stateful
  workloads (primary databases) are not.
- Reserved instances and savings plans: commit to 1 or 3 years of usage in
  exchange for 40-60% discount vs. on-demand. The risk is commitment on
  forecasted capacity. Savings plans are more flexible than RI (apply across
  instance families).
- Capacity forecasting: use your metrics (M8) and growth trajectory to project
  resource needs 3–6 months out. Combine with commitment planning to buy the
  right-sized reservations at the right time.
- Waste elimination: top sources — idle EC2/GCP instances outside business hours,
  over-provisioned RDS (CPU at 5%, memory at 10%), orphaned EBS volumes, NAT
  gateway egress costs from pulling container images inside a VPC.

🇮🇳 **Hinglish intuition:** FinOps matlab apni team ka cloud kharch khud
samajhna — jaise ghar ka bijli bill aata hai toh pata hota hai AC zyada chali
thi. Jab tak koi team ko unka individual "bijli bill" nahi dikhta, woh
AC band nahi karte.

**War story hook:** A growth-stage startup saw its AWS bill go from $80K/month
to $240K/month in two quarters. Investigation found: 40% was data transfer
(egress) from a misconfigured service pulling data cross-region on every
request; 25% was idle staging environments running 24/7 that nobody had
turned off in 8 months. Neither was visible until an engineer built a
per-service cost dashboard in Grafana using AWS Cost Explorer API data.

**Self-study starting point:** Use AWS Cost Explorer (or GCP Billing) to tag
your capstone project resources with `project=urlshortener` and `env=prod`.
Then build a Grafana panel that shows daily cost for that tag group. Next,
identify one waste item (the idle resources in your dev environment) and
automate its shutdown on a schedule. Measure the savings.

---

## M18 — Platform Engineering

**Core production question:** "You have 1,000 engineers and one platform team
of 8. How do you give every team a safe, fast, self-service path to production
without 8 people becoming a bottleneck for everything?"

**Builds on:** Every module — M18 is the architectural capstone that
synthesizes the entire track. You cannot design a good IDP without
understanding what pain the platform needs to abstract: CI/CD (M6), GitOps
(M7), observability (M8), progressive delivery (M13), security (M16), cost
(M17).

**What it introduces:** Internal Developer Platform (IDP) — the product a
platform team builds for internal customers; golden paths (opinionated, supported
defaults that make the right thing easy); Backstage (CNCF open-source IDP
framework by Spotify); service catalog; self-service scaffolding; Platform
Engineering as a product discipline (treating internal developers as customers,
measuring developer experience).

**Why it matters:** Platform engineering is not a new set of technologies —
it is a new organizing principle. The principal engineer who understands this
can architect systems that multiply the productivity of an entire engineering
org, not just their own team. This is the "staff engineer" thinking mode:
your leverage is through systems and platforms, not individual contributions.

**Key concepts to learn:**
- IDP (Internal Developer Platform): the collection of tools, workflows, and
  guardrails that let a developer go from "I have an idea" to "it's in
  production" without needing a platform engineer to hold their hand at each step.
- Golden paths: not enforced standards but curated, supported defaults.
  "Use this service template, this CI workflow, this monitoring setup, and
  you get all the good things automatically." Teams can deviate, but they
  lose the platform support and pay the maintenance cost themselves.
- Backstage: an open-source framework (CNCF project, originated at Spotify) for
  building a developer portal. Provides a service catalog (what exists, who owns
  it, what it depends on), software templates (scaffold a new service with one
  click), and plugin architecture for everything else (cost, on-call, security
  score, deployment status).
- Self-service scaffolding: a developer fills out a form ("service name, language,
  team, SLO target") and the platform creates the GitHub repo with CI workflow,
  Dockerfile, Helm chart, ServiceMonitor, and Backstage catalog entry — all
  wired and ready. This is the concrete deliverable most platform teams aim for.
- Developer experience (DevEx) as a metric: measure onboarding time (how long
  to first deploy for a new engineer?), build time, deploy time, time-to-debug
  (MTTD — mean time to detect from a developer's perspective). Platform teams
  set targets for these and track them the same way SRE teams track SLOs.
- Platform as a product: dogfooding (platform team uses their own platform),
  user research with developer teams, a platform roadmap with prioritized features.
  The failure mode: a platform team that builds what they think is cool
  instead of what developers actually need.

**War story hook:** A 600-person engineering org had 12 different ways to
bootstrap a new service. New engineers spent 2–4 weeks in setup before their
first production deploy. A platform team spent one quarter building a
Backstage-based service catalog with one golden-path template. Onboarding time
dropped to 2 days. Senior engineer time spent on "help me set up my repo"
dropped 80%.

**Self-study starting point:** Stand up Backstage locally (`npx @backstage/create-app`).
Register your url-shortener capstone in the catalog. Then write a software
template that scaffolds a new FastAPI service (with Dockerfile, GitHub Actions
CI, `values.yaml` for Helm, and a `catalog-info.yaml`) from a form. That is
the minimum viable IDP, and it teaches you every concept in this module at
once.

---

## Suggested study order

```
M8 Observability (done) ──► M11 Incident Response
                                    │
                         ┌──────────┴──────────┐
                         ▼                     ▼
                M12 Advanced K8s        M13 Progressive Delivery
                         │                     │
                         └──────────┬──────────┘
                                    ▼
                         M14 Distributed Systems
                                    │
                         ┌──────────┴──────────┐
                         ▼                     ▼
                M15 Data at Scale      M16 Security & Supply Chain
                                             (parallel with M17)
                         │              M17 Cost & FinOps
                         └──────────────────── │
                                               ▼
                                      M18 Platform Engineering
                                        (capstone of the track)
```

| Study phase | Modules | Notes |
|-------------|---------|-------|
| Right after M8 | M11 | The alert you built in M8's lab fires → M11 is what happens next. Study immediately. |
| After M11 | M12, M13 | Can be studied in parallel — they share GitOps and observability as inputs but don't depend on each other. |
| After M12/M13 | M14 | Theory-heavy. Give it proper time. |
| After M14 | M15, M16 | M15 applies M14 theory to the data tier. M16 and M17 can run in parallel — neither blocks the other. |
| Last | M18 | The capstone. Requires all prior modules for meaningful design. Don't rush here. |

---

## How to keep learning without a course

No course teaches production judgment — it accumulates through exposure.
These practices compound faster than any curriculum:

**Read real postmortems.** The AWS Status History page, the Google SRE
postmortems book (free online), Cloudflare's blog, and the public postmortem
repository at `github.com/danluu/post-mortems` contain hundreds of real
incidents. One postmortem read per week — with the question "what would I
have done differently?" — builds incident instinct faster than any exercise.

**Run game days.** A game day is a scheduled, controlled failure injection
into a staging or production-like environment. Kill the primary database.
Block the image registry. Exhaust the connection pool. Measure MTTR. Repeat.
The goal is to discover gaps in your runbooks and on-call response before
a real incident does.

**Shadow on-call before you are on-call.** Sit in on every alert and
incident handled by whoever is on-call now. Watch what they look at, in what
order, and why. Ask them to narrate. This compresses months of first-hand
experience into weeks of observation.

**Rebuild the capstone with one advanced module added at a time.** Start from
the url-shortener (`12-capstone-url-shortener.md`). After M11, write its
runbook. After M13, convert its deployment to a canary rollout. After M16,
sign its image in CI. After M17, add a cost dashboard. By M18, every module
is woven into one real system you understand end-to-end — that is the
portfolio piece and the interview story.

**Contribute to a real incident.** Volunteer for on-call rotation. Write the
postmortem for an incident you witnessed but didn't own. Propose one action
item and follow it to completion. The institutional knowledge that sticks is
the knowledge you sweated for.

---

## Summary

M0–M9 taught you to build and ship. M11–M18 teaches you to **run at scale
— reliably, securely, cheaply, and in a way that multiplies the effectiveness
of every team around you.**

The eight modules form a stack: M11 handles failure after M8 detects it.
M12 and M13 scale the platform and the delivery mechanism. M14 and M15
bring the distributed systems and data-tier depth that separates senior from
principal. M16 and M17 add the organizational disciplines of security and cost
that principals own. M18 synthesizes all of it into the most leveraged skill
in this track: building the platform that lets other engineers succeed without
you in the loop for every decision.

Study these in order, build on the capstones you already have, and read
one real postmortem per week. That combination — structured learning plus real
evidence plus hands-on systems — is the pattern that produces principal engineers.

---

*Chapter index: `00-INDEX.md` · Previous: `14-interview-bank.md` · Next: `16-reference-appendix.md`*
