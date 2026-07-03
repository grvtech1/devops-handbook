# 14 — Interview Bank
### The consolidated interview-prep hub for a 2.5–3 year DevOps engineer

> Sources: DevOps_Study_Guide_1 · Terraform-Modules-DeepDive · Capstone-DeepDive-Internals-v2 · Capstone-DeepDive-v3-Additions · Capstone-LabGotchas · DevOps-Glossary · DevOps-Master-Recall · DevOps-Bootcamp-Notes · DevOps-Beginner-FAQ

---

## How to use this bank

**Before the interview:** skim topic headers, then drill the reflex tables until they fire without thinking. The war stories (section 12) are ready-to-tell STAR answers — personalize the pronouns.

**Difficulty tags:** `[Jr]` = expected from anyone with 1 yr experience · `[Mid]` = your sweet spot at 2.5 yrs · `[Sr]` = shows depth, use when the interview goes deep.

**The one-line system view** (memorize this): "Code is pushed, CI/CD builds and tests it and produces a Docker image in a registry, then Argo CD picks it up from Git and deploys it to Kubernetes, with monitoring watching the whole thing."

**Module cross-links** appear as (→ 02-M1) etc. The reflex tables below are the highest-value page in this chapter — they are the 2 a.m. recall aid.

---

## The reflex tables

### Error / status → cause (fire this without thinking)

| What you see | Root cause | First command |
|---|---|---|
| `UNREACHABLE` / timeout | Network unreachable — machine down or SG/firewall blocking | `ping`, `curl -v`, check SG rules |
| `Permission denied` | Wrong key, wrong user, or missing sudo | `ssh -i <key>`, check `ansible_user` |
| `OOMKilled` / exit `137` | RAM limit exceeded; kernel killed the process | `kubectl describe pod` → `OOMKilled`; raise `limits.memory` |
| `CrashLoopBackOff` | Container starts then crashes, kubelet retrying with backoff | `kubectl logs <pod> --previous` |
| `Pending` (pod) | Scheduler can't place it — insufficient CPU/RAM, IP exhaustion, or taint mismatch | `kubectl describe pod` → Events |
| `ImagePullBackOff` | Image not found or registry auth failed | `kubectl describe pod` → check tag + pull-secret |
| `READY 0/1` | Container running but readiness probe failing → not in EndpointSlice | `kubectl describe pod` → probe events |
| `OutOfSync` (Argo) | Cluster state diverged from Git | `argocd app diff <app>` |
| `localhost:8080 connection refused` (kubectl) | `~/.kube/config` missing — kubectl fell back to insecure port | `cp /etc/kubernetes/admin.conf ~/.kube/config` |
| `TLS handshake timeout` (kubectl) | API server OOM-killed; node RAM exhausted | `free -h`; add swap + `systemctl restart k3s` |
| `sed: No such file` (CI) | Filename mismatch between script and actual file | Rename `k8s/<service>.yaml` to match CI loop |
| `IP pe 404 nginx` (ingress) | Ingress alive; no Host header match | `/etc/hosts` entry + `curl -H "Host:"` |

### Diagnose-from-symptom primer

> "Never guess — narrow the blast radius layer by layer."
> Network → Auth → App → Config. Or for K8s: outside-in — NodePort → Service → EndpointSlice → Pod → DB.

---

## Foundations & systems thinking

**Q: Walk me through a deploy from `git push` to traffic. `[Jr/Mid]`**

I push code to `main`. GitHub Actions triggers: checks out the repo, runs tests, builds a Docker image tagged with the commit SHA, pushes it to ECR. The pipeline then updates the image tag in `k8s/deployment.yaml` and commits that back to Git with `[skip ci]` to avoid a loop. Argo CD polls Git every 3 minutes, detects OutOfSync, and applies the manifest. Kubernetes does a rolling update — new pods must pass the readiness probe before old ones are removed. Zero downtime if both graceful shutdown and readiness are configured correctly.

**Q: Monolith vs microservices — how do you decide? `[Mid]`**

Monolith is one deployable unit — simpler to develop and debug, lower operational overhead. Microservices are independently deployable, independently scalable services communicating over the network. I'd choose microservices when services have genuinely different scaling characteristics, different release cadences, or different team ownership. I've seen people split too early and end up with a "distributed monolith" — the complexity of services with none of the isolation benefits. Start monolith, extract services when you feel the pain.

**Q: Pets vs cattle — give me a real example from your project. `[Jr]`**

Pets are servers you name and care for; if one gets sick you fix it. Cattle are interchangeable; if one fails you replace it. In our project, app pods are cattle — the Deployment controller replaces them automatically. The RDS database is a pet (stateful, managed separately with backups). The golden rule: extract state out of compute so compute becomes cattle.

**Q: Two reconciliation loops in your system — name them and contrast. `[Mid/Sr]`**

Kubernetes controllers run a continuous desired-vs-actual loop: if a pod crashes, the ReplicaSet controller detects the gap and creates a replacement. Argo CD runs the same pattern but against Git as the desired state: if the live cluster diverges from what's in Git, Argo applies the Git version. The difference is the source of desired state — etcd for K8s, Git for Argo. Terraform is also idempotent but does NOT continuously reconcile; you trigger `terraform apply` manually.

**Q: Design process — if asked to design "a URL shortener on AWS", how do you approach it? `[Mid/Sr]`**

Six steps: (1) Requirements — read vs write ratio, expected QPS, latency SLA, durability needs. (2) Component breakdown — API, storage, redirect logic. (3) Tool per component — managed vs self-managed. (4) Draw the request flow end to end. (5) Failure-think — what happens if the DB is down? If the API crashes? (6) Start simple, iterate. I'd avoid over-engineering before understanding load. Commands and code come last; design and decision-making come first.

> "Commands AI/Google de dega — DESIGN + DECIDE = engineer." (→ 01-M0-foundations.md)

---

## Terraform

> (→ 02-M1-terraform.md · Terraform-Modules-DeepDive.md)

**Q: What is Terraform state and why does it matter? `[Jr]`**

`tfstate` is Terraform's diary — a JSON file mapping your HCL resource blocks to real cloud resource IDs. Without it Terraform is blind; it can't tell what already exists. This is why you never delete it carelessly and never commit it to Git (it may contain plaintext secrets like DB passwords). In a team context the state goes in S3 with a DynamoDB lock so two engineers can't run `apply` simultaneously and corrupt it.

**Q: Drift vs lost-state — what's the difference? `[Mid]`**

Drift: the state file is intact, but reality changed outside Terraform (someone edited a security group in the console). `terraform plan` detects it and will revert the manual change on next apply. Lost-state: the `tfstate` file is gone. Terraform is now blind — it sees your `.tf` files but has no record of existing resources. Running `apply` creates duplicates. Recovery is `terraform import` — re-register each real resource into a new state file one by one.

> ❌ Don't say: "I'd just re-run `apply`" when state is lost — it creates duplicate infrastructure.
> ✅ Say: "I'd use `terraform import` to reconstruct state resource-by-resource."

**Q: How do you manage multiple environments (dev, prod) in Terraform? `[Mid]`**

Modules plus environment directories. I write reusable modules (`modules/vpc`, `modules/ec2`, `modules/rds`) — each is a black box taking inputs and producing outputs. Then `environments/dev/main.tf` and `environments/prod/main.tf` call those same modules with different variable values. Each environment directory has its own remote backend key (`microshop/dev/terraform.tfstate` vs `microshop/prod/terraform.tfstate`) so a `terraform destroy` in dev can't touch prod. (→ Terraform-Modules-DeepDive.md)

**Q: Module wiring — how does one module's output reach another? `[Mid]`**

Modules don't talk to each other directly. The root `main.tf` orchestrates: `module.vpc.sg_id` is passed as an input variable into `module.ec2`. The output is declared in `modules/vpc/outputs.tf` and referenced from the root with `module.vpc.<output_name>`. Attempting to reference `module.vpc.subnet_id` when the output is named `subnet_public_a_id` silently fails with a "no such output" error — the most common wiring mistake. (→ Terraform-Modules-DeepDive.md)

**Q: Remote backend — what's S3 + DynamoDB for? `[Jr/Mid]`**

S3 stores the shared state file so the entire team reads the same truth (not a local laptop copy). DynamoDB provides locking: when `terraform apply` starts it writes a lock record; a second concurrent apply sees the lock and waits. Without the lock two simultaneous applies can corrupt state. Terraform 1.10+ supports native locking via S3, but DynamoDB is the battle-tested pattern.

**Q: "tfstate gayi — 5 servers are running. I run apply. How many servers now?" `[Jr]`**

Ten. Lost state means Terraform has no memory of the existing 5, so it creates 5 more. Always keep state backed up (S3 versioning on the bucket) and never delete it manually.

---

## Ansible

> (→ 03-M2-ansible.md)

**Q: What is Ansible and why is agentless a feature? `[Jr]`**

Ansible is a configuration management and automation tool that configures servers by running tasks over SSH in YAML playbooks. Agentless means nothing is installed on managed nodes — only SSH and Python (already present on most Linux hosts). This eliminates the operational burden of maintaining agent software, version-matching it to the server OS, and securing it. Compare with Puppet/Chef where every node runs a persistent agent process.

**Q: What is idempotency and why does it matter for operations? `[Jr/Mid]`**

An idempotent operation produces the same result whether it runs once or one hundred times. Ansible modules check current state before acting: if nginx is already installed, `apt: name=nginx state=present` does nothing and returns `ok`. This matters because I can safely re-run a playbook to repair drift, enforce a baseline after an incident, or include it in a CI pipeline without side effects. A raw Bash script lacks this — it re-executes blindly and can corrupt state.

**Q: Handlers — why bother? `[Mid]`**

A handler is a task that fires only when notified by a `changed` result in another task. The canonical use is restarting a service only when its config file actually changed. If the config is unchanged, the `copy` or `template` task returns `ok`, the notify never fires, and the service runs uninterrupted. Without handlers you'd restart nginx on every playbook run — wasteful and potentially disruptive.

**Q: Ansible module vs shell module — when would you use `shell:` and why is it risky? `[Mid]`**

I use purpose-built modules (`apt`, `copy`, `service`, `template`) wherever possible because they are idempotent — they check state before acting. The `shell:` and `command:` modules are blind executors: they run the command every time, with no state checking. `echo "config" >> /etc/app.conf` with shell runs on every playbook execution and keeps appending, corrupting the file. If no module exists for a task, I add `creates:` or `changed_when:` guards to restore idempotent behaviour.

**Q: Ansible vs Terraform — in one sentence each. `[Jr]`**

Terraform provisions infrastructure — it creates the cloud resources (EC2, VPC, RDS). Ansible configures what's inside those servers — it installs software, deploys app code, writes config. Terraform builds the house; Ansible furnishes it.

**Q: When would you NOT use Ansible in a modern stack? `[Sr]`**

When the configuration belongs in the Docker image (immutable infra pattern) rather than applied at runtime. In a fully containerized Kubernetes environment, much of what Ansible used to do — install runtimes, copy app binaries, write config — is baked into the image at build time. Ansible remains valuable for host-level bootstrapping (installing containerd, running kubeadm), VM-based fleets, network gear, and any work that must happen at the OS level before containers launch.

**Q: How do you manage secrets in Ansible? `[Mid]`**

Ansible Vault — I encrypt the sensitive file or variable (`ansible-vault encrypt secrets.yml`) and supply the vault password at runtime via `--ask-vault-pass` or a password file. The encrypted YAML is safe to commit to Git. I never store plaintext credentials in inventory or playbooks.

---

## Docker

> (→ 04-M3-docker.md)

**Q: Container vs VM — the core technical difference. `[Jr]`**

A VM virtualizes hardware and runs a full guest OS with its own kernel on top of a hypervisor — separate foundation. A container shares the host kernel and isolates at the process level using Linux namespaces (isolation) and cgroups (resource limits). Containers are lighter (MBs not GBs), start in seconds, and you can run far more per host. VMs give stronger isolation; containers give speed and density.

**Q: Image vs container. `[Jr]`**

An image is a read-only, immutable template built from a Dockerfile — each instruction creates a cached layer. A container is a running (or stopped) instance of an image with a thin writable layer on top. One image, many containers. Delete a container and its writable layer is gone; the image is untouched.

**Q: What are layers and why does their order matter? `[Mid]`**

Every Dockerfile instruction creates a layer. Layers are cached: if a layer hasn't changed, Docker reuses the cached version and all layers above it rebuild. I put rarely-changing instructions first (base image, dependency install) and frequently-changing ones last (COPY source code). This way a code change doesn't invalidate the dependencies layer — CI build time drops from minutes to seconds.

**Q: How do you reduce image size? `[Mid]`**

Multi-stage builds (compile in a full-toolchain stage, copy only the artifact into a minimal runtime stage), small base images (alpine or distroless), combining `RUN` commands to reduce layer count, `.dockerignore` to keep build context clean, and never installing packages that aren't needed at runtime. Build tools can triple the image size — they have no business in a production image.

**Q: Why is tagging with `latest` dangerous in production? `[Mid]`**

`latest` is mutable — the same tag can point to different image content over time. Rollback becomes ambiguous ("which latest?"), audit trails break, and reproducible deployments are impossible. I tag images with the commit SHA (`github.sha`) so every deployed image is traceable to an exact commit. For absolute immutability, pin to the digest (`@sha256:...`) — the tag can be moved, the digest never can.

**Q: A container exits immediately after starting. Debug it. `[Jr/Mid]`**

First: `docker logs <name>` to see stderr. Second: `docker ps -a` for the exit code. Common causes — the main process exited (a container lives only as long as its PID 1), a missing environment variable caused a startup crash, or the CMD/ENTRYPOINT is wrong. I'd then `docker run -it <image> sh` to shell into the container interactively with an overridden entrypoint and poke around.

**Q: CMD vs ENTRYPOINT — practical difference. `[Mid]`**

`ENTRYPOINT` is the fixed executable that always runs. `CMD` provides default arguments and is easily overridden by `docker run ... <args>`. The common pattern: `ENTRYPOINT ["python"]` + `CMD ["app.py"]` runs `python app.py` by default but lets you do `docker run <image> -c "print(1)"` to override just the args. If you define only `CMD`, the whole command can be replaced.

---

## Kubernetes

> (→ 05-M4-kubernetes-core.md · 11-M9-advanced-k8s-internals.md)

**Q: How does reconciliation actually work — is there a master loop? `[Mid/Sr]`**

No. K8s uses distributed, level-triggered controllers — each watching etcd (via the apiserver) for its resource type. The Deployment controller compares desired spec vs actual status; if they differ it acts. Crucially, this is level-triggered not edge-triggered: even if an event is missed, the next poll sees the current state and corrects any gap. This is what makes K8s self-healing — the loop runs continuously, 24/7, with no central coordinator.

**Q: Walk me through what happens when I run `kubectl apply -f deployment.yaml`. `[Mid]`**

(1) kubectl sends the manifest to the apiserver. (2) apiserver validates it and writes the desired Deployment to etcd. (3) Deployment controller detects a new Deployment and creates a ReplicaSet. (4) ReplicaSet controller sees 0 pods vs desired 2 and creates 2 Pod objects in etcd. (5) Scheduler assigns each unscheduled pod to a node. (6) kubelet on each assigned node pulls the image via containerd and starts the container. (7) kubelet reports status back to the apiserver, which updates etcd.

**Q: Only one component talks to etcd directly. Which one, and why? `[Sr]`**

The apiserver. All other components — scheduler, controller-manager, kubelets — communicate with etcd exclusively through the apiserver. This centralizes auth, validation, admission control, and audit logging. If etcd is the cluster's brain, the apiserver is the only door to it. (→ 11-M9-advanced-k8s-internals.md)

**Q: Readiness vs Liveness probe — and when do you need Startup? `[Mid]`**

Readiness asks "is this pod ready to receive traffic?" Fail → pod is removed from the EndpointSlice, traffic stops, but the pod is not restarted. Liveness asks "is this process healthy or deadlocked?" Fail → kubelet restarts the container. Startup probe is needed for slow-boot applications: it holds liveness checks until the app finishes booting, preventing liveness from killing an app that just hasn't started yet. Without it, a 30-second startup time causes a CrashLoopBackOff. `[Mid]`

> ❌ Don't say: "Readiness and liveness are the same thing."
> ❌ Don't say: "Liveness failure stops traffic." It RESTARTS. Readiness stops traffic.

**Q: Liveness footgun — what's the most dangerous liveness probe mistake? `[Sr]`**

Checking an external dependency (like the database) in the liveness probe. If the DB has a brief slowdown, every pod's liveness probe times out simultaneously. kubelet restarts all pods at once. The restarting pods reconnect, adding more load to the already-stressed DB. The DB slows further. Loop. A minor DB blip becomes a full application outage. The rule: **liveness checks only the process itself** (deadlock detection, in-process flag). Dependency health checks go in readiness — a readiness failure stops traffic but doesn't restart and escalate.

**Q: Pod Running but zero traffic. Debug it. `[Mid]`**

`kubectl get endpointslices` — is the pod's IP listed? If not: (a) check readiness probe — `kubectl describe pod` → probe failure events; (b) check label/selector mismatch — `kubectl describe svc` selector vs `kubectl get pod --show-labels`. The service never routes directly; it routes via the EndpointSlice which only lists READY pods. Fix the readiness probe or the labels and the IP appears automatically.

**Q: What are QoS classes and who dies first when a node runs out of RAM? `[Mid/Sr]`**

K8s assigns a QoS class based on requests/limits: **Guaranteed** (requests == limits for both CPU and RAM), **Burstable** (requests < limits, or only some set), **BestEffort** (nothing set). Under memory pressure, the OOM killer evicts BestEffort first, then Burstable, then Guaranteed last. Critical workloads should be Guaranteed — set `requests.memory == limits.memory`. (→ 06-M5-sizing-and-cost.md)

> ❌ Don't say: "The pod using the most RAM dies first." QoS class is the primary factor.

**Q: HPA — what does it need to work, and why is scale-down slow? `[Mid]`**

HPA needs `metrics-server` installed (provides CPU/RAM metrics) and pod `requests` set (the % calculation has no baseline without them). Formula: `desiredReplicas = ceil(currentReplicas × currentMetric/targetMetric)`. Scale-up is fast because under-provisioning immediately hurts users. Scale-down uses a stabilization window (default 5 minutes) to prevent flapping — if load spikes briefly and you scale down immediately, you'd need to scale up again seconds later. `[Mid]`

> ❌ Don't say: "HPA scales nodes." HPA scales pods. Cluster Autoscaler scales nodes.

**Q: Pod DNS — how does one pod find another? `[Mid]`**

CoreDNS (running in `kube-system`) resolves service names to ClusterIPs. The FQDN is `<service>.<namespace>.svc.cluster.local` but within the same namespace just `<service>` works. Each pod's `/etc/resolv.conf` is set by kubelet to point to the CoreDNS Service IP. The app should use the service name (`DB_HOST=url-shortener-db`), never a pod IP — pod IPs are ephemeral and change on every restart.

**Q: Graceful shutdown — why do requests sometimes fail during a rolling update? `[Sr]`**

There's a race condition between two async events: (1) the pod being removed from the EndpointSlice (so new traffic stops) and (2) the SIGTERM being sent to the container. If SIGTERM arrives before the slice update propagates to kube-proxy, traffic keeps arriving at a pod that is shutting down and drops those requests. The fix: `preStop: exec: command: ["sleep", "5"]` — give slice propagation a head start — plus the application must handle SIGTERM gracefully (drain in-flight, reject new). (→ 11-M9-advanced-k8s-internals.md)

**Q: Public vs private subnet — what's the actual technical difference? `[Jr/Mid]`**

The route table. A public subnet has a route `0.0.0.0/0 → igw-xxxx` (internet gateway). A private subnet does not — it has only the VPC-local route, plus optionally a NAT gateway route for outbound-only internet. The name "public" or "private" is a label; the route table is the reality.

**Q: SG stateful — practical meaning? `[Jr]`**

A Security Group tracks connection state. If you allow inbound port 443, the return traffic (the response) is automatically allowed without a separate egress rule. NACL (Network Access Control List) is stateless — you must explicitly allow both directions. SG = connection-aware, NACL = packet-by-packet.

**K8s rapid-fire table** (Jr/Mid/Sr tags)

| Q | One-line answer | Tag |
|---|---|---|
| Reconciliation = master loop? | No — distributed, level-triggered per-controller | Sr |
| Only who talks to etcd? | apiserver | Sr |
| etcd gone → what happens? | Cluster amnesia — all reads/writes fail | Sr |
| Control-plane HA quorum? | Odd number (3 or 5) for Raft | Sr |
| CNI/Calico does what? | Cross-node pod-to-pod flat networking | Mid |
| No CNI installed → ? | Pods Pending, nodes NotReady | Jr |
| Why `swapoff` for kubelet? | Predictable memory for QoS/eviction math | Mid |
| `kubeadm join` token TTL? | 24 hours; `kubeadm token create` for new one | Mid |
| Service ClusterIP → how traffic reaches pod? | kube-proxy iptables/IPVS rules per EndpointSlice | Mid |
| `iptables` vs `IPVS` mode? | O(n) vs hash-based — IPVS for large clusters | Sr |
| `READY 0/1` means? | Running but readiness fail — not in EndpointSlice | Jr |
| Rolling update zero-downtime guarantee? | Only if readiness + graceful shutdown both correct | Sr |
| `maxSurge`/`maxUnavailable` | Extra pods temporarily allowed / pods allowed down | Mid |
| Argo desired state source? | Git (not etcd) | Jr |
| `kubectl edit` on a selfHeal app? | Argo reverts it within 3 min | Mid |
| StatefulSet vs Deployment | StatefulSet: stable network ID + persistent volume per pod | Mid |

---

## CI/CD

> (→ 07-M6-cicd.md)

**Q: CI vs CD vs Continuous Deployment — the distinction. `[Jr]`**

CI (Continuous Integration) automatically builds and tests every commit so integration issues surface immediately. CD is ambiguous — Continuous Delivery means every build is always deployable but a human approves the production push; Continuous Deployment removes that human gate and ships to production automatically on every green build. In interviews, clarify which you mean.

**Q: How do you handle secrets in a pipeline? `[Jr/Mid]`**

Store them in the platform's secret store — GitHub repo secrets or GitLab CI/CD variables — never in YAML or code. They're injected at runtime as masked environment variables. I scope each secret to the minimum privilege required and rotate them on a schedule or whenever a team member leaves.

**Q: Your pipeline passes locally but fails in CI — why? `[Mid]`**

Typically: missing environment variables that exist on your laptop but aren't declared in CI, version differences (your Node 20 vs CI's Node 18), reliance on locally-cached files, or a service (DB, cache) available locally but not in the ephemeral runner. Fix: containerize the build step, declare all dependencies explicitly, and make the test environment self-contained.

**Q: How do you pass build output between pipeline jobs? `[Jr]`**

Artifacts. A job publishes files (compiled binary, Docker image manifest) and later jobs download them. Caches are for reusable dependencies to speed runs (e.g. `node_modules`); artifacts are build outputs that flow forward. Don't confuse them — a cache miss is a slower build; a missing artifact is a broken pipeline.

**Q: The CI manifest-update loop trap — how do you prevent it? `[Mid/Sr]`**

Two-layer defense: (1) `paths` filter — trigger the workflow only on changes under `services/**`, not `k8s/**`; the manifest commit touches `k8s/` and therefore doesn't re-trigger. (2) Append `[skip ci]` to the manifest update commit message as a belt-and-suspenders fallback. One layer alone can fail; both together is production-safe. (→ G10 war story)

**Q: Matrix builds — why use them for multiple services? `[Mid]`**

A matrix strategy fans out one job definition to N parallel runners simultaneously. Building 3 Docker images sequentially takes 3× the wall-clock time. With a matrix, all 3 run in parallel — total wall-clock is only as long as the slowest service. Same compute cost, dramatically less latency to a green pipeline.

**Q: Why tag images with the commit SHA? `[Jr]`**

Every deployed image is traceable to an exact commit. Rollback is unambiguous — revert the Git commit and Argo deploys the old SHA. Auditors can answer "what was running in prod at 14:00?" with a `git log`. The `latest` tag can't give any of this.

---

## GitOps / Argo

> (→ 08-M7-gitops.md · 09-connected-system.md)

**Q: Push-based deployment vs GitOps pull model — security difference. `[Mid/Sr]`**

Push: the CI system has cluster credentials (kubeconfig or cloud IAM) and runs `kubectl apply` directly. If CI is compromised, the cluster is compromised. Pull: Argo CD runs inside the cluster and watches Git. The cluster credentials never leave the cluster — CI only pushes a YAML file to a Git repo. The blast radius of a compromised CI system drops dramatically.

**Q: OutOfSync — name two causes and how you'd tell them apart. `[Mid]`**

Cause A: CI pushed a new image tag to Git — Argo detects the diff and applies it (desired outcome). Cause B: someone ran `kubectl edit` or `kubectl scale` directly on the cluster — Argo detects the drift and with `selfHeal: true` reverts it within 3 minutes. You can tell them apart with `argocd app diff <app>` — it shows exactly which fields diverge.

**Q: selfHeal on, you need to hotfix prod right now. What do you do? `[Sr]`**

Never edit the cluster directly — Argo will revert it within one reconcile cycle. The only correct path in a GitOps system is to push a commit to Git (even if it's a quick PR merged with approval shortcuts). This preserves audit history, and the rollback is also a Git operation (`git revert`). The only safe emergency escape hatch is temporarily disabling selfHeal in the Argo app, making the fix, then re-enabling — but that should be rare and tracked.

**Q: Rollback in GitOps. `[Mid]`**

`git revert <bad-commit>` — this creates a new commit reverting the change. Git history stays intact, Argo detects the new desired state, and deploys the previous good version. Compare to imperative rollback: `kubectl rollout undo` works but leaves no Git trace — next Argo sync would push the new broken version again.

**Q: Argo 3-way diff — what are the three sources? `[Sr]`**

Git manifest (desired), live cluster state (actual), and last-applied configuration (what was last synced). The three-way diff enables Argo to distinguish between "this field was in Git and then removed" vs "this field was added manually" — enabling `prune` (delete Git-removed resources) and `selfHeal` (revert manual cluster edits) to work correctly.

---

## Sizing, cost & capacity

> (→ 06-M5-sizing-and-cost.md)

**Q: OOMKilled / exit 137 — what happened, what do you do? `[Jr]`**

The container exceeded its `limits.memory` and the Linux OOM killer terminated it. Exit code 137 = killed by signal 9. First: check actual peak memory usage with `kubectl top pods` to understand the real footprint. Then either raise the limit to match reality or profile the app for a memory leak. Do not raise limits blindly without understanding the usage pattern.

**Q: A pod is Pending. Three reasons and how you'd diagnose each. `[Mid]`**

(1) Insufficient CPU/RAM — no node has enough headroom to fit the pod's `requests`. Check: `kubectl describe pod` → "Insufficient cpu/memory" in Events; `kubectl describe nodes` for available capacity. (2) IP address exhaustion — the node's pod subnet is full (e.g. a `/28` has only 11 usable IPs). Check: `kubectl describe pod` → "Failed to allocate a nodeIP". (3) Taint mismatch — the pod lacks a toleration for a taint on all nodes. Check: `kubectl describe pod` → "node(s) had taints that the pod didn't tolerate".

**Q: When would you use Spot instances and what's the safety rule? `[Mid]`**

Spot instances are 70–90% cheaper but can be reclaimed by AWS with 2 minutes' notice. Safe uses: stateless workloads with tolerations for spot node taints — batch jobs, CI runners, stateless app pods that K8s will reschedule. Never use Spot for: databases, stateful workloads, or anything that can't survive a sudden node termination. The rule: state is on stable nodes (or managed services like RDS); compute is on Spot.

**Q: Requests vs limits — what happens when you hit each ceiling? `[Jr]`**

`requests` is the CPU/RAM amount the scheduler uses to place the pod — it's guaranteed headroom. `limits` is the ceiling. CPU: hitting the limit causes throttling (the process slows, not killed). RAM: hitting the limit causes OOMKilled (the process is killed, exit 137). A CPU-throttled app is slow; a RAM-OOMKilled app restarts — very different failure modes.

**Q: Node fragmentation — what is it and how do you detect it? `[Sr]`**

Fragmentation is when the cluster has total free capacity but no single node has a large enough contiguous block to fit a new pod's `requests`. For example: 10 nodes each with 200m CPU free, but you need a pod requiring 500m. Total free = 2 CPU, but the pod can't fit anywhere. Detect with `kubectl describe nodes` showing per-node allocatable vs requests. Fix: right-size pods downward, or add a node. This is also why Pending pods don't always mean cluster is out of resources.

---

## Observability & SRE

> (→ 10-M8-observability-sre.md)

**Q: Why is p99 latency more important than average latency? `[Mid]`**

The average hides tail latency. If 99 out of 100 requests take 50ms but 1 takes 2 seconds, the average might be 70ms — acceptable. But that 1% is a real user having a terrible experience, and at scale (10,000 RPS) it's 100 users per second. p99 (the 99th percentile) surfaces those outliers. Alert on p99 and p95; use the average only for capacity trending.

**Q: SLI vs SLO vs error budget. `[Mid]`**

SLI (Service Level Indicator): the measured metric — e.g. "% of requests that returned 2xx within 300ms". SLO (Service Level Objective): the target — "99.9% of requests meet the SLI over a rolling 30-day window". Error budget: the allowed failure headroom — for 99.9% that's 0.1% = ~43 minutes per month. When the error budget is depleted, you stop feature work and focus on reliability. Error budgets make reliability a shared engineering conversation, not an ops complaint.

**Q: Alert on symptoms, not causes. `[Mid/Sr]`**

Alert on what users experience (high error rate, latency spike, availability drop) rather than on infrastructure signals (CPU at 80%, disk at 70%). A CPU-high alert with no user impact causes alert fatigue. A latency-spike alert without high CPU is the one that matters. Golden signals: latency, traffic, errors, saturation. Alert on the first three; use saturation for capacity planning.

**Q: High cardinality in metrics — why is it a problem? `[Sr]`**

Cardinality is the number of unique label combinations. If you add `user_id` as a label to a request metric, you get one time series per user — millions of series that collapse Prometheus. Keep labels to low-cardinality dimensions (status code, endpoint, service). For high-cardinality analysis, use logs or tracing, not metrics.

---

## War stories — "tell me about a time you debugged…"

> Read these as STAR stories. Each has the situation, what you saw, root cause, fix, and the lesson (the "T" of STAR).

---

**G1 — ECR login fails on master node** `[Docker/Auth]`

Tried to log in to ECR directly on the Kubernetes master EC2 node. Got "aws: command not found." The AWS CLI isn't installed on EC2 instances by default — I'd assumed it was. Generated the ECR token on my laptop (`aws ecr get-login-password`), piped it to `docker login`, copied the resulting auth into a Kubernetes pull-secret, and applied it to the cluster. **Lesson:** Nodes don't need the AWS CLI — use IAM instance profiles or Kubernetes pull-secrets. ECR tokens expire in 12 hours; automate rotation.

---

**G2 — t3.micro billing surprise** `[Terraform/Cost]`

Stood up a kubeadm cluster on t3.micro thinking it was free-tier. Got a billing alert — kubeadm requires minimum 2 vCPU, and t3.micro (1 vCPU, 1 GB) is free-tier but inadequate. Switched to k3s (lightweight single-binary K8s) on t3.micro with a 2 GB swapfile. **Lesson:** Always check free-tier eligibility before `terraform apply`. For labs, k3s on t3.micro; kubeadm needs t3.medium or larger.

---

**G3 — RDS password rejected by AWS** `[Terraform/RDS]`

`terraform apply` failed with `InvalidParameterValue: MasterUserPassword`. I'd included a `@` in the password string. AWS RDS forbids `/`, `@`, `"`, and spaces in master passwords. Changed to alphanumeric only. **Lesson:** Validate all external API constraints at the boundary — IaC provisioning time. In production, use Secrets Manager with auto-rotation so plaintext never appears in `tfvars`.

---

**G4 — SSH timeout after SG update** `[Terraform/Networking]`

Updated the security group's SSH rule with `my_ip = "$(curl ifconfig.me)/32"` and still couldn't SSH in. `curl ifconfig.me` had returned an IPv6 address; SG `cidr_blocks` expects IPv4. The rule was accepted silently by AWS but never matched. Fixed with `curl -4 ifconfig.me` to force IPv4. **Lesson:** IPv6 addresses in an IPv4 SG rule cause silent failures — no error, just dropped packets. Always `-4` flag when fetching your IP for SG rules.

---

**G5 — k3s API server dies with TLS timeout** `[Kubernetes/Memory]`

`kubectl get nodes` returned `TLS handshake timeout`. `systemctl status k3s` showed the k3s process had stopped — it had been OOM-killed by the kernel on a 1 GB t3.micro. (k3s runs as a systemd service, not as a CRI-managed container, so `crictl ps` will not show it; use `systemctl status k3s` or `ps aux | grep k3s` to check if the process is alive.) Added a 2 GB swapfile (`fallocate -l 2G /swapfile`, `mkswap`, `swapon`), restarted k3s, cluster came back. **Lesson:** k3s needs ~500 MB RAM. On 1 GB nodes, swap is the lifeline. In production, minimum 2 GB (t3.small+).

---

**G6 — Swap disappears after reboot** `[Linux/Persistence]`

After an EC2 stop/start, the swap was gone and k3s OOM-killed again. `swapon` is session-only. Added `/swapfile none swap sw 0 0` to `/etc/fstab` for persistence. **Lesson:** `swapon` = current session. `/etc/fstab` = survives reboot. A persistent fix requires both: create the file AND add the fstab entry.

---

**G7 — Worker node can't join cluster** `[Kubernetes/Networking]`

Worker join with `K3S_URL=https://<PUBLIC_IP>:6443` failed with TLS error. The K8s API server listens on the private VPC IP — node-to-node traffic inside a VPC uses private IPs; the public IP route doesn't work for intra-VPC traffic. Used `ip addr` to get the master's private IP (`10.0.1.x`) and the join succeeded. **Lesson:** Inside a VPC, nodes communicate via private IPs. `kubectl get nodes -o wide` → use the `INTERNAL-IP` column, not the public IP.

---

**G8 — CI can't push to Git: Permission denied** `[CI/CD/Permissions]`

The `update-manifests` job failed with `remote: Permission to repo.git denied to github-actions[bot]`. Two separate permission gaps: the workflow YAML was missing `permissions: contents: write`, AND the repo settings had the default "Read" workflow permission. Fixed both. **Lesson:** `GITHUB_TOKEN` starts read-only. Manifest-update workflows explicitly need `contents: write` declared in both the YAML and the repo Settings → Actions → General → Workflow permissions.

---

**G9 — `sed: No such file or directory` in CI** `[CI/CD/Naming]`

The CI loop tried to update `k8s/catalog-api.yaml` but the file was named `k8s/catalog.yaml`. The `sed` command failed silently enough to break the manifest update. Renamed files to exactly match the service names used in the CI matrix. **Lesson:** CI script names, K8s manifest filenames, Docker image names, and deployment names should all use one consistent convention. A mismatch anywhere in the chain silently breaks the update.

---

**G10 — CI manifest update triggers itself in a loop** `[CI/CD/GitOps]`

CI pushed a tag update commit to `main`. That push triggered the workflow again. Applied a two-layer fix: a `paths: ['services/**']` trigger filter (manifest commits touch `k8s/`, not `services/`) and appended `[skip ci]` to the commit message. **Lesson:** Two independent layers beat one. The `paths` filter is structural; `[skip ci]` is an escape hatch. Either one alone can fail under edge cases.

---

**G11 — Sequential Docker builds were slow** `[CI/CD/Performance]`

Building three service images sequentially in CI took 12+ minutes. Switched to a GitHub Actions matrix strategy — three jobs fan out in parallel. Build time dropped to the duration of the slowest single service (~5 minutes). **Lesson:** Matrix builds give parallel execution for free. Fan-out with `strategy.matrix`, sync with `needs`. Wall-clock = slowest job, not sum of all jobs.

---

**G12 — Argo CD pods OOMing on t3.micro** `[GitOps/Sizing]`

After installing Argo CD (6–7 pods: server, repo-server, application-controller, redis, dex, notifications), the node ran out of RAM and Argo pods went Pending or OOMKilled. Swap from G5/G6 kept things afloat for the demo. **Lesson:** Argo's full install needs 1–2 GB RAM. For a lab it's swap-backed; for production use dedicated nodes with resource limits and a HA install.

---

**G13 — `kubectl apply` timing out with `--validate` error** `[Kubernetes/API]`

`kubectl apply -f argocd/application.yaml` returned `TLS handshake timeout` during schema validation — the API server was under load and the openapi schema fetch was timing out. Applied with `--validate=false` to skip server-side schema validation. **Lesson:** `--validate=false` is a workaround for an overloaded API server, not a permanent setting. Production: keep validation on; fix the capacity problem instead.

---

**G14 — selfHeal reverted my manual scale** `[GitOps/selfHeal]`

Scaled a deployment to 3 replicas with `kubectl scale` to handle a load spike. Within 3 minutes it was back to 1. Argo CD's `selfHeal: true` detected the cluster drift from Git (which said `replicas: 1`) and reverted it. The fix: update `replicas: 3` in the Git manifest. **Lesson:** In a GitOps system, the cluster is read-only. All changes go through Git. `kubectl edit` / `kubectl scale` are anti-patterns when selfHeal is enabled.

---

**G15 — Understood why pull model is more secure** `[GitOps/Security]`

While designing the pipeline I considered having GitHub Actions run `kubectl apply` directly (push model) — CI would need kubeconfig secrets. Switched to Argo CD. Now CI only writes YAML to Git; the cluster credentials never leave the cluster. If CI is compromised, the attacker gets Git write access — bad, but far less dangerous than direct cluster access. **Lesson:** Pull = credentials cluster-side, never in CI. Push = credentials in CI = much larger blast radius on compromise.

---

**G16 — SSH and kubectl both "Connection refused" after IP rotation** `[Networking/SG]`

Was mid-session when both SSH (port 22) and kubectl (port 6443) suddenly refused connections — not timed out, refused. The security group rules were locked to my IP at Terraform apply time. My ISP's CGNAT had rotated my public IP. "Connection refused" vs "Connection timed out" distinction matters: timeout = SG drops (silent); refused = RST from host or CGNAT. Used `curl -4 ifconfig.me` to get new IP, updated `terraform.tfvars`, ran `apply` (only SG rule changes, instances unaffected). **Lesson:** Dynamic ISP IPs break IP-locked SGs. Production answer: bastion host, VPN, or AWS Systems Manager Session Manager — never lock to a home IP.

---

**G17 — kubectl defaults to localhost:8080** `[Kubernetes/Config]`

On the freshly provisioned master, `kubectl get nodes` returned `dial tcp 127.0.0.1:8080: connection refused`. No error about config — it just fell back to the old insecure port. The `ubuntu` user's `~/.kube/config` didn't exist. Ran the standard kubeadm post-init steps (`mkdir -p $HOME/.kube; sudo cp /etc/kubernetes/admin.conf $HOME/.kube/config`). **Lesson:** `localhost:8080 refused` is an unambiguous signal: kubectl has no kubeconfig. It's not a cluster problem — it's a client config problem.

---

**G18 — postgres StatefulSet stuck Pending: no StorageClass** `[Kubernetes/Storage]`

`postgres-0` stayed Pending indefinitely. `kubectl get pvc` showed `data-postgres-0 Pending`. `kubectl get sc` returned nothing. A fresh `kubeadm` cluster has no default StorageClass or dynamic provisioner — unlike EKS/GKE which provision one automatically. Installed `rancher/local-path-provisioner`, patched it as the default class, then deleted and recreated the PVC (existing Pending PVCs don't retroactively bind to a newly added StorageClass). **Lesson:** First debug step for PVC Pending: `kubectl get sc`. No StorageClass = no dynamic provisioning. EBS CSI driver for production on AWS.

---

**G19 — Ingress IP returns "404 Not Found"** `[Kubernetes/Ingress]`

Browsing to the node's raw public IP returned "404 Not Found, nginx". All pods were Running. The ingress-nginx controller routes based on the HTTP `Host` header, not the IP. No hostname → no rule match → default backend → 404. The 404 proved the ingress was alive — it was a routing miss, not a crash. Added `/etc/hosts` entries mapping a hostname to the node IP, browsed to `http://hostname`, got 200. **Lesson:** "IP pe 404 nginx" = ingress is UP, Host header doesn't match any rule. Debug with `curl -H "Host: your.domain" http://<ip>/` before touching anything else. In production, use real DNS (Route 53).

---

## Quick Troubleshoot Reference

| Symptom | Check first | Fix |
|---|---|---|
| `TLS handshake timeout` (kubectl) | `free -h` — RAM? | `sudo swapon /swapfile && sudo systemctl restart k3s` |
| CI push: "Permission denied to github-actions[bot]" | `permissions:` in YAML + repo Settings | Add `contents: write` in both (G8) |
| `sed: No such file` in CI | Manifest filenames vs CI loop names | Rename `k8s/<service>.yaml` to match (G9) |
| Argo App OutOfSync, not self-healing | `selfHeal: true` in `application.yaml`? | `kubectl describe application -n argocd` (G14) |
| Worker can't join cluster | Using public vs private IP? | Use master's `INTERNAL-IP` (`10.0.x.x`) (G7) |
| ECR pull fails on node | Pull-secret present? Expired? | Recreate secret — ECR tokens expire 12h (G1) |
| Swap gone after reboot | `/etc/fstab` entry? | `echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab` (G6) |
| RDS connection refused / bad password | Special chars in password? SG? | Letters+numbers only; SG `:5432` self-rule (G3) |
| SSH/6443 "Connection refused" | `curl -4 ifconfig.me` vs SG rule | IP rotated — update CIDR + `terraform apply` (G16) |
| `kubectl` → `localhost:8080 refused` | `~/.kube/config` exists? | `cp /etc/kubernetes/admin.conf ~/.kube/config` (G17) |
| Pod / PVC `Pending` indefinitely | `kubectl get sc` — any StorageClass? | Install local-path-provisioner + recreate PVC (G18) |
| Ingress IP → "404 Not Found nginx" | Sending Host header? | `/etc/hosts` entry + `http://hostname` (G19) |
| Pod `OOMKilled` (exit 137) | `kubectl top pods` — actual usage? | Raise `limits.memory` or fix memory leak |
| `CrashLoopBackOff` | `kubectl logs <pod> --previous` | Fix app crash; check CMD/ENTRYPOINT |
| `ImagePullBackOff` | Tag correct? Pull-secret present? | Fix image name/tag; create registry secret |

---

## The 60-second self-test

Quiz yourself out loud. Cover the right column, speak the answer, then check.

| Trap question | Answer |
|---|---|
| T → A → D → K, each one word? | Builder / Setup / Pack / Manager |
| tfstate gayi, 5 servers zinda, apply kiya → kitne? | 10 (orphan + 5 new = lost-state disaster) |
| Drift vs lost-state — state file kahan? | Drift = intact; lost-state = gone |
| Docker: why deps layer above, code below? | Code changes more often; cache deps layer avoids full rebuild |
| Reconciliation — 4 tools? | Terraform (triggered) / Ansible (triggered) / K8s (continuous) / Argo (continuous) |
| Actions = push, Argo = ? beech mein kya? | Pull; Git is the intermediary source of truth |
| selfHeal on + `kubectl scale` kiya → ? | Argo reverts to Git state within ~3 min |
| OOMKilled = ? CPU limit cross = ? | RAM exceeded (kill) / CPU throttle (slow, not killed) |
| Manifest-update: CI cluster ko chhuti hai? | Yes — CI only writes to Git; Argo applies to cluster |
| `latest` tag se rollback kaise? | Can't — mutable tag, no audit trail; use SHA pin |
| Liveness check mein DB dala — kya hoga? | Load spike → all pods liveness fail → mass restart → cascading outage |
| Pod Running, READY 0/1 — agle step? | `kubectl get endpointslices` → readiness probe → label match |
| Node RAM full, kaun pehle marta? | BestEffort → Burstable → Guaranteed |
| HPA kya chahiye? | `metrics-server` + pod `requests` set |
| `localhost:8080 refused` (kubectl) → ? | `~/.kube/config` missing — copy `admin.conf` |
| IP pe 404 nginx (ingress) → ? | Ingress alive; no Host header match — add `/etc/hosts` |
| Sirf kaun etcd se baat karta? | apiserver only |
| Public vs private subnet — technical test? | Route table: IGW route present = public |

---

## Closing: what interviewers are really testing

Interviewers at 2.5–3 year level are not testing command recall. They are testing three things:

**1. Can you design?** Given a problem, can you break it into the right components, choose the right tool for each, and draw the request-flow end to end — including failure paths? Commands are Google-able. Design decisions define the engineer.

**2. Can you decide under ambiguity?** Every architecture has trade-offs (Spot vs On-Demand, monolith vs microservices, kubeadm vs managed). Senior engineers articulate the trade-off and defend a choice. Junior engineers ask which one to pick.

**3. Can you debug systematically?** Interviewers simulate a production failure. The answer is never "I'd Google it." The answer is: form a hypothesis, isolate the layer, verify deterministically, and move inward. Every war story in section 12 demonstrates this method.

> "Commands AI/Google de dega. DESIGN + DECIDE = engineer."

The candidate who explains *why* selfHeal beats `kubectl edit` in a GitOps system, who knows *why* liveness probes shouldn't check the DB, and who can walk a 502 debug from NodePort to RDS without guessing — that candidate gets the offer. The one who memorized `kubectl apply` flags does not.

Prepare the war stories in your own voice. Prepare the reflex table until the answer fires before the question finishes. And when in doubt, say "I'd start by checking X, because in a system like this the most likely failure at that layer is Y." That reasoning, not the right answer, is what the interviewer is scoring.

---

*Cross-links: probes → 05-M4-kubernetes-core.md / 11-M9-advanced-k8s-internals.md · state/drift → 02-M1-terraform.md · push-vs-pull → 08-M7-gitops.md / 09-connected-system.md · sizing/OOM → 06-M5-sizing-and-cost.md · observability → 10-M8-observability-sre.md · capstone war stories → 12-capstone-url-shortener.md / 13-capstone-microshop.md*
