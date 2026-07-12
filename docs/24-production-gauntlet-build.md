# 24 — The Production Gauntlet · Part I: Build the Real System

> **Core question:** You've learned every tool separately — Terraform, Docker, Kubernetes, Argo CD, Prometheus. Can you *combine* them into a system you'd actually bet your SLA on?

> This chapter builds **ShopFast**, a production Orders service, from an empty repo to a hardened, observable, auto-scaling system on AWS. **[Chapter 25](25-production-gauntlet-chaos.md) will then deliberately break it** — chaos engineering, failure injection, runbook validation. Build it right here so you can break it confidently there. Every design choice below is a future chaos target.

---

> **⏱️ Time:** 4–6 hours (build as you read) · **🎚️ Level: Advanced** · **📋 Pehle chahiye:** [M1](02-M1-terraform.md) · [M2](03-M2-ansible.md) · [M3](04-M3-docker.md) · [M4](05-M4-kubernetes-core.md) · [M5](06-M5-sizing-and-cost.md) · [M6](07-M6-cicd.md) · [M7](08-M7-gitops.md) · [M8](10-M8-observability-sre.md) · [M9](11-M9-advanced-k8s-internals.md) · [ch19](19-cicd-hands-on-flow.md)

**Is chapter ke baad tum kar paoge:**

1. Take an empty AWS account → fully wired production system, following every phase in order.
2. Explain to any interviewer *why* each architectural decision was made — cost, blast-radius, SLA.
3. Hand off to ch25 with a precise map of every failure surface you built in.

**Why this builds confidence:** Most engineers have touched *pieces* of this stack. The gap between piece-level knowledge and production-level confidence is exactly this chapter — the *wiring*, the *ordering*, and the *gotchas nobody writes down*.

---

## The system we're building

**ShopFast — Orders service.** A realistic e-commerce backend with two services, a relational database, a cache/queue layer, and a hard dependency on an external Payments API. Everything chaos-rich by design.

```mermaid
flowchart LR
    subgraph GH ["GitHub"]
        APPREPO["app-repo<br/>source + Dockerfile"]:::ci
        CFGREPO["config-repo<br/>k8s manifests"]:::cd
    end

    GHACT["GitHub Actions<br/>CI Pipeline"]:::ci
    ARGO["Argo CD<br/>GitOps Controller"]:::cd

    subgraph AWS ["AWS us-east-1"]
        ECR["ECR<br/>Image Registry"]:::infra
        SM["Secrets Manager<br/>DB creds · API keys"]:::infra

        subgraph VPC ["VPC 10.0.0.0/16"]
            IGW["Internet Gateway"]:::net
            NAT["NAT Gateway<br/>2 AZs"]:::net

            subgraph PUBSUB ["Public Subnets · 2 AZs"]
                INGRESS["NLB + ingress-nginx<br/>HTTPS · cert-manager"]:::net
            end

            subgraph PRVSUB ["Private Subnets · 2 AZs"]
                subgraph EKSNG ["EKS Node Groups · t3.medium"]
                    ORDAPI["orders-api<br/>HPA 2-10 replicas"]:::run
                    ORDWRK["order-worker<br/>HPA 1-5 replicas"]:::run
                    PROM["kube-prometheus-stack<br/>+ Loki"]:::obs
                end
                RDS["RDS Postgres 15<br/>Multi-AZ · db.t3.medium"]:::store
                REDIS["ElastiCache Redis 7<br/>cache + lightweight queue"]:::store
            end
        end
    end

    PAY["Payments API<br/>3rd-party · external"]:::infra

    APPREPO --> GHACT
    GHACT --> ECR
    GHACT --> CFGREPO
    CFGREPO --> ARGO
    ARGO --> EKSNG
    IGW --> INGRESS
    NAT --> IGW
    INGRESS --> ORDAPI
    ORDAPI --> RDS
    ORDAPI --> REDIS
    ORDAPI --> PAY
    ORDWRK --> REDIS
    ORDWRK --> RDS
    SM --> ORDAPI
    SM --> ORDWRK
    EKSNG --> PROM

    classDef infra fill:#fce4ec,stroke:#d81b60,color:#880e4f;
    classDef ci fill:#e3f2fd,stroke:#1976d2,color:#0d47a1;
    classDef run fill:#e0f2f1,stroke:#00897b,color:#004d40;
    classDef store fill:#fff3e0,stroke:#ef6c00,color:#e65100;
    classDef cd fill:#f3e5f5,stroke:#8e24aa,color:#4a148c;
    classDef obs fill:#f1f8e9,stroke:#689f38,color:#33691e;
    classDef net fill:#ede7f6,stroke:#5e35b1,color:#311b92;
```

### Component table

| Component | Role | Stateful? | Scales how | Fails how (ch25 target) |
|---|---|---|---|---|
| `orders-api` | Stateless REST, creates/reads orders | No | HPA on CPU + RPS | Pod crash, OOM, slow responses |
| `order-worker` | Consumes Redis queue, sends confirmations | No | HPA on queue depth | Poison-pill message, consumer crash |
| RDS Postgres Multi-AZ | Source of truth for orders | **Yes** | Vertical (read replicas possible) | Primary AZ failure → auto-failover |
| ElastiCache Redis | Order cache + worker queue | Soft | Cluster mode | Cache flush, network partition |
| ingress-nginx | HTTPS front door, TLS termination | No | Replicas + NLB | Misconfig, cert expiry |
| cert-manager | Auto-renews Let's Encrypt TLS certs | No | Single controller | ACME challenge failure |
| Argo CD | GitOps reconciler | No (reads Git) | Scales via shards | Out-of-sync, config drift |
| kube-prometheus + Loki | Metrics + logs | Soft (PVC) | Retention-based | Scrape failure, disk full |
| External Secrets Operator | Syncs AWS Secrets Manager → k8s Secrets | No | Single controller | IAM role misconfigured |
| Payments API (external) | 3rd-party payment processing | External | Vendor-managed | Timeout, 5xx, cert error |

---

## Definition of "production-ready"

Before writing a single file, agree on what *done* means. This checklist drives the entire chapter.

| # | Requirement | Demo has it? | Prod needs it? |
|---|---|---|---|
| 1 | All infrastructure as code (Terraform) | Rarely | **Yes** |
| 2 | GitOps — no `kubectl apply` by hand in prod | No | **Yes** |
| 3 | HTTPS everywhere (auto-renewing TLS) | No | **Yes** |
| 4 | Secrets from a secret manager, never in Git | No | **Yes** |
| 5 | HPA — autoscaling on real signals | Rarely | **Yes** |
| 6 | PodDisruptionBudget — safe node drains | No | **Yes** |
| 7 | Readiness + liveness + startup probes | No | **Yes** |
| 8 | CPU/memory requests and limits set | No | **Yes** |
| 9 | NetworkPolicy — default-deny, least-privilege | No | **Yes** |
| 10 | Non-root container, read-only root FS | No | **Yes** |
| 11 | Multi-AZ — no single-AZ data store | No | **Yes** |
| 12 | Automated DB backups + tested restore path | No | **Yes** |
| 13 | Dashboards + alerts for RED/USE signals | No | **Yes** |
| 14 | Runbook linked from every alert | No | **Yes** |
| 15 | One-command rollback path | Rarely | **Yes** |

We will tick every box. The final section maps each tick to where we did it.

---

## Phase 1 — Repos and the app

### Repo layout

Two-repo GitOps pattern — see [M7](08-M7-gitops.md) for the why:

```
shopfast-app/          ← developers own this
  cmd/orders-api/
  cmd/order-worker/
  internal/
  Dockerfile
  docker-compose.yml
  .dockerignore
  .github/workflows/ci.yml

shopfast-config/       ← platform team owns this; Argo CD watches this
  base/
    orders-api/
      deployment.yaml
      service.yaml
      hpa.yaml
      pdb.yaml
      networkpolicy.yaml
      externalsecret.yaml
    order-worker/
      deployment.yaml
      hpa.yaml
  overlays/
    dev/
    staging/
    prod/
  argocd/
    app-orders-api.yaml
    app-order-worker.yaml
    appset-shopfast.yaml
```

!!! tip "Why two repos?"
    If CI writes the config commit and Argo CD reads it, a single repo creates a circular trigger loop in most CI systems. Two repos also enforce the security boundary: CI has write access to `shopfast-config`; it never holds cluster credentials.

### The production Dockerfile

Multi-stage, distroless final image, non-root user. Cross-link: [M3 Docker](04-M3-docker.md).

```dockerfile
# ─── Stage 1: build ───────────────────────────────────────────────────────────
# Use the full SDK image only in this stage — it never ships
FROM golang:1.22-alpine AS builder

WORKDIR /src
# Copy dependency manifests first — layer-cache hit when source changes but deps don't
COPY go.mod go.sum ./
RUN go mod download

COPY . .
# CGO_ENABLED=0  → fully static binary (no libc dependency in distroless)
# -trimpath      → removes absolute build paths from binary (reproducibility)
# -ldflags="-s -w" → strip debug symbols → ~30% smaller binary
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" \
    -o /out/orders-api ./cmd/orders-api

# ─── Stage 2: final ───────────────────────────────────────────────────────────
# gcr.io/distroless/static: no shell, no package manager, ~2 MB total
# This is the attack-surface reduction that security scanners reward
FROM gcr.io/distroless/static:nonroot

# nonroot tag means USER 65532 is already set — no need for USER directive
# But make it explicit for scanners that check the Dockerfile
USER 65532:65532

COPY --from=builder /out/orders-api /orders-api

# HEALTHCHECK is optional on k8s (probes do it), but useful for docker-compose + local dev
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD ["/orders-api", "-health-check"]

EXPOSE 8080
ENTRYPOINT ["/orders-api"]
```

**Gotchas most people miss:**

- `distroless/static:nonroot` sets UID 65532 — your `securityContext.runAsUser: 65532` in the Deployment must match, or the pod will `CreateContainerError`.
- Without `CGO_ENABLED=0`, the binary links against `libc`. Distroless has no `libc`, so the container crashes with `exec format error` or a missing-library error. No shell = no helpful error message.
- `go mod download` as a *separate layer* before `COPY .` means any source change doesn't re-download dependencies. On a monorepo this saves 2–4 minutes per CI run.

### .dockerignore (never skip this)

```
.git
.github
**/*_test.go
vendor/
*.md
docker-compose*.yml
```

Omitting `.git` in `.dockerignore` sends the entire Git history to the Docker build context — adding 50–200 MB and leaking commit history into the build cache.

### Local docker-compose (validate before cloud)

Run the full stack locally before touching AWS. Catch integration bugs cheap.

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: orders
      POSTGRES_USER: app
      POSTGRES_PASSWORD: localpass
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 5s
      timeout: 3s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  orders-api:
    build: .
    ports:
      - "8080:8080"
    environment:
      DATABASE_URL: postgres://app:localpass@postgres:5432/orders?sslmode=disable
      REDIS_ADDR: redis:6379
      PAYMENTS_API_URL: http://payments-mock:3000
      LOG_LEVEL: debug
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started

  order-worker:
    build:
      context: .
      dockerfile: Dockerfile.worker
    environment:
      DATABASE_URL: postgres://app:localpass@postgres:5432/orders?sslmode=disable
      REDIS_ADDR: redis:6379
    depends_on:
      - redis
      - postgres

  payments-mock:
    image: mockserver/mockserver:latest
    ports:
      - "3000:1080"
```

> 🇮🇳 **Hinglish intuition:** Local compose ek "rehearsal" hai before the real performance. Cloud pe jaake pata chale ki DB connection string galat thi — yeh bahut costly mistake hai. Compose pe 5 minute mein pata chal jaata hai.

---

## Phase 2 — CI pipeline

The job: test → lint → build → scan → push → update config repo. Cross-link: [M6 CI/CD](07-M6-cicd.md) · [ch19](19-cicd-hands-on-flow.md).

```mermaid
flowchart LR
    PUSH["git push<br/>app-repo main"]:::ci
    TEST["Unit tests<br/>go test ./..."]:::ci
    LINT["golangci-lint<br/>static analysis"]:::ci
    BUILD["docker build<br/>multi-stage"]:::ci
    SCAN["Trivy scan<br/>fail on HIGH · CRIT"]:::ci
    PUSH2["docker push<br/>ECR :sha-abc1234"]:::ci
    BUMP["git commit<br/>config-repo image tag"]:::cd
    ARGODET["Argo CD detects<br/>config-repo diff"]:::cd
    SYNC["Argo syncs<br/>rolling update"]:::cd

    PUSH --> TEST --> LINT --> BUILD --> SCAN --> PUSH2 --> BUMP --> ARGODET --> SYNC

    classDef ci fill:#e3f2fd,stroke:#1976d2,color:#0d47a1;
    classDef cd fill:#f3e5f5,stroke:#8e24aa,color:#4a148c;
```

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  id-token: write   # required for OIDC → AWS (no static keys)
  contents: read

env:
  AWS_REGION: us-east-1
  ECR_REPO: 123456789.dkr.ecr.us-east-1.amazonaws.com/shopfast/orders-api

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Go
        uses: actions/setup-go@v5
        with:
          go-version: "1.22"
          cache: true

      - name: Test
        run: go test -race -coverprofile=coverage.out ./...

      - name: Lint
        uses: golangci/golangci-lint-action@v6
        with:
          version: latest

      - name: Configure AWS credentials (OIDC — no static keys)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789:role/github-actions-shopfast
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to ECR
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build image
        run: |
          IMAGE_TAG=${{ github.sha }}
          docker build -t $ECR_REPO:$IMAGE_TAG -t $ECR_REPO:latest .
          echo "IMAGE_TAG=$IMAGE_TAG" >> $GITHUB_ENV

      - name: Trivy vulnerability scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ env.ECR_REPO }}:${{ env.IMAGE_TAG }}
          format: table
          exit-code: "1"           # ← FAIL the build on HIGH or CRITICAL
          severity: HIGH,CRITICAL
          ignore-unfixed: true     # don't fail on CVEs with no fix yet

      - name: Push to ECR
        run: docker push $ECR_REPO:${{ env.IMAGE_TAG }}

      - name: Bump image tag in config repo (GitOps handoff)
        env:
          GITHUB_TOKEN: ${{ secrets.CONFIG_REPO_PAT }}
        run: |
          git clone https://x-access-token:$GITHUB_TOKEN@github.com/myorg/shopfast-config.git
          cd shopfast-config
          # Use kustomize edit to update the image tag atomically
          cd overlays/prod
          kustomize edit set image orders-api=$ECR_REPO:${{ env.IMAGE_TAG }}
          git config user.email "ci@shopfast.io"
          git config user.name "ShopFast CI"
          git commit -am "ci: bump orders-api to ${{ github.sha }}"
          git push
```

!!! warning "The OIDC gotcha"
    The GitHub Actions OIDC role trust policy must include `"token.actions.githubusercontent.com:sub": "repo:myorg/shopfast-app:ref:refs/heads/main"`. Omitting the `ref` condition means *any* branch can assume the role — a significant privilege escalation risk.

!!! tip "Trivy `ignore-unfixed: true`"
    Without this flag, Trivy fails on CVEs that have no available patch — you can't fix what hasn't been released. This flag removes noise; you still catch everything actionable.

---

## Phase 3 — Infrastructure (Terraform)

All cloud infrastructure is code. Cross-link: [M1 Terraform](02-M1-terraform.md) · [M5 Sizing & Cost](06-M5-sizing-and-cost.md).

```mermaid
flowchart TD
    TF["terraform apply"]:::ci

    subgraph TFMODS ["Terraform Modules"]
        VPCmod["module: vpc<br/>subnets · IGW · NAT · routes"]:::net
        EKSmod["module: eks<br/>control plane · node groups · IRSA"]:::run
        RDSmod["module: rds<br/>Postgres Multi-AZ · SGs · subnet group"]:::store
        REDISmod["module: elasticache<br/>Redis cluster · SGs"]:::store
        IAMmod["module: iam<br/>IRSA roles · ECR policy · SM policy"]:::infra
        S3DYN["remote state<br/>S3 + DynamoDB lock"]:::infra
    end

    TF --> VPCmod
    TF --> S3DYN
    VPCmod --> EKSmod
    VPCmod --> RDSmod
    VPCmod --> REDISmod
    EKSmod --> IAMmod

    classDef ci fill:#e3f2fd,stroke:#1976d2,color:#0d47a1;
    classDef run fill:#e0f2f1,stroke:#00897b,color:#004d40;
    classDef store fill:#fff3e0,stroke:#ef6c00,color:#e65100;
    classDef infra fill:#fce4ec,stroke:#d81b60,color:#880e4f;
    classDef net fill:#ede7f6,stroke:#5e35b1,color:#311b92;
```

### Remote state — bootstrap first

```hcl
# terraform/backend.tf — create the S3 bucket and DynamoDB table BEFORE init
terraform {
  backend "s3" {
    bucket         = "shopfast-tfstate-prod"
    key            = "shopfast/prod/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "shopfast-tfstate-lock"  # prevents concurrent applies
    encrypt        = true
  }
}
```

### VPC

```hcl
# terraform/modules/vpc/main.tf (key blocks)
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "shopfast-prod"
  cidr = "10.0.0.0/16"

  azs             = ["us-east-1a", "us-east-1b"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24"]   # EKS nodes, RDS, ElastiCache
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24"] # NLB, NAT GW

  enable_nat_gateway     = true
  single_nat_gateway     = false   # one NAT per AZ → eliminates cross-AZ NAT failure
  enable_dns_hostnames   = true    # required for EKS and RDS endpoint resolution

  # Required tags for EKS to discover subnets for load balancers
  public_subnet_tags = {
    "kubernetes.io/role/elb" = "1"
  }
  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = "1"
  }
}
```

!!! warning "Subnet tags are not optional"
    EKS uses these tags to auto-discover which subnets to place load balancers in. Missing them is one of the top "my NLB isn't creating" issues in production.

### EKS

```hcl
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = "shopfast-prod"
  cluster_version = "1.30"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets  # nodes in private subnets only

  cluster_endpoint_public_access = true   # allow kubectl from your IP
  # In hardened prod: set cluster_endpoint_public_access_cidrs to your office/VPN CIDRs

  eks_managed_node_groups = {
    general = {
      instance_types = ["t3.medium"]
      min_size       = 2
      max_size       = 6
      desired_size   = 3

      # Spread across AZs automatically via the subnet_ids above
    }
  }

  # Enable IRSA (IAM Roles for Service Accounts) — no node-level IAM credentials
  enable_irsa = true
}
```

!!! tip "kubeadm alternative (one line)"
    If you're not on AWS or want full control: `kubeadm init --pod-network-cidr=10.244.0.0/16` bootstraps the control plane; add nodes with `kubeadm join`. EKS is preferred in production because AWS manages etcd, control-plane upgrades, and multi-AZ API server HA.

### RDS Postgres Multi-AZ

```hcl
resource "aws_db_instance" "orders" {
  identifier        = "shopfast-orders-prod"
  engine            = "postgres"
  engine_version    = "15.4"
  instance_class    = "db.t3.medium"
  allocated_storage = 50
  storage_encrypted = true  # always

  db_name  = "orders"
  username = "dbadmin"
  # Password comes from AWS Secrets Manager — see lifecycle block below

  multi_az               = true   # automatic standby in second AZ
  db_subnet_group_name   = aws_db_subnet_group.orders.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  backup_retention_period = 14    # 14 days of automated backups + PITR
  deletion_protection     = true  # prevents accidental `terraform destroy`

  lifecycle {
    prevent_destroy = true        # belt AND suspenders — Terraform blocks destroy too
  }
}

# Security group: only allow traffic from EKS node SG on port 5432
resource "aws_security_group_rule" "rds_from_eks" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = module.eks.node_security_group_id
  security_group_id        = aws_security_group.rds.id
}
```

!!! danger "RDS must be in private subnets"
    The DB subnet group should reference only *private* subnets. Public-subnet RDS with `publicly_accessible = true` is a critical misconfiguration — seen in real-world breaches.

### ElastiCache Redis

```hcl
resource "aws_elasticache_replication_group" "orders" {
  replication_group_id = "shopfast-redis-prod"
  description          = "Orders cache and worker queue"

  node_type            = "cache.t3.micro"
  num_cache_clusters   = 2          # primary + replica for failover
  automatic_failover_enabled = true # promote replica if primary fails

  subnet_group_name    = aws_elasticache_subnet_group.orders.name
  security_group_ids   = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
}
```

### IRSA — service accounts with IAM roles, no node credentials

```hcl
# The orders-api pod gets a role that can read from Secrets Manager
module "orders_api_irsa" {
  source    = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  role_name = "shopfast-orders-api"

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["shopfast:orders-api"]  # namespace:serviceaccount
    }
  }

  role_policy_arns = {
    secrets = aws_iam_policy.read_orders_secrets.arn
  }
}
```

!!! warning "IRSA namespace:serviceaccount must match exactly"
    The string `"shopfast:orders-api"` encodes the *Kubernetes namespace* and *ServiceAccount name*. If your pod's `serviceAccountName` or namespace doesn't match, the token will not be accepted by AWS STS and your pod will get `AccessDenied` — with no obvious k8s error.

---

## Phase 4 — Cluster addons

Install in this order — each addon depends on the previous.

### 1. metrics-server (prerequisite for HPA)

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
# Verify: kubectl top nodes  (should return values within ~60s)
```

### 2. ingress-nginx

```bash
helm upgrade --install ingress-nginx ingress-nginx \
  --repo https://kubernetes.github.io/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --set controller.service.type=LoadBalancer \
  --set controller.metrics.enabled=true \
  --set controller.podAnnotations."prometheus\.io/scrape"=true
```

**Gotcha:** On EKS, the NLB provisions asynchronously. `kubectl get svc -n ingress-nginx` shows `<pending>` for 60–90 seconds. `describe` the service and look for the AWS LB provisioning event before you conclude something is wrong.

### 3. cert-manager + ClusterIssuer

```bash
helm upgrade --install cert-manager cert-manager \
  --repo https://charts.jetstack.io \
  --namespace cert-manager --create-namespace \
  --set installCRDs=true
```

```yaml
# cluster-issuer-prod.yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: platform@shopfast.io
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
```

**Gotcha:** Use `letsencrypt-staging` first. Let's Encrypt production has a rate limit of 5 duplicate certificates per week. Hitting the rate limit means your domain is blocked for 7 days — test with staging, switch to prod once you confirm the ACME flow works.

### 4. External Secrets Operator

```bash
helm upgrade --install external-secrets external-secrets \
  --repo https://charts.external-secrets.io \
  --namespace external-secrets --create-namespace
```

**Gotcha:** The operator needs a `SecretStore` or `ClusterSecretStore` CRD instance that points to AWS Secrets Manager. Create it *after* the IRSA role is applied — the store's service account must already have the IAM role annotation.

### 5. Argo CD

```bash
kubectl create namespace argocd
kubectl apply -n argocd \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
# Expose UI (dev only — use ingress in prod)
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

**Gotcha:** Change the default `admin` password immediately: `argocd account update-password`. In production, disable the `admin` account and use SSO (GitHub/Google OAuth via Dex).

### 6. kube-prometheus-stack + Loki

```bash
helm upgrade --install kube-prometheus-stack kube-prometheus-stack \
  --repo https://prometheus-community.github.io/helm-charts \
  --namespace monitoring --create-namespace \
  --set grafana.adminPassword=changeme \
  --set prometheus.prometheusSpec.retention=15d

helm upgrade --install loki loki-stack \
  --repo https://grafana.github.io/helm-charts \
  --namespace monitoring \
  --set loki.enabled=true \
  --set promtail.enabled=true
```

**Gotcha:** `kube-prometheus-stack` installs PersistentVolumeClaims for Prometheus and Grafana. Make sure your EKS cluster has a `StorageClass` set as default (EBS CSI driver). Without it, PVCs stay `Pending` indefinitely and Prometheus never starts.

---

## Phase 5 — The Kubernetes manifests

The most important phase. Every field is a deliberate production choice. Cross-link: [M4 K8s Core](05-M4-kubernetes-core.md) · [M9 Advanced K8s](11-M9-advanced-k8s-internals.md).

### Deployment — orders-api

```yaml
# base/orders-api/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orders-api
  namespace: shopfast
  labels:
    app: orders-api
    version: "1.0.0"
spec:
  replicas: 2                 # minimum — HPA takes over from here
  selector:
    matchLabels:
      app: orders-api
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1             # one extra pod during rollout
      maxUnavailable: 0       # never reduce below desired — zero-downtime deploy
  template:
    metadata:
      labels:
        app: orders-api
      annotations:
        # Prometheus auto-discovery
        prometheus.io/scrape: "true"
        prometheus.io/port: "9090"
        prometheus.io/path: "/metrics"
    spec:
      # ── Identity ──────────────────────────────────────────────────────────
      serviceAccountName: orders-api   # bound to IRSA role via annotation
      automountServiceAccountToken: true

      # ── Scheduling ────────────────────────────────────────────────────────
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: topology.kubernetes.io/zone
          whenUnsatisfiable: DoNotSchedule   # hard constraint — always spread AZs
          labelSelector:
            matchLabels:
              app: orders-api
        - maxSkew: 1
          topologyKey: kubernetes.io/hostname
          whenUnsatisfiable: ScheduleAnyway  # soft constraint — prefer different nodes

      # ── Security: pod level ───────────────────────────────────────────────
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532         # must match distroless:nonroot UID
        runAsGroup: 65532
        fsGroup: 65532
        seccompProfile:
          type: RuntimeDefault   # apply the container runtime's default seccomp policy

      # ── Graceful drain ────────────────────────────────────────────────────
      terminationGracePeriodSeconds: 30  # match preStop sleep + in-flight request time

      containers:
        - name: orders-api
          image: 123456789.dkr.ecr.us-east-1.amazonaws.com/shopfast/orders-api:latest
          # ── Security: container level ──────────────────────────────────
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true     # container cannot write to its own FS
            runAsNonRoot: true
            capabilities:
              drop: ["ALL"]                  # drop every Linux capability

          ports:
            - name: http
              containerPort: 8080
            - name: metrics
              containerPort: 9090

          # ── Environment from ConfigMap (non-sensitive) ──────────────────
          envFrom:
            - configMapRef:
                name: orders-api-config

          # ── Environment from Secret (sensitive, via ExternalSecret) ────
          env:
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: orders-api-secrets   # created by ExternalSecret
                  key: db-password
            - name: PAYMENTS_API_KEY
              valueFrom:
                secretKeyRef:
                  name: orders-api-secrets
                  key: payments-api-key

          # ── Resource requests and limits ────────────────────────────────
          resources:
            requests:
              cpu: "100m"        # scheduler uses this for placement
              memory: "128Mi"
            limits:
              cpu: "500m"        # cap CPU to prevent noisy-neighbour
              memory: "256Mi"    # OOMKilled if exceeded — set conservatively

          # ── Probes ──────────────────────────────────────────────────────
          # startupProbe: give the app time to warm up before liveness kicks in
          # Without this, a slow-starting app will be killed in a restart loop
          startupProbe:
            httpGet:
              path: /healthz
              port: 8080
            failureThreshold: 30   # 30 * 2s = 60s startup window
            periodSeconds: 2

          # readinessProbe: controls whether this pod receives traffic
          # Fail readiness when DB or Redis is unreachable — don't send user traffic
          readinessProbe:
            httpGet:
              path: /ready
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 5
            failureThreshold: 3
            successThreshold: 1

          # livenessProbe: kills and restarts the pod if it deadlocks
          # Use a lighter check than readiness — just "am I alive"
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 15
            periodSeconds: 10
            failureThreshold: 3

          # ── Graceful shutdown ─────────────────────────────────────────
          lifecycle:
            preStop:
              exec:
                command: ["/bin/sh", "-c", "sleep 5"]
          # Sleep 5s before SIGTERM: gives the load balancer time to deregister
          # this pod from its target group. Without this, requests arrive after
          # the process starts shutting down → connection-refused errors.

          # ── Writable tmp volume ───────────────────────────────────────
          # readOnlyRootFilesystem=true means /tmp is also read-only
          # Mount an emptyDir for anything the app needs to write
          volumeMounts:
            - name: tmp
              mountPath: /tmp

      volumes:
        - name: tmp
          emptyDir: {}
```

> 🇮🇳 **Hinglish intuition:** `readOnlyRootFilesystem: true` matlab container apne hi ghar mein kuch likh nahi sakta. Agar koi attacker andar aa bhi jaaye, toh persistence ke liye kuch store nahi kar sakta. Par app ko tmp folder chahiye, isliye `emptyDir` mount karte hain.

### ConfigMap

```yaml
# base/orders-api/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: orders-api-config
  namespace: shopfast
data:
  LOG_LEVEL: "info"
  PAYMENTS_API_URL: "https://api.payments-provider.com/v2"
  REDIS_ADDR: "shopfast-redis-prod.xxxxxx.ng.0001.use1.cache.amazonaws.com:6379"
  DB_HOST: "shopfast-orders-prod.xxxxxx.us-east-1.rds.amazonaws.com"
  DB_PORT: "5432"
  DB_NAME: "orders"
  DB_USER: "dbadmin"
```

### ExternalSecret — bridge from AWS Secrets Manager to k8s Secret

```yaml
# base/orders-api/externalsecret.yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: orders-api-secrets
  namespace: shopfast
spec:
  refreshInterval: 1h           # re-sync from Secrets Manager every hour
  secretStoreRef:
    name: aws-secretsmanager
    kind: ClusterSecretStore
  target:
    name: orders-api-secrets    # name of the k8s Secret to create/update
    creationPolicy: Owner
  data:
    - secretKey: db-password
      remoteRef:
        key: shopfast/prod/orders-api   # path in AWS Secrets Manager
        property: db_password
    - secretKey: payments-api-key
      remoteRef:
        key: shopfast/prod/orders-api
        property: payments_api_key
```

### Service

```yaml
# base/orders-api/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: orders-api
  namespace: shopfast
spec:
  selector:
    app: orders-api
  ports:
    - name: http
      port: 80
      targetPort: 8080
    - name: metrics
      port: 9090
      targetPort: 9090
  type: ClusterIP   # never NodePort or LoadBalancer — ingress handles external access
```

### Ingress with TLS

```yaml
# base/orders-api/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: orders-api
  namespace: shopfast
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/proxy-body-size: "1m"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "30"   # match app timeout
    nginx.ingress.kubernetes.io/proxy-send-timeout: "30"
spec:
  tls:
    - hosts:
        - api.shopfast.io
      secretName: orders-api-tls   # cert-manager creates and rotates this Secret
  rules:
    - host: api.shopfast.io
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: orders-api
                port:
                  name: http
```

### HPA — autoscale on CPU and custom metric

```yaml
# base/orders-api/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: orders-api
  namespace: shopfast
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: orders-api
  minReplicas: 2    # never below 2 — single replica = SPOF
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60   # scale up before saturation at 60% avg CPU
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 75
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300   # wait 5 min before scaling down — avoid flapping
      policies:
        - type: Pods
          value: 1
          periodSeconds: 60             # remove at most 1 pod per minute on scale-down
    scaleUp:
      stabilizationWindowSeconds: 0    # scale up immediately — don't wait under load
```

### PodDisruptionBudget

```yaml
# base/orders-api/pdb.yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: orders-api
  namespace: shopfast
spec:
  selector:
    matchLabels:
      app: orders-api
  minAvailable: 1   # at least 1 pod must stay running during node drain/upgrade
  # Alternative: maxUnavailable: 1  (allows 1 to be evicted at a time)
```

!!! warning "PDB without enough replicas blocks node drains forever"
    If `minAvailable: 2` and you only have 2 replicas, a `kubectl drain` will block indefinitely because it can never evict a pod without violating the PDB. Use `minAvailable: 1` or `maxUnavailable: 1` as the safe default for a 2-replica service.

### NetworkPolicy — default-deny, then allow exactly what's needed

```yaml
# base/orders-api/networkpolicy.yaml
# Step 1: deny all ingress and egress for the shopfast namespace
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: shopfast
spec:
  podSelector: {}      # applies to ALL pods in the namespace
  policyTypes:
    - Ingress
    - Egress
---
# Step 2: allow ingress-nginx → orders-api on port 8080
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-ingress-to-orders-api
  namespace: shopfast
spec:
  podSelector:
    matchLabels:
      app: orders-api
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: ingress-nginx
      ports:
        - protocol: TCP
          port: 8080
---
# Step 3: allow orders-api egress to RDS (5432), Redis (6379), payments HTTPS (443)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: orders-api-egress
  namespace: shopfast
spec:
  podSelector:
    matchLabels:
      app: orders-api
  policyTypes:
    - Egress
  egress:
    - ports:
        - protocol: TCP
          port: 5432
        - protocol: TCP
          port: 6379
        - protocol: TCP
          port: 443   # payments API + AWS APIs (Secrets Manager, ECR)
        - protocol: UDP
          port: 53    # DNS — always allow, or nothing resolves
---
# Step 4: allow Prometheus to scrape metrics port
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-prometheus-scrape
  namespace: shopfast
spec:
  podSelector:
    matchLabels:
      app: orders-api
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: monitoring
      ports:
        - protocol: TCP
          port: 9090
```

> 🇮🇳 **Hinglish intuition:** NetworkPolicy ek building ke security guards hain. Pehle poori building lock karo (`default-deny`). Phir specific log ko specific darwaze kholo. Agar pehle se doors khuli hain aur baad mein lock karo — toh kuch miss ho sakta hai.

---

## Phase 6 — GitOps wiring

Argo CD reads `shopfast-config` repo and reconciles the cluster state. Cross-link: [M7 GitOps](08-M7-gitops.md).

### Request path: code change → user

```mermaid
flowchart LR
    DEV["Developer<br/>git push"]:::ci
    GHAACT["GitHub Actions<br/>build + scan + push"]:::ci
    CFGREPO2["config-repo<br/>image tag updated"]:::cd
    ARGOCD["Argo CD<br/>detects diff"]:::cd
    ROLL["Rolling update<br/>zero-downtime"]:::run
    PROBE["Readiness probe<br/>gate"]:::run
    USER["User<br/>hits new code"]:::run

    DEV --> GHAACT --> CFGREPO2 --> ARGOCD --> ROLL --> PROBE --> USER

    classDef ci fill:#e3f2fd,stroke:#1976d2,color:#0d47a1;
    classDef cd fill:#f3e5f5,stroke:#8e24aa,color:#4a148c;
    classDef run fill:#e0f2f1,stroke:#00897b,color:#004d40;
```

### Argo CD Application

```yaml
# argocd/app-orders-api.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: orders-api-prod
  namespace: argocd
spec:
  project: shopfast
  source:
    repoURL: https://github.com/myorg/shopfast-config.git
    targetRevision: HEAD
    path: overlays/prod/orders-api
  destination:
    server: https://kubernetes.default.svc
    namespace: shopfast
  syncPolicy:
    automated:
      prune: true          # remove resources deleted from Git
      selfHeal: true       # revert manual kubectl changes
    syncOptions:
      - CreateNamespace=true
      - PrunePropagationPolicy=foreground
    retry:
      limit: 5
      backoff:
        duration: 5s
        maxDuration: 3m
        factor: 2
```

### ApplicationSet — one definition, three environments

```yaml
# argocd/appset-shopfast.yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: shopfast
  namespace: argocd
spec:
  generators:
    - list:
        elements:
          - env: dev
            autoSync: "true"
            cluster: https://kubernetes.default.svc
          - env: staging
            autoSync: "true"
            cluster: https://kubernetes.default.svc
          - env: prod
            autoSync: "false"   # prod requires manual sync approval
            cluster: https://kubernetes.default.svc
  template:
    metadata:
      name: "shopfast-orders-api-{{env}}"
    spec:
      project: shopfast
      source:
        repoURL: https://github.com/myorg/shopfast-config.git
        targetRevision: HEAD
        path: "overlays/{{env}}/orders-api"
      destination:
        server: "{{cluster}}"
        namespace: "shopfast-{{env}}"
      syncPolicy:
        automated:
          prune: true
          selfHeal: "{{autoSync}}"
```

!!! tip "Promotion by image tag"
    Dev auto-deploys on every merge. Staging auto-deploys when dev is green. Prod requires a `git tag v1.2.3` + manual Argo CD sync. The `kustomize edit set image` in CI updates the overlay for the target environment, so promotion is just a Git operation.

---

## Phase 7 — Observability and alerting

Cross-link: [M8 Observability & SRE](10-M8-observability-sre.md).

### ServiceMonitor — tell Prometheus to scrape orders-api

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: orders-api
  namespace: monitoring   # kube-prometheus-stack watches this namespace
  labels:
    release: kube-prometheus-stack   # must match the Prometheus selector label
spec:
  namespaceSelector:
    matchNames:
      - shopfast
  selector:
    matchLabels:
      app: orders-api
  endpoints:
    - port: metrics
      path: /metrics
      interval: 15s
```

### RED metrics — Grafana dashboard queries

| Signal | PromQL query | Alert threshold |
|---|---|---|
| Request rate (RPS) | `rate(http_requests_total{job="orders-api"}[2m])` | — (informational) |
| Error rate (5xx %) | `rate(http_requests_total{job="orders-api",code=~"5.."}[2m]) / rate(http_requests_total{job="orders-api"}[2m])` | `> 0.01` (1%) for 5 min |
| P99 latency | `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{job="orders-api"}[2m]))` | `> 1.0s` for 5 min |
| Pod restart rate | `increase(kube_pod_container_status_restarts_total{namespace="shopfast"}[1h])` | `> 5` in 1h |
| RDS CPU | `aws_rds_cpuutilization_average` (via CloudWatch exporter) | `> 80%` for 10 min |
| TLS cert expiry | `certmanager_certificate_expiration_timestamp_seconds - time()` | `< 21 days` |

### Alertmanager rules

```yaml
# monitoring/alerts-shopfast.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: shopfast-alerts
  namespace: monitoring
  labels:
    release: kube-prometheus-stack
spec:
  groups:
    - name: shopfast.orders-api
      rules:
        - alert: HighErrorRate
          expr: |
            rate(http_requests_total{job="orders-api",code=~"5.."}[2m])
            / rate(http_requests_total{job="orders-api"}[2m]) > 0.01
          for: 5m
          labels:
            severity: critical
            team: platform
          annotations:
            summary: "orders-api error rate above 1%"
            description: "Error rate is {{ $value | humanizePercentage }}. Runbook: https://wiki.shopfast.io/runbooks/orders-api-errors"
            runbook_url: "https://wiki.shopfast.io/runbooks/orders-api-errors"

        - alert: HighP99Latency
          expr: |
            histogram_quantile(0.99,
              rate(http_request_duration_seconds_bucket{job="orders-api"}[2m])
            ) > 1.0
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "orders-api P99 latency above 1s"

        - alert: PodCrashLooping
          expr: increase(kube_pod_container_status_restarts_total{namespace="shopfast"}[1h]) > 5
          for: 0m
          labels:
            severity: critical
          annotations:
            summary: "Pod {{ $labels.pod }} is crash-looping"

        - alert: CertificateExpiringSoon
          expr: |
            certmanager_certificate_expiration_timestamp_seconds
            - time() < 21 * 24 * 3600
          labels:
            severity: warning
          annotations:
            summary: "TLS cert {{ $labels.name }} expires in less than 21 days"
```

### Loki — log queries for on-call

```logql
# All ERROR logs from orders-api, last 15 minutes
{namespace="shopfast", app="orders-api"} |= "ERROR" | json | line_format "{{.ts}} {{.msg}}"

# Payment failures specifically
{namespace="shopfast", app="orders-api"} |= "payment" |= "failed"

# Slow DB queries (logs from pg driver)
{namespace="shopfast", app="orders-api"} | json | duration > 500ms
```

!!! tip "Correlate traces with logs"
    If `orders-api` emits a `trace_id` field in structured JSON logs, Grafana's Loki data source can link directly from a log line to the corresponding Jaeger/Tempo trace. Add `traceID` as a derived field in the Loki data source config.

---

## Phase 8 — Backups and DR basics

### RDS automated backups

RDS with `backup_retention_period = 14` (set in Terraform above) means:

- AWS takes a daily automated snapshot.
- Point-in-time recovery (PITR) is available for any second within the retention window.
- To restore: `aws rds restore-db-instance-to-point-in-time` with `--restore-time` in ISO 8601.

**Test your restore path quarterly.** A backup you've never tested is not a backup — it's a hypothesis.

### Velero — cluster state backup

Velero backs up Kubernetes object manifests and PVC snapshots to S3. It does *not* replace RDS backups (Velero PVC snapshots are for cluster-hosted storage).

```bash
velero install \
  --provider aws \
  --plugins velero/velero-plugin-for-aws:v1.8.0 \
  --bucket shopfast-velero-backups-prod \
  --backup-location-config region=us-east-1 \
  --snapshot-location-config region=us-east-1 \
  --secret-file ./credentials-velero

# Create a daily scheduled backup of the shopfast namespace
velero schedule create shopfast-daily \
  --schedule="0 2 * * *" \
  --include-namespaces shopfast \
  --ttl 720h    # 30 days retention
```

### RTO / RPO targets

| Scenario | RPO (data loss) | RTO (downtime) |
|---|---|---|
| Single pod crash | 0 | < 30s (HPA + rolling) |
| AZ failure (EKS nodes) | 0 | < 3 min (scheduler reschedules to healthy AZ) |
| RDS primary AZ failure | 0 (Multi-AZ sync) | ~60–120s (automatic failover) |
| Full cluster loss (Velero restore) | < 24h | 30–90 min |
| Region failure | depends on DR plan | Out of scope — document in runbook |

!!! warning "Deep DR is a stretch topic"
    Cross-region active-passive or active-active DR requires Route 53 health checks, RDS read replicas in a second region, and traffic failover automation. That's an [M5](06-M5-sizing-and-cost.md) / cost trade-off conversation. Document your RTO/RPO targets *before* you build DR — they drive the architecture.

---

## The production-ready checklist (final)

Every box from §2, now with where we ticked it.

| # | Requirement | Done in |
|---|---|---|
| 1 | All infrastructure as IaC | Phase 3 — Terraform VPC/EKS/RDS/Elasticache |
| 2 | GitOps — no hand-applied kubectl | Phase 6 — Argo CD Application + ApplicationSet |
| 3 | HTTPS everywhere, auto-renewing TLS | Phase 4 — cert-manager ClusterIssuer; Phase 5 — Ingress TLS |
| 4 | Secrets from Secrets Manager, never in Git | Phase 4 — External Secrets Operator; Phase 5 — ExternalSecret manifest |
| 5 | HPA on real signals | Phase 5 — HPA on CPU + memory, scaleDown stabilization |
| 6 | PodDisruptionBudget | Phase 5 — PDB `minAvailable: 1` |
| 7 | Readiness + liveness + startup probes | Phase 5 — all three probes with correct thresholds |
| 8 | CPU/memory requests and limits | Phase 5 — Deployment resources block |
| 9 | NetworkPolicy default-deny + allow-list | Phase 5 — 4 NetworkPolicy objects |
| 10 | Non-root, read-only root FS, drop ALL caps | Phase 5 — securityContext on pod + container |
| 11 | Multi-AZ — no single-AZ data store | Phase 3 — RDS Multi-AZ, ElastiCache 2 AZs, EKS across 2 AZs |
| 12 | Automated DB backups + tested restore | Phase 8 — RDS PITR + Velero |
| 13 | Dashboards + alerts for RED/USE signals | Phase 7 — ServiceMonitor + PrometheusRule + Loki |
| 14 | Runbook URL in every alert | Phase 7 — `runbook_url` annotation on alerts |
| 15 | One-command rollback | `argocd app rollback orders-api-prod <revision>` or `kubectl rollout undo` |

---

## Senior-engineer thinking

These were judgment calls. Knowing *why* matters as much as knowing *what*. Cross-link: [ch20 Confusions and Trade-offs](20-confusions-and-tradeoffs.md).

**Managed EKS vs. self-managed kubeadm:** EKS costs ~$73/month for the control plane. In return you get AWS-managed etcd backups, automatic control-plane HA, and integrated IAM/VPC. For a production system where the platform team's time is the scarce resource, managed wins. kubeadm makes sense for on-prem, cost-sensitive, or learning environments.

**RDS outside the cluster:** Running Postgres inside Kubernetes (as a StatefulSet) is viable but shifts the DBA operational burden to the platform team — you own backups, failover, WAL archiving, and recovery. RDS Multi-AZ is a managed SRE team for your database. The cost delta is modest; the operational delta is large. State should live where it's safest.

**External Secrets Operator vs. Sealed Secrets:** Sealed Secrets encrypts secrets into Git — great for teams that want secrets versioned and PR-reviewed. ESO never puts secret values in Git — values live only in AWS Secrets Manager, and the cluster fetches them. For a regulated environment (PCI, SOC 2), ESO + Secrets Manager creates a cleaner audit trail. Pick based on your compliance posture.

**Blast radius design:** Every component is namespace-scoped. A misconfigured `orders-api` cannot reach `billing-api` — NetworkPolicy enforces that boundary. RDS is in a private subnet with a SG rule allowing only the EKS node SG. If an attacker compromises a pod, the blast radius is bounded by network and IAM policy.

**Cost checkpoints (cross-link [M5](06-M5-sizing-and-cost.md)):** EKS cluster: ~$73/mo. 3× t3.medium nodes: ~$100/mo. RDS db.t3.medium Multi-AZ: ~$100/mo. ElastiCache cache.t3.micro: ~$25/mo. NAT Gateways (2): ~$65/mo. Total: ~$360/month — a realistic "minimal production" AWS bill. The main cost levers are node size, RDS class, and NAT gateway count.

> 🇮🇳 **Hinglish intuition:** Architecture mein "best" kuch nahi hota — sirf "best given constraints." EKS expensive hai, par agar aapka team chhota hai aur time valuable hai, toh $73/month ka managed control plane bahut sasta padta hai. Yeh trade-off ki conversation interview mein always score karti hai.

---

## Interview scenarios

**Scenario 1 — "Design a production deployment for a new microservice."**

Walk through the two-repo GitOps pattern: app repo contains source + Dockerfile, config repo contains manifests. CI builds, scans with Trivy, pushes to ECR, and bumps the image tag in the config repo. Argo CD detects the change and applies a rolling update. Emphasize: no CI runner ever has `kubectl` credentials; the cluster pulls its desired state from Git.

**Scenario 2 — "Why is the database outside the cluster? Isn't that against the microservices principle?"**

Microservices say each service *owns* its data — they don't say data must *run* inside Kubernetes. Running a stateful database in a StatefulSet is operationally heavy: you're responsible for replication, WAL archiving, PITR, and failover. RDS Multi-AZ delegates all of that. The database is logically owned by the service; it's physically hosted where it's safest. The network boundary (private subnet, SG) provides the isolation.

**Scenario 3 — "Walk me through your ingress + TLS setup. What happens when a cert expires?"**

ingress-nginx terminates HTTPS at the NLB. The Ingress object has a `cert-manager.io/cluster-issuer` annotation; cert-manager's controller watches for that, creates an ACME HTTP-01 challenge via ingress-nginx, and stores the issued certificate in a k8s Secret. cert-manager renews automatically 30 days before expiry. The `CertificateExpiringSoon` alert fires at 21 days as an early warning. If ACME fails (e.g., DNS misconfiguration), the alert fires and the runbook says: check `kubectl describe certificate orders-api-tls -n shopfast` for the failure reason.

**Scenario 4 — "A deployment is stuck. How do you safely roll back in production?"**

First, check Argo CD — if the config repo was already updated, roll back via `argocd app rollback orders-api-prod <previous-revision>`. Argo CD will re-apply the previous manifest set. Alternatively, `kubectl rollout undo deployment/orders-api -n shopfast` reverts to the previous ReplicaSet. Then investigate: `kubectl rollout status`, check probe failures, review logs via Loki. After understanding the root cause, revert the config-repo commit with `git revert` and let Argo re-sync — this keeps Git as the source of truth, not a manual kubectl override.

**Scenario 5 — "How do you ensure zero-downtime deployments?"**

Four mechanisms working together: (1) `maxUnavailable: 0` in the rolling update strategy means old pods stay up until new pods are ready. (2) readinessProbe gates traffic — new pods only receive requests after the probe passes. (3) `preStop` sleep gives the load balancer time to deregister the pod before SIGTERM is sent. (4) PDB ensures at least one pod is always available during concurrent node drains. All four must be present; any one missing creates a gap.

---

## Next: break it

You now have a production system with every component wired. [Chapter 25 — The Production Gauntlet · Part II: Chaos Engineering](25-production-gauntlet-chaos.md) will systematically destroy it.

**Failure surfaces we built in, ready for ch25:**

| What we built | Chaos target in ch25 |
|---|---|
| `orders-api` Deployment with HPA | Pod kill, CPU spike, OOM injection |
| `order-worker` consuming Redis queue | Queue drain, poison-pill message |
| RDS Multi-AZ | AZ failure simulation, connection pool exhaustion |
| ElastiCache Redis | Cache flush, network partition to cache |
| Payments API (external) | Latency injection, 5xx responses, certificate error |
| ingress-nginx + cert-manager | TLS cert deletion, ingress misconfiguration |
| NetworkPolicy default-deny | Intentional policy misconfiguration |
| Argo CD GitOps loop | Config drift injection, sync conflict |
| kube-prometheus alerts | Alert suppression, scrape failure |

Every alert you wired in Phase 7 should fire during chaos. If it doesn't, the alert is wrong. Ch25 will tell you which ones are actually production-grade.

---

??? note "Kustomize overlay for production (reference)"
    ```yaml
    # overlays/prod/orders-api/kustomization.yaml
    apiVersion: kustomize.config.k8s.io/v1beta1
    kind: Kustomization

    namespace: shopfast

    resources:
      - ../../../base/orders-api

    images:
      - name: orders-api
        newName: 123456789.dkr.ecr.us-east-1.amazonaws.com/shopfast/orders-api
        newTag: sha-abc1234   # CI bumps this field on every merge to main

    patches:
      - patch: |-
          - op: replace
            path: /spec/replicas
            value: 3   # prod baseline is 3; HPA scales from here
        target:
          kind: Deployment
          name: orders-api
      - patch: |-
          - op: replace
            path: /spec/template/spec/containers/0/env/0/value
            value: "warn"   # less verbose logging in prod than dev
        target:
          kind: ConfigMap
          name: orders-api-config
    ```

??? note "ClusterSecretStore (prerequisite for ExternalSecret)"
    ```yaml
    apiVersion: external-secrets.io/v1beta1
    kind: ClusterSecretStore
    metadata:
      name: aws-secretsmanager
    spec:
      provider:
        aws:
          service: SecretsManager
          region: us-east-1
          auth:
            jwt:
              serviceAccountRef:
                name: external-secrets-sa
                namespace: external-secrets
    ```
    The `external-secrets-sa` ServiceAccount must have the `eks.amazonaws.com/role-arn` annotation pointing to an IRSA role with `secretsmanager:GetSecretValue` permission.
