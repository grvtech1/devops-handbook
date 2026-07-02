# M5 — Sizing, Capacity & Cost

> **Core question:** *How big should the machines be, and how do I not set money on fire?*

> **⏱️ Time:** ~50 min padho · **🎚️ Level:** Intermediate · **📋 Pehle chahiye:** [M4](05-M4-kubernetes-core.md)
>
> **Is module ke baad tum kar paoge:**
> - Instance family chart dekhkar 30 seconds mein sahi family choose karna (M, C, R, T) — aur galat choice ka reason explain karna
> - Pod ke liye CPU aur memory requests/limits set karna, aur OOMKilled vs throttle ka difference batana
> - On-Demand, Reserved, aur Spot ke beech cost tradeoff explain karna — aur Spot kab safe hai, kab nahi

**Prerequisites:** M4 (Kubernetes core, requests/limits basics) · [05-M4-kubernetes-core.md](05-M4-kubernetes-core.md)
**Cross-links:** [09-connected-system.md](09-connected-system.md) Golden Thread 2 — state bahar, compute disposable → Spot-safe.

---

> ### ↩️ Recall gate — shuru karne se pehle
> Pichhle modules se 3 sawaal. **Pehle memory se jawab do, phir kholo.** (Yeh retrieve karna hi lifetime yaad rakhta hai — dobara padhna nahi.)
>
> 1. *(M4)* K8s pod ka status `Running` hai par `READY 0/1` dikh raha hai — exactly kya ho raha hai aur pod ko traffic kab milega?
> 2. *(M3)* Dockerfile mein layer-order ka ek chhota-sa fark build time kyun kaata hai — niyam kya hai?
> 3. *(M1)* Terraform mein "drift" aur "lost state" mein kya fark hai? Dono ka worst-case result kya hota hai?
>
> <details markdown="1"><summary>Jawab</summary>
>
> 1. Container process alive hai (Running), par readiness probe fail ho rahi hai — pod Service ke endpoints mein tab tak nahi aayega jab tak probe pass na ho. &nbsp; 2. Layers top-down invalidate hoti hain — jo layer change hui, uske neeche sab rebuild. Rule: slow-changing (pip install) upar, fast-changing (app code) neeche. &nbsp; 3. Drift = kisi ne Terraform ke bahar infra badla (state aur reality alag). Lost state = state-file kho gayi; Terraform sochta "kuch nahi hai" aur sab rebuild karta — zyada dangerous.
> </details>

## The 60-Second Version

1. **Classify** the workload's hunger: CPU (C-family), RAM (R-family), balanced (M-family), IO (I-family), GPU (P/G), burstable-dev (T-family).
2. **Decode** the name: `m6g.xlarge` → general-purpose / 6th gen / Graviton ARM (~20% cheaper) / 4 vCPU 16 GB.
3. **Set requests AND limits** on every pod. Exceed CPU limit → throttle (slow, alive). Exceed RAM limit → OOMKilled, exit `137` (dead, restarts).
4. **Right-size from data**, not from guesses: estimate → deploy → measure (`kubectl top`) → adjust.
5. **Cost levers:** On-Demand (default), Reserved/Savings Plans (commit = discount), Spot (stateless only — can be reclaimed).
6. **Autoscale** with three tools: HPA (more pods), Cluster Autoscaler (more nodes), VPA (resize a pod's requests).
7. **Never** run a production primary database in a Kubernetes pod. Use RDS/Aurora.

---

## Why This Exists / What It Replaced

Before cloud elasticity, teams over-provisioned by 3–5× to survive peak traffic, then paid for idle capacity year-round. Cloud promised "pay for what you use" — but without a sizing discipline, teams simply moved the same waste into the cloud bill.

The two failure modes:

| Failure | Symptom | Bill impact |
|---------|---------|-------------|
| **Over-provisioning** | Giant idle servers, CPU at 5% | $$$$ wasted monthly |
| **Under-provisioning** | OOMKilled pods, throttled APIs, on-call alerts at 3 AM | Revenue lost, SLA breached |

Right-sizing closes both gaps: pick the correct instance *family* first, then tune the *size* from real measurements.

🇮🇳 **Hinglish intuition:** Pehle zamane mein dal bana ke rakhte the 10 log ke liye, 4 aaye — baki feki. Cloud mein bhi yehi hota tha. Right-sizing = naap ke kapde silao; zyada kapda bhi paisa, chota kapda bhi sharam.

---

## Classify the Workload: Instance Families & Naming

### The 30-Second Decision Tree

```
Q1. App kis cheez ki bhookhi hai?
    ├─ Balanced (web/API/microservice)   → M family  (m6g, m7g)
    ├─ CPU-heavy (encode/ML/batch)       → C family  (c6g, c7g)
    ├─ RAM-heavy (DB/cache/analytics)    → R family  (r6g, r7g)
    ├─ Extreme RAM (SAP HANA, huge cache)→ X family  (x2gd)
    ├─ Disk-IO heavy (NVMe NoSQL/search) → I family  (i3, i4i)
    └─ GPU (ML training / inference)     → P/G family (p4, g5)

Q2. Traffic steady hai ya spiky/low?
    ├─ Dev / demo / spiky low-traffic   → T family  (t3, t4g)  ← burstable
    └─ Steady production                → M/C/R     ← fixed performance

Q3. State hai ya nahi?
    ├─ Stateful (DB / cache data)       → Managed service (RDS, ElastiCache)
    └─ Stateless                        → K8s pod, scale freely

Q4. Scaling strategy?
    ├─ More pods (same nodes)           → HPA
    ├─ More nodes                       → Cluster Autoscaler
    └─ Resize pod requests              → VPA
```

### Instance Family Reference

| Family | CPU:RAM ratio | Typical use | Don't use for |
|--------|--------------|-------------|---------------|
| **T** (t3/t4g) | 1:2–4, burstable | Dev, demo, spiky low | Steady prod load |
| **M** (m5/m6g/m7g) | 1:4 general | Web APIs, microservices, mixed | RAM-hungry DBs |
| **C** (c5/c6g/c7g) | 1:2 compute | ML inference, video encode, HPC | Memory-bound apps |
| **R** (r5/r6g/r7g) | 1:8 memory | Postgres, Redis, analytics | CPU-bound batch |
| **X** (x2gd) | 1:16+ extreme | SAP HANA, massive caches | General purpose |
| **I** (i3/i4i) | 1:8 + NVMe | NoSQL, data warehouses, search | CPU/RAM workloads |
| **P/G** | GPU | ML training (P), inference/graphics (G) | Everything else |

🇮🇳 **Hinglish intuition:** Instance family = bhookh ka type. App kya zyada khaati hai — CPU (C), RAM (R), ya dono thoda-thoda (M)? Family galat chuni to best size bhi nahi bachayegi.

> 🔧 **War story:** Argo CD ek t3.micro node pe install kiya — 30 min mein node OOM ho gaya, Argo ke pods crash loop mein. Root cause: t3.micro mein sirf ~1 GB usable RAM hai, Argo CD ke controllers milke ~600 MB khaate hain plus cluster overhead. Fix: `--validate=false` ke saath install karke node resize karo — ya seedha m6g.large lo production ke liye. Poori kahani + lesson → [Interview Bank](14-interview-bank.md).

### Decode the Name: `m6g.xlarge`

```
m  → family   : M = general purpose (balanced)
6  → generation: 6th gen (newer = faster + cheaper; always prefer latest)
g  → processor : g = Graviton (AWS ARM chip) · i = Intel · a = AMD
     Graviton (g) = ~20% cheaper + better perf — prefer if app is ARM-compatible
                    (most Linux workloads are; check your base Docker image arch)
xlarge → size  : nano < micro < small < medium < large < xlarge < 2xlarge < 4xlarge
                 Each step UP roughly doubles vCPU and RAM
```

**Size ladder (M-family as reference):**

| Size | vCPU | RAM | Notes |
|------|------|-----|-------|
| medium | 2 | 4 GB | Dev only |
| large | 2 | 8 GB | Small prod |
| xlarge | 4 | 16 GB | Common starting point |
| 2xlarge | 8 | 32 GB | Mid SaaS |
| 4xlarge | 16 | 64 GB | Heavy workloads |

**Rule:** When in doubt, default to M family. Measure first. Shift family only when metrics prove a bottleneck.

---

## Requests, Limits & What Happens When You Cross Them

Every Kubernetes pod should declare both `requests` and `limits` for CPU and memory. They are not optional in production.

```yaml
resources:
  requests:
    cpu: "250m"      # 0.25 vCPU — scheduler guarantees this seat
    memory: "256Mi"  # 256 MiB  — guaranteed reservation
  limits:
    cpu: "500m"      # 0.5 vCPU — hard ceiling; exceed → throttled
    memory: "512Mi"  # 512 MiB  — hard ceiling; exceed → OOMKilled
```

> 🔮 **Predict pehle (socho, phir aage padho):** Ek pod apni `memory limit` cross kar gaya. Kubernetes kya karta hai, aur `kubectl describe` me kaunsa signal (exit code) dikhega?

### What Actually Happens at the Boundary

| Resource | Exceeds request | Exceeds limit | Exit code |
|----------|----------------|---------------|-----------|
| **CPU** | Borrows from spare capacity (OK) | **Throttled** — process slows, stays alive | — |
| **Memory** | Borrows spare memory (OK) | **OOMKilled** — kernel kills process, pod restarts | **137** (SIGKILL) |

🇮🇳 **Hinglish intuition:**
- `requests` = reserved seat on the bus. Scheduler ne teri seat book kar di — chahe tu soya ho, jagah teri hai.
- `limits` = kamre ki deewar. CPU deewar todne ki koshish kare → warden slow karta (throttle, zinda rahega). RAM deewar tode → nikaal bahar (OOMKilled, exit 137, restart).
- **Reflex:** `OOMKilled` / exit `137` dikhee → RAM limit badhao ya R-family lo. CPU throttle → CPU limit ya C-family.

### Failure Mode Diagram

```
CPU usage vs limit:
──────────────────────────────────────────
  Request  Limit
  [===|=====|──────────────────────]
       ↑       ↑
  guaranteed  ceiling
               │
               └─ Cross → THROTTLE (slow, alive 🐢)

RAM usage vs limit:
──────────────────────────────────────────
  Request  Limit
  [===|=====|──────────────────────]
               │
               └─ Cross → OOMKilled (restart 💀, exit 137)
```

**The reflex (memorize this):**
- `exit 137` = OOMKilled = RAM limit too low → raise `memory.limits` or switch to R-family.
- `CrashLoopBackOff` with 137 in `kubectl describe pod` → same diagnosis.
- Silent slow API = CPU throttle → raise `cpu.limits` or switch to C-family.

---

## Right-Sizing: The Formulas

Do not size from a guess alone. The workflow is: **Estimate → Deploy → Measure → Right-size**.

🇮🇳 **Hinglish intuition:** Naap ke kapde silao. Pehle andaaza lagao, phir pahen ke dekho, phir darzi se adjust karwao. Pehli baar perfect hoga nahi — aur woh theek hai.

### Per-Pod Sizing

```
Pod CPU request    = avg CPU per request × peak concurrent requests ÷ replicas
Pod memory request = base process RAM + (per-connection RAM × max connections)
Pod limit (CPU)    = request × 1.5 to 2   ← spike headroom
Pod limit (RAM)    = request × 1.5 to 2   ← spike headroom, but be conservative
```

### Node Sizing

```
Node RAM  = (pods_per_node × pod_RAM_limit)  + system_overhead(1.5 GB) + kubelet/CNI(0.5 GB)
Node CPU  = (pods_per_node × pod_CPU_limit)  + system_overhead(0.5 vCPU)

Pods per node = min(
    110,                              # Kubernetes hard cap (maxPods default)
    node_RAM ÷ pod_RAM_limit,         # memory bound
    node_CPU ÷ pod_CPU_limit,         # cpu bound
    IP_limit_for_instance_type        # AWS VPC CNI: each pod needs an IP
)
```

### Node Count

```
Total nodes = ceil( total_pods ÷ pods_per_node ) + 1
                                                   └─ +1 for HA / failure tolerance
```

### Database Sizing (Postgres / MySQL)

```
DB RAM       = working_set (hot data in memory)
             + shared_buffers (= RAM × 0.25, Postgres rule of thumb)
             + (connections × ~10 MB per connection)

connections  = (core_count × 2) + effective_spindle_count   ← starting point
               (use PgBouncer to pool; raw connections are expensive)
```

**Headroom rule:** Never fill a node to 100%. Leave 20–30% buffer for:
- Sudden traffic spikes before HPA kicks in
- OS / kubelet overhead fluctuations
- Rolling update: new pod starts before old one terminates

---

## Cost: On-Demand, Reserved, Spot

```
┌──────────────┬─────────────────────────────┬──────────────┬──────────────────────────┐
│ Pricing model│ How it works                │ Discount     │ Use when                 │
├──────────────┼─────────────────────────────┼──────────────┼──────────────────────────┤
│ On-Demand    │ Pay per hour, no commitment │ —            │ Dev/test, unpredictable  │
│ Reserved /   │ 1-yr or 3-yr commit         │ 40–70% off   │ 24/7 baseline prod       │
│ Savings Plans│ (Savings Plans = flexible)  │              │ load you're sure about   │
│ Spot         │ AWS idle capacity, reclaimab│ 70–90% off   │ Stateless, interruptible │
│              │ le with 2-min warning       │              │ NEVER for DB / stateful  │
└──────────────┴─────────────────────────────┴──────────────┴──────────────────────────┘
```

**Spot safety rule** (see [09-connected-system.md](09-connected-system.md) Golden Thread 2):
- Spot instances can be reclaimed by AWS with a 2-minute warning.
- Safe: stateless pods (web, API, batch workers) — Kubernetes will reschedule on another node.
- Never safe: primary databases, anything that can't tolerate instant termination.

**Graviton savings:** Switching `m6.xlarge` → `m6g.xlarge` = same specs, ~20% cheaper, usually equal or better performance. Test your Docker images are `linux/arm64` compatible (most official images are multi-arch since 2021).

**Typical cost optimization path:**
1. Start: On-Demand (no commitment risk)
2. After 2–4 weeks of real metrics: right-size instances
3. For proven steady baseline: buy 1-year Reserved or Savings Plan
4. For batch/CI/non-critical: move to Spot node groups

🇮🇳 **Hinglish intuition:** On-Demand = hotel room (full rate, jab chaaho). Reserved = PG ka advance (sasta, commitment chahiye). Spot = standby flight seat (bahut sasta, par airline nikaал sakti — sirf stateless cargo lo).

---

## Autoscaling: HPA vs Cluster Autoscaler vs VPA

### Three Tools, Three Dimensions

```
                    ┌─────────────────────────────────────────────────┐
                    │              SCALING DIRECTIONS                  │
                    │                                                  │
  pods              │  HPA ──────────────────────────────────────→    │
  (horizontal)      │  [pod][pod][pod]  →  [pod][pod][pod][pod][pod] │
                    │                                                  │
  nodes             │  Cluster Autoscaler ──────────────────────────→ │
  (horizontal)      │  [node][node]     →  [node][node][node]        │
                    │                                                  │
  pod size          │  VPA ↕                                          │
  (vertical)        │  pod(256Mi)  →  pod(512Mi)  (resize requests)  │
                    └─────────────────────────────────────────────────┘
```

### Side-by-Side Comparison

| Autoscaler | Full name | What it scales | Trigger | Restart pods? |
|------------|-----------|---------------|---------|---------------|
| **HPA** | Horizontal Pod Autoscaler | Number of pods | CPU%, memory%, custom metric | No (adds new pods) |
| **CA** | Cluster Autoscaler | Number of nodes | Pod Pending (no fit) | No (adds new nodes) |
| **VPA** | Vertical Pod Autoscaler | Pod's CPU/RAM requests | Under/over-utilization | Yes (recreates pod with new requests) |

**How they compose:** CA watches for Pending pods. HPA creates Pending pods when load rises and no node has capacity. CA then adds a node. This is the standard chain:

```
Traffic spike
    → HPA: create more pods
        → pods Pending (no node capacity)
            → CA: provision new node
                → pods scheduled, traffic served
```

**VPA** alongside HPA: use carefully — both trying to resize can conflict. Common pattern: use VPA in "recommendation mode" only (it suggests optimal requests, you apply manually), then tune HPA thresholds.

**KEDA** (Kubernetes Event-Driven Autoscaling): extends HPA with queue-depth, Kafka lag, cron, and 50+ other triggers. Useful for Profile D (batch/ML inference): scale pods to zero when queue empty, scale up on queue depth.

🇮🇳 **Hinglish intuition:**
- HPA = zyada waiter bulao (restoran busy hua).
- CA = zyada table lagao (restoran mein jagah hi nahi bachi).
- VPA = ek waiter ko zyada thali do (kam waiters, magar har ek zyada kaam kare).

---

## Traps: CPU Credits, Fragmentation, Pending Pods

### Trap 1 — T-Series CPU Credit Exhaustion

T-family instances (t3, t4g) are burstable: they earn CPU credits during idle periods and spend them during spikes.

```
T-instance credit lifecycle:
──────────────────────────────────────────────────
  Idle time  → credits accumulate  📈
  Spike      → credits spend       📉
  Credits = 0 → CPU capped at BASELINE (~10–20% of vCPU) 🐢

Timeline:
 Idle  ────────── Spike ──────────────────────── (steady load)
       [earn]      [spend]   [spend]  [EMPTY→THROTTLE]
```

**The silent killer:** CPU credit exhaustion looks like a sudden application slowdown with no error, no OOMKill. CPU % in CloudWatch sits at the T-instance baseline cap. New engineers spend hours debugging "the code got slower."

**Rule:** T-series = dev, demo, sporadic-spike workloads only. Any service with sustained CPU > 20% for more than a few minutes → switch to M or C family.

### Trap 2 — Fragmentation

Total free capacity across the cluster looks sufficient, but no single node has enough contiguous capacity to fit the next pod.

```
Fragmentation — "bus seats not together":
─────────────────────────────────────────────────────────────────
  Node A:  [pod][pod][pod][ 1 CPU free ][ 0.5 GB free ]
  Node B:  [pod][pod]    [ 0.5 CPU free][ 2 GB free   ]

  New pod wants: 1 CPU + 2 GB RAM
  → Node A: 1 CPU OK, 0.5 GB NOT enough
  → Node B: 0.5 CPU NOT enough, 2 GB OK
  → Neither node fits → pod PENDING ❌

  Total free: 1.5 CPU + 2.5 GB (enough on paper)
  Schedulable: 0 (fragmented)
```

Fix: Add a node (CA does this automatically), or run a smaller pod that fits, or repack existing pods.

### Trap 3 — Pod Pending: 3 Root Causes

When `kubectl get pods` shows `Pending`, the **first command** is always:
```bash
kubectl describe pod <pod-name>
# Read the Events section at the bottom — the scheduler writes the exact reason
```

| # | Root cause | `Events` message | Fix |
|---|-----------|-----------------|-----|
| 1 | **Fragmentation** — request doesn't fit any single node | `Insufficient cpu` / `Insufficient memory` | Add node (CA) or reduce pod request |
| 2 | **IP / maxPods exhaustion** — CPU and RAM are free, but pod IP pool or ~110 cap hit | `node(s) had untolerated taint` or AWS-CNI IP error | Add nodes; use prefix delegation for CNI; check maxPods |
| 3 | **Taint / nodeSelector mismatch** — pod requires specific node label/toleration | `didn't match node selector` / `untolerated taint` | Fix nodeSelector or add toleration |

🇮🇳 **Hinglish intuition:** Fragmentation = bus mein seats hain, par do ek saath nahi milte. IP exhaustion = parking pass khatam, gaadi hai par park nahi kar sakte. Taint = VIP-only lounge mein aam aadmi ka pass nahi.

### Trap 4 — Storage: EBS, IOPS, gp3 vs io2

For stateful workloads that must run in Kubernetes (or on EC2):

| Volume type | IOPS | Throughput | Use case |
|-------------|------|-----------|----------|
| **gp3** | Up to 16,000 (configurable, decoupled from size) | Up to 1,000 MB/s | Default choice; great value |
| **io2** | Up to 256,000 (provisioned) | Up to 4,000 MB/s | Databases needing consistent high IOPS |
| **gp2** (legacy) | Tied to size (3 IOPS/GB) | Capped | Avoid for new workloads |

**Rule of thumb:** Start with gp3 at custom IOPS. Upgrade to io2 only if CloudWatch `VolumeQueueLength` stays > 1 (IOPS saturation).

---

## Ready-Made Sizing Profiles

> Copy-paste starting point. Measure and adjust after 2 weeks of real traffic.

| Profile | Scenario | Nodes | Pod requests | DB | Scaling | Est. monthly cost |
|---------|---------|-------|-------------|-----|---------|-----------------|
| **A — Small API** | REST API, <100 RPS, stateless | 2× m6g.large (2vCPU/8GB) | 250m / 256Mi → 500m / 512Mi | RDS db.t3.small | HPA CPU 70% | ~$80–120 |
| **B — Mid SaaS** | 5–15 microservices, 100–1k RPS | 3–5× m6g.xlarge, multi-AZ | 500m / 512Mi → 1000m / 1Gi | RDS db.r6g.large Multi-AZ | HPA + CA | ~$500–1,500 |
| **C — High-traffic** | >1k RPS, spiky, latency-sensitive | mixed m6g.xlarge + c6g.xlarge + Spot batch | Load-test-derived | Aurora r6g.2xlarge+ read replicas | Full HPA+VPA+CA+CDN | ~$5k–50k+ |
| **D — CPU-heavy** | ML inference / video / batch | c6g.2xlarge+ / g5.xlarge GPU | 2000m / 2Gi → 4000m / 4Gi | SQS queue; minimal DB | KEDA queue-depth + Spot | Compute-hours driven |
| **E — RAM-heavy** | Redis, in-memory analytics | r6g.xlarge+ | 500m / 4Gi → 1000m / 8Gi | ElastiCache r6g.xlarge | HPA mem + CA | RAM-price driven |
| **F — Stateful DB** | Postgres / MySQL primary | — (not in K8s) | — | RDS r6g.large+ Multi-AZ | RDS Auto Scaling (storage) | $200–2000+ |

**Hard rule:** Primary production database → **never in a Kubernetes pod** → use RDS or Aurora. Backups, failover, patching, and Multi-AZ are managed for you. Self-managed DB in a pod requires StatefulSet expertise, persistent volume management, and custom backup automation — operational risk not worth taking for primary data.

---

## Real Production Example

**Scenario:** Mid-size SaaS, 8 microservices, 300 RPS average, spikes to 900 RPS.

**Initial state (guessed):** 2× m5.2xlarge (8vCPU/32GB each), flat deployment, no HPA.

**Problems found after 2 weeks:**
- Average CPU: 8% (massive over-provision)
- Two services OOMKilled repeatedly during spikes (RAM limit set at 256Mi, actual need 640Mi)
- Cloud bill: $1,400/month

**After right-sizing:**
- Moved to 4× m6g.large (2vCPU/8GB) → Multi-AZ with CA
- Fixed OOM services: raised `memory.requests/limits` to 512Mi/768Mi
- Added HPA per service at CPU 65%
- Switched to m6g (Graviton) for 20% savings
- Added 1-year Savings Plan for baseline 3 nodes

**Result:** $580/month (58% reduction), zero OOMKilled incidents, auto-scales to 900 RPS without manual intervention.

---

## Commands, Explained

```bash
# See real CPU and memory usage of all pods (requires metrics-server)
kubectl top pods -n <namespace>
# Why: This is your right-sizing ground truth. Compare to requests/limits.

# See node-level resource usage and capacity
kubectl top nodes
# Why: Reveals which nodes are actually loaded; detect fragmentation candidates.

# Describe a Pending pod — always start here
kubectl describe pod <pod-name> -n <namespace>
# Why: Events section tells you exactly why scheduling failed (resource / IP / taint).

# Check what limits are set on a running pod
kubectl get pod <pod-name> -o jsonpath='{.spec.containers[*].resources}'
# Why: Verify your YAML applied; catch missing limits before they bite.

# See HPA status and current replica count
kubectl get hpa -n <namespace>
# Why: Shows current/desired replicas, target metric %, and scale activity.

# Watch HPA scale in real time during a load test
kubectl get hpa -n <namespace> -w
# Why: Observe HPA reaction time (default 15s scrape, 30s stabilization window).

# Check Cluster Autoscaler logs (EKS: runs in kube-system)
kubectl logs -n kube-system -l app=cluster-autoscaler --tail=50
# Why: CA logs show node provisioning decisions and scale-down blockers.

# Get VPA recommendations (if VPA installed in recommendation mode)
kubectl describe vpa <vpa-name> -n <namespace>
# Why: Shows recommended requests/limits based on observed usage — use to tune.
```

---

## Beginner Mistakes vs Senior Insights

| Beginner mistake | Senior insight |
|-----------------|----------------|
| Set no `requests` or `limits` — "let K8s figure it out" | Missing requests → scheduler can't place pods reliably; missing limits → one noisy pod starves the node |
| Size from vibes: "xlarge sounds good" | Estimate from app type, measure from metrics, right-size from data |
| Use `t3` instances for steady production API | T-series throttles silently when credits exhaust; use m/c/r for sustained load |
| Set `limit = request` (no headroom) | CPU throttle at the slightest spike; OOMKilled on any request burst |
| Run production DB in a K8s pod | StatefulSet + PV management complexity + no managed failover = 3 AM incidents |
| Spot instances for primary database | AWS will reclaim with 2-min warning — RDS with Multi-AZ failover instead |
| Over-provision 5× "to be safe," never review | Paying $5k/month for $1k of real usage; cloud bill shock is a sizing failure |
| Ignore fragmentation; add more Spot nodes | Investigate with `kubectl describe pod`; often headroom tuning or CA config fixes it |
| Keep M-family even when metrics show 90% memory | Measure first; if memory-bound, shift to R-family — costs less per GB of RAM |
| Never buy Reserved — "we might change" | Baseline of even 2 steady nodes pays for a 1-year commit in 6 months |

---

## Memory Shortcuts

| Signal | Diagnosis | First action |
|--------|-----------|-------------|
| Exit `137` / `OOMKilled` | RAM limit too low | Raise `memory.limits`; check `kubectl top pod` |
| Silent slow API, no errors | CPU throttle (or T-credit exhaustion) | Raise `cpu.limits`; check CloudWatch CPUCreditBalance |
| Pod `Pending`, nodes have free RAM | Fragmentation or IP exhaustion | `kubectl describe pod` → Events |
| Bill shock | Over-provisioned, no autoscaling | `kubectl top`, Graviton, Spot for batch, Savings Plan |
| HPA not scaling | No metrics-server, wrong metric name, cooldown | `kubectl describe hpa` → check `AbleToScale` conditions |
| Node cost dominates bill | Nodes too large, low utilization | Right-size down; enable CA scale-down; check minReplicas |

🇮🇳 **Hinglish intuition memory aids:**
- OOMKilled = zyada kha liya, bahar nikaala (exit 137 = SIGKILL — RAM ki hadh todi).
- Throttle = speed breaker — zinda hai, par slow (CPU limit).
- Fragmentation = tukde-tukde jagah, ek pod ka ek piece fit nahi karta.
- Right-sizing = naap ke kapde — na itne chhote ki phate, na itne bade ki ghumo.
- Reserved = advance booking discount — pakka aaoge to sasta.
- Spot = standby ticket — mila to great, na mila to K8s sambhal lega (sirf stateless).

---

## Summary

```
SIZING WORKFLOW (har project ke liye)
──────────────────────────────────────
Step 1  CLASSIFY  →  CPU/RAM/IO/GPU bound?  →  pick family (M/C/R/I/P)
Step 2  ESTIMATE  →  RPS, concurrency, data size  →  rough requests/limits
Step 3  DEPLOY    →  launch with 20–30% headroom buffer
Step 4  MEASURE   →  kubectl top + CloudWatch (2 weeks real traffic)
Step 5  RIGHT-SIZE → adjust requests/limits; switch family if data says so
Step 6  AUTOSCALE → HPA (pods) + CA (nodes); VPA in recommend mode
Step 7  COST OPT  → Graviton switch; Spot for batch; Savings Plan for baseline
Step 8  REVIEW    → monthly; usage changes, infra should follow
```

**Golden rules (distilled):**
1. Family first, size second. Wrong family = no tuning saves you.
2. Set requests AND limits on every pod, always.
3. `OOMKilled / 137` → RAM limit. CPU throttle → CPU limit. `Pending` → `kubectl describe pod`.
4. T-series = dev only. Steady prod → M/C/R.
5. Primary prod DB never in a K8s pod. RDS + Multi-AZ.
6. Spot = stateless only. Reserved = proven steady baseline.

---

## Self-Check Quiz

Pehle memory se jawab do, phir neeche kholo.

1. Your pod exits with code `137` three times in an hour. What is the diagnosis and the first two actions?
2. `kubectl top nodes` shows Node A at 12% CPU, 15% RAM. Is this efficient? What's the risk?
3. Explain the difference between `requests` and `limits`. What does the Kubernetes scheduler use and why?
4. You have a 4-node cluster. Total free: 6 CPU, 12 GB RAM. A new pod requests 4 CPU / 10 GB. It stays Pending. Why could this happen, and how do you diagnose it?
5. An engineer suggests running your production Postgres primary on a Spot instance in a K8s StatefulSet to save 80% on costs. What are the two specific failure scenarios? What is your counter-proposal?
6. You're asked to cut the cloud bill by 30% without degrading SLAs. Walk through your three-step approach.
7. What is the T-series CPU credit trap? How does it manifest in production? How do you detect it in CloudWatch?
8. When would you use VPA alongside HPA? What conflict must you avoid?

<details markdown="1"><summary>Jawab dekho</summary>

1. Exit 137 = OOMKilled = RAM limit breached. First: `kubectl describe pod <name>` — confirm OOMKilled in State and exit code 137. Second: `kubectl top pod <name>` — see actual memory usage vs limit. Then raise `memory.limits` (and requests proportionally).
2. 12% CPU / 15% RAM = severely over-provisioned — paying for idle capacity. Risk: if T-series, CPU credits quietly drain under any burst. Right-size down to a smaller instance or fewer nodes; enable CA scale-down.
3. `requests` = reserved seat — the scheduler uses this to decide pod placement (node must have at least this much free). `limits` = hard ceiling — exceed CPU → throttle (alive, slow); exceed RAM → OOMKilled (exit 137). Missing requests = scheduler flies blind; missing limits = one noisy pod can starve the whole node.
4. Fragmentation: total free is 6 CPU / 12 GB but scattered across nodes (e.g., 1.5 CPU / 3 GB each). No single node has 4 CPU + 10 GB contiguous. Diagnose: `kubectl describe pod <name>` → Events: "Insufficient cpu/memory" on every node.
5. Scenario 1: AWS reclaims the Spot instance with a 2-min warning — StatefulSet pod dies abruptly, in-flight writes may corrupt data. Scenario 2: WAL not flushed on sudden termination → data loss. Counter-proposal: RDS Multi-AZ — managed failover, no Spot risk, automated backups.
6. Step 1: Measure — `kubectl top pods/nodes` + CloudWatch for 2 weeks; establish actual CPU/RAM baseline. Step 2: Right-size — smaller instance matching real usage + 20–30% headroom; switch to Graviton for ~20% savings. Step 3: Cost model — Spot node groups for stateless batch; 1-yr Savings Plan for proven steady baseline nodes.
7. T-series earns CPU credits when idle, spends them on burst. When credits hit zero, CPU is hard-capped at the baseline rate (~10–20% vCPU). Symptom: app suddenly slows with no errors, no OOMKill — just latency. Detect in CloudWatch: `CPUCreditBalance` approaching zero while `CPUUtilization` is pinned at the baseline cap.
8. VPA in recommendation mode alongside HPA is fine — VPA suggests better requests, you apply manually, HPA scales replicas on tuned pods. Conflict to avoid: VPA in auto mode + HPA both targeting the same metric (CPU) — VPA resizes pod CPU request, which shifts what HPA calculates against, causing oscillation.
</details>

---

## Hands-On Lab

### Lab M5-A: Set Requests/Limits and Trigger OOMKilled

```bash
# 1. Deploy a pod with artificially low memory limit
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mem-demo
spec:
  replicas: 1
  selector:
    matchLabels: {app: mem-demo}
  template:
    metadata:
      labels: {app: mem-demo}
    spec:
      containers:
      - name: mem-eater
        image: polinux/stress
        resources:
          requests: {memory: "50Mi", cpu: "100m"}
          limits:   {memory: "100Mi", cpu: "200m"}
        command: ["stress"]
        args: ["--vm", "1", "--vm-bytes", "150M", "--vm-hang", "1"]
EOF

# 2. Watch the pod — it should OOMKill shortly
kubectl get pods -w

# 3. Confirm exit code 137
kubectl describe pod -l app=mem-demo
# Look for: "OOMKilled" in State, "137" in Exit Code

# 4. Raise the limit to fix it
kubectl set resources deployment mem-demo \
  --limits=memory=256Mi

# 5. Verify pod stays Running
kubectl get pods -l app=mem-demo
```

### Lab M5-B: Watch HPA Scale

```bash
# Requires metrics-server: kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# 1. Deploy a CPU-hungry app
kubectl create deployment php-apache --image=registry.k8s.io/hpa-example
kubectl expose deployment php-apache --port=80

# 2. Create HPA targeting 50% CPU
kubectl autoscale deployment php-apache --cpu-percent=50 --min=1 --max=10

# 3. Generate load in a separate terminal
kubectl run load-gen --image=busybox:1.28 --restart=Never -- \
  /bin/sh -c "while true; do wget -q -O- http://php-apache; done"

# 4. Watch HPA react (check every 15-30s)
kubectl get hpa -w

# 5. Kill load and watch scale-down (takes ~5 min stabilization)
kubectl delete pod load-gen
kubectl get hpa -w
```

### Lab M5-C: Diagnose a Pending Pod

```bash
# 1. Create a pod that requests more resources than any node has
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: too-big
spec:
  containers:
  - name: app
    image: nginx
    resources:
      requests:
        cpu: "100"      # 100 vCPU — no single node has this
        memory: "100Gi"
EOF

# 2. Observe Pending
kubectl get pod too-big

# 3. Read the scheduler's exact message
kubectl describe pod too-big
# Events section shows: "Insufficient cpu" on every node

# 4. Clean up
kubectl delete pod too-big
```

**✅ Sahi hua to aisa dikhega:** Lab A mein `kubectl describe pod -l app=mem-demo` mein `State: Terminated`, `Reason: OOMKilled`, `Exit Code: 137` clearly dikh raha hai — limit raise karne ke baad pod `Running` aur `READY 1/1` mein stable rehta hai. Lab B mein `kubectl get hpa -w` ka `REPLICAS` column load ke saath 1 se 5+ tak chadhta hai aur load hatane ke 5 min baad wapas 1 pe aata hai. Lab C mein `kubectl describe pod too-big` ka Events section har node ke against `Insufficient cpu` likhta hai.

---

## Interview Questions

**Q1: A pod keeps restarting with exit code 137. Walk me through your full diagnosis.**

Expected: Exit 137 = OOMKilled = RAM limit exceeded. Steps: `kubectl describe pod <name>` → confirm OOMKilled in State and 137 in Exit Code → `kubectl top pod <name>` to see current memory use → compare to limit → raise `memory.limits` (and `memory.requests` proportionally) → if this is structural (app always grows), switch to R-family instance and use VPA recommendations.

**Q2: When is Spot safe and when is it dangerous in Kubernetes?**

Expected: Spot = safe for stateless, interruptible pods (web tier, batch workers, CI runners) because K8s can reschedule on another node when instance is reclaimed (2-min warning). Dangerous for: primary databases (data loss risk), StatefulSets with local storage, anything that cannot tolerate sudden termination. RDS Multi-AZ is the answer for persistent data, not Spot.

**Q3: You have CPU 5% and RAM 90% on your nodes. What does that tell you and what do you do?**

Expected: Workload is RAM-bound. The M-family's 1:4 CPU:RAM ratio is sub-optimal — you're paying for vCPU you don't use. Switch to R-family (1:8 ratio) — you get twice the RAM per vCPU, meaning fewer nodes for the same memory capacity. Also: check if any services are leaking memory (trending up vs stable high); consider raising `memory.requests` to reflect actual usage and let HPA scale horizontally.

**Q4: Explain the T-series CPU credit trap. How would you detect it on a live system?**

Expected: T-instances earn CPU credits during idle, spend them during bursts. When credits exhaust, CPU is capped at the baseline rate (~10–20%). Application suddenly slows with no errors, no OOMKill — just latency degradation. Detect: CloudWatch → `CPUCreditBalance` metric on the instance → if approaching zero while `CPUUtilization` is at the baseline cap, that's the trap. Fix: switch to M/C/R family for steady production load.

**Q5: Three pods are Pending on a cluster with "enough" total resources. What are the three possible causes and how do you differentiate them?**

Expected: Run `kubectl describe pod <pending-pod>` and read the Events section.
- Cause 1 (Fragmentation): "Insufficient cpu/memory" on every node — total free is enough but no single node has contiguous capacity to fit the pod. Fix: add a node or reduce pod request.
- Cause 2 (IP/maxPods exhaustion): AWS VPC CNI IP error or "max pods exceeded" — CPU and RAM free but pod IPs exhausted. Fix: enable prefix delegation, or add nodes, or increase maxPods.
- Cause 3 (Taint/nodeSelector): "didn't match node selector" or "untolerated taint" — pod needs a specific node label (e.g., GPU node) or toleration. Fix: add matching node or fix pod spec.

**Q6: What is the difference between HPA, Cluster Autoscaler, and VPA? How do they compose in a real cluster?**

Expected: HPA scales pod count horizontally based on metrics (CPU%, memory%, custom). CA scales node count when pods can't be scheduled. VPA adjusts a single pod's requests vertically (requires restart). Chain: high traffic → HPA creates pods → some Pending due to node capacity → CA provisions node → pods schedule. VPA runs in recommendation mode to inform manual request tuning or automate gradually. Conflict: VPA + HPA on the same resource metric (both CPU) can conflict — use VPA for right-sizing discovery, HPA for runtime scaling.

---

## Production Challenge

**The Challenge:**

You inherit a 3-node `m5.2xlarge` EKS cluster (24 vCPU / 96 GB RAM total) running 12 microservices. The bill is $2,100/month. CloudWatch shows average CPU at 7%, average RAM at 22%. Three services have had OOMKilled incidents in the past month. The team has no HPA configured and sizes "generously" by instinct.

**Your mission (write the answer as a structured plan):**

1. What metrics do you collect first and from where? List the exact commands.
2. How do you diagnose the three OOMKilled services? What do you expect to find?
3. Propose a new instance family/size and node count. Show your math using the formulas from this module.
4. What autoscaling configuration do you add? Which services get HPA, which get VPA recommendation mode?
5. What cost optimizations do you apply? Estimate the new monthly bill.
6. What monitoring do you put in place to detect drift from your right-sized baseline over the next 90 days?

**Expected outcome:** ~50–65% bill reduction, zero OOMKilled incidents, sub-60-second HPA response to traffic spikes, and a repeatable right-sizing review process.

---

*Next: [07-M6-cicd.md](07-M6-cicd.md) — CI/CD with GitHub Actions: from `git push` to a tested image in ECR, and the manifest-update handoff to GitOps.*
*Reference: [16-reference-appendix.md](16-reference-appendix.md) — instance family quick-lookup, formula cheat sheet, kubectl command index.*
