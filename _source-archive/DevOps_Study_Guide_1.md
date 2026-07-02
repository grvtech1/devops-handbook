# DevOps Interview Study Guide
### Docker · CI/CD (GitHub Actions & GitLab) · Ansible

> Prepared for: Gaurav Pal — DevOps Engineer (2.5 yrs)
> Goal: interview-ready depth with hands-on labs and Q&A
> Recommended order: Docker → CI/CD → Ansible

---

## How to use this guide

Each tool has five parts:
1. **Concept** — what it is, why it exists, the mental model
2. **Core building blocks** — the pieces you must know cold
3. **Commands cheat-sheet** — what you'll actually type
4. **Hands-on lab** — do this on a real machine; it becomes your "I've done it" proof
5. **Interview Q&A** — the questions that actually get asked, with model answers

Do the labs. Reading alone won't survive follow-up questions — interviewers probe whether you've actually run the commands.

---
---

# PART 1 — DOCKER

## 1.1 Concept

Docker is a **containerization platform**. A container packages your application together with everything it needs to run — runtime, libraries, system dependencies, config — into a single, portable unit called an **image**. That image runs identically on your laptop, a test server, or production.

**The problem it solves:** "It works on my machine." Before containers, an app might run on a developer's laptop but break in production because of different library versions, OS differences, or missing dependencies. A container freezes the entire environment, so there's no drift between environments.

**Container vs Virtual Machine — the key distinction (asked constantly):**
A VM virtualizes the entire hardware and runs a full guest OS (its own kernel). A container virtualizes only the OS — all containers on a host **share the host's kernel** and isolate at the process level using Linux features (namespaces for isolation, cgroups for resource limits). Result: containers are lightweight (MBs not GBs), start in seconds not minutes, and you can run many more per host. A VM gives stronger isolation; a container gives speed and density.

**Mental model:** A VM is a separate house with its own foundation, plumbing, and electricity. A container is an apartment in a shared building — it has its own private space (your stuff is isolated) but shares the building's foundation and utilities (the host kernel).

## 1.2 Core building blocks

- **Image** — a read-only template built from a Dockerfile. Immutable. Built once, run anywhere. Made of stacked **layers** (each instruction in a Dockerfile = one layer; layers are cached and reused).
- **Container** — a running (or stopped) instance of an image. You can run many containers from one image. A thin writable layer sits on top of the read-only image layers.
- **Dockerfile** — the recipe. A text file of instructions that build an image.
- **Registry** — where images are stored and shared (Docker Hub, AWS ECR, GitLab registry). `push` to upload, `pull` to download.
- **Volume** — persistent storage that lives outside the container's lifecycle. Containers are ephemeral — delete one and its writable layer is gone. Volumes keep data (databases, uploads) safe across container restarts/replacements.
- **Network** — Docker creates virtual networks so containers can talk to each other by name. Key for multi-container apps.
- **Docker Compose** — a tool to define and run multi-container apps with one YAML file (`docker-compose.yml`) and one command (`docker compose up`).

## 1.3 Dockerfile — the instructions you must know

| Instruction | What it does |
|---|---|
| `FROM` | Base image to build on (e.g. `node:18-alpine`). Always first. |
| `WORKDIR` | Sets the working directory inside the image. |
| `COPY` | Copies files from build context into the image. |
| `RUN` | Executes a command at **build time** (e.g. install packages). Creates a layer. |
| `ENV` | Sets environment variables. |
| `EXPOSE` | Documents which port the app listens on (informational). |
| `CMD` | Default command run at **container start**. Can be overridden. |
| `ENTRYPOINT` | The fixed executable run at start; `CMD` becomes its args. |

**`RUN` vs `CMD` vs `ENTRYPOINT` (classic question):**
`RUN` happens once, at build time, baking into the image. `CMD` and `ENTRYPOINT` happen at runtime, when the container starts. `CMD` is easily overridden by `docker run ... <command>`; `ENTRYPOINT` is the fixed thing that always runs. Common pattern: `ENTRYPOINT ["python"]` + `CMD ["app.py"]` → runs `python app.py`, but you can swap the arg.

**Multi-stage builds (a strong thing to mention):**
Use one stage with the full build toolchain to compile/build, then copy only the final artifact into a small runtime image. The heavy build tools never ship to production. This drastically shrinks image size and attack surface.

```dockerfile
# Stage 1: build
FROM node:18 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: runtime (small)
FROM node:18-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

**Image optimization tips (shows seniority):**
- Use a small base image (`alpine`, `slim`, or distroless).
- Order instructions so rarely-changing layers come first (dependencies before source code) to maximize cache hits.
- Combine related `RUN` commands with `&&` to reduce layers.
- Use `.dockerignore` to keep `node_modules`, `.git`, secrets out of the build context.
- Multi-stage builds to drop build tooling.
- Never bake secrets into layers — they remain in image history even if deleted later.

## 1.4 Commands cheat-sheet

```bash
# Images
docker build -t myapp:1.0 .          # build image from Dockerfile in current dir
docker images                        # list images
docker pull nginx:latest             # download an image
docker push myrepo/myapp:1.0         # upload to registry
docker rmi myapp:1.0                 # remove image
docker history myapp:1.0             # see layers

# Containers
docker run -d -p 8080:80 --name web nginx   # run detached, map host:container port
docker ps                            # running containers
docker ps -a                         # all containers (incl stopped)
docker logs web                      # view container logs
docker exec -it web bash             # shell into a running container
docker stop web / docker start web   # stop / start
docker rm web                        # remove a container

# Cleanup
docker system prune -a               # remove unused images/containers/networks

# Volumes & networks
docker volume create data
docker run -v data:/var/lib/mysql mysql
docker network create appnet

# Compose
docker compose up -d                 # start all services from docker-compose.yml
docker compose down                  # stop and remove
docker compose logs -f               # follow logs
```

## 1.5 Hands-on lab — Docker

**Goal:** build an image, run it, push it, and write a multi-container Compose stack.

**Lab A — build & run a simple app**
1. Create a folder with a tiny app (any language; example below is Node).
2. `app.js`:
   ```js
   const http = require('http');
   http.createServer((req, res) => res.end('Hello from Docker\n')).listen(3000);
   ```
3. `Dockerfile`:
   ```dockerfile
   FROM node:18-alpine
   WORKDIR /app
   COPY app.js .
   EXPOSE 3000
   CMD ["node", "app.js"]
   ```
4. Build and run:
   ```bash
   docker build -t hello-docker:1.0 .
   docker run -d -p 3000:3000 --name hello hello-docker:1.0
   curl localhost:3000        # → Hello from Docker
   docker logs hello
   docker exec -it hello sh   # poke around inside
   ```
5. Push (after `docker login`):
   ```bash
   docker tag hello-docker:1.0 <your-dockerhub-user>/hello-docker:1.0
   docker push <your-dockerhub-user>/hello-docker:1.0
   ```

**Lab B — multi-container with Compose**
`docker-compose.yml` — a web app + a Redis cache:
```yaml
services:
  web:
    build: .
    ports:
      - "3000:3000"
    depends_on:
      - redis
  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data
volumes:
  redisdata:
```
```bash
docker compose up -d
docker compose ps
docker compose logs -f web
docker compose down
```
Observe: the `web` container reaches `redis` by the service name `redis` (Docker's internal DNS). The volume keeps Redis data across restarts.

**What to save as proof:** terminal output of `docker build`, `docker ps`, `curl`, and `docker compose ps`. These back up "I've containerized apps and run multi-container stacks."

## 1.6 Interview Q&A — Docker

**Q: Difference between a container and a VM?**
A VM runs a full guest OS with its own kernel on virtualized hardware; a container shares the host kernel and isolates at the process level via namespaces and cgroups. Containers are lighter, faster to start, and denser per host; VMs give stronger isolation.

**Q: Image vs container?**
An image is an immutable, read-only template (built from a Dockerfile). A container is a running instance of an image with a thin writable layer on top. One image, many containers.

**Q: What are image layers and why do they matter?**
Each Dockerfile instruction creates a layer. Layers are cached and shared between images. Ordering instructions so stable layers come first maximizes cache reuse and speeds up builds.

**Q: CMD vs ENTRYPOINT?**
`ENTRYPOINT` is the fixed executable; `CMD` provides default arguments and is easily overridden at `docker run`. Combined, `ENTRYPOINT` defines what runs and `CMD` defines the default args.

**Q: How do you reduce image size?**
Small base image (alpine/distroless), multi-stage builds to drop build tooling, combine RUN layers, `.dockerignore`, and avoid installing unnecessary packages.

**Q: How does data persist if containers are ephemeral?**
Volumes. They live outside the container lifecycle, so data survives container removal and replacement. Bind mounts map a host path; named volumes are Docker-managed.

**Q: How do two containers communicate?**
On a shared Docker network they resolve each other by container/service name via Docker's embedded DNS. Compose puts services on a shared network automatically.

**Q: A container exits immediately after starting — how do you debug?**
Check `docker logs <name>`, inspect the exit code with `docker ps -a`, verify the `CMD`/`ENTRYPOINT` actually starts a long-running foreground process (a container stops when its main process exits), and exec in with a shell override if needed.

---
---

# PART 2 — CI/CD (GitHub Actions & GitLab CI/CD)

## 2.1 Concept

**CI (Continuous Integration):** every code change is automatically built and tested as soon as it's pushed, so integration problems surface immediately instead of piling up.

**CD (Continuous Delivery/Deployment):** after CI passes, the change is automatically prepared for release (Delivery = ready to deploy with a manual approval; Deployment = pushed to production automatically, no human step).

**Why it exists:** manual build-test-deploy is slow, inconsistent, and error-prone. A pipeline makes the path from commit to production automated, repeatable, and fast — and it fails loudly the moment something breaks.

**The universal pipeline shape** (every CI tool is a variation of this):
```
trigger (push/PR) → checkout code → build → test → package (Docker image) → push to registry → deploy
```

You already know this from Jenkins. GitHub Actions and GitLab CI are the same idea expressed in **YAML committed to your repo**, instead of configured in a separate server UI. That's the main mental shift: pipeline-as-code lives next to the app code.

## 2.2 Key shared concepts (apply to both tools)

- **Pipeline / Workflow** — the whole automated process.
- **Stage** — a logical phase (build, test, deploy). Stages run in order.
- **Job** — a unit of work within a stage. Jobs in the same stage can run in parallel.
- **Step / Script** — the individual commands inside a job.
- **Runner / Agent** — the machine that actually executes the job (ephemeral, isolated).
- **Trigger / Event** — what starts the pipeline (push, pull/merge request, tag, schedule, manual).
- **Artifact** — files produced by a job (a build output, test report) passed to later jobs or stored.
- **Secrets / Variables** — credentials (registry login, cloud keys) stored securely in the platform, injected at runtime — never hardcoded in YAML.
- **Cache** — reused dependencies (e.g. `node_modules`) to speed up runs.

## 2.3 GitHub Actions

**Where it lives:** `.github/workflows/*.yml` in your repo. GitHub runs it automatically on the configured event — no external server to maintain.

**Structure:** a **workflow** contains **jobs**; each job runs on a **runner** and has **steps**. Steps either run shell commands (`run:`) or use prebuilt **actions** (`uses:`) from the marketplace (e.g. `actions/checkout`).

**Example — build, test, and push a Docker image:**
```yaml
name: CI Pipeline
on:
  push:
    branches: [ main ]
  pull_request:

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

  docker-push:
    needs: build-and-test        # runs only if build-and-test passed
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - name: Log in to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USER }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
      - name: Build and push
        run: |
          docker build -t ${{ secrets.DOCKERHUB_USER }}/myapp:${{ github.sha }} .
          docker push ${{ secrets.DOCKERHUB_USER }}/myapp:${{ github.sha }}
```

**Things to understand in that file:**
- `on:` = triggers (push to main, and any PR).
- `jobs:` run in parallel by default; `needs:` creates dependency/ordering.
- `${{ secrets.X }}` pulls from repo Settings → Secrets — never written in plain text.
- `${{ github.sha }}` tags the image with the exact commit — traceable, reproducible.
- `if:` conditions control when a job runs (here: only on main).

## 2.4 GitLab CI/CD

**Where it lives:** a single `.gitlab-ci.yml` at the repo root. GitLab's built-in CI runs it.

**Structure:** define `stages:` (order), then jobs that each declare which `stage:` they belong to and a `script:` to run. Jobs in the same stage run in parallel; stages run sequentially.

**Example — equivalent pipeline:**
```yaml
stages:
  - build
  - test
  - deploy

variables:
  IMAGE: registry.gitlab.com/$CI_PROJECT_PATH:$CI_COMMIT_SHA

build_job:
  stage: build
  image: node:18
  script:
    - npm ci
    - npm run build
  artifacts:
    paths:
      - dist/

test_job:
  stage: test
  image: node:18
  script:
    - npm test

deploy_job:
  stage: deploy
  image: docker:latest
  services:
    - docker:dind          # docker-in-docker to build images
  script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
    - docker build -t $IMAGE .
    - docker push $IMAGE
  only:
    - main                 # run this job only on the main branch
```

**Things to understand:**
- `stages:` defines order; each job maps to a stage.
- `artifacts:` passes `dist/` from build to later stages.
- `$CI_*` are GitLab's built-in predefined variables (commit SHA, registry URL, project path).
- `only: - main` restricts the job to the main branch (newer syntax: `rules:`).
- `services: docker:dind` lets a job build Docker images inside the pipeline.

## 2.5 GitHub Actions vs GitLab CI vs Jenkins (comparison — great interview material)

| Aspect | Jenkins | GitHub Actions | GitLab CI |
|---|---|---|---|
| Hosting | Self-hosted server you maintain | Hosted by GitHub (runners managed or self-hosted) | Built into GitLab |
| Config | `Jenkinsfile` (Groovy) or UI | `.github/workflows/*.yml` | `.gitlab-ci.yml` |
| Setup effort | High (plugins, server, agents) | Low | Low |
| Trigger | Webhook / polling | Native repo events | Native repo events |
| Ecosystem | Huge plugin library | Marketplace actions | Built-in features |
| Best when | Full control, complex/legacy | Code already on GitHub | All-in-one GitLab shop |

**One-liner for interviews:** "Jenkins is a powerful self-hosted server with the widest plugin ecosystem but more maintenance; GitHub Actions and GitLab CI are pipeline-as-code built into the platform, with far less setup. I've used Jenkins in production and the concepts — stages, agents, artifacts, secrets — transfer directly."

## 2.6 Hands-on lab — CI/CD

**Goal:** a real pipeline that builds, tests, and pushes a Docker image on every push.

**Lab (GitHub Actions):**
1. Take the Docker app from Part 1, push it to a GitHub repo.
2. Add `.github/workflows/ci.yml` (use the example in 2.3, simplified to build + test first).
3. In repo Settings → Secrets, add `DOCKERHUB_USER` and `DOCKERHUB_TOKEN`.
4. Push to `main` and watch the Actions tab — see the job run, logs stream, green check appear.
5. Intentionally break a test, push, and watch the pipeline go red and block. Fix it, push, watch it recover.

**Lab (GitLab CI) — optional but doubles your keyword coverage:**
1. Mirror the repo to GitLab (free).
2. Add `.gitlab-ci.yml` (example in 2.4).
3. Add CI/CD variables in Settings → CI/CD → Variables.
4. Push and watch the pipeline under CI/CD → Pipelines.

**What to save as proof:** screenshots of a green pipeline run and the YAML file. Resume line becomes true: "Built CI/CD pipelines with GitHub Actions / GitLab CI to build, test, and push Docker images automatically on push."

## 2.7 Interview Q&A — CI/CD

**Q: Difference between CI and CD?**
CI automatically builds and tests every change on integration. CD extends that — Continuous Delivery keeps the build always deployable with a manual release approval; Continuous Deployment ships to production automatically with no manual gate.

**Q: What triggers a pipeline?**
Events: a push, a pull/merge request, a tag, a schedule (cron), or a manual run. In GitHub Actions it's the `on:` block; in GitLab it's `rules:`/`only:` and webhooks.

**Q: How do you handle secrets in a pipeline?**
Store them in the platform's secret store (GitHub repo secrets, GitLab CI/CD variables) and inject at runtime as masked variables. Never commit secrets to YAML or the repo. Rotate them and scope to least privilege.

**Q: Jobs vs stages?**
A stage is an ordered phase (build → test → deploy). Jobs live in stages; jobs in the same stage run in parallel, stages run sequentially. Ordering across jobs is done with `needs:` (Actions) or stage order (GitLab).

**Q: How do you pass build output between stages?**
Artifacts — a job publishes files (e.g. `dist/`, a jar) and later jobs consume them. Caches are for reusable dependencies to speed runs; artifacts are for build outputs.

**Q: How do you make builds reproducible?**
Pin versions (base images, dependencies), build from the exact commit SHA, tag images with the SHA, and run in clean ephemeral runners so no state leaks between runs.

**Q: Your pipeline passes locally but fails in CI — why?**
Environment differences: missing env vars/secrets in CI, different tool versions, reliance on local files not committed, or services (DB) available locally but not in the runner. Fix by containerizing the build and declaring all dependencies explicitly.

---
---

# PART 3 — ANSIBLE

## 3.1 Concept

Ansible is a **configuration management and automation tool**. It configures servers, deploys apps, and orchestrates multi-machine workflows — by describing the desired state in YAML and applying it over SSH.

**The problem it solves:** once you have servers (from Terraform, a cloud console, or bare metal), they're empty — just an OS. You need to install packages, copy app code, write config, and start services, consistently across many machines. Doing it manually doesn't scale and drifts. Ansible makes it codified, repeatable, and consistent.

**Three defining properties (must know):**
- **Agentless** — no software installed on managed nodes. Ansible connects over **SSH** (which Linux servers already have). This is its big advantage over agent-based tools (Puppet/Chef).
- **Idempotent** — running the same playbook multiple times produces the same result. Ansible checks current state before acting: if nginx is already installed, it skips. It enforces desired state rather than blindly running commands. This is why it beats a plain Bash script — Bash re-runs everything every time.
- **Declarative (mostly)** — you describe the end state ("nginx is installed and running"), not the step-by-step how.

**Terraform vs Ansible (the classic confusion):**
Terraform **provisions infrastructure** (creates servers, networks, load balancers) — it builds the house. Ansible **configures** what's inside those servers (installs software, deploys app) — it furnishes the house. They're complementary: Terraform makes the empty server, Ansible makes it app-ready. Terraform is declarative IaC for cloud resources; Ansible is config management for server state.

**Mental model:** Ansible is a checklist a meticulous worker follows on each server over SSH. Before each item the worker checks "is this already done?" — if yes, skip; if no, do it. Run the checklist again tomorrow and nothing changes unless something drifted.

## 3.2 Core building blocks

- **Control node** — the machine you run Ansible from (your laptop or a CI runner). Ansible is installed only here.
- **Managed nodes** — the target servers being configured. Nothing installed on them except SSH + Python.
- **Inventory** — a file listing the managed nodes, often grouped (`[webservers]`, `[dbservers]`). Can be static (a file) or dynamic (pulled from AWS).
- **Module** — a unit of work Ansible ships (e.g. `apt`, `yum`, `copy`, `service`, `template`, `user`). Modules are idempotent. You rarely write raw shell.
- **Task** — a single action that calls a module ("install nginx using the apt module").
- **Play** — maps a group of hosts to a list of tasks.
- **Playbook** — a YAML file containing one or more plays. The main thing you write.
- **Role** — a reusable, structured bundle of tasks, variables, templates, and handlers (for organizing large setups).
- **Handler** — a task triggered only when notified by a change (e.g. "restart nginx" only if the config actually changed).
- **Variables & Templates** — variables parameterize playbooks; **Jinja2 templates** (`.j2`) generate config files dynamically per host.

## 3.3 Playbook anatomy

```yaml
---
- name: Configure web servers          # a play
  hosts: webservers                    # which inventory group
  become: yes                          # run with sudo/root
  vars:
    app_port: 3000

  tasks:
    - name: Install nginx
      apt:
        name: nginx
        state: present                 # idempotent: ensures installed
      # 'state: present' = make sure it's there; won't reinstall if already present

    - name: Copy app config from template
      template:
        src: nginx.conf.j2
        dest: /etc/nginx/nginx.conf
      notify: Restart nginx            # triggers the handler only if file changed

    - name: Ensure nginx is running and enabled on boot
      service:
        name: nginx
        state: started
        enabled: yes

  handlers:
    - name: Restart nginx
      service:
        name: nginx
        state: restarted
```

**Read this carefully — every interview point is here:**
- `hosts: webservers` maps the play to an inventory group.
- `become: yes` = privilege escalation (sudo).
- `state: present` / `started` / `enabled` = declarative desired state; Ansible makes reality match, idempotently.
- `template` + `.j2` = dynamic config generation with variables.
- `notify` + `handlers` = only restart the service if config actually changed (efficiency + avoids needless restarts).

## 3.4 Inventory example

```ini
[webservers]
web1 ansible_host=10.0.1.10
web2 ansible_host=10.0.1.11

[dbservers]
db1 ansible_host=10.0.2.10

[webservers:vars]
ansible_user=ubuntu
ansible_ssh_private_key_file=~/.ssh/id_rsa
```

## 3.5 Commands cheat-sheet

```bash
# Ad-hoc commands (one-off, no playbook)
ansible all -i inventory.ini -m ping                 # test connectivity
ansible webservers -i inventory.ini -m apt -a "name=nginx state=present" --become
ansible all -i inventory.ini -a "uptime"             # run a shell command

# Playbooks
ansible-playbook -i inventory.ini site.yml           # run a playbook
ansible-playbook -i inventory.ini site.yml --check    # dry run (no changes)
ansible-playbook -i inventory.ini site.yml --limit web1   # only one host
ansible-playbook -i inventory.ini site.yml --tags "config" # only tagged tasks
ansible-playbook site.yml -vvv                       # verbose (debugging)

# Roles & vault
ansible-galaxy init myrole                            # scaffold a role
ansible-vault encrypt secrets.yml                     # encrypt secrets file
ansible-vault edit secrets.yml
ansible-playbook site.yml --ask-vault-pass
```

## 3.6 Hands-on lab — Ansible

**Goal:** configure a real server from empty to running nginx, idempotently.

**Setup:** use the EC2 instance you create in the Terraform lab, or any Linux VM you can SSH into. Install Ansible on your control machine (`pip install ansible` or `apt install ansible`).

**Steps:**
1. Create `inventory.ini` with your server's IP and SSH user/key (see 3.4).
2. Test connectivity:
   ```bash
   ansible all -i inventory.ini -m ping
   ```
   Expect `SUCCESS` + `"ping": "pong"`.
3. Create `webserver.yml` (use the playbook from 3.3, simplified — install nginx + ensure running).
4. Dry run first:
   ```bash
   ansible-playbook -i inventory.ini webserver.yml --check
   ```
5. Apply:
   ```bash
   ansible-playbook -i inventory.ini webserver.yml --become
   ```
   Watch the output: `changed` for tasks that did something.
6. **Prove idempotency** — run it again:
   ```bash
   ansible-playbook -i inventory.ini webserver.yml --become
   ```
   This time everything shows `ok` (0 changed). This is the key observation — say it in interviews.
7. `curl http://<server-ip>` → nginx welcome page.

**What to save as proof:** the playbook, and the two run outputs (first run with `changed`, second run with `0 changed`). That second output literally demonstrates idempotency.

## 3.7 Interview Q&A — Ansible

**Q: What is Ansible and why agentless?**
A configuration management tool that automates server setup using YAML over SSH. Agentless means no software runs on managed nodes — it connects via SSH using Python already present on most Linux hosts. Less to install, maintain, and secure compared to agent-based tools.

**Q: What is idempotency and why does it matter?**
Running the same playbook repeatedly yields the same end state — Ansible checks current state and only changes what's needed. It matters because you can safely re-run playbooks to enforce/repair state without side effects, unlike a Bash script that blindly re-executes.

**Q: Ansible vs Terraform?**
Terraform provisions infrastructure (creates cloud resources) — declarative IaC. Ansible configures servers (installs/deploys software inside them). Terraform builds the house; Ansible furnishes it. Often used together: Terraform makes the server, Ansible configures it.

**Q: Playbook vs role?**
A playbook is a YAML file of plays/tasks. A role is a structured, reusable bundle (tasks, vars, templates, handlers) you include across playbooks for larger, organized setups.

**Q: What are handlers?**
Tasks that run only when notified by a change — e.g. restart nginx only if its config file actually changed. Avoids unnecessary restarts and keeps runs efficient.

**Q: How do you manage secrets in Ansible?**
Ansible Vault — encrypt sensitive files/variables; supply the vault password at runtime. Never store plaintext credentials in playbooks or inventory.

**Q: How does Ansible connect and authenticate?**
Over SSH using keys (or passwords), with the user/key defined in inventory or config. `become: yes` escalates privileges via sudo for tasks needing root.

**Q: Ansible vs a Bash script — why bother?**
Idempotency (state checks vs blind execution), readable declarative YAML, a huge library of tested modules, built-in inventory/multi-host orchestration, templating, and error handling. Bash works for one server one-off; Ansible scales across fleets reliably.

---
---

# PART 4 — HOW THEY CONNECT (the full picture)

These three tools are stages of one pipeline. Knowing how they hand off to each other is what separates someone who memorized tools from someone who understands the system.

```
Developer pushes code
        │
        ▼
CI/CD (GitHub Actions / GitLab CI)   ← triggered on push
   - checkout, build, run tests
   - build a DOCKER image
   - push image to a registry
        │
        ▼
DOCKER image in registry             ← the portable, immutable artifact
        │
        ├──────────────► VM-based path:
        │                Ansible configures servers, pulls & runs the image
        │
        └──────────────► Container-orchestration path:
                         Kubernetes pulls the image and runs it as pods
```

**The handoffs:**
- **CI/CD → Docker:** the pipeline's "package" stage runs `docker build` and `docker push`. CI/CD is the automation; Docker is the artifact it produces.
- **Docker → Ansible:** in a VM-based deployment, Ansible installs Docker on the server, pulls the image from the registry, and runs it — plus any host-level config. Ansible can also be *called from* the CI/CD pipeline as the deploy step.
- **Docker → Kubernetes:** in a container-orchestration deployment, Kubernetes pulls the same image and runs it, handling scaling and self-healing. Here Ansible's role shrinks (config is baked into the image).

**Where Ansible fits today (nuance worth saying):** in modern containerized setups, much of what Ansible used to do (install runtimes, copy app, set config) is baked into the Docker image instead. Ansible remains valuable for host-level setup, VM-based fleets, network gear, and orchestration tasks — but on a Kubernetes stack its role is smaller. Knowing *when* each is used signals real understanding.

---

# PART 5 — QUICK REVISION (the morning-of cheat sheet)

**Docker** — packages app + dependencies into a portable image; containers share the host kernel (lighter than VMs). Image = template, container = running instance. Dockerfile builds it, registry stores it, volumes persist data, Compose runs multi-container apps. Optimize with multi-stage builds + small base images.

**CI/CD** — automates build → test → package → deploy on every push. GitHub Actions (`.github/workflows/*.yml`) and GitLab CI (`.gitlab-ci.yml`) are pipeline-as-code in the repo; Jenkins is the self-hosted equivalent. Secrets stay in the platform's secret store, jobs run on ephemeral runners, artifacts pass build output between stages.

**Ansible** — agentless config management over SSH; idempotent (checks state, only changes what's needed). Inventory lists hosts, playbooks (YAML) define desired state via modules, handlers restart only on change, Vault holds secrets. Terraform builds servers; Ansible configures them.

**The one-sentence system view:** "Code is pushed, CI/CD builds and tests it and produces a Docker image in a registry, then either Ansible configures servers to run that image or Kubernetes orchestrates it — with monitoring watching the whole thing and feeding problems back to the developer."

---

*End of guide. Do the three labs (Docker build+Compose, a real CI pipeline, an idempotent Ansible run) — the hands-on output is what makes your interview answers credible under follow-up questions.*
