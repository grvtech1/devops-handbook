# Self-Managed Kubernetes Demo: Terraform + Ansible + Docker + Kubernetes

**Goal:** Apna khud ka K8s cluster (kubeadm se) AWS EC2 pe khada karo, API + Postgres deploy karo.
**Yahan Ansible ka role ASLI hai** — wahi cluster install karta hai. EKS jaisa AWS-managed shortcut nahi.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ TERRAFORM → infra banata hai (sirf raw machines + network)     │
│   - VPC, subnets, security groups                              │
│   - 3x EC2: 1 master + 2 workers (Kubernetes ke liye)          │
│   - 1x EC2 bastion (optional, control se)                      │
│   - RDS Postgres (stateful, K8s ke bahar)                      │
│   - ECR (Docker registry)                                      │
└───────────────┬────────────────────────────────────────────────┘
                │ (Terraform output: EC2 IPs, RDS endpoint)
                ▼
┌──────────────────────────────────────────────────────────────┐
│ ANSIBLE → in kaccha EC2 ko Kubernetes cluster banata hai        │
│   har node pe:                                                  │
│     - containerd install                                        │
│     - kubeadm, kubelet, kubectl install                         │
│   master pe:                                                    │
│     - kubeadm init  →  control plane khada hua                  │
│     - CNI (Calico) apply  →  pod networking                     │
│   workers pe:                                                   │
│     - kubeadm join <master>  →  cluster mein add                │
└───────────────┬────────────────────────────────────────────────┘
                │ (ab ek working K8s cluster ready hai)
                ▼
┌──────────────────────────────────────────────────────────────┐
│ DOCKER → API ko image mein pack, ECR pe push                   │
│ KUBERNETES (self-managed) → API 3 replicas, RDS se connect      │
└──────────────────────────────────────────────────────────────┘

STATELESS API  → self-managed K8s pods (disposable, scale)
STATEFUL Postgres → RDS managed (data persist, replace nahi)
```

**Interview line:** "Maine EKS use nahi kiya — kubeadm se khud control plane khada kiya. Ansible ne 3 raw EC2 ko cluster banaya: containerd, kubeadm init, CNI, worker join. Isse K8s ke internals (etcd, control plane components, pod networking) clear samajh aaye, sirf managed button nahi dabaya."

---

## Tool mapping (yahan har tool ka role saaf)

| Tool | Role | Kya karta hai exactly |
|------|------|----------------------|
| Terraform | Provision | Raw EC2 + VPC + RDS + ECR. K8s ka "K" nahi chhuता |
| **Ansible** | Configure | **Raw EC2 → working K8s cluster (kubeadm)** ← core |
| Docker | Package | API → OCI image → ECR |
| Kubernetes | Orchestrate | Self-managed cluster pe API run + scale + heal |

---

## Step 0: Local tools

```bash
brew install terraform awscli ansible docker kubectl
aws configure
ssh-keygen -t rsa -f ~/.ssh/k8s-demo   # EC2 access ke liye key
```

---

## Step 1: TERRAFORM — Raw infra (NO K8s yet)

`main.tf`:

```hcl
provider "aws" { region = "ap-south-1" }

variable "db_password" { sensitive = true }

# --- Networking ---
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  tags = { Name = "k8s-demo-vpc" }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  map_public_ip_on_launch = true
  availability_zone       = "ap-south-1a"
}

resource "aws_subnet" "private" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.2.0/24"
  availability_zone = "ap-south-1b"
}

resource "aws_internet_gateway" "igw" { vpc_id = aws_vpc.main.id }

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route { cidr_block = "0.0.0.0/0"  gateway_id = aws_internet_gateway.igw.id }
}
resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

# --- Security group (K8s ports + SSH) ---
resource "aws_security_group" "k8s" {
  name   = "k8s-demo-sg"
  vpc_id = aws_vpc.main.id
  ingress { from_port=22   to_port=22   protocol="tcp" cidr_blocks=["YOUR_IP/32"] }   # SSH
  ingress { from_port=6443 to_port=6443 protocol="tcp" cidr_blocks=["10.0.0.0/16"] }  # API server
  ingress { from_port=0    to_port=0    protocol="-1"  self=true }                    # node-to-node
  ingress { from_port=30000 to_port=32767 protocol="tcp" cidr_blocks=["0.0.0.0/0"] }  # NodePort
  egress  { from_port=0    to_port=0    protocol="-1"  cidr_blocks=["0.0.0.0/0"] }
}

# --- SSH key ---
resource "aws_key_pair" "demo" {
  key_name   = "k8s-demo"
  public_key = file("~/.ssh/k8s-demo.pub")
}

# --- EC2: 1 master + 2 workers ---
resource "aws_instance" "master" {
  ami           = "ami-0f5ee92e2d63afc18"  # Ubuntu 22.04 ap-south-1 (verify latest)
  instance_type = "t3.medium"               # control plane ko 2vCPU min chahiye
  subnet_id     = aws_subnet.public.id
  key_name      = aws_key_pair.demo.key_name
  vpc_security_group_ids = [aws_security_group.k8s.id]
  tags = { Name = "k8s-master", Role = "master" }
}

resource "aws_instance" "worker" {
  count         = 2
  ami           = "ami-0f5ee92e2d63afc18"
  instance_type = "t3.medium"
  subnet_id     = aws_subnet.public.id
  key_name      = aws_key_pair.demo.key_name
  vpc_security_group_ids = [aws_security_group.k8s.id]
  tags = { Name = "k8s-worker-${count.index}", Role = "worker" }
}

# --- RDS Postgres (STATEFUL) ---
resource "aws_db_subnet_group" "db" {
  name       = "demo-db-subnet"
  subnet_ids = [aws_subnet.public.id, aws_subnet.private.id]
}
resource "aws_db_instance" "postgres" {
  identifier          = "demo-postgres"
  engine              = "postgres"
  engine_version      = "16"
  instance_class      = "db.t3.micro"
  allocated_storage   = 20
  db_name             = "appdb"
  username            = "appuser"
  password            = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.db.name
  vpc_security_group_ids = [aws_security_group.k8s.id]
  skip_final_snapshot = true
  publicly_accessible = false
}

# --- ECR ---
resource "aws_ecr_repository" "api" { name = "demo-api" }

# --- Outputs (Ansible/K8s ko chahiye) ---
output "master_ip"   { value = aws_instance.master.public_ip }
output "worker_ips"  { value = aws_instance.worker[*].public_ip }
output "rds_endpoint"{ value = aws_db_instance.postgres.address }
output "ecr_url"     { value = aws_ecr_repository.api.repository_url }
```

```bash
terraform init
terraform apply -var="db_password=SuperSecret123"   # ~5 min (EKS se fast, sirf EC2)
terraform output     # IPs note kar lo
```

---

## Step 2: ANSIBLE — Raw EC2 ko K8s cluster banao (CORE STEP)

`inventory.ini` (Terraform output se IPs bharo):

```ini
[master]
master ansible_host=<MASTER_IP>

[workers]
worker0 ansible_host=<WORKER0_IP>
worker1 ansible_host=<WORKER1_IP>

[all:vars]
ansible_user=ubuntu
ansible_ssh_private_key_file=~/.ssh/k8s-demo
ansible_ssh_common_args='-o StrictHostKeyChecking=no'
```

### Playbook 1: `common.yml` (har node pe — containerd + kubeadm)

```yaml
- name: Install Kubernetes prerequisites on all nodes
  hosts: all
  become: yes
  tasks:
    - name: Disable swap (K8s requirement)
      shell: swapoff -a

    - name: Load kernel modules
      shell: |
        modprobe overlay
        modprobe br_netfilter

    - name: Sysctl for K8s networking
      copy:
        dest: /etc/sysctl.d/k8s.conf
        content: |
          net.bridge.bridge-nf-call-iptables = 1
          net.ipv4.ip_forward = 1
      notify: reload sysctl

    - name: Install containerd
      apt:
        name: containerd
        state: present
        update_cache: yes

    - name: Configure containerd (systemd cgroup)
      shell: |
        mkdir -p /etc/containerd
        containerd config default > /etc/containerd/config.toml
        sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml
      notify: restart containerd

    - name: Add Kubernetes apt repo
      shell: |
        curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.30/deb/Release.key | \
          gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
        echo "deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] \
          https://pkgs.k8s.io/core:/stable:/v1.30/deb/ /" > /etc/apt/sources.list.d/kubernetes.list

    - name: Install kubeadm, kubelet, kubectl
      apt:
        name: [kubelet, kubeadm, kubectl]
        state: present
        update_cache: yes

    - name: Hold versions (auto-upgrade rokо)
      shell: apt-mark hold kubelet kubeadm kubectl

  handlers:
    - name: reload sysctl
      shell: sysctl --system
    - name: restart containerd
      service: { name: containerd, state: restarted }
```

### Playbook 2: `master.yml` (control plane init)

```yaml
- name: Initialize Kubernetes master
  hosts: master
  become: yes
  tasks:
    - name: kubeadm init (control plane khada karo)
      shell: kubeadm init --pod-network-cidr=192.168.0.0/16
      args: { creates: /etc/kubernetes/admin.conf }

    - name: Setup kubeconfig for ubuntu user
      shell: |
        mkdir -p /home/ubuntu/.kube
        cp /etc/kubernetes/admin.conf /home/ubuntu/.kube/config
        chown ubuntu:ubuntu /home/ubuntu/.kube/config

    - name: Apply Calico CNI (pod networking)
      become_user: ubuntu
      shell: kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.27.0/manifests/calico.yaml

    - name: Generate join command for workers
      shell: kubeadm token create --print-join-command
      register: join_cmd

    - name: Save join command locally
      become: no
      local_action: copy content="{{ join_cmd.stdout }}" dest=./join.sh
```

### Playbook 3: `workers.yml` (cluster join)

```yaml
- name: Join workers to cluster
  hosts: workers
  become: yes
  tasks:
    - name: Copy join command
      copy: { src: ./join.sh, dest: /tmp/join.sh }
    - name: Run kubeadm join
      shell: bash /tmp/join.sh
      args: { creates: /etc/kubernetes/kubelet.conf }
```

Run sab:

```bash
ansible-playbook -i inventory.ini common.yml
ansible-playbook -i inventory.ini master.yml
ansible-playbook -i inventory.ini workers.yml

# Verify (master pe SSH karke)
ssh -i ~/.ssh/k8s-demo ubuntu@<MASTER_IP>
kubectl get nodes    # 3 nodes "Ready" dikhne chahiye → CLUSTER READY 🎉
```

---

## Step 3: DOCKER — API package

`app/main.py` aur `Dockerfile` (pichle EKS guide jaisa hi — stateless FastAPI):

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```bash
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin <ECR_URL>
docker build -t demo-api ./app
docker tag demo-api:latest <ECR_URL>:v1
docker push <ECR_URL>:v1
```

**Note (self-managed gotcha):** Nodes ko ECR se pull karne ke liye IAM role chahiye, ya image pull secret. Quick demo ke liye Docker Hub public image easier. Production mein node IAM role.

---

## Step 4: KUBERNETES — Deploy (self-managed cluster pe)

`k8s/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: demo-api }
spec:
  replicas: 3                       # STATELESS → 3 copies
  selector: { matchLabels: { app: demo-api } }
  template:
    metadata: { labels: { app: demo-api } }
    spec:
      containers:
      - name: api
        image: <ECR_URL>:v1
        ports: [{ containerPort: 8000 }]
        env:
        - { name: DB_HOST, value: "<RDS_ENDPOINT>" }
        - name: DB_PASSWORD
          valueFrom: { secretKeyRef: { name: db-secret, key: password } }
---
apiVersion: v1
kind: Service
metadata: { name: demo-api-svc }
spec:
  type: NodePort                    # self-managed mein LoadBalancer nahi (wo AWS-integration), NodePort use karo
  selector: { app: demo-api }
  ports: [{ port: 80, targetPort: 8000, nodePort: 30080 }]
```

⚠️ **Self-managed gotcha:** `type: LoadBalancer` EKS mein auto AWS ELB banata hai. Self-managed mein wo integration nahi (cloud-controller-manager chahiye). Isliye **NodePort** use kiya — `http://<WORKER_IP>:30080` se access. Ye difference interview mein bata sakte ho.

```bash
# master node pe (jahan kubectl configured hai)
kubectl create secret generic db-secret --from-literal=password=SuperSecret123
kubectl apply -f k8s/deployment.yaml
kubectl get pods -o wide      # 3 pods, alag workers pe spread
```

---

## Step 5: Test + Concept prove

```bash
# DB table banao (master se psql, ya pod ke andar se)
PGPASSWORD=SuperSecret123 psql -h <RDS_ENDPOINT> -U appuser -d appdb \
  -c "CREATE TABLE users(id SERIAL PRIMARY KEY, name TEXT); INSERT INTO users(name) VALUES ('alice'),('bob');"

# Access via NodePort
curl http://<WORKER_IP>:30080/users    # {"users":[[1,"alice"],[2,"bob"]]}
```

**Stateless prove:**
```bash
kubectl delete pod <pod-name>     # pod mar gaya
kubectl get pods                  # K8s ne turant naya banaya (self-heal)
curl http://<WORKER_IP>:30080/users   # SAME data → kyunki data RDS mein, pod mein nahi
```

**Scaling prove:**
```bash
kubectl scale deployment demo-api --replicas=6
kubectl get pods -o wide          # 6 pods, 2 workers pe distribute
```

---

## Step 6: CLEANUP (ZAROORI)

```bash
# K8s resources (optional, EC2 destroy se hi sab jayega)
kubectl delete -f k8s/deployment.yaml
# Sab AWS infra
terraform destroy -var="db_password=SuperSecret123"
```

Self-managed mein LoadBalancer/ELB nahi banaya, isliye orphan resource ka risk kam — par RDS aur EC2 confirm karo destroy hue.

---

## EKS vs Self-managed — interview cheat sheet

| | Self-managed (ye demo) | EKS |
|---|---|---|
| Control plane | Tumne kubeadm se banaya | AWS managed |
| Ansible role | **Core** (cluster install) | Minimal |
| LoadBalancer | NodePort (manual) | Auto AWS ELB |
| Seekha kya | K8s internals, kubeadm, CNI, etcd | Managed service usage |
| Setup time | ~20 min (Ansible playbooks) | ~15 min (Terraform) |
| Prod use | Kam (HA/patching mehnat) | Zyada (90%) |

**Strongest interview line:** "Maine deliberately self-managed chuna seekhne ke liye — kubeadm init se control plane, Calico se pod networking, worker join manually Ansible se. Production mein EKS prefer karunga kyunki control plane HA, etcd backup, patching AWS handle karta hai — par internals samajhna zaroori tha taaki managed service ki abstraction blindly use na karun."
