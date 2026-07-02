# 🔬 Capstone Deep-Dive v2 — Internals + Interview Bank

> v1 ne "andar kaise kaam karta" dikhaya. **v2 har concept ko ek fixed 5-layer template se** tod-ta hai — bilkul waise jaise interviewer drill karta hai:
>
> | Layer | Kya | Kyun |
> |-------|-----|------|
> | 🧠 **Model** | Ek-line analogy | yaad rehne ko |
> | ⚙️ **Mechanism** | Asal mein kya hota | samajhne ko |
> | 🔢 **Numbers** | Ports, CIDRs, timings, flags | rapid-fire ke liye |
> | 🐛 **Failure** | Kya tootta + debug command | "prod mein chalaya hai" signal |
> | 🎤 **Interview Q** | Wahi sawaal jo aata hai | execution-ready |
>
> Layer 4 aur 5 hi tujhe "ratta-maara" se "prod-tested" mein convert karte. Companion: [Capstone-Architecture-Workflow.md](Capstone-Architecture-Workflow.md)

---

## 🌐 1. AWS NETWORKING — VPC, Subnet, IGW, SG

### 1.1 VPC + Subnet

- 🧠 **Model:** VPC = teri **colony** (boundary wall). Subnet = colony ka ek **block**, jo ek hi gali (AZ = datacenter) mein.
- ⚙️ **Mechanism:** VPC `10.0.0.0/16` = isolated network, bahar se kuch andar nahi jab tak tu na khole. Subnet `10.0.1.0/24` = us VPC ka tukda, **exactly ek AZ** mein bandha. Public subnet banta hai do cheezon se: `map_public_ip_on_launch=true` **+ route to IGW**. Sirf flag kaafi nahi — route bhi chahiye.
- 🔢 **Numbers:**
  - `/16` = 65,536 IPs · `/24` = 256 total, par **AWS 5 reserve** karta (network, VPC router, DNS, future, broadcast) → **251 usable**.
  - RDS DB subnet group = **≥2 AZ** mandatory (single-AZ deploy mein bhi).
- 🐛 **Failure:** Instance ko public IP mila par internet nahi pohcha → route table mein `0.0.0.0/0 → IGW` missing. `aws ec2 describe-route-tables` se check. Ya subnet IP khatam (`/28` = sirf 11 usable) → launch fail "insufficient IPs".
- 🎤 **Interview Q:** *"RDS ke liye 2 subnets/2 AZ kyun zaroori hai?"*
  → RDS DB subnet group **≥2 AZ** maangta taaki ek AZ (poora datacenter) gire to doosri AZ mein **failover** ho — high availability. Single-AZ instance bhi banao to subnet group multi-AZ hona hi chahiye (future Multi-AZ flip ke liye).

### 1.2 Internet Gateway + Route Table

- 🧠 **Model:** IGW = colony ka **main gate** internet se. Route table = "kahan ka traffic kahan jaaye" ka **traffic-rule board**.
- ⚙️ **Mechanism:** IGW VPC pe attach hota (1 per VPC). Route table entry `0.0.0.0/0 → igw-xxxx` ka matlab "saara non-local traffic gateway se bahar." Bina is route ke subnet effectively private.
- 🔢 **Numbers:** Local route `10.0.0.0/16 → local` har route table mein **default** (VPC-internal traffic). Tu sirf `0.0.0.0/0` add karta.
- 🐛 **Failure:** "Public subnet banaya par SSH nahi lagta" → subnet ki route table mein IGW route nahi (main route table use ho rahi). Har public subnet ko **explicit** IGW-wali route table associate karo.
- 🎤 **Interview Q:** *"Public vs private subnet ka technical farak exactly kya hai?"*
  → Sirf naming nahi — **route table**. Public = IGW route hai; private = nahi (NAT gateway se sirf outbound). Subnet ka "public/private" uski route table decide karti, naam nahi.

### 1.3 Security Group (instance-level firewall)

- 🧠 **Model:** SG = har ghar ka **apna darwaza-guard** (stateful). NACL = poori colony ka gate (stateless, subnet-level — alag layer).
- ⚙️ **Mechanism:** SG **stateful** — ingress allow kiya to uska response apne-aap allow (egress rule ki zaroorat nahi). `self=true` rule = "is SG ke andar wale resources **aapas mein** baat kar sakte" (pod↔pod, node↔node, app-pod↔RDS). Bina iske cluster ka internal traffic block.
- 🔢 **Numbers:**
  - `6443` = kube-apiserver (workers↔master).
  - `30000–32767` = NodePort range.
  - `22` = SSH, **sirf YOUR_IP/32** (least privilege).
  - `5432` = Postgres (app-SG → RDS-SG).
  - `10250` = kubelet API.
- 🐛 **Failure:** Pods Running par aapas mein baat nahi / DNS fail → SG mein `self` rule missing. Ya "DB connection timeout" → RDS-SG mein app-SG se `:5432` ingress nahi. `aws ec2 describe-security-groups` + dekho source SG-id sahi hai.
- 🎤 **Interview Q:** *"SG stateful hai — iska practical matlab?"*
  → Inbound `:443` allow kiya to response automatically allow, chahe egress mein wo port na ho. NACL stateless hai isliye wahan return traffic ke liye **alag** rule chahiye. SG = connection-aware, NACL = packet-by-packet.

```
Internet
   │  :22 (YOUR_IP), :30080 (NodePort)
   ▼
┌─────────────── VPC 10.0.0.0/16 ───────────────┐
│  [public 10.0.1.0/24 — AZ-a] EC2 nodes        │
│  [public2 10.0.2.0/24 — AZ-b] (RDS HA pair)   │
│     SG-self ↔ :5432 ↔ RDS (publicly_acc=false)│
└────────────────────────────────────────────────┘
```

---

## ☸️ 2. KUBERNETES CONTROL PLANE — 5+ actors

- 🧠 **Model:** Ek office. apiserver = **reception 📞**, etcd = **diary 📔** (sach), scheduler = **seating manager**, controller-manager = **chowkidar 👁️** (loops), kubelet = **floor worker 💪**, kube-proxy = **trafficwala 🚦**.
- ⚙️ **Mechanism:** Har component **independently** etcd ko (apiserver ke through) **watch** karta. Koi central boss nahi — har controller apna desired-vs-actual khud reconcile karta. **Sirf apiserver hi etcd se seedha baat karta**; baaki sab apiserver se.

| Actor | Kaam |
|-------|------|
| kube-apiserver | Saari requests ka darwaza (kubectl + components) |
| etcd | Cluster ki poori state (key-value DB) — "sach yahaan" |
| scheduler | Naya pod → kaunsa node (resources/taint/affinity) |
| controller-manager | Reconciliation loops (Deployment/ReplicaSet controllers) |
| kubelet (har node) | Pod **asal mein** chalata (containerd ko bolta) |
| kube-proxy (har node) | Service→pod routing (iptables/IPVS) |

### 🔄 `kubectl apply -f deployment.yaml` ka poora safar

```
1. kubectl → apiserver: "ye Deployment chahiye"
2. apiserver → etcd mein likha (desired state saved)
3. Deployment controller → "ReplicaSet chahiye" → banata
4. ReplicaSet controller → "2 pod chahiye, 0 hain" → 2 Pod objects (etcd)
5. scheduler → "2 pod bina node" → har ko worker assign
6. kubelet (us worker) → "pod chalana hai" → containerd → container start
7. kubelet → status apiserver ko → etcd update
```

- 🔢 **Numbers:** apiserver `:6443` · etcd `:2379` (client), `:2380` (peer) · kubelet `:10250` · etcd default reconcile = continuous watch (event-driven, poll nahi).
- 🐛 **Failure:** `kubectl` hang/`connection refused` → apiserver down ya kubeconfig galat (`admin.conf` path). etcd corrupt/full → cluster amnesia, sab read-write fail. Debug: `kubectl get componentstatuses` (deprecated par kaam ka), `crictl ps` node pe, control-plane pods `/etc/kubernetes/manifests` (static pods).
- 🎤 **Interview Q:** *"Reconciliation actually kaise kaam karta — kya ek master loop hai?"*
  → Nahi. **Distributed, level-triggered.** Har controller etcd ko watch karta, apna "desired" (spec) vs "actual" (status) compare karta, farak ho to action. Edge-triggered nahi — agar event miss bhi ho jaaye, agla reconcile fir se actual state dekh ke theek kar deta. Yahi K8s ko self-healing banata.
  > 🔴 **Prod note:** capstone mein **single control-plane node = SPOF**. Prod = odd-number (3/5) control-plane for **etcd Raft quorum**. etcd backup (`etcdctl snapshot save`) tfstate-level critical.

---

## 🕸️ 3. POD NETWORKING (Calico / CNI)

- 🧠 **Model:** Calico = **inter-city highway** — har ghar (pod) ko har ghar se jodti, chahe alag shaher (node) mein ho. Bina iske pod sirf apne node tak.
- ⚙️ **Mechanism:** Problem — pod-A worker-0 pe, pod-B worker-1 pe, alag machines. CNI plugin (Calico) har node pe **routes** set karta taaki kisi bhi node ka pod kisi bhi node ke pod se seedha (flat network) baat kare. Dataplane do tarah ka:
  - **BGP mode** — native routing, no encapsulation (fast, same-L2 ya route-reflector chahiye).
  - **Overlay (IPIP/VXLAN)** — packet ko wrap karke bhejta (kisi bhi network pe chalta, thoda overhead).
  - **eBPF dataplane** (naya) — kube-proxy ko **replace** kar deta (iptables hatti, performance up).
- 🔢 **Numbers:** `--pod-network-cidr=192.168.0.0/16` = Calico default, **node IPs se alag** range. BGP port `:179`. Pod CIDR Service CIDR (`10.96.0.0/12` default) se overlap nahi hona chahiye.
- 🐛 **Failure:** `kubeadm init` ke baad CoreDNS pods **Pending**, nodes **NotReady** → CNI install nahi hua. Calico apply karo, phir Ready. Pod CIDR overlap → random connectivity break. Debug: `kubectl get pods -n kube-system`, `calicoctl node status`.
- 🎤 **Interview Q:** *"Do alag node ke pods ek doosre ko bina public IP ke kaise dhoondhte?"*
  → CNI (Calico) har node ki routing table mein doosre nodes ke pod-CIDR ke routes daal deta (BGP se distribute ya overlay se encapsulate). Pod ka apna IP cluster-wide routable ban jaata — ek flat network jaisa. Isiliye `kubeadm init` ke turant baad CNI install **zaroori**, warna pods schedule hote par network nahi.

---

## 🛠️ 4. kubeadm BOOTSTRAP (Ansible se)

- 🧠 **Model:** Cluster ko "machine se K8s-node" banane ki **assembly line** — pehle har node ki neev (`1-common`), phir master (`2-master`), phir workers jodo (`3-workers`).
- ⚙️ **Mechanism:**
  - `1-common.yml` (har node): `swapoff -a`, `br_netfilter` + `ip_forward` on, containerd install, kubelet/kubeadm/kubectl install + `apt-mark hold`.
  - `2-master.yml`: `kubeadm init --pod-network-cidr=...` → control-plane components + `admin.conf` (kubeconfig) + **join-command** print → Calico apply → join-command save.
  - `3-workers.yml`: `kubeadm join <master>:6443 --token...` → workers cluster mein add.
- 🔢 **Numbers:**
  - `swapoff` → kubelet swap pe **refuse** (memory predictable). *Note: K8s 1.28+ mein NodeSwap beta hai, par default abhi bhi swap-off expected.*
  - Token default **TTL 24h**, reusable us window mein; `kubeadm token create` se naye.
  - `apt-mark hold` = version lock (auto-update se cluster na toote).
- 🐛 **Failure:** `kubeadm init` fail "swap enabled" → `swapoff -a` + `/etc/fstab` se swap line comment. Worker join fail "token expired" → `kubeadm token create --print-join-command` master pe. Re-run init crash → `creates: /etc/kubernetes/admin.conf` se **idempotency** (file hai to skip).
- 🎤 **Interview Q:** *"kubelet swap pe kyun nahi chalta?"*
  → kubelet ko **predictable memory** chahiye QoS aur OOM decisions ke liye. Swap on → RAM ki performance/eviction unpredictable, scheduler ka resource-math toot-ta. Isiliye historically hard requirement; 1.28+ se controlled swap beta-support aaya par production default still swap-off.

---

## 🚦 5. SERVICE → POD ROUTING

- 🧠 **Model:** Service = building ka **internal extension** (virtual IP, asli machine nahi). EndpointSlice = "**abhi kaun apne desk pe ready hai**" ki live list. NodePort = bahar wala **public number** jo internal pe forward.
- ⚙️ **Mechanism:** Service ko **ClusterIP** (virtual) milti. kube-proxy us IP ka traffic **iptables/IPVS** rules se asli pods pe forward karta. Konse pods? — **EndpointSlice** se, jisme **sirf READY** pods ke IP hain.
  - Readiness probe **pass** → kubelet pod ko `Ready` mark → endpoint controller pod-IP ko slice mein **add** → kube-proxy rules update → traffic milne lagta.
  - Probe **fail** → slice se **hata** → traffic ruk jaata. **Service khud nahi sochti** — slice readiness ke hisaab se maintain hoti.
- 🔢 **Numbers:**
  - NodePort `:30000–32767` (capstone `:30080`).
  - Readiness default: `periodSeconds:10`, `failureThreshold:3` → **~30s** mein sick pod eject.
  - EndpointSlice (K8s 1.21+ default) = legacy Endpoints se scale better (~100 endpoints/slice, 1000s pods).
  - kube-proxy `iptables` mode = O(n) rule traversal; `IPVS` = hash-based, scale ke liye.
- 🐛 **Failure (classic):** Pod **Running par traffic nahi** → wo slice mein **hai hi nahi**. Do wajah: (a) readiness fail, (b) Service `selector` ↔ pod `labels` **mismatch**. Debug: `kubectl get endpointslices` (khaali? → readiness/label), `kubectl describe svc <name>`, `kubectl get pod --show-labels`.
- 🎤 **Interview Q:** *"Ek pod Running dikha raha par zero traffic le raha. Debug walk-through?"*
  1. `kubectl get endpointslices` — pod-IP list mein hai? Nahi → aage.
  2. `kubectl describe pod` — Readiness probe pass? Fail → app `/health` 200 nahi de raha.
  3. Selector vs label match? `kubectl describe svc` ka selector vs `kubectl get pod --show-labels`.
  4. Mil gaya to slice mein IP aa jaata, kube-proxy rule banti, traffic flow. **Service ko kabhi blame mat karo — slice + readiness dekho.**

```
Service (selector: app=urlshort)
   │ endpoint controller readiness se slice banata:
   ▼
EndpointSlice: [pod1-IP:8000, pod2-IP:8000]   ← sirf READY pods
   │ kube-proxy iptables/IPVS:
   ▼
:30080 (node) → ClusterIP → ready pod
```

---

## 🔁 6. ROLLING UPDATE — zero downtime

- 🧠 **Model:** **Relay race ka baton** — naya runner baton **pakad le** (Ready) tabhi purana chhodta. Pakad fail to purana daudta rehta.
- ⚙️ **Mechanism:** Image tag badla (Argo apply karti) → naya ReplicaSet (v2) banta. Deployment dheere-dheere shift: v2 ka pod banao → **ready hone do** → v1 ka ek pod hatao → repeat jab tak v2 full, v1 khaali.
- 🔢 **Numbers:** `maxSurge` (kitne extra pod temporarily, default 25%) · `maxUnavailable` (kitne kam, default 25%) · `progressDeadlineSeconds` (default 600s — itne mein progress nahi → rollout "failed").
- 🐛 **Failure:** Naya image crash/not-ready → naya pod slice mein nahi aata → **rollout ruk jaata**, purane v1 pods **zinda**, app **down nahi**. `kubectl rollout status deploy/<name>` "waiting"; `kubectl rollout undo` se revert. Agar `maxUnavailable` zyada + readiness weak → brief downtime ho sakti.
- 🎤 **Interview Q:** *"Zero-downtime deploy ka asli mechanism kya hai — image swap toh atomic nahi?"*
  → Readiness probe + EndpointSlice ka coupling. Naya pod tabhi traffic leta jab **Ready** (slice mein add). Purana tabhi hatta jab naya ready ho chuka. `maxUnavailable:0` + `maxSurge:1` = strict zero-downtime (pehle naya ready, fir purana terminate). Naya crash kare to rollout khud pause — production protected.

---

## 🐙 7. ARGO CD SYNC — drift detection

- 🧠 **Model:** Argo bhi ek **reconciliation loop**, bas iska "desired" = **Git** (K8s ka desired = etcd). Git = single source of truth.
- ⚙️ **Mechanism:** Argo har ~3 min Git repo **poll** karti (ya webhook se instant). **3-way diff:** Git (desired) vs live cluster (actual) vs last-applied. Farak = **OutOfSync**. `selfHeal:true` ho to Argo Git-wala `kubectl apply` kar deti. Tu `kubectl edit` se live badle → Argo poll pe OutOfSync dekhti → **wapas Git wala** laa deti.
- 🔢 **Numbers:** Default reconcile = **180s** (3 min); webhook = instant. Sync options: `prune` (Git se hata = cluster se hata), `selfHeal` (manual drift auto-revert).
- 🐛 **Failure:** "Maine `kubectl scale` kiya, kuch der baad wapas purana ho gaya" → Argo selfHeal ne Git-state restore kiya (M7 gotcha). Theek karo **Git mein**, cluster mein nahi. `argocd app diff <app>` se exact drift; `argocd app sync` manual.
- 🎤 **Interview Q:** *"GitOps mein agar koi `kubectl edit` se hotfix kar de prod mein, kya hota?"*
  → Argo agle reconcile (≤3 min) pe **OutOfSync** detect karegi. `selfHeal` on → turant Git-state wapas (hotfix udd gaya). Isiliye GitOps mein **har change Git PR se** — cluster ko directly chhedना anti-pattern. Audit + rollback dono Git history se free milte.

---

## 🔄 8. CI/CD INTERNALS (GitHub Actions)

- 🧠 **Model:** Runner = ek **disposable worker** (kaam khatam → mar gaya). Cattle, pet nahi.
- ⚙️ **Mechanism:** `ubuntu-latest` runner = temporary VM, workflow chalata, fir destroy (stateless). Build → image banao → tag `github.sha` (40-char commit hash) → registry push → manifest update. Secrets runtime pe env-var ban ke aate, logs mein `***` masked.
- 🔢 **Numbers:** `github.sha` = 40 hex chars. Image **digest** `@sha256:...` = content-hash (**tag move ho sakta, digest never** — true immutable). Tag = human-readable pointer; digest = cryptographic identity.
- 🐛 **Failure (loop bug):** CI manifest update karke `main` pe push karta → `on:push:[main]` **phir trigger** → infinite loop. **Fix:** `paths:['app/**']` filter — app `app/` mein, manifest `k8s/` mein, to manifest-commit dobara trigger nahi karta. Ya `[skip ci]` commit message mein.
- 🎤 **Interview Q:** *"Image ko `latest` tag se deploy karna kyun bura hai?"*
  → `latest` mutable — same tag alag-alag content point kar sakta time ke saath. Rollback/audit impossible ("kaun sa latest?"). Solution: immutable tag = `git-sha` ya digest pin (`@sha256:`). Har deploy exactly traceable kis commit se. Ye supply-chain integrity ka base hai.

---

## 🗄️ 9. RDS (Postgres) — stateful anchor

- 🧠 **Model:** App pods marte-bante (cattle), par **DB ka data zinda rehna chahiye**. DB = single stateful anchor; managed RDS (AWS backup/failover sambhaalta) > self-managed DB pod.
- ⚙️ **Mechanism:** `publicly_accessible=false` → RDS ko public IP nahi milta, sirf VPC ke andar se reachable. App pods SG-self rule se `:5432` pe baat karte. Automated backups daily snapshot. Multi-AZ on → standby doosri AZ mein, primary gire to auto-failover (DNS endpoint same rehta).
- 🔢 **Numbers:** Postgres `:5432` · `skip_final_snapshot=true` (capstone — destroy pe backup nahi, paisa/time bachao) · backups retention 1–35 din · RPO ≈ backup frequency, RTO ≈ restore time.
- 🐛 **Failure / anti-pattern:**
  - 🔴 **RDS public subnet mein (capstone ka gap):** subnet group `public`+`public2` pe hai. `publicly_accessible=false` bachata (no public IP) **par subnet ki IGW-route phir bhi hai**. Defense-in-depth nahi. **Prod fix: private subnets** (no IGW path at all), NAT sirf outbound.
  - `skip_final_snapshot=true` **prod mein false** rakho — warna destroy pe data permanently gaya.
  - "DB connection timeout" → SG ingress `:5432` app-SG se missing, ya pod galat AZ/subnet.
- 🎤 **Interview Q:** *"Tera DB public subnet mein kyun hai?"* (yahi poochenge — taiyaar reh)
  → "`publicly_accessible=false` set hai, to RDS ko public IP nahi milta aur internet se reachable nahi — SG sirf app-SG se `:5432` allow karta. Subnet 'public' isliye kehlata kyunki uski route table mein IGW hai, par DB us path se exposed nahi. **Prod mein main private subnets use karta** taaki IGW path hi na ho — capstone mein NAT gateway cost (~$32/mo) bachane ko public rakha." (Honest + design-aware = strong answer.)

---

## 🧩 10. REQUEST LIFECYCLE — `/shorten` ka poora safar

- 🧠 **Model:** **Ek request mein poora bootcamp.** Har hop ek module: NodePort→kube-proxy→Service→EndpointSlice→Pod→DB.
- ⚙️ **Mechanism:**

```
1. User → POST http://<node-ip>:30080/shorten
2. NodePort :30080 → kube-proxy (iptables) → Service ClusterIP
3. Service → EndpointSlice → ek READY pod chunti (load balance)
4. Pod (FastAPI :8000) → request handle → code() se short banata
5. Pod → psycopg2 → RDS :5432 (private) → INSERT urls(code,url)
6. RDS OK → Pod → {"short":"abc123"} → user
   (pod beech mein crash → Deployment naya banata; agli request doosre ready pod pe)
```

- 🔢 **Numbers:** NodePort `:30080` · FastAPI `:8000` · RDS `:5432`. Har hop ka latency add hota — kube-proxy iptables ~µs, DB round-trip ~ms (dominant).
- 🐛 **Failure (har hop pe):** `:30080` refuse → NodePort/firewall. ClusterIP pe ruka → kube-proxy/iptables. Pod tak nahi → EndpointSlice khaali (readiness). DB error → SG/`:5432`/credentials. **Ek-ek hop test karo:** `curl node:30080` → `kubectl exec pod -- curl localhost:8000` → `kubectl exec pod -- nc -zv <rds> 5432`.
- 🎤 **Interview Q:** *"User ko 502/timeout aa raha is endpoint pe. Systematically kaise debug karega?"*
  → Bahar se andar, hop-by-hop. (1) NodePort khula? (2) Service ke peeche endpoints hain? `kubectl get endpointslices`. (3) Pod healthy + ready? logs. (4) Pod se DB reachable? `nc -zv`. Har layer isolate karke aage badho — guessing nahi, deterministic narrowing. **Yahi "debug" interview round jeet-ta hai.**

> 🖼️ Is lifecycle ka **rendered interactive diagram** chat mein bhi hai (har box clickable → uska "why"). Doc-portable version upar ASCII mein.

---

## 🎤 11. INTERVIEW QUICK-FIRE BANK (layer 5 consolidated)

Rapid-fire — ek line answer ready rakho:

| # | Sawaal | One-line answer |
|---|--------|-----------------|
| 1 | RDS 2 AZ kyun? | DB subnet group ≥2 AZ → AZ-failover/HA |
| 2 | Public vs private subnet? | Route table mein IGW route hai ya nahi |
| 3 | SG stateful matlab? | Inbound allow → response auto-allow (connection-aware) |
| 4 | SG `self=true`? | Andar ke resources aapas mein baat (pod/node/DB) |
| 5 | Reconciliation kya? | Distributed, level-triggered desired-vs-actual loops |
| 6 | Sirf kaun etcd se baat karta? | Sirf apiserver; baaki sab uske through |
| 7 | etcd uda to? | Cluster amnesia — backup (`etcdctl snapshot`) critical |
| 8 | Control-plane HA? | Odd number (3/5) for Raft quorum |
| 9 | CNI/Calico kyun? | Cross-node pod-to-pod flat networking |
| 10 | CNI ke bina? | Pods Pending, nodes NotReady |
| 11 | kubelet swap pe nahi? | Predictable memory for QoS/eviction |
| 12 | kubeadm idempotency? | `creates:` arg — admin.conf hai to skip |
| 13 | Token "one-time"? | Nahi — 24h TTL, reusable; `token create` se naye |
| 14 | Service virtual IP? | ClusterIP, kube-proxy iptables/IPVS se real pod |
| 15 | EndpointSlice? | Ready pods ki list (readiness→traffic coupling) |
| 16 | Pod Running par no traffic? | Slice mein nahi → readiness fail ya label mismatch |
| 17 | iptables vs IPVS? | O(n) linear vs hash-based (scale ke liye IPVS) |
| 18 | Zero-downtime deploy? | Naya Ready hone ke baad hi purana hatta |
| 19 | maxSurge/maxUnavailable? | Rolling update knobs (extra/kam pods) |
| 20 | Rollout fail handle? | Naya not-ready → pause, purana zinda, `undo` |
| 21 | Argo desired kya? | Git (etcd nahi) — GitOps source of truth |
| 22 | `kubectl edit` prod mein? | Argo selfHeal ≤3min mein Git-state wapas |
| 23 | `latest` tag bura kyun? | Mutable — rollback/audit impossible; sha pin karo |
| 24 | Tag vs digest? | Tag move ho sakta; digest content-hash, immutable |
| 25 | CI infinite loop fix? | `paths:` filter (app/ vs k8s/ separate) |
| 26 | Runner stateless kyun? | Ephemeral VM (cattle) — reproducible, no drift |
| 27 | RDS public subnet? | `publicly_accessible=false` bachata; prod = private subnet |
| 28 | `skip_final_snapshot`? | Capstone true (cost); prod false (data safety) |
| 29 | 502 debug approach? | Bahar→andar hop-by-hop isolate, no guessing |
| 30 | Single stateful anchor? | DB — cattle pods, par data zinda rakhna managed RDS |

---

## 📌 MEMORY ANCHORS (har internal, ek line)

| Internal | Ek line |
|----------|---------|
| 2 subnets RDS | HA — ek AZ gire to doosri |
| Public subnet | route-to-IGW hai (naam nahi, route) |
| SG `self=true` | internal pods/nodes/DB aapas mein |
| etcd | cluster ki tfstate (sach ka ghar) |
| apiserver only | sirf yahi etcd se baat karta |
| scheduler | pod→node (resource/taint) |
| kubelet | node pe pod asal mein chalata |
| kube-proxy | Service→pod (iptables/IPVS) |
| Calico/CNI | cross-node pod networking (BGP/overlay/eBPF) |
| swapoff | kubelet swap pe nahi (predictable mem) |
| EndpointSlice | ready pods (readiness→traffic) |
| maxSurge/maxUnavailable | rolling update knobs |
| Argo poll 3-way | Git vs live vs last → drift |
| selfHeal | manual drift auto-revert to Git |
| runner | ephemeral VM (cattle) |
| image digest | true immutable (tag move ho sakta) |
| RDS private | prod: no IGW path (defense-in-depth) |
| skip_final_snapshot | capstone true, prod false |

---

> **Ab har box ka "andar" + "kya tootega" + "kya poochenge" — teeno clear.** v1 ne samajh di, v2 ne **interview-execution** di. System-design round + debug round, dono mein chamak. 🚀
