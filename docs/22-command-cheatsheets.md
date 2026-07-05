# 22 — Hands-On Command Cheat-Sheets & Labs

> **What this is:** The terminal-open muscle-memory companion to the teaching modules. Every command here is runnable — not pseudocode. Open a terminal alongside this page and type every block; observe the output. The "say this" boxes are interview gold: read them aloud until the answer comes back without looking.
>
> **How to use:** Work through one tool section per study session. Mark commands you can type cold; revisit anything that required a peek.
>
> **Pairs with:** [Interview Bank](14-interview-bank.md) · [Reference Appendix](16-reference-appendix.md)

> ⭐ **Golden rule: Reading ≠ knowing — run every command yourself.**

---

## Contents

| # | Tool | Key topics |
|---|------|-----------|
| [1](#-git) | 🌿 Git | 3-area model · everyday · branching · undo · rebase · reflog |
| [2](#-docker) | 🐳 Docker | images · containers · Dockerfile · Compose · debug flow |
| [3](#-kubectl-kubernetes) | ☸️ kubectl | pods · deployments · services · CrashLoopBackOff debug |
| [4](#-ansible) | ⚙️ Ansible | inventory · playbooks · idempotency · roles · vault |
| [5](#-terraform) | 🏗️ Terraform | HCL · plan/apply · state · modules · environments |
| [6](#-gitops--argocd) | 🔄 GitOps / ArgoCD | Application CRD · sync · drift · App-of-Apps |
| [7](#-jenkins) | 🔧 Jenkins | Jenkinsfile anatomy · credentials · parallel · shared libs |

---

## 🌿 Git

**Mental model:** Working Directory `──git add──▶` Staging Area (Index) `──git commit──▶` Local Repo (`.git`) `──git push──▶` Remote. You always know exactly where a change lives.

→ Deep concepts: [00a — Preflight](00a-preflight.md) · [20 — Confusions & Trade-offs](20-confusions-and-tradeoffs.md)

---

### Everyday commands

| Goal | Command | Why |
|------|---------|-----|
| See current state | `git status` | First thing, every time — what's staged, what's not |
| Stage one file | `git add file.py` | Precise — stage only what belongs in this commit |
| Stage everything | `git add .` | Quick; watch for unintended files |
| Commit | `git commit -m "feat: add login"` | Conventional commit type prefix keeps history readable |
| Stage + commit (tracked files only) | `git commit -am "fix: typo"` | Skips `add` for already-tracked files |
| Compact log | `git log --oneline --graph --all` | See branch topology at a glance |
| Unstaged diff | `git diff` | What changed but is NOT staged |
| Staged diff | `git diff --staged` | What WILL go into the next commit |
| Inspect one commit | `git show <hash>` | Full diff + metadata for any commit |

---

### Branching, merging, and rebasing

```bash
# Create and switch to a new branch
git checkout -b feature/login       # classic (still works everywhere)
git switch -c feature/login         # modern equivalent (preferred)

# Merge — preserves full history, adds a merge commit
git checkout main
git merge feature/login
git branch -d feature/login         # delete the merged branch

# Rebase — replays commits on top of latest main → linear history
git checkout feature/login
git rebase main                     # feature now sits on tip of main
# Rule: rebase LOCAL branches only. Never rebase a branch others have pulled.

# Interactive rebase — squash, edit, or reorder commits before merging
git rebase -i HEAD~3
```

**LAB A — basic branch & merge**

```bash
git init lab-git && cd lab-git
git commit --allow-empty -m "init"
git switch -c feature/readme
echo "# Demo" > README.md
git add . && git commit -m "docs: add readme"
git switch main
git merge feature/readme
git branch -d feature/readme
git log --oneline --graph
```

**LAB B — conflict resolution (the #1 interview skill)**

```bash
# Two branches edit the SAME line in the SAME file
git switch -c branchA
echo "hello from A" > greet.txt && git add . && git commit -m "A"
git switch main
echo "hello from main" > greet.txt && git add . && git commit -m "main"
git merge branchA               # CONFLICT — open greet.txt
# Remove the <<<<<<< / ======= / >>>>>>> markers; keep what you want
git add greet.txt
git commit                      # completes the merge
# If it goes wrong:  git merge --abort
```

**LAB C — rebase for linear history**

```bash
git switch -c feature/api
git commit --allow-empty -m "feat: api v1"
git switch main
git commit --allow-empty -m "chore: unrelated"
git switch feature/api
git rebase main                 # feature/api now replays on top of main
git log --oneline --graph       # clean linear line, no merge bubble
```

---

### Undo toolbox

| Situation | Command | Safe on pushed commits? |
|-----------|---------|------------------------|
| Drop an unstaged edit | `git restore file` | n/a |
| Un-stage a file | `git restore --staged file` | n/a |
| Fix the last commit message or add a missed file | `git commit --amend` | **No** — rewrites history |
| Undo a commit safely | `git revert <hash>` | **Yes** — adds a new undo commit |
| Move HEAD back, keep changes staged | `git reset --soft HEAD~1` | No — local only |
| Move HEAD back, unstage changes | `git reset --mixed HEAD~1` | No — local only |
| Move HEAD back, **delete** all changes | `git reset --hard HEAD~1` | No — destructive |

> 🎯 **Money one-liner:** `revert` is safe — it adds a new commit that undoes the change; always use it on anything already pushed. `reset` moves the pointer and rewrites history — local branches only. `--soft` keeps staged, `--mixed` unstages, `--hard` throws everything away.

---

### Stash, remote, and reflog

```bash
# Stash — park work-in-progress without making a commit
git stash                           # stash tracked changes
git stash -u                        # include untracked files too
git stash pop                       # restore and drop the stash entry
git stash apply                     # restore but keep the entry (safe)
git stash list

# Cherry-pick — grab a single commit from another branch
git cherry-pick <hash>

# Remote
git clone <url>
git remote -v                       # show configured remotes
git fetch origin                    # download changes — does NOT merge
git pull                            # fetch + merge (or rebase if configured)
git push
git push -u origin feature/x        # first push of a new branch (sets upstream)
git push --force-with-lease         # safe force — checks no one else pushed first
# NEVER plain --force on shared branches

# Reflog — every HEAD movement is recorded; your time machine
git reflog                          # find "lost" commits after a bad reset
git reset --hard <hash>             # jump back to that point
```

---

### Inspect & search

```bash
git log --author="alice"
git blame src/app.py                # who wrote each line and when
git diff main..feature              # all changes between two branches
git bisect start
git bisect bad                      # current commit is broken
git bisect good v1.0.0              # this commit was fine → git binary-searches
```

---

### Branching strategies

| Strategy | Shape | Best for | Downside |
|----------|-------|----------|----------|
| **Environment branches** | branch = environment (test / qa / prod) | Simple pipelines | Config drift between branches |
| **Git Flow** | main + develop + feature / release / hotfix | Scheduled, versioned releases | Heavy; slows teams down |
| **GitHub Flow** | main + short feature branches → PR → deploy | Continuous delivery (modern default) | Requires solid CI gate |
| **Trunk-based** | One trunk + feature flags | Fastest CI, smallest batches | Demands feature-flag discipline |

> 🇮🇳 **Hinglish intuition:** Modern teams mein long-lived branches se bachte hain — chhoti, jaldi-merge branches + GitOps per-env overlays. Har environment ke liye alag branch = drift ka recipe.

---

### 20-second cheat-sheet

```
add → staged | commit → local repo | push → remote
merge = preserves history + merge commit (safe on shared)
rebase = linear, replay on tip (local only — never rebase shared)
revert = safe undo (adds commit) | reset = pointer move (local only)
reflog = time machine for "lost" commits
stash = temp shelf | cherry-pick = single commit grab
```

**Golden rules:** Never `reset --hard` on pushed commits. Never plain `--force` on shared branches. Conventional commits (`feat:/fix:/docs:`) keep log history readable.

> 🎤 **Interview one-liners:**
> - *"merge vs rebase?"* → merge preserves history and adds a merge commit — safe on shared branches; rebase replays commits for a linear history — only on your own local branch, never after pushing.
> - *"how do you resolve a conflict?"* → identify the conflicted file, open it, remove the `<<<<`/`====`/`>>>>` markers, keep the correct code, `git add`, `git commit`.
> - *"how do you recover a lost commit?"* → `git reflog` shows every HEAD movement; copy the hash; `git reset --hard <hash>` jumps back to it.

---

## 🐳 Docker

**Mental model:** `Dockerfile` `──build──▶` Image (read-only blueprint) `──run──▶` Container (running instance with a thin writable layer on top). `push / pull` ↔ Registry. Kubernetes uses containerd on nodes — Docker is for building images, not running them in production.

→ Deep concepts: [M3 — Docker](04-M3-docker.md)

---

### Working with images

```bash
docker pull nginx:1.27
docker images
docker build -t myapp:1.0 .
docker tag myapp:1.0 registry.io/acme/myapp:1.0
docker history myapp:1.0            # layer sizes — find the bloat
docker rmi myapp:1.0
docker image prune -a               # remove all unused images (reclaim disk)
```

### Working with containers

```bash
docker run nginx                                # foreground, stops on Ctrl-C
docker run -d --name web nginx                  # detached, named
docker ps                                       # running containers
docker ps -a                                    # all, including stopped
docker stop web && docker start web
docker rm web                                   # -f to force-remove a running container
docker logs -f web                              # follow output
docker exec -it web bash                        # shell into a running container (debug)
docker inspect web                              # IP, mounts, env vars, restart count
docker stats                                    # live CPU + memory usage
```

### `docker run` flags reference

| Flag | Meaning |
|------|---------|
| `-d` | Detached (background) |
| `-p 8080:80` | Publish port — host:container (left = outside world) |
| `-e LOG_LEVEL=info` | Set an environment variable |
| `-v mydata:/data` | Named volume — data survives container removal |
| `-v $(pwd):/app` | Bind mount — host directory inside the container (dev only) |
| `--restart unless-stopped` | Auto-restart on crash or reboot |
| `--network mynet` | Attach to a named bridge network |
| `--rm` | Remove container automatically on exit |
| `--name web` | Give a human-readable name |

### Dockerfile best practices

```dockerfile
# Multi-stage: build stage compiles; final stage ships only the artifact
FROM golang:1.22 AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download                     # deps layer first → cache hit on code changes
COPY . .
RUN CGO_ENABLED=0 go build -o server ./cmd/server

FROM gcr.io/distroless/static:nonroot   # tiny, no shell, runs as non-root
COPY --from=builder /app/server /server
EXPOSE 8080
ENTRYPOINT ["/server"]
```

Key instruction rules:

| Instruction | Rule |
|-------------|------|
| `FROM` | Pin a version: `nginx:1.27`, not `nginx:latest` in production |
| `COPY` vs `ADD` | Prefer `COPY`; `ADD` auto-extracts tarballs (surprising side effect) |
| `CMD` | Default arguments — easily overridden at `docker run` |
| `ENTRYPOINT` | Fixed executable; `CMD` becomes its arguments |
| `ARG` | Build-time only (gone after build — safe for build tokens) |
| `ENV` | Runtime (persists in the running container) |
| `EXPOSE` | Documentation only — does NOT publish ports (still need `-p`) |

### Volumes and networking

```bash
# Volumes — data that survives container removal
docker volume create mydata
docker volume ls
docker volume prune

# Networks — containers on the same network reach each other BY NAME (built-in DNS)
docker network create mynet
docker run -d --name db --network mynet postgres:16
docker run -d --name api --network mynet myapp:1.0  # api can reach db:5432 by name
# Default driver: bridge. Others: host (no isolation), none (no network)
```

### Docker Compose

```bash
docker compose up -d
docker compose ps
docker compose logs -f web
docker compose down                 # stop and remove containers
docker compose down -v              # also remove named volumes
```

Compose YAML skeleton:

```yaml
services:
  web:
    build: .
    ports: ["8080:80"]
    environment: [LOG_LEVEL=info]
    depends_on: [db]
    volumes: [./static:/app/static]
  db:
    image: postgres:16
    volumes: [pgdata:/var/lib/postgresql/data]
volumes:
  pgdata:
```

### Registry and cleanup

```bash
docker login registry.io
docker push registry.io/acme/myapp:1.0
docker system df                        # disk usage by images/containers/volumes
docker container prune                  # remove all stopped containers
docker image prune -a                   # remove all unused images
docker system prune -a                  # full cleanup — be careful in dev
```

### Debug flow

```
docker ps -a           → what exit code? (non-zero = crash)
docker logs web        → what was the last output before it stopped?
docker inspect web     → restart count? OOMKilled flag?
docker stats           → CPU/memory spike at crash time?
```

> "Container keeps restarting" is the Docker equivalent of Kubernetes CrashLoopBackOff — same root causes: bad entrypoint command, missing environment variable, OOMKilled.

### Mini-lab

```bash
mkdir lab-docker && cd lab-docker
cat > index.html <<'EOF'
<h1>Hello from Docker</h1>
EOF

cat > Dockerfile <<'EOF'
FROM nginx:1.27-alpine
COPY index.html /usr/share/nginx/html/
EOF

docker build -t lab-nginx:1.0 .
docker run -d -p 8888:80 --name lab-web lab-nginx:1.0
curl http://localhost:8888          # Hello from Docker
docker logs lab-web
docker exec -it lab-web sh          # explore the running container
docker stop lab-web && docker rm lab-web
docker rmi lab-nginx:1.0
```

### 20-second cheat-sheet

```
build → image | run → container | push/pull ↔ registry
-d detached | -p host:container | -v volume | -e env var
exec -it → shell in | logs -f → follow output | inspect → metadata
multi-stage → small image | distroless → minimal attack surface
```

**Golden rules:** Multi-stage builds. Non-root user. `.dockerignore` (keep `node_modules`, `.git`, `*.env` out). Pin versions in production. Never bake secrets into image layers. Scan with Trivy before pushing.

> 🎤 **Interview one-liners:**
> - *"image vs container?"* → image is the frozen read-only blueprint; container is a running instance — one image can spawn dozens of containers, each with their own writable layer.
> - *"CMD vs ENTRYPOINT?"* → ENTRYPOINT is the fixed executable; CMD is its default arguments (overridable at runtime). Used together: `ENTRYPOINT ["python"]` + `CMD ["app.py"]`.
> - *"Docker on Kubernetes nodes?"* → No since K8s 1.24 — dockershim removed; nodes use containerd directly. Docker is used to build images in CI pipelines, not to run workloads on nodes.

---

## ☸️ kubectl (Kubernetes)

**Mental model:** Control plane (API server, etcd, scheduler, controller-manager) + Worker nodes (kubelet, kube-proxy, containerd). You declare desired state in YAML; controllers continuously reconcile actual state toward it. `kubectl` is your API client.

```bash
alias k=kubectl   # add to ~/.bashrc or ~/.zshrc — saves thousands of keystrokes
```

→ Deep concepts: [M4 — Kubernetes Core](05-M4-kubernetes-core.md) · [M9 — Advanced K8s Internals](11-M9-advanced-k8s-internals.md)

---

### Cluster and context

```bash
kubectl cluster-info
kubectl get nodes -o wide
kubectl config get-contexts
kubectl config use-context staging-cluster
kubectl config set-context --current --namespace=default
```

### Pods

```bash
kubectl get pods                                # current namespace
kubectl get pods -A                             # all namespaces
kubectl get pods -o wide                        # include node name + pod IP
kubectl get pods -w                             # watch — live updates
kubectl describe pod <name>                     # EVENTS section at bottom = the real clue
kubectl logs <name>                             # stdout/stderr
kubectl logs <name> -f                          # follow (tail -f equivalent)
kubectl logs <name> --previous                  # logs from the LAST crashed container
kubectl logs <name> -c sidecar                  # specific container in a multi-container pod
kubectl exec -it <name> -- sh                   # shell into a running pod
kubectl delete pod <name>                       # deleted; recreated automatically if managed
```

### Deployments

```bash
kubectl create deployment web --image=nginx:1.27 --replicas=3
kubectl get deploy,rs,pods
kubectl scale deploy web --replicas=5
kubectl set image deploy/web nginx=nginx:1.28       # triggers rolling update
kubectl rollout status deploy/web                   # watch the rollout progress
kubectl rollout history deploy/web                  # audit trail of past rollouts
kubectl rollout undo deploy/web                     # ROLLBACK to previous revision
kubectl rollout restart deploy/web                  # reload ConfigMap change (no image change)
kubectl edit deploy web                             # live YAML edit in your $EDITOR
```

### Services and networking

```bash
kubectl expose deploy web --port=80 --type=ClusterIP
kubectl get svc
kubectl get endpoints web                           # which pod IPs back this service
kubectl port-forward svc/web 8080:80                # reach a service locally (debug only)
```

| Service type | Use case |
|---|---|
| `ClusterIP` | Internal cluster traffic only (default) |
| `NodePort` | Dev / testing — opens a port on every node |
| `LoadBalancer` | Production on cloud — provisions a cloud load balancer |
| `Ingress` | HTTP/HTTPS routing by path or hostname — requires an Ingress controller |

### ConfigMap and Secret

```bash
kubectl create configmap app-cfg --from-literal=LOG_LEVEL=info
kubectl create secret generic db-pass --from-literal=password=s3cret

# Decode a secret value (base64-encoded at rest)
kubectl get secret db-pass -o jsonpath='{.data.password}' | base64 -d
```

### Namespaces

```bash
kubectl get ns
kubectl create ns staging
kubectl get all -n staging
```

### Resources, probes, and autoscaling

| Concept | Meaning |
|---|---|
| `requests` | Guaranteed resource; scheduler uses this for pod placement |
| `limits` | Hard ceiling; exceeding memory limit → OOMKilled |
| `readinessProbe` | Traffic gate — pod is removed from the Service until it passes |
| `livenessProbe` | Restart gate — pod is restarted if it fails |

```bash
# Horizontal Pod Autoscaler — scale based on CPU
kubectl autoscale deploy web --min=2 --max=10 --cpu-percent=70
kubectl get hpa
```

### Declarative workflow

```bash
kubectl apply -f deployment.yaml            # create OR update — idempotent
kubectl apply -k overlays/dev               # kustomize overlay
kubectl diff -f deployment.yaml             # preview changes before applying
kubectl get deploy web -o yaml              # export live manifest as YAML
kubectl explain deploy.spec.replicas        # built-in docs for any field
kubectl create deploy web --image=nginx --dry-run=client -o yaml  # scaffold YAML
```

### Labels and selectors

```bash
kubectl get pods --show-labels
kubectl get pods -l app=web,env=prod
kubectl label pod web-abc tier=frontend
```

> Services find their pods exclusively via label selectors — the selector in the Service spec must match pod labels exactly.

### Useful flags and shortcuts

```bash
# Short resource names: po svc deploy ns cm no rs ep
kubectl get po,svc,deploy -A

# Output formats
kubectl get pod web-abc -o wide
kubectl get pod web-abc -o yaml
kubectl get pods -o jsonpath='{.items[*].metadata.name}'

# Other essentials
kubectl api-resources                               # all resource types + short names
kubectl top pod                                     # CPU/mem (needs metrics-server)
kubectl get events --sort-by=.lastTimestamp         # cluster-wide event log, newest last
kubectl cp <pod>:/var/log/app.log ./app.log         # copy a file out of a pod
```

### Node maintenance

```bash
kubectl cordon node-1            # mark unschedulable — no new pods land here
kubectl drain node-1 \
  --ignore-daemonsets \
  --delete-emptydir-data         # evict all pods safely before maintenance
kubectl uncordon node-1          # restore scheduling after maintenance
```

### CrashLoopBackOff debug flow (the canonical interview scenario)

```
Step 1: kubectl get pods              → see restart count climbing
Step 2: kubectl describe pod <name>   → read EVENTS (image pull fail? probe fail? OOM?)
Step 3: kubectl logs <name> --previous → crash output from the last run
Step 4: kubectl get events --sort-by=.lastTimestamp → cluster-level clues
Step 5: kubectl top pod <name>        → OOMKilled? (memory limit too low)
```

Common root causes: bad image tag (ImagePullBackOff), missing Secret / ConfigMap (env var absent at start), failing liveness probe, OOMKilled.

### Mini-lab

```bash
kubectl create deployment demo --image=nginx:1.27 --replicas=2
kubectl expose deployment demo --port=80
kubectl rollout status deployment/demo

# Introduce a bad image to trigger ImagePullBackOff
kubectl set image deployment/demo nginx=nginx:does-not-exist
kubectl get pods                            # ImagePullBackOff or ErrImagePull
kubectl describe pod <failing-pod-name>     # see the pull error in Events

# Recover with a rollback
kubectl rollout undo deployment/demo
kubectl rollout status deployment/demo

# Reach the service locally
kubectl port-forward svc/demo 9090:80 &
curl http://localhost:9090                  # nginx welcome page
kill %1                                     # stop port-forward

kubectl delete deployment demo
kubectl delete svc demo
```

### 20-second cheat-sheet

```
apply -f = declarative (idempotent) | describe = events | logs --previous = crash output
set image = rolling update | rollout undo = rollback | rollout restart = reload config
ClusterIP = internal | LoadBalancer = cloud LB | Ingress = HTTP front door
requests = scheduling guarantee | limits = ceiling (OOMKill if exceeded)
readiness = traffic gate | liveness = restart gate
```

**Golden rules:** Declarative YAML + GitOps beats imperative kubectl. Never treat a pod as a pet — it's ephemeral. Always check `describe` and `logs --previous` before escalating a CrashLoop.

> 🎤 **Interview one-liners:**
> - *"how does a request reach a pod?"* → DNS resolves the Service name → Service selector finds matching pod IPs (Endpoints) → kube-proxy routes to a pod; for external traffic: cloud LB → NodePort → kube-proxy → pod.
> - *"liveness vs readiness?"* → liveness restarts the container when it fails (the app is broken); readiness removes the pod from the Service until it passes (the app is starting or temporarily busy). Different failure modes — both needed.
> - *"apply vs create?"* → `apply` is idempotent: create if missing, update if existing; `create` fails if the resource already exists. Always use `apply` in GitOps workflows.

---

## ⚙️ Ansible

**Mental model:** Agentless configuration management — SSH from a control node to managed hosts. Declare desired state in YAML playbooks; Ansible makes it so, then does nothing if the state is already correct. Run twice → zero changes (idempotent).

→ Deep concepts: [M2 — Ansible](03-M2-ansible.md)

---

> ⚠️ **KEY scope clarity — Ansible is NOT universal.**
> Ansible is used for **self-managed servers** (on-prem bare-metal, VMs, kubeadm clusters). It is **not** used on managed Kubernetes services (EKS / AKS / GKE — the cloud provider manages the nodes). Its job is the **node OS layer**: install containerd, run kubeadm, tune the kernel, disable swap, set sysctl — it turns a bare Linux machine into a Kubernetes node. It does **not** manage running pods; Kubernetes does that.
>
> **The stack:** Terraform builds the server → Ansible configures it → Kubernetes runs the containers.

---

### Inventory

```ini
# inventory.ini
[web]
web1 ansible_host=10.0.1.11
web2 ansible_host=10.0.1.12

[db]
db1 ansible_host=10.0.1.20

[all:vars]
ansible_user=ubuntu
ansible_ssh_private_key_file=~/.ssh/id_rsa
```

```bash
ansible-inventory -i inventory.ini --list   # verify how Ansible parsed the inventory
ansible all -i inventory.ini -m ping        # connectivity check to every host
```

### Ad-hoc commands

```bash
# Syntax: ansible <pattern> -m <module> -a "<args>" [-b] [-i inventory]
ansible all -m ping
ansible web -m command -a "uptime"
ansible web -m shell -a "df -h | grep /var"         # -m shell allows pipes; -m command does not
ansible web -m apt -a "name=nginx state=present" -b  # -b = become (sudo)
ansible web -m service -a "name=nginx state=started enabled=yes" -b
ansible web -m copy -a "src=nginx.conf dest=/etc/nginx/nginx.conf" -b
```

> 🇮🇳 **Hinglish intuition:** `-m command` safe hai — shell features nahi, pipes nahi, zyada predictable. `-m shell` powerful hai — pipes kab chahiye tab use karo, warna `command` hi prefer karo.

### Playbook anatomy

```yaml
# site.yml
- hosts: web
  become: true                  # run all tasks as root (sudo)
  vars:
    nginx_port: 80

  tasks:
    - name: Install nginx
      apt:
        name: nginx
        state: present
        update_cache: yes

    - name: Deploy config from template
      template:
        src: nginx.conf.j2      # Jinja2 template — variables rendered per host
        dest: /etc/nginx/nginx.conf
      notify: Restart nginx     # trigger handler only if this task changes something

    - name: Ensure nginx is running
      service:
        name: nginx
        state: started
        enabled: yes

  handlers:
    - name: Restart nginx       # runs ONCE at the end, only if notified
      service:
        name: nginx
        state: restarted
```

```bash
ansible-playbook -i inventory.ini site.yml
ansible-playbook -i inventory.ini site.yml --check      # DRY RUN — shows what would change
ansible-playbook -i inventory.ini site.yml --diff       # show exact file content changes
ansible-playbook -i inventory.ini site.yml --limit web1 # run on one host only
ansible-playbook -i inventory.ini site.yml -v           # verbose output
ansible-playbook -i inventory.ini site.yml -e "nginx_port=8080"  # override a variable
```

### Key modules to know

| Module | Purpose |
|--------|---------|
| `ping` | Connectivity check (not ICMP — tests Python + SSH) |
| `apt` / `yum` / `dnf` | Package management per distro |
| `service` / `systemd` | Start, stop, enable services |
| `copy` | Copy a static file to the host |
| `template` | Render a Jinja2 `.j2` template onto the host (per-host variables) |
| `file` | Create / delete files or directories; set permissions |
| `lineinfile` | Manage a single line inside a file |
| `user` / `group` | User and group management |
| `git` | Clone or pull a repository |
| `command` | Run a command — no pipes, safer |
| `shell` | Run a shell command — pipes allowed |
| `debug` | Print a variable or message during a run |

### Variables, facts, and handlers

```bash
# Dump all auto-gathered facts for a host (OS, CPU, IPs, etc.)
ansible web -m setup

# Variable precedence (lowest → highest):
# role defaults → group_vars → host_vars → play vars → -e flag (highest)
```

Handlers fire **once at the end** of a play, only if a task reported `changed`. This is why "restart nginx" only fires when the config file actually changed — not on every run.

### Loops, conditionals, and register

```yaml
- name: Install developer tools
  apt:
    name: "{{ item }}"
    state: present
  loop: [git, curl, vim]

- name: Only on Ubuntu systems
  apt:
    name: htop
  when: ansible_distribution == "Ubuntu"

- name: Check disk usage
  command: df -h
  register: disk_out               # capture the output

- debug:
    msg: "{{ disk_out.stdout }}"
```

### Roles and Vault

```bash
# Scaffold a role structure
ansible-galaxy init roles/webserver
# Creates: tasks/ handlers/ templates/ files/ vars/ defaults/ meta/

# Reference in a playbook
# roles: [webserver, monitoring]

# Vault — encrypt secrets at rest
ansible-vault create group_vars/all/secrets.yml
ansible-vault edit group_vars/all/secrets.yml
ansible-playbook site.yml --ask-vault-pass
```

### Mini-lab (localhost — no remote host needed)

```ini
# inventory-local.ini
localhost ansible_connection=local
```

```yaml
# lab.yml
- hosts: localhost
  tasks:
    - name: Create a file
      file:
        path: /tmp/ansible-lab.txt
        state: touch

    - name: Write content
      copy:
        content: "Ansible was here\n"
        dest: /tmp/ansible-lab.txt

    - name: Show the file content
      command: cat /tmp/ansible-lab.txt
      register: out

    - debug:
        msg: "{{ out.stdout }}"
```

```bash
ansible-playbook -i inventory-local.ini lab.yml --check   # dry run first
ansible-playbook -i inventory-local.ini lab.yml           # run it
ansible-playbook -i inventory-local.ini lab.yml           # run AGAIN → 0 changed = idempotent
```

### 20-second cheat-sheet

```
inventory = who | playbook = what to do | module = how (apt/service/template)
-b = sudo | --check = dry run | --diff = show changes | -e = override var
handler = runs only on CHANGED (once at end) | facts = auto-gathered host info (ansible_*)
role = reusable task bundle | vault = encrypted secrets at rest
```

**Golden rules:** Always `--check` before a production run. Use `template` (not `copy`) for files needing per-host variable substitution. Store secrets in Ansible Vault — never in plaintext YAML committed to Git.

> 🎤 **Interview one-liners:**
> - *"agentless — how does it work?"* → Ansible SSH-es from the control node; no daemon runs on the managed host — only Python must be present. The control node pushes modules over SSH, executes them, cleans up.
> - *"idempotent — why does it matter?"* → modules check current state before acting; running the same playbook twice leaves the system unchanged on the second run — safe for automation and safe to re-run after failures.
> - *"Ansible vs Terraform?"* → Terraform provisions infrastructure (creates VMs, VPCs, disks); Ansible configures what's on those VMs (installs packages, writes configs, starts services). They complement each other — Terraform first, Ansible second.

---

## 🏗️ Terraform

**Mental model:** Declare infrastructure in HCL; Terraform calls the cloud provider's API to make reality match the declaration. A state file tracks what was created. `plan` shows the diff; `apply` executes it.

→ Deep concepts: [M1 — Terraform](02-M1-terraform.md)

---

### Core workflow (4 commands)

```bash
terraform init          # download providers, configure the backend — run once per project
terraform fmt           # format all .tf files (run in CI as a lint check)
terraform validate      # syntax + type check (no API calls)
terraform plan          # PREVIEW — always run before apply; read the +/~/- diff carefully
terraform apply         # execute the plan (prompts for confirmation)
terraform apply -auto-approve  # skip prompt — CI only
terraform show          # human-readable current state
terraform output        # print declared output values
terraform destroy       # tear down all managed resources → stops the bill
```

> **Read the plan symbols:** `+` = create, `~` = update in place, `-` = destroy, `-/+` = destroy and recreate. Never `apply` without reading `plan`.

### HCL blocks

```hcl
# Provider configuration
provider "aws" {
  region = "us-east-1"
}

# Resource — the thing to create/manage
resource "aws_instance" "web" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = var.instance_type
  tags = {
    Name        = "web-server"
    Environment = var.environment
  }
}

# Variable — parameterise your code
variable "instance_type" {
  type    = string
  default = "t3.micro"
}

# Output — expose values for humans or other modules
output "web_public_ip" {
  value = aws_instance.web.public_ip
}

# Data source — READ an existing cloud resource (not created by Terraform)
data "aws_ami" "ubuntu" {
  most_recent = true
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-*-22.04-amd64-*"]
  }
  owners = ["099720109477"]
}
```

Reference syntax: `<resource_type>.<name>.<attribute>` — e.g., `aws_instance.web.public_ip`

### State management (top interview topic)

```bash
terraform state list            # list all resources Terraform tracks
terraform state show <address>  # detail for one specific resource
terraform state rm <address>    # stop tracking (resource survives in cloud)
terraform import <address> <id> # adopt an existing cloud resource into state
```

Remote backend with locking for teams:

```hcl
terraform {
  backend "s3" {
    bucket         = "acme-tf-state"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-locks"    # prevents two concurrent applies
    encrypt        = true
  }
}
```

> State can hold secrets → **never commit `.tfstate` or `.tfvars` to Git**. Add both to `.gitignore`.

### Variables and environments

```bash
terraform plan -var="instance_type=t3.small"
terraform plan -var-file="prod.tfvars"
TF_VAR_instance_type=t3.small terraform plan    # environment variable

# Precedence (lowest → highest):
# defaults < TF_VAR_ env vars < .tfvars file < -var flag
```

### Modules

```hcl
module "vpc" {
  source     = "./modules/vpc"
  cidr_block = "10.0.0.0/16"
  name       = "prod-vpc"
}

# Reference module output in another resource
resource "aws_instance" "web" {
  subnet_id = module.vpc.public_subnet_id
}
```

Dev / staging / prod call the **same module** with different `.tfvars` files — one code path, multiple environments.

### Meta-arguments

```hcl
# count — index-based; removing a middle element shifts all indexes
resource "aws_instance" "web" {
  count         = 3
  instance_type = "t3.micro"
}

# for_each — key-based; removing one key only touches that resource
resource "aws_s3_bucket" "logs" {
  for_each = toset(["dev", "staging", "prod"])
  bucket   = "${each.key}-acme-logs"
}

lifecycle {
  create_before_destroy = true    # blue/green style replacement
  prevent_destroy       = true    # safety net for production databases
  ignore_changes        = [tags]  # don't revert external tag changes
}
```

### Mini-lab (no cloud account needed)

```hcl
# main.tf — uses only the local provider, no cloud credentials required
terraform {
  required_providers {
    local = { source = "hashicorp/local" }
  }
}

resource "local_file" "hello" {
  content  = "Terraform was here\n"
  filename = "${path.module}/output.txt"
}

output "file_path" {
  value = local_file.hello.filename
}
```

```bash
terraform init
terraform plan
terraform apply -auto-approve
cat output.txt                      # Terraform was here
terraform state list                # local_file.hello
terraform destroy -auto-approve
```

This covers the full `init → plan → apply → state → destroy` lifecycle on your laptop.

### 20-second cheat-sheet

```
init → providers | plan → preview (always first) | apply → create/change | destroy → $0
state = map between TF code and real cloud resources — remote + locked for teams
variable precedence: defaults < TF_VAR_ < .tfvars < -var (highest wins)
module = reusable block | for_each > count (safer on list changes)
never commit: .tfstate / .tfvars / .terraform/
```

**Golden rules:** Remote state with DynamoDB lock. Never commit `.tfstate`, `.tfvars`, or `.terraform/`. Pin provider versions (`~> 5.0`). Run `fmt` and `validate` in CI before `plan`.

> 🎤 **Interview one-liners:**
> - *"what is the state file?"* → the source of truth that maps Terraform resource addresses to real cloud resource IDs; without it, Terraform can't know what it created and would try to create everything again.
> - *"how do teams share state safely?"* → remote backend (S3) + state locking (DynamoDB) — the lock prevents two engineers from running `apply` simultaneously and corrupting the state file.
> - *"count vs for_each?"* → `count` is index-based — remove item [1] from the middle and all higher indexes shift, causing unnecessary destroys. `for_each` uses string keys, so removing one item only touches that exact resource.

---

## 🔄 GitOps / ArgoCD

**Mental model:** Git is the single source of truth. An in-cluster agent (ArgoCD) continuously pulls desired state from Git and reconciles the cluster toward it. Nobody runs `kubectl apply` by hand — every change goes through a Git commit.

→ Deep concepts: [M7 — GitOps](08-M7-gitops.md) · [ch19 — Follow One Commit](19-cicd-hands-on-flow.md)

---

### Push (traditional CI) vs Pull (GitOps)

| | Push — traditional | Pull — GitOps / ArgoCD |
|---|---|---|
| Who applies to cluster | CI runner runs `kubectl apply` | ArgoCD inside the cluster reads Git |
| Cluster credentials | Stored in CI environment (risk: leaked pipeline = cluster access) | Stay in the cluster — never leave |
| Drift detection | None | Continuous — auto-reverts on `selfHeal` |
| Audit trail | CI logs | Git history (immutable, PR-reviewed) |
| Rollback | Re-run an older pipeline | `git revert` + push, or ArgoCD CLI |

> 🇮🇳 **Hinglish intuition:** Push = CI ko cluster ki chabi de di — koi bhi CI job cluster touch kar sakta hai. Pull = ArgoCD andar baitha hai, woh Git dekh ke kaam karta hai — bahar se koi directly cluster nahi chhuta.

### Install ArgoCD

```bash
kubectl create namespace argocd
kubectl apply -n argocd \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Get the initial admin password
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d

# Access the UI locally
kubectl port-forward svc/argocd-server -n argocd 8080:443
# Open https://localhost:8080 — login with admin / <password above>
```

### Application CRD

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-app
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/acme/k8s-manifests
    targetRevision: main
    path: apps/my-app/overlays/staging
  destination:
    server: https://kubernetes.default.svc   # same cluster ArgoCD runs in
    namespace: my-app
  syncPolicy:
    automated:              # OMIT this block for MANUAL sync (production approval)
      prune: true           # delete resources that were removed from Git
      selfHeal: true        # revert any manual changes (drift correction)
    syncOptions:
      - CreateNamespace=true
```

**Sync policy per environment:**

| Environment | Policy | Why |
|-------------|--------|-----|
| `dev` / `staging` | `automated: {prune: true, selfHeal: true}` | Auto-deploy every push — fast feedback |
| `production` | No `automated` block — manual sync | Human approval required before deploying |

### ArgoCD CLI

```bash
argocd login localhost:8080 --insecure
argocd app list
argocd app get my-app
argocd app sync my-app              # trigger sync manually (prod approval flow)
argocd app diff my-app              # show exact diff between Git and cluster
argocd app history my-app           # list past syncs with IDs
argocd app rollback my-app <id>     # roll back to a previous sync state
argocd app set my-app --sync-policy automated
argocd app delete my-app
```

### Sync waves, hooks, and App-of-Apps

```yaml
# Sync waves — lower number is applied first (ensures DB is ready before app starts)
metadata:
  annotations:
    argocd.argoproj.io/sync-wave: "1"   # database manifests
# App manifests use wave "2" — they wait until all wave-1 resources are Healthy

# Sync hooks — run a Job at a specific phase
metadata:
  annotations:
    argocd.argoproj.io/hook: PreSync    # options: PreSync / Sync / PostSync
# Use PreSync for database migrations, PostSync for smoke tests
```

App-of-Apps — one root Application points to a directory of Application manifests. One PR deploys an entire fleet:

```yaml
# Root Application
spec:
  source:
    path: apps/       # directory contains one Application CRD per service
```

### Status terms

| Status | Meaning |
|--------|---------|
| `Synced` | Cluster matches Git exactly |
| `OutOfSync` | Cluster differs from Git (drift or pending deploy) |
| `Healthy` | All resources passing health checks |
| `Degraded` | At least one resource failing health checks |
| `Progressing` | Rolling update or sync in progress |

### Rollback options

```bash
# Option 1 — Git-native (preferred — Git history stays honest)
git revert <bad-commit-hash>
git push                        # ArgoCD detects the new commit → re-syncs automatically

# Option 2 — ArgoCD CLI
argocd app rollback my-app <history-id>
```

### Debug

```bash
argocd app get my-app           # overall status + sync conditions
argocd app diff my-app          # exact diff between Git desired state and cluster
argocd app logs my-app          # application container logs via ArgoCD

# Dig into the ArgoCD internals
kubectl -n argocd logs deployment/argocd-application-controller   # sync + health logic
kubectl -n argocd logs deployment/argocd-repo-server              # manifest render errors
```

Common issues: `OutOfSync` stuck → immutable field changed (need delete + recreate) or a failing sync hook. `ComparisonError` → repo-server can't render manifests (Helm/Kustomize error, missing values file).

### Mini-lab — prove drift correction

```bash
# After ArgoCD is installed and an Application is synced and automated:
kubectl scale deployment my-app --replicas=0 -n my-app    # manual change = drift
# Watch: within ~3 minutes ArgoCD detects OutOfSync + selfHeal restores replicas
argocd app get my-app    # status returns to Synced / Healthy
```

### 20-second cheat-sheet

```
Git = single source of truth | ArgoCD = in-cluster reconciler
sync = make cluster match Git | OutOfSync = drift or pending deploy
selfHeal = auto-revert manual changes | prune = delete what's removed from Git
staging = automated sync | prod = manual sync (approval)
sync waves = ordering (DB before app) | App-of-Apps = fleet at scale
rollback = git revert + push (preferred) or argocd app rollback
```

**Golden rules:** CI only commits to Git — never touches the cluster directly. Production sync is always manual. Drift is a signal, not an incident, when `selfHeal` is on.

> 🎤 **Interview one-liners:**
> - *"push vs pull model?"* → push: CI runs kubectl (cluster credentials live in CI — one compromised pipeline = full cluster access). Pull: ArgoCD inside the cluster reads Git — credentials never leave; audit trail is Git history.
> - *"what happens when someone manually scales a deployment?"* → ArgoCD detects the mismatch (`OutOfSync`) and, if `selfHeal` is on, reverts it automatically — the cluster always converges back to what Git says.
> - *"how do you roll back with ArgoCD?"* → `git revert` the bad commit and push; ArgoCD re-syncs automatically. This is cleaner than the CLI rollback because Git history stays honest and the change goes through review.

---

## 🔧 Jenkins

**Mental model:** Automation server for CI/CD. The controller orchestrates (schedules builds, stores history, serves the UI); agents execute the actual work. A `Jenkinsfile` in the repo defines the pipeline — versioned alongside the code it builds. `git push` → webhook → controller → assigns an agent → agent runs the Jenkinsfile stages.

> Never run heavy build work directly on the controller — it's an orchestrator, not a build machine.

→ Deep concepts: [M6 — CI/CD](07-M6-cicd.md)

---

> 🇮🇳 **Hinglish intuition:** Controller ek manager hai — kaam batata hai lekin khud nahi karta. Agents actual kaam karte hain (compile, test, build). Controller pe heavy build mat chalaao — woh sirf schedule aur monitor kare.

### Declarative Jenkinsfile anatomy

Study every block — this is the production-grade template:

```groovy
pipeline {

  // Where to run — any agent, a labeled agent, or a container
  agent any

  options {
    timestamps()                                   // prefix every log line with a timestamp
    timeout(time: 30, unit: 'MINUTES')             // fail the build if stuck
    disableConcurrentBuilds()                      // prevent parallel runs on the same branch
  }

  environment {
    REGISTRY  = 'docker.io/acme'
    IMAGE_TAG = "${env.GIT_COMMIT?.take(7)}"       // 7-char git SHA as the image tag
  }

  stages {

    stage('Checkout') {
      steps { checkout scm }                       // clone the repo that triggered this build
    }

    stage('Test') {
      // Run tests inside a container — no runtime needs to be installed on the agent
      agent {
        docker {
          image 'golang:1.22'
          reuseNode true
        }
      }
      steps {
        sh 'go test -race ./...'
      }
    }

    stage('Build image') {
      steps {
        sh "docker build -t ${REGISTRY}/app:${IMAGE_TAG} ."
      }
    }

    stage('Security scan') {
      // Scan for CVEs BEFORE pushing — gate on HIGH and CRITICAL
      steps {
        sh "trivy image --exit-code 1 --severity HIGH,CRITICAL ${REGISTRY}/app:${IMAGE_TAG}"
      }
    }

    stage('Push') {
      // Only push on main — feature branches test but don't publish images
      when { branch 'main' }
      steps {
        withCredentials([usernamePassword(
          credentialsId: 'dockerhub-creds',
          usernameVariable: 'REG_USER',
          passwordVariable: 'REG_PASS'
        )]) {
          sh 'echo "$REG_PASS" | docker login -u "$REG_USER" --password-stdin'
          sh "docker push ${REGISTRY}/app:${IMAGE_TAG}"
        }
      }
    }

    stage('Update manifest') {
      // GitOps handoff — bump the image tag in the k8s config repo
      // ArgoCD detects the Git change and deploys. Jenkins NEVER runs kubectl.
      when { branch 'main' }
      steps {
        dir('/path/to/k8s-config') {
          sh "kustomize edit set image app=${REGISTRY}/app:${IMAGE_TAG}"
          sh "git commit -am 'ci: bump app to ${IMAGE_TAG}'"
          sh "git push"
        }
      }
    }
  }

  post {
    always   { cleanWs() }                         // clean workspace after every run
    success  { echo 'Pipeline passed' }
    failure  { echo 'Pipeline failed — check the failing stage' }
    unstable { echo 'Tests passed but below coverage threshold' }
  }
}
```

### Key blocks reference

| Block | Purpose |
|-------|---------|
| `agent` | Where to run: `any`, `{ label 'docker' }`, `{ docker { image '...' } }` |
| `environment` | Inject env vars for all stages; reference with `${VAR}` |
| `options` | Pipeline-level settings: timeout, timestamps, retry count, concurrency |
| `parameters` | Declare build-time inputs: string, choice, boolean |
| `when` | Conditional stage execution: `branch 'main'`, `expression { ... }`, `tag 'v*'` |
| `post` | After-run actions: `always` / `success` / `failure` / `unstable` / `aborted` |
| `steps` | Actual commands: `sh` (Unix), `bat` (Windows), `echo`, `checkout scm` |

### Credentials

```groovy
// Username + password (registry, database)
withCredentials([usernamePassword(
  credentialsId: 'myservice-creds',
  usernameVariable: 'USR',
  passwordVariable: 'PWD'
)]) {
  sh 'curl -u "$USR:$PWD" https://api.example.com'
}

// Secret text (API token)
withCredentials([string(credentialsId: 'sonar-token', variable: 'SONAR')]) {
  sh "sonar-scanner -Dsonar.login=$SONAR"
}

// SSH private key
withCredentials([sshUserPrivateKey(credentialsId: 'deploy-key', keyFileVariable: 'KEY')]) {
  sh "ssh -i $KEY deployer@host 'ls /app'"
}
```

Credentials are **stored encrypted** in the Jenkins Credential store. They are injected at runtime only and **automatically masked in build logs** — never hardcode them or `echo` them in a step.

### Parallel stages

```groovy
stage('Quality gates') {
  parallel {
    stage('Unit tests')       { steps { sh 'make test-unit' } }
    stage('Lint')             { steps { sh 'make lint' } }
    stage('Dependency audit') { steps { sh 'npm audit --audit-level=high' } }
  }
}
// All three run simultaneously — the stage completes when all children finish (or any fails)
```

### Triggers

```groovy
triggers {
  // Webhook — best option; near-instant, no polling overhead
  // Configure in your Git host: Settings → Webhooks → point to Jenkins URL
  githubPush()

  // Poll SCM — fallback when webhooks are not possible
  pollSCM('H/5 * * * *')      // check every 5 minutes

  // Scheduled — nightly build or periodic release
  cron('H 2 * * *')
}
```

**Multibranch Pipeline** — create one Jenkins job that auto-discovers all branches and PRs in a repository. Each branch gets its own build history and Jenkinsfile. PRs trigger build + test before merge is allowed.

### Shared libraries

Avoid duplicating pipeline logic across repositories. Place common steps in a dedicated shared library repo:

```
# shared-lib/vars/buildAndPush.groovy
def call(String imageName, String tag) {
  sh "docker build -t ${imageName}:${tag} ."
  sh "docker push ${imageName}:${tag}"
}
```

Reference it in any Jenkinsfile:

```groovy
@Library('shared-lib') _

pipeline {
  stages {
    stage('Build & Push') {
      steps { buildAndPush('acme/app', env.GIT_COMMIT.take(7)) }
    }
  }
}
```

Configure the library in **Jenkins → Manage Jenkins → Configure System → Global Pipeline Libraries**.

### Jenkins vs GitHub Actions

| | Jenkins | GitHub Actions |
|---|---------|---------------|
| Hosting | Self-hosted (you run controller + agents) | Managed by GitHub |
| Config format | Groovy Jenkinsfile | YAML workflow files |
| Plugin ecosystem | 1,800+ plugins | GitHub Marketplace actions |
| GitHub integration | Via webhook plugin | Native, seamless |
| Secrets storage | Jenkins Credential store | GitHub Secrets |
| Infrastructure cost | Your servers | Included minutes + pay-per-use |
| Best for | On-prem, large orgs, complex multi-stage pipelines | GitHub-native projects, lower ops overhead |

> The pipeline logic is the same — test, build, scan, push, bump tag. Jenkins gives maximum control; Actions gives minimum ops burden. Choose by where your infrastructure lives.

### Jenkins + GitOps (the correct CI/CD split)

```
git push
  → Jenkins (webhook)
    → checkout → test → build image → security scan (Trivy)
    → push image to registry
    → bump image tag in k8s-config repo → git push
                                              ↓
                                    ArgoCD detects Git change
                                    → syncs cluster
                                    → rolling update
```

**Jenkins handles CI** (code → tested artifact → image tag committed to Git). **ArgoCD handles CD** (Git → cluster). Jenkins never runs `kubectl apply`. It never holds cluster credentials.

### Mini-lab (local Jenkins in Docker)

```bash
# Start Jenkins locally — takes ~2 minutes to initialise
docker run -d \
  -p 8080:8080 \
  -p 50000:50000 \
  -v jenkins_home:/var/jenkins_home \
  --name jenkins \
  jenkins/jenkins:lts

# Retrieve the initial unlock password
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

Open `http://localhost:8080`, paste the password, install suggested plugins, then create a Pipeline job with this starter Jenkinsfile:

```groovy
pipeline {
  agent any
  stages {
    stage('Hello')  { steps { echo 'Build started' } }
    stage('Test')   { steps { sh 'echo "all tests pass"' } }
    stage('Done')   { steps { echo "Build #${env.BUILD_NUMBER} complete" } }
  }
  post { always { echo 'Workspace clean' } }
}
```

**Next step:** Put the Jenkinsfile in a real Git repo, create a **Multibranch Pipeline** job, and configure the repo URL — Jenkins auto-discovers branches and runs each one's Jenkinsfile independently.

### 20-second cheat-sheet

```
controller = orchestrator | agent = executor (run builds here, not controller)
stages = sequential | parallel stages = concurrent
when { branch 'main' } = gate a stage to main only
withCredentials = inject secrets (masked in logs — never hardcode)
post { always / success / failure } = cleanup and notifications
triggers: githubPush (best) | pollSCM | cron
shared library = reuse pipeline logic across repos
Jenkins = CI only | ArgoCD = CD | Jenkins never kubectl apply
```

**Golden rules:** Never build on the controller. Store secrets in the Credential store, never in the Jenkinsfile. Gate push and deploy stages with `when { branch 'main' }`. Scan before pushing (Trivy). Keep the Jenkinsfile in the repo — pipeline-as-code means it's reviewed like production code.

> 🎤 **Interview one-liners:**
> - *"declarative vs scripted pipeline?"* → declarative has a rigid validated `pipeline {}` structure (stages, steps, post) — 95% of use cases; scripted is raw Groovy (full power, no guardrails — for edge cases only).
> - *"how do you handle secrets in Jenkins?"* → store in the Credential store (encrypted at rest), inject via `withCredentials` at runtime — values appear masked in logs; never echo, never hardcode.
> - *"Jenkins vs GitHub Actions?"* → same pipeline concept; Jenkins is self-hosted with 1,800+ plugins (full control, more operational overhead); Actions is GitHub-managed YAML (lower overhead, tight GitHub integration). Choose by where your infra lives.

---

## 🎤 Interview rapid-fire (all tools)

Answer aloud before checking. Pairs with the [Interview Bank](14-interview-bank.md).

### Git

| Question | Answer |
|----------|--------|
| merge vs rebase? | merge preserves history + adds a merge commit (safe on shared branches); rebase replays commits linearly — local branches only, never shared |
| revert vs reset? | `revert` adds a new undo commit — safe on pushed code; `reset` moves HEAD and rewrites history — local only |
| detached HEAD? | HEAD points to a commit hash, not a branch — commits made here are unreachable after switching unless you create a branch |
| recover a lost commit? | `git reflog` shows every HEAD move; copy the hash; `git reset --hard <hash>` |

### Docker

| Question | Answer |
|----------|--------|
| image vs container? | image = frozen read-only blueprint; container = running instance with a writable layer — one image, many containers |
| why multi-stage build? | final image contains only the compiled artifact, not build tools or source — small, secure, faster to pull |
| Docker on K8s nodes? | No since K8s 1.24 — dockershim removed; nodes use containerd directly; Docker is for building images in CI |

### kubectl

| Question | Answer |
|----------|--------|
| CrashLoopBackOff — how to debug? | `get pods` → `describe pod` (events) → `logs --previous` (crash output) → `get events` → `top pod` (OOM?) |
| apply vs create? | `apply` is idempotent (create or update); `create` fails if the resource already exists — use `apply` in GitOps |
| liveness vs readiness? | liveness restarts the container on failure; readiness removes the pod from the Service until it passes — different failure modes |

### Ansible

| Question | Answer |
|----------|--------|
| agentless — how? | SSH from the control node; no daemon on the managed host — only Python required |
| idempotent — what does it mean? | running the same playbook twice leaves the system unchanged and reports zero changes on the second run |
| Ansible vs Terraform? | Terraform provisions infra (VMs, networks, disks); Ansible configures what's on them (packages, services, files) |

### Terraform

| Question | Answer |
|----------|--------|
| what is the state file? | maps Terraform resource addresses to real cloud resource IDs — without it Terraform can't know what it created |
| team state safety? | remote backend (S3) + DynamoDB lock — prevents two engineers from running apply simultaneously |
| plan vs apply? | `plan` is a safe read-only preview of changes; `apply` executes them — always plan first |

### GitOps / ArgoCD

| Question | Answer |
|----------|--------|
| push vs pull model? | push: CI holds cluster creds and runs kubectl (security risk); pull: ArgoCD in-cluster reads Git — creds never leave the cluster |
| what is self-heal? | ArgoCD detects manual drift (cluster diverges from Git) and automatically reverts the cluster to Git state |
| how to roll back? | `git revert` the bad commit and push — ArgoCD re-syncs automatically; Git history stays honest |

### Jenkins

| Question | Answer |
|----------|--------|
| controller vs agent? | controller orchestrates (schedules, UI, logs); agent executes (build, test, scan) — never run heavy builds on the controller |
| how do secrets work? | Credential store (encrypted at rest) + `withCredentials` at runtime — values are masked in logs; never echo or hardcode |
| Jenkins + GitOps together? | Jenkins does CI (build/scan/push/bump tag in Git); ArgoCD does CD (reads Git → deploys to cluster) — Jenkins never touches the cluster |

---

*Each section links to its teaching module at the top. For the full narrative walkthrough of all tools working together in one pipeline, see [ch19 — Follow One Commit](19-cicd-hands-on-flow.md).*
