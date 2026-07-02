# Machine & Instance Sizing — Master Decision Guide

> Ek baar padho, project dekhte hi decide kar lo. Lookup tables + formulas + ready-made project profiles.

---

## Part 1: The 30-Second Decision Tree

Koi bhi project aaye, ye 4 sawaal pucho — answer mil jayega:

```
Q1. App kis cheez ki bhookhi hai?
    ├─ Balanced (web/API)        → M family  (m5/m6/m7)
    ├─ CPU-heavy (compute/batch) → C family  (c5/c6/c7)
    ├─ RAM-heavy (DB/cache)      → R family  (r5/r6/r7)
    ├─ Disk-IO heavy             → I family  (i3/i4)
    └─ GPU (ML training)         → P/G family

Q2. Traffic steady hai ya spiky/low?
    ├─ Low/dev/spiky  → t3/t4g (burstable, sasta)
    └─ Steady/prod    → m/c/r (fixed performance)

Q3. State hai (data persist)?
    ├─ Haan → managed service (RDS/ElastiCache), K8s ke bahar
    └─ Nahi → K8s pod, scale freely

Q4. Scale kaise hoga?
    ├─ Pods badhao    → HPA (Horizontal Pod Autoscaler)
    └─ Nodes badhao   → Cluster Autoscaler
```

---

## Part 2: Instance Family Cheat Sheet (yaad rakho)

| Family | Naam ka matlab | CPU:RAM ratio | Use kab |
|--------|---------------|---------------|---------|
| **T** (t3/t4g) | Burstable | 1:2-4, variable | Dev, demo, low/spiky traffic. CPU credits — steady high load pe NAHI |
| **M** (m5/m6/m7) | General/Main | 1:4 | Default choice. Web apps, APIs, microservices, balanced workload |
| **C** (c5/c6/c7) | Compute | 1:2 | CPU-bound: video encode, ML inference, batch, game servers, HPC |
| **R** (r5/r6/r7) | RAM | 1:8 | Memory-bound: databases, in-memory cache, real-time analytics |
| **X** (x2) | eXtreme RAM | 1:16+ | Huge in-memory: SAP HANA, giant caches |
| **I** (i3/i4) | IO/storage | 1:8 + NVMe | High disk IO: NoSQL, data warehouse, search |
| **P/G** | GPU | — | ML training (P), inference/graphics (G) |

**Naming decode:** `m6g.xlarge`
```
m  = family (general purpose)
6  = generation (zyada = naya, sasta, fast — hamesha latest gen prefer karo)
g  = processor (g=Graviton/ARM sasta, i=Intel, a=AMD)
xlarge = size (neeche table)
```

**Size ladder (har step pe double):**

| Size | vCPU | RAM (M family) |
|------|------|----------------|
| medium | 2 | 4 GB |
| large | 2 | 8 GB |
| xlarge | 4 | 16 GB |
| 2xlarge | 8 | 32 GB |
| 4xlarge | 16 | 64 GB |

**Pro tip:** Graviton (ARM, `g` suffix jaise `m7g`) ~20% sasta + better perf. Agar app ARM-compatible hai (zyadatar hai), hamesha prefer karo.

---

## Part 3: Sizing Formulas (calculate karne ke liye)

### Per-pod sizing
```
Pod CPU request    = avg CPU per request × peak concurrent requests / replicas
Pod memory request = base process RAM + (per-connection RAM × connections)
Pod limit          = request × 1.5 to 2  (spike headroom)
```

### Node sizing
```
Node RAM  = (pods per node × pod RAM)  + system overhead (1.5 GB) + kubelet/CNI (0.5 GB)
Node CPU  = (pods per node × pod CPU)  + system overhead (0.5 vCPU)

Pods per node = min(
    110,                                  # k8s maxPods default
    node_RAM / pod_RAM,                    # memory limit
    node_CPU / pod_CPU,                    # cpu limit
    IP_limit_for_instance                  # AWS VPC CNI only
)
```

### Node count
```
Total nodes = ceil( total_pods / pods_per_node ) + 1   (+1 for HA/failure buffer)
```

### Database sizing (Postgres/MySQL)
```
RAM       = working_set (hot data) + shared_buffers (25% RAM) + (connections × 10MB)
shared_buffers = RAM × 0.25  (Postgres rule of thumb)
connections    = (core_count × 2) + effective_spindle_count  (start point)
```

---

## Part 4: Ready-Made Project Profiles

Project type pehchaano → config copy karo. Ye real-world starting points hain.

### Profile A: Small Web App / API (low-mid traffic)
```
Scenario: REST API, <100 RPS, stateless, small team
─────────────────────────────────────────────────
Nodes:     2× t3.medium (2vCPU/4GB)  [demo/dev]
           2× m6g.large (2vCPU/8GB)  [production]
Pods:      API → 3 replicas
           per-pod: req 250m/256Mi, limit 500m/512Mi
DB:        RDS db.t3.micro (dev) / db.t3.small (prod)
Cache:     skip ya ElastiCache t3.micro
Scaling:   HPA on CPU 70%
Est cost:  ~$50-100/mo (prod)
```

### Profile B: Mid-size SaaS (steady traffic, microservices)
```
Scenario: 5-15 microservices, 100-1000 RPS, real users
─────────────────────────────────────────────────
Nodes:     3-5× m6g.large or m6g.xlarge (HA across AZs)
Pods:      per service 2-4 replicas
           per-pod: req 500m/512Mi, limit 1000m/1Gi
DB:        RDS db.r6g.large (2vCPU/16GB), Multi-AZ
Cache:     ElastiCache Redis r6g.large
Scaling:   HPA per service + Cluster Autoscaler
Control:   EKS (managed control plane) — self-manage mat karo prod mein
Est cost:  ~$500-1500/mo
```

### Profile C: High-traffic / High-scale
```
Scenario: >1000 RPS, spiky, latency-sensitive
─────────────────────────────────────────────────
Nodes:     mixed — m6g.xlarge (general) + c6g.xlarge (CPU services)
           + spot instances for batch/non-critical
Pods:      aggressive HPA, min 5 / max 50 per hot service
           per-pod: tuned via load testing, not guessed
DB:        RDS r6g.2xlarge+ Multi-AZ + read replicas
           ya Aurora for auto-scaling storage
Cache:     ElastiCache cluster mode, multiple shards
Scaling:   HPA + VPA + Cluster Autoscaler + over-provisioning buffer
CDN:       CloudFront front mein (origin load kam karo)
Est cost:  $5k-50k+/mo
```

### Profile D: CPU-heavy (ML inference / video / batch)
```
Scenario: image/video processing, ML inference, encoding
─────────────────────────────────────────────────
Nodes:     c6g.2xlarge+ (compute optimized)
           GPU inference: g5.xlarge
Pods:      per-pod high CPU: req 2000m/2Gi, limit 4000m/4Gi
           fewer pods per node (CPU-bound)
DB:        usually minimal, job queue (SQS) zyada relevant
Scaling:   queue-depth based (KEDA), not just CPU
Note:      Spot instances huge savings for batch (interruptible OK)
Est cost:  depends on GPU/compute hours
```

### Profile E: Memory-heavy (in-memory DB / analytics / cache)
```
Scenario: Redis-heavy, real-time analytics, big in-memory dataset
─────────────────────────────────────────────────
Nodes:     r6g.xlarge+ (memory optimized)
Pods:      per-pod high RAM: req 500m/4Gi, limit 1000m/8Gi
DB/Cache:  ElastiCache r6g.xlarge+ ya self-managed Redis on R nodes
Note:      RAM bottleneck — CPU usually idle, mat over-pay CPU pe
Est cost:  RAM-driven pricing
```

### Profile F: Stateful Database (dedicated)
```
Scenario: Postgres/MySQL primary database
─────────────────────────────────────────────────
PEHLI CHOICE: Managed (RDS/Aurora) — backups, failover, patching free
  Dev:   db.t3.micro / small
  Prod:  db.r6g.large+ (memory family — DB RAM-hungry hota)
  HA:    Multi-AZ ON (production mein non-negotiable)
  Reads: read replicas if read-heavy

Self-managed on EC2 (sirf agar special need):
  r6g family + io2 EBS volumes (high IOPS)
  NEVER in K8s pod for production primary DB
```

---

## Part 5: Golden Rules (yaad rakhne layak)

1. **Family pehle, size baad mein.** Galat family = sab galat. Sahi family = tuning easy.

2. **Stateless → K8s, Stateful → managed service.** Database ko K8s pod mein production mein kabhi mat daalo.

3. **Default confused ho to M family.** Balanced hai, baad mein measure karke shift kar sakte ho.

4. **Burstable (T) sirf dev/low-traffic.** Steady load pe CPU credits khatam → throttle. Prod high-traffic mein M/C/R.

5. **Latest generation + Graviton (ARM).** `m7g` > `m6g` > `m5`. Sasta + fast, agar app ARM-compatible.

6. **Estimate → Deploy → Measure → Right-size.** Pehli baar perfect expect mat karo. `kubectl top` + CloudWatch se actual dekho, phir adjust.

7. **Hamesha headroom + HA.** Node count mein +1 (failure buffer). Limits ko request se 1.5-2x. Multi-AZ prod mein.

8. **Over-provision > crash, lekin right-size > over-provision.** Start safe, phir tighten karke paisa bachao.

9. **Autoscale lagao, manual scaling pe mat raho.** HPA (pods) + Cluster Autoscaler (nodes). Spiky traffic = autoscaling non-negotiable.

10. **Spot instances for interruptible work.** Batch, CI, non-critical — 70% tak sasta. Production critical pe nahi.

---

## Part 6: Quick Reference — "Project Dekha, Config Bola"

| Project | Nodes | DB | Scaling |
|---------|-------|-----|---------|
| Demo/learning | 2× t3.medium | RDS t3.micro | manual |
| Startup MVP | 2× m6g.large | RDS t3.small | HPA |
| Growing SaaS | 3-5× m6g.xlarge | RDS r6g.large Multi-AZ | HPA + CA |
| High traffic | mixed m/c + spot | Aurora + replicas | full autoscale + CDN |
| ML/CPU batch | c6g.2xlarge / GPU | minimal + SQS | queue-based (KEDA) |
| Cache/analytics | r6g.xlarge | ElastiCache r6g | RAM-driven |

---

## Part 7: Sizing Workflow (process, har baar follow karo)

```
1. WORKLOAD CLASSIFY
   → CPU/RAM/IO/GPU bound? → family decide

2. TRAFFIC ESTIMATE
   → peak RPS? steady ya spiky? → burstable vs fixed

3. PER-POD SIZE
   → load test ya estimate → requests/limits set

4. NODE SIZE + COUNT
   → formula se pods-per-node → total nodes + buffer

5. STATE SEPARATE
   → DB/cache → managed service, alag size

6. DEPLOY + MEASURE
   → kubectl top, CloudWatch → actual usage

7. RIGHT-SIZE + AUTOSCALE
   → adjust requests, HPA/CA lagao

8. COST REVIEW
   → over-provisioned? Graviton/spot/reserved se optimize
```

**Mantra:** *Classify the workload → match the family → size from numbers → measure → right-size.* Guesswork nahi, method.
