# Capstone Project: Git Se Production Tak (Full Hands-On)

> Ek hi project mein sab: Git → GitHub → Docker → Terraform → AWS → Kubernetes → CI/CD → GitOps.
> **Padhna nahi — chalakar seekhna.** Har step pe *kya* + *kyun* + *exact commands*.
> Stack: Python FastAPI + Postgres, AWS, self-managed Kubernetes, GitHub Actions + Argo CD.

---

## Project Kya Banayenge

Ek **URL Shortener** (jaise bit.ly ka chhota version). Kyun ye?
- Stateless API (Kubernetes ke liye perfect) + stateful DB (Postgres/RDS) — dono concepts ek project mein.
- Chhota par real — CRUD, DB, deploy, scale sab cover hota.
- Demo karne layak — "ye mera live URL shortener hai" portfolio mein strong.

```
POST /shorten  {"url": "https://very-long-url.com/..."}  → {"short": "abc123"}
GET  /abc123                                              → redirect to long URL
```

---

## Pre-requisites (Day 0 — setup)

```bash
# Install (macOS brew; Linux apt/dnf equivalent)
brew install git awscli terraform ansible kubectl docker python@3.12

# Accounts banao
- GitHub account (free)
- AWS account (billing alert ZAROOR set karo — $20 limit)
- AWS CLI configure: aws configure  (access key + secret)

# Verify
git --version && terraform version && kubectl version --client && aws sts get-caller-identity
```

> **Billing alert pehle:** AWS Console → Billing → Budgets → $20 alert. Ye life-saver hai. Bhula hua cluster = bill.

---

# PHASE 1 — Git & Code (Day 1)

**Goal:** App likho, Git se version control seekho. Ye foundation hai — sab isi pe build hoga.

## Step 1.1 — Project banao + Git init

```bash
mkdir url-shortener && cd url-shortener
git init                          # ye folder ab Git-tracked hai
git branch -M main                # default branch ka naam 'main'
```

**Kyun:** `git init` ek `.git` folder banata jahan Git poori history rakhta. `main` = primary branch (production-ready code yahan).

## Step 1.2 — App code likho

`app/main.py`:
```python
from fastapi import FastAPI, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
import os, psycopg2, string, random

app = FastAPI()

def db():
    return psycopg2.connect(
        host=os.environ["DB_HOST"],
        dbname=os.environ.get("DB_NAME", "appdb"),
        user=os.environ.get("DB_USER", "appuser"),
        password=os.environ["DB_PASSWORD"],
    )

def code(n=6):
    return "".join(random.choices(string.ascii_letters + string.digits, k=n))

class UrlIn(BaseModel):
    url: str

@app.on_event("startup")
def init_db():
    conn = db(); cur = conn.cursor()
    cur.execute("CREATE TABLE IF NOT EXISTS urls (code TEXT PRIMARY KEY, url TEXT NOT NULL)")
    conn.commit(); conn.close()

@app.get("/health")           # K8s probe isse poochega "zinda ho?"
def health():
    return {"status": "ok"}

@app.post("/shorten")
def shorten(body: UrlIn):
    c = code()
    conn = db(); cur = conn.cursor()
    cur.execute("INSERT INTO urls (code, url) VALUES (%s, %s)", (c, body.url))
    conn.commit(); conn.close()
    return {"short": c}

@app.get("/{c}")
def go(c: str):
    conn = db(); cur = conn.cursor()
    cur.execute("SELECT url FROM urls WHERE code = %s", (c,))
    row = cur.fetchone(); conn.close()
    if not row:
        raise HTTPException(404, "Not found")
    return RedirectResponse(row[0])
```

`app/requirements.txt`:
```
fastapi==0.111.0
uvicorn==0.30.0
psycopg2-binary==2.9.9
```

**Kyun ye structure:** `/health` endpoint — Kubernetes isse poochega pod healthy hai ya nahi (readiness/liveness probe). State (URLs) DB mein hai, app mein nahi → **stateless app, stateful DB** — exactly wo principle jo seekha.

## Step 1.3 — Local test (cloud se pehle hamesha local)

```bash
# Postgres local mein Docker se chalao (quick)
docker run -d --name pg -e POSTGRES_PASSWORD=test -e POSTGRES_USER=appuser -e POSTGRES_DB=appdb -p 5432:5432 postgres:16

# App chalao
cd app && pip install -r requirements.txt
DB_HOST=localhost DB_PASSWORD=test uvicorn main:app --reload

# Test (doosre terminal mein)
curl -X POST localhost:8000/shorten -H "Content-Type: application/json" -d '{"url":"https://google.com"}'
# {"short":"Xy3k9p"}  → phir: curl -L localhost:8000/Xy3k9p
```

**Kyun local pehle:** Cloud pe debug karna slow + mehnga. Local pe sab kaam kare, *phir* cloud. Ye habit pakdo.

## Step 1.4 — Git workflow seekho (sabse important practical skill)

`.gitignore`:
```
__pycache__/
*.pyc
.env
*.tfstate*
.terraform/
```

```bash
git add .gitignore app/
git commit -m "feat: basic url shortener API"   # pehla commit

# Ab feature branch workflow (real teams aise kaam karte)
git checkout -b feature/add-stats     # nayi branch
# ... code badlo ...
git add . && git commit -m "feat: add click stats"
git checkout main                     # main pe wapas
git merge feature/add-stats           # feature ko main mein laao
```

**Kyun branches:** Production code (`main`) safe rehta. Naya kaam alag branch mein → test → phir merge. Real teams kabhi seedha `main` pe kaam nahi karte.

**Practice karo:**
- `git log --oneline` — history dekho
- `git diff` — kya badla
- ek merge conflict deliberately banao (do branch mein same line badlo, merge karo) — resolve karna seekho. Ye real skill hai.

---

# PHASE 2 — Docker (Day 2)

**Goal:** App ko portable image mein pack karo.

## Step 2.1 — Dockerfile

`app/Dockerfile`:
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Kyun har line:**
- `slim` base — chhoti image (kam attack surface, fast pull).
- `requirements` pehle copy, `pip install`, *phir* code — **layer caching**: code badle to dependencies dobara install nahi hote (build fast).
- `0.0.0.0` — container ke bahar se accessible (localhost nahi).

## Step 2.2 — Build + test locally

```bash
cd app
docker build -t url-shortener:dev .
docker run -p 8000:8000 -e DB_HOST=host.docker.internal -e DB_PASSWORD=test url-shortener:dev
curl localhost:8000/health   # {"status":"ok"}
```

**Kyun:** Image local pe chale to AWS pe bhi chalegi — "works on my machine" problem khatam. Yahi Docker ka core value.

## Step 2.3 — GitHub repo banao + push

```bash
# GitHub pe "url-shortener" repo banao (UI se, empty)
git remote add origin https://github.com/<tum>/url-shortener.git
git push -u origin main
```

**Kyun:** Ab code GitHub pe hai — backup + collaboration + CI/CD ka base. GitHub Actions yahin se trigger hoga.

---

# PHASE 3 — Terraform: AWS Infra (Day 3-4)

**Goal:** Raw infra banao — VPC, EC2 (K8s ke liye), RDS, ECR. Sab code se (manual click nahi).

## Step 3.1 — Terraform structure

```
infra/
  main.tf         # resources
  variables.tf    # inputs
  outputs.tf      # baad mein chahiye values (IPs, endpoints)
  backend.tf      # state kahan (S3)
```

## Step 3.2 — Remote state pehle (TEAM-ready habit)

`infra/backend.tf`:
```hcl
terraform {
  backend "s3" {
    bucket = "<tum>-tfstate-urlshortener"   # pehle ye bucket bana lo
    key    = "infra/terraform.tfstate"
    region = "ap-south-1"
    dynamodb_table = "tf-lock"               # locking ke liye
  }
}
```

```bash
# Pehle bucket + lock table (ek baar):
aws s3 mb s3://<tum>-tfstate-urlshortener --region ap-south-1
aws dynamodb create-table --table-name tf-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST --region ap-south-1
```

**Kyun remote state:** Local `.tfstate` solo ke liye theek, par team mein? 2 log ek saath apply karein to state corrupt. S3 = shared state, DynamoDB = lock (ek time ek hi apply). Ye **production habit** hai — interview mein poochte.

## Step 3.3 — Infra define karo

`infra/main.tf` (key parts):
```hcl
provider "aws" { region = "ap-south-1" }

# Networking
resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
  enable_dns_hostnames = true
  tags = { Name = "urlshort-vpc" }
}
resource "aws_subnet" "public" {
  vpc_id = aws_vpc.main.id
  cidr_block = "10.0.1.0/24"
  map_public_ip_on_launch = true
  availability_zone = "ap-south-1a"
}
resource "aws_subnet" "public2" {       # RDS ko 2 AZ chahiye
  vpc_id = aws_vpc.main.id
  cidr_block = "10.0.2.0/24"
  availability_zone = "ap-south-1b"
}
resource "aws_internet_gateway" "igw" { vpc_id = aws_vpc.main.id }
resource "aws_route_table" "pub" {
  vpc_id = aws_vpc.main.id
  route { cidr_block = "0.0.0.0/0"; gateway_id = aws_internet_gateway.igw.id }
}
resource "aws_route_table_association" "a" {
  subnet_id = aws_subnet.public.id; route_table_id = aws_route_table.pub.id
}

# Security group
resource "aws_security_group" "k8s" {
  name = "urlshort-sg"; vpc_id = aws_vpc.main.id
  ingress { from_port=22 to_port=22 protocol="tcp" cidr_blocks=["YOUR_IP/32"] }
  ingress { from_port=6443 to_port=6443 protocol="tcp" cidr_blocks=["10.0.0.0/16"] }
  ingress { from_port=0 to_port=0 protocol="-1" self=true }
  ingress { from_port=30000 to_port=32767 protocol="tcp" cidr_blocks=["0.0.0.0/0"] }
  ingress { from_port=5432 to_port=5432 protocol="tcp" self=true }
  egress  { from_port=0 to_port=0 protocol="-1" cidr_blocks=["0.0.0.0/0"] }
}

# SSH key
resource "aws_key_pair" "k" { key_name="urlshort"; public_key=file("~/.ssh/urlshort.pub") }

# EC2: 1 master + 2 workers
resource "aws_instance" "master" {
  ami="ami-0f5ee92e2d63afc18"  # Ubuntu 22.04 ap-south-1 (latest verify karo)
  instance_type="t3.medium"; subnet_id=aws_subnet.public.id
  key_name=aws_key_pair.k.key_name; vpc_security_group_ids=[aws_security_group.k8s.id]
  tags={Name="k8s-master"}
}
resource "aws_instance" "worker" {
  count=2; ami="ami-0f5ee92e2d63afc18"; instance_type="t3.medium"
  subnet_id=aws_subnet.public.id; key_name=aws_key_pair.k.key_name
  vpc_security_group_ids=[aws_security_group.k8s.id]; tags={Name="k8s-worker-${count.index}"}
}

# RDS Postgres (STATEFUL — managed)
resource "aws_db_subnet_group" "db" {
  name="urlshort-db"; subnet_ids=[aws_subnet.public.id, aws_subnet.public2.id]
}
resource "aws_db_instance" "pg" {
  identifier="urlshort-pg"; engine="postgres"; engine_version="16"
  instance_class="db.t3.micro"; allocated_storage=20
  db_name="appdb"; username="appuser"; password=var.db_password
  db_subnet_group_name=aws_db_subnet_group.db.name
  vpc_security_group_ids=[aws_security_group.k8s.id]
  skip_final_snapshot=true; publicly_accessible=false
}

# ECR (Docker registry)
resource "aws_ecr_repository" "api" { name="url-shortener" }
```

`infra/variables.tf`:
```hcl
variable "db_password" { type = string; sensitive = true }
```

`infra/outputs.tf`:
```hcl
output "master_ip"    { value = aws_instance.master.public_ip }
output "worker_ips"   { value = aws_instance.worker[*].public_ip }
output "rds_endpoint" { value = aws_db_instance.pg.address }
output "ecr_url"      { value = aws_ecr_repository.api.repository_url }
```

## Step 3.4 — Apply

```bash
ssh-keygen -t rsa -f ~/.ssh/urlshort   # SSH key banao
cd infra
terraform init                          # backend + providers download
terraform plan -var="db_password=Secret123!"   # PEHLE plan dekho — kya banega
terraform apply -var="db_password=Secret123!"   # ~5 min
terraform output                        # IPs/endpoint note karo
```

**Kyun `plan` pehle:** `plan` batata kya banega/badlega/mitega — *bina kuche kiye*. Production mein hamesha plan review karo, phir apply. Andha apply = disaster.

**Git commit:**
```bash
cd .. && git add infra/ && git commit -m "feat: terraform AWS infra" && git push
```

---

# PHASE 4 — Ansible: Kubernetes Cluster (Day 5-6)

**Goal:** Raw EC2 ko working K8s cluster banao. Yahan Ansible ka asli role.

## Step 4.1 — Inventory

`ansible/inventory.ini` (Terraform output se IPs bharo):
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

## Step 4.2 — Playbooks (3 stages)

`ansible/1-common.yml` — har node pe containerd + kubeadm:
```yaml
- hosts: all
  become: yes
  tasks:
    - shell: swapoff -a
    - shell: |
        modprobe overlay && modprobe br_netfilter
        echo -e "net.bridge.bridge-nf-call-iptables=1\nnet.ipv4.ip_forward=1" > /etc/sysctl.d/k8s.conf
        sysctl --system
    - apt: { name: containerd, state: present, update_cache: yes }
    - shell: |
        mkdir -p /etc/containerd
        containerd config default > /etc/containerd/config.toml
        sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml
      notify: restart containerd
    - shell: |
        mkdir -p /etc/apt/keyrings
        curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.30/deb/Release.key | gpg --dearmor -o /etc/apt/keyrings/k8s.gpg
        echo "deb [signed-by=/etc/apt/keyrings/k8s.gpg] https://pkgs.k8s.io/core:/stable:/v1.30/deb/ /" > /etc/apt/sources.list.d/k8s.list
    - apt: { name: [kubelet, kubeadm, kubectl], state: present, update_cache: yes }
    - shell: apt-mark hold kubelet kubeadm kubectl
  handlers:
    - name: restart containerd
      service: { name: containerd, state: restarted }
```

`ansible/2-master.yml`:
```yaml
- hosts: master
  become: yes
  tasks:
    - shell: kubeadm init --pod-network-cidr=192.168.0.0/16
      args: { creates: /etc/kubernetes/admin.conf }
    - shell: |
        mkdir -p /home/ubuntu/.kube
        cp /etc/kubernetes/admin.conf /home/ubuntu/.kube/config
        chown ubuntu:ubuntu /home/ubuntu/.kube/config
    - become_user: ubuntu
      shell: kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.27.0/manifests/calico.yaml
    - shell: kubeadm token create --print-join-command
      register: j
    - local_action: copy content="{{ j.stdout }}" dest=./join.sh
      become: no
```

`ansible/3-workers.yml`:
```yaml
- hosts: workers
  become: yes
  tasks:
    - copy: { src: ./join.sh, dest: /tmp/join.sh }
    - shell: bash /tmp/join.sh
      args: { creates: /etc/kubernetes/kubelet.conf }
```

## Step 4.3 — Run + verify

```bash
cd ansible
ansible all -i inventory.ini -m ping        # connectivity check pehle
ansible-playbook -i inventory.ini 1-common.yml
ansible-playbook -i inventory.ini 2-master.yml
ansible-playbook -i inventory.ini 3-workers.yml

# Verify (master pe)
ssh -i ~/.ssh/urlshort ubuntu@<MASTER_IP>
kubectl get nodes      # 3 nodes Ready → CLUSTER READY 🎉
```

**Kyun `ansible ping` pehle:** SSH connectivity confirm karo before heavy playbooks. Chhoti cheez pehle test = badi waste-time se bacho.

**Git commit:** `git add ansible/ && git commit -m "feat: ansible k8s cluster" && git push`

---

# PHASE 5 — Manual Deploy (Day 7)

**Goal:** Pehle HAATH se deploy karo (CI/CD se pehle samajh aaye kya ho raha).

## Step 5.1 — Image ECR pe daalo (abhi manually)

```bash
ECR=<ecr_url_from_terraform>
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin $ECR
docker build -t $ECR:v1 ./app
docker push $ECR:v1
```

## Step 5.2 — K8s manifests

`k8s/secret.yaml` (DB password — abhi simple, baad mein improve):
```bash
kubectl create secret generic db-secret --from-literal=password=Secret123!
```

`k8s/deployment.yaml`:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: url-shortener }
spec:
  replicas: 2                       # STATELESS → 2 copies
  selector: { matchLabels: { app: url-shortener } }
  template:
    metadata: { labels: { app: url-shortener } }
    spec:
      containers:
      - name: api
        image: <ECR>:v1
        ports: [{ containerPort: 8000 }]
        env:
        - { name: DB_HOST, value: "<RDS_ENDPOINT>" }
        - name: DB_PASSWORD
          valueFrom: { secretKeyRef: { name: db-secret, key: password } }
        readinessProbe:             # K8s: "traffic ke ready?"
          httpGet: { path: /health, port: 8000 }
          initialDelaySeconds: 5
        livenessProbe:              # K8s: "zinda?"
          httpGet: { path: /health, port: 8000 }
          initialDelaySeconds: 10
---
apiVersion: v1
kind: Service
metadata: { name: url-shortener-svc }
spec:
  type: NodePort                    # self-managed (LoadBalancer EKS-only)
  selector: { app: url-shortener }
  ports: [{ port: 80, targetPort: 8000, nodePort: 30080 }]
```

## Step 5.3 — Deploy + test live

```bash
# master node pe (kubectl yahan configured hai)
kubectl apply -f k8s/
kubectl get pods -o wide       # 2 pods running, workers pe
kubectl rollout status deployment/url-shortener

# Live test!
curl -X POST http://<WORKER_IP>:30080/shorten -H "Content-Type: application/json" -d '{"url":"https://github.com"}'
# {"short":"a1B2c3"} → curl -L http://<WORKER_IP>:30080/a1B2c3
```

**Concept prove karo:**
```bash
kubectl delete pod <pod-name>      # ek pod maro
kubectl get pods                   # K8s ne turant naya banaya (self-heal)
curl ...<short-code>               # SAME data → kyunki data RDS mein, pod mein nahi
kubectl scale deployment url-shortener --replicas=5   # scale, seconds mein
```

**Yahan tum samajh gaye:** manual deploy kaisा hota. Ab isе automate karenge.

---

# PHASE 6 — CI/CD: GitHub Actions (Day 8-9)

**Goal:** Push karte hi automatically build + image + push ho. Manual `docker build` khatam.

## Step 6.1 — AWS credentials GitHub secrets mein

```
GitHub repo → Settings → Secrets and variables → Actions → New secret:
  AWS_KEY     = <access key>
  AWS_SECRET  = <secret key>
  ECR_URL     = <ecr url>
```

**Kyun secrets:** Credentials code mein NAHI. GitHub encrypt karke rakhता, pipeline run-time pe inject karta. Leak-proof.

## Step 6.2 — Workflow

`.github/workflows/ci.yml`:
```yaml
name: CI - Build and Push
on:
  push:
    branches: [main]
    paths: ['app/**']           # sirf app badle to chale (smart)

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_KEY }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET }}
          aws-region: ap-south-1
      - uses: aws-actions/amazon-ecr-login@v2
      - name: Build and push
        run: |
          docker build -t ${{ secrets.ECR_URL }}:${{ github.sha }} ./app
          docker push ${{ secrets.ECR_URL }}:${{ github.sha }}
      - name: Update manifest with new tag
        run: |
          sed -i "s|image: .*url-shortener.*|image: ${{ secrets.ECR_URL }}:${{ github.sha }}|" k8s/deployment.yaml
          git config user.name "ci-bot"
          git config user.email "ci@bot.com"
          git add k8s/deployment.yaml
          git commit -m "ci: update image to ${{ github.sha }}"
          git push
```

**Kyun `github.sha` tag:** Har commit ka unique ID = unique image tag. "latest" kabhi use mat karo prod mein — pata nahi chalta kaunsi version chal rahi. SHA se exact traceability.

**Kyun manifest update step:** Ye GitOps ka setup hai — Actions image banakar `deployment.yaml` mein naya tag likh deta. Agle phase mein Argo CD isi change ko dekhega.

## Step 6.3 — Test

```bash
# app/main.py mein chhota change karo, push karo
git add app/ && git commit -m "feat: tweak" && git push
# GitHub → Actions tab → pipeline live chalti dekho
```

**Yahan tum samajh gaye:** push → auto build → auto image. CI ka kaam.

---

# PHASE 7 — GitOps: Argo CD (Day 10-11)

**Goal:** Git se cluster auto-sync. Manual `kubectl apply` khatam. Git = source of truth.

## Step 7.1 — Argo CD install (cluster ke andar)

```bash
# master node pe
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl get pods -n argocd     # argocd pods Running tak wait

# Admin password
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

**Kyun namespace:** Argo CD ko alag namespace mein rakha (apne app se isolated). Namespaces = ek cluster mein logical separation.

## Step 7.2 — Argo CD ko app batao

`argocd/application.yaml`:
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: url-shortener
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/<tum>/url-shortener.git
    targetRevision: main
    path: k8s                      # ye folder watch karega
  destination:
    server: https://kubernetes.default.svc
    namespace: default
  syncPolicy:
    automated:
      prune: true                  # Git se hata? cluster se bhi hatao
      selfHeal: true               # manual change? Git state wapas
```

```bash
kubectl apply -f argocd/application.yaml
```

**Kyun `selfHeal: true`:** Koi `kubectl` se manually badle → Argo turant Git wali state wapas laga deta. Drift impossible. Yahi GitOps ka magic.

## Step 7.3 — Pura GitOps flow test karo (THE moment)

```bash
# 1. app/main.py mein change karo
git add app/ && git commit -m "feat: new feature" && git push

# 2. GitHub Actions: build → image → manifest mein naya tag commit (auto)
# 3. Argo CD: manifest change dekha → cluster pe naya image apply (auto)

# Dekho Argo CD UI mein (port-forward):
kubectl port-forward svc/argocd-server -n argocd 8080:443
# browser: https://localhost:8080  (admin + password)
# App "Synced" + "Healthy" dikhega, naya version deploy hua
```

**Yahan sab juda:** tumne code push kiya, aur **kuch bhi manually nahi kiya** — image bana, push hua, deploy hua, sab automatic. Git se cluster tak. Ye production ka asli flow hai.

## Step 7.4 — Rollback test (GitOps ka best part)

```bash
git revert HEAD          # pichla change ulta karo
git push                 # Argo dekhega → purani version wapas deploy
```

**Kyun powerful:** Rollback = ek `git revert`. Koi panic nahi, koi manual kubectl nahi. Git history = deployment history.

---

# PHASE 8 — Polish: Production Touches (Day 12+)

Ab core flow chal raha. Ye cheezein "real" banati hain:

## 8.1 — Tests + CI mein test gate
`app/test_main.py`:
```python
def test_code_length():
    from main import code
    assert len(code()) == 6
```
CI mein build se pehle:
```yaml
      - run: pip install pytest && cd app && pytest
```
**Kyun:** Toота code prod mein na jaye. Test fail → pipeline ruk jaaye → deploy nahi.

## 8.2 — Branch protection (GitHub)
```
Settings → Branches → main → Require PR before merge + require CI pass
```
**Kyun:** Koi seedha main pe push na kar sake. PR + review + green CI = phir merge. Real team discipline.

## 8.3 — Resource limits (pod ko control)
deployment.yaml mein:
```yaml
        resources:
          requests: { cpu: "100m", memory: "128Mi" }
          limits:   { cpu: "250m", memory: "256Mi" }
```
**Kyun:** Ek pod poora node na kha le. Scheduler ko packing ke liye chahiye (sizing concept).

## 8.4 — Ingress + domain (NodePort se upgrade)
- nginx-ingress install karo
- ek domain (Route53 ya free) point karo
- TLS: cert-manager + Let's Encrypt (HTTPS)
**Kyun:** `worker-ip:30080` ugly hai. Real apps domain + HTTPS pe chalti.

---

# CLEANUP (har session ke baad ya project khatam pe)

```bash
# K8s resources
kubectl delete -f k8s/
# Argo CD
kubectl delete namespace argocd
# Sab AWS infra (ZAROORI — warna bill)
cd infra && terraform destroy -var="db_password=Secret123!"
# Bucket/lock table (project khatam pe)
aws s3 rb s3://<tum>-tfstate-urlshortener --force
aws dynamodb delete-table --table-name tf-lock --region ap-south-1
```

> **Daily habit:** Kaam khatam → `terraform destroy`. Agle din phir `apply` (5 min). $73/month bachao.

---

# Tumne Kya-Kya Seekha (resume points)

| Phase | Skill | Tool |
|-------|-------|------|
| 1 | Version control, branching, PR workflow | Git, GitHub |
| 2 | Containerization, layer caching | Docker, ECR |
| 3 | IaC, remote state, locking | Terraform, S3, DynamoDB |
| 4 | Cluster provisioning, config mgmt | Ansible, kubeadm |
| 5 | K8s deploy, probes, scaling, self-heal | Kubernetes |
| 6 | CI automation, secrets | GitHub Actions |
| 7 | GitOps, declarative deploy, rollback | Argo CD |
| 8 | Testing, branch protection, ingress, TLS | pytest, nginx, cert-manager |

**Resume line:** *"Built and deployed a URL shortener on AWS with self-managed Kubernetes, full IaC (Terraform), config management (Ansible), CI/CD (GitHub Actions), and GitOps (Argo CD) — code-to-production pipeline with automated rollback."*

---

# Roadmap — Stuck Ho To

```
Phase fail? → us tool ka error padho, kubectl describe / logs, ansible -vvv
Terraform error? → terraform plan dobara, state check
K8s pod CrashLoop? → kubectl logs <pod>, kubectl describe pod <pod>
Argo not syncing? → manifest path sahi? repo public/token?
```

**Sabse bada rule:** ek phase poora karo, commit karo, *phir* agla. Sab ek saath mat karo. Har phase ke baad `git commit` — progress save.

**Mantra:** *Code likho → pack karo → infra banao → cluster banao → deploy karo → automate karo → GitOps karo → polish karo. Har step chalakar, samajh ke, commit karke.*
