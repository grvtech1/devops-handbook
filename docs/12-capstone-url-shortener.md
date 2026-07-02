# Capstone I — URL Shortener

> **Core question:** *Can I build the entire stack end-to-end, from an empty AWS account to a live short URL — using every tool in the right layer, with no manual clicks in production?*

> **⏱️ Time:** ~4–6 ghante hands-on (multi-day) · **🎚️ Level:** Intermediate→Advanced · **📋 Pehle chahiye:** [M0](01-M0-foundations.md) se [M9](11-M9-advanced-k8s-internals.md) tak
>
> **Is module ke baad tum kar paoge:**
> - Ek poora URL Shortener stack deploy karo — Terraform se EC2/RDS, Ansible se K8s cluster, GitHub Actions se CI, Argo CD se GitOps
> - `git push` se production tak ka pipeline end-to-end run karo bina kisi manual click ke
> - Infra cost track karo aur daily `terraform destroy` discipline follow karo

**Module map:** `00-INDEX` · `01-M0` · `02-M1` · `03-M2` · `04-M3` · `05-M4` · `06-M5` · `07-M6` · `08-M7` · `09-connected-system` · `10-M8` · `11-M9` · **`12-capstone-url-shortener` ← you are here** · `13-capstone-microshop` · `14-interview-bank` · `15-roadmap` · `16-appendix`

---

> ### ↩️ Recall gate — shuru karne se pehle
> Pichhle modules se 3 sawaal. **Pehle memory se jawab do, phir kholo.** (Yeh retrieve karna hi lifetime yaad rakhta hai — dobara padhna nahi.)
>
> 1. *(M1)* Terraform mein remote state (S3 + DynamoDB lock) kyun zaroori hai — team mein sabke laptop pe alag `.tfstate` rakhne ka kya nuksaan hai?
> 2. *(M6)* CI pipeline mein image tag `github.sha` use karte hain na ki `latest` — iska ek practical fayda batao jo directly rollback se related ho?
> 3. *(M4)* Kubernetes mein readiness probe fail hone pe pod ko kya hota hai — pod restart hota hai ya kuch aur?
>
> <details markdown="1"><summary>Jawab</summary>
>
> 1. Alag laptops pe tfstate = no lock; do log simultaneously `apply` karein to infra corrupt ya duplicate resources ban sakte. S3 = shared truth; DynamoDB lock = ek waqt pe sirf ek apply possible. &nbsp; 2. SHA immutable — har image unique aur traceable. `git revert` se purana SHA wapas manifest mein aata, Argo wahi image deploy karta. `latest` mutable hai — rollback ambiguous. &nbsp; 3. Pod EndpointSlice se remove hota hai (traffic band) — pod alive rehta, restart NAHI hota. Readiness fail = "main ready nahi hun"; liveness fail pe restart hota.
> </details>

## The 60-second version

You will build a URL shortener (a mini bit.ly) on AWS. The app is a stateless FastAPI that shortens URLs and stores them in Postgres. Postgres lives in RDS — outside the cluster — because state must survive pod deaths. The cluster is three EC2 instances running self-managed Kubernetes (kubeadm + Calico). Terraform provisions the infrastructure. Ansible bootstraps the cluster. Every code push triggers GitHub Actions (CI): test → build image → push to ECR → update the manifest with the new image SHA. Argo CD (GitOps) watches the manifest, detects drift, and rolls the new version in automatically.

Net result: `git push` → live at `http://<worker-ip>:30080` with no further human action.

**What this proves:** you understand IaC, config management, containers, Kubernetes, CI, and GitOps — not as isolated tools but as one connected system. See `09-connected-system.md` for the full theory.

---

## The app & why it proves the whole stack

```
POST /shorten  {"url": "https://very-long-url.com/..."}  →  {"short": "abc123"}
GET  /abc123                                              →  HTTP 302 redirect
GET  /health                                              →  {"status": "ok"}
```

The app is deliberately minimal so that infrastructure complexity — not application complexity — is the lesson. Three endpoints cover everything Kubernetes cares about: write (shorten), read (redirect), and health (probe).

**Why this app teaches the hardest concept in DevOps:**

The API is **stateless** — it holds no data between requests. Kill a pod and bring it back: it behaves identically because all state lives in the database. This is not an accident of design; it is the *required* shape for Kubernetes workloads. The DB is in **RDS** (outside the cluster) because running stateful systems inside pods introduces data-loss risk. Every `kubectl delete pod` you run during this project is a live proof of that principle.

🇮🇳 **Hinglish intuition:** App = delivery boy. Har delivery boy identical hai — ek maar do, naya bhejo, kaam nahi rukta. Data (parcels) hamesha warehouse (RDS) mein hai, delivery boy ke paas nahi.

**Skills this project validates:**

| Phase | Skill | M-module |
|-------|-------|----------|
| Git + code | Version control, branching | M0 |
| Docker + ECR | Containerization, layer caching, registries | M3 |
| Terraform | IaC, remote state, locking | M1 |
| Ansible | Agentless config, cluster bootstrap | M2 |
| Kubernetes | Probes, rolling updates, self-heal, scale | M4, M5 |
| GitHub Actions | CI pipeline, secrets, SHA tagging | M6 |
| Argo CD | GitOps, selfHeal, pull model | M7 |
| Security + polish | Least privilege, resource limits, tests | M8 |

---

## Full system architecture

```
                          INTERNET (users)
                                │
                                ▼
              ┌─────────────────────────────────────────┐
              │           AWS  (ap-south-1)              │
              │  ┌───────────────────────────────────┐   │
              │  │  VPC  10.0.0.0/16                 │   │
              │  │                                   │   │
              │  │  ┌─ Public Subnet 10.0.1.0/24 ─┐  │   │
              │  │  │                              │  │   │
              │  │  │  EC2 master  (t3.medium)     │  │   │
              │  │  │    control-plane (tainted)   │  │   │
              │  │  │  EC2 worker-0 (t3.medium)    │  │   │
              │  │  │  EC2 worker-1 (t3.medium)    │  │   │
              │  │  │    pods here · Calico CNI    │  │   │
              │  │  │    NodePort :30080           │  │   │
              │  │  └──────────────┬───────────────┘  │   │
              │  │                 │ :5432 (private)   │   │
              │  │  ┌─ Subnet-A + Subnet-B (2 AZ) ─┐  │   │
              │  │  │  RDS Postgres (db.t3.micro)   │  │   │
              │  │  │  STATEFUL · publicly_          │  │   │
              │  │  │           accessible=false    │  │   │
              │  │  └───────────────────────────────┘  │   │
              │  └───────────────────────────────────┘   │
              │                                           │
              │  ECR (private Docker registry)            │
              │  S3 (tfstate bucket) + DynamoDB (lock)    │
              └─────────────────────────────────────────┘
```

**Port map — who talks to whom:**

```
User ──HTTP──► Worker EC2 :30080 (NodePort) ──► Service ──► Pod :8000 (FastAPI)
                                                              │
                                                 Pod ─:5432─► RDS (private subnet)

Admin ──SSH :22──► master EC2   (YOUR_IP/32 only)
Worker ──:6443──►  master        (k8s API, intra-VPC)
Pods   ──Calico──► Pods          (cross-node overlay, :10250 kubelet)
```

**Component table:**

| Component | What | Module |
|-----------|------|--------|
| VPC 10.0.0.0/16 | Network isolation, 2 AZ for RDS requirement | M1 |
| EC2 ×3 t3.medium | 1 control-plane + 2 workers (self-managed K8s) | M1, M4 |
| RDS db.t3.micro | Managed Postgres, private, backed-up | M0, M5 |
| ECR | Private Docker registry, IAM-authenticated pull | M3 |
| S3 + DynamoDB | Remote tfstate + state lock (team-safe) | M1 |
| Security Group | Firewall — only necessary ports, SSH from YOUR_IP/32 | M8 |
| NodePort :30080 | Self-managed K8s entry point (EKS would use LoadBalancer) | M4 |
| Calico CNI | Pod-to-pod networking across nodes | M9/`11-M9-advanced-k8s-internals.md` |

> For deep internals on CNI, etcd, and control-plane components, see `11-M9-advanced-k8s-internals.md`. This chapter focuses on building and wiring, not internals.

---

## The two workflows

This project lives in the two loops described in `09-connected-system.md`: a one-time **setup loop** and a recurring **delivery loop**.

### Setup loop (Terraform + Ansible — once per environment)

```
YOU: terraform apply
   └─► S3 backend + DynamoDB lock ──►  VPC ──► subnets ──► IGW ──► route
       ──► SG ──► EC2 ×3 ──► RDS ──► ECR
       outputs: master_ip · worker_ips · rds_endpoint · ecr_url
                │
                ▼ (~5 min)
YOU: ansible-playbook
   ├─ 1-common.yml  → ALL nodes: containerd + kubeadm + kubelet (apt-mark hold)
   ├─ 2-master.yml  → master:  kubeadm init + kubeconfig + Calico + join-cmd
   └─ 3-workers.yml → workers: kubeadm join
                │
                ▼
   K8s CLUSTER READY (3 nodes)  ──►  kubectl apply argocd install
```

> This loop runs once (or after `terraform destroy`). It is "Pets" work — careful, deliberate, ordered. See `03-M2-ansible.md` for Ansible concepts.

### Delivery loop (CI/CD + GitOps — every code push)

```
YOU: git push main (only manual step)
        │
        ▼
GITHUB ACTIONS (push model — M6)
   ├─ pytest (test gate — fail here, not in prod)
   ├─ docker build -t $ECR:$GIT_SHA ./app    (layer cache)
   ├─ docker push $ECR:$GIT_SHA              (immutable SHA tag)
   └─ sed deployment.yaml → image:$SHA
      git commit "ci: update image [skip ci]" + git push
        │
        ▼ (manifest now has new SHA in Git)
ARGO CD (pull model — M7, watching every 3 min)
   ├─ reads Git: desired = new SHA
   ├─ reads cluster: actual = old SHA  →  OutOfSync
   ├─ kubectl apply → new ReplicaSet, rolling update (M4)
   └─ selfHeal: any manual kubectl change → Git state restored
        │
        ▼
KUBERNETES (M4)
   Deployment → 2 pods running new SHA
   readinessProbe (/health) → only healthy pods get traffic
   Service (NodePort) → load-balances across pods
        │
        ▼
NEW VERSION LIVE — you only pushed code
```

🇮🇳 **Hinglish intuition:** Setup loop = plot + concrete dalo (ek baar). Delivery loop = beej daalo → khud ugta hai (har push pe).

---

## Repo structure

```
url-shortener/
├── app/
│   ├── main.py              # FastAPI — /shorten, /{code}, /health
│   ├── requirements.txt     # fastapi, uvicorn, psycopg2-binary
│   ├── Dockerfile           # deps ABOVE code (layer cache — M3)
│   └── test_main.py         # pytest gate (CI — M6)
├── infra/                   # Terraform (M1)
│   ├── main.tf              # VPC, EC2, RDS, ECR resources
│   ├── variables.tf         # db_password (sensitive)
│   ├── outputs.tf           # master_ip, worker_ips, rds_endpoint, ecr_url
│   └── backend.tf           # S3 state + DynamoDB lock
├── ansible/                 # Config management (M2)
│   ├── inventory.ini        # IPs from terraform output
│   ├── 1-common.yml         # containerd + kubeadm on all nodes
│   ├── 2-master.yml         # kubeadm init + Calico + join-cmd
│   └── 3-workers.yml        # kubeadm join
├── k8s/                     # Kubernetes manifests (M4)
│   ├── deployment.yaml      # replicas:2, probes, resources, secretRef
│   ├── service.yaml         # NodePort :30080
│   └── secret.yaml          # DB password (base64 — NOT encrypted at rest by default)
├── argocd/
│   └── application.yaml     # selfHeal:true, prune:true (M7)
├── .github/workflows/
│   └── ci.yml               # test → build → push → manifest-update (M6)
└── .gitignore               # .env  *.tfstate*  .terraform/  __pycache__
```

> Rule: every directory maps to one tool and one module. The `infra/` directory Terraform owns; `ansible/` Ansible owns; `k8s/` Argo CD owns. No overlaps.

---

## The 8-phase build order (with deliberate breaks)

The pedagogy here is **break-it-on-purpose**. Every phase ends with a deliberate sabotage exercise. Watching the right error message appear — and knowing what it means — is as valuable as watching the green path succeed.

| Phase | What you build | Module | Deliberate break — do this on purpose |
|-------|---------------|--------|----------------------------------------|
| **P1** | Git repo, `.gitignore`, app code, local test | M0/M6 | Commit a fake secret (`password=Secret123`) → observe it in `git log` → rotate it → add pre-commit hook |
| **P2** | Dockerfile, layer order, ECR push | M3 | Put `COPY . .` BEFORE `pip install` → rebuild → measure time penalty; then fix order |
| **P3** | Terraform VPC/EC2/RDS/ECR, S3 backend | M1 | Run two terminals: `terraform apply` simultaneously → DynamoDB lock error; also try wrong AZ for RDS subnet group |
| **P4** | Ansible: containerd + kubeadm + Calico + join | M2 | Leave swap ON (comment out `swapoff -a`) → `kubeadm init` fails with swap error; also try SSH with wrong key |
| **P5** | Manual K8s deploy: probes, NodePort, self-heal | M4 | Set wrong label in Service `selector` (`app: wrong-name`) → 0 endpoints → curl hangs; `kubectl delete pod` → watch self-heal |
| **P6** | GitHub Actions: test gate, SHA tag, manifest update | M6 | Hardcode `image: latest` → deploy → ask "which version is running?"; remove `paths:['app/**']` → manifest update triggers CI again → loop |
| **P7** | Argo CD: Application, selfHeal, rollback | M7 | Run `kubectl scale deployment url-shortener --replicas=5` → watch Argo revert to Git's `replicas:2` within 30 s |
| **P8** | Resource limits, tests in CI, branch protection | M8 | Set `limits.memory: 10Mi` → pod OOMKilled instantly; remove `readinessProbe` → pod gets traffic before it is ready |

> Each break is intentional training, not a mistake. The goal is to see the failure mode, read the error, and fix it. This is how production incidents become familiar rather than frightening.

---

## The code, phase by phase

### P1 + P3: The app — `app/main.py`

```python
from fastapi import FastAPI, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
import os, psycopg2, string, random

app = FastAPI()

# ── DB connection ──────────────────────────────────────────────────────
# All config from environment — no hardcoded values (M8 security rule)
def db():
    return psycopg2.connect(
        host=os.environ["DB_HOST"],          # injected by K8s env field
        dbname=os.environ.get("DB_NAME", "appdb"),
        user=os.environ.get("DB_USER", "appuser"),
        password=os.environ["DB_PASSWORD"],  # from K8s Secret → secretKeyRef
    )

def code(n=6):
    # 6-char alphanumeric → 62^6 = ~56 billion combinations, good enough
    return "".join(random.choices(string.ascii_letters + string.digits, k=n))

class UrlIn(BaseModel):
    url: str

# ── Startup: create table if not exists (idempotent) ──────────────────
@app.on_event("startup")
def init_db():
    conn = db(); cur = conn.cursor()
    cur.execute(
        "CREATE TABLE IF NOT EXISTS urls (code TEXT PRIMARY KEY, url TEXT NOT NULL)"
    )
    conn.commit(); conn.close()

# ── /health — K8s readiness + liveness probe target ───────────────────
@app.get("/health")
def health():
    return {"status": "ok"}   # intentionally simple; no DB check here

# ── POST /shorten ──────────────────────────────────────────────────────
@app.post("/shorten")
def shorten(body: UrlIn):
    c = code()
    conn = db(); cur = conn.cursor()
    cur.execute("INSERT INTO urls (code, url) VALUES (%s, %s)", (c, body.url))
    conn.commit(); conn.close()
    return {"short": c}

# ── GET /{code} → redirect ─────────────────────────────────────────────
@app.get("/{c}")
def go(c: str):
    conn = db(); cur = conn.cursor()
    cur.execute("SELECT url FROM urls WHERE code = %s", (c,))
    row = cur.fetchone(); conn.close()
    if not row:
        raise HTTPException(404, "Not found")
    return RedirectResponse(row[0])   # 302 by default
```

`app/requirements.txt`:
```
fastapi==0.111.0
uvicorn==0.30.0
psycopg2-binary==2.9.9
```

### P2: Dockerfile

```dockerfile
FROM python:3.12-slim
# slim = smaller attack surface, faster pull. Never use :latest for base images.

WORKDIR /app

# Dependencies FIRST — so Docker layer cache reuses this layer when only
# app code changes. Reversing this order rebuilds pip on every code change.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code SECOND
COPY . .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
# 0.0.0.0 = listen on all interfaces; localhost only would block container traffic
```

Local test before touching AWS:
```bash
docker run -d --name pg -e POSTGRES_PASSWORD=test \
  -e POSTGRES_USER=appuser -e POSTGRES_DB=appdb -p 5432:5432 postgres:16

docker build -t url-shortener:dev ./app
docker run -p 8000:8000 \
  -e DB_HOST=host.docker.internal -e DB_PASSWORD=test \
  url-shortener:dev

curl -X POST localhost:8000/shorten \
  -H "Content-Type: application/json" -d '{"url":"https://github.com"}'
# {"short":"a1B2c3"}
```

### P3: Terraform — key excerpts

`infra/backend.tf` — create S3 bucket and DynamoDB table manually first, then reference here:
```hcl
terraform {
  backend "s3" {
    bucket         = "<your-name>-tfstate-urlshortener"  # create once: aws s3 mb s3://...
    key            = "infra/terraform.tfstate"
    region         = "ap-south-1"
    dynamodb_table = "tf-lock"   # state lock: prevents two simultaneous applies
  }
}
```

`infra/main.tf` — core resources (abbreviated; full version in repo):
```hcl
provider "aws" { region = "ap-south-1" }

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  tags = { Name = "urlshort-vpc" }
}

# Two subnets in two AZs — RDS requires a subnet group spanning ≥2 AZs
resource "aws_subnet" "public"  { cidr_block = "10.0.1.0/24"; availability_zone = "ap-south-1a"; map_public_ip_on_launch = true; vpc_id = aws_vpc.main.id }
resource "aws_subnet" "public2" { cidr_block = "10.0.2.0/24"; availability_zone = "ap-south-1b"; vpc_id = aws_vpc.main.id }

resource "aws_security_group" "k8s" {
  name   = "urlshort-sg"; vpc_id = aws_vpc.main.id
  # SSH only from YOUR IP — not 0.0.0.0/0
  ingress { from_port = 22;    to_port = 22;    protocol = "tcp"; cidr_blocks = ["YOUR_IP/32"] }
  # K8s API server — internal VPC only
  ingress { from_port = 6443;  to_port = 6443;  protocol = "tcp"; cidr_blocks = ["10.0.0.0/16"] }
  # Node-to-node (kubelet :10250, Calico VXLAN :4789, pod CIDR)
  ingress { from_port = 0; to_port = 0; protocol = "-1"; self = true }
  # NodePort range — public (users hit :30080)
  ingress { from_port = 30000; to_port = 32767; protocol = "tcp"; cidr_blocks = ["0.0.0.0/0"] }
  # RDS :5432 from cluster nodes only (self = same SG)
  ingress { from_port = 5432;  to_port = 5432;  protocol = "tcp"; self = true }
  egress  { from_port = 0; to_port = 0; protocol = "-1"; cidr_blocks = ["0.0.0.0/0"] }
}

resource "aws_instance" "master" {
  ami = "ami-0f5ee92e2d63afc18"  # Ubuntu 22.04 ap-south-1 — verify current AMI
  instance_type = "t3.medium"    # kubeadm needs 2 vCPU minimum; t3.micro = OOM
  subnet_id = aws_subnet.public.id; key_name = aws_key_pair.k.key_name
  vpc_security_group_ids = [aws_security_group.k8s.id]
  tags = { Name = "k8s-master" }
}
resource "aws_instance" "worker" {
  count         = 2
  ami           = "ami-0f5ee92e2d63afc18"
  instance_type = "t3.medium"
  subnet_id     = aws_subnet.public.id; key_name = aws_key_pair.k.key_name
  vpc_security_group_ids = [aws_security_group.k8s.id]
  tags = { Name = "k8s-worker-${count.index}" }
}

resource "aws_db_subnet_group" "db" {
  name       = "urlshort-db"
  subnet_ids = [aws_subnet.public.id, aws_subnet.public2.id]  # 2 AZ required
}
resource "aws_db_instance" "pg" {
  identifier          = "urlshort-pg"
  engine              = "postgres"; engine_version = "16"
  instance_class      = "db.t3.micro"; allocated_storage = 20
  db_name             = "appdb"; username = "appuser"
  password            = var.db_password  # passed via -var flag, not hardcoded
  db_subnet_group_name   = aws_db_subnet_group.db.name
  vpc_security_group_ids = [aws_security_group.k8s.id]
  skip_final_snapshot    = true
  publicly_accessible    = false  # CRITICAL: RDS not reachable from internet
}

resource "aws_ecr_repository" "api" { name = "url-shortener" }
```

Apply sequence:
```bash
ssh-keygen -t rsa -f ~/.ssh/urlshort          # SSH key for EC2 access
aws s3 mb s3://<name>-tfstate-urlshortener --region ap-south-1
aws dynamodb create-table --table-name tf-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST --region ap-south-1

cd infra
terraform init                                 # download providers, connect backend
terraform plan  -var="db_password=Secret123!" # review BEFORE destroying anything
terraform apply -var="db_password=Secret123!" # ~5 min
terraform output                              # copy master_ip, worker_ips, rds_endpoint
```

### P4: Ansible — cluster bootstrap

`ansible/inventory.ini` (fill IPs from `terraform output`):
```ini
[master]
master ansible_host=<MASTER_IP>
[workers]
w0 ansible_host=<WORKER0_IP>
w1 ansible_host=<WORKER1_IP>
[all:vars]
ansible_user=ubuntu
ansible_ssh_private_key_file=~/.ssh/urlshort
ansible_ssh_common_args='-o StrictHostKeyChecking=no'
```

`ansible/1-common.yml` — runs on every node:
```yaml
- hosts: all
  become: yes
  tasks:
    # K8s requires swap=off; if left on, kubeadm init fails immediately
    - shell: swapoff -a

    # Overlay = container filesystem layers; br_netfilter = bridge traffic → iptables
    - shell: modprobe overlay && modprobe br_netfilter

    - copy:
        dest: /etc/sysctl.d/k8s.conf
        content: |
          net.bridge.bridge-nf-call-iptables = 1
          net.ipv4.ip_forward = 1
      notify: reload sysctl

    - apt: { name: containerd, state: present, update_cache: yes }

    # SystemdCgroup=true required: containerd and K8s must use the same cgroup driver
    - shell: |
        mkdir -p /etc/containerd
        containerd config default > /etc/containerd/config.toml
        sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml
      notify: restart containerd

    - shell: |
        mkdir -p /etc/apt/keyrings
        curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.30/deb/Release.key \
          | gpg --dearmor -o /etc/apt/keyrings/k8s.gpg
        echo "deb [signed-by=/etc/apt/keyrings/k8s.gpg] \
          https://pkgs.k8s.io/core:/stable:/v1.30/deb/ /" \
          > /etc/apt/sources.list.d/k8s.list

    - apt: { name: [kubelet, kubeadm, kubectl], state: present, update_cache: yes }

    # apt-mark hold = prevent unintended version upgrades (version skew breaks clusters)
    - shell: apt-mark hold kubelet kubeadm kubectl

  handlers:
    - name: reload sysctl
      shell: sysctl --system
    - name: restart containerd
      service: { name: containerd, state: restarted }
```

`ansible/2-master.yml`:
```yaml
- hosts: master
  become: yes
  tasks:
    # creates: guard = idempotent — won't re-init if admin.conf already exists
    - shell: kubeadm init --pod-network-cidr=192.168.0.0/16
      args: { creates: /etc/kubernetes/admin.conf }

    - shell: |
        mkdir -p /home/ubuntu/.kube
        cp /etc/kubernetes/admin.conf /home/ubuntu/.kube/config
        chown ubuntu:ubuntu /home/ubuntu/.kube/config

    # Calico CNI = pod-to-pod networking across nodes; without this, pods stuck Pending
    - become_user: ubuntu
      shell: kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.27.0/manifests/calico.yaml

    - shell: kubeadm token create --print-join-command
      register: j

    # Save join command locally so workers playbook can use it
    - local_action: copy content="{{ j.stdout }}" dest=./join.sh
      become: no
```

`ansible/3-workers.yml`:
```yaml
- hosts: workers
  become: yes
  tasks:
    - copy: { src: ./join.sh, dest: /tmp/join.sh }
    # creates: guard = idempotent — won't rejoin if kubelet.conf already present
    - shell: bash /tmp/join.sh
      args: { creates: /etc/kubernetes/kubelet.conf }
```

Run sequence:
```bash
cd ansible
ansible all -i inventory.ini -m ping               # connectivity check first
ansible-playbook -i inventory.ini 1-common.yml
ansible-playbook -i inventory.ini 2-master.yml
ansible-playbook -i inventory.ini 3-workers.yml

ssh -i ~/.ssh/urlshort ubuntu@<MASTER_IP>
kubectl get nodes     # expect: 3 nodes in Ready state
```

### P5: Kubernetes manifests

`k8s/deployment.yaml`:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: url-shortener }
spec:
  replicas: 2                       # stateless → safe to run multiple copies
  selector: { matchLabels: { app: url-shortener } }
  template:
    metadata: { labels: { app: url-shortener } }
    spec:
      containers:
      - name: api
        image: <ECR_URL>:<GIT_SHA>  # CI fills this in; never use :latest
        ports: [{ containerPort: 8000 }]
        env:
        - { name: DB_HOST, value: "<RDS_ENDPOINT>" }
        - name: DB_PASSWORD
          # Pull password from K8s Secret — never hardcode in manifest
          valueFrom: { secretKeyRef: { name: db-secret, key: password } }
        readinessProbe:
          # K8s only sends traffic once this probe passes
          httpGet: { path: /health, port: 8000 }
          initialDelaySeconds: 5; periodSeconds: 5
        livenessProbe:
          # K8s restarts pod if this probe fails 3× in a row
          httpGet: { path: /health, port: 8000 }
          initialDelaySeconds: 10; periodSeconds: 10
        resources:                  # required for scheduler to pack nodes correctly
          requests: { cpu: "100m", memory: "128Mi" }
          limits:   { cpu: "250m", memory: "256Mi" }
```

`k8s/service.yaml`:
```yaml
apiVersion: v1
kind: Service
metadata: { name: url-shortener-svc }
spec:
  type: NodePort                    # self-managed: no LoadBalancer integration
  selector: { app: url-shortener } # must match pod label exactly (P5 break)
  ports:
  - port: 80; targetPort: 8000; nodePort: 30080
```

Create the secret (one-time; or use `secret.yaml` with base64-encoded value):
```bash
kubectl create secret generic db-secret --from-literal=password=Secret123!
kubectl apply -f k8s/
kubectl rollout status deployment/url-shortener

# Prove self-heal:
kubectl delete pod <any-pod>
kubectl get pods   # new pod appears within seconds; data in RDS unchanged
```

### P6: GitHub Actions — `ci.yml`

```yaml
name: CI
on:
  push:
    branches: [main]
    paths: ['app/**']    # only trigger when app code changes, not k8s/ manifest changes
                         # without this: manifest update → CI trigger → manifest update → loop

permissions:
  contents: write        # required: CI commits back to repo with new image SHA

jobs:
  build-push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Gate: tests must pass before image is built
      - name: Test
        run: pip install pytest && cd app && pytest

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id:     ${{ secrets.AWS_KEY }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET }}
          aws-region: ap-south-1

      - uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push
        run: |
          docker build -t ${{ secrets.ECR_URL }}:${{ github.sha }} ./app
          docker push  ${{ secrets.ECR_URL }}:${{ github.sha }}
          # github.sha = commit hash = unique, immutable, traceable

      - name: Update manifest (GitOps handoff)
        run: |
          sed -i "s|image: .*url-shortener.*|image: ${{ secrets.ECR_URL }}:${{ github.sha }}|" \
            k8s/deployment.yaml
          git config user.name  "ci-bot"
          git config user.email "ci@bot.com"
          git add k8s/deployment.yaml
          git commit -m "ci: update image to ${{ github.sha }} [skip ci]"
          # [skip ci] = tells GitHub Actions not to re-trigger on this commit
          git push
```

> Add `AWS_KEY`, `AWS_SECRET`, `ECR_URL` under GitHub repo → Settings → Secrets and variables → Actions.

### P7: Argo CD — `argocd/application.yaml`

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: url-shortener
  namespace: argocd
spec:
  project: default
  source:
    repoURL:        https://github.com/<your-handle>/url-shortener.git
    targetRevision: main
    path:           k8s     # Argo watches only this directory
  destination:
    server:    https://kubernetes.default.svc
    namespace: default
  syncPolicy:
    automated:
      prune:    true   # if resource removed from Git, remove from cluster
      selfHeal: true   # if cluster drifts from Git (e.g. manual kubectl), revert
```

Install Argo CD and apply:
```bash
kubectl create namespace argocd
kubectl apply -n argocd \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl wait --for=condition=available deployment -n argocd --all --timeout=120s

kubectl apply -f argocd/application.yaml
# Argo now manages k8s/ — every git push that changes k8s/ triggers a sync
```

---

## EKS vs self-managed: the decision

| Dimension | Self-managed (this project) | EKS |
|-----------|----------------------------|-----|
| Control plane | You run kubeadm init, etcd is your responsibility | AWS manages etcd, API server, scheduler |
| Ansible role | Core — Ansible installs and joins the cluster | Minimal — Terraform + eks module does it |
| LoadBalancer service | NodePort only (no cloud-controller-manager) | `type: LoadBalancer` → automatic AWS ELB |
| `aws eks update-kubeconfig` | Not needed — kubeconfig set manually | Required to get cluster credentials |
| Patching | You upgrade kubeadm, kubelet, control plane | AWS manages control-plane upgrades |
| HA control plane | You build it (stacked etcd or external) | Built in |
| Cost (learn) | ~$2/day (3 t3.medium) | ~$3.50/day (3 t3.medium + $0.10/hr cluster fee) |
| Production suitability | Low (self-managed HA is hard) | High (90% of prod clusters) |
| Interview value | High (demonstrates internals knowledge) | Medium (everyone uses EKS) |

**The honest interview answer:**

> "I chose self-managed kubeadm deliberately — to understand what Kubernetes actually does when you run `kubeadm init`: the certificate authority creation, etcd bootstrap, kube-apiserver manifest, Calico CNI overlay. In production I would choose EKS because AWS manages the control-plane HA, etcd backups, and version upgrades — the undifferentiated heavy lifting I do not want to own. But you cannot use a managed abstraction wisely if you do not know what it abstracts. That is why I built it myself first."

**Concrete technical differences you can demo:**

- `type: LoadBalancer` in a self-managed cluster → service stays in `<pending>` forever (no cloud-controller-manager). On EKS it provisions an AWS ELB within ~90 seconds.
- On EKS: `aws eks update-kubeconfig --name cluster --region region` to get credentials. On self-managed: `cp /etc/kubernetes/admin.conf ~/.kube/config` on the master.
- On EKS: node IAM role handles ECR pull. On self-managed: need a `docker-registry` pull secret or install AWS CLI + cron to refresh the token.

For EKS variant (uses `terraform-aws-modules/eks/aws` and VPC module), see the notes from `README2.md` in the source repo. The delivery loop (Actions + Argo) is identical — only P3 and P4 differ.

---

> 🔮 **Predict pehle (socho, phir aage padho):** Tum shaam ko cluster + RDS chhod ke chale gaye, `terraform destroy` nahi kiya. Subah kya milta hai?

## Cost, cleanup & production landmines

### Cost breakdown

| Resource | Instance | Cost/month (ap-south-1) |
|----------|----------|------------------------|
| EC2 master | t3.medium | ~$13 |
| EC2 worker ×2 | t3.medium | ~$26 |
| RDS Postgres | db.t3.micro | ~$15 |
| ECR storage | ~1 GB | ~$0.10 |
| S3 tfstate | negligible | ~$0.01 |
| Data transfer | modest | ~$1 |
| **Total** | | **~$55–73/month** |

> Leave this running overnight = ~$2.50. Leave it for a weekend = ~$10. Leave it for a month = one wasted month of learning budget.

**Daily discipline:**
```bash
# When done for the day:
terraform destroy -var="db_password=Secret123!"   # ~3 min

# Next day:
terraform apply -var="db_password=Secret123!"     # ~5 min
ansible-playbook -i ansible/inventory.ini ansible/1-common.yml
ansible-playbook -i ansible/inventory.ini ansible/2-master.yml
ansible-playbook -i ansible/inventory.ini ansible/3-workers.yml
kubectl apply -f argocd/...   # Argo re-deploys everything from Git automatically
```

### Billing alert (set this before anything else)

```
AWS Console → Billing → Budgets → Create Budget
Budget type: Cost · Amount: $20
Alert: 80% of budgeted amount → email
```

> Free-tier trap: t3.medium is NOT free tier eligible. Only t3.micro is. But t3.micro cannot run kubeadm (2 vCPU minimum). If you must stay free: use k3s + 2 GB swap on a single t3.micro. See G2 and G5 in `14-interview-bank.md`.

### Cleanup order (order matters)

```bash
# Step 1: Delete K8s resources that create AWS resources (ELB etc.)
kubectl delete -f k8s/
kubectl delete namespace argocd

# Step 2: Terraform destroy (removes EC2, RDS, ECR, VPC)
cd infra
terraform destroy -var="db_password=Secret123!"

# Step 3: Only when project is completely done
aws s3 rb s3://<name>-tfstate-urlshortener --force
aws dynamodb delete-table --table-name tf-lock --region ap-south-1
```

**Why order matters:** If you run `terraform destroy` while a K8s LoadBalancer Service still exists, the ELB it provisioned becomes an orphan — Terraform does not know about it, it was created by the cloud-controller-manager. The ELB stays up, keeps billing, and blocks VPC deletion. Always delete K8s resources that touch AWS APIs first. (Self-managed uses NodePort, so this is less risky here than with EKS — but the habit matters.)

### Production landmines

| Landmine | Why dangerous | Safe habit |
|----------|--------------|------------|
| Leaving infra running | ~$73/month idle cost | `terraform destroy` every session |
| `image: latest` in deployment | Cannot tell which version is running; rollback is ambiguous | Always use `git-sha` tag |
| `kubectl edit` or `kubectl scale` by hand | Argo selfHeal reverts it within 30s; creates confusion | Change Git → let Argo apply |
| Secret in `.gitignore` not applied | Secret committed, pushed, now in git history forever | Rotate immediately; `git filter-repo` to remove |
| `terraform destroy` in wrong directory | Wrong infra wiped | Check `pwd` and `terraform workspace` before every destroy |
| Deploying Friday afternoon | Incident response on weekend | Team policy: no deploys after 3pm Friday |

---

## Quick troubleshoot

The table below covers the signature issues from this project. For the full 19-entry war-story bank with root-cause analysis, see `14-interview-bank.md`.

> 🔧 **War story:** EC2 reboot ke baad `kubectl get nodes` pe "connection refused to localhost:8080" — node ka public IP rotate ho gaya tha aur kubeconfig mein purana IP tha. Fix: master pe `cp /etc/kubernetes/admin.conf ~/.kube/config` + Elastic IP assign karo taake reboot pe IP na badle. Poori kahani + lesson → [Interview Bank](14-interview-bank.md).

| Symptom | First check | Fix |
|---------|-------------|-----|
| `kubeadm init` fails with swap error | `free -h` — is swap active? | `swapoff -a` then retry |
| `curl ifconfig.me` gives IPv6 → SG SSH broken | IP mismatch in SG rule | `curl -4 ifconfig.me` → update SG CIDR |
| Node can't join cluster (`TLS error`) | Using public IP for join? | Use master's private `10.0.x.x` IP |
| `kubectl get nodes` → `localhost:8080 refused` | `~/.kube/config` missing | `cp /etc/kubernetes/admin.conf ~/.kube/config` |
| Pods `Pending` forever | `kubectl get sc` — StorageClass? | `local-path-provisioner` + patch default SC |
| CI manifest-update fails: "Permission denied" | `permissions: contents: write` in `ci.yml`? | Add permission + enable in repo Settings → Actions |
| CI triggers infinite loop | `paths:` filter missing? `[skip ci]` in commit? | Both layers required — see P6 deliberate break |
| Argo App `OutOfSync` but not healing | `selfHeal: true` set? | `kubectl describe application -n argocd` |
| RDS `password` rejected by Terraform | Special characters in password | Use letters + numbers only (no `/`, `@`, `"`) |
| `type: LoadBalancer` service stuck `Pending` | Self-managed cluster (no cloud-controller) | Use `type: NodePort` on self-managed; EKS for LoadBalancer |

---

## Put it on your resume

**One-line resume bullet:**

> *Built and deployed a URL shortener on AWS with self-managed Kubernetes (kubeadm + Calico), full IaC (Terraform), config management (Ansible), containerization (Docker + ECR), CI/CD (GitHub Actions), and GitOps (Argo CD) — automated code-to-production pipeline with zero-downtime rolling updates and automated rollback.*

**Skills → tools table (for recruiter conversations):**

| Skill | Tool/proof | Where in this project |
|-------|-----------|----------------------|
| Infrastructure as Code | Terraform | VPC, EC2, RDS, ECR — all declared, version-controlled |
| Configuration management | Ansible | K8s cluster bootstrap (kubeadm) on 3 raw EC2 |
| Containerization | Docker + ECR | FastAPI image, layer cache, SHA tagging |
| Container orchestration | Kubernetes | Deployment, Service, probes, rolling update, self-heal |
| CI pipeline | GitHub Actions | Test gate → build → push → manifest update |
| GitOps / CD | Argo CD | Pull-based deploy, selfHeal, rollback via `git revert` |
| Secret management | K8s Secrets | DB password injected at runtime, not in code |
| Observability basics | K8s probes | Readiness + liveness on `/health` |
| Cost management | Terraform destroy habit | Daily destroy discipline |
| Networking | VPC, SG, NodePort | Ports, subnets, least-privilege SG rules |

When a recruiter asks "walk me through a project" — this is the project. It covers every layer of the modern DevOps stack in one coherent story.

---

## Summary

This capstone exists to answer one question: can you wire the entire stack together? Not theory — working code, running infra, live traffic.

The key ideas it proves:

1. **State outside, compute disposable.** FastAPI pods are cattle — kill one, spawn another, URLs survive because they live in RDS.
2. **Two loops, clear separation.** Setup (Terraform + Ansible) is one-time and slow. Delivery (push → Actions → Argo) is automated and fast.
3. **Git is the source of truth.** The cluster's desired state is what is in `k8s/`. Argo enforces it. Manual `kubectl` edits are auto-reverted.
4. **Deliberate breaks build real skill.** The P5 broken label, the P6 CI loop, the P7 selfHeal demo — these are the moments where the internals crystallize.
5. **Cost discipline is a habit.** `terraform destroy` every session. Not optional.

The next step is `13-capstone-microshop.md` — the same ideas applied to five microservices with service mesh, multi-stage CI, and proper ingress. Build this first. Get it working end-to-end. Then level up.

---

## Self-check quiz

Pehle memory se jawab do, phir neeche kholo.

1. You run `kubectl delete pod url-shortener-abc`. The app keeps serving traffic and the deleted URL still redirects correctly. Explain why, at the component level.
2. The CI pipeline triggers itself after the manifest-update commit creates an infinite loop. Name the two independent defenses against this and where each is configured.
3. Your `type: LoadBalancer` service is stuck in `<pending>` state on your self-managed cluster. What is the root cause and what are your two options?
4. A teammate runs `kubectl scale deployment url-shortener --replicas=10` directly on the cluster. What happens next (be specific about the tool and the time window)?
5. Explain why `publicly_accessible = false` on the RDS instance is a security control, not just a convenience setting.
6. You must roll back a bad deploy. What is the exact Git command and what happens in the cluster without any further manual action?
7. `terraform destroy` hangs at "Destroying aws_vpc.main". What likely created a resource inside the VPC that Terraform does not track, and how do you fix it?
8. Your CI fails with "aws ecr get-login-password: command not found" on the EC2 master node. What is the correct fix and why is installing AWS CLI on the node the wrong long-term answer?

<details markdown="1"><summary>Jawab dekho</summary>

1. ReplicaSet controller sees "desired 2, have 1" → creates new pod automatically. URL data in RDS unaffected — app is stateless, pods carry no data of their own.
2. (a) `paths: ['app/**']` filter in CI trigger — manifest commits don't touch `app/`, so CI doesn't retrigger. (b) `[skip ci]` in manifest-update commit message — GitHub Actions ignores this commit. Both layers required.
3. No cloud-controller-manager on self-managed cluster → nothing provisions an ELB. Options: (a) switch to `type: NodePort`; (b) install MetalLB for bare-metal load balancing.
4. Argo CD with `selfHeal: true` detects drift (cluster=10, Git=2). Within ~3 min polling interval, Argo applies Git manifest → reverts to 2 replicas automatically.
5. `publicly_accessible = false` = RDS has no public IP; internet cannot reach the DB even if a Security Group rule is misconfigured. Defense-in-depth: two independent barriers (no public IP + SG) instead of SG alone.
6. `git revert <bad-commit-hash>` → new commit with previous image SHA in deployment.yaml → Argo detects OutOfSync → rolling update to previous image. No manual `kubectl` needed.
7. A K8s resource (e.g. `type: LoadBalancer` Service) provisioned an AWS resource (ELB, ENI) inside the VPC that Terraform does not track. Fix: `kubectl delete` those K8s resources first so AWS cleans up the ELB, then `terraform destroy`.
8. `aws-actions/amazon-ecr-login@v2` GitHub Action handles ECR auth on the CI runner — no AWS CLI needed on EC2 nodes. Installing AWS CLI on nodes = bakes tooling onto EC2, requires credentials on node, not scalable or auditable.
</details>

---

## Interview questions

**Q1: Why did you put Postgres in RDS instead of running it as a pod?**

Running Postgres as a pod means the data lives on the pod's node. If the node dies, or the pod gets rescheduled, the data moves or is lost (unless you wire up persistent volumes carefully). RDS gives you managed backups, automated failover, and a stable endpoint. The principle is: state must outlive compute. Pods are disposable; data is not. I kept them in separate failure domains on purpose.

**Q2: Walk me through what happens when you push a commit to `main`.**

GitHub Actions triggers because `app/**` changed. The workflow runs `pytest` — if it fails, nothing else runs. If tests pass, Docker builds a new image tagged with the commit SHA (not `latest`), pushes it to ECR, then updates `k8s/deployment.yaml` with the new SHA and pushes that commit back to Git with `[skip ci]` to prevent a loop. Argo CD polls Git every three minutes, detects the manifest changed, sees the cluster is OutOfSync, and applies the new manifest. Kubernetes does a rolling update — new pods come up, pass readiness probes, then old pods are terminated. Total time: typically under five minutes from push to live.

**Q3: Why self-managed Kubernetes instead of EKS?**

To understand what Kubernetes actually does when you run `kubeadm init`. The control plane certificate authority, the etcd bootstrap, the kube-apiserver static pod, the Calico CNI overlay — all of it became concrete by running it myself. In production I would choose EKS because AWS manages control-plane HA and etcd backups. But you cannot debug a managed service intelligently without knowing what it manages. I built this project with self-managed specifically so I would not be afraid of the internals. See also `11-M9-advanced-k8s-internals.md` for the deep dive.

**Q4: A developer manually scaled the deployment to 10 replicas in production. How does your system handle it?**

Argo CD with `selfHeal: true` detects the cluster state (10 replicas) differs from Git state (2 replicas) within its polling interval (default: 3 minutes). It applies the Git manifest and reverts to 2 replicas automatically. This is intentional — Git is the only way to change the cluster. If the developer legitimately needs more replicas, they edit `deployment.yaml`, commit, and push. The audit trail lives in Git history, not in who ran what `kubectl` command.

**Q5: What is the blast radius of `terraform destroy` in this project?**

Everything: all three EC2 instances (the entire K8s cluster), the RDS database (all URL data if `skip_final_snapshot = true`), the ECR repository (all images), the VPC and all networking. The S3 bucket and DynamoDB lock table survive because they are not in the same Terraform configuration (you created them manually). This is why the daily `terraform destroy` habit is both the cost-saving move and the highest-risk command in the workflow. Always run `terraform plan` first; always verify your working directory.

---

## Production challenge

**✅ Sahi hua to aisa dikhega:** `curl http://<worker-ip>:30080/health` returns `{"status":"ok"}`; `curl -X POST http://<worker-ip>:30080/shorten -H "Content-Type: application/json" -d '{"url":"https://github.com"}'` returns `{"short":"<6-char-code>"}`; us code se `curl -L http://<worker-ip>:30080/<code>` github.com pe redirect karta hai (HTTP 302); `kubectl delete pod <any-pod>` ke baad 5s mein naya pod aata aur purane short codes kaam karte rehte (data RDS mein safe hai).

You have a working URL shortener. These extensions each require a real architectural decision:

**Challenge 1 — Ingress + TLS:**
Replace the NodePort with an `nginx-ingress-controller` and add `cert-manager` with a Let's Encrypt issuer. Map a real domain (or a free one from duckdns.org) to a worker IP via Route 53 or `/etc/hosts`. Observe how host-based routing works and how Argo manages the new Ingress resource. Expected effort: 2–4 hours.

**Challenge 2 — Prometheus + Grafana:**
Add the `kube-prometheus-stack` Helm chart (deploy via Argo CD using a Helm source). Create a dashboard showing request rate on `/shorten` and `/health`, pod memory usage, and RDS connection count. Wire an alert for when pod restarts exceed 3 in 10 minutes. Expected effort: 4–6 hours.

**Challenge 3 — Second environment (staging):**
Create a `staging` branch. Add a second Argo CD Application pointing to a `k8s-staging/` directory with `replicas: 1` and a different RDS instance (or the same RDS with a `staging` database). Configure GitHub Actions to deploy `main` → production and `staging` → staging. This forces you to deal with environment-specific config, multiple Argo Applications, and branch-based delivery. Expected effort: 1 day.

When these three are done, you are ready for `13-capstone-microshop.md` — five services, service mesh, and the complexity that comes with distributed systems.
