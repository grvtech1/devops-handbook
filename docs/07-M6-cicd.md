# M6 — CI/CD Pipelines

> **Core question:** How does a `git push` become a tested, built, pushed image with zero manual steps?

> **⏱️ Time:** ~55 min padho + 30 min lab · **🎚️ Level:** Intermediate · **📋 Pehle chahiye:** [M3](04-M3-docker.md), [M4](05-M4-kubernetes-core.md)
>
> **Is module ke baad tum kar paoge:**
> - GitHub Actions workflow YAML likho — test gate, docker build, ECR push, manifest update sab ek pipeline mein
> - CI ka GitOps handoff explain karo: CI cluster nahi, sirf Git ko chhuta hai — aur yeh kyun safer hai
> - Infinite loop trap identify karo aur `paths:` + `[skip ci]` ke saath fix karo

**Previous:** [06-M5-sizing-and-cost.md](06-M5-sizing-and-cost.md) | **Next:** [08-M7-gitops.md](08-M7-gitops.md) | **Index:** [00-INDEX.md](00-INDEX.md)

---

> ### ↩️ Recall gate — shuru karne se pehle
> Pichhle modules se 3 sawaal. **Pehle memory se jawab do, phir kholo.** (Yeh retrieve karna hi lifetime yaad rakhta hai — dobara padhna nahi.)
>
> 1. *(M3)* Kubernetes pod mein `ImagePullBackOff` error kyun aata hai? Do sabse common wajah batao.
> 2. *(M4)* K8s Deployment mein rolling update ke dauran agar naya pod readiness probe fail kare to kya hota hai?
> 3. *(M1)* "Idempotent" ka matlab kya hai? Terraform ka ek concrete example do jahan yeh property kaam aati hai.
>
> <details markdown="1"><summary>Jawab</summary>
>
> 1. (1) Image tag galat hai ya registry mein exist nahi karta. (2) Private registry mein auth fail — `imagePullSecret` missing ya credentials wrong. &nbsp; 2. Rolling update ruk jaata hai — purani pods alive rehti hain, naye pods nahi aate jab tak readiness fail ho; cluster old version pe chalta rehta. &nbsp; 3. Idempotent = same operation baar-baar karo, result same rahe. Terraform: "3 EC2 chahiye" — 5 baar `apply` karo, hamesha 3 hi rahenge, 15 nahi banenge.
> </details>

## The 60-second version

CI (Continuous Integration) = every push automatically compiles, tests, and packages your code.
CD (Continuous Delivery) = that package is always ready to ship; a human presses the final button.
Continuous Deployment = no button — it ships to production automatically.

The mechanism is a **pipeline**: a YAML file committed alongside your code that describes a chain of jobs running on ephemeral virtual machines called **runners**. On every `git push`, the platform reads the file, spins up a fresh runner, and executes each step. If a test fails, the pipeline stops — nothing reaches production.

The output is a **Docker image** tagged with the exact commit SHA, pushed to a registry (ECR, GHCR, Docker Hub). From there, a GitOps tool (Argo CD — covered in M7) detects the new image and deploys it to Kubernetes. CI never touches the cluster directly.

---

## Why this exists / what it replaced

Before CI/CD, the release process looked like this:

- A developer finishes a feature on their laptop. "Works on my machine."
- Days or weeks later, someone manually SSHes into a build server, runs `npm run build`, copies the binary somewhere, and hopes for the best.
- The QA team runs manual tests. Bugs found. Fixes pushed. More manual testing.
- Release night: the entire team stays up, manually deploying to production one server at a time.
- A config file was wrong. Rollback means someone remembering what version to re-deploy.

The problems are slow feedback (bugs found days after they were written), human error at every step, undocumented process (knowledge lives in one person's head), and irreproducible builds (the build server has mystery packages installed).

CI/CD replaces this with **pipeline-as-code**: the build and test instructions live in the same repository as the app code. Every push triggers the pipeline automatically. Failures surface in minutes, not days. The artifact (Docker image) is identical whether built on a developer's laptop push or a production release — because the runner is ephemeral and deterministic.

🇮🇳 **Hinglish intuition:** Pehle har developer apne haath se dish banata (alag swaad, alag cheez). CI/CD = ek standardized recipe + machine jo har baar bilkul same dish banaye, aur agar galti ho to turant bata de — plate bahar jaane se pehle.

---

## CI vs CD vs Continuous Deployment

These three terms are often collapsed into "CI/CD" but mean distinct things. Knowing the distinction is a common senior interview question.

| Term | Full name | What it automates | Who triggers production? |
|------|-----------|-------------------|--------------------------|
| **CI** | Continuous Integration | Build + test + package on every push | — (no deployment) |
| **Continuous Delivery** | Continuous Delivery | CI + always-deployable artifact; staging auto-deploy | **Human** (manual approval gate to prod) |
| **Continuous Deployment** | Continuous Deployment | All of the above; production deploy is automatic | **Nobody** — pipeline does it |

**The key difference between Delivery and Deployment:** Delivery says "the artifact is always ready to go to production." Deployment says "the artifact goes to production automatically without a human gate." Most regulated or high-stakes environments use Delivery (human approval before prod); most SaaS companies with strong test suites use Deployment.

In this module, the capstone project implements Continuous Delivery: GitHub Actions builds and pushes the image, updates the manifest in Git, and Argo CD syncs it — but you could add a manual approval step before the GitOps sync if needed.

---

## Pipeline anatomy and shared vocabulary

Every CI/CD tool — Jenkins, GitHub Actions, GitLab CI, CircleCI, Tekton — is a variation of the same model. Learn the vocabulary once; it transfers everywhere.

```
TRIGGER (push / PR / schedule / manual)
    │
    ▼
PIPELINE ─────────────────────────────────────────────────────
│  STAGE: build          STAGE: test          STAGE: publish  │
│  ┌────────────┐        ┌────────────┐        ┌──────────┐   │
│  │  JOB       │  ───►  │  JOB       │  ───►  │  JOB     │   │
│  │  ┌──────┐  │        │  ┌──────┐  │        │ ┌──────┐ │   │
│  │  │ STEP │  │        │  │ STEP │  │        │ │ STEP │ │   │
│  │  │ STEP │  │        │  │ STEP │  │        │ │ STEP │ │   │
│  │  └──────┘  │        │  └──────┘  │        │ └──────┘ │   │
│  └────────────┘        └────────────┘        └──────────┘   │
│       RUNNER                RUNNER                RUNNER     │
└─────────────────────────────────────────────────────────────┘
                                                      │
                                              ARTIFACT (image)
                                              pushed to registry
```

| Term | Definition | Analogy |
|------|-----------|---------|
| **Pipeline / Workflow** | The entire automated process defined in one YAML file | The full recipe |
| **Stage** | A logical phase (build → test → deploy). Stages run in order. | Course in a meal |
| **Job** | A unit of work within a stage. Jobs in the same stage run in parallel by default. | A chef's station |
| **Step** | An individual command or action inside a job | One instruction in a recipe |
| **Runner** | The ephemeral virtual machine that executes a job. Spun up fresh per job, discarded after. | A hired helper who comes, does the work, then disappears |
| **Trigger** | The event that starts the pipeline: `push`, `pull_request`, `tag`, `schedule`, or `workflow_dispatch` (manual) | The starting pistol |
| **Artifact** | Files produced by a job (a compiled binary, a test report, a Docker image) passed to later jobs or stored | The handoff baton |
| **Secrets** | Encrypted credentials (registry login, AWS keys) injected at runtime, never written in plain text | The locker key |
| **Cache** | Reused files between runs to speed up (e.g., `node_modules`) — different from artifact | The prepped ingredients |
| **`uses`** | A pre-built action from the marketplace (`actions/checkout@v4`) — reusable, tested, maintained | A plug-in tool |
| **`run`** | Raw shell command you write yourself | A hand-written step |

🇮🇳 **Hinglish intuition:** Runner = ek baar ka helper jo kaam ke baad gayab ho jaata (ephemeral). Secrets = locker ki chaabi (encrypted, runtime pe inject). Artifact = ek stage ka output jo agla stage ko mile.

---

## GitHub Actions

GitHub Actions is the most widely used CI/CD system for code hosted on GitHub. The pipeline file lives at `.github/workflows/<any-name>.yml`. The folder path is fixed; the filename is free.

### Annotated workflow — test, build, push to ECR, update manifest

```yaml
# .github/workflows/ci.yml
name: CI — Build and Push                  # display name in GitHub UI

on:                                        # TRIGGER: when does this run?
  push:
    branches: [main]                       # only on pushes to main
    paths: ['app/**']                      # only when app/ files change (loop prevention)
  pull_request:                            # also on any PR (test gate before merge)

permissions:
  contents: write                          # REQUIRED to push the manifest commit back

jobs:
  test:                                    # JOB 1: run tests first
    runs-on: ubuntu-latest                 # RUNNER: fresh Ubuntu VM, managed by GitHub
    steps:
      - uses: actions/checkout@v4          # uses: = prebuilt action (checks out source code)
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - name: Install deps
        run: pip install -r app/requirements.txt  # run: = raw shell command
      - name: Run tests
        run: cd app && pytest              # TEST GATE: if this fails, pipeline stops here

  build-push:                              # JOB 2: build image only after tests pass
    needs: test                            # needs: = dependency; waits for 'test' job to succeed
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'    # if: condition: only on main branch, not PRs
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_KEY }}        # secrets: encrypted, never in YAML
          aws-secret-access-key: ${{ secrets.AWS_SECRET }}
          aws-region: ap-south-1

      - name: Log in to ECR
        uses: aws-actions/amazon-ecr-login@v2
        # ECR (Elastic Container Registry) = AWS's private Docker registry

      - name: Build and push image
        run: |
          # github.sha = the exact commit hash — immutable, traceable image tag
          # NEVER use :latest in production — it is mutable and untraceable
          docker build -t ${{ secrets.ECR_URL }}:${{ github.sha }} ./app
          docker push ${{ secrets.ECR_URL }}:${{ github.sha }}

      - name: Update K8s manifest with new image tag
        run: |
          # sed replaces the image line in deployment.yaml with the new SHA-tagged image
          # This is the CI→GitOps handoff: CI writes to Git, Argo CD reads from Git
          sed -i "s|image: .*url-shortener.*|image: ${{ secrets.ECR_URL }}:${{ github.sha }}|" \
            k8s/deployment.yaml
          git config user.name "ci-bot"
          git config user.email "ci@bot.com"
          git add k8s/deployment.yaml
          git commit -m "ci: update image to ${{ github.sha }} [skip ci]"
          # [skip ci] in the commit message prevents this commit from re-triggering CI
          git push
```

### Key GitHub Actions concepts

**`on:` triggers — branch filter**
`branches: [main]` means the workflow only fires when a push lands on `main`. A push to `feature/my-branch` does nothing. Add `pull_request:` separately so that PRs also run the test job before merge — this is the **test gate** that protects `main`.

**`needs:` — job dependency**
By default, all jobs in a workflow run in parallel. `needs: test` serializes them: `build-push` waits for `test` to complete successfully. If `test` fails, `build-push` never starts. This is how you prevent broken code from reaching ECR.

**`${{ secrets.X }}` — secrets**
Secrets are stored in GitHub repo Settings → Secrets and variables → Actions. They are encrypted at rest and masked in logs. The `${{ }}` syntax is GitHub Actions expression syntax — the runtime substitutes the value. Never commit secrets to the YAML file.

**`${{ github.sha }}` — immutable image tag**
Every commit has a unique SHA (e.g., `a3f8c1d...`). Tagging the Docker image with this SHA creates a 1:1 traceability link: given any running pod, you know exactly which commit it was built from. This connects directly to M3's lesson on digest pinning — see [04-M3-docker.md](04-M3-docker.md).

**`if:` conditions**
`if: github.ref == 'refs/heads/main'` prevents the push job from running on pull requests. PRs should only run tests, not push images.

**Matrix builds — fan-out**
When you have multiple services (like the MicroShop capstone), a matrix build creates N parallel job instances from one job definition:

```yaml
strategy:
  matrix:
    service: [catalog-api, order-api, frontend]
# Result: 3 runners start simultaneously, each building one service
# Wall-clock time = time for the slowest service (not the sum)
# Without matrix: sequential, 3x slower
```

🇮🇳 **Hinglish intuition:** Matrix = ek job definition se teen runners ek saath shuru — parallel factory lines. Wall-clock = sabse dheele ki time (sum nahi). Interview mein: "3 Docker images best CI pattern?" → Matrix build.

---

## GitLab CI and the Jenkins comparison

### GitLab CI — annotated example

GitLab CI uses a single file `.gitlab-ci.yml` at the repository root. GitLab's own CI runners execute it automatically.

```yaml
# .gitlab-ci.yml
stages:            # ordered phases; jobs in the same stage run in parallel
  - test
  - build
  - publish

variables:
  IMAGE: registry.gitlab.com/$CI_PROJECT_PATH:$CI_COMMIT_SHA
  # $CI_* = GitLab's predefined environment variables (no setup needed)
  # $CI_PROJECT_PATH = group/repo name   $CI_COMMIT_SHA = current commit hash

test_job:
  stage: test
  image: python:3.12-slim            # run this job inside this Docker image
  script:
    - pip install -r app/requirements.txt
    - cd app && pytest
  # if this fails, the 'build' and 'publish' stages never run

build_job:
  stage: build
  image: python:3.12-slim
  script:
    - pip install -r app/requirements.txt
    - python -m py_compile app/main.py
  artifacts:                         # artifacts: pass files to later stages
    paths:
      - app/
    expire_in: 1 hour

publish_job:
  stage: publish
  image: docker:latest
  services:
    - docker:dind                    # dind = Docker-in-Docker; lets this job build Docker images
  script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
    - docker build -t $IMAGE ./app
    - docker push $IMAGE
  rules:                             # rules: is the modern replacement for only:/except:
    - if: '$CI_COMMIT_BRANCH == "main"'
```

**Key GitLab CI concepts:**

- `stages:` defines order. All jobs with `stage: test` run before any job with `stage: build`.
- `$CI_*` variables: GitLab injects dozens of predefined vars (`$CI_COMMIT_SHA`, `$CI_REGISTRY`, `$CI_PROJECT_PATH`). No configuration needed.
- `artifacts:` makes files from one job available to later jobs. Equivalent to GitHub Actions' `upload-artifact` / `download-artifact`.
- `services: docker:dind` (Docker in Docker): allows a job to run `docker build` inside a container. Required because GitLab runners themselves run inside Docker.
- `rules:` (newer) vs `only:` (older): `rules:` is more expressive and handles complex conditions. `only: - main` and `rules: - if: $CI_COMMIT_BRANCH == "main"` are roughly equivalent.

### Jenkins vs GitHub Actions vs GitLab CI

| Aspect | Jenkins | GitHub Actions | GitLab CI |
|--------|---------|----------------|-----------|
| **Hosting** | Self-hosted server you install and maintain | GitHub-managed (free tier available) | Built into GitLab (SaaS or self-hosted) |
| **Config file** | `Jenkinsfile` (Groovy DSL) | `.github/workflows/*.yml` (YAML) | `.gitlab-ci.yml` (YAML) |
| **Setup effort** | High — server, plugins, agents, maintenance | Low — repo + YAML file | Low — already in GitLab |
| **Runners** | Self-managed Jenkins agents | GitHub-hosted or self-hosted runners | GitLab-hosted or self-hosted |
| **Ecosystem** | Largest plugin library (1,800+ plugins) | GitHub Marketplace actions | GitLab-native features |
| **Secrets** | Jenkins credentials store | GitHub Secrets | GitLab CI/CD Variables |
| **Best when** | Complex legacy pipelines; full control; on-prem | Code is on GitHub; fast setup | All-in-one GitLab shop |

**Interview one-liner:** "Jenkins is a powerful self-hosted server with the widest plugin ecosystem but requires significant maintenance. GitHub Actions and GitLab CI are pipeline-as-code built into the platform — much lower setup cost. The concepts transfer directly: stages, agents/runners, artifacts, secrets — same idea, different syntax."

---

## The handoff to GitOps: manifest-update

This is the single most important concept in this module. It is the bridge between CI (this module) and GitOps (M7).

### The two deployment models

| Model | How it works | Problem |
|-------|-------------|---------|
| **Push deploy** | CI runs `kubectl apply` directly against the cluster | CI needs cluster credentials. A compromised CI system = compromised cluster. Credentials must be managed and rotated. |
| **Manifest-update (GitOps)** | CI updates the image tag in the K8s manifest YAML and commits to Git. Argo CD (inside the cluster) detects the change and applies it. | None — this is the recommended model. |

### The manifest-update flow

```
git push (app code change)
        │
        ▼ GitHub Actions triggered
   ┌─────────────────────────────────────────┐
   │  STEP 1: pytest                         │  ← test gate
   │  STEP 2: docker build + push → ECR      │  ← image tagged with github.sha
   │  STEP 3: sed k8s/deployment.yaml        │  ← update image tag in manifest
   │  STEP 4: git commit + git push          │  ← CI writes to Git, not cluster
   └─────────────────────────────────────────┘
        │
        │  CI NEVER TOUCHES THE CLUSTER
        │
        ▼ Git repo (k8s/deployment.yaml updated)
        │
        ▼ Argo CD (running inside the cluster, polling Git)
   ┌─────────────────────────────────────────┐
   │  Detects: deployment.yaml changed       │
   │  Applies: kubectl apply (from inside)   │
   │  Result: new pods with new image        │
   └─────────────────────────────────────────┘
        │
        ▼ Cluster updated — new version running
```

**Why this matters:**

1. **Security:** CI never holds cluster credentials. If the CI system is compromised, the attacker cannot deploy arbitrary code to production. Cluster access stays inside the cluster.
2. **Git as truth:** Every deployed version is traceable to a Git commit. Rollback means `git revert` — not remembering which image tag to manually roll back to.
3. **Audit trail:** Git history is the deployment history. Who deployed what, when, from which commit — it is all there.

The `sed` command in the manifest-update step:
```bash
sed -i "s|image: .*url-shortener.*|image: 336129194698.dkr.ecr.ap-south-1.amazonaws.com/url-shortener:a3f8c1d|" \
  k8s/deployment.yaml
# -i = in-place edit   s|old|new| = substitute pattern with new value
```

🇮🇳 **Hinglish intuition:** CI = menu likhne wala (Git mein naya tag likhta). Argo = rasoiya jo menu padh ke banata. CI ko kitchen ki chaabi nahi — cluster chhua hi nahi. Git = handshake in the middle.

Cross-link: M7 covers Argo CD's pull model, sync states, selfHeal, and rollback in depth — see [08-M7-gitops.md](08-M7-gitops.md). Golden Thread 4 (push vs pull) is explained in context of the full system in [09-connected-system.md](09-connected-system.md).

---

## The infinite-loop trap and its fixes

> 🔮 **Predict pehle (socho, phir aage padho):** CI apni image tag manifest me commit karti hai Git me. Woh commit CI ko dobara trigger karta hai... phir? Kya hone wala hai?

When CI commits the manifest update back to the repository, that commit lands on `main`. If the workflow triggers on any push to `main`, it will trigger itself — and then trigger again, forever.

```
git push (app change)
    → CI runs → updates k8s/deployment.yaml → git push
    → CI runs AGAIN (triggered by the manifest commit)
    → updates k8s/deployment.yaml → git push
    → CI runs AGAIN ...  ♾️
```

There are three independent fixes. In production, use at least two layers.

| Fix | Mechanism | How it works | Limitation |
|-----|-----------|-------------|------------|
| **`paths:` filter** | Structural exclusion | `on: push: paths: ['app/**']` — CI only triggers when files under `app/` change. The manifest commit touches `k8s/`, which is outside the filter, so it does not re-trigger. | Only works if manifests live in a different directory than app code. |
| **`[skip ci]` in commit message** | Explicit bailout | `git commit -m "ci: update image to $SHA [skip ci]"` — GitHub, GitLab, and most CI platforms recognize this tag and skip the workflow. | Depends on the platform honoring the tag. A missing tag means the loop fires. |
| **`GITHUB_TOKEN` scoping** | Default token protection | When CI uses the built-in `GITHUB_TOKEN` to push, GitHub deliberately does not re-trigger workflows from that push. If you replace `GITHUB_TOKEN` with a Personal Access Token (PAT), this protection is lost. | Only applies when using `GITHUB_TOKEN`, not PATs or deploy keys. |

**In the capstone:** The workflow uses `paths: ['app/**']` as layer 1 and `[skip ci]` in the manifest commit message as layer 2. Both together make the loop impossible.

🇮🇳 **Hinglish intuition:** Loop = do aaine aamne-saamne (infinite reflection). `paths` = structural wall (manifest commit path alag hai). `[skip ci]` = explicit exit sign. `GITHUB_TOKEN` = platform ki built-in samajh (bot push = workflow trigger nahi).

---

## The `contents: write` permission gotcha

By default, the `GITHUB_TOKEN` has read-only access to the repository. When CI tries to `git push` the manifest update, it gets:

```
remote: Permission to repo.git denied to github-actions[bot]
```

The fix requires changes in **two places** — missing either one causes the same error:

```yaml
# 1. In the workflow YAML file:
permissions:
  contents: write   # allow this workflow to push commits

# 2. In GitHub UI:
# Settings → Actions → General → Workflow permissions → Read and write permissions
```

> 🔧 **War story:** CI pipeline ne ECR push kiya, fir manifest `git push` kiya — aur "Permission to repo.git denied to github-actions[bot]" mila. Ek ghante debug kiya: workflow YAML mein `permissions: contents: write` dala — phir bhi wohi error. Root cause: GitHub UI mein bhi repo Settings → Actions → General → "Read and write permissions" enable karna padta hai. Dono jagah change missing hai toh same error aata hai. Poori kahani + lesson → [Interview Bank](14-interview-bank.md).

This is a deliberate security default: workflows should not be able to modify the repository unless explicitly granted permission.

---

## Real production example

This is the actual `ci.yml` from the URL Shortener capstone project, annotated with the reasoning behind each choice.

```
git push app/main.py
    │
    ▼ GitHub detects push to main, path matches app/**
    │
    ▼ Runner: ubuntu-latest (fresh VM, nothing installed)
    │   actions/checkout@v4             ← get the code
    │   aws-actions/configure-aws-credentials@v4  ← inject AWS creds from secrets
    │   aws-actions/amazon-ecr-login@v2           ← authenticate to ECR
    │   docker build -t ECR:a3f8c1d ./app         ← build image, tag = commit SHA
    │   docker push ECR:a3f8c1d                   ← image in registry
    │   sed k8s/deployment.yaml                   ← replace old SHA with new SHA
    │   git commit "ci: update image [skip ci]"   ← write to Git
    │   git push                                  ← triggers Argo CD (not CI)
    │
    ▼ ECR: url-shortener:a3f8c1d (immutable, traceable)
    │
    ▼ Git: k8s/deployment.yaml updated
    │
    ▼ Argo CD (inside cluster) detects manifest change within 30 seconds
    │   kubectl apply (from inside cluster, no external creds)
    │
    ▼ Kubernetes: rolling update, new pods start with new image
    │   Old pods terminated after new pods pass readiness probe
    │
    ▼ Users see new version — zero manual steps from git push to deployment
```

Total elapsed time from `git push` to running pods: typically 3–5 minutes.

---

## Commands and config, explained

```bash
# Trigger a pipeline manually (GitHub CLI)
gh workflow run ci.yml --ref main
# Why: useful for testing the workflow without making a code change

# Check workflow run status
gh run list --workflow=ci.yml
gh run view <run-id> --log
# Why: faster than navigating the GitHub UI for quick status checks

# List secrets (names only, not values)
gh secret list
# Why: verify secrets are configured before debugging "Permission denied" errors

# Set a secret from a file or value
gh secret set AWS_KEY --body "AKIAIOSFODNN7EXAMPLE"
gh secret set ECR_URL < ecr_url.txt
# Why: scripting secret setup for new environments

# Manually build and push with the same tag format CI uses
SHA=$(git rev-parse HEAD)
docker build -t $ECR_URL:$SHA ./app
docker push $ECR_URL:$SHA
# Why: reproduce the exact CI artifact locally for debugging

# Validate a GitHub Actions workflow file syntax
gh workflow list          # check if the file is recognized
# Or: act (third-party tool to run Actions locally)
act push --job build-push
# Why: catch YAML syntax errors before pushing

# GitLab CI: validate .gitlab-ci.yml syntax
curl --header "PRIVATE-TOKEN: <token>" \
  "https://gitlab.com/api/v4/projects/<id>/ci/lint" \
  --form "content=$(cat .gitlab-ci.yml)"
# Why: GitLab has a built-in linter; catch errors before committing

# sed manifest update — the exact command CI runs
sed -i "s|image: .*url-shortener.*|image: ${ECR_URL}:${SHA}|" k8s/deployment.yaml
# -i = in-place (edit the file directly)
# s|pattern|replacement| = substitute (using | as delimiter to avoid escaping /)
# Why: replaces whatever image tag was there with the new SHA-tagged image

# Verify the sed worked
grep "image:" k8s/deployment.yaml
# Expected: image: 336129194698.dkr.ecr.ap-south-1.amazonaws.com/url-shortener:a3f8c1d
```

---

## Beginner mistakes vs senior insights

| Situation | Beginner approach | Senior insight |
|-----------|------------------|----------------|
| Image tagging | `docker push myapp:latest` | Tag with `${{ github.sha }}` — immutable, traceable, rollback-safe |
| Secrets | Put AWS key in `env:` block in YAML | Use GitHub Secrets; inject at runtime; never in source |
| Build failure | Re-run the pipeline | Read the actual error log; fix the root cause |
| Test failures in CI | Comment out failing test | Fix the test or the code; never bypass the test gate |
| Deploying | CI runs `kubectl apply` directly | CI updates the manifest; Argo CD deploys (manifest-update pattern) |
| Loop prevention | Notice the loop after it fires | Add `paths:` filter + `[skip ci]` proactively at design time |
| Manifest update permission | Confused by "Permission denied" | Know to add `permissions: contents: write` in YAML AND in repo settings |
| Runner choice | Always use `ubuntu-latest` | Pin to `ubuntu-22.04` for reproducibility; `ubuntu-latest` changes over time |
| Job order | All jobs run; hope for the best | Use `needs:` to enforce test → build → push ordering |
| Matrix builds | One service = one workflow | Matrix strategy fans out N services to N parallel runners |

---

## Memory shortcuts

- **CI = before the artifact. CD = after the artifact.** CI integrates and packages. CD delivers and deploys.
- **Runner = ephemeral.** Every job starts on a fresh VM. No state from previous runs. This is why you install dependencies in every run (or cache them).
- **SHA tag = your tracking number.** From ECR image to running pod to Git commit — one SHA connects everything.
- **`uses:` = someone else's tested code. `run:` = your shell command.** Prefer `uses:` for common tasks (checkout, auth, login) — they handle edge cases you will miss.
- **CI does not touch the cluster.** The manifest-update pattern keeps the blast radius of a CI compromise contained to the Git repository, not the production cluster.
- **`paths:` + `[skip ci]` = loop insurance.** Always add both when CI commits back to the repo.
- **`contents: write` in two places.** YAML permission block AND repo settings.

🇮🇳 **Hinglish intuition summary:**
- CI = har order pe quality-check (test gate)
- Runner = ek baar ka helper jo kaam ke baad gayab (ephemeral VM)
- Secrets = locker ki chaabi (encrypt, runtime inject)
- `github.sha` = har commit ka unique fingerprint (image tag)
- Manifest-update = CI ne cluster ko chhooha nahi, sirf Git mein tag badla

---

## Summary

A `git push` triggers a **workflow** defined in `.github/workflows/ci.yml`. The workflow runs on an **ephemeral runner** (fresh VM). Jobs execute in order (enforced by `needs:`). The test job runs `pytest` — if tests fail, the pipeline stops. If tests pass, the build job authenticates to ECR using **secrets**, builds a Docker image **tagged with the commit SHA**, and pushes it. Then it runs `sed` to update the image tag in `k8s/deployment.yaml`, commits the change with `[skip ci]` in the message, and pushes to Git. CI never runs `kubectl`. The **`paths:` filter** prevents this manifest commit from re-triggering the pipeline.

Argo CD (M7) watches the `k8s/` directory in Git. It detects the manifest change and applies it to the cluster — closing the loop from `git push` to running pods with zero manual steps.

**The three-way CI/CD distinction:** CI builds and tests on every push. Continuous Delivery keeps the artifact always deployable with a human approval gate to production. Continuous Deployment removes that gate entirely.

---

## Self-check quiz

Pehle memory se jawab do, phir neeche kholo.

1. What is the difference between Continuous Delivery and Continuous Deployment?
2. A job has `needs: test`. Under what conditions does this job NOT run?
3. Why should you never use `:latest` as a production image tag? What should you use instead?
4. You add `permissions: contents: write` to your workflow YAML, but CI still cannot push to the repo. What did you forget?
5. What is Docker-in-Docker (`docker:dind`) and why is it needed in GitLab CI?
6. Name three ways to prevent a CI manifest-update commit from triggering an infinite loop.
7. A matrix build fans out across three services. Service A takes 4 minutes, B takes 6 minutes, C takes 3 minutes. What is the total wall-clock time?
8. Why does the manifest-update pattern improve security compared to running `kubectl apply` directly from CI?

<details markdown="1"><summary>Jawab dekho</summary>

1. Continuous Delivery: artifact is always production-ready but a human manually approves the final push to production. Continuous Deployment: no human gate — every passing build goes to production automatically.
2. The `build-push` job does NOT run if the `test` job fails (exits non-zero). `needs: test` means it waits for `test` to complete successfully; failure cancels all downstream jobs.
3. `:latest` is mutable — can point to a different image at different times, making rollbacks impossible and builds non-reproducible. Use `${{ github.sha }}` — immutable, creates a 1:1 traceable link from running pod to the exact commit.
4. You must also enable "Read and write permissions" in GitHub UI: Settings → Actions → General → Workflow permissions. Both the YAML `permissions` block AND the UI setting are required.
5. Docker-in-Docker (dind) = a Docker daemon running inside a Docker container. Required in GitLab CI because runner jobs themselves execute inside containers; building a Docker image inside a container needs a nested daemon.
6. Three fixes: (1) `paths: ['app/**']` filter — manifest commit touches `k8s/`, outside the filter, so no re-trigger; (2) `[skip ci]` in the commit message — CI platform recognizes this and skips the workflow; (3) use built-in `GITHUB_TOKEN` to push — GitHub will not re-trigger workflows from `GITHUB_TOKEN` pushes.
7. Wall-clock = longest parallel job = 6 minutes (Service B). Jobs run in parallel — total is the maximum, not the sum (4+6+3 = 13m would be sequential).
8. With `kubectl apply` from CI, CI holds cluster credentials — a compromised runner can deploy anything to production. With manifest-update, CI only writes to Git; cluster credentials never leave the cluster. Argo CD (inside the cluster) polls Git and applies. Blast radius of a CI compromise = Git repo only, not the production cluster.
</details>

---

## Hands-on lab

### Part A — your first GitHub Actions pipeline

**Goal:** build a workflow that tests, builds, and pushes a Docker image on every push to `main`.

1. Take the URL Shortener app from the capstone (or any small app). Push it to a GitHub repository.

2. Create `.github/workflows/ci.yml`:
   ```yaml
   name: CI
   on:
     push:
       branches: [main]
       paths: ['app/**']
   
   jobs:
     test:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-python@v5
           with:
             python-version: '3.12'
         - run: pip install pytest && cd app && pytest
   
     build-push:
       needs: test
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - run: |
             docker build -t ghcr.io/${{ github.repository }}:${{ github.sha }} ./app
             echo ${{ secrets.GITHUB_TOKEN }} | docker login ghcr.io -u ${{ github.actor }} --password-stdin
             docker push ghcr.io/${{ github.repository }}:${{ github.sha }}
   ```
   Using GHCR (GitHub Container Registry) avoids needing AWS secrets for this lab.

3. In repo Settings → Actions → General → Workflow permissions, enable "Read and write permissions".

4. Push to `main`. Watch the Actions tab. Observe: test job runs first, build-push job waits, then both show green.

5. Intentionally break a test (add `assert False` to a test). Push. Observe: test job goes red, build-push job never starts.

6. Fix the test. Push. Watch the pipeline recover.

**What this proves:** the test gate stops broken code from producing an image. Feedback arrives in under 3 minutes.

### Part B — add the manifest-update step

1. Add a `k8s/deployment.yaml` with an image line (see the capstone for the full file).

2. Add a third step to the `build-push` job:
   ```yaml
       - name: Update manifest
         run: |
           sed -i "s|image: .*|image: ghcr.io/${{ github.repository }}:${{ github.sha }}|" \
             k8s/deployment.yaml
           git config user.name "ci-bot"
           git config user.email "ci@bot.com"
           git add k8s/deployment.yaml
           git commit -m "ci: update image to ${{ github.sha }} [skip ci]"
           git push
   ```

3. Push an app code change. Verify: in the Git commit history, you see the bot commit updating the SHA. Verify the `[skip ci]` tag means it does not trigger another run.

**What this proves:** the manifest-update pattern — CI writes to Git, does not touch the cluster. Argo CD would pick up this change automatically (covered in M7 — see [08-M7-gitops.md](08-M7-gitops.md)).

**✅ Sahi hua to aisa dikhega:** Part A mein GitHub Actions tab test job pehle green dikhata hai, phir build-push job green — aur intentionally broken test (`assert False`) ke baad build-push job kabhi shuru hi nahi hota (red test = image push nahi, zero images in GHCR). Part B mein `git log` mein ek bot commit dikhta hai jisme `k8s/deployment.yaml` ka image tag bilkul naye commit SHA se updated hai, commit message mein `[skip ci]` hai, aur GitHub Actions tab confirm karta hai ki us commit ne koi naya workflow run trigger nahi kiya.

---

## Interview questions

**Q: What is the difference between CI, Continuous Delivery, and Continuous Deployment?**

CI automatically integrates, builds, and tests every code change. Continuous Delivery extends this so the artifact is always production-ready, but a human approves the final push to production. Continuous Deployment removes the human gate — every passing build goes to production automatically. Most organizations use Delivery for safety; high-velocity SaaS teams often use Deployment with strong automated test suites.

**Q: Walk me through what happens when a developer pushes code to the main branch.**

The push triggers the GitHub Actions workflow via the `on: push: branches: [main]` event. A runner (fresh Ubuntu VM) is allocated. The test job checks out the code and runs the test suite — if tests fail, the pipeline stops. If they pass, the build job authenticates to the registry using secrets, builds a Docker image tagged with the commit SHA, and pushes it. Then a `sed` command updates the image tag in the Kubernetes manifest YAML, and the updated file is committed and pushed to Git with `[skip ci]` in the message. Argo CD detects the manifest change and applies it to the cluster. Total time: 3–5 minutes.

**Q: Why use `${{ github.sha }}` as the image tag instead of `latest`?**

The `latest` tag is mutable — it can point to different images at different times. If different environments pull at different moments, they may get different images. `latest` also makes rollback impossible because you cannot know which version you are rolling back to. The commit SHA is immutable: a given SHA always maps to the same image, forever. It creates a traceable link from the running pod back to the exact code change that produced it.

**Q: Your CI pipeline commits a manifest update to the repo and then triggers itself in an infinite loop. How do you fix it?**

Three approaches: First, use a `paths:` filter so the workflow only triggers when files under `app/` change — the manifest commit touches `k8s/`, which is outside the filter. Second, add `[skip ci]` to the manifest commit message — the CI platform recognizes this and skips the workflow. Third, ensure the workflow uses the built-in `GITHUB_TOKEN` rather than a PAT for pushing — GitHub does not re-trigger workflows from pushes made with `GITHUB_TOKEN`. In production, use at least two of these layers.

**Q: Why does the manifest-update pattern improve security compared to `kubectl apply` from CI?**

When CI runs `kubectl apply` directly, it must hold cluster credentials (a kubeconfig or a service account token). If the CI system is compromised — a malicious pull request executes arbitrary code in the runner, for example — the attacker has cluster credentials and can deploy anything. With manifest-update, CI only has write access to a Git repository. The cluster credentials never leave the cluster; Argo CD (running inside) polls Git and applies changes. A compromised CI system can write to Git, but Argo CD only applies changes that match the expected manifest structure. The blast radius is narrowed.

**Q: How do Jenkins, GitHub Actions, and GitLab CI differ? When would you choose each?**

Jenkins is a self-hosted server with the widest plugin ecosystem but requires ongoing maintenance (server patching, plugin updates, agent management). Choose it for complex legacy pipelines, on-premises requirements, or when you need deep customization. GitHub Actions is built into GitHub — zero setup beyond a YAML file, excellent for projects already on GitHub. GitLab CI is built into GitLab, ideal when your team uses GitLab for source control and wants a single platform. The core concepts — stages, runners/agents, artifacts, secrets, triggers — are identical across all three.

---

## Production challenge

You have been asked to migrate a three-service application (API, worker, frontend) from manual deployments to a fully automated CI/CD pipeline. Requirements: tests must pass before any image is built; each service must be built in parallel to keep total pipeline time under 5 minutes; the `main` branch is protected and requires CI to pass before merge; rollback must be possible by reverting a Git commit; the CI system must not hold cluster credentials.

Design the workflow structure. Specify: how you structure the jobs (test gate, matrix build, manifest-update), what secrets are required, how you prevent the infinite loop, what permissions are needed in the YAML, and how Argo CD fits into the deployment side. Draw the data flow from `git push` to running pods.

Consider: what happens if the manifest-update `sed` command matches the wrong line in a multi-service YAML file? How do you make the pattern match precise enough to update only the right service's image tag?

---

**Next module:** [08-M7-gitops.md](08-M7-gitops.md) — Argo CD picks up exactly where this module ends: it watches the Git manifest that CI just updated and reconciles the cluster to match.

**Connected system view:** [09-connected-system.md](09-connected-system.md) explains how CI/CD connects to Terraform, Ansible, Docker, Kubernetes, and GitOps as a single production pipeline — including Golden Thread 4 (push vs pull).
