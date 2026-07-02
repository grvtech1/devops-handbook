# 🔬 Capstone Deep-Dive — Every Small Behavior & Internal (Memory Build)

> Architecture doc ne "kya juda" dikhaya. **Ye doc "andar kaise kaam karta"** — har box ke andar ka chhota behavior. Padh ke koi cheez "magic" nahi lagegi.
> Companion: [Capstone-Architecture-Workflow.md](Capstone-Architecture-Workflow.md)

---

## 🌐 1. AWS NETWORKING — andar kya hota

### VPC = tera private network (10.0.0.0/16)
- `/16` = 65,536 IPs ka apna isolated network. Bahar ki koi cheez andar nahi, jab tak tu na khole.
- 🎓 Apni **colony** — boundary wall ke andar tere ghar (resources).

### Subnet = VPC ka tukda (ek AZ mein)
- `10.0.1.0/24` = 256 IPs, **ek Availability Zone (AZ)** mein. AZ = ek physical datacenter.
- **Public subnet** = jisme `map_public_ip_on_launch=true` + route to **IGW** → internet-facing.
- 🔑 **RDS ko 2 subnets (2 AZ) kyun?** RDS **DB subnet group** maangta hai jo **≥2 AZ** cover kare — taaki ek AZ (datacenter) gire to doosri AZ mein failover ho sake (high availability). Isliye `subnet public` + `public2` (alag AZ).

### Internet Gateway (IGW) + Route Table
- **IGW** = VPC ka "main darwaza" internet se. Bina iske subnet internet se cut.
- **Route table** = "kahan ka traffic kahan jaaye" rules. `0.0.0.0/0 → IGW` = "internet ka saara traffic gateway se."
- 🔑 **Public subnet banta hai** = subnet + route-to-IGW. Sirf IGW kaafi nahi, **route bhi** chahiye.

### Security Group (SG) = instance-level firewall
- **Stateful firewall** — ingress (andar aane wala) + egress (bahar jaane wala) rules.
- **`self=true` rule** ka matlab: "is SG ke andar wale resources **aapas mein** baat kar sakte" (pods↔pods, node↔node). Bina iske cluster internal traffic block.
- **`6443`** = kube-apiserver port (workers master se yahin baat karte).
- **`30000-32767`** = NodePort range (Service yahin expose hoti).
- **`22` sirf YOUR_IP** = SSH poori duniya ko nahi (least privilege, M8).
- 🎓 SG = har ghar ka **apna darwaza-guard** (NACL = poori colony ka gate — alag layer).

---

## ☸️ 2. KUBERNETES CONTROL PLANE — andar 5 actors

Jab tu `kubectl apply` karta, ye 5 cheezein milke kaam karti (master node pe):

| Actor | Kaam | 🎓 |
|-------|------|----|
| **kube-apiserver** | Saari requests ka **darwaza** (kubectl, components sab isse baat karte) | reception 📞 |
| **etcd** | Cluster ki **poori state** ka database (key-value) — "sach yahaan" | cluster ki diary 📔 |
| **scheduler** | Naya pod → **kaunse node** pe rakhna decide (resources/taint/affinity dekh ke) | seating manager |
| **controller-manager** | **Reconciliation loops** chalata (Deployment/ReplicaSet controllers) | chowkidar 👁️ |
| **kubelet** (har node pe) | Apne node pe pods **asal mein chalata** (container runtime ko bolta) | floor worker 💪 |
| **kube-proxy** (har node pe) | Service → pod **traffic routing** (iptables rules) | trafficwala 🚦 |

### 🔄 `kubectl apply -f deployment.yaml` ka poora safar (step-by-step):
```
1. kubectl → kube-apiserver ko bhejta "ye Deployment chahiye"
2. apiserver → etcd mein likh deta (desired state saved)
3. Deployment controller (controller-manager) → dekhta "ReplicaSet chahiye" → banata
4. ReplicaSet controller → dekhta "2 pod chahiye, 0 hain" → 2 Pod objects banata (etcd mein)
5. scheduler → dekhta "2 pod bina node ke" → har ko ek worker assign karta
6. kubelet (us worker pe) → dekhta "mujhe pod chalाना hai" → containerd ko bolta → container start
7. kubelet → pod status apiserver ko batata → etcd update
```
> 🔑 **Har step ek "watch loop"** — koi central boss nahi, har controller apna kaam **independently** karta (etcd ko watch karke). **Yahi reconciliation hai — distributed, continuous.**

### etcd = sach ka ghar
- Cluster ki **har cheez** (pods, services, secrets, configs) yahin. apiserver hi etcd se baat karta.
- 🔴 **etcd gaya = cluster ki memory gayi** (Terraform tfstate jaisa!). Isiliye etcd **backup** critical.

---

## 🕸️ 3. POD NETWORKING (Calico/CNI) — pods aapas mein kaise baat karte

### Problem: 2 alag worker nodes pe pods — ek doosre ko kaise dhoondhein?
- Har pod ka apna **IP** (M4). Par pod-A worker-0 pe, pod-B worker-1 pe — **alag machines.** Inke beech network kaise?

### CNI (Container Network Interface) = pod-networking plugin → **Calico**
- Calico har node pe routing set karta taaki **kisi bhi node ka pod, kisi bhi node ke pod** se seedha baat kar sake (ek flat network jaisा).
- `--pod-network-cidr=192.168.0.0/16` = pods ke IPs is range se (node IPs se alag).
- 🎓 Calico = **inter-city highway** jo har ghar (pod) ko har ghar se jodti, chahe alag shaher (node) mein ho. Bina iske pods sirf apne node tak.
- 🔑 **Isiliye `kubeadm init` ke baad Calico install zaroori** — warna pods "Pending"/"not ready" (network nahi).

---

## 🛠️ 4. kubeadm BOOTSTRAP — cluster kaise banta (Ansible se)

### `1-common.yml` (har node) — pre-requisites
- **`swapoff -a`** — kubelet **swap pe chalने se mana** karta (memory predictable rakhne ko; swap = RAM ki performance unpredictable). Swap on → kubelet start nahi hoga. 🔑
- **`br_netfilter` + `ip_forward`** — Linux ko bolna "pod traffic ko bridge/forward karne do" (CNI ke liye zaroori).
- **containerd** install — container runtime (Docker ki jagah, K8s seedha containerd use karta).
- **kubelet/kubeadm/kubectl** install + `apt-mark hold` (version lock — auto-update se cluster na toote).

### `2-master.yml` — control plane
- **`kubeadm init --pod-network-cidr=...`** → control plane components (apiserver/etcd/scheduler/controller) start karta + **admin.conf** (kubeconfig) banata + **join-command** print karta.
- **`args: creates: /etc/kubernetes/admin.conf`** = idempotency! (file hai to dobara init nahi — M2 thread).
- **Calico apply** → pod networking.
- **join-command save** → workers ke liye token.

### `3-workers.yml` — join
- Workers `kubeadm join <master>:6443 --token...` chalate → master se connect, cluster mein **add** ho jaate.
- 🔑 **token = ek-baar ka password** master se join karne ka (security).

---

## 🚦 5. SERVICE → POD ROUTING — traffic andar kaise pohchta

### Service ek "virtual IP" hai (asli machine nahi!)
- Service ko ek **ClusterIP** milti (virtual). Wo kisi pod pe nahi — **kube-proxy** us IP ka traffic **iptables rules** se asli pods pe forward karta.

### Endpoints object = "kaunse pods ready hain" ki live list
```
Service (selector: app=urlshort)
   │ kube-proxy isse Endpoints banata:
   ▼
Endpoints: [pod1-IP:8000, pod2-IP:8000]   ← sirf READY pods!
```
- 🔑 **Readiness probe ka asli connection:** pod **ready** → uska IP **Endpoints mein add** → traffic milne lagता. Pod **not-ready** → **Endpoints se hata** → traffic ruk jaata. **Service khud nahi sochti — Endpoints list maintain hoti hai readiness ke hisaab se.**
- 🐛 "Pod Running par traffic nahi" → **Endpoints mein hai hi nahi** (readiness fail ya label mismatch). `kubectl get endpoints` se dekho!

### NodePort = bahar se andar
- `:30080` har **node pe** khulta → koi bhi node-IP:30080 → kube-proxy → Service → ready pod.
- 🎓 Service = building ka **internal extension number**; NodePort = **bahar wala public number** jo internal pe forward.

---

## 🔁 6. ROLLING UPDATE — naya version bina downtime

### Jab image tag badalta (Argo apply karti):
```
Purana ReplicaSet (v1): pod, pod          Naya ReplicaSet (v2): (khaali)
        │  Deployment dheere-dheere shift karta:
        ▼
v1: pod, pod    →  v2: pod banao (ready hone do) →  v1: ek pod hatao
        →  repeat tak v2: pod,pod  ·  v1: (khaali)
```
- **`maxSurge`** = kitne extra pod bana sakte (temporarily zyada). **`maxUnavailable`** = kitne kam ho sakte.
- 🔑 **Readiness probe yahaan critical:** naya pod **ready hone** ke baad hi purana hatta → **zero downtime.** Agar naya crash (not ready) → rollout **ruk jaata**, purana zinda. App down nahi hoti!
- 🎓 Relay race ka baton — naya runner **pakad le** (ready) tabhi purana chhodta.

---

## 🐙 7. ARGO CD SYNC — drift kaise detect karta

- Argo har **~3 min** (default) Git repo ko **poll** karti (ya webhook se instant).
- **3-way diff:** Git (desired) vs live cluster (actual) vs last-applied. Farak = **OutOfSync.**
- **selfHeal:** OutOfSync + `selfHeal:true` → Argo `kubectl apply` (Git wala wapas).
- **Manual `kubectl edit`** → live badla → Argo poll pe dekhti OutOfSync → **wapas Git wala** (M7 gotcha).
- 🔑 **Argo bhi reconciliation loop** — bas desired = **Git** (K8s ka desired = etcd; Argo ka desired = Git).

---

## 🔄 8. CI/CD INTERNALS (GitHub Actions)

- **Runner** = GitHub ka temporary VM (`ubuntu-latest`) jo workflow chalata, kaam khatam → **destroy** (stateless! cattle).
- **`github.sha`** = us commit ka 40-char hash. Image tag = exact commit traceability.
- **Image digest (`@sha256:`)** = image ka content-hash — **tag move ho sakta, digest never** (true immutable).
- **Secrets injection** = runtime pe env var ban ke aate, logs mein **masked** (`***`).
- **manifest-update loop bug:** CI ka git-push `main` pe → `on:push:[main]` phir trigger → loop. Fix: `paths:['app/**']` (manifest `k8s/` mein, app `app/` mein → manifest-commit trigger nahi karta).

---

## 🗄️ 9. RDS (Postgres) — stateful ka khayal

- **`publicly_accessible=false`** → sirf VPC ke andar se reachable (internet se nahi). Pods SG-self se :5432 pe baat karte.
- **`skip_final_snapshot=true`** = destroy pe final backup mat lo (capstone — paisa/time bachao; **prod mein false** — warna data gaya!).
- **Automated backups** = RDS daily snapshot leta (RPO ~ backup-frequency). Restore = naya instance snapshot se (RTO).
- 🔑 **DB = single stateful anchor.** App pods marte-bante (cattle), par DB ka data **zinda rahna chahiye** → managed RDS (AWS backup/failover sambhaalta) > self-managed DB pod.

---

## 🧩 10. REQUEST LIFECYCLE — ek `/shorten` ka poora safar (sab jod ke)

```
1. User → POST http://<worker-ip>:30080/shorten
2. NodePort :30080 → kube-proxy (iptables) → Service ClusterIP
3. Service → Endpoints list → ek READY pod chunti (load balance)
4. Pod (FastAPI :8000) → request handle → code() se short banata
5. Pod → psycopg2 → RDS :5432 (private) → INSERT urls(code,url)
6. RDS → OK → Pod → {"short":"abc123"} → user
   (agar pod crash hua beech mein → Deployment naya banata, agli request doosre pod pe)
```
> Har number ek concept: NodePort(M4)→kube-proxy(M4)→Service(M4)→Endpoints/readiness(M4/M8)→Pod(M4)→DB private(M1/M8). **Ek request mein poora bootcamp.** 🧵

---

## 🎯 11. MEMORY ANCHORS (ek-line, har internal)

| Internal | Ek line |
|----------|---------|
| 2 subnets RDS | HA — ek AZ gire to doosri |
| SG `self=true` | internal pods/nodes aapas mein baat |
| etcd | cluster ki tfstate (sach ka ghar) |
| scheduler | pod ko node assign (resource/taint dekh ke) |
| kubelet | node pe pod asal mein chalata |
| kube-proxy | Service→pod iptables routing |
| Calico/CNI | cross-node pod networking |
| swapoff | kubelet swap pe nahi chalता |
| Endpoints | ready pods ki list (readiness→traffic) |
| maxSurge/maxUnavailable | rolling update knobs (zero-downtime) |
| Argo poll 3-way diff | Git vs live vs last → drift |
| runner | temporary VM (cattle) |
| image digest | true immutable (tag move ho sakta) |
| RDS private | sirf VPC se, internet nahi |

---

> **Ab koi box "magic" nahi.** Har component ka andar ka behavior clear. Ye deep samajh interview mein "system design" + "debug" dono mein chamakti. 🚀
