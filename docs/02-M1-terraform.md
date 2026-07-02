# M1 — Terraform & Infrastructure as Code

> **Core question:** How do you turn a 400-click AWS console session into a 10-line code review that any teammate can read, reproduce, and audit?

> **⏱️ Time:** ~60 min padho + 30 min lab · **🎚️ Level:** Beginner→Intermediate · **📋 Pehle chahiye:** [M0 — Foundations](01-M0-foundations.md)
>
> **Is module ke baad tum kar paoge:**
> - Terraform lifecycle chalao: `init → plan → apply → destroy` — ek real AWS resource pe end-to-end
> - tfstate file ka role samjho aur drift vs lost-state ka farak interview mein confidently explain karo
> - Modules se multi-environment infrastructure organize karo — dev aur prod ki state alag rakho

> ### ↩️ Recall gate — shuru karne se pehle
> Pichhle modules se 3 sawaal. **Pehle memory se jawab do, phir kholo.** (Yeh retrieve karna hi lifetime yaad rakhta hai — dobara padhna nahi.)
>
> 1. *(M0)* "Idempotency" aur "reconciliation" mein kya farak hai? Dono ko ek line mein define karo.
> 2. *(M0)* "Provisioning" aur "configuration management" alag kyun hain — dono ka ek-ek real-world example do.
> 3. *(M0)* "Pets vs cattle" DevOps mein kya hota hai — aur yeh distinction scale ke liye kyun zaroori hai?
>
> <details markdown="1"><summary>Jawab</summary>
>
> 1. Idempotency = ek operation safely baar baar chalao, result same (single op, safe re-run). Reconciliation = continuous loop jo hamesha desired state enforce karta rehta hai. &nbsp; 2. Provisioning = raw machine banana, e.g., EC2 spin up (Terraform); configuration = uss machine ke andar software daalna, e.g., nginx install (Ansible). Alag concerns, alag tools. &nbsp; 3. Pets = unique, hand-configured servers jo replace nahi ho sakte; cattle = identical, interchangeable nodes jo bina soche replace ho jaate — automation aur scale ke liye zaroori.
> </details>

**Module map:** [00-INDEX](00-INDEX.md) | [01-M0](01-M0-foundations.md) | **02-M1** | [03-M2-ansible](03-M2-ansible.md) | [04-M3-docker](04-M3-docker.md) | [05-M4-kubernetes-core](05-M4-kubernetes-core.md) | [06-M5-sizing-and-cost](06-M5-sizing-and-cost.md) | [07-M6-cicd](07-M6-cicd.md) | [08-M7-gitops](08-M7-gitops.md) | [09-connected-system](09-connected-system.md)

---

## The 60-Second Version

Infrastructure as Code (IaC) means your servers, networks, databases, and firewalls are described in text files — not clicked into existence in a web console. Terraform is the dominant IaC tool. It reads your `.tf` files, compares what you asked for against what actually exists in AWS (using a local record called the **state file**), and makes only the changes needed to close that gap.

Three words explain how Terraform works:

- **Declarative** — you describe the destination, not the steps to get there.
- **State** — Terraform keeps a diary of what it built; that diary is the link between your code and the real world.
- **Idempotent** — run it a hundred times; you still get the same result, not a hundred copies.

---

## Why This Exists — What It Replaced

Before IaC, teams provisioned infrastructure by clicking through cloud consoles manually. This pattern has a name: **ClickOps**.

ClickOps problems:

| Problem | Consequence |
|---|---|
| No record of what was clicked | "Who opened port 22 to the world?" — nobody knows |
| Knowledge lives in one engineer's head | That engineer leaves → knowledge leaves |
| Reproducing an environment takes days | "Just spin up a staging copy" — impossible |
| Audits are guesswork | Compliance teams find untracked servers |
| Snowflake servers | Every machine slightly different; none documented |

A **snowflake server** is one that has been hand-configured until it is unique — special, fragile, and irreplaceable. When it breaks, nobody knows how to rebuild it. IaC eliminates snowflakes: if you can read the `.tf` file, you can rebuild the entire environment from scratch.

> 🇮🇳 **Hinglish intuition:** Pehle infra banane ka koi recipe nahi tha — chef apne mood se banata tha, next day kuch aur. IaC = har dish ka **likha hua recipe** — koi bhi bana sake, har baar same.

---

## Core Concepts

### Infrastructure as Code (IaC)

IaC means expressing infrastructure intent in code files that live in Git. The result:

- **Reviewable** — a pull request shows exactly what will change before it changes.
- **Reproducible** — `terraform apply` in any account recreates the same environment.
- **Auditable** — Git history shows who changed what and when.
- **Versionable** — roll back infrastructure the same way you roll back application code.

### Declarative vs Imperative

| Style | You Write | Tool Does |
|---|---|---|
| **Declarative** (Terraform) | "I want 3 EC2 servers" | Figures out the steps itself |
| **Imperative** (bash script) | "Step 1: create VPC. Step 2: create subnet. Step 3: ..." | Runs exactly what you wrote, blindly |

The declarative approach means Terraform handles the complexity of ordering, dependencies, and partial states. You describe the destination; Terraform plans the route.

### State — The Diary

Terraform maintains a file called `terraform.tfstate`. This JSON file is the link between your code and the real world. It records:

- Every resource Terraform has ever created
- The real cloud identifiers (e.g., `i-0abc1234` for an EC2 instance)
- All resource attributes at the time of the last apply

Without the state file, Terraform cannot know what it has already built. It becomes blind.

> 🇮🇳 **Hinglish intuition:** tfstate = Terraform ki **diary** 📔. "Aaj maine kya banaya, iska ID kya hai" — sab likha hai. Diary gayi to andha ho gaya.

**Critical warning:** The state file contains sensitive data in plaintext — including database passwords. **Never commit it to Git.** Always store it in a remote backend with encryption enabled.

### Idempotent

Idempotent means the operation can be safely repeated. If your code says `count = 3` and you already have 3 servers, running `terraform apply` does nothing. Terraform is performing a SET operation (desired = 3), not an ADD operation (actual += 3).

> 🇮🇳 **Hinglish intuition:** Light switch — ek baar dabao ON hota. Sau baar dabao, ON hi rehta. += nahi hota.

### The Command Lifecycle

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│             │     │             │     │             │     │             │
│  terraform  │────►│  terraform  │────►│  terraform  │────►│  terraform  │
│    init     │     │    plan     │     │    apply    │     │   destroy   │
│             │     │             │     │             │     │             │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
 Download            Preview            Execute              Tear down
 providers &         what will          the plan             all managed
 set up backend      change             (real API calls)     resources
 (once per project)  (safe — no         (costs money,
                     changes made)      changes state)
```

> 🇮🇳 **Hinglish intuition:** `plan` = bill dekhna 🧾. `apply` = payment 💳. Bill padhe bina payment mat karo.

### Providers and Resources

A **provider** is a plugin that knows how to talk to a specific cloud or service. `hashicorp/aws` handles AWS API calls; `hashicorp/google` handles GCP. You declare the provider once; Terraform downloads it during `init`.

A **resource** is a single piece of infrastructure managed by Terraform. Each `resource` block describes one thing to create: one VPC, one security group, one EC2 instance.

A **backend** tells Terraform where to store the state file. The default is a local file on disk. The production-grade choice is a remote backend (S3).

### Annotated HCL Example

HCL (HashiCorp Configuration Language) is Terraform's own file format — readable, structured, designed to describe infrastructure rather than write algorithms.

```hcl
# ── 1. Tell Terraform which cloud provider to use ──────────────────────────
provider "aws" {
  region = "ap-south-1"          # Mumbai region
}

# ── 2. Remote backend — state lives in S3, not on your laptop ──────────────
terraform {
  backend "s3" {
    bucket         = "mycompany-tfstate"          # S3 bucket (create manually first)
    key            = "prod/terraform.tfstate"     # path inside the bucket
    region         = "ap-south-1"
    dynamodb_table = "tf-lock"                    # prevents simultaneous apply
    encrypt        = true                         # server-side encryption
  }
}

# ── 3. A variable — input, not hardcoded ───────────────────────────────────
variable "my_ip" {
  description = "Your office IP for SSH access"
  type        = string
}

# ── 4. A VPC (Virtual Private Cloud) — your private network on AWS ─────────
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"    # CIDR = IP range (Classless Inter-Domain Routing)
  enable_dns_hostnames = true
  tags = { Name = "prod-vpc" }
}

# ── 5. Security Group (SG) — firewall rules ────────────────────────────────
resource "aws_security_group" "web" {
  name   = "web-sg"
  vpc_id = aws_vpc.main.id                # reference to the VPC above (implicit dependency)

  ingress {                               # inbound: allow SSH only from your IP
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["${var.my_ip}/32"]    # /32 = exactly one IP; use IPv4 here (not IPv6)
  }
  egress {                               # outbound: allow everything
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# ── 6. An EC2 instance ─────────────────────────────────────────────────────
resource "aws_instance" "web" {
  ami           = "ami-0f5ee92e2d63afc18"  # AMI = Amazon Machine Image, OS blueprint for EC2
  instance_type = "t3.micro"
  subnet_id     = aws_subnet.public.id     # place in the public subnet
  vpc_security_group_ids = [aws_security_group.web.id]
  tags = { Name = "web-server" }
}

# ── 7. Output — values surfaced after apply, used by Ansible next ──────────
output "web_public_ip" {
  value       = aws_instance.web.public_ip
  description = "Pass this to Ansible inventory"
}
```

Key observations:
- `aws_vpc.main.id` references another resource by type + name — Terraform builds a dependency graph from these and applies in the correct order automatically.
- `var.my_ip` keeps sensitive or environment-specific values out of the code itself.
- The `output` block surfaces the IP that Ansible will need (see [03-M2-ansible.md](03-M2-ansible.md)).

---

## State — The Thing You Must Never Lose

### Why Remote Backend + Lock

> 🔧 **War story:** Ek engineer ka tfstate laptop pe tha — naye teammate ne `terraform apply` kiya, state nahi thi, usne 5 duplicate servers bana diye. Tab tak pata chala jab AWS bill double aa gaya. Poori kahani + lesson → [Interview Bank](14-interview-bank.md).

If the state file lives on your laptop, two problems immediately appear the moment a second person joins the team:

**Problem 1 — Sharing:** Your teammate has no state file. Their Terraform thinks nothing exists. They run `apply` and create duplicate infrastructure: two VPCs, two databases, ten servers instead of five.

**Problem 2 — Corruption:** Two people run `apply` simultaneously. Both read the state, make changes, and write back. The writes overlap. The state file is now corrupt — partial entries, missing IDs, inconsistencies.

**Solution:** Store the state in S3 (solves sharing) and use a DynamoDB table as a distributed lock (solves simultaneous apply).

```bash
# Create the S3 bucket (once, manually — Terraform cannot bootstrap its own backend)
aws s3 mb s3://mycompany-tfstate --region ap-south-1

# Create the DynamoDB lock table (once)
aws dynamodb create-table \
  --table-name tf-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region ap-south-1
```

> 🇮🇳 **Hinglish intuition:** S3 = shared almari (sab padhein). DynamoDB lock = taala 🔒 — ek waqt mein ek hi likhे.

### Secrets in State

Terraform writes every resource attribute to the state file in plaintext. This includes:

- Database passwords passed via `variable "db_password" { sensitive = true }`
- Private key material
- API tokens injected into resources

**Non-negotiable rules:**
1. Add `*.tfstate*` to `.gitignore` — before the first commit, not after.
2. Enable `encrypt = true` in the S3 backend block.
3. Apply an IAM policy restricting who can read the S3 bucket.
4. If a state file is accidentally committed, rotate every credential it contains immediately.

> 🔮 **Predict pehle (socho, phir aage padho):** tfstate file delete ho gayi. Agla `terraform plan` kya sochta hai ki exist karta hai — aur kyun ye potentially catastrophic hai?

### Drift vs Lost-State — The Critical Distinction

These two situations look similar but require completely different responses.

| | **Drift** | **Lost-State** |
|---|---|---|
| **What happened** | Someone changed real infrastructure outside Terraform (manual console click, AWS auto-scaling, another tool) | The `tfstate` file was deleted or corrupted |
| **State file** | Intact — Terraform still knows what it built | Gone — Terraform is blind |
| **Terraform's view** | Sees mismatch between state and reality | Sees nothing at all — thinks zero resources exist |
| **Result of `apply`** | Reverts reality back to what code specifies | Creates everything from scratch — you now have double the infrastructure |
| **Concrete example** | Someone manually opened port 80 in the console; `plan` shows `-/+` change | State deleted; 5 servers running; `apply` → 5 new servers → total 10 |
| **Your reflex** | Run `terraform plan` — it shows the drift; run `apply` to revert | Stop. Run `terraform import` for each existing resource to reconstruct state |
| **Recovery command** | `terraform apply` (straightforward) | `terraform import aws_instance.web i-0abc1234` (one resource at a time) |

> 🇮🇳 **Hinglish intuition:**
> - Drift = **diary intact**, par duniya badal gayi. TF diary padh ke duniya ko wapas theek kar deta.
> - Lost-state = **diary jal gayi** ☠️. TF andha — bhool gaya kya banaya tha. 5 naye bana deta.

**Orphaned resource:** A resource that exists in reality but has no entry in the state file. After lost-state, all your existing servers become orphans. Terraform neither manages nor destroys them — they run up your AWS bill invisibly. Fix: `terraform import`.

> 🇮🇳 **Hinglish intuition:** Orphaned resource = **bina maalik ki gaay** 🐄 — zinda hai, khana kha rahi hai, par kisi ki zimmedari mein nahi.

### user_data and Provisioners — Where to Draw the Line

**user_data / cloud-init:** A script you pass to an EC2 instance that runs once at first boot. It is valid for simple, one-time setup tasks — installing a single package, writing a config file at launch time.

```hcl
resource "aws_instance" "web" {
  # ... other args
  user_data = <<-EOF
    #!/bin/bash
    apt-get update -y
    apt-get install -y nginx
  EOF
}
```

> 🇮🇳 **Hinglish intuition:** user_data = "ghar ban-te waqt bijli ka connection lagwa do" — ek baar, construction ke time.

**Provisioner (avoid):** Terraform has `remote-exec` and `local-exec` provisioners that run shell commands against a resource after it is created. They are a trap:

- They run only once at creation — not on re-apply (not idempotent).
- Terraform has no visibility into whether they succeeded.
- They blur the boundary between Terraform (what exists) and Ansible (what is configured inside).
- HashiCorp's own documentation calls them a "last resort."

**Rule:** Terraform provisions the machine. Ansible configures what is inside it. Do not mix them. See [03-M2-ansible.md](03-M2-ansible.md) for how Ansible takes the output IPs from Terraform and configures the servers.

---

## Modules and Environment Isolation

### The DRY Problem

Without modules, a typical team does this: copy `main.tf` to `main-prod.tf`, tweak a few values, and now has two files diverging forever. A bug fix in one has to be manually applied to the other. This is a DRY (Don't Repeat Yourself) violation.

Modules solve it by creating reusable black boxes.

### Modules — Black Box Pattern

A module is a directory containing Terraform files with a defined interface:

- **Inputs = variables** (`variables.tf` inside the module)
- **Outputs = outputs** (`outputs.tf` inside the module)
- **Internal logic = `main.tf`** (the caller does not need to understand it)

> 🇮🇳 **Hinglish intuition:** Module = car engine. Accelerator dabao (input) → car chale (output). Engine kaise kaam karta — driver ko jaanne ki zaroorat nahi.

```
Module: modules/vpc/
├── main.tf        ← creates VPC, subnets, IGW, route tables
├── variables.tf   ← accepts: project, env, cidr_block
└── outputs.tf     ← exposes: vpc_id, subnet_ids, sg_id
```

### The Wiring Diagram — Root Orchestrates, Modules Do Not Talk to Each Other

```
environments/dev/main.tf  (ROOT — the driver)
│
├── module "vpc"
│     source   = "../../modules/vpc"
│     vpc_cidr = "10.0.0.0/16"
│     │
│     outputs: vpc_id, subnet_ids, sg_id
│                    │
├── module "ec2" ◄───┘  (root passes vpc outputs as ec2 inputs)
│     source    = "../../modules/ec2"
│     subnet_id = module.vpc.subnet_public_a_id
│     sg_id     = module.vpc.sg_id
│     │
│     outputs: master_ip, worker_ips
│
└── module "rds" ◄───┘  (root passes vpc outputs as rds inputs)
      source     = "../../modules/rds"
      subnet_ids = [module.vpc.subnet_public_a_id, module.vpc.subnet_public_b_id]
      sg_id      = module.vpc.sg_id
```

The `vpc` module and the `ec2` module do not reference each other directly. The root `main.tf` wires them: it takes the output of one and passes it as the input of another. This keeps modules reusable and independently testable.

### Environment Isolation — Separate State Keys Per Environment

```
S3 bucket: mycompany-tfstate/
├── microshop/dev/terraform.tfstate     ← dev's diary
└── microshop/prod/terraform.tfstate    ← prod's diary (completely separate)
```

Running `terraform destroy` from `environments/dev/` destroys only what is in the dev state. Prod is untouched. This is the only production-safe pattern.

Also use non-overlapping CIDR blocks per environment so VPC peering and VPN connections remain possible:

```
Dev VPC:  10.0.0.0/16
Prod VPC: 10.1.0.0/16
          ↑ different second octet — no overlap
```

### Dev vs Prod — Key Differences

| Setting | Dev | Prod | Why Different |
|---|---|---|---|
| EC2 instance type | t3.micro | t3.medium | Free-tier vs real load |
| Worker node count | 0 (single-node) | 2 | HA and capacity |
| RDS instance class | db.t3.micro | db.t3.small | User volume |
| RDS Multi-AZ | false | true | AZ failure = 60s auto-failover |
| RDS backup retention | 0 days | 7 days | Point-in-time recovery |
| skip_final_snapshot | true | **false** | See Mistake 3 below |
| Storage encryption | false | true | GDPR / SOC 2 compliance |
| SSH access | your IP /32 | bastion CIDR only | Attack surface reduction |
| ECR tag mutability | MUTABLE | IMMUTABLE | No accidental overwrite in prod |

### Five Common Module/Environment Mistakes

**Mistake 1 — Same CIDR in dev and prod**

```
Dev:  10.0.0.0/16
Prod: 10.0.0.0/16  ← identical

Problem: VPC peering setup → routing conflict → connectivity fails
Fix: Plan your CIDR allocation before writing a single line of Terraform
```

**Mistake 2 — Hardcoded environment name**

```hcl
# Wrong
tags = { Name = "microshop-dev-vpc" }

# Correct
tags = { Name = "${var.project}-${var.env}-vpc" }
```

**Mistake 3 — skip_final_snapshot = true in prod**

This is the data-loss war story. When someone runs `terraform destroy` against production by mistake (wrong terminal window, wrong workspace), RDS deletes the database. If `skip_final_snapshot = true`, there is no automatic snapshot. The data is gone permanently. There is no undo.

Always set `skip_final_snapshot = false` in production. Verify that a snapshot exists before any `destroy` on RDS.

**Mistake 4 — One shared tfstate key for all environments**

```hcl
# Wrong — all envs write to the same file
key = "terraform.tfstate"

# Correct
# dev:  key = "microshop/dev/terraform.tfstate"
# prod: key = "microshop/prod/terraform.tfstate"
```

**Mistake 5 — Wrong output path when wiring modules**

```hcl
# Wrong — module doesn't expose an output named "subnet_id"
subnet_id = module.vpc.subnet_id

# Correct — match the exact name in the module's outputs.tf
subnet_id = module.vpc.subnet_public_a_id
```

Always check the module's `outputs.tf` before referencing its values in root.

---

## Real Production Example

The URL Shortener capstone ([12-capstone-url-shortener.md](12-capstone-url-shortener.md)) uses this Terraform structure. Here is the directory layout:

```
infra/
├── backend.tf       ← S3 + DynamoDB backend declaration
├── main.tf          ← VPC / subnets / IGW / route tables / SG / EC2 / RDS / ECR
├── variables.tf     ← db_password (sensitive = true), my_ip
└── outputs.tf       ← master_ip, worker_ips, rds_endpoint, ecr_url

# Modular version (production-grade):
infra/
├── modules/
│   ├── vpc/     (main.tf, variables.tf, outputs.tf)
│   ├── ec2/
│   ├── rds/
│   └── ecr/
└── environments/
    ├── dev/     (main.tf calls modules with dev values)
    └── prod/    (same modules, prod values, separate state key)
```

The `outputs.tf` block exposes `master_ip` and `worker_ips`. Ansible reads these to populate its inventory file, then configures Kubernetes on the nodes. This is the Terraform → Ansible handoff. See [03-M2-ansible.md](03-M2-ansible.md).

---

## Commands, Explained

```bash
# Download the AWS provider plugin and configure the S3 backend.
# Run once per project, or after adding a new provider.
terraform init

# Show what Terraform will create, change, or destroy.
# Reads: code + state + real AWS. Writes: nothing.
# + = create, ~ = modify in place, - = destroy, -/+ = destroy and recreate
terraform plan

# Apply the plan. Prompts for confirmation (type "yes").
# Passes -var for sensitive values not stored in code.
terraform plan -var="db_password=Secret123!"
terraform apply -var="db_password=Secret123!"

# Print the output values defined in outputs.tf.
# Use this to get IPs and endpoints after apply.
terraform output

# Show the current state as Terraform understands it.
# Use to debug drift or confirm what Terraform is tracking.
terraform show

# Re-attach an existing resource to Terraform state without destroying it.
# Use for lost-state recovery, one resource at a time.
terraform import aws_instance.web i-0abc1234def567890

# Destroy all resources in the current state. Prompts for "yes".
# Run from the right environment directory. Always confirm state is correct first.
terraform destroy

# Format all .tf files consistently. Run before every commit.
terraform fmt

# Check syntax and validate resource configurations. Run before plan.
terraform validate
```

---

## Beginner Mistakes vs Senior Insights

| Beginner Does | Senior Does | Why It Matters |
|---|---|---|
| Stores state on laptop | Remote S3 backend + DynamoDB lock from day one | First teammate = instant chaos without remote state |
| Commits `.tfstate` to Git | Adds `*.tfstate*` to `.gitignore` before first commit | State contains plaintext DB passwords |
| Runs `apply` without reading `plan` | Always reads plan output; no -auto-approve in prod | One typo can cascade to replacing a production database |
| Uses `provisioner "remote-exec"` for config | Hands off to Ansible via outputs | Provisioners are not idempotent; they hide failures from state |
| One flat `main.tf` for all environments | Modules + per-environment directories + separate state keys | Without isolation, `dev destroy` can take prod offline |
| Same CIDR in dev and prod | Plans CIDR allocation before writing any code | Overlap makes VPC peering impossible later |
| `skip_final_snapshot = true` everywhere | Only in dev; always `false` in prod | A mistaken `destroy` in prod is permanent data loss |
| Hardcodes AMI IDs | Uses `data "aws_ami"` to fetch latest dynamically, or pins with a comment | AMI IDs are region-specific; hardcode breaks cross-region deploys |
| Never runs `terraform fmt` | Formats before every commit; runs `validate` before every plan | Unformatted HCL fails peer review; invalid config wastes plan time |

---

## Memory Shortcuts

| Concept | Hook |
|---|---|
| IaC | Blueprint — anyone can build from it |
| tfstate | Diary 📔 — Terraform's memory of what it built |
| Declarative | "Kya chahiye" — destination, not directions |
| Idempotent | Light switch — 100 presses = still ON, not 100× brighter |
| `plan` | Bill dekhna 🧾 — preview before payment |
| `apply` | Payment 💳 — real change, real cost |
| Remote backend | Shared almari — team reads the same diary |
| Lock (DynamoDB) | Taala 🔒 — one writer at a time |
| Drift | Diary intact, duniya badal gayi — `apply` fixes it |
| Lost-state | Diary jal gayi ☠️ — `import` to rebuild |
| Orphaned resource | Bina maalik ki gaay 🐄 — running but unmanaged |
| Module | Car engine — inputs in, outputs out, internals hidden |
| user_data | One-time startup script — runs at first boot only |
| Provisioner | Last resort — not idempotent, use Ansible instead |

---

## Mutable vs Immutable Infrastructure

Terraform sits at the provisioning layer, which intersects both approaches:

**Mutable infrastructure:** You create a server with Terraform, then Ansible logs in and installs/updates software on the running machine. The machine accumulates changes over time. This is the pattern used in this bootcamp for the Kubernetes cluster.

**Immutable infrastructure:** You bake everything into a machine image at build time (using Packer to create an AMI — Amazon Machine Image, the EC2 equivalent of a Docker image). When you need a change, you build a new image and replace the old servers. Nothing is ever modified in place.

| | Mutable (Terraform + Ansible) | Immutable (Terraform + Packer) |
|---|---|---|
| Change method | `ansible-playbook` on running servers | Build new AMI → `terraform apply` replaces EC2 |
| Drift risk | High — servers diverge over time | Low — every server is identical to the image |
| Speed | Fast incremental updates | Slow to build image; fast to deploy |
| Complexity | Lower to start | Higher pipeline; right choice at scale |
| Bootcamp use | Phase 4 (Ansible + kubeadm) | Beyond this scope; Packer is the tool |

Containers (Docker + Kubernetes, covered in [04-M3-docker.md](04-M3-docker.md) and [05-M4-kubernetes-core.md](05-M4-kubernetes-core.md)) are the most common form of immutable infrastructure in practice.

---

## Summary

Terraform gives you three things that ClickOps cannot:

1. **A record** — everything is in `.tf` files that live in Git. The commit history is your infrastructure history.
2. **A preview** — `plan` shows you exactly what will change before anything changes. This is the seatbelt.
3. **A repeatable process** — the same code, applied twice, produces the same result. No snowflakes.

The state file is the critical dependency. Protect it: remote S3 backend, DynamoDB lock, encryption on, never in Git. Understand the difference between drift (state intact, reality changed — recoverable with `apply`) and lost-state (state gone — potentially catastrophic, recover with `import`).

Modules turn copy-paste into composition. Separate state keys per environment ensure that a `dev destroy` can never touch production.

Terraform hands off to Ansible via outputs. Terraform builds the server; Ansible configures what runs inside it.

---

## Self-Check Quiz

Pehle memory se jawab do, phir neeche kholo.

1. What is the difference between declarative and imperative configuration? Give a one-line example of each in the context of Terraform vs a bash script.

2. You run `terraform apply` five times against code that declares `count = 3`. How many EC2 instances exist after the fifth apply? Why?

3. Your state file is in S3. Two teammates run `apply` at exactly the same time. What prevents the state file from being corrupted?

4. A developer logs into the AWS console and manually opens port 443 on a security group. You then run `terraform plan`. What does it show, and what happens when you run `terraform apply`?

5. The S3 bucket containing your state file is accidentally deleted. You have five production EC2 instances running. You run `terraform apply`. How many EC2 instances exist afterwards, and why?

6. What is an orphaned resource, and what command do you run to bring it back under Terraform management?

7. Why does HashiCorp recommend against using `provisioner "remote-exec"` for server configuration? What should you use instead?

8. Your module `modules/vpc` exposes `subnet_public_a_id` in its `outputs.tf`. In `environments/dev/main.tf`, how do you reference that value when wiring it to the `ec2` module?

<details markdown="1"><summary>Jawab dekho</summary>

1. Declarative = desired end-state describe karo ("3 servers chahiye"); tool khud steps figure out karta. Imperative = har step manually likhna padta ("Step 1: VPC banao, Step 2: subnet..."). Terraform declarative — `resource "aws_instance" "web" { count = 3 }`; bash script imperative — `aws ec2 run-instances ...` ek ek kar ke.
2. 3 instances. Terraform SET operation karta (desired = 3), ADD nahi (actual += 3). Idempotency — 5 baar apply karo, sirf 3 servers.
3. DynamoDB table distributed lock ka kaam karta hai. `apply` start hote hi lock entry write hoti; doosra `apply` wait ya fail karta. Done hone ke baad lock release. State file concurrent writes se safe.
4. `terraform plan` shows `~ aws_security_group.web` with port 443 as drift — reality state se alag hai. `terraform apply` manually-added rule remove karta, reality ko code pe wapas laata hai.
5. 10 EC2 instances. State zero dikhata → Terraform 5 naye banata. Original 5 orphaned ho jaate — running hain, bill bana rahe hain, lekin state mein nahi. Fix: apply mat karo. Har existing instance ke liye `terraform import aws_instance.web_N i-0abc...` chala ke state rebuild karo.
6. Orphaned resource = cloud mein exist karta hai lekin state file mein entry nahi. Command: `terraform import aws_instance.web i-0abc1234def567890` — ek ek resource, ek ek baar.
7. Provisioners sirf creation pe ek baar chalte hain (re-apply pe nahi) — idempotent nahi. Unki failures state mein reflect nahi hoti. Terraform/Ansible boundary blur hoti. HashiCorp khud "last resort" kehta. Use Ansible — idempotent, drift handle karta, state check karta.
8. `subnet_id = module.vpc.subnet_public_a_id` — pattern: `module.<module_name>.<output_name>`. Module ka `outputs.tf` zaroor check karo pehle; wrong name pe plan fail hoga.
</details>

---

## Hands-On Lab

**Goal:** Apply the core Terraform workflow on a real (free-tier) resource.

**Cost:** A single `aws_s3_bucket` resource costs $0 (storage is charged per GB stored; an empty bucket is free). Always run `terraform destroy` at the end.

```bash
# 1. Install Terraform (if not already done)
#    https://developer.hashicorp.com/terraform/install
terraform version   # should show 1.x.x

# 2. Configure AWS credentials
aws configure      # enter access key, secret key, region (ap-south-1 recommended)
aws sts get-caller-identity   # verify — should return your account ID

# 3. Create a working directory
mkdir tf-lab && cd tf-lab

# 4. Write main.tf
cat > main.tf << 'EOF'
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" {
  region = "ap-south-1"
}

resource "aws_s3_bucket" "lab" {
  bucket = "tf-lab-yourname-2024"   # must be globally unique — add your name
  tags   = { Purpose = "terraform-lab" }
}

output "bucket_name" {
  value = aws_s3_bucket.lab.bucket
}
EOF

# 5. Run the lifecycle
terraform init      # downloads AWS provider
terraform validate  # checks syntax
terraform plan      # should show: Plan: 1 to add
terraform apply     # type "yes" when prompted

# 6. Verify
aws s3 ls | grep tf-lab
terraform output

# 7. Experiment with drift
#    Go to AWS console → S3 → add a tag to the bucket manually.
#    Then run:
terraform plan      # should show drift: the tag you added

# 8. Cleanup (important — always destroy lab resources)
terraform destroy   # type "yes"
aws s3 ls | grep tf-lab   # should be empty
```

**What you observed:**
- `init` downloaded the provider
- `plan` showed the future state without making changes
- `apply` created the bucket and updated state
- The manually added console tag appeared as drift in the next `plan`
- `destroy` removed everything and cleared state

**✅ Sahi hua to aisa dikhega:** Step 5 ke baad `terraform plan` shows `Plan: 0 to add, 0 to change, 0 to destroy` (bucket already exists). Step 7 (drift experiment) mein `terraform plan` shows `~ aws_s3_bucket.lab` with the manually-added console tag as a pending change. Final `terraform destroy` ke baad `aws s3 ls | grep tf-lab` kuch return nahi karta — bucket gone, state cleared.

---

## Interview Questions

**Q1: What is infrastructure drift, and how does Terraform detect and correct it?**

Drift occurs when someone modifies infrastructure outside of Terraform — typically via the cloud console or CLI. Terraform detects it during `terraform plan` by querying the real AWS APIs and comparing the result against the state file. Any mismatch appears as a change in the plan output. Running `terraform apply` brings reality back in line with the code. The key point: drift is only detectable because the state file is intact.

**Q2: Your state file is gone. You have 5 production servers running. You run `terraform apply`. How many servers exist afterwards, and how do you actually recover?**

After apply: 10 servers. Terraform sees no state, assumes zero resources exist, creates 5 new ones. The existing 5 are now orphans — unmanaged, still billing you, not in the new state.

Recovery: stop before applying. Run `terraform import aws_instance.web_0 i-0abc...` for each existing server, one at a time, to reconstruct the state file without touching the real resources. Then run `plan` to verify state matches reality before any `apply`.

**Q3: Why should the state file never be stored in Git?**

Terraform writes sensitive values — including database passwords, private keys, and secret tokens — to the state file in plaintext. Git history is permanent and often shared. Once a secret is committed, it is effectively leaked even after deletion (it remains in history). Use S3 with encryption and restricted IAM access.

**Q4: What is the difference between `user_data` and a Terraform provisioner?**

`user_data` (cloud-init) is a bootstrap script passed to the EC2 instance that runs once at first boot. It is handled entirely by the operating system at startup — Terraform just delivers the script. A `provisioner` is a Terraform-specific construct that runs commands (via SSH or locally) after a resource is created. Provisioners are not idempotent, their failures may not be reflected in state, and they blur the boundary between Terraform and Ansible. Use `user_data` for one-time boot tasks; use Ansible for anything repeatable and configurable.

**Q5: How do you manage multiple environments (dev, staging, prod) safely with Terraform?**

Use a module-per-component structure (`modules/vpc`, `modules/ec2`, `modules/rds`) with a separate environment directory per environment (`environments/dev`, `environments/prod`). Each environment directory has its own backend configuration pointing to a unique S3 key. This ensures that `terraform destroy` in dev cannot affect prod, that state files are completely isolated, and that the same module code is reused with different variable values per environment.

**Bonus scenario question:** A senior engineer says "our Terraform apply ran successfully but prod is down." What are three things you check first?

1. Check `terraform plan` output — did an apply trigger a resource replacement (`-/+`) that caused brief downtime?
2. Check if `skip_final_snapshot = false` and whether an RDS replacement dropped the database.
3. Check whether a security group change removed an inbound rule (e.g., port 80/443) that the load balancer needs.

---

## Production Challenge

Design and implement a three-environment Terraform module structure for a hypothetical e-commerce application with the following components: VPC, public and private subnets, NAT Gateway, EC2 instances for application servers, RDS PostgreSQL, and ECR.

Requirements:
- Each environment (dev, staging, prod) must have completely isolated state.
- Modules must be reusable — adding a fourth environment should require only a new `environments/qa/main.tf` with different variable values.
- CIDR blocks must not overlap across environments.
- Prod must have Multi-AZ RDS, encryption, 7-day backups, and `skip_final_snapshot = false`.
- Dev must work within AWS free-tier limits.
- All sensitive values (passwords, IPs) must be passed via variables — nothing hardcoded.

Deliverables: directory structure, module interfaces (`variables.tf` + `outputs.tf` for each module), and a `environments/prod/main.tf` showing the complete wiring. Show the backend configuration for each environment.

This challenge maps directly to what a DevOps engineer builds on day one at a Series B startup. If you can explain every decision here, you can answer any Terraform interview question.
