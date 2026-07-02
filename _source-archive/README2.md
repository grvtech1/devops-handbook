# 4-Tool DevOps Demo: Terraform + Docker + Kubernetes + Ansible

**Goal:** Ek API + Postgres deploy karo AWS pe, jisme har tool apni sahi layer pe ho.
**Concept prove hota hai:** stateless (API → K8s) vs stateful (Postgres → managed/VM), aur 4 tools ka clean separation.

---

## Architecture (har tool kaha)

```
┌─────────────────────────────────────────────────────────────┐
│  TERRAFORM  →  poora infra banata hai                         │
│  - VPC, subnets, security groups                              │
│  - EKS cluster (Kubernetes control plane)                     │
│  - RDS Postgres (managed stateful DB)                         │
│  - ECR (Docker image registry)                                │
└───────────────┬─────────────────────────────┬────────────────┘
                │                             │
   ┌────────────▼───────────┐    ┌────────────▼─────────────┐
   │  DOCKER                 │    │  ANSIBLE                  │
   │  - API ko image mein    │    │  - bastion/jump host ko   │
   │    pack karta hai       │    │    configure karta hai    │
   │  - ECR pe push          │    │  (DB migrations, monitoring│
   └────────────┬───────────┘    │   agent, kubectl setup)   │
                │                 └───────────────────────────┘
   ┌────────────▼───────────────────────────────┐
   │  KUBERNETES (EKS)                            │
   │  - API image ko pods mein chalata hai        │
   │  - 3 replicas (stateless → easily scale)     │
   │  - LoadBalancer se traffic                   │
   │  - RDS se connect (state bahar)              │
   └──────────────────────────────────────────────┘

STATELESS (API)  → Kubernetes mein, 3 replicas, disposable
STATEFUL (Postgres) → RDS managed, replace nahi hota, data persist
```

**Interview talking point:** "Maine deliberately Postgres ko K8s ke bahar RDS pe rakha — kyunki stateful systems ko container mein chalana data-loss risk hai. API stateless hai isliye K8s mein 3 replicas, koi bhi pod mar jaaye to data loss nahi."

---

## Step 0: Tools install (local machine)

```bash
# macOS (brew)
brew install terraform awscli kubectl docker ansible
aws configure   # access key + secret daalo
```

---

## Step 1: TERRAFORM — Infra provision

**Layer: "zameen + building banao"**

`main.tf` (simplified — full version neeche files mein):

```hcl
provider "aws" { region = "ap-south-1" }

# VPC
module "vpc" {
  source = "terraform-aws-modules/vpc/aws"
  name = "demo-vpc"
  cidr = "10.0.0.0/16"
  azs             = ["ap-south-1a", "ap-south-1b"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24"]
  enable_nat_gateway = true
}

# EKS cluster (Kubernetes ka control plane)
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  cluster_name    = "demo-eks"
  cluster_version = "1.30"
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets
  eks_managed_node_groups = {
    default = { instance_types = ["t3.medium"], min_size = 2, max_size = 3, desired_size = 2 }
  }
}

# RDS Postgres (STATEFUL — managed, K8s ke bahar)
resource "aws_db_instance" "postgres" {
  identifier        = "demo-postgres"
  engine            = "postgres"
  engine_version    = "16"
  instance_class    = "db.t3.micro"
  allocated_storage = 20
  db_name  = "appdb"
  username = "appuser"
  password = var.db_password   # secrets manager se better
  skip_final_snapshot = true
}

# ECR (Docker images yahan store honge)
resource "aws_ecr_repository" "api" { name = "demo-api" }
```

```bash
terraform init
terraform plan
terraform apply        # ~15 min (EKS slow hai)
```

---

## Step 2: DOCKER — App ko package karo

**Layer: "burger box pack karo"**

`app/main.py` (simple stateless FastAPI):

```python
from fastapi import FastAPI
import os, psycopg2

app = FastAPI()

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/users")
def users():
    # state DB mein hai, app mein nahi → STATELESS
    conn = psycopg2.connect(
        host=os.environ["DB_HOST"],
        dbname="appdb", user="appuser",
        password=os.environ["DB_PASSWORD"]
    )
    cur = conn.cursor()
    cur.execute("SELECT id, name FROM users;")
    rows = cur.fetchall()
    conn.close()
    return {"users": rows}
```

`Dockerfile`:

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Build + push to ECR:

```bash
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin <ACCOUNT>.dkr.ecr.ap-south-1.amazonaws.com
docker build -t demo-api ./app
docker tag demo-api:latest <ACCOUNT>.dkr.ecr.ap-south-1.amazonaws.com/demo-api:v1
docker push <ACCOUNT>.dkr.ecr.ap-south-1.amazonaws.com/demo-api:v1
```

---

## Step 3: KUBERNETES — App ko chalao at scale

**Layer: "1000 burgers manage karo"**

`k8s/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: demo-api
spec:
  replicas: 3                      # STATELESS → 3 identical copies
  selector:
    matchLabels: { app: demo-api }
  template:
    metadata:
      labels: { app: demo-api }
    spec:
      containers:
      - name: api
        image: <ACCOUNT>.dkr.ecr.ap-south-1.amazonaws.com/demo-api:v1
        ports: [{ containerPort: 8000 }]
        env:
        - name: DB_HOST
          value: "<RDS_ENDPOINT>"   # Terraform output se
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef: { name: db-secret, key: password }
---
apiVersion: v1
kind: Service
metadata:
  name: demo-api-svc
spec:
  type: LoadBalancer              # AWS ELB ban jayega
  selector: { app: demo-api }
  ports: [{ port: 80, targetPort: 8000 }]
```

Deploy:

```bash
aws eks update-kubeconfig --name demo-eks --region ap-south-1
kubectl create secret generic db-secret --from-literal=password=<DB_PASSWORD>
kubectl apply -f k8s/deployment.yaml
kubectl get pods            # 3 pods running dikhega
kubectl get svc             # LoadBalancer URL milega
```

**Scaling demo (interview gold):**
```bash
kubectl scale deployment demo-api --replicas=10   # seconds mein 10 pods
kubectl delete pod <pod-name>                     # K8s turant naya bana dega (self-healing)
```

---

## Step 4: ANSIBLE — Host configuration

**Layer: "kitchen set karo" (jo K8s/Docker handle nahi karta)**

⚠️ Honest note: Pure container setup mein Ansible ka role *kam* hota hai. Demo mein use-case: ek **bastion/jump host** ya DB migrations runner configure karna. Ye realistic hai aur Ansible ka sahi role dikhata hai (host config, not app packaging).

`ansible/configure-bastion.yml`:

```yaml
- name: Configure bastion host
  hosts: bastion
  become: yes
  tasks:
    - name: Install postgres client + kubectl
      apt:
        name: [postgresql-client, awscli]
        state: present
        update_cache: yes

    - name: Run DB migration (create users table)
      shell: |
        PGPASSWORD={{ db_password }} psql -h {{ rds_endpoint }} \
        -U appuser -d appdb -c \
        "CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name TEXT); \
         INSERT INTO users(name) VALUES ('alice'),('bob') ON CONFLICT DO NOTHING;"

    - name: Install monitoring agent
      apt: { name: prometheus-node-exporter, state: present }
```

```bash
ansible-playbook -i inventory.ini ansible/configure-bastion.yml
```

---

## Step 5: Test (sab kaam kar raha hai?)

```bash
LB=$(kubectl get svc demo-api-svc -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
curl http://$LB/health        # {"status":"ok"}
curl http://$LB/users         # {"users":[[1,"alice"],[2,"bob"]]}  ← data RDS se aaya
```

**Stateful prove karo:** ek pod delete karo → naya aata hai → `/users` abhi bhi same data deta hai. Kyun? **Data pods mein nahi, RDS mein hai.** Yahi stateless app ka point hai.

---

## Step 6: CLEANUP (ZAROORI — warna bill aayega)

```bash
kubectl delete -f k8s/deployment.yaml   # LoadBalancer (ELB) pehle hatao
terraform destroy                       # baaki sab
```

---

## Interview summary — ek slide mein

| Tool | Layer | Demo mein role | Stateful/Stateless |
|------|-------|----------------|-------------------|
| Terraform | Provisioning | VPC + EKS + RDS + ECR banaya | infra |
| Docker | Packaging | API ko image mein pack kiya | stateless app |
| Kubernetes | Orchestration | API 3 replicas, self-heal, scale | stateless |
| Ansible | Config mgmt | Bastion configure, DB migration | host |
| RDS (managed) | — | Postgres, data persist | **stateful** |

**Key insight to verbalize:** "Chaaron tools alternatives nahi, alag layers hain. Maine stateful (Postgres) ko deliberately K8s ke bahar rakha aur stateless API ko K8s mein — yahi modern cloud architecture ka core principle hai."
