# Module 00 — Pre-flight: the ground floor

> **Core question:** Before DevOps: what is a terminal, YAML, Git, an HTTP request — the
> plumbing every later chapter assumes but never stops to teach?

**Module map:** [00-INDEX](00-INDEX.md) · **00a-preflight (you are here)** ·
[00b-setup-runbook](00b-setup-runbook.md) · [01-M0](01-M0-foundations.md) ·
[02-M1](02-M1-terraform.md) · [03-M2](03-M2-ansible.md) · [04-M3](04-M3-docker.md) ·
[05-M4-K8s](05-M4-kubernetes-core.md) · [06-M5](06-M5-sizing-and-cost.md) ·
[07-M6-CI/CD](07-M6-cicd.md) · [08-M7](08-M7-gitops.md) · [09-connected](09-connected-system.md) ·
[10-M8](10-M8-observability-sre.md) · [11-M9](11-M9-advanced-k8s-internals.md) ·
[12-capstone-url](12-capstone-url-shortener.md) · [13-capstone-shop](13-capstone-microshop.md) ·
[14-interview-bank](14-interview-bank.md) · [16-appendix](16-reference-appendix.md)

---

> **⏱️ Time:** ~40 min padho + 20 min lab · **🎚️ Level:** Beginner · **📋 Pehle chahiye:** kuch nahi (yahin se shuru)
>
> **Is module ke baad tum kar paoge:**
> - Terminal mein commands run karo — flags, arguments, pipes, aur redirects ke sath confidently
> - YAML mein valid config likho aur tab vs space ki invisible errors pakad ke fix karo
> - Git workflow samjho: add → commit → push — aur `.gitignore` se secrets protect karo

## Do I need this chapter?

Answer these six questions honestly — no googling:

| # | Question |
|---|----------|
| 1 | Can you open a terminal and run a command with flags? |
| 2 | In YAML, does indentation use spaces or tabs — and does it matter? |
| 3 | What is the difference between `git commit` and `git push`? |
| 4 | You see a `502 Bad Gateway` on a website. Whose fault is it — the browser, the server, or something in between? |
| 5 | What does `10.0.0.0/24` mean — how many addresses does it cover? |
| 6 | What is the difference between `apt install` and `pip install`? |

**Sab aata hai → skip to [M0](01-M0-foundations.md).
Ek bhi atka → yahin se shuru karo.**

---

## The 60-second version

Every DevOps lab in this book runs inside a **terminal** (a text window where you type commands).
The configs it reads are written in **YAML** (a structured text format — indentation is
everything). Every change is saved in **Git** (a version-control system that tracks every edit).
The apps you deploy speak **HTTP** (the web's language of requests and responses) over a
**network** (machines connected by IP addresses and ports). Software is installed via **package
managers** (automated tools that download and wire up dependencies for you).

This chapter gives you just enough of all five to follow every command in the book without
stopping to Google the basics.

---

## The terminal / shell / command line

### What it is

The **terminal** is a text window where you talk to the computer by typing instructions called
**commands**. It runs a program called a **shell** — most commonly **Bash** (Bourne Again SHell)
on Linux/Mac, or a Bash-compatible layer on Windows (see below). When people say "the command
line" or "the CLI (Command-Line Interface)", they mean the same thing.

The **prompt** is the text the shell prints while waiting for your next command. It typically
looks like:

```
gaurav@my-laptop:~$
```

`gaurav` = your username · `my-laptop` = hostname · `~` = current directory (home) · `$` = you
are a normal user (not root).

### Anatomy of a command

```
┌─────────────┬──────────────┬─────────────────────────────┐
│  COMMAND     │  FLAGS       │  ARGUMENT                   │
│  (what to do)│  (how to do) │  (what to act on)           │
│             │              │                             │
│    ls        │  -l  -A      │  /etc                       │
└─────────────┴──────────────┴─────────────────────────────┘

  ls -lA /etc
  ↑ list files, long format, include hidden, in /etc directory
```

- **Flags / options** modify the command's behaviour. Short flags use one dash (`-l`); long flags
  use two (`--all`). They are often combined: `-lA` = `-l -A`.
- **Arguments** are the thing the command acts on — a file path, a URL, a package name.

### `sudo` — run as admin

`sudo` (Substitute User DO) runs the next command with root (administrator) privileges.

```bash
sudo apt update        # why: apt needs root to modify system package lists
```

Use `sudo` only when the command genuinely needs it. Mistakes run as root can delete the entire
system. Never run your normal workflow as root.

### stdout, stderr, and exit codes

Every command writes output to two streams:

| Stream | Purpose | Default destination |
|--------|---------|-------------------|
| **stdout** (standard output) | Normal results | Your terminal screen |
| **stderr** (standard error) | Error messages | Your terminal screen (in red/mixed) |

Every command also exits with a **exit code** (a number). `0` means success. Any non-zero number
means failure. CI/CD pipelines use exit codes to decide whether to continue or abort a pipeline.

### Pipes and redirects

```bash
ls -l /etc | grep "conf"   # pipe: send stdout of ls into grep's stdin
ls -l /etc > listing.txt   # redirect: write stdout to a file (overwrites)
ls -l /etc >> listing.txt  # append: add stdout to end of file
command 2>&1               # merge stderr into stdout (useful in scripts)
```

> 🇮🇳 **Hinglish intuition:** Pipe `|` matlab — pehle wale ka output seedha doosre ke
> muh mein. Jaise assembly line: ek kaam karo, result agle ko do.

### Filesystem paths

| Path form | Meaning | Example |
|-----------|---------|---------|
| **Absolute** | Starts from root `/` — works from anywhere | `/etc/nginx/nginx.conf` |
| **Relative** | Relative to current directory | `./scripts/deploy.sh` |
| **Home `~`** | Shorthand for your home directory | `~/.ssh/config` |

### Getting help

```bash
man ls          # manual page for the ls command (press q to quit)
ls --help       # shorter inline help for most commands
```

### Windows note

Windows CMD (Command Prompt) uses different syntax (`dir` not `ls`, backslashes, etc.). For this
book, use **WSL (Windows Subsystem for Linux)** or **Git Bash** — both give you a real Linux/Bash
environment on Windows so every command in the book works unchanged. See
[00b-setup-runbook](00b-setup-runbook.md) for installation.

---

## Package managers

A **package manager** downloads software, installs it, and resolves all its dependencies
automatically — like an app store for developers, controlled from the terminal.

| Manager | Ecosystem | Install a package |
|---------|-----------|-------------------|
| **apt** (Advanced Package Tool) | Ubuntu/Debian Linux system packages | `sudo apt install nginx` |
| **pip** (Pip Installs Packages) | Python libraries | `pip install requests` |
| **npm** (Node Package Manager) | Node.js / JavaScript | `npm install express` |
| **brew** (Homebrew) | macOS system packages | `brew install git` |

> 🇮🇳 **Hinglish intuition:** `apt` = Ubuntu ka system-level app store. `pip` = Python ke liye
> extra books ki library. Dono alag dukaanein hain — `pip install nginx` kaam nahi karega.

---

## Linux essentials you'll actually use

### Files and directories

```bash
pwd             # Print Working Directory — where am I?
ls -lh          # list files, human-readable sizes
cd /etc/nginx   # Change Directory
cat file.txt    # print a file to screen
less file.txt   # scroll through a file (q to quit)
grep "error" app.log   # search for "error" inside a file
mkdir -p src/app       # make directories (including parents)
rm -rf old-dir/        # remove directory and all contents (careful!)
```

### Root vs normal user

The **root** user (UID — User ID — 0) has unlimited system access. Normal users are restricted.
On production servers you almost never log in as root directly — you use `sudo` for individual
commands that need elevation.

**File permissions** in one paragraph: every file has three permission sets — owner, group,
others — each with read (`r`), write (`w`), execute (`x`) flags. `chmod 755 script.sh` makes a
script readable and executable by everyone, writable only by the owner. You will see this in
Ansible and Docker labs; `ls -l` shows permissions in the first column.

### Processes, daemons, and services

A **process** is a running program. A **daemon** (background service) is a process that starts
at boot and runs continuously without a terminal attached — `nginx`, `sshd` (SSH Daemon), and
`kubelet` are all daemons. On modern Linux, `systemd` manages daemons.

```bash
systemctl status nginx      # is nginx running?
systemctl restart nginx     # restart it
journalctl -u nginx -f      # tail nginx logs in real time
ps aux | grep nginx         # find nginx processes by name
```

---

## YAML — the language of every config file

YAML (YAML Ain't Markup Language — yes, a recursive name) is the format used by **Docker Compose,
Ansible playbooks, Kubernetes manifests, and every CI/CD pipeline file** in this book. Mastering
YAML means mastering half the frustration of DevOps config.

### The five rules

**Rule 1 — `key: value` pairs**

```yaml
name: gaurav
age: 28
active: true
```

**Rule 2 — Indentation = structure. 2 spaces. NEVER tabs.**

```yaml
# CORRECT
server:
  host: localhost
  port: 8080

# BROKEN — mixed indent or tab causes a parse error
server:
    host: localhost    # 4 spaces instead of 2 — may parse but inconsistent
  port: 8080          # misaligned — YAML parser will reject or misread
```

> ⚠️ **Wrong indentation is the #1 YAML bug for beginners.** Configure your editor to
> show tabs as errors and auto-indent with 2 spaces.

**Rule 3 — `-` starts a list item**

```yaml
tools:
  - terraform
  - ansible
  - docker
  - kubernetes
```

**Rule 4 — Nesting is unlimited — just keep the 2-space rule**

```yaml
app:
  name: url-shortener
  replicas: 3
  env:
    - name: DB_HOST
      value: postgres.default.svc.cluster.local
    - name: DB_PORT
      value: "5432"
```

**Rule 5 — `#` is a comment; data types matter**

```yaml
# This whole line is a comment
port: 5432         # integer
port: "5432"       # string — quotes force string type
enabled: true      # boolean (not "True", not "yes" in modern YAML)
description: |     # multi-line string: | preserves newlines
  Line one.
  Line two.
```

> 🔮 **Predict pehle (socho, phir aage padho):** Is YAML snippet mein tab character hai, spaces nahi — parser kya karega, aur error kahan dikhega?

### Valid vs broken — spot the difference

```yaml
# ✅ VALID
database:
  host: db.internal
  port: 5432
  credentials:
    user: admin
    password: secret

# ❌ BROKEN — tab character used for indent (invisible but fatal)
database:
	host: db.internal    # ← tab, not spaces — YAML will reject this
```

### YAML vs JSON (JavaScript Object Notation)

Kubernetes accepts both; CI tools almost always use YAML. JSON is what APIs return (see HTTP
section). Knowing both is useful; YAML is what you write, JSON is often what you read from APIs.

| Feature | YAML | JSON |
|---------|------|------|
| Human readability | High | Medium |
| Comments | Yes (`#`) | No |
| Indentation required | Yes — strict | No (uses `{}` and `[]`) |
| Used for | Config files | API payloads |

> 🇮🇳 **Hinglish intuition:** YAML ek to-do list ki tarah hai — indent se structure pata
> chalta hai. Tab aur space ka farak aankhon se nahi dikta, par computer ke liye zameen-aasmaan
> ka farak hai.

---

## Git — the spine of the whole book

**Git** is a version-control system. Every file you write for DevOps — Terraform configs,
Dockerfiles, Kubernetes manifests, Ansible playbooks — lives in a Git **repository** (repo). Git
tracks every change, who made it, and when. It is also the trigger for every CI/CD pipeline.

### Core concepts

| Concept | What it means |
|---------|--------------|
| **Repository (repo)** | A folder tracked by Git — contains your files + the full history of every change |
| **Working directory** | Files on your disk that you are currently editing |
| **Staging area (index)** | A holding area — you `git add` files here before committing |
| **Commit** | A saved snapshot of staged changes, with a unique ID (SHA — Secure Hash Algorithm) |
| **Branch** | A parallel line of development — `main` is the default; feature branches keep work isolated |
| **Remote** | A copy of the repo on a server, e.g. GitHub or GitLab — enables collaboration and is what CI reads |

### The four commands you will use every day

```bash
git clone https://github.com/org/repo.git   # copy a remote repo to your machine
git add terraform/main.tf                   # stage a specific file
git commit -m "feat: add VPC module"        # save a snapshot with a message
git push origin main                        # upload commits to the remote
git pull                                    # download and merge remote changes
```

### A commit timeline

```
time ──────────────────────────────────────────────────────────►

  A───B───C───D      ← main branch
          │
          └───E───F  ← feature/add-cicd  (branch off from C)

  A = Initial commit (Terraform base)
  B = feat: add VPC
  C = feat: add EC2 module
  D = chore: update README            ← latest on main
  E = feat: add GitHub Actions file   ← your work-in-progress
  F = fix: correct image tag          ← pushed to PR, gets reviewed
```

### Undo with `git revert`

`git revert <commit-sha>` creates a **new commit** that undoes the changes of the target commit.
It does not delete history — it is the safe, production-friendly way to roll back. You will see
this pattern in [M7 GitOps](08-M7-gitops.md) and the capstone.

### `.gitignore` — never commit secrets or state files

```
# .gitignore
*.tfstate           # Terraform state — contains plaintext secrets
*.tfstate.backup
.env                # environment files — contain passwords and API keys
node_modules/       # dependency folder — can be 100k files; regenerate with npm install
```

> ⚠️ **Once a secret is committed to Git history it is exposed — even if you delete the
> file in the next commit.** Git history is permanent. Rotate any secret that ever touched a
> commit.

> 🇮🇳 **Hinglish intuition:** Git ek time machine hai for your code. `commit` = ek save point
> banao. `push` = woh save point GitHub pe bhejo. `clone` = doosre ki machine se saari history
> apne paas laao. GitOps ka matlab: yeh time machine hi production ki "sach" ban jaati hai.

---

## Networking from zero

### IP address and port

An **IP (Internet Protocol) address** is a machine's address on a network — like a postal
address for computers. An **IPv4** address looks like `192.168.1.10` (four numbers, 0–255, dot
separated).

A **port** is a numbered doorway on that address. The same machine can run many services by
putting each on a different port. Ports 0–1023 are reserved system ports; ports 1024–65535 are
available for apps.

```
  Machine at 10.0.0.5
  ┌────────────────────────────────┐
  │  :80   nginx (HTTP server)     │
  │  :443  nginx (HTTPS server)    │
  │  :5432 PostgreSQL database     │
  │  :8080 your app                │
  └────────────────────────────────┘
```

### localhost, 127.0.0.1, and 0.0.0.0

| Address | Meaning |
|---------|---------|
| `localhost` / `127.0.0.1` | The machine itself — traffic never leaves the box |
| `0.0.0.0` | "Bind to all network interfaces" — used in server config to accept external traffic |
| `::1` | IPv6 localhost |

When a Kubernetes pod exposes port 8080 on `0.0.0.0`, it is reachable from outside the container.
When it binds to `127.0.0.1` only, it is reachable only from within the same container.

### DNS — the phonebook

**DNS (Domain Name System)** translates human-readable names (`google.com`) into IP addresses
(`142.250.80.46`). Without DNS you would need to memorise IP addresses. In Kubernetes, DNS is
also how services find each other: `postgres.default.svc.cluster.local` resolves to the IP of
the Postgres Service inside the cluster.

### CIDR notation — how many addresses?

**CIDR (Classless Inter-Domain Routing)** notation expresses a range of IP addresses as
`address/prefix-length`. The prefix length (the number after `/`) tells you how many bits are
fixed — the rest are free to vary.

| CIDR | Fixed bits | Free bits | Addresses | Use case |
|------|-----------|-----------|-----------|----------|
| `/32` | 32 | 0 | 1 | A single host |
| `/24` | 24 | 8 | 256 | A small subnet |
| `/16` | 16 | 16 | 65,536 | A VPC (Virtual Private Cloud) |
| `/8` | 8 | 24 | 16,777,216 | A very large block |

**Rule of thumb:** bigger number after `/` = smaller network. `/24` is smaller than `/16`.

A typical AWS VPC uses `10.0.0.0/16` (65k addresses total), then carves it into subnets like
`10.0.1.0/24` (256 addresses each, one per availability zone).

### Public vs private IP

| | Private | Public |
|--|---------|--------|
| Range | `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x` | Everything else |
| Reachable from internet? | No — only inside your network | Yes |
| Cost on AWS | Free | Charged per hour (from Feb 2024) |

Nodes inside a VPC get private IPs. A load balancer or NAT (Network Address Translation) gateway
mediates between them and the public internet.

> 🇮🇳 **Hinglish intuition:** IP address = makaan ka pata. Port = ghar ka kamra number. DNS =
> phonebook jo naam se pata dhundh ke deta hai. CIDR `/24` = ek mohalla (256 ghar). `/16` =
> ek sheher (65k ghar). Bada number = chhota ilaqa.

---

## HTTP & APIs

### Request and response

**HTTP (HyperText Transfer Protocol)** is the language of the web — and of most microservices.
Every interaction is a **request** (client asks) and a **response** (server answers).

```
CLIENT                              SERVER
  │                                   │
  │  GET /health HTTP/1.1             │
  │  Host: api.example.com ──────────►│
  │                                   │
  │◄─────────────── HTTP/1.1 200 OK   │
  │                 {"status":"ok"}   │
```

### HTTP methods

| Method | Meaning | Typical use |
|--------|---------|-------------|
| **GET** | Read a resource | Fetch a page, check `/health` |
| **POST** | Create a resource | Submit a form, create a record |
| **PUT** | Replace a resource | Update a record completely |
| **DELETE** | Remove a resource | Delete a record |

### Status codes

| Range | Category | Key codes |
|-------|----------|-----------|
| **2xx** | Success | `200 OK`, `201 Created`, `204 No Content` |
| **3xx** | Redirect | `301 Moved Permanently`, `302 Found (temporary)` |
| **4xx** | Client error (your fault) | `400 Bad Request`, `401 Unauthorised`, `403 Forbidden`, `404 Not Found` |
| **5xx** | Server error (server's fault) | `500 Internal Server Error`, `502 Bad Gateway`, `503 Service Unavailable` |

**502 Bad Gateway in Kubernetes context:** the load balancer (Nginx Ingress or ALB — Application
Load Balancer) received your request but got no valid response from the backend pod. The pod is
crashing, not yet ready, or does not exist. Check `kubectl get pods` and `kubectl logs`.

**503 Service Unavailable:** the server is up but overloaded or in maintenance, or in Kubernetes
there are zero healthy pods matching the Service selector. Usually a scaling or readiness-probe
problem.

### REST APIs and JSON

A **REST API (Representational State Transfer Application Programming Interface)** is a convention
for building HTTP services: resources are URLs, actions are HTTP methods, data travels as
**JSON (JavaScript Object Notation)** — a lightweight key-value text format identical in
structure to a Python dictionary.

```json
{
  "id": "abc123",
  "url": "https://example.com/very/long/path",
  "short_code": "xyz9",
  "created_at": "2025-07-02T10:00:00Z"
}
```

### `curl` — your API test tool

**curl** (Client URL) makes HTTP requests from the terminal.

```bash
curl https://api.github.com                          # GET request, prints JSON
curl -I https://api.github.com                       # headers only (shows status code)
curl -X POST https://api.example.com/shorten \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'                 # POST with JSON body
```

> 🇮🇳 **Hinglish intuition:** HTTP ek waiter-customer game hai. Customer (browser/curl) ek
> order deta hai (request). Waiter (server) khana laata hai (response). 2xx matlab khana aa
> gaya. 4xx matlab tumne galat order diya. 5xx matlab kitchen mein aag lagi. 502 matlab waiter
> ne kitchen ko dhundha hi nahi — pod crash hua hoga.

---

## The 10 words the book uses before defining them

> ⚠️ These words appear in the first few modules. This table prevents that "what did they just
> say?" moment.

| Word | What it means here |
|------|--------------------|
| **manifest** | A YAML file that describes a desired Kubernetes object (Deployment, Service, etc.) — you write it; Kubernetes reconciles reality to match it |
| **registry vs repository** | **Registry** = where Docker *images* live (e.g. AWS ECR — Elastic Container Registry, DockerHub). **Repository** = where *code* lives (e.g. GitHub). Different things — do not confuse them |
| **node** | A worker machine (physical or virtual) in a Kubernetes cluster — NOT Node.js. A 3-node cluster = 3 servers |
| **namespace ⚠️ (two meanings)** | **(1) Linux namespace:** a kernel primitive that isolates a container's view of processes, network, and filesystem (see [M3](04-M3-docker.md)). **(2) Kubernetes namespace:** a virtual folder that groups related K8s objects, like a project folder (see [M4](05-M4-kubernetes-core.md)). Same word — completely unrelated ideas |
| **daemon** | A background process that starts at boot and runs continuously (nginx, sshd, kubelet). Managed by systemd on modern Linux |
| **image vs container** | **Image** = a frozen blueprint (like a `.iso` file). **Container** = a running instance of that image. Many containers can run from one image |
| **flag / option** | A modifier you pass to a command: `-v` (short), `--verbose` (long). Flags change how a command behaves without changing what it acts on |
| **environment variable** | A named piece of config injected into a process at startup (e.g. `DB_HOST=postgres`). Set in shell with `export`, in Docker with `-e`, in K8s with `env:` in the manifest. The safe alternative to hardcoding config |
| **endpoint** | A specific URL and method that a service answers on (e.g. `GET /health`, `POST /shorten`). "The API endpoint for creating a URL" = the POST route |
| **cluster** | A group of machines (nodes) managed together as one system by Kubernetes — you deploy to the cluster; K8s decides which node runs your pod |

---

## Beginner mistakes vs senior insights

| Beginner does | Senior does | Why it matters |
|---------------|-------------|----------------|
| Uses tabs in YAML | Uses 2 spaces, enforced by editor | Tab in YAML causes a parse error that is invisible to the eye |
| `git add .` every time | Stages specific files: `git add file.tf` | Avoids accidentally committing `.env` or `*.tfstate` |
| Hardcodes passwords in config files | Uses environment variables; `.gitignore` + secret manager | Secrets in Git history are permanent leaks even if deleted later |
| Runs everything as `sudo` | Uses `sudo` only for commands that need root | One typo as root can delete the OS |
| Ignores exit codes in scripts | Adds `set -e` to bash scripts | Without `set -e`, a failed command silently continues and causes data loss |
| Calls `502` a "server error" | Diagnoses: load balancer cannot reach a healthy backend pod | `502` is a proxy/LB issue; knowing this cuts debug time from 30 min to 2 min |
| Treats `/24` as "bigger" than `/16` | Knows `/24` = 256 addresses, `/16` = 65k | Bigger prefix = smaller network — counter-intuitive, worth memorising |
| Confuses Docker registry with code repo | Keeps them strictly separate in speech and config | Wrong registry URL = broken pull in K8s, wrong push in CI |

---

## Memory shortcuts

| Concept | Hook |
|---------|------|
| Exit code `0` | Zero = zero problems = success |
| YAML indent | 2 spaces, never a tab — "two fingers, no tabs" |
| Git flow | add → commit → push = stage → snapshot → upload |
| `git revert` | Creates a new commit to undo — history stays intact; safe in production |
| `/24` vs `/16` | Bigger number = smaller neighbourhood |
| `127.0.0.1` | Always home — traffic never leaves the machine |
| `0.0.0.0` | "Open door" — listen on every network interface |
| `502` in K8s | Proxy got no answer from pod — check `kubectl get pods` |
| image vs container | Image = recipe card · Container = the dish on the table |
| namespace ⚠️ | Linux namespace = container wall · K8s namespace = project folder — same word, opposite scale |

---

## Summary

| Topic | The one thing to remember |
|-------|--------------------------|
| Terminal | `command [flags] [argument]` — exit 0 = success, non-zero = failure |
| Package managers | apt = OS packages · pip = Python · npm = Node — they are separate stores |
| Linux essentials | `ls cd cat grep` + `systemctl` for services + `sudo` only when needed |
| YAML | 2-space indent (NEVER tabs) — wrong indent is the #1 silent bug |
| Git | add → commit → push; never commit secrets; `.gitignore` is your safety net |
| Networking | IP = address, port = door, DNS = phonebook, `/24` < `/16` in size |
| HTTP | GET/POST/PUT/DELETE; 2xx ok, 4xx your fault, 5xx server fault; 502 = no backend |
| Glossary | namespace means TWO things; registry ≠ repository; node ≠ Node.js |

---

## Self-check quiz

**Pehle memory se jawab do, phir neeche kholo.**

1. You run a command and get exit code `1`. What does that mean — and how would a CI pipeline
   react?
2. A colleague's YAML file fails to parse. You look at the indentation and it looks right.
   What is the most likely invisible cause?
3. What is the difference between `git commit` and `git push`? Which one is local?
4. You open a website and see `503 Service Unavailable`. In a Kubernetes cluster, what is the
   most likely cause?
5. Your VPC CIDR is `10.0.0.0/16`. You carve a subnet as `10.0.1.0/24`. How many addresses
   does the subnet have?
6. An Ansible playbook stores the DB password as a YAML value and the file is committed to
   GitHub. What should happen immediately?
7. What does `curl -I https://api.github.com` do — and what output tells you the request
   succeeded?
8. A junior engineer says "I deployed the image to the repository." What two words are
   confused, and what are the correct terms?

<details markdown="1"><summary>Jawab dekho</summary>

1. Exit code `1` (any non-zero) means failure. A CI pipeline with `set -e` or a standard
   pipeline runner will stop the build, mark it failed, and not proceed to the next step —
   preventing a broken change from reaching production.

2. The most likely invisible cause is a **tab character** instead of spaces. Tabs look like
   spaces in many editors but YAML parsers reject them. Enable "show whitespace" in your editor
   to spot this.

3. `git commit` saves a snapshot **locally** — nothing leaves your machine. `git push` uploads
   your local commits to the remote (GitHub/GitLab). You can have many commits locally before
   you push once. `commit` is local; `push` is network.

4. In Kubernetes, `503` usually means **zero healthy pods** match the Service's selector — the
   Deployment has no running pods, all pods are crashing (CrashLoopBackOff), or readiness probes
   are failing. Check `kubectl get pods -n <namespace>` and `kubectl describe service`.

5. A `/24` subnet has **256 addresses** (2^8 = 256). AWS reserves 5 of them, leaving 251
   usable for resources.

6. **Immediately rotate the secret.** Git history is permanent — even if you delete the file
   in the next commit, the secret exists in every prior commit and any clone. Change the DB
   password now, update it in a proper secret manager, and add `*.env` and credentials files to
   `.gitignore`.

7. `curl -I` sends a HEAD request — it retrieves **only the HTTP headers**, not the body. The
   first line of the output shows the status code: `HTTP/2 200` confirms the request succeeded.

8. The junior confused **image** and **registry** with **code** and **repository**. Correct
   usage: "I pushed the **Docker image** to the **registry** (ECR/DockerHub)." A repository is
   where source code lives (GitHub). A registry is where container images live. Different
   systems entirely.

</details>

---

## Hands-on lab

Zero cost. No cloud account needed. Do this in your terminal (WSL or Git Bash on Windows —
see [00b-setup-runbook](00b-setup-runbook.md) if you haven't installed these yet).

**Step 1 — Orient yourself in the terminal**

```bash
pwd                    # print current directory
ls -lh ~               # list your home directory with sizes
echo "Hello DevOps"    # print a string to stdout
```

**Step 2 — Write a valid YAML file, then break it**

```bash
# Write a valid YAML config
cat > /tmp/test.yaml << 'EOF'
app:
  name: url-shortener
  port: 8080
  env:
    - name: DB_HOST
      value: localhost
EOF

# Validate it (python is available in WSL)
python3 -c "import yaml, sys; yaml.safe_load(open('/tmp/test.yaml')); print('YAML is valid')"

# Now deliberately break the indent — change "  port" to " port" (1 space instead of 2)
# Edit the file in any text editor, then re-run the python command.
# You will see: yaml.scanner.ScannerError — that is the indent bug in action.
```

**Step 3 — Git: init a repo and make your first commit**

```bash
mkdir -p ~/devops-lab && cd ~/devops-lab
git init
echo "# DevOps Lab" > README.md
git add README.md
git commit -m "chore: initial commit"
git log --oneline            # should show exactly 1 commit
```

**Step 4 — curl an API and read the response**

```bash
curl -s https://api.github.com | head -20      # JSON response, first 20 lines
curl -I https://api.github.com                 # headers only — look for "HTTP/2 200"
```

**✅ Sahi hua to aisa dikhega:**

- `pwd` prints a path like `/home/gaurav` or `/c/Users/Gaurav`
- Valid YAML check prints `YAML is valid`; broken-indent YAML shows a `ScannerError` with a line
  number
- `git log --oneline` shows one line like `a1b2c3d chore: initial commit`
- `curl -I` returns `HTTP/2 200` on the first line; `curl -s` returns a JSON object starting
  with `{"current_user_url":...`

If any step fails, read the error message carefully — the terminal always tells you what went
wrong. Getting comfortable with that habit is itself the lesson.

---

## Where next

You now have the ground floor. Two short stops before the real modules:

1. **[00b-setup-runbook](00b-setup-runbook.md)** — install every tool the book uses (WSL, Git,
   kubectl, Terraform, Helm, AWS CLI, etc.) in one sitting.
2. **[M0 — Foundations](01-M0-foundations.md)** — the DevOps mental model: two loops, four
   layers, stateful vs stateless, pets vs cattle. The conceptual frame every later tool hangs on.
