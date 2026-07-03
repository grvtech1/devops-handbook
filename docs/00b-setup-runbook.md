# Module 00b — Setup Runbook: from zero to ready

> **Core question:** Can you go from a bare Windows 11 laptop to a fully armed DevOps workstation
> — with a verified AWS account, a local Kubernetes cluster, and every tool version-checked —
> without ever touching the AWS root user or committing a secret to Git?

---

> **⏱️ Time:** ~60 min (installs chalte rehte) · **🎚️ Level:** Beginner · **📋 Pehle chahiye:** [00a Pre-flight](00a-preflight.md)
>
> **Is module ke baad tum kar paoge:**
> - WSL2, Git, Docker, Terraform, kubectl, AWS CLI, Ansible, aur kind install karke har tool ka version verify karo
> - AWS account secure karo: root user lock karo, IAM user banao, MFA enable karo, billing alarm lagao
> - `aws sts get-caller-identity` se CLI authentication confirm karo aur local kind cluster `Ready` state mein chalao

## Before you begin

This runbook follows [00a — Preflight](00a-preflight.md) and lands you at the starting line for
[M0 — Foundations](01-M0-foundations.md). Work through it in order. Every step has a **verify
command** — do not move on until your output matches.

**Time estimate:** 60–90 minutes for a fresh machine with a decent internet connection.

---

## What you'll install (and why)

| Tool | What it is | What it does in this book | Verify command |
|------|-----------|--------------------------|---------------|
| **WSL2 + Ubuntu** | Windows Subsystem for Linux v2 | Gives you a real Linux shell on Windows — all book commands run here | `wsl -l -v` |
| **Git** | Distributed version-control system | Tracks every config/code change; the spine of every DevOps workflow | `git --version` |
| **Docker Desktop** | Container runtime + GUI | Builds and runs containers locally; uses WSL2 as its Linux backend | `docker version` |
| **Terraform** | Infrastructure-as-Code CLI | Provisions AWS resources from `.tf` files — the outer loop | `terraform -version` |
| **kubectl** | Kubernetes CLI (kube-control) | Sends commands to any Kubernetes cluster | `kubectl version --client` |
| **AWS CLI v2** | AWS Command Line Interface | Talks to every AWS service from your terminal | `aws --version` |
| **Ansible** | Agentless configuration management | Configures Linux servers via SSH — companion to Terraform | `ansible --version` |
| **kind** | Kubernetes IN Docker | Local Kubernetes cluster that runs inside Docker — zero cloud cost | `kind version` |

> 🇮🇳 **Hinglish intuition:** Yeh sab tools ek ek karke install karne hain — ekdum waisi tarah
> jaise naya phone set karte waqt ek ek app download karte ho. Fark sirf itna hai ki yahan
> **verify command** hai jo confirm karta hai ki tool sahi kaam kar raha hai.

---

## Step 1 — Windows: enable WSL2 + Ubuntu

**Why:** All book commands are written for Linux. WSL2 (Windows Subsystem for Linux version 2)
gives you a full Linux kernel running inside Windows — no dual-boot, no VM hassle.

Open **PowerShell as Administrator** and run:

```powershell
# Install WSL2 with the Ubuntu distribution in one command
wsl --install
```

> _Why this command:_ Microsoft bundles WSL2 + Ubuntu installation into a single command since
> Windows 11. It enables the WSL2 feature, downloads the Linux kernel, and installs Ubuntu 22.04.

Restart your machine when prompted. After restart, Ubuntu will finish setup and ask you to create
a Linux username and password (these are independent of your Windows login).

**Verify WSL2 is running with version 2:**

```powershell
# In PowerShell
wsl -l -v
```

Expected output:

```
  NAME      STATE           VERSION
* Ubuntu    Running         2
```

The `2` in the VERSION column is the critical check — WSL1 does not have a real Linux kernel.

**Verify your Ubuntu version inside the WSL shell:**

```bash
# Inside the Ubuntu terminal
lsb_release -a
```

Expected output (Ubuntu 22.04 or 24.04 LTS, depending on your install):

```
No LSB modules are available.
Distributor ID: Ubuntu
Description:    Ubuntu 22.04.x LTS  (or 24.04.x LTS)
Release:        22.04  (or 24.04)
Codename:       jammy  (or noble)
```

> **Note:** `wsl --install` may default to Ubuntu 22.04 or 24.04 depending on your Windows
> version and Microsoft's current default. Both work for this book. The Git version you install
> in Step 2 will vary accordingly — Ubuntu 22.04 ships git 2.34.x; Ubuntu 24.04 ships git 2.43.x.

> **Mac/Linux note:** Skip this step. You already have a native terminal. On macOS, install
> Homebrew (`/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`)
> — it replaces `apt` in the commands below.

**From this point, run all commands inside the Ubuntu (WSL2) terminal unless stated otherwise.**

---

## Step 2 — Update the system & install basics

**Why:** A fresh Ubuntu install has outdated package lists. Update first so everything you install
is the latest stable version. `curl` fetches files over HTTP/HTTPS; `unzip` extracts archives —
both are needed by later installers.

```bash
# Refresh the package list and upgrade all installed packages
sudo apt update && sudo apt upgrade -y

# Install essential utilities
sudo apt install -y git curl unzip
```

**Verify Git:**

```bash
git --version
```

Expected output:

```
git version 2.43.x
```

**Configure Git identity** (this stamps every commit you ever make):

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

---

## Step 3 — Install Docker Desktop

**Why:** Docker runs containers — isolated, reproducible application packages. Docker Desktop
(Windows app) connects to the WSL2 backend so containers you build in the Ubuntu shell run
natively on the Linux kernel, not through emulation.

1. Download **Docker Desktop for Windows** from [https://www.docker.com/products/docker-desktop/](https://www.docker.com/products/docker-desktop/).
2. Run the installer. Accept defaults.
3. After install, open Docker Desktop → **Settings → Resources → WSL Integration** → enable
   integration for your Ubuntu distribution.
4. Start Docker Desktop (the whale icon must be running in the system tray).

**Verify in your Ubuntu shell:**

```bash
# Check the Docker engine version
docker version
```

Expected output (abbreviated):

```
Client: Docker Engine - Community
 Version:           27.x.x
 ...
Server: Docker Desktop
 Engine:
  Version:          27.x.x
  ...
```

**Smoke test — run the official hello-world image:**

```bash
docker run hello-world
```

Expected output (key lines):

```
Hello from Docker!
This message shows that your installation appears to be working correctly.
```

> 🇮🇳 **Hinglish intuition:** Docker Desktop = Windows pe chhota Linux factory. Jab tum
> `docker run` karte ho, Docker ek naya sandauk (container) banata hai, usme app daalta hai,
> chalata hai, aur khatam hone pe hata deta hai. Koi kachra nahi.

> **Mac note:** Docker Desktop for Mac works the same way — download the `.dmg` from Docker's
> site. No WSL step needed.
>
> **Linux note:** Install the Docker Engine directly via `apt` — Docker Desktop is not required
> on native Linux.

---

## Step 4 — Install Terraform

**Why:** Terraform (by HashiCorp) is the industry-standard **Infrastructure-as-Code (IaC)** tool.
You write what AWS resources you want in `.tf` files and Terraform creates/changes/destroys them.
It is the outer loop of every DevOps system in this book.

```bash
# Add HashiCorp's GPG (GNU Privacy Guard) signing key so apt can verify the package
wget -O - https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor \
  -o /usr/share/keyrings/hashicorp-archive-keyring.gpg

# Add the HashiCorp apt repository
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] \
  https://apt.releases.hashicorp.com $(lsb_release -cs) main" | \
  sudo tee /etc/apt/sources.list.d/hashicorp.list

# Update package list and install Terraform
sudo apt update && sudo apt install -y terraform
```

**Verify:**

```bash
terraform -version
```

Expected output:

```
Terraform v1.x.x
on linux_amd64
```

> **Alternative — tfenv:** If you need to switch Terraform versions across projects, install
> `tfenv` (Terraform version manager) first. `tfenv install latest && tfenv use latest` gives
> the same result with version flexibility.
>
> **Mac:** `brew tap hashicorp/tap && brew install hashicorp/tap/terraform`

---

## Step 5 — Install kubectl

**Why:** `kubectl` (pronounced "kube-control" or "kube-cuttle") is the CLI for Kubernetes. Every
interaction with a cluster — deploying apps, checking pod status, reading logs — goes through it.

```bash
# Download the latest stable kubectl binary
curl -LO "https://dl.k8s.io/release/$(curl -Ls \
  https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"

# Make it executable and move to a directory in your PATH
chmod +x kubectl
sudo mv kubectl /usr/local/bin/kubectl
```

**Verify:**

```bash
kubectl version --client
```

Expected output:

```
Client Version: v1.xx.x
Kustomize Version: v5.x.x
```

> **Mac:** `brew install kubectl`
>
> **Windows (native):** `winget install -e --id Kubernetes.kubectl` — but use the WSL version
> for this book; mixing native Windows kubectl with WSL kind clusters causes context confusion.

---

## Step 6 — Install AWS CLI v2

**Why:** The **AWS CLI** (Amazon Web Services Command Line Interface) lets you control all AWS
services from the terminal. Terraform and Ansible both use it under the hood for authentication.

```bash
# Download the AWS CLI v2 installer bundle
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"

# Extract and run the installer
unzip awscliv2.zip
sudo ./aws/install

# Clean up
rm -rf aws awscliv2.zip
```

**Verify:**

```bash
aws --version
```

Expected output:

```
aws-cli/2.x.x Python/3.x.x Linux/x86_64 exe/x86_64
```

> **Mac:** `brew install awscli`
>
> **Upgrade an existing v1 install:** `sudo ./aws/install --update`

---

## Step 7 — Install Ansible

**Why:** Ansible configures servers after Terraform creates them — installs software, writes
config files, manages services. It connects over SSH (Secure Shell) with no agent installed on
the target machine, which is why it's called "agentless".

```bash
# Install pipx — a tool for installing Python CLI apps in isolated environments
sudo apt install -y pipx
pipx ensurepath

# Reload PATH so the shell sees pipx-installed binaries
source ~/.bashrc

# Install Ansible via pipx
pipx install ansible
```

**Verify:**

```bash
ansible --version
```

Expected output (key line):

```
ansible [core 2.x.x]
  python version = 3.x.x
  ...
```

> **Mac:** `brew install ansible`
>
> **Alternative:** `sudo apt install -y ansible` works too, but the pipx method gives you a more
> isolated install that avoids Python dependency conflicts on the system.

---

## Step 8 — A local Kubernetes cluster for practice

**Why:** Cloud Kubernetes clusters cost money and take 10+ minutes to provision. `kind`
(Kubernetes IN Docker) spins up a full Kubernetes cluster inside Docker containers on your
laptop — it's free, starts in 60 seconds, and is destroyed just as fast. You'll use it for every
K8s lab until the capstone projects.

> 🇮🇳 **Hinglish intuition:** kind = ghar pe bana hua chhota AWS EKS. Sikhne ke liye bilkul
> sahi — koi bill nahi, koi wait nahi. Real cloud cluster capstone mein aayega jab concept
> pakke ho jayenge.

### Install kind

> **Note:** The version below may be outdated. Check the latest release at
> https://github.com/kubernetes-sigs/kind/releases and substitute the current tag.

```bash
# Fetch the latest kind release tag dynamically
KIND_VERSION=$(curl -s https://api.github.com/repos/kubernetes-sigs/kind/releases/latest \
  | grep tag_name | cut -d '"' -f 4)

# Download the kind binary for Linux amd64
curl -Lo ./kind "https://kind.sigs.k8s.io/dl/${KIND_VERSION}/kind-linux-amd64"

# Make it executable and move to PATH
chmod +x kind
sudo mv kind /usr/local/bin/kind
```

**Verify:**

```bash
kind version
```

Expected output (version number will vary):

```
kind v0.2x.x go1.xx.x linux/amd64
```

### Create your first local cluster

```bash
# Create a single-node cluster named "devops-lab"
kind create cluster --name devops-lab
```

Expected output:

```
Creating cluster "devops-lab" ...
 ✓ Ensuring node image (kindest/node:v1.xx.x) 🖼
 ✓ Preparing nodes 📦
 ✓ Writing configuration 📜
 ✓ Starting control-plane 🕹️
 ✓ Installing CNI 🔌
 ✓ Installing StorageClass 💾
Set kubectl context to "kind-devops-lab"
...
Have a nice day! 👋
```

**Verify the cluster is ready:**

```bash
kubectl get nodes
```

Expected output:

```
NAME                       STATUS   ROLES           AGE   VERSION
devops-lab-control-plane   Ready    control-plane   60s   v1.xx.x
```

The `Ready` status is the critical check. If you see `NotReady`, wait 20 seconds and try again —
the CNI (Container Network Interface, the cluster's internal network plugin) may still be
initialising.

> **Alternatives:**
> - **minikube** — similar to kind, slightly heavier, has a built-in dashboard. Cross-platform.
>   `brew install minikube` / `apt` / Windows binary.
> - **k3d** — wraps k3s (lightweight Kubernetes) in Docker; faster than kind, Linux/Mac primary.
>   Not recommended on WSL2 due to iptables (firewall rules) quirks.
>
> For this book's labs, **kind** is the default. Commands are identical across all three for
> basic usage.

---

## Step 9 — Create & secure your AWS account

### 9.1 Sign up

Go to [https://aws.amazon.com/](https://aws.amazon.com/) → **Create an AWS Account**. You need:
- An email address
- A credit/debit card (AWS will not charge you for Free Tier usage, but requires a card on file)
- A phone number for verification

### 9.2 Understand the root user — and why you must lock it away

When you create an AWS account, Amazon creates a **root user** — a super-administrator account
that has unlimited access to every resource and billing setting in the account. It cannot be
restricted by any policy.

**SECURITY RULE: Never use the root user for daily work.** The root user is only for:
- Closing the account
- Restoring access if all IAM users are locked out
- Changing the support plan

After signup, do this immediately:

1. Log into the AWS Console as root.
2. Go to your account name (top-right) → **Security credentials**.
3. Enable **MFA (Multi-Factor Authentication)** on the root account — use an authenticator app.
4. Create no access keys for the root account. If any exist, delete them.

> 🇮🇳 **Hinglish intuition:** Root user = ghar ki master key. Locker mein rakh do aur roz use
> mat karo. Roz ke kaam ke liye ek alag chhoti key banao (IAM user).

### 9.3 Create an IAM user for daily work

**IAM** stands for **Identity and Access Management** — AWS's system for controlling who can do
what. You'll create a user with just enough permissions to run the book's labs.

In the AWS Console:

1. Search for **IAM** → **Users** → **Create user**.
2. Username: `devops-learner` (or your name).
3. Access type: check **Provide user access to the AWS Management Console** → **I want to create
   an IAM user** → set a password.
4. Permissions: **Attach policies directly** → attach `AdministratorAccess` for now.

> **Tradeoff note:** `AdministratorAccess` is broad. For a production account you would create a
> scoped policy (only EC2, S3, EKS, IAM limited). For learning, full admin reduces friction — but
> note: even admin IAM users cannot close the account or change billing methods (only root can).
> Revisit the principle of least privilege in [M1 — Terraform](02-M1-terraform.md).

5. **Create access keys** for the new user:
   - Go to the user → **Security credentials** → **Create access key**.
   - Use case: **CLI**.
   - Download the `.csv` file — you will never be able to see the secret key again after closing
     this screen.

You will receive two values — guard them as carefully as a password:
- **Access Key ID** — like a username for API calls (starts with `AKIA…`)
- **Secret Access Key** — like the password (a 40-character string)

> ⚠️ **SECURITY — non-negotiable rules:**
> 1. **Never commit these keys to Git.** Not even to a private repo. GitHub scanners and
>    malicious forks can expose them within minutes. Rotate immediately if you ever do this.
> 2. **Never paste them in Slack, email, or screenshots.**
> 3. **Never share them.** Each team member gets their own IAM user and their own keys.
> 4. Add `.env` and `*credentials*` to your `.gitignore` before you start any project.

### 9.4 Choose a region

AWS runs in **regions** — geographically isolated data-centre clusters (e.g., `us-east-1` in
Virginia, `ap-south-1` in Mumbai). For this book:

| Your location | Recommended region | Code |
|---------------|--------------------|------|
| India | Mumbai | `ap-south-1` |
| US East | N. Virginia | `us-east-1` |
| Europe | Ireland | `eu-west-1` |

**Use `ap-south-1` if you are in India** — lower latency and often lower cost for EC2.

---

## Step 10 — Configure the AWS CLI

**Why:** The CLI needs to know which credentials to use and which region to default to. `aws
configure` writes these to `~/.aws/credentials` and `~/.aws/config`.

```bash
aws configure
```

You'll be prompted interactively — enter the values from Step 9:

```
AWS Access Key ID [None]: AKIAIOSFODNN7EXAMPLE
AWS Secret Access Key [None]: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
Default region name [None]: ap-south-1
Default output format [None]: json
```

**Verify — the most important check in this runbook:**

```bash
aws sts get-caller-identity
```

**STS** stands for **Security Token Service** — AWS's identity broker. `get-caller-identity`
returns who the CLI thinks you are. Expected output:

```json
{
    "UserId": "AIDACKCEVSQ6C2EXAMPLE",
    "Account": "123456789012",
    "Arn": "arn:aws:iam::123456789012:user/devops-learner"
}
```

**What is an ARN?** An **ARN (Amazon Resource Name)** is the globally unique identifier for any
AWS resource. Format: `arn:partition:service:region:account-id:resource`. If this command returns
your user's ARN, the CLI is correctly authenticated and talking to your account.

If you see `An error occurred (InvalidClientTokenId)` — your keys were typed incorrectly. Run
`aws configure` again.

---

## Step 11 — Free Tier, billing alerts & cost discipline

### What the Free Tier actually covers

The **AWS Free Tier** gives you 12 months of limited free usage after signup. Key limits:

| Service | Free Tier limit | Common trap |
|---------|----------------|-------------|
| EC2 | 750 hrs/month of `t2.micro` or `t3.micro` | Running 2 micros = 1500 hrs → charged for 750 |
| S3 | 5 GB storage, 20k GET, 2k PUT | Large file uploads / egress cost extra |
| RDS | 750 hrs/month of `db.t2.micro` | Leaving RDS on overnight burns hours fast |
| Lambda | 1M requests / month | Almost impossible to exceed in learning |
| EKS control plane | **NOT free** — $0.10/hour per cluster (~$72/month) | Use local kind instead |
| NAT Gateway | **NOT free** — ~$0.045/hr + data | Destroy when done; one of the biggest surprise bills |

> ⚠️ **kubeadm cluster on EC2:** Running a multi-node Kubernetes cluster on EC2 requires ≥2 CPU /
> 2 GB RAM per node — that's `t3.small` or larger, which is **not** Free Tier. For all K8s labs,
> use local `kind`. The cloud EKS cluster is reserved for the capstone projects where the spend
> is intentional and time-bounded.

### Set a billing alarm now (before you create anything)

**Recommended (2 minutes, no CLI required):** AWS Console → **Billing** → **Budgets** →
**Create budget** → Cost budget → $10/month → email alert. Do this before any lab.

> **CLI alternative (advanced):** The CloudWatch billing alarm command below requires an SNS
> topic to exist first. Create one with `aws sns create-topic --name billing-alerts` and add
> a subscription (`aws sns subscribe ...`) before running the alarm command. Without the topic,
> `--alarm-actions` will point to a non-existent ARN and the alarm is silently created but
> never fires.
>
> ```bash
> # Step 1: create the SNS topic (once)
> aws sns create-topic --name billing-alerts --region us-east-1
> # Step 2: subscribe your email (check inbox for confirmation link)
> aws sns subscribe --topic-arn arn:aws:sns:us-east-1:YOUR_ACCOUNT_ID:billing-alerts \
>   --protocol email --notification-endpoint you@example.com --region us-east-1
> # Step 3: create the alarm
> aws cloudwatch put-metric-alarm \
>   --alarm-name "MonthlySpendAlert-10USD" \
>   --alarm-description "Alert when estimated charges exceed $10" \
>   --metric-name EstimatedCharges \
>   --namespace AWS/Billing \
>   --statistic Maximum \
>   --period 86400 \
>   --threshold 10 \
>   --comparison-operator GreaterThanThreshold \
>   --dimensions Name=Currency,Value=USD \
>   --evaluation-periods 1 \
>   --alarm-actions arn:aws:sns:us-east-1:YOUR_ACCOUNT_ID:billing-alerts \
>   --region us-east-1
> ```

### The golden rule — `terraform destroy` before you stop for the day

```bash
# In any Terraform project directory — run this before closing your laptop
terraform destroy
```

This tears down every resource the current plan created. A forgotten EC2 instance at `t3.small`
costs ~$15/month. A forgotten NAT Gateway costs ~$33/month plus data transfer. These are not
hypothetical — they are the most common way learners get surprise AWS bills.

> 🇮🇳 **Hinglish intuition:** `terraform destroy` = ghar se nikalne se pehle lights off karo.
> Har raat karo. Bhool gaye to bill aayega — AWS tumhe nahi rokta.

---

## Verify everything — the pre-flight checklist

Run each command below and confirm the output matches:

| Tool | Command | Expected output |
|------|---------|----------------|
| WSL2 | `wsl -l -v` (PowerShell) | Ubuntu, VERSION 2, Running |
| Ubuntu | `lsb_release -a` | Ubuntu 22.04 or 24.04 LTS |
| Git | `git --version` | `git version 2.x.x` |
| Docker | `docker version` | Client + Server versions shown |
| Docker smoke | `docker run hello-world` | "Hello from Docker!" |
| Terraform | `terraform -version` | `Terraform v1.x.x` |
| kubectl | `kubectl version --client` | `Client Version: v1.xx.x` |
| AWS CLI | `aws --version` | `aws-cli/2.x.x` |
| Ansible | `ansible --version` | `ansible [core 2.x.x]` |
| kind | `kind version` | `kind v0.23.x` |
| Kubernetes | `kubectl get nodes` | `devops-lab-control-plane   Ready` |
| AWS auth | `aws sts get-caller-identity` | JSON with your account ID and user ARN |

**✅ Sab ✓ ho gaya to aisa dikhega:** Every tool prints a version number without errors, Docker
prints "Hello from Docker!", kubectl shows a `Ready` node, and `aws sts get-caller-identity`
returns a JSON blob with your ARN. That ARN is proof that your local terminal is authorised to
talk to your AWS account.

---

## Common setup gotchas

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `&&` not working in PowerShell | PowerShell 5.1 does not support `&&` | Use `;` or switch to WSL Ubuntu shell |
| `docker: command not found` in WSL | Docker Desktop WSL integration off | Docker Desktop → Settings → WSL Integration → enable Ubuntu |
| Docker Desktop not responding | Docker not started | Look for the whale icon in the system tray; start it manually |
| `aws configure` wrong region | Set `us-east-1` instead of `ap-south-1` | Run `aws configure` again; or edit `~/.aws/config` directly |
| `InvalidClientTokenId` from AWS CLI | Keys copied with trailing whitespace | Re-run `aws configure` and paste carefully, or open `~/.aws/credentials` in a text editor |
| `kubectl get nodes` — no objects found | kubectl pointing at wrong context | Run `kubectl config current-context`; should show `kind-devops-lab`. If not: `kubectl config use-context kind-devops-lab` |
| `kind create cluster` hangs | Docker Desktop not running | Start Docker Desktop first, then retry |
| `terraform: command not found` | HashiCorp apt repo not added correctly | Re-run Step 4 exactly; check `cat /etc/apt/sources.list.d/hashicorp.list` |
| `ansible: command not found` after pipx install | PATH not refreshed | Run `source ~/.bashrc` or open a new terminal window |
| WSL version shows `1` | WSL2 not set as default | Run `wsl --set-default-version 2` in PowerShell and re-install Ubuntu |

> 🇮🇳 **Hinglish intuition:** Setup mein problem aana bilkul normal hai — iska matlab yeh nahi
> ki tum galat ho, iska matlab hai ki environment complex hai. Upar ki table dekho, symptom
> milao, fix karo. Ek ek step.

---

## Mac-specific quick reference

| Step | Mac equivalent |
|------|---------------|
| WSL2 | Skip — use Terminal.app or iTerm2 directly |
| `apt install` | `brew install` (requires Homebrew) |
| Docker Desktop | Download the `.dmg` from docker.com — same experience |
| Terraform | `brew tap hashicorp/tap && brew install hashicorp/tap/terraform` |
| kubectl | `brew install kubectl` |
| AWS CLI | `brew install awscli` |
| kind | `brew install kind` |
| Ansible | `brew install ansible` |

---

## Linux-specific notes

On native Ubuntu/Debian Linux, skip Steps 1 and 3 (WSL2 and Docker Desktop). Instead:

```bash
# Install Docker Engine directly (not Docker Desktop)
sudo apt install -y docker.io
sudo usermod -aG docker $USER   # add yourself to the docker group
newgrp docker                   # apply without logout
```

Everything else in this runbook runs identically on native Linux.

---

## Where next

You are fully equipped. Every tool is installed, your AWS account is secure, and a local
Kubernetes cluster is running. Head to:

**→ [M0 — Foundations & Mental Model](01-M0-foundations.md)**

M0 builds the conceptual scaffold — the Two Loops model — that makes every tool you just
installed make sense. Do not skip it even if you know some of the tools; the mental model is what
separates engineers who can debug production from engineers who just follow recipes.

---

*Module map: [00-INDEX](00-INDEX.md) · [00a-preflight](00a-preflight.md) · **00b-setup-runbook** · [M0](01-M0-foundations.md) · [M1-Terraform](02-M1-terraform.md) · [M2-Ansible](03-M2-ansible.md) · [M3-Docker](04-M3-docker.md) · [M4-Kubernetes](05-M4-kubernetes-core.md) · [M5-Sizing](06-M5-sizing-and-cost.md) · [M6-CI/CD](07-M6-cicd.md) · [M7-GitOps](08-M7-gitops.md) · [Connected System](09-connected-system.md) · [M8-Observability](10-M8-observability-sre.md) · [M9-Advanced K8s](11-M9-advanced-k8s-internals.md) · [Capstone 1](12-capstone-url-shortener.md) · [Capstone 2](13-capstone-microshop.md) · [Interview Bank](14-interview-bank.md) · [Roadmap](15-roadmap-M11-M18.md) · [Appendix](16-reference-appendix.md) · [Flashcards](17-flashcards.md)*
