# 19 — Follow One Commit: the hands-on CI/CD flow

> **Core question:** A developer types `git push`. Forty minutes later a user is hitting the new code in production — and no one ran a deploy command. What happened, in order, at every step?

> **⏱️ Time:** ~45 min · **🎚️ Level:** Intermediate · **📋 Pehle chahiye:** [M6](07-M6-cicd.md), [M7](08-M7-gitops.md), [09](09-connected-system.md)
>
> **Is chapter ke baad tum kar paoge:**
> - Ek `git push` se production pod tak ke poore 10-step flow ko bina notes ke sunao — step 5 par batao CI ka baaton ka khatam kab hota hai aur GitOps kab shuru
> - Trivy scan ko CI gate ke roop mein explain karo aur batao yeh registry push se pehle kyun hota hai
> - Kustomize aur Helm ka fark batao — dono kab use karein

---

> ### ↩️ Recall gate — shuru karne se pehle
> Pichhle modules se 3 sawaal. **Pehle memory se jawab do, phir kholo.** (Yeh retrieve karna hi lifetime yaad rakhta hai — dobara padhna nahi.)
>
> 1. *(M6)* CI ne naya Docker image push kar diya. Cluster mein naya version lane ke liye CI kya karta hai — seedha `kubectl apply` ya kuch aur? Kyun?
> 2. *(M7)* Argo CD "pull model" hai — push model ke mukable mein iska ek concrete security fayda batao.
> 3. *(M4)* Rolling update ke dauran agar naya pod ka readiness probe fail kar de toh kya hota hai? Purane pods ko kya hota hai?
>
> <details markdown="1"><summary>Jawab</summary>
>
> 1. CI sirf k8s manifest mein image tag update karta hai aur Git mein commit push karta hai — cluster ko directly nahi chhuta, kyunki CI ke paas cluster credentials nahi hone chahiye (security + GitOps pattern). &nbsp; 2. Pull mein Argo cluster ke andar se Git read karta hai — cluster credentials kabhi CI runner ya bahar nahi jaate; leaked CI pipeline = no cluster access. &nbsp; 3. Rolling update ruk jaata hai — purani pods alive aur traffic serve karti rehti hain; cluster automatically failed pod replace karta hai jab tak probe pass na ho. Zero downtime.
> </details>

---

## The big picture

This chapter is the **step-by-step walkthrough** of one commit, end-to-end. [09 — The Connected System](09-connected-system.md) is the conceptual map (2 loops, 8 bridges, 5 threads). Read that first if you haven't. This chapter is the ground-level journey — every file, every command, every handoff.

The example service throughout is a hypothetical backend service (Go/gRPC in the snippets, but the pattern is identical for Node, Python, Java, or anything else — only the build command changes).

### The 10-step pipeline

```
 DEVELOPER           CI RUNNER (ephemeral)              REGISTRY     GITOPS        CLUSTER
     │                        │                              │            │              │
     │  1. git push           │                              │            │              │
     │───────────────────────▶│                              │            │              │
     │               2. checkout + test                      │            │              │
     │               3. docker build (multi-stage)           │            │              │
     │               4. trivy scan ──── FAIL = stop          │            │              │
     │               5. docker push ───────────────────────▶ │            │              │
     │               5. kustomize edit set image             │            │              │
     │                  git commit + push ──────────────────────────────▶ │              │
     │                        │                              │   6. Argo detects change  │
     │                        │                              │   7. Argo syncs ─────────▶│
     │                        │                              │            │  8. rolling  │
     │                        │                              │            │     update   │
     │                        │                              │            │  9. probes   │
     │                        │                              │            │     pass     │
     │◀──────────────────────────────────────────────── 10. observe (RED dashboards) ───│
```

**Two halves — never forget this split:**

| Half | What happens | Who/what acts |
|------|-------------|---------------|
| **CI — build side** (Steps 1–5) | Code → tested, scanned, tagged image in registry; new tag committed to Git | CI runner (ephemeral VM, stateless) |
| **CD — deploy side** (Steps 6–10) | Argo CD detects Git change → syncs → K8s rolling update → live traffic | Argo CD pod inside the cluster |

> 🇮🇳 **Hinglish intuition:** CI = *rasoi mein khaana banana aur quality check karna*. CD = *waiter jo khud menu dekh ke table tak pahunchata hai*. Rasoi wala waiter ko kuch nahi batata — waiter khud menu padh ke jaanta hai.

---

## Two repos: the production GitOps pattern

Most tutorials put everything in one repo. Production teams almost always split into **two**:

| Repo | Contains | Who writes to it |
|------|---------|-----------------|
| **App repo** | Source code, Dockerfile, CI workflow | Developers (feature branches, PRs) |
| **Config repo** | K8s manifests, Kustomize overlays | CI automation (image tag bumps) + ops (infra changes) |

**Why split?**

1. **Separation of concerns** — "what the code does" vs "what's deployed." A security team can own the config repo without touching source.
2. **Clean deploy history** — every row in `git log` on the config repo is a deploy event. Easy audit, easy blame.
3. **Rollback is trivial** — revert one commit in the config repo; Argo does the rest. No scrambling for old image tags.
4. **CI never needs cluster credentials** — CI only writes to a Git repo. The cluster reads from Git. The credential boundary is clean.

> **When one repo is fine:** Small teams, personal projects, early-stage startups. Put your manifests in a `/kustomize` folder in the same repo. The two-repo pattern is the production *evolution* when the single-repo approach starts creating friction (noisy CI, mixed audit history, shared-cred risks).

---

## Part A — CI (the build side)

Everything in Part A runs on a **CI runner** — an ephemeral virtual machine provisioned by your CI platform (GitHub Actions, GitLab CI, Jenkins, etc.). It's not your laptop and it's not the cluster. It runs, does its job, and is discarded.

### Step 0 (one-time): the app repo structure

```
myservice/
  main.go                        # (or app.py / index.ts / Main.java)
  Dockerfile
  .github/workflows/ci.yml       # the pipeline definition
```

The pipeline YAML is code — committed, reviewed, versioned like everything else.

### Step 1 — Developer pushes (the trigger)

```bash
git add .
git commit -m "feat: add rating filter"
git push origin main              # this fires the pipeline via webhook
```

Nothing manual after this. The CI platform receives the push webhook and queues a run.

### Step 2 — Checkout + Test (gate 1)

The runner clones the repo and runs the test suite. **Tests are the first gate — if tests fail, nothing else runs.** No image is built, no scan happens, nothing reaches the registry.

```yaml
# .github/workflows/ci.yml
name: ci
on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up runtime          # swap for setup-node, setup-python, etc.
        uses: actions/setup-go@v5
        with:
          go-version: '1.22'

      - name: Test                    # gate 1: fail here = nothing ships
        run: go test -race -count=1 ./...
```

> Detailed CI YAML mechanics (triggers, jobs, secrets, caching) are in [M6](07-M6-cicd.md). This chapter focuses on flow and concepts, not YAML syntax.

### Step 3 — Build the image (multi-stage + distroless)

```dockerfile
# Dockerfile — multi-stage: build with full toolchain, ship a minimal image
FROM golang:1.22 AS build
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 go build -o /app ./...     # statically-linked binary

FROM gcr.io/distroless/static:nonroot        # final stage: tiny, no shell
COPY --from=build /app /app
USER nonroot                                 # never run as root in prod
ENTRYPOINT ["/app"]
```

**Why `distroless/static:nonroot`?** Two reasons that matter for real production:

- **Tiny attack surface** — no shell (`sh`, `bash`), no package manager, no coreutils. An attacker who breaches the container has nothing to run. Compare to a full `ubuntu` base: thousands of extra binaries, each a potential exploit vector.
- **Non-root by default** — running as `root` inside a container is a container-escape risk. `nonroot` (UID 65532) removes this. Kubernetes `SecurityContext` can enforce this at the cluster level too.

> Multi-stage builds and the `latest`-tag trap are covered in [M3](04-M3-docker.md). Short version: `latest` in prod is a timebomb — you lose traceability and reproducibility.

```yaml
      - name: Build image
        run: |
          docker build \
            -t $REGISTRY/myservice:${{ github.sha }} \
            .
```

**Tag with the commit SHA** — every image in the registry traces back to an exact line of code. `git log` + image tag = full audit trail.

### Step 4 — Security scan with Trivy (gate 2)

```yaml
      - name: Trivy vulnerability scan    # gate 2: HIGH/CRITICAL CVE = stop
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ env.REGISTRY }}/myservice:${{ github.sha }}
          format: table
          exit-code: '1'                  # non-zero exit fails the step
          severity: HIGH,CRITICAL
```

**What Trivy does:** It scans the image layers against a CVE (Common Vulnerabilities and Exposures) database — a public registry of known security flaws in software packages. If the base image or any dependency has a HIGH or CRITICAL known flaw, `--exit-code 1` causes the step to fail.

**Why scan *before* push?** Once an image is in the registry, it's available for deployment (and potentially already pulled by a staging cluster). Scanning before push means vulnerable images never enter the supply chain. Shift left — catch problems as early as possible.

> 🇮🇳 **Hinglish intuition:** Trivy = *airport security scanner*. Saman register mein rakhne se pehle X-ray se guzarta hai. Agar kuch suspicious mila toh boarding nahi — push nahi.

A common pattern in mature pipelines: Trivy also runs in the registry itself (ECR Enhanced Scanning, Docker Hub, etc.) as a second layer. The CI gate is the *first* layer.

### Step 5 — Push to registry + handoff to Git (the CI/CD seam)

```yaml
      - name: Push image to registry
        run: docker push $REGISTRY/myservice:${{ github.sha }}

      - name: Bump image tag in config repo    # THE GitOps handoff
        env:
          CONFIG_REPO_TOKEN: ${{ secrets.CONFIG_REPO_TOKEN }}
        run: |
          git clone https://x-token:$CONFIG_REPO_TOKEN@github.com/org/config-repo
          cd config-repo/kustomize/overlays/prod

          kustomize edit set image \
            myservice=$REGISTRY/myservice:${{ github.sha }}

          git config user.email "ci@example.com"
          git config user.name  "CI Bot"
          git commit -am "deploy myservice ${{ github.sha }}"
          git push
```

**This is the seam between CI and CD.** CI's last act is to commit one line into the config repo — the new image tag. After this push, CI is done. It never ran `kubectl`. It never held a kubeconfig. The baton is now in Git.

#### Kustomize: what it is and how it differs from Helm

`kustomize edit set image` is a Kustomize command. Understanding what Kustomize does (and how it differs from Helm) is a common senior interview topic.

**Kustomize (overlays pattern):**

```
config-repo/kustomize/
  base/                        # shared: Deployment, Service, HPA
    deployment.yaml
    service.yaml
    kustomization.yaml
  overlays/
    dev/                       # patch: 1 replica, less memory
      kustomization.yaml       # references ../base + patches
    prod/                      # patch: 3 replicas, more memory, image tag
      kustomization.yaml
```

Kustomize works by **layering plain YAML patches on top of a base**. No templating language — you write real YAML, and Kustomize merges/patches it. `kustomize edit set image` mechanically updates the image tag in the overlay's `kustomization.yaml`.

**Helm (templating pattern):**

Helm uses Go templates and a `values.yaml` file. You write `{{ .Values.image.tag }}` in your chart templates and pass values at install time. More powerful for complex parameterization; more complex to read and debug.

| | Kustomize | Helm |
|-|-----------|------|
| **Approach** | Overlay/patch plain YAML | Template + values |
| **Learning curve** | Low — write real YAML | Steeper — Go template syntax |
| **Best for** | Environment variants of the same app | Complex, reusable, parameterized packages |
| **Bundled in kubectl** | Yes (`kubectl apply -k`) | No — separate CLI |
| **GitOps friendliness** | High — plain YAML in Git is readable | Requires rendering or chart storage |

> Both are widely used; most large teams end up with Helm for shared infra (databases, cert-manager) and Kustomize for their own app manifests. Argo CD supports both natively.

---

## Part B — CD (GitOps, the deploy side)

A different actor takes over: **Argo CD**, running as pods inside the cluster. It was never involved in the build. It just watches Git.

### Step 6 (one-time setup): the Argo Application

```yaml
# An ArgoCD Application = "watch this path in this repo, keep cluster matching it"
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myservice
  namespace: argocd
spec:
  source:
    repoURL: https://github.com/org/config-repo
    path: kustomize/overlays/prod
    targetRevision: main
  destination:
    server: https://kubernetes.default.svc     # this cluster
    namespace: prod
  syncPolicy:
    automated:
      prune: true         # delete resources removed from Git
      selfHeal: true      # revert manual kubectl changes
```

This is set up once. From this point forward, every commit to `config-repo/kustomize/overlays/prod` on `main` triggers a deploy — automatically.

> Argo Application YAML, sync states (Synced/OutOfSync/Healthy/Degraded), and drift self-healing are covered in depth in [M7](08-M7-gitops.md).

### Step 7 — Argo CD detects the change and syncs

Argo polls the config repo every ~3 minutes (or via a webhook for near-instant detection). It sees the new commit from Step 5: the image tag changed. Desired state ≠ current state → it syncs.

Argo runs the equivalent of `kubectl apply -k overlays/prod` from inside the cluster. The Deployment spec now references the new SHA:

```yaml
spec:
  template:
    spec:
      containers:
        - name: myservice
          image: registry/myservice:<new-sha>       # updated by Argo
          readinessProbe:
            httpGet: { path: /healthz, port: 8080 } # traffic gate
          livenessProbe:
            httpGet: { path: /healthz, port: 8080 } # restart gate
          resources:
            requests: { cpu: 100m, memory: 128Mi }
            limits:   { cpu: 500m, memory: 256Mi }
```

### Step 8 — Kubernetes does the rolling update

With the Deployment spec updated, the Kubernetes controller starts a rolling update:

1. Start one new pod (new SHA image).
2. Wait for its **readiness probe** to return HTTP 200 (or TCP/gRPC OK).
3. Once ready, add the new pod to the Service's endpoint list.
4. Send SIGTERM to one old pod → graceful shutdown → old pod removed.
5. Repeat until all replicas are on the new image.

**Zero downtime** — at every moment, some pod is serving traffic. The readiness probe is the traffic gate: if the new pod is unhealthy, it never receives requests and the old pods keep running. The update pauses rather than proceeding.

> Readiness vs liveness probes, rolling update mechanics, and `maxUnavailable`/`maxSurge` tuning are in [M4](05-M4-kubernetes-core.md).

### Step 9 — Traffic flows to the new pods

Ingress → Service → new pods. The Service's label selector (`app: myservice`) now matches the new pods once they're Ready. Users hit the new version without any routing change being made manually.

> 🇮🇳 **Hinglish intuition:** Service = *restaurant ka maître d'* — jaise hi naya chef (pod) ready ho ke kitchen mein aa gaya, maître d' automatically uske paas orders bhejna shuru kar deta hai. Purane chef ko gracefully jaane deta hai.

### Step 10 — Observe: RED dashboards

Prometheus scrapes `/metrics` from the new pods. Grafana shows the release health via **RED dashboards** — the three signals that matter most for any service:

| Signal | What it measures | Alert when |
|--------|-----------------|-----------|
| **Rate** | Requests per second | Drops unexpectedly (traffic lost) |
| **Errors** | % of requests returning 5xx / error | Rises above baseline |
| **Duration** | P50 / P95 / P99 latency | P99 spikes (tail latency regression) |

A good deploy: Rate stable, Errors flat, Duration unchanged. A bad deploy: Error rate climbs → Alertmanager fires → you roll back (next section).

> Prometheus scrape config, Grafana dashboards, alert rules, and SLI/SLO concepts are in [M8](10-M8-observability-sre.md).

---

## Rollback = a Git operation

The payoff of GitOps: rollback is not a special command. It's a Git operation.

```bash
# In the config repo — revert the image tag bump commit
git revert HEAD
git push origin main
```

Argo CD sees the revert commit → syncs → Kubernetes does another rolling update back to the previous image. Clean, audited, instant. The Git history shows exactly what happened and who did it.

**Emergency option (when you need it in 30 seconds):**

```bash
kubectl rollout undo deployment/myservice -n prod
```

This bypasses GitOps — the cluster changes without a Git commit. Argo will detect drift and try to revert it unless you pause sync first (`argocd app set myservice --sync-policy none`). Use only in genuine emergencies; follow up with a proper Git revert.

> 🇮🇳 **Hinglish intuition:** GitOps rollback = *recipe book mein ek page wapas palatna*. Kitchen (cluster) khud hi purani recipe follow karne lagti hai. `kubectl rollout undo` = *chef ko seedha kehna bina recipe book ke* — kaam karta hai, lekin recipe book baad mein confuse ho jaati hai.

---

## One-time vs every-commit

| One-time setup (outer loop) | Every commit (the inner loop) |
|-----------------------------|-------------------------------|
| `terraform apply` — VPC, nodes, ECR, RDS | `git push` — the trigger |
| `ansible-playbook` — configure nodes, kubeadm | Test → build → scan |
| CNI install (Calico/Cilium) | `docker push` (SHA-tagged image) |
| Argo CD install + Application YAML | Commit new tag to config repo |
| Prometheus + Grafana stack | Argo sync → rolling update |
| TLS cert, Ingress controller | Observe RED dashboards |

The outer loop builds the machine. The inner loop runs on the machine — dozens of times a day. The infrastructure setup ([M1 Terraform](02-M1-terraform.md) / [M2 Ansible](03-M2-ansible.md)) is a prerequisite, but once done, it's invisible. The daily loop is pure CI/CD + GitOps.

---

## Say it out loud (the 60-second interview walkthrough)

Practice saying this without pausing:

> "A developer pushes code to the app repo. The push fires a CI pipeline on an ephemeral runner. The runner checks out the code, runs the test suite as the first gate, then builds a Docker image — multi-stage, distroless base, non-root user. Before pushing the image, Trivy scans it for HIGH and CRITICAL CVEs; a vulnerable image fails the pipeline and never reaches the registry. If the scan passes, the image is pushed to the registry tagged with the commit SHA — never `latest`. CI's final act is to clone the config repo, run `kustomize edit set image` to update the image tag in the prod overlay, commit, and push. CI never runs `kubectl`, never holds cluster credentials. Argo CD, running as a pod inside the cluster, polls the config repo, sees the new commit, and syncs — it applies the updated manifest. Kubernetes does a rolling update: new pod starts, readiness probe passes, pod is added to the Service, old pod is gracefully terminated. Prometheus and Grafana RED dashboards confirm Rate/Errors/Duration are healthy. If they're not, I `git revert` the tag bump in the config repo, Argo rolls the cluster back. The cluster itself was built once with Terraform and Ansible. Everything after that is Git-driven."

---

## Summary

- **Two repos** — app repo (source + CI) and config repo (manifests + Kustomize overlays). CI writes to the config repo; Argo reads it. Clean boundary, clean history, easy rollback.
- **Trivy scan** is gate 2 in CI, before `docker push`. Vulnerable images never enter the registry.
- **Distroless + non-root** images reduce attack surface: no shell, no package manager, non-root UID.
- **SHA tagging** gives every image a traceable identity. `latest` in prod is a liability.
- **Kustomize** manages environment variants (base + overlays) with plain YAML patches. Helm uses templates and values — better for complex reusable packages. ArgoCD supports both.
- **The CI/CD seam is Step 5** — `kustomize edit set image` + git commit. After this, CI is done. Argo takes over.
- **Rollback is a `git revert`** in the config repo. GitOps makes it surgical and audited.
- **RED dashboards** (Rate, Errors, Duration) tell you in the first 10 minutes post-deploy whether the change is healthy.

---

## Self-check quiz

*Pehle memory se jawab do, phir kholo.*

**1.** Why does CI commit to a *separate* config repo instead of applying to the cluster directly?

<details><summary>Jawab dekho</summary>

Security and GitOps principle. CI runner should never hold cluster credentials (leaked runner = leaked cluster). By committing to Git, the cluster itself (via Argo) pulls the desired state — credentials never leave the cluster boundary. Bonus: config repo gives deploys their own clean audit history.
</details>

---

**2.** Trivy scan is placed *after* `docker build` but *before* `docker push`. Why not scan after push?

<details><summary>Jawab dekho</summary>

Once an image is in the registry it can be pulled by staging clusters or other automated systems. Scanning before push means a vulnerable image never enters the supply chain. "Shift left" — catch security issues as early as possible.
</details>

---

**3.** A rolling update is in progress. The new pod's readiness probe keeps failing. What does Kubernetes do? What do users experience?

<details><summary>Jawab dekho</summary>

The rolling update pauses. The new pod is never added to the Service endpoints (it never receives user traffic). Old pods remain alive and serving. Users see no disruption. The Deployment stays in a partially-updated state until the probe passes or an operator intervenes.
</details>

---

**4.** What is the difference between Kustomize and Helm? When would you choose each?

<details><summary>Jawab dekho</summary>

Kustomize overlays plain YAML patches on a base — no templating language, low learning curve, built into kubectl, great for environment variants of your own app. Helm uses Go templates + values.yaml — steeper learning curve but powerful for complex reusable packages (cert-manager, ingress-nginx). Large teams often use both: Helm for shared infra, Kustomize for app manifests.
</details>

---

**5.** A deploy looks good in Grafana for 5 minutes then error rate climbs to 8%. What is your immediate action and why?

<details><summary>Jawab dekho</summary>

Immediate: `git revert HEAD && git push` in the config repo. Argo detects the revert and rolls the cluster back to the previous image — a rolling update in reverse. Do this before investigating root cause. Restore service first, debug second. The git revert is fast, audited, and doesn't require anyone to remember the old image tag.
</details>

---

**6.** What are the RED signals and what does each tell you about a deploy?

<details><summary>Jawab dekho</summary>

**Rate** = requests/second. A drop post-deploy can mean traffic isn't reaching the new pods (misconfigured selector, crashing pods). **Errors** = % of 5xx or error responses. A rise means the new code has bugs or is failing under load. **Duration** = latency (P95/P99). A spike means the new version is slower — even if it's "working," users feel it. Healthy deploy: all three unchanged from pre-deploy baseline.
</details>

---

## Hands-on lab

**Goal:** Extend your capstone service ([Capstone 1](12-capstone-url-shortener.md) or [Capstone 2](13-capstone-microshop.md)) with two production patterns: a Trivy security gate in CI, and a Kustomize-based config repo that Argo watches. Then observe a deploy and a rollback.

### Part 1 — Add the Trivy gate

In your existing CI workflow file, add this step *after* `docker build` and *before* `docker push`:

```yaml
      - name: Trivy scan (HIGH/CRITICAL gate)
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
          format: table
          exit-code: '1'
          ignore-unfixed: true
          severity: HIGH,CRITICAL
```

**Test it:** Temporarily change your base image to an old, known-vulnerable one (e.g., `FROM python:3.8.0`). Push. Confirm the pipeline fails at the Trivy step with CVE output. Restore the modern base image. Push again — pipeline should pass.

### Part 2 — Split into a config repo (or /kustomize overlay)

**Option A (two repos — recommended for the full experience):**
Create a second repo `<yourname>-config`. Inside it:

```
kustomize/
  base/
    deployment.yaml     # your service Deployment + Service
    kustomization.yaml  # lists resources
  overlays/
    dev/
      kustomization.yaml   # 1 replica
    prod/
      kustomization.yaml   # 3 replicas, prod image tag
```

Add a step to your CI that clones the config repo and runs `kustomize edit set image` on the prod overlay, then commits and pushes.

**Option B (single repo, /kustomize folder):**
Create the same `kustomize/` structure in your existing repo. Update CI to commit the tag bump within the same repo (use `[skip ci]` in the commit message to avoid an infinite loop — see [M6](07-M6-cicd.md)).

### Part 3 — Wire Argo CD

Point an Argo Application at your config repo path:

```bash
argocd app create myservice \
  --repo https://github.com/you/config-repo \
  --path kustomize/overlays/prod \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace prod \
  --sync-policy automated \
  --auto-prune \
  --self-heal
```

### Part 4 — Deploy + observe + rollback

1. Push a small feature change to your app repo. Watch the CI pipeline — confirm Trivy passes.
2. Watch the config repo — confirm CI committed a new image tag.
3. Watch Argo CD UI — confirm it detects the change and syncs.
4. Watch your Grafana RED dashboard — confirm Rate/Errors/Duration are stable post-deploy.
5. Now deliberately introduce a bug (e.g., make the health endpoint return 500). Push. Confirm the readiness probe fails and the rolling update pauses — old pods stay live.
6. Run `git revert HEAD && git push` in the config repo. Watch Argo roll back. Confirm RED metrics return to baseline.

**✅ Sahi hua to aisa dikhega:**

- Trivy step fails your CI build when you use a vulnerable base image — the `docker push` step never runs.
- After fixing the image, a clean `git push` flows through CI → config repo commit → Argo sync → new pod starts → readiness probe passes → traffic shifts — all without a single `kubectl apply` from your terminal.
- `git revert` in the config repo triggers Argo within ~3 minutes (or instantly via webhook). The old SHA image is restored via a rolling update. Grafana error rate drops back to zero.

---

## Interview questions

**Q1. Walk me through what happens from `git push` to production — in 90 seconds.**

> Model answer: Use the "Say it out loud" paragraph above. Key checkpoints: CI never touches the cluster; Trivy scan before push; SHA tags; Kustomize edit set image is the handoff; Argo pulls from Git; readiness probe gates traffic; RED dashboards confirm health. Mention two-repo pattern if time allows.

---

**Q2. Why does CI not run `kubectl apply` directly? What's the security argument?**

> Model answer: CI runners are ephemeral VMs that execute third-party code (actions, scripts). Giving them cluster credentials (kubeconfig) means a compromised dependency or supply-chain attack can reach production directly. In pull-based GitOps, the cluster has read access to Git — credentials never leave the cluster boundary. Least privilege in practice.

---

**Q3. What is a CVE and why does Trivy scan happen before `docker push`, not after?**

> Model answer: CVE = Common Vulnerabilities and Exposures — a numbered registry of known security flaws in software packages. Scanning before push prevents vulnerable images from entering the registry (and potentially being pulled by staging environments or automated processes). "Shift left" — catch issues at the earliest possible point in the pipeline where they're cheapest to fix.

---

**Q4. Explain Kustomize overlays. How is it different from Helm?**

> Model answer: Kustomize = base + patches. You write plain YAML in the base, then per-environment overlays patch what differs (replica count, image tag, resource limits). No template language — just real YAML. Helm uses Go templates with a values.yaml file — better for complex, parameterized, reusable packages you distribute (like `helm install cert-manager`). Kustomize is built into kubectl; Helm is a separate tool. Most mature teams use both.

---

**Q5. Someone did `kubectl scale deployment myservice --replicas=10` in prod manually. Argo has selfHeal: true. What happens?**

> Model answer: Within 3 minutes (next poll cycle, or instantly via webhook), Argo detects drift — desired state in Git says 3 replicas, cluster has 10. With `selfHeal: true`, Argo applies the Git-defined state — it scales back to 3. This is the enforcement side of GitOps: Git is the single source of truth, and no manual change survives the next sync. If the operator needed 10 replicas, the right action is to commit that change to the config repo.
