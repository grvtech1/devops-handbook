# 16 — Reference Appendix

> Keep this open in a second tab. Scan, don't read. Every table is a lookup, not a lesson.
> Teaching detail lives in the module files; this file is the index to all of it.

---

## How to use this appendix

| Need | Go to |
|------|-------|
| Forgot what a term means | § Glossary — find by module |
| On-call, something is broken | § Error / status reflex table first, then § Quick Troubleshoot |
| Choosing EC2 instance type | § Sizing quick-ref → instance families + formulas |
| Running a command, forgot exact syntax | § Command cheat-sheets |
| Pre-interview 30-minute review | § Master Recall Sheet + § 5 Golden Threads |
| "How does X connect to Y?" | § Memory hooks index or [09-connected-system.md](09-connected-system.md) |
| Why does idempotency differ from reconciliation | § Concepts vs Tools |

---

## Glossary

> Format: **Term** — one-line definition — `🎓 hook`
> Module coverage: M0 Foundations → M8 Observability. Detail: respective module files.

### M0 — Foundations (`01-M0-foundations.md`)

| Term | Definition | 🎓 Hook |
|------|-----------|---------|
| **DevOps** | Code-to-live pipeline automated for speed, safety, repeatability | recipe + machine, same result every time |
| **Provisioning** | Creating infra (machines, networks, storage) | building the house |
| **Configuration** | Setting up software inside an already-provisioned machine | putting stove + spices in the kitchen |
| **Packaging** | Wrapping an app + its runtime into a portable image/box | sealing a dish in a container |
| **Orchestration** | Running, healing, and scaling packaged apps across machines | the manager who keeps the kitchen running |
| **Stateful** | Precious data lives inside — destroy = data gone | Pet 🐶 (keep, fix, cannot replace) |
| **Stateless** | Nothing inside worth saving — every request is fresh | Cattle 🐄 (replace, not fix) |
| **Pet vs Cattle** | Fix-and-name vs kill-and-replace operational model | sick cow → new cow |
| **IaC (Infra as Code)** | Infra defined in version-controlled code, no manual console clicks | blueprint, not memory |

---

### M1 — Terraform (`02-M1-terraform.md`)

| Term | Definition | 🎓 Hook |
|------|-----------|---------|
| **Terraform** | Declarative IaC tool that provisions and manages infra via state | builder 🏗️ |
| **Declarative** | You say *what* you want; the tool figures out *how* | "3 servers please" — not "run these 12 steps" |
| **Imperative** | You write every step yourself | the opposite of declarative |
| **State / `tfstate`** | Terraform's JSON diary mapping code resources to real-world IDs | diary 📔 |
| **Idempotent** | Running the same operation N times produces the same result (SET, not +=) | press the light switch — stays ON |
| **`terraform init`** | Downloads providers and plugins, sets up backend | project kickoff |
| **`terraform plan`** | Preview of what will change — reads state, touches nothing | reading the bill before paying 🧾 |
| **`terraform apply`** | Executes the plan; actually creates/changes/destroys | paying 💳 |
| **`terraform destroy`** | Tears down all resources tracked in state | demolition |
| **`terraform output`** | Prints declared output values (IPs, endpoints) | receipt |
| **`terraform fmt`** | Auto-formats `.tf` files to canonical style | prettier for HCL |
| **`terraform validate`** | Checks config syntax without connecting to provider | spell-check |
| **`terraform state list`** | Lists all resources tracked in current state file | diary table of contents |
| **`terraform import`** | Brings an existing real resource into state management | "I made this manually — now track it" |
| **Provider** | Plugin that translates TF config into API calls (AWS, Azure, GCP) | adapter plug |
| **Resource** | One thing Terraform creates (EC2, VPC, RDS instance) | one brick |
| **Backend** | Where state is stored (local file or remote S3/GCS) | the shelf the diary sits on |
| **Remote state** | State stored in S3 (shared); laptop state is disposable | shared diary, not your personal copy |
| **Lock (DynamoDB)** | Prevents two simultaneous `apply` runs from corrupting state | taala 🔒 |
| **Drift** | Reality changed outside Terraform; state file is still intact | menu unchanged, chef swapped the dish |
| **Lost state** | State file deleted/corrupted; TF is blind — will duplicate | diary burned; now it'll order 5 more of everything |
| **Orphaned resource** | Real resource exists but TF no longer tracks it | stray cattle with no owner |
| **`user_data` / cloud-init** | Script that runs once at first boot of an EC2 instance | "wire the lightbulb while the house is being built" |
| **Provisioner** | Run shell commands from inside TF config (last resort) | wrong tool — builder doing interior design |
| **`variables.tf`** | Input declarations (type, default, sensitive flag) | knobs on the dashboard |
| **`outputs.tf`** | Values to export after apply (IPs, URLs) | delivery receipt |

---

### M2 — Ansible (`03-M2-ansible.md`)

| Term | Definition | 🎓 Hook |
|------|-----------|---------|
| **Ansible** | Agentless, push-based config management tool | setup-wala 🔧 |
| **Agentless** | No daemon installed on target; uses SSH + Python only | plumber who leaves no tools behind |
| **Control node** | Machine where Ansible is installed and playbooks run from | your HQ |
| **Managed node** | Target server — needs only SSH + Python | job site |
| **Bastion** | Jump server in public subnet to reach private servers | society gate 🏰 |
| **Push model** | Control node pushes commands to targets on-demand | boss calls the worker |
| **Pull model** | Target periodically fetches and applies its own config | worker checks the bulletin board |
| **Inventory** | List of target hosts and groups | guest list |
| **Playbook** | YAML file of ordered tasks to run on hosts | recipe book |
| **Module** | Single idempotent operation (`apt`, `copy`, `service`, `user`) | one tool in the toolbox |
| **Task** | One invocation of one module | one line in the recipe |
| **`state=present`** | Declarative: "this must exist" — check then act | desire, not instruction |
| **`ok`** | Task result: already correct, nothing changed | already done |
| **`changed`** | Task result: Ansible had to act | something was fixed |
| **Convergence** | Second run = all `ok`, `changed=0` — healthy idempotent playbook | system has settled |
| **Handler** | Special task that only runs when notified | bawarchi who cooks only when the bell rings 🔔 |
| **`notify`** | Triggers a handler — fires only on `changed`, not `ok` | ring the bell |
| **`--check`** | Dry-run mode — shows what would change without doing it | Ansible's `terraform plan` |
| **`-vvv`** | Verbose output — shows SSH commands, module args, raw output | debug magnifier |
| **`ansible-galaxy`** | Package manager for Ansible roles and collections | npm for Ansible |
| **Vault** | Ansible's secret encryption (`ansible-vault encrypt/edit`) | encrypted locker |

---

### M3 — Docker (`04-M3-docker.md`)

| Term | Definition | 🎓 Hook |
|------|-----------|---------|
| **Docker** | Tool to build and run OCI-compliant container images | packer 📦 |
| **Image** | Read-only blueprint: code + libs + runtime + config | recipe 📜 / class |
| **Container** | Running instance of an image — has its own PID, network, FS | dish 🍛 / object |
| **Layer** | Each Dockerfile instruction creates one immutable layer | game save-point 💾 |
| **Cache** | Unchanged layers are reused from previous builds | yesterday's dough |
| **Cache invalidation** | A changed layer breaks cache for all layers below it | crack propagates downward only |
| **Build context** | Directory sent to Docker daemon for the build (the `.` in `docker build .`) | the box COPY can reach into |
| **`.dockerignore`** | File that excludes paths from build context | `.gitignore` for Docker |
| **Registry** | Remote store for images (push/pull) | app store / warehouse |
| **Docker Hub** | Default public registry | public warehouse |
| **GHCR** | GitHub Container Registry | GitHub's warehouse |
| **ECR** | AWS Elastic Container Registry (private, IAM-controlled) | AWS warehouse |
| **Tag** | Version label on an image (`myapp:v1`) | sticky note |
| **`latest` (trap)** | Mutable label — does NOT guarantee newest; avoid in prod | lying sticky note ⚠️ |
| **SHA / digest** | Immutable content-hash fingerprint of an image | exact DNA |
| **`docker push`** | Upload image from local to registry | upload ⬆️ |
| **`docker pull`** | Download image from registry | download ⬇️ |
| **Mutable infra** | Patch machines in-place (Ansible approach) | Pet 🐶 + Ansible |
| **Immutable infra** | Bake everything into an image; replace machines | Cattle 🐄 + Packer/Docker |
| **Packer** | HashiCorp tool that builds machine images (AMIs) at build-time | mold-maker |
| **AMI** | AWS Machine Image — blueprint for an EC2 instance | EC2's recipe |

---

### M4 — Kubernetes (`05-M4-kubernetes-core.md`)

| Term | Definition | 🎓 Hook |
|------|-----------|---------|
| **Kubernetes / K8s** | Container orchestrator: run, heal, scale, load-balance | manager 👨‍🍳 |
| **Reconciliation loop** | Continuous compare of desired vs current state → auto-fix | chowkidar who counts pods 24/7 |
| **Desired state** | What you declared (`replicas: 3`) | the order / menu |
| **Current state** | What is actually running right now | reality |
| **Deployment** | Controller that enforces desired pod count, rolling updates, rollback | floor manager 👔 |
| **ReplicaSet** | Controller that keeps exactly N pods alive (Deployment creates it) | the counter |
| **Pod** | Smallest deployable unit — wraps 1+ containers, shares network/storage | tiffin 🍱 |
| **Sidecar** | Helper container in the same Pod (same network/storage) | motorcycle sidecar |
| **Service** | Stable virtual IP + DNS name + load-balancer in front of pods | fixed phone number ☎️ |
| **Label** | Key-value tag on a Pod or Node | name tag 🏷️ |
| **Selector** | Filter that matches labels — Service uses it to find pods | "these are mine" |
| **`nodeSelector` / affinity** | Pod constraint: which node label must match for scheduling | "I'll sit at that table" |
| **Readiness probe** | "Ready to take traffic?" Fail → removed from Service; pod lives | traffic light 🚦 |
| **Liveness probe** | "Still alive?" Fail → pod killed and restarted | heartbeat 💓 |
| **`Running` vs `Ready`** | Container process started vs app is ready to serve | shop open vs checkout ready |
| **Node** | A single machine (VM or bare metal) in the cluster | one house in the block |
| **Control plane / Master** | Cluster brain: scheduler, API server, etcd, controller-manager | manager's office 🧠 |
| **Worker node** | Where pods actually run | factory floor 💪 |
| **Taint** | "No-Entry" marker on a node — repels pods without matching toleration | No-Entry board 🚷 |
| **Toleration** | Pod's pass that lets it land on a tainted node | VIP pass |
| **`NoSchedule`** | Taint effect: pods won't be scheduled here | hard block |
| **kubeadm** | CLI tool to bootstrap a self-managed K8s cluster | build-your-own assembly kit |
| **EKS** | AWS-managed Kubernetes (control plane run by AWS) | flat for rent — AWS owns the roof |
| **Namespace** | Logical isolation within a cluster (not a security boundary) | separate room in the house |
| **kubectl** | Client CLI to interact with K8s API server | remote control |
| **NodePort** | Service type that exposes a port on every node's IP | self-managed cluster's front door |
| **ClusterIP** | Service type accessible only inside the cluster (default) | internal extension |
| **LoadBalancer** | Service type that provisions a cloud LB (EKS/GKE/AKS only) | cloud's front door |
| **StatefulSet** | Like Deployment but gives pods stable identity + persistent storage | Deployment for Pet workloads |
| **ConfigMap** | Non-secret configuration data injected into pods | settings file |
| **Secret** | Base64-encoded sensitive data (passwords, tokens) | encrypted settings file |
| **HPA** | Horizontal Pod Autoscaler — scales pod count based on metrics | more waiters at rush hour |
| **Cluster Autoscaler** | Scales node count when pods can't be scheduled | more tables when the restaurant is full |
| **Ingress** | L7 HTTP routing: host/path → Service | reception desk that routes guests |
| **CNI** | Container Network Interface — plugin that wires pod networking (Calico, Flannel) | the cable team |
| **etcd** | Distributed key-value store — holds all cluster state | cluster's brain memory |
| **Fragmentation** | Total free resources exist but no single node has enough for a pod | bus seats free but not side-by-side |

---

### M5 — Sizing & Cost (`06-M5-sizing-and-cost.md`)

| Term | Definition | 🎓 Hook |
|------|-----------|---------|
| **Sizing / right-sizing** | Choosing the correct CPU/RAM/type for the workload | tailored clothes — not one-size-fits-all |
| **Instance family** | Group of instances optimized for a workload type (T/M/C/R/I/P/G) | different tools for different hunger |
| **Graviton (`g`)** | AWS ARM-based chip — ~20 % cheaper + better perf-per-$ | value chip |
| **Burstable (T)** | Credits-based burst; throttles when credits exhaust | prepaid mobile — runs out at peak |
| **CPU credits** | T-series burst budget that accrues at idle and drains under load | credit balance |
| **Requests** | Minimum resources guaranteed by the scheduler for a pod | reserved seat on the train |
| **Limits** | Maximum ceiling a pod may consume | "don't leave the room" |
| **Throttle** | CPU limit exceeded → pod slows down (stays alive) | 🐢 sluggish but not dead |
| **OOMKilled / exit 137** | RAM limit exceeded → kernel kills the pod | 💀 exit 137 = SIGKILL from OOM |
| **On-Demand** | Pay full price, no commitment | hotel walk-in rate |
| **Reserved / Savings Plans** | 1–3 year commit → 40–70 % discount | annual lease |
| **Spot** | Up to 90 % off; AWS can reclaim with 2-min notice | standby seat — may get bumped |
| **Headroom** | Leave ~20–30 % of node capacity unused (spikes, OS, restarts) | don't fill the pot to the brim |
| **VPA** | Vertical Pod Autoscaler — adjusts pod requests/limits automatically | chef getting a bigger pan |
| **EBS / gp3 / io2** | AWS block storage; gp3 = cost-effective baseline; io2 = high IOPS | disk speed dial |

---

### M6 — CI/CD (`07-M6-cicd.md`)

| Term | Definition | 🎓 Hook |
|------|-----------|---------|
| **CI (Continuous Integration)** | Automated build + test + package on every commit | factory QA line |
| **CD (Continuous Delivery/Deploy)** | Automated release + deploy after CI passes | delivery truck |
| **Pipeline** | Chain of automated steps from commit to production | assembly line |
| **Workflow** | GitHub Actions YAML file defining the pipeline | recipe for the assembly line |
| **Trigger (`on:`)** | Event that starts a workflow (push, PR, schedule) | doorbell |
| **Job** | Group of steps that run on one runner | one department's work |
| **Runner** | Machine (GitHub-hosted or self-hosted) that executes a job | rental workstation |
| **Step** | Single command or action inside a job | one task on the checklist |
| **`uses:`** | Reference to a pre-built Action from the marketplace | ready-made tool |
| **`run:`** | Raw shell command in a step | manual command |
| **Branch filter** | `branches: [main]` — workflow only fires on matching branches | main-gate filter |
| **Secrets** | Encrypted credentials stored in GitHub, injected at runtime | locker 🔐 |
| **`github.sha`** | Unique 40-char commit hash — ideal immutable image tag | exact fingerprint |
| **Test gate** | Step that runs tests; failure stops pipeline before deploy | quality checkpoint 🚦 |
| **Artifact** | Build output (image, binary, report) produced by CI | finished product off the line |
| **Manifest-update** | CI step that writes the new image tag into `k8s/*.yaml` + git-pushes | updating the menu, not serving the dish |
| **`GITHUB_TOKEN`** | Default short-lived token; GitHub won't re-trigger workflows from its pushes | built-in loop prevention |
| **`paths:` filter** | Trigger only when specific files change (loop-prevention layer 2) | "only ring the bell for the kitchen door" |
| **`[skip ci]`** | Commit message keyword that tells GitHub Actions to skip | "don't disturb" sign |
| **Matrix build** | One job definition fanned out to N parallel runners | photocopier × N |

---

### M7 — GitOps (`08-M7-gitops.md`)

| Term | Definition | 🎓 Hook |
|------|-----------|---------|
| **GitOps** | Git is the single source of truth; cluster continuously reconciles to match Git | menu = boss |
| **Argo CD** | Pull-based GitOps controller that syncs cluster to Git manifests | head-waiter who reads the menu 🧑‍🍳 |
| **Flux** | Alternative pull-based GitOps controller | same role, different chef |
| **Application (Argo)** | Argo CRD that tells Argo what repo/path/cluster/namespace to watch | job description given to Argo |
| **Synced** | Cluster state matches Git | ✅ in sync |
| **OutOfSync** | Cluster diverged from Git (drift detected) | ⚠️ mismatch |
| **Healthy** | Pods/resources are running correctly | 💚 all good |
| **Degraded** | Resources deployed but not working (pods crashing) | ❤️‍🩹 deployed but broken |
| **selfHeal** | Argo auto-reverts manual cluster changes back to Git state | drift → instant revert |
| **prune** | Deleting from Git → Argo also deletes from cluster | no orphans |
| **Rollback (`git revert`)** | Revert a Git commit; Argo re-deploys the previous state | time machine ↩️ |
| **Source of truth** | Git — what's in Git is what the cluster should look like | the one menu that matters |
| **branch = environment** | `main` → prod app, `staging` → staging app | one branch, one env |
| **Pull model** | Argo polls Git and applies; CI never touches the cluster | the restaurant polls the menu, menu doesn't call the chef |

---

### M8 — Observability & SRE (`10-M8-observability-sre.md`)

| Term | Definition | 🎓 Hook |
|------|-----------|---------|
| **Observability** | Ability to understand system internal state from external outputs | CCTV + fire alarm + feedback cards |
| **Metrics** | Numeric time-series measurements (CPU %, RPS, latency) | dials on a dashboard |
| **Logs** | Timestamped event records from apps and infra | diary entries |
| **Traces** | End-to-end request journey across services | bread-crumb trail |
| **Prometheus** | Pull-based metrics collection and storage | data collector who visits every machine |
| **Grafana** | Dashboard and visualization layer over metrics | the control-room screen |
| **Alertmanager** | Routes Prometheus alerts to Slack/email/PagerDuty | the person who calls you at 3 AM |
| **SLI** | Service Level Indicator — the metric you measure (e.g., latency p99) | the thermometer reading |
| **SLO** | Service Level Objective — the target (e.g., p99 < 200 ms) | the "acceptable temperature" range |
| **SLA** | Service Level Agreement — contractual commitment to customers | the written promise |
| **Error budget** | 100 % − SLO — how much "bad" you're allowed before burning budget | the forgiveness allowance |
| **MTTD** | Mean Time To Detect — how long until you know something broke | time to first alert |
| **MTTR** | Mean Time To Resolve — how long to fix after detecting | time from alarm to fix |

---

## The 5 Golden Threads — quick card

> These five ideas appear in every module. Understand them → everything else connects.
> Full narrative: [09-connected-system.md](09-connected-system.md)

| Thread | One-line summary | Where it shows up |
|--------|-----------------|-------------------|
| **1. Reconciliation** | "Declare what you want; the tool maintains it continuously" | TF `apply`, Ansible `state=present`, K8s controller, Argo selfHeal |
| **2. State outside compute** | "Precious data lives outside the disposable unit" | tfstate → S3, app state → RDS, K8s pods are cattle |
| **3. Preview before apply** | "Show me the trailer before the movie" | TF `plan`, Ansible `--check`, K8s `--dry-run`, CI test gate |
| **4. Push vs Pull** | "Who initiates the action — caller or callee?" | Ansible/Actions = push 📤; Argo = pull 📥; Git = handshake |
| **5. Idempotent** | "Safe to run N times; result is always the same" | TF apply, Ansible module, K8s desired-state, git revert |

---

## Concepts vs Tools

### The distinction

A **concept / property** describes *how something behaves*. A **tool** is the software artifact.
Interviewers penalize answers that say "Idempotency is Terraform" — idempotency is a *property*; Terraform *exhibits* it.

| Concept | What it is | Tools that exhibit it |
|---------|-----------|----------------------|
| **Idempotency** | Property — re-running an operation is safe; result unchanged | Terraform, Ansible modules, Kubernetes desired-state, Argo sync |
| **Reconciliation** | Process — a control loop that continuously detects and fixes drift | Kubernetes controllers, Argo CD (continuous); TF/Ansible (on-trigger only) |
| **Declarative** | Style — you specify *what*, the tool handles *how* | Terraform HCL, K8s YAML, Argo Application CRD |
| **Stateless / Stateful** | Property of an app — does it persist data internally? | Any app; not a tool |
| **Mutable / Immutable infra** | Operational approach — patch in-place vs replace | Ansible (mutable), Packer/Docker (immutable) |
| **Push / Pull delivery** | Architectural pattern — who initiates the sync? | Ansible = push; Argo CD = pull |

### Idempotent vs Reconciliation — one-line each

- **Idempotent** = "Re-running is safe." *You* trigger it. 🎓 Light switch — press again, still ON.
- **Reconciliation** = "A loop automatically fixes mismatches." *The tool* runs it. 🎓 Thermostat — senses and self-adjusts.
- **Key nuance:** Terraform is idempotent but does NOT continuously reconcile (drift only fixed when you run `apply`). Kubernetes and Argo CD do both — they reconcile continuously, 24/7, without you asking.

---

## Error / Status → Cause reflex table

> The single most useful page for on-call. See symptom, know where to look.

| Symptom | Probable cause | First check command |
|---------|---------------|---------------------|
| `UNREACHABLE` / connection timeout | Network: SG rule, route table, machine not started | `ping <ip>` / `curl -4 ifconfig.me` vs SG CIDR |
| `Permission denied (publickey)` | Wrong SSH key, wrong user, key not authorized | `ssh -i correct.pem ubuntu@<ip>` |
| `OOMKilled` / exit code `137` | Pod exceeded RAM limit; kernel sent SIGKILL | `kubectl describe pod <n>` → `OOMKilled`; raise `limits.memory` |
| `CrashLoopBackOff` | App is crashing repeatedly on startup | `kubectl logs <pod> --previous` |
| `Pending` (pod) | No node can satisfy: fragmentation, IP exhaustion, taint, nodeSelector mismatch | `kubectl describe pod <n>` → Events section |
| `ImagePullBackOff` | Wrong image tag, registry auth failed, ECR token expired | `kubectl describe pod <n>` → image name + pull-secret |
| `OutOfSync` (Argo) | Cluster state differs from Git | `argocd app diff <app>` |
| `READY 0/1` | Pod running but readiness probe failing | `kubectl describe pod` → readiness probe + `kubectl logs` |
| `TLS handshake timeout` (kubectl) | API server OOM-killed (low RAM node) | `free -h` on master node |
| `localhost:8080 connection refused` (kubectl) | `~/.kube/config` missing | `cp /etc/kubernetes/admin.conf ~/.kube/config` |
| `Throttling` / slow CPU | Pod hit CPU limit (`limits.cpu`) | `kubectl top pod` — if near limit, raise it or use C-family node |
| `Degraded` (Argo) | Resources synced but pods unhealthy | `kubectl get pods -n <ns>` → logs |
| `Synced` + pods down | Argo applied but app crashed (app bug, not GitOps issue) | `kubectl logs` / `kubectl describe` |
| `404 Not Found, nginx` (Ingress) | Host header not matching any Ingress rule | `curl -H "Host: myapp.example.com" http://<node-ip>/` |

---

## Quick Troubleshoot Reference

> Symptom-to-fix table from live lab failures (P1–P8). See [the Interview Bank war-stories](14-interview-bank.md).

| Symptom | Check command / location | Fix |
|---------|--------------------------|-----|
| `aws` not found on EC2 node | `which aws` | Generate ECR token on laptop; use node IAM role in prod |
| Billing spike after `terraform apply` | `instance_type` in `main.tf` | t3.micro = free-tier; k8s needs t3.medium+; use k3s on t3.micro |
| RDS `InvalidParameterValue` (password) | password string | Letters + numbers only — no `/`, `@`, `"`, space |
| SSH timeout after IP change | `curl -4 ifconfig.me` vs SG rule | Update `ssh_allowed_cidr` in tfvars + `terraform apply` |
| `kubectl` → `localhost:8080 refused` | `ls ~/.kube/config` | `cp /etc/kubernetes/admin.conf ~/.kube/config` |
| k3s `TLS handshake timeout` | `free -h` (RAM?) | Add 2 GB swap; `sudo swapon /swapfile && sudo systemctl restart k3s` |
| Swap gone after reboot | `cat /etc/fstab \| grep swap` | `echo '/swapfile none swap sw 0 0' \| sudo tee -a /etc/fstab` |
| Worker won't join cluster | IP used in `K3S_URL` | Use master's **private** IP (`10.0.x.x`), not public |
| ECR `ImagePullBackOff` on node | `kubectl get secret ecr-secret` | Recreate pull-secret (ECR tokens expire ~12 h) |
| CI push → "Permission denied" to repo | `permissions:` in workflow YAML | Add `permissions: contents: write` in yaml + enable in repo Settings → Actions |
| `sed: No such file` in CI manifest step | Filename of `k8s/*.yaml` vs loop variable | Rename manifests to match service names exactly |
| CI triggers infinite loop | workflow trigger config | Add `paths: ['services/**']` filter + `[skip ci]` in commit message |
| Argo pods `Pending`, kubectl slow | `free -h` | Argo needs ~1 GB; ensure swap (G5/G6); wait for swap pages |
| `kubectl apply` → `TLS timeout` (API stress) | API server under load | `kubectl apply --validate=false` (workaround, not best practice) |
| `selfHeal` not reverting drift | `selfHeal: true` in Application CRD? | Check `kubectl describe application -n argocd` |
| PVC / pod stuck `Pending` | `kubectl get sc` (StorageClass list) | Install local-path provisioner + patch as default SC + delete & recreate PVC |
| Browser shows "404 Not Found, nginx" on node IP | Host header | Map hostname in `/etc/hosts`; use `http://` not `https://`; `curl -H "Host:"` to test |
| RDS connection refused from pod | SG rule + password | Self-referencing SG rule for port 5432; letters-only password |

---

## Sizing quick-ref

> Teaching detail: [06-M5-sizing-and-cost.md](06-M5-sizing-and-cost.md)

### Instance family cheat sheet

| Family | Optimized for | CPU:RAM | Use when |
|--------|--------------|---------|----------|
| **T** (t3/t4g) | Burst | 1:2–4, variable | Dev, demo, low / spiky traffic — NOT steady high load |
| **M** (m5/m6/m7) | General / balanced | 1:4 | Default: web APIs, microservices, mixed workloads |
| **C** (c5/c6/c7) | Compute / CPU | 1:2 | Video encode, ML inference, batch, HPC |
| **R** (r5/r6/r7) | RAM / memory | 1:8 | Databases, in-memory cache, real-time analytics |
| **X** (x2) | Extreme RAM | 1:16+ | SAP HANA, giant in-memory datasets |
| **I** (i3/i4) | Storage I/O | 1:8 + NVMe | NoSQL, data warehouse, search clusters |
| **P/G** | GPU | — | ML training (P), ML inference / graphics (G) |

### Instance name decode

```
m  6  g  .  x large
│  │  │     └─ size ladder: medium < large < xlarge < 2xlarge < 4xlarge
│  │  └─ processor: g=Graviton/ARM (~20% cheaper), i=Intel, a=AMD
│  └─ generation: higher = newer, cheaper, faster → always prefer latest gen
└─ family: workload type (m=general, c=compute, r=memory, i=IO, t=burst)
```

### Size ladder (M family reference)

| Size | vCPU | RAM |
|------|------|-----|
| medium¹ | 1–2 | 4 GB |
| large | 2 | 8 GB |
| xlarge | 4 | 16 GB |
| 2xlarge | 8 | 32 GB |
| 4xlarge | 16 | 64 GB |

¹ `.medium` exists only on **T-series** (`t3.medium` = 2 vCPU / 4 GB) and **Graviton** (`m6g/m7g.medium` = 1 vCPU / 4 GB); `m5`/`m6i` start at `.large`. Pattern to remember: from `.large` up, each step **doubles** vCPU *and* RAM.

### Sizing formulas

```
# Per-pod
Pod CPU request    = avg_cpu_per_request × peak_concurrent_requests / replicas
Pod memory request = base_process_RAM + (per_connection_RAM × connections)
Pod limit          = request × 1.5 to 2   # spike headroom

# Per-node
Node RAM   = (pods_per_node × pod_RAM)  + 1.5 GB system + 0.5 GB kubelet/CNI
Node CPU   = (pods_per_node × pod_CPU)  + 0.5 vCPU system
Pods/node  = min(110, node_RAM/pod_RAM, node_CPU/pod_CPU, VPC_IP_limit)

# Node count
Total nodes = ceil(total_pods / pods_per_node) + 1   # +1 for HA buffer

# Postgres RAM
shared_buffers = RAM × 0.25
connections    = (core_count × 2) + spindle_count   # starting point
```

### 6 project profiles quick table

| Profile | Nodes | DB | Scaling | Est. monthly |
|---------|-------|-----|---------|-------------|
| Demo / learning | 2× t3.medium | RDS db.t3.micro | manual | ~$30–60 |
| Startup MVP | 2× m6g.large | RDS db.t3.small | HPA | ~$50–100 |
| Growing SaaS | 3–5× m6g.xlarge | RDS db.r6g.large Multi-AZ | HPA + Cluster Autoscaler | ~$500–1500 |
| High traffic | mixed m/c + spot batch | Aurora + read replicas | full autoscale + CDN | $5k–50k+ |
| ML / CPU batch | c6g.2xlarge / g5.xlarge | minimal + SQS queue | KEDA queue-depth | GPU-hours driven |
| Cache / analytics | r6g.xlarge+ | ElastiCache r6g | RAM-driven | RAM-cost driven |

### 10 golden rules

1. **Family first, size second.** Wrong family = no amount of tuning helps.
2. **Stateless → K8s pod. Stateful → managed service (RDS/ElastiCache).** Never run a production primary DB in a K8s pod.
3. **Default confused? → M family.** Balanced; migrate later after measuring.
4. **T-series = dev / low-traffic only.** Sustained high CPU exhausts credits → throttle. Use M/C/R for prod.
5. **Always latest generation + Graviton.** `m7g` > `m6g` > `m5`. ~20 % cheaper, faster.
6. **Estimate → Deploy → Measure → Right-size.** Never expect perfection on first pick. `kubectl top` + CloudWatch tell the truth.
7. **Headroom + HA always.** +1 node for failure buffer. Limits = 1.5–2× requests. Multi-AZ in prod.
8. **Over-provision > crash; right-size > over-provision.** Start safe, then tighten.
9. **Autoscale, don't manual-scale.** HPA (pods) + Cluster Autoscaler (nodes). Spiky traffic = non-negotiable.
10. **Spot = stateless only.** 70–90 % savings. Never for production primary databases.

---

## Command cheat-sheets

> One command, one line of purpose. Flag details in the module files.

### Terraform

```bash
terraform init                              # download providers + set up backend
terraform plan                              # preview changes — safe, reads state only
terraform plan -var="db_password=X"        # pass sensitive variable at plan time
terraform apply                             # execute the plan (creates/changes/destroys)
terraform apply -auto-approve              # skip confirmation (CI only)
terraform destroy                           # tear down all tracked resources
terraform output                            # print declared output values
terraform fmt                               # auto-format all .tf files
terraform validate                          # check syntax without calling provider
terraform state list                        # list all resources in state
terraform state show <resource>            # inspect one resource's state record
terraform import <resource.name> <id>      # bring existing resource under TF management
```

### Ansible

```bash
ansible all -i inventory.ini -m ping                        # connectivity check — first thing always
ansible all -i inventory.ini -m shell -a "uptime"          # ad-hoc command on all hosts
ansible webservers -i inventory.ini -m apt -a "name=nginx state=present" --become   # ad-hoc module
ansible-playbook -i inventory.ini site.yml                 # run a playbook
ansible-playbook -i inventory.ini site.yml --check         # dry-run (like terraform plan)
ansible-playbook -i inventory.ini site.yml --diff          # show line-by-line file diffs
ansible-playbook -i inventory.ini site.yml --limit master  # run only on the 'master' group
ansible-playbook -i inventory.ini site.yml --tags nginx    # run only tagged tasks
ansible-playbook -i inventory.ini site.yml -vvv            # verbose — shows SSH + module output
ansible-galaxy init my_role                                 # scaffold a new role directory structure
ansible-vault encrypt secrets.yml                          # encrypt a secrets file
ansible-vault edit secrets.yml                             # open encrypted file in editor
ansible-playbook site.yml --ask-vault-pass                 # run playbook with vault passphrase prompt
```

### Docker

```bash
docker build -t myapp:v1 .                          # build image from Dockerfile in current dir
docker build -t myapp:v1 ./app                      # build from subdirectory
docker run -d -p 8080:8000 myapp:v1                 # run detached, map host:container port
docker run -e DB_HOST=... myapp:v1                  # pass environment variable
docker ps                                            # list running containers
docker ps -a                                         # list all containers including stopped
docker logs <container>                              # stream stdout/stderr of a container
docker logs -f <container>                           # follow (tail -f) logs
docker exec -it <container> bash                    # open interactive shell in running container
docker images                                        # list local images
docker push <ecr_url>:v1                            # push image to registry
docker pull nginx:1.27                              # pull image from registry
docker tag myapp:v1 <ecr_url>:v1                   # tag image for a specific registry
docker system prune -f                              # remove stopped containers, dangling images
docker compose up -d                                 # start services defined in docker-compose.yml
docker compose down                                  # stop and remove compose services
```

### kubectl

```bash
kubectl get pods                                     # list pods in default namespace
kubectl get pods -n argocd                          # list pods in a specific namespace
kubectl get pods -A                                  # list pods in all namespaces
kubectl get pods -o wide                            # include node + IP in output
kubectl describe pod <name>                         # full detail including Events (debug first stop)
kubectl logs <pod>                                  # stdout of pod's main container
kubectl logs <pod> --previous                       # logs of the crashed previous container instance
kubectl logs <pod> -f                               # follow logs live
kubectl exec -it <pod> -- bash                      # open shell inside running pod
kubectl apply -f k8s/                               # apply all manifests in directory
kubectl apply -f deployment.yaml                    # apply single manifest
kubectl delete -f k8s/                              # delete resources defined in manifests
kubectl delete pod <name>                           # delete (K8s will recreate if Deployment)
kubectl scale deployment <name> --replicas=5        # manually scale a Deployment
kubectl rollout status deployment/<name>            # watch rolling update progress
kubectl rollout undo deployment/<name>              # roll back to previous ReplicaSet
kubectl top pods                                     # live CPU + RAM per pod
kubectl top nodes                                    # live CPU + RAM per node
kubectl port-forward svc/argocd-server -n argocd 8080:443   # tunnel service to localhost
kubectl get endpointslices                          # see which pod IPs a Service is routing to
kubectl auth can-i create pods --as=developer      # check RBAC permissions for a user
kubectl get events --sort-by='.lastTimestamp'       # chronological cluster events
kubectl get sc                                       # list StorageClasses (debug PVC Pending)
kubectl get pvc                                      # list PersistentVolumeClaims
kubectl create secret generic db-secret --from-literal=password=X   # create a secret
kubectl create secret docker-registry ecr-secret ...               # ECR pull secret
```

### Argo CD CLI

```bash
argocd app list                             # list all Argo CD Applications
argocd app get <app-name>                   # full status of one app (sync + health)
argocd app diff <app-name>                  # show diff between Git and cluster
argocd app sync <app-name>                  # manually trigger a sync
argocd app history <app-name>              # deployment history (Git SHAs)
argocd app rollback <app-name> <history-id> # roll back to a previous sync
argocd app set <app-name> --sync-policy automated   # enable auto-sync via CLI
```

### Git (ops-relevant subset)

```bash
git revert <commit-sha>                     # create a new commit that undoes a past commit — GitOps rollback
git revert HEAD                             # undo last commit (creates new revert commit)
git log --oneline                           # compact history — find the commit SHA to revert
git log --oneline -20                       # last 20 commits
git diff main...HEAD                        # all changes on current branch vs main
git diff HEAD~1                             # diff of last commit only
git checkout -b feature/my-feature         # create and switch to new branch
git merge feature/my-feature               # merge branch into current
git push -u origin main                     # push and set upstream tracking
```

---

## The 6 Universal Rules

> Cross-module truths. Violate any of these and something downstream breaks.

1. **Preview before apply** — TF `plan`, Ansible `--check`, K8s `--dry-run`, CI test gate. Blind apply = disaster.
2. **Idempotency is the goal** — Every config operation must be safe to re-run. If a step is not idempotent, fix it (use modules over `shell:`).
3. **Error type = problem location** — `UNREACHABLE` → network/machine. `Permission denied` → access/key. `syntax error` → your code. Don't fix the wrong layer.
4. **State outside, compute disposable** — Anything with state inside is a Pet; move state out and it becomes Cattle. Applies to apps, TF state, pods, CI runners.
5. **Error location ≠ root cause location** — Docker `RUN` fails because `COPY` was missing. K8s pod `Pending` because a node has fragmented resources. Check upstream.
6. **Stable things first, volatile things last** — Docker layers: deps above, code below. General design: what changes least goes first/higher in the stack.

---

## Master Recall Sheet

> 18-row rapid Q→A. Use for pre-interview 10-minute review.

| # | Question | Answer |
|---|----------|--------|
| 1 | 4 tools in order | Terraform → Ansible → Docker → Kubernetes |
| 2 | Why is a DB stateful? | Precious data lives inside — destroy = data lost |
| 3 | `plan` vs `apply` | plan = safe preview (no changes); apply = execute |
| 4 | 5 servers, run `apply` 3 times — how many servers? | 5 (idempotent: SET not +=) |
| 5 | Remote state needs two things | S3 (sharing) + DynamoDB lock (safety) |
| 6 | Drift vs lost state | Drift = reality changed, state intact; Lost = state file gone, TF is blind |
| 7 | Agentless — what does target need? | SSH + Python only |
| 8 | Ansible `changed` vs `ok` | changed = Ansible had to act; ok = already correct |
| 9 | Why handler + notify? | Restart only when something actually changed — no needless restarts |
| 10 | Image vs container | Blueprint (class) vs running instance (object) |
| 11 | Why deps above, code below in Dockerfile? | Code changes daily (only it rebuilds); deps rarely change (cache preserved) |
| 12 | `latest` tag in prod? | Never — mutable label; no rollback guarantee; use SHA or semver |
| 13 | Reconciliation in one sentence | Desired vs current, mismatch → auto-fix, continuously |
| 14 | Bare pod crashes — gets recreated? | No — no Deployment = no desired-state controller watching it |
| 15 | How pods are reached despite IP changes | Service (stable ClusterIP/DNS + label selector) |
| 16 | Why no app pods on master? | Taint `NoSchedule` — control plane does cluster thinking; workers do the work |
| 17 | Pod Pending with free cluster resources | Fragmentation / IP pool exhausted / taint mismatch / nodeSelector no-match |
| 18 | Actions push + Argo pull — what's in the middle? | Git — CI writes to Git, Argo reads from Git. Git = handshake / source of truth |

---

## Memory hooks index

> Analogy → concept → module. See one, recall the other.

| Analogy 🎓 | Concept | Module |
|-----------|---------|--------|
| Pet 🐶 (name, fix, can't replace) | Stateful — data lives inside | M0 |
| Cattle 🐄 (replace, don't fix) | Stateless — nothing valuable inside | M0 |
| Restaurant: builder / setup / packer / manager | Terraform / Ansible / Docker / K8s | M0 |
| Diary 📔 | Terraform state (`tfstate`) | M1 |
| Reading the bill 🧾 | `terraform plan` | M1 |
| Paying 💳 | `terraform apply` | M1 |
| Taala 🔒 | DynamoDB state lock | M1 |
| Menu same, chef swapped the dish | Drift (state intact, reality changed) | M1 |
| Diary burned → re-ordered everything twice | Lost state → orphaned + duplicate resources | M1 |
| Plumber: visits, does work, leaves no copy | Ansible agentless (SSH only) | M2 |
| Bell 🔔 (rings only when something changed) | `notify` → handler fires only on `changed` | M2 |
| Recipe 📜 vs Dish 🍛 | Docker image vs container | M3 |
| Game save-point 💾 | Docker layer cache | M3 |
| Crack propagates downward from the changed floor | Cache invalidation: change → all below rebuilt | M3 |
| Lying sticky note | `latest` tag — mutable, untrustworthy | M3 |
| Tiffin 🍱 (manager carries it, doesn't know the food) | Pod — smallest K8s unit | M4 |
| Chowkidar counting pods at 2 AM | Reconciliation loop — never sleeps | M4 |
| Fixed phone number ☎️ | Service — stable IP despite pod IP churn | M4 |
| No-Entry board 🚷 | Taint on master node (`NoSchedule`) | M4 |
| VIP pass | Toleration — pod allowed past the taint | M4 |
| Traffic light 🚦 | Readiness probe | M4 |
| Heartbeat 💓 | Liveness probe | M4 |
| Bus seats free but not adjacent | Fragmentation — pod Pending despite total free resources | M4 |
| Tailored clothes — not one-size | Right-sizing | M5 |
| Reserved seat vs "don't leave the room" | requests (guaranteed min) vs limits (max ceiling) | M5 |
| 🐢 slows down | Throttle — CPU limit hit, pod alive but slow | M5 |
| 💀 exit 137 | OOMKilled — RAM limit hit, kernel killed pod | M5 |
| Prepaid mobile credits | T-series CPU credits | M5 |
| Menu-writer vs head-waiter | Actions (push) vs Argo (pull) | M6 / M7 |
| Git = the one menu that matters | Source of truth | M6 / M7 |
| Time machine ↩️ | `git revert` + Argo auto-redeploy | M7 |
| CCTV + fire alarm + feedback cards | Observability: metrics + logs + traces | M8 |
| The forgiveness allowance | Error budget (100 % − SLO) | M8 |

---

*Cross-references: [01-M0-foundations.md](01-M0-foundations.md) · [02-M1-terraform.md](02-M1-terraform.md) · [03-M2-ansible.md](03-M2-ansible.md) · [04-M3-docker.md](04-M3-docker.md) · [05-M4-kubernetes-core.md](05-M4-kubernetes-core.md) · [06-M5-sizing-and-cost.md](06-M5-sizing-and-cost.md) · [07-M6-cicd.md](07-M6-cicd.md) · [08-M7-gitops.md](08-M7-gitops.md) · [09-connected-system.md](09-connected-system.md) · [10-M8-observability-sre.md](10-M8-observability-sre.md) · [14-interview-bank.md](14-interview-bank.md)*
