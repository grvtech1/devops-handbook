# 🏗️ Terraform Modules — Deep Dive (Real-World Scenarios)

> MicroShop ke actual code se samjho. Flat `infra/main.tf` → modular `infra/modules/ + environments/`.
> Har concept: 🎓 Analogy + 🏭 Real-world scenario + ⚠️ Common mistake

---

## 🤔 Pehle: Flat structure mein kya problem thi?

MicroShop ka **purana** `infra/main.tf` dekho (line 1–152):
```
VPC + Subnets + IGW + Route Table
+ Security Group
+ SSH Key
+ EC2 master + workers
+ RDS subnet group + instance
+ ECR repos
= sab ek file mein, 152 lines
```

### Problem 1: Dev aur Prod alag banana mushkil
```
# Abhi ek hi main.tf → dev ke liye apply karo
# Prod ke liye? Nayi file banana padega — code copy karo
# Bug fix ek jagah? Dono jagah manually update karo
# = DRY violation (Don't Repeat Yourself)
```

### Problem 2: `terraform destroy` = sab uda diya
```
Ek flat tfstate → dev destroy karo → sab gone (including any prod-like resources)
```

### Problem 3: Testing impossible
```
Naya feature test karna hai — seedha prod pe? Risky.
Alag env chahiye — par code duplicate karna padega.
```

**Solution: Modules + Environments**

---

## 🧩 Module kya hai? (Black Box analogy)

```
🎓 Analogy: Car engine

Tumhe car chalana aata — tum engine kaise kaam karta ye detail nahi jaante.
Tumhe sirf pata hai: "accelerator dabaao → car chale."

Module = engine (black box)
  - Input:  accelerator position (variable: instance_type, region)  
  - Output: speed (output: master_ip, sg_id)
  - Andar: apna logic (pata nahi chahiye user ko)

Root main.tf = driver (sirf inputs deta, outputs use karta)
```

### Code mein:
```hcl
# modules/vpc/main.tf → "engine ka blueprint"
resource "aws_vpc" "main" {
  cidr_block = var.vpc_cidr   # input se aata
}
output "vpc_id" {             # output deta
  value = aws_vpc.main.id
}

# environments/dev/main.tf → "driver"
module "vpc" {
  source   = "../../modules/vpc"
  vpc_cidr = "10.0.0.0/16"   # input deta
}
# module.vpc.vpc_id se output use karta
```

---

## 🔗 Module Wiring — Outputs → Inputs

**Sabse important pattern:** Ek module ka output → doosra module ka input.

```
┌─────────────────────────────────────────────────┐
│              environments/dev/main.tf            │
│                                                  │
│  module "vpc" ──outputs──► vpc_id               │
│                             subnet_ids     ─────►│──► module "ec2"
│                             sg_id          ─────►│──► module "rds"
│                                                  │
└─────────────────────────────────────────────────┘
```

### Real code (dev/main.tf se):
```hcl
module "vpc" {
  source = "../../modules/vpc"
  # ... inputs
}

module "ec2" {
  source    = "../../modules/ec2"
  subnet_id = module.vpc.subnet_public_a_id   # ← vpc ka output, ec2 ka input
  sg_id     = module.vpc.sg_id               # ← vpc ka output, ec2 ka input
}

module "rds" {
  source     = "../../modules/rds"
  subnet_ids = [module.vpc.subnet_public_a_id, module.vpc.subnet_public_b_id]
  sg_id      = module.vpc.sg_id
}
```

**Modules direct baat nahi karte — root mein wire hote hain.**

---

## 🌍 Environment Isolation — Sabse Bada Fayda

```
🎓 Analogy: Alag kitchens

Dev kitchen   → experiments, kuch jale to theek (koi customer nahi)
Prod kitchen  → real customers, quality check, backup chef

Ek kitchen mein experiment = prod customers affect.
Alag kitchens = experiments safe.
```

### State file isolation:
```
S3 bucket: microshop-tfstate/
├── microshop/dev/terraform.tfstate    ← dev ka diary
└── microshop/prod/terraform.tfstate   ← prod ka diary (ALAG)

terraform destroy (dev folder se) → sirf dev ka state affect
                                   → prod untouched ✅
```

### CIDR isolation (VPC peering ready):
```
Dev VPC:  10.0.0.0/16  ─────┐
Prod VPC: 10.1.0.0/16  ─────┴─── Overlap nahi (VPN/peering ke liye ready)
```

**Real-world scenario:** Startups often start with 1 env → scaling ke baad realize karte hain "prod aur dev ek hi DB pe" → disaster. Module + env split se pehle se sahi design.

---

## 📊 Dev vs Prod — Actual Differences (MicroShop)

| Setting | Dev | Prod | Kyun alag |
|---------|-----|------|-----------|
| EC2 type | t3.micro | t3.medium | Free-tier vs K8s requirements |
| Workers | 0 | 2 | k3s single vs kubeadm multi |
| Disk | 20GB | 50GB | Logs accumulate in prod |
| RDS type | db.t3.micro | db.t3.small | User load |
| RDS Multi-AZ | false | true | AZ failure → 60s failover |
| Backup days | 0 | 7 | Point-in-time recovery |
| Final snapshot | skip | keep | Data safety net |
| Encryption | false | true | Compliance (GDPR/SOC2) |
| SSH allowed | my_ip/32 | bastion CIDR | Security posture |
| ECR tag | MUTABLE | IMMUTABLE | Prod: no accidental overwrite |
| ECR scan | false | true | CVE detection |

---

## ⚠️ Common Mistakes (Real-world incidents)

### Mistake 1: Same CIDR in dev + prod
```
Dev:  10.0.0.0/16
Prod: 10.0.0.0/16   ← SAME!

Problem: VPC peering/VPN setup karo → overlap → routing conflict → connectivity fail
Fix: Har env ka alag /16 block plan karo PEHLE se
```

### Mistake 2: Hardcode environment name
```hcl
# WRONG
resource "aws_vpc" "main" {
  tags = { Name = "microshop-dev-vpc" }   # "dev" hardcode
}

# CORRECT
resource "aws_vpc" "main" {
  tags = { Name = "${var.project}-${var.env}-vpc" }  # variable se
}
```

### Mistake 3: `skip_final_snapshot = true` in prod
```
terraform destroy (prod pe galti se) → RDS gone → data gone → 💀
Fix: prod mein ALWAYS skip_final_snapshot = false
     Destroy se pehle: `aws rds describe-db-snapshots` verify karo
```

### Mistake 4: Same tfstate for all envs
```
# WRONG — ek hi key
backend "s3" {
  key = "terraform.tfstate"  # sab envs ek hi file
}

# CORRECT
# dev:  key = "microshop/dev/terraform.tfstate"
# prod: key = "microshop/prod/terraform.tfstate"
```

### Mistake 5: Module output ke liye wrong path
```hcl
# WRONG
subnet_id = module.vpc.subnet_id   # ← module mein "subnet_id" output nahi

# CORRECT (outputs.tf mein jo likha)
subnet_id = module.vpc.subnet_public_a_id
```

---

## 🗂️ Final Directory Structure (MicroShop)

```
microshop/infra/
│
├── main.tf          ← PURANA flat file (reference, delete mat karo abhi)
├── variables.tf     ← purana
├── outputs.tf       ← purana
│
├── modules/         ← NAYA: reusable blueprints
│   ├── vpc/
│   │   ├── main.tf       (VPC + subnets + IGW + routes + SG)
│   │   ├── variables.tf  (inputs: project, env, cidr...)
│   │   └── outputs.tf    (vpc_id, subnet_ids, sg_id)
│   ├── ec2/
│   │   ├── main.tf       (AMI + key + master + workers)
│   │   ├── variables.tf
│   │   └── outputs.tf    (master_ip, private_ip, worker_ips)
│   ├── rds/
│   │   ├── main.tf       (subnet group + RDS instance)
│   │   ├── variables.tf  (instance_class, multi_az, backup...)
│   │   └── outputs.tf    (endpoint, address)
│   └── ecr/
│       ├── main.tf       (repos + lifecycle policy)
│       ├── variables.tf
│       └── outputs.tf    (repository_urls)
│
└── environments/    ← NAYA: env-specific configs (module calls)
    ├── dev/
    │   ├── main.tf               (module calls, dev values)
    │   ├── variables.tf
    │   ├── outputs.tf
    │   └── terraform.tfvars.example
    └── prod/
        ├── main.tf               (same modules, prod values)
        ├── variables.tf
        └── outputs.tf
```

---

## 🚀 Kaise Use Karo (Commands)

```bash
# Dev deploy
cd infra/environments/dev
cp terraform.tfvars.example terraform.tfvars
# terraform.tfvars mein apni values bharo (my_ip, db_password)
terraform init
terraform plan
terraform apply

# Prod deploy (alag terminal, alag state)
cd infra/environments/prod
terraform init   # alag backend init karega
terraform plan
terraform apply

# Dev destroy (prod ko touch nahi karega)
cd infra/environments/dev
terraform destroy   # sirf dev/terraform.tfstate affect
```

---

## 🎤 Interview Q&A

**Q: "Terraform mein multiple environments kaise manage karte?"**
→ **Modules + environment directories.** Reusable modules likhte hain (vpc, ec2, rds), phir har env ka apna folder hota jahan module ko alag values se call karte. Har env ka apna isolated tfstate S3 mein hota — destroy in one env, other env safe.

**Q: "Module aur flat config mein kya fark?"**
→ Module = reusable black box (input → output). Flat = sab ek file mein, DRY violation, env isolation mushkil. Module se same infrastructure code dev+prod dono mein use, sirf values alag.

**Q: "State file ko separate kyun rakhte env-wise?"**
→ Isolation. Ek env ka `terraform destroy` doosre ko affect na kare. Audit trail bhi alag — "prod pe kab kya badla" clearly dikhta.

**Q: "Module ke outputs kaise use karte doosre module mein?"**
→ Root `main.tf` mein wire karte: `module.vpc.sg_id` ko `module.ec2` ke `sg_id` variable mein pass karte. Modules direct baat nahi karte — root orchestrate karta hai.

---

> **Ye structure = production-grade Terraform.** Real companies mein aisa hi hota — module registry (Terraform Registry ya internal), multiple envs, isolated states. MicroShop mein ye build karna = interview mein "real project experience" bol sakte ho confidently. 🚀
