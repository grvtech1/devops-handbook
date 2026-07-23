# M9 — Advanced Kubernetes Internals & Production Patterns

> **Core question: Probes, QoS, DNS, graceful shutdown, HPA, RBAC, Ingress — what really happens inside, and how do I debug it?**

> **⏱️ Time:** ~75 min padho + 40 min lab · **🎚️ Level:** Advanced · **📋 Pehle chahiye:** [M4](05-M4-kubernetes-core.md), [M5](06-M5-sizing-and-cost.md)
>
> **Is module ke baad tum kar paoge:**
> - `kubectl apply` ke saaton steps trace karo — apiserver se etcd, scheduler, kubelet tak
> - Liveness, readiness, aur startup probe ke alag fail-actions explain karo aur liveness footgun se bacho
> - Ingress Host-header routing debug karo, HPA formula apply karo, aur RBAC four-object model implement karo

**MODULE MAP**
`00-INDEX` · `01-M0-foundations` · `02-M1-terraform` · `03-M2-ansible` · `04-M3-docker` · `05-M4-kubernetes-core` · `06-M5-sizing-and-cost` · `07-M6-cicd` · `08-M7-gitops` · `09-connected-system` · `10-M8-observability-sre` · **`11-M9-advanced-k8s-internals`** · `12-capstone-url-shortener` · `13-capstone-microshop` · `14-interview-bank` · `15-roadmap` · `16-reference-appendix`

M4 (`05-M4-kubernetes-core`) taught you the vocabulary: pods, Deployments, Services, ReplicaSets. This chapter goes under the hood — the internal machinery every senior engineer and every technical interviewer expects you to own. Concepts are production-grade; debug commands are real; Hinglish intuition anchors are for the brain, not the exam.

---

> ### ↩️ Recall gate — shuru karne se pehle
> Pichhle modules se 3 sawaal. **Pehle memory se jawab do, phir kholo.** (Yeh retrieve karna hi lifetime yaad rakhta hai — dobara padhna nahi.)
>
> 1. *(M4)* Kubernetes mein Service ka kya role hai — pod delete hone ke baad bhi traffic kyun nahi rukti?
> 2. *(M5)* Ek pod ka `requests.memory: 128Mi` aur `limits.memory: 256Mi` set hai — yeh pod kaunsi QoS class mein aayega aur memory pressure pe kaunse pod ke baad evict hoga?
> 3. *(M8)* "p99 latency = 2s" aur "average latency = 200ms" — dono mein se interviewer ko kaun sa metric zyada batata hai, aur kyun?
>
> <details markdown="1"><summary>Jawab</summary>
>
> 1. Service = fixed ClusterIP + DNS name; selector se Ready pods ko traffic route hota hai. Pod IP change ho ya pod delete ho — Service name same rehta, kube-proxy new pod ko EndpointSlice mein add karta hai. &nbsp; 2. Burstable (requests < limits). Guaranteed ke baad, BestEffort se pehle evict hoga. &nbsp; 3. p99 — average mein outliers chhup jaate hain; p99 batata hai worst 1% users ki experience jo sabse zyada feel karte hain.
> </details>

## The 60-second version

Six machines (apiserver, etcd, scheduler, controller-manager, kubelet, kube-proxy) run independent reconciliation loops watching the same shared source of truth (etcd). None waits for a boss — each checks desired vs actual and acts. `kubectl apply` is just you writing a new "desired" into that truth. Every component responds within milliseconds.

Traffic reaches a pod only when it passes a readiness probe. When you pull the plug on a pod, Kubernetes removes it from the load-balancer slice *and* sends it SIGTERM — but these two events race, so a `preStop: sleep` is the production-grade fix. QoS classes decide which pod dies first when RAM runs out. HPA adds replicas using a ceiling-division formula, but refuses to remove them for five minutes to avoid flapping. RBAC constrains what each identity *inside* the cluster can touch. Ingress translates Host headers to backend Services. StatefulSets give each replica a persistent disk that survives pod restarts.

That is the full surface. Read on for the internals.

---

## A. Control Plane & the `kubectl apply` Journey

### The five actors (plus two)

| Actor | Node | Responsibility | Port |
|---|---|---|---|
| **kube-apiserver** | Control-plane | Every request gateway — kubectl, components, kubelet all talk *only* to this | 6443 |
| **etcd** | Control-plane | Distributed key-value store; cluster's only persistent truth | 2379 (client), 2380 (peer) |
| **kube-scheduler** | Control-plane | Assigns unscheduled pods to nodes (resources, taints, affinity) | — |
| **kube-controller-manager** | Control-plane | Runs all reconciliation loops (Deployment, ReplicaSet, Node, EndpointSlice, …) | — |
| **kubelet** | Every node | Reads pod specs; tells containerd to start/stop containers; reports status back | 10250 |
| **kube-proxy** | Every node | Programs iptables / IPVS rules so Service IPs route to real pod IPs | — |
| **containerd** | Every node | The actual container runtime (pulls images, runs Linux namespaces/cgroups) | — |

> **Rule:** Only apiserver touches etcd directly. All other components talk to apiserver, which reads/writes etcd. Break this rule mentally and you will misdiagnose cluster failures.

🇮🇳 **Hinglish intuition:** Office analogy — apiserver = reception desk (sab isse baat karte), etcd = company ki register (sach yahaan likha hai), scheduler = seating manager (kaun kahan baithega), controller-manager = chowkidar (har cheez check karta), kubelet = floor worker (actual kaam karta), kube-proxy = trafficwala (call forward karta).

### The seven-step `kubectl apply` journey

```
You                Control Plane                        Worker Node
─────────────────────────────────────────────────────────────────────
1. kubectl apply ──► apiserver validates YAML
                         │
                    2. apiserver writes Deployment → etcd
                         │
                    3. Deployment controller watches etcd
                       sees "need ReplicaSet" → creates it → etcd
                         │
                    4. ReplicaSet controller watches
                       sees "need 2 pods, have 0" → creates Pod objects → etcd
                         │
                    5. Scheduler watches etcd
                       sees 2 unscheduled pods → assigns each to a worker node
                       writes nodeName onto Pod object → etcd
                         │
                                          6. kubelet (worker) watches apiserver
                                             sees pod assigned to it
                                             calls containerd → pulls image → starts container
                                          │
                                          7. kubelet writes status (Running/Ready) → apiserver → etcd
```

Each arrow is a **watch** (long-poll/gRPC stream from etcd), not a cron poll. Events are pushed; response is sub-second end-to-end on healthy clusters.

### etcd internals: Raft quorum, SPOF, backup

**Raft consensus** requires a quorum: majority of nodes must agree before a write commits. With 3 etcd nodes, 2 must be alive (survives 1 failure). With 5, survives 2. The rule: always deploy odd numbers (1/3/5) — even numbers buy zero extra fault tolerance.

```
3-node etcd (port :2380 peer, :2379 client)

  [etcd-1]  ◄──── Raft ────►  [etcd-2]
      └──────── Raft ─────────►  [etcd-3]

Write: leader gets request → replicates to follower → majority ACK → commit
Read (linearizable): always goes to leader
```

> **Single control-plane = SPOF.** The capstone runs one control-plane node. Production clusters run 3 or 5. etcd backup: `etcdctl snapshot save /backup/snap.db` — treat it like Terraform state (lose it = cluster amnesia).

#### The restore drill — an untested backup is not a backup

Taking the snapshot is the easy half. The half that actually saves you is the one nobody rehearses:

```bash
export ETCDCTL_API=3
CERTS="--cacert=/etc/kubernetes/pki/etcd/ca.crt \
       --cert=/etc/kubernetes/pki/etcd/peer.crt \
       --key=/etc/kubernetes/pki/etcd/peer.key"

# 1. BACKUP (cron this — and ship it OFF the node)
etcdctl snapshot save /backup/etcd-$(date +%F).db --endpoints=https://127.0.0.1:2379 $CERTS
etcdctl snapshot status /backup/etcd-$(date +%F).db --write-out=table   # verify it is readable

# 2. RESTORE (disaster) — restores into a NEW data dir, it does not overwrite in place
sudo mv /etc/kubernetes/manifests /etc/kubernetes/manifests.bak   # stop static pods (apiserver+etcd)
sudo etcdctl snapshot restore /backup/etcd-2026-07-17.db \
  --data-dir=/var/lib/etcd-restored

# 3. point etcd at the restored dir, then bring the control plane back
sudo sed -i 's#/var/lib/etcd#/var/lib/etcd-restored#' /etc/kubernetes/manifests.bak/etcd.yaml
sudo mv /etc/kubernetes/manifests.bak /etc/kubernetes/manifests   # kubelet restarts the static pods

# 4. VERIFY (this is the step that proves the backup was real)
kubectl get nodes && kubectl get pods -A
```

!!! danger "The three things that make backups fail when you need them"
    1. **Never restored it.** A snapshot you have never replayed is a hypothesis, not a backup. Rehearse quarterly on a throwaway cluster.
    2. **Stored on the same disk/node.** If the node dies (or the disk fills — see [ch30's disk-full incident](30-k8s-complete-reference.md)), the backup dies with it. Ship snapshots to S3.
    3. **Snapshot ≠ whole cluster.** etcd holds K8s *objects*. It does **not** hold your **PersistentVolume data** — that needs its own backup (Velero / volume snapshots). Restoring etcd gives you back the PVC *object* pointing at a volume whose contents you never backed up.

> 🇮🇳 **Ek line:** `snapshot save` aasaan hissa hai. Asli sawaal — *"kya tumne kabhi restore karke dekha?"* Aur yaad rakho: **etcd = objects, PV data alag** (Velero chahiye). Untested backup = backup nahi.

**Debug commands — control plane:**
```bash
# Are control-plane components alive? (static pods in /etc/kubernetes/manifests)
kubectl get pods -n kube-system

# Node-level: is kubelet running?
systemctl status kubelet

# Node-level: what containers is containerd running (bypasses apiserver)?
crictl ps

# etcd health
etcdctl endpoint health --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/peer.crt \
  --key=/etc/kubernetes/pki/etcd/peer.key
```

---

## A′. The full wiring — who talks to whom (and how)

Section A told you *what* each component does. This one is the part that separates *"K8s pata hai"* from *"K8s production mein chalaya hai"*: **how they actually connect, who gives the request, who takes it, on which port, over which protocol, and where it breaks at 2 a.m.**

### One analogy that makes ALL of it click: the restaurant 🍽️

Picture the cluster as **one big, busy restaurant**. Every component is a role, and — crucially — everyone follows one communication rule.

| Component | Restaurant role | Its ONE job | How it talks |
|---|---|---|---|
| **etcd** | The **order-book** locked in the back office | Hold the single truth; nightly photocopy = backup | Only the Manager may open it |
| **kube-apiserver** | The **Manager at the pass** | The *only* one who opens the order-book; everyone speaks to them | Checks your ID → permissions → house-rules, then writes |
| **watch** | The **live order-screen (KDS)** everyone stares at | Push new tickets instantly | Manager *pushes*; no one keeps asking "koi naya order?" |
| **kube-scheduler** | The **seating host** | Seat a new party (pod) at the best table (node) | Reads the screen → tells Manager "table = node-2" |
| **kube-controller-manager** | The **shift supervisors** | "Reality = order-book" — 3 chefs on the book, only 2 present → hire one | File requests with the Manager |
| **kubelet** | The **station chef** on each branch | Actually cook the tickets for *my* station; report ready/burnt | Watches the screen; reports to Manager |
| **kube-proxy** | The **floor signage & runners** | "Pasta counter" always reaches an *open* pasta table | Wires the arrows from the screen |
| **Pod** | A **table setting / the dish** | Serve, then get cleared & reset — never repaired | Ephemeral; replaced, not fixed |

> 🇮🇳 **Yeh sentence poora control plane unlock karta hai:** *"Restaurant mein har koi sirf **Manager** se baat karta hai — kabhi seedha order-book se, kabhi ek doosre se nahi. Manager sabki ID check karta, phir order-book mein likhta. Aur ek ulti call bhi hai: jab customer bole 'us station pe abhi kya pak raha dikhao', to **Manager khud us chef ke paas** jaata hai."* → wahi apiserver → kubelet wali `kubectl logs` call hai.

### The golden rule of direction: kaun *client*, kaun *server*

99% confusion isse clear hota hai — **kaun connection *shuru* karta hai:**

- **Almost everyone is a CLIENT of the apiserver.** Scheduler, controller-manager, kubelet, kube-proxy, CoreDNS — sab **apiserver ko outbound connect** karte hain (watch + write ke liye). Wo apiserver ko dhoondte hain, apiserver unhe nahi.
- **Sirf apiserver → etcd** — order-book ka darwaza sirf Manager kholta.
- **Do REVERSE calls** jahan apiserver *khud client* banta: **apiserver → kubelet :10250** (`logs`/`exec`/`port-forward`/metrics) aur **apiserver → admission webhooks**.

```mermaid
flowchart TD
  KC(["kubectl · apps · CoreDNS"]):::ext
  API["kube-apiserver<br/>:6443 HTTPS"]:::api
  ETCD[("etcd<br/>:2379 client · :2380 peer")]:::store
  SCH["scheduler"]:::ctl
  CM["controller-manager"]:::ctl
  KL["kubelet :10250"]:::run
  KP["kube-proxy"]:::net
  CRI["containerd<br/>unix socket"]:::run
  KC -->|"REST · mTLS"| API
  API <-->|"gRPC · mTLS · ONLY door"| ETCD
  SCH -->|"watch pods · POST binding"| API
  CM -->|"watch · reconcile"| API
  KL -->|"watch my pods · POST status"| API
  KP -->|"watch svc + endpointslices"| API
  API -.->|"REVERSE · logs/exec :10250"| KL
  KL -->|"CRI · gRPC"| CRI
  classDef ext fill:#e8eaf6,stroke:#3f51b5,color:#1a237e;
  classDef api fill:#e3f2fd,stroke:#1976d2,color:#0d47a1;
  classDef store fill:#fff3e0,stroke:#ef6c00,color:#e65100;
  classDef ctl fill:#ede7f6,stroke:#5e35b1,color:#311b92;
  classDef run fill:#e0f2f1,stroke:#00897b,color:#004d40;
  classDef net fill:#f3e5f5,stroke:#8e24aa,color:#4a148c;
```

*Har arrow ek client→server connection hai. Sab apiserver pe converge karte; sirf ek ulta teer (apiserver → kubelet).*

### The connection matrix (give request / take request)

| Client (request deta) | → Server (leta) | Port | Protocol | Kya maangta | Auth |
|---|---|---|---|---|---|
| `kubectl` / apps | **apiserver** | **6443** | HTTPS/REST | CRUD + watch objects | kubeconfig cert / SA token (mTLS) |
| **apiserver** | **etcd** | **2379** | gRPC | read/write state | etcd client cert (mTLS) |
| etcd | etcd peers | **2380** | gRPC | Raft consensus | peer certs |
| **scheduler** | apiserver | 6443 | HTTPS (watch) | unscheduled pods → POST Binding | client cert |
| **controller-manager** | apiserver | 6443 | HTTPS (watch) | reconcile read/write | client cert |
| **kubelet** | apiserver | 6443 | HTTPS (watch) | *"mere node ke pods"* → POST status | node cert `system:node:<name>` |
| **kube-proxy** | apiserver | 6443 | HTTPS (watch) | Services + EndpointSlices | SA token |
| **apiserver** | **kubelet** | **10250** | HTTPS | `logs`/`exec`/metrics | apiserver client cert |
| kubelet | **containerd** | unix sock | gRPC (CRI) | pull image · start/stop | local socket perms |

### How they actually "talk" — the live order-screen (`watch`)

Components apiserver ko poll **nahi** karte (*"kuch naya? kuch naya?"* — apiserver mar jaayega). Instead — **list-watch**:

```mermaid
sequenceDiagram
  participant C as controller/kubelet
  participant A as apiserver
  participant E as etcd
  C->>A: LIST pods (all + resourceVersion)
  A->>E: read
  A-->>C: all pods + RV=1050
  C->>A: WATCH pods since RV=1050 (long-lived stream)
  Note over A,C: connection OPEN (HTTP2 / chunked)
  E-->>A: pod changed → RV=1051
  A-->>C: push event: MODIFIED pod
  Note over C: local cache (informer) → work-queue → reconcile
```

- **LIST** = ek baar pura snapshot + ek **`resourceVersion`** (yeh etcd ka revision number hai).
- **WATCH** = us RV se aage har change (**ADDED/MODIFIED/DELETED**) ek **open connection** pe *push* — polling nahi.
- Client ise **informer + local cache + work-queue** mein rakhta → har controller ke paas apni in-memory copy (apiserver pe load kam).
- Watch peechhe reh gaya (`410 Gone — too old resource version`)? Client dobara **re-LIST** karta. Yeh **level-triggered** hai — controller *current desired state* pe react karta, missed events se nahi tootta.

> 🇮🇳 **Bada insight:** apiserver **stateless** hai — saara sach etcd mein. Isliye apiserver ki latency ≈ **etcd ki disk latency**. Slow etcd disk = *poora* cluster slow. (`etcd_disk_wal_fsync_duration_seconds` watch karo.)

### Har hop mTLS hai — aur yahan sabse bada production gotcha

Upar ka har arrow **TLS (aksar mutual TLS)** pe — dono side certificate se verify. kubeadm mein certs `/etc/kubernetes/pki/`, kubeconfigs `/etc/kubernetes/*.conf`.

!!! danger "The #1 self-managed cluster outage every 2–3 yr engineer eventually hits"
    **kubeadm ke certs sirf 365 din valid.** Saal baad kubelet ↔ apiserver ek doosre ko trust karna band → **nodes NotReady, `kubectl` dead, cluster "achanak" tut gaya.** Managed K8s (EKS/GKE) isse handle karta; self-managed pe *tumhara* dard hai.
    ```bash
    kubeadm certs check-expiration     # kab expire?
    kubeadm certs renew all            # renew → control-plane restart
    ```

Identity ka role: **kubelet → apiserver** node-identity `system:node:<name>` (group `system:nodes`) se — **Node Authorizer + NodeRestriction** ensure karta ek node sirf apne pods dekhe (blast-radius chhota). **Pods → apiserver** projected **ServiceAccount JWT** (`/var/run/secrets/kubernetes.io/serviceaccount/token`) se, `kubernetes.default.svc` pe.

### Node ke andar ki plumbing (station chef ke tools)

kubelet do "neeche" wale layers se **local unix-socket gRPC** pe baat karta (network nahi):

```
kubelet ──CRI (gRPC · /run/containerd/containerd.sock)──▶ containerd ──▶ runc   (container start)
kubelet ──CNI (binary: /opt/cni/bin/<plugin>)──────────▶ Calico/Cilium         (pod ko IP milta)
kubelet ──CSI (gRPC · unix socket)─────────────────────▶ EBS/EFS driver        (volume attach+mount)
```

**CRI** = kubelet↔containerd ka contract · **CNI** = container ban-ne ke baad pod ko IP + routing · **CSI** = storage attach.

### Production connection gotchas — jo actually debug karni padti hain

| Symptom | Asli wajah (connection) | Check |
|---|---|---|
| `kubectl` hang / cluster frozen | apiserver down ya etcd quorum lost | `crictl ps`, etcd health, apiserver logs |
| Nodes **NotReady** | kubelet → apiserver :6443 block (network/cert) | node se `curl -k https://<api>:6443` · `journalctl -u kubelet` |
| `kubectl logs`/`exec` **hang** | apiserver → kubelet **:10250** block (SG/firewall) | control-plane → nodes :10250 rule kholo |
| Sab slow (p99 spike) | **etcd disk latency** | fast SSD · `etcd_disk_wal_fsync_duration` |
| Cluster "achanak" tut gaya (~1 saal) | **certs expire** | `kubeadm certs check-expiration` |
| Pods Pending | scheduler down / no fitting node | `kubectl describe pod` (events) |
| Pod-to-pod / DNS fail | CNI / CoreDNS / SG (overlay port) | Calico IPIP=proto 4 · BGP :179 · CNI pods |

> 🇮🇳 **AWS self-managed pe firewall/SG rule (interview classic):** nodes → apiserver **6443**, apiserver → nodes **10250**, etcd **2379-2380** (control-plane aapas mein), CNI overlay (Calico IPIP / BGP 179). Ek rule missing = *"cluster half-working"* — wahi 2 baje wala incident.

**⚡ 20-second recall:** *Sab apiserver ke client · sirf apiserver → etcd (mTLS gRPC 2379) · talk = LIST+WATCH (push, not poll) · resourceVersion = etcd revision · ulti call apiserver → kubelet 10250 (logs/exec) · har hop mTLS · kubeadm certs 365 din · etcd slow = sab slow, etcd = backup #1.*

---

## B. Networking Internals

Before the pieces (CNI, Service, kube-proxy, CoreDNS) — here's the whole journey as **one story**, so the pieces below click as parts of a single path instead of isolated facts.

### 🏙️ The unifying analogy: a city with a postal system

You never mail a person's **home address** (a pod IP) — it changes when they move. You mail the **PO Box**; a **directory** tells you the box number; a **clerk's rules** forward it to whoever's **on shift**; and the **roads** carry it there.

| K8s thing | Postal role | The point |
|---|---|---|
| **Pod IP** | Home address | Ephemeral — never address it directly |
| **Service (ClusterIP)** | **PO Box + phone number** | Stable; forwards to on-shift staff |
| **CoreDNS** | **Directory (411)** | Service name → the ClusterIP |
| **EndpointSlice** | **Staff roster** | Which pods are *ready* right now |
| **kube-proxy** | **Mailroom clerk** | Writes the forwarding rules (once) |
| **iptables / IPVS** | **Sorting-machine rules** (kernel) | Do the per-packet DNAT |
| **CNI** | **Roads + postal network** | Connect every home so any can reach any |
| **Ingress** | **City front gate / receptionist** | Route outside visitors by host/path |

> **One-sentence unlock:** *A pod calls a **Service name** → **CoreDNS** returns the stable **ClusterIP** → **kube-proxy**'s **iptables/IPVS** rules **DNAT** it to a **ready pod IP** from the **EndpointSlice** → the **CNI** carries the packet across nodes.*

### The complete journey — external user to pod

```mermaid
flowchart LR
  U(["🌐 User"]):::ext
  PDNS["Public DNS<br/>(Route 53)"]:::net
  LB["Cloud LB<br/>(ALB/NLB)"]:::net
  ING["Ingress controller<br/>nginx pod · TLS + L7"]:::run
  CDNS["CoreDNS<br/>(internal directory)"]:::net
  SVC["Service<br/>ClusterIP (PO Box)"]:::net
  EP[("EndpointSlice<br/>ready pods")]:::store
  KUBE["kube-proxy rules<br/>iptables/IPVS DNAT"]:::net
  POD{{"orders-api pod"}}:::run
  U -->|"1 · resolve shopfast.com"| PDNS --> U
  U -->|"2 · HTTPS"| LB -->|"3 · node:NodePort"| ING
  ING -.->|"4 · name → ClusterIP"| CDNS
  ING -->|"5 · to Service"| SVC
  SVC --> KUBE
  KUBE -. "picks from" .-> EP
  KUBE -->|"6 · DNAT → pod IP (CNI carries it)"| POD
  classDef ext fill:#e8eaf6,stroke:#3f51b5,color:#1a237e;
  classDef net fill:#ede7f6,stroke:#5e35b1,color:#311b92;
  classDef run fill:#e0f2f1,stroke:#00897b,color:#004d40;
  classDef store fill:#fff3e0,stroke:#ef6c00,color:#e65100;
```

*External users hit **public DNS → cloud LB → Ingress (TLS + host/path)**; from the Service onward it's identical to any internal pod-to-pod call.*

> 🇮🇳 **Golden debug reflex:** *"Service pe traffic nahi aa raha"* → hamesha pehle **`kubectl get endpointslices`** dekho. **Khaali = koi ready pod nahi** (readiness fail ya selector mismatch). Yahi ~80% "Service down" incidents hai. → 502/503 = no ready backends.

**Now the pieces, in detail:**

### CNI (Container Network Interface) — cross-node pod routing

**Problem:** Pod-A is on worker-1 (10.0.1.10). Pod-B is on worker-2 (10.0.1.11). Their pod IPs (192.168.x.x) are inside the same flat /16 CIDR — but those IPs do not exist on the physical network between nodes. How does a packet from Pod-A reach Pod-B?

**Answer:** The CNI plugin (Calico is common) installs kernel routes on each node so that each node knows "packets for pod-CIDR of worker-2 go out eth0 toward 10.0.1.11". Three main modes:

| Mode | Mechanism | Tradeoff |
|---|---|---|
| **BGP** (Calico native) | Real kernel routes via BGP advertisements — no encapsulation | Fastest; requires L2/L3 reachability between nodes |
| **Overlay (IPIP / VXLAN)** | Wraps pod packet inside a host packet — works on any underlay | ~5–10% throughput overhead; universal compatibility |
| **eBPF dataplane** (Calico/Cilium) | Replaces kube-proxy entirely; kernel programs via eBPF hooks | Lowest latency; best observability; newer, needs kernel ≥5.3 |

> **Without CNI:** `kubeadm init` completes but CoreDNS pods stay `Pending` and nodes stay `NotReady`. Fix: `kubectl apply -f calico.yaml` immediately after init.

🇮🇳 **Hinglish intuition:** CNI = inter-city highway. Har pod ek ghar hai. Bina highway ke sirf apne mohalle (node) mein jaa sakte ho. CNI highways banata hai node se node tak — har ghar se har ghar seedha.

#### The postal analogy — VXLAN vs BGP, step by step

The mode table above is precise but terse. Here is the same thing in a way that sticks — because *where* each mode applies is what trips people up.

**Set the scene (three separate networks — never confuse these):**

```
1. Node network    192.168.1.x   ← real machines (physical)
2. Pod network     10.244.x.x    ← pods (virtual)      ← the hard part
3. Service network 10.96.x.x     ← services (virtual)
```

Each node owns a **slice** of the pod network, so the IP itself tells you the node:

```
Node A  →  10.244.0.0/24   (a pod here is 10.244.0.x)
Node B  →  10.244.1.0/24   (a pod here is 10.244.1.x)
         └─ the middle octet = which node
```

**The core problem:** a pod's IP (`10.244.1.8`) only means something *inside* Kubernetes. The physical network between nodes only understands **node IPs** (`192.168.1.x`). So how does a pod-to-pod packet cross that gap?

**Restaurant / postal analogy:**

```
Pod-1 writes a letter to Pod-2  (inner address: 10.244.1.8)
        ↓
But the postman only knows BUILDING addresses (192.168.x)
        ↓
CNI = the receptionist. Two ways it can help:
```

| | 📦 **VXLAN (overlay)** | 🗺️ **BGP (routing)** |
|---|---|---|
| What the receptionist does | puts the letter **inside a bigger envelope** addressed "Building B" | hands the postman a **map** once, so they route it directly |
| Applied **where** | on **every packet**, at runtime (kernel wraps it) | in each node's **routing table**, **once** (routes shared, then nothing per-packet) |
| Extra header | yes (~50 bytes/packet) | none |
| Needs from the network | **nothing** — works on any underlay | the network must be able to route pod IPs |
| Speed | slightly slower (wrap/unwrap) | faster |
| Pick it when | cloud / mixed / "just make it work" | performance-critical, you control the network |
| Real examples | **Flannel**, Calico-VXLAN | Calico-BGP, Cilium |

**Where does the CNI itself run?** On **every node**, as a **DaemonSet** ([ch30 · DaemonSet](30-k8s-complete-reference.md)) — "one pod per node." That agent (a) programs the node's routing table and (b) does the wrap/unwrap (VXLAN) or pure routing (BGP). See it in any cluster:

```bash
kubectl get pods -n kube-system | grep -iE "flannel|calico|cilium|kindnet"
```

**The cross-node packet journey (VXLAN):**

```
① Pod-1 (10.244.0.5, Node A) → packet "to: 10.244.1.8"
② out of the pod via its veth pair to Node A
③ Node A routing table: "10.244.1.x lives on Node B (192.168.1.20)"
④ CNI WRAPS it:  [ outer: nodeA→nodeB (192.168.x) [ inner: pod1→pod2 (10.244.x) ] ]
⑤ physical network carries it (sees only node IPs)
⑥ Node B UNWRAPS → recovers the original pod packet
⑦ Node B: "10.244.1.8 is my local pod" → veth → Pod-2
```

With **BGP** there is no step ④/⑥ — the routes were shared ahead of time, so the packet travels **as-is**, the network already knowing where `10.244.1.x` lives.

> 🇮🇳 **Ek line:** VXLAN har packet ko **lifafe mein wrap** karta (network ko pod IP jaanne ki zaroorat nahi — kahin bhi chalta, thoda slow). BGP nodes ke beech **routes share** karta (network khud pod IP tak pahunchata — fast, par network support chahiye). Dono **har node ke CNI agent** (DaemonSet) chalate hain.

> ⚠️ **Your projects:** VANTA runs **Flannel (VXLAN overlay)** — portable, runs anywhere, but see the MTU and NetworkPolicy gotchas below (both bite Flannel specifically). Managed EKS often uses **VPC-native routing** — AWS's own network knows the pod IPs, so no wrapping is needed at all.

#### Your two projects picked two different CNIs — and it was the right call each time

This is the clearest possible illustration of *why CNI choice matters*, because your own repos made opposite choices for opposite reasons:

| | 🅰️ **VANTA-Boutique** | 🅱️ **billfree-techops** |
|---|---|---|
| CNI | **Flannel** (VXLAN overlay) | **Calico v3.28.0** |
| Installed by | Ansible playbook (`ansible/playbook.yml`) | cloud-init (`kubectl apply -f calico.yaml` at boot) |
| **NetworkPolicy** | ❌ **silently ignored** | ✅ **enforced** |
| Why this CNI | just needs pods to talk — simple, portable | needs security segmentation between services |

**The deciding factor is NetworkPolicy — and it is not optional trivia for billfree.** billfree ships real network firewall rules in `deploy/platform/networkpolicies.yaml`:

```yaml
kind: NetworkPolicy
  name: default-deny-ingress      # nobody may talk to anyone…
kind: NetworkPolicy
  name: allow-intra-namespace     # …except within the same namespace…
kind: NetworkPolicy
  name: allow-ingress-controller  # …and inbound only via the ingress controller
```

This is a **zero-trust** posture: deny everything, then allow the minimum. It is exactly what a payments platform needs — if `analytics` is ever compromised, it still cannot reach `auth`'s pods, because the NetworkPolicy blocks it at the CNI layer.

**Now the punchline:** had billfree used **Flannel** (like VANTA), those three policies would be **silently ignored**. `default-deny-ingress` would be written, reviewed, and merged — and every pod would still be wide open. A firewall that isn't enforcing is worse than no firewall, because you *believe* you're protected. **billfree chose Calico precisely so its NetworkPolicies actually mean something.**

> 🇮🇳 **Ek line — dono projects:** VANTA ko sirf **connectivity** chahiye thi → Flannel kaafi (simple, portable). billfree ko connectivity **+ firewall (NetworkPolicy)** chahiye thi → **Calico zaroori**, kyunki Flannel NetworkPolicy enforce hi nahi karta. *Same problem, alag zaroorat, alag CNI — aur dono sahi.*

> ⭐ **Interview answer:** *"CNI ka choice zaroorat pe depend karta. Sirf pods connect karne hain → Flannel (simple, kahin bhi). NetworkPolicy / security segmentation chahiye → Calico ya Cilium — kyunki Flannel NetworkPolicy implement hi nahi karta, apply karo to silently ignore hoti hai. Mere do projects mein exactly yahi split hai: VANTA=Flannel (connectivity), billfree=Calico (zero-trust NetworkPolicy)."*

> 💡 **Same-node is different:** two pods on the *same* node never leave it — `Pod-A → veth → node bridge → veth → Pod-B`, pure in-kernel, **no wrap**. Encapsulation only happens **cross-node**. That's why same-node calls are a touch faster.

#### How a pod actually gets its IP

**The apartment-building analogy:**

| Real world | K8s equivalent |
|---|---|
| **Building** | **Node** — the physical or virtual machine running many pods |
| **Apartment** | **Pod** — each pod gets its own **network namespace** (netns): its own `eth0`, its own routing table, isolated from every other pod on the same node |
| **Two-ended pipe** connecting flat to hallway | **veth pair** — a virtual cable: one end (`eth0`) lives inside the pod's netns; the other end plugs into the **node bridge** (`cni0` / `cbr0`) |
| **Building manager handing out apartment numbers** | **IPAM** (IP Address Management) — the CNI plugin allocates a unique IP from this node's slice of the pod CIDR (e.g. node-1 owns `10.244.1.0/24`, node-2 owns `10.244.2.0/24`) |

**The assignment flow — what happens between `kubectl apply` and `eth0` existing inside the pod:**

```mermaid
flowchart LR
  KL["kubelet"]:::run
  PAUSE["pause container<br/>(holds the netns)"]:::run
  CNI["CNI plugin<br/>(/opt/cni/bin/)"]:::net
  IPAM["IPAM<br/>(allocate from<br/>node CIDR slice)"]:::store
  VETH["veth pair<br/>(eth0 in pod<br/>peer on node bridge)"]:::net
  READY["Pod has eth0<br/>and a routable IP"]:::run

  KL -->|"1 · create pause container"| PAUSE
  PAUSE -->|"2 · netns ready"| CNI
  CNI -->|"3 · allocate IP"| IPAM
  IPAM -->|"4 · IP returned"| VETH
  VETH -->|"5 · configure IP and routes"| READY

  classDef run fill:#e0f2f1,stroke:#00897b,color:#004d40;
  classDef net fill:#ede7f6,stroke:#5e35b1,color:#311b92;
  classDef store fill:#fff3e0,stroke:#ef6c00,color:#e65100;
```

*kubelet → pause container (holds the netns) → CNI ADD → IPAM (allocate from node's pod CIDR slice) → veth pair + IP + routes → pod has eth0.*

**Step by step:**

1. **kubelet** creates the *pause* (infra) container first. Its only job: hold the pod's **network namespace** open. All application containers in the pod then join this same namespace — that is why every container in a pod shares the same IP and `localhost`.
2. kubelet calls the **CNI plugin binary** (`/opt/cni/bin/calico`, `flannel`, `cilium`, …) with a JSON **`CNI ADD`** request.
3. The plugin calls its **IPAM** backend (host-local, Calico's etcd, etc.), which returns a free IP from the **node's allocated CIDR slice**.
4. The plugin creates a **veth pair**: `eth0` inside the pod's netns and a peer interface (e.g. `cali<hash>` or `veth<hash>`) attached to the **node bridge** (`cni0` / `cbr0`). The IP and default route are written into the pod's netns.
5. The pod can now send and receive packets.

**Same-node vs cross-node (cross-link):**

- **Same-node:** `Pod-A eth0` → veth → node bridge → veth → `Pod-B eth0`. Pure in-kernel bridging; no encapsulation, full MTU available.
- **Cross-node:** packet exits the bridge and hits the CNI's cross-node routing — overlay (VXLAN/IPIP) or BGP, as described in the mode table earlier in this section.

**NetworkPolicy is enforced by the CNI plugin:** Calico and Cilium install kernel hooks (eBPF or iptables) at the veth interface to enforce NetworkPolicy rules. **Flannel does not implement NetworkPolicy** — if you apply NetworkPolicy objects on a Flannel cluster, they are silently ignored and all pod traffic remains permitted.

!!! danger "MTU mismatch — big payloads hang; health checks pass; TLS handshakes stall"
    Overlay encapsulation (VXLAN or IPIP) adds **~50 bytes** of header to every packet. If the pod `eth0` MTU stays at the default **1500**, any pod packet near the 1500-byte mark becomes too large once the overlay header is prepended — it is silently dropped or fragmented at the underlay.

    **The deceptive pattern:** small HTTP requests and DNS (small UDP) work perfectly. Large REST responses, TLS `ClientHello` + certificate exchange, and gRPC streams intermittently stall. Everything appears fine until traffic carries real payloads or is tested under load.

    ```bash
    # Inside any pod — check eth0 MTU
    kubectl exec -it <pod> -- ip link show eth0
    # healthy on VXLAN cluster:  "mtu 1450" — NOT 1500
    # mtu 1500 on an overlay cluster → MTU mismatch confirmed
    ```

    **Fix:** configure the CNI MTU to `hostMTU − overhead`:
    - Calico VXLAN → `1450` · Calico IPIP → `1480` · Cilium VXLAN → `1450`
    - Calico: `vethMTU` in `FelixConfiguration`; Flannel: `Backend.MTU` in the `kube-flannel-cfg` ConfigMap

    MTU mismatch is the classic *"works on dev, breaks under real load"* cluster bug. Always check `ip link` inside a pod when TLS handshakes or large payloads are unreliable while small requests succeed.

### Service → EndpointSlice → pod (with kube-proxy)

```
kubectl apply Service (selector: app=api)
        │
        ▼
EndpointSlice controller watches:
  "which pods match selector AND are Ready?"
        │
        ▼
EndpointSlice object: [ pod-A:8080, pod-C:8080 ]
  (pod-B excluded: readiness probe failing)
        │
        ▼
kube-proxy on every node reads EndpointSlice
  programs iptables/IPVS rules:
  "ClusterIP:80 → DNAT → one of [pod-A:8080, pod-C:8080]"
        │
        ▼
Traffic from any pod/node → ClusterIP:80 → real pod
```

**EndpointSlice vs legacy Endpoints:**

| Feature | Endpoints (legacy) | EndpointSlice (default since K8s 1.21) |
|---|---|---|
| Max entries per object | unbounded (performance cliff) | ~100 per slice |
| Scale | O(n) updates on any pod change | Only affected slice updated |
| Protocol support | TCP/UDP | TCP/UDP/SCTP |
| Topology hints | No | Yes (zone-aware routing) |
| Debug command | `kubectl get endpoints` | `kubectl get endpointslices` |

🇮🇳 **Hinglish intuition:** EndpointSlice = abhi kaun apne desk pe ready hai ki live list. Service clerk hai — woh list dekh ke call forward karta hai sirf ready logon ko.

**iptables vs IPVS:**

| | iptables | IPVS (IP Virtual Server) |
|---|---|---|
| Data structure | Linked list of rules | Hash table |
| Lookup time | O(n) — slows with cluster size | O(1) hash lookup |
| 1,000-service cluster | Noticeable latency | Negligible |
| Load-balancing algos | Round-robin only | RR, least-conn, source-hash |
| Default | Yes (most clusters) | Opt-in via kube-proxy `--proxy-mode=ipvs` |

> For >500 Services, switch to IPVS. iptables with 10,000+ rules adds measurable per-packet overhead.

### CoreDNS — Service DNS

Every Service gets a DNS name: `<service>.<namespace>.svc.cluster.local`

```
# From a pod, same namespace:
curl http://api-service/endpoint         # short name, same namespace

# Cross-namespace:
curl http://api-service.payments.svc.cluster.local/endpoint

# CoreDNS lives at:
kubectl get svc -n kube-system kube-dns  # typically 10.96.0.10

# Pod's /etc/resolv.conf (set by kubelet):
nameserver 10.96.0.10
search default.svc.cluster.local svc.cluster.local cluster.local
```

**Debug DNS failures:**
```bash
# From inside a running pod:
kubectl exec -it <pod> -- nslookup api-service
kubectl exec -it <pod> -- nslookup api-service.default.svc.cluster.local

# Is CoreDNS itself healthy?
kubectl get pods -n kube-system -l k8s-app=kube-dns
kubectl logs -n kube-system -l k8s-app=kube-dns
```

🇮🇳 **Hinglish intuition:** Phone contact list. Number (IP) yaad nahi rakhte — naam se call karte. CoreDNS = cluster ka contacts app. Naam likho, IP automatically milta.

### Ingress + TLS — production HTTP routing

**Why not NodePort for production?**
NodePort (`30000–32767`) exposes a raw TCP port on every node. No TLS termination. No host-based routing. No path-based routing. You get one port per Service. For production HTTP/HTTPS with multiple services, you need Ingress.

```
Internet
   │ :443 (HTTPS)
   ▼
[ Load Balancer / NodePort ]
   │
   ▼
[ Ingress Controller — nginx pod(s) ]
   │  reads all Ingress objects in cluster
   │  programs nginx.conf dynamically
   │
   ├── Host: api.example.com   → Service: api-svc:80
   ├── Host: app.example.com   → Service: frontend-svc:80
   └── Host: api.example.com/admin → Service: admin-svc:80
```

**Ingress resource YAML (example):**
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-ingress
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - api.example.com
    secretName: api-tls-secret      # cert-manager writes cert here
  rules:
  - host: api.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: api-svc
            port:
              number: 80
```

**cert-manager + Let's Encrypt flow:**
```
cert-manager watches Ingress objects
   │ sees annotation: cert-manager.io/cluster-issuer
   │
   ▼
Creates CertificateRequest → ACME challenge
   │ Let's Encrypt validates domain (HTTP-01 or DNS-01)
   │
   ▼
TLS certificate stored in Kubernetes Secret (api-tls-secret)
   │
   ▼
nginx Ingress Controller reads Secret → terminates TLS → forwards HTTP internally
```

> **Production gotcha "404 from nginx / Host header not matched":** If you `curl http://<node-ip>:30080/` but your Ingress rule says `host: api.example.com`, nginx cannot match the request — it returns 404 or the nginx default page. Fix: send the correct Host header (`curl -H 'Host: api.example.com' ...`) or set up real DNS. The Ingress controller routes on the HTTP `Host:` header, not the IP.

> 🔧 **War story:** `curl http://<node-ip>:30080/api/` pe nginx ka default page aa raha tha — backend pods bilkul theek the; culprit tha `Host:` header jo request mein absent tha, Ingress rule se match nahi kiya. `curl -H 'Host: api.example.com' ...` se 200 mila, phir samjha. Poori kahani + lesson → [Interview Bank](14-interview-bank.md).

**Debug Ingress:**
```bash
kubectl get ingress                        # shows ADDRESS (load balancer IP)
kubectl describe ingress api-ingress       # shows rules + backend status
kubectl logs -n ingress-nginx deploy/ingress-nginx-controller  # nginx error logs
kubectl get certificate                    # cert-manager certificate status
kubectl describe certificate api-tls-secret  # see ACME challenge progress
```

### NetworkPolicy — pod-to-pod firewall inside the cluster

By default, every pod can talk to every other pod in the cluster — a flat allow-all network. NetworkPolicy lets you add firewall rules *inside* K8s.

> NetworkPolicy complements AWS Security Groups: SGs operate at the *node* (EC2 instance) level. NetworkPolicy operates at the *pod* level — same node, different pods can be isolated.

```yaml
# Default-deny all ingress to namespace
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: payments
spec:
  podSelector: {}          # matches ALL pods in namespace
  policyTypes:
  - Ingress                # deny all inbound; no ingress rules = deny all

---
# Allow only api pods to reach db pods on :5432
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-api-to-db
  namespace: payments
spec:
  podSelector:
    matchLabels:
      role: db
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          role: api
    ports:
    - protocol: TCP
      port: 5432
```

**Pattern: default-deny first, then allow-list.** Create `default-deny-ingress` for every namespace, then add explicit allow policies. NetworkPolicy requires a CNI that supports it (Calico, Cilium — not all do).

---

## B2. TLS / HTTPS — how a request is secured

The Ingress section above showed cert-manager's annotation hook and where the certificate lands (a Kubernetes Secret). This section goes inside the TLS protocol itself — the part interviewers ask about when they say "walk me through a HTTPS request."

### The postcard problem + three guarantees

Plain HTTP is a **postcard**: readable by any router, ISP, or cloud provider between sender and receiver. TLS wraps it in a sealed, verified envelope.

| TLS guarantee | What it means | Without it |
|---|---|---|
| **Confidentiality** | Payload encrypted — only client and server can read it | Any network hop reads passwords, tokens, PII |
| **Integrity** | MAC detects tampering — altered bytes are caught | Attacker modifies the response in transit |
| **Authenticity** | Certificate proves the server is who it claims to be | You might connect to an imposter, not your bank |

> 🇮🇳 **Hinglish intuition:** HTTP = postcard (daaiya bhi padh sakta). HTTPS = sealed registered envelope with verified sender stamp — band karo, address confirm karo, phir trust karo.

### The certificate analogy — passport + padlock

- **Certificate = verified passport.** It says "I am api.example.com" and a trusted Certificate Authority (CA) has verified and signed that claim. Like a passport it has an expiry date and an issuer's seal.
- **Asymmetric key pair = public padlock + private key.** The server shares its padlock (public key) freely — anyone can lock something with it. Only the server's private key opens it. Sharing the padlock does not expose the private key.

### Chain of trust

Browsers and operating systems come pre-installed with a small set of **Root CA** certificates they trust unconditionally. A Root CA signs Intermediate CA certificates; Intermediate CAs sign your domain's leaf certificate. The server must send both the leaf cert AND the intermediate — the browser walks the chain to the trusted root.

```mermaid
flowchart TD
  ROOT["Root CA<br/>pre-installed in OS and browser"]:::ok
  INT["Intermediate CA<br/>signed by Root CA"]:::ctl
  LEAF["Leaf certificate<br/>api.example.com"]:::run
  BROWSER["Browser trust store"]:::net
  ROOT --> INT
  INT --> LEAF
  ROOT -. "pre-installed in" .-> BROWSER
  BROWSER -. "validates chain up to" .-> LEAF
  classDef ok fill:#e8f5e9,stroke:#43a047,color:#1b5e20;
  classDef ctl fill:#e3f2fd,stroke:#1976d2,color:#0d47a1;
  classDef run fill:#e0f2f1,stroke:#00897b,color:#004d40;
  classDef net fill:#ede7f6,stroke:#5e35b1,color:#311b92;
```

*Root CA trusts the Intermediate; Intermediate signs the leaf cert for your domain; browser validates the full chain back to the pre-installed root.*

> **Classic gotcha — "works in browser, fails in `curl`":** Browsers cache intermediate certificates from previous visits. `curl` needs the full chain in the server response. If the server only sends the leaf cert (missing intermediate), `curl` returns `SSL certificate problem: unable to get local issuer certificate` even while the browser shows a padlock.

### Symmetric vs asymmetric — why TLS uses both

| | Asymmetric (ECDHE) | Symmetric (AES-GCM) |
|---|---|---|
| Key sharing | Public key is safe to share openly | Same key both sides — must be exchanged securely first |
| Speed | Slow — heavy elliptic-curve math | Very fast — hardware-accelerated |
| Role in TLS | Authenticate server + agree on session key | Encrypt the actual HTTP payload |

TLS uses asymmetric crypto to **securely agree** on a symmetric session key, then switches to fast symmetric encryption for all data. **ECDHE (Elliptic-Curve Diffie-Hellman Ephemeral)** generates a fresh key pair per session — even if the server's private key is stolen later, recorded past sessions cannot be decrypted. This property is **forward secrecy**.

### The TLS 1.3 handshake

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server
  C->>S: ClientHello - TLS version + cipher list + SNI hostname
  S->>C: ServerHello - chosen cipher suite
  S->>C: Certificate chain - leaf plus intermediate
  Note over C: verify chain back to trusted Root CA
  C->>S: ECDHE public key share
  S->>C: ECDHE public key share
  Note over C,S: both independently derive the same session key
  C->>S: Finished - first encrypted message
  S->>C: Finished - encrypted
  Note over C,S: encrypted HTTP traffic begins
```

*TLS 1.3 handshake: SNI tells the server which certificate to present; ECDHE establishes a shared session key without ever transmitting it; all traffic after Finished is AES-encrypted.*

**SNI (Server Name Indication):** The client sends the target hostname in cleartext at the very start of the handshake — before any encryption is applied. This lets one load balancer serve TLS certificates for many different domains from a single IP; the server picks the right certificate based on the SNI field.

### TLS termination in Kubernetes

The Ingress controller terminates TLS at the cluster edge:

```
Client → HTTPS :443 → Ingress controller (decrypts) → HTTP → Service → Pod
```

- The TLS certificate lives in a **Kubernetes Secret** (`type: kubernetes.io/tls`) holding `tls.crt` (leaf + intermediate chain) and `tls.key` (private key).
- The Ingress reads `spec.tls[].secretName` and loads the cert into the nginx controller's memory.
- Traffic from the Ingress to backend Services travels as **plain HTTP inside the cluster**.
- For **pod-to-pod encryption**, you need **mTLS via a service mesh** (Istio or Linkerd) — each sidecar proxy handles encryption transparently. This is the same mTLS used by the control plane internally (see section A′).

### cert-manager — automated certificate lifecycle

cert-manager is a Kubernetes controller that automates the full TLS lifecycle: request → issue → store → auto-renew. The Ingress section above covered the annotation; here is the complete flow:

```mermaid
flowchart TD
  ING["Ingress object<br/>cluster-issuer annotation"]:::ctl
  CM["cert-manager<br/>controller"]:::run
  CI["ClusterIssuer<br/>letsencrypt-prod"]:::ok
  ACME["ACME challenge<br/>HTTP-01 or DNS-01"]:::net
  LE["Let's Encrypt CA"]:::ok
  SEC["Kubernetes Secret<br/>tls.crt and tls.key"]:::store
  RENEW["Auto-renew<br/>30 days before expiry"]:::ok
  ING -->|"watches"| CM
  CM --> CI
  CI -->|"initiates"| ACME
  ACME -->|"prove domain ownership"| LE
  LE -->|"issues cert"| CM
  CM -->|"writes"| SEC
  SEC -->|"Ingress controller reads"| ING
  CM -. "schedules" .-> RENEW
  classDef ctl fill:#e3f2fd,stroke:#1976d2,color:#0d47a1;
  classDef run fill:#e0f2f1,stroke:#00897b,color:#004d40;
  classDef ok fill:#e8f5e9,stroke:#43a047,color:#1b5e20;
  classDef net fill:#ede7f6,stroke:#5e35b1,color:#311b92;
  classDef store fill:#fff3e0,stroke:#ef6c00,color:#e65100;
```

*cert-manager watches Ingress annotations, creates an ACME challenge with Let's Encrypt to prove domain ownership, stores the issued certificate in a Secret, and schedules auto-renewal 30 days before expiry.*

**HTTP-01 challenge:** cert-manager creates a temporary HTTP endpoint at `http://<domain>/.well-known/acme-challenge/<token>`. Let's Encrypt fetches this URL to confirm domain ownership. Requires the domain's DNS to point to the cluster's public IP and port 80 to be open inbound.

**DNS-01 challenge:** cert-manager writes a TXT record to your DNS provider (Route 53, Cloudflare) via their API. Let's Encrypt queries the TXT record to confirm ownership. Works for wildcard certs and private clusters where inbound HTTP is not available.

!!! danger "Expired certificate = hard outage, no bypass"
    Browsers reject expired certs with a non-bypassable block — users cannot reach your service at all, not even with a "proceed anyway" click. cert-manager renews 30 days early, but if renewal fails silently (HTTP-01 challenge blocked by a firewall, misconfigured ClusterIssuer, DNS-01 credentials expired), you get zero warning until the cert expires and the site goes dark.
    ```bash
    kubectl get certificate -A              # Ready=True + days until expiry
    kubectl get order,challenge -A          # Pending = ACME challenge stuck
    kubectl describe certificate <name>     # detailed status + last renewal attempt
    ```

**TLS gotchas table:**

| Symptom | Root cause | Fix |
|---|---|---|
| `curl` fails, browser shows padlock | Missing intermediate cert in the server's chain | Ensure `fullchain.pem` in Secret — leaf plus intermediate |
| `SSL: hostname mismatch` | Cert SAN does not include the request hostname | Cert must list `api.example.com` or `*.example.com` in Subject Alternative Name |
| `certificate has expired` | cert-manager renewal failed silently | Check `order` and `challenge` objects; fix HTTP-01 firewall or DNS-01 credentials |
| HTTP-01 challenge stuck `Pending` | Port 80 blocked — Let's Encrypt cannot reach the cluster | Open port 80 on LB and SG; ACME requires inbound HTTP |
| Cert rejected with clock skew error | Server or client clock drifts outside cert validity window | Sync NTP on nodes — common on bare-metal clusters |

**Inspect commands:**
```bash
# What does the server actually present?
curl -vI https://api.example.com 2>&1 | grep -E "subject|issuer|expire|SSL"

# Full chain — shows every cert the server sends and expiry
openssl s_client -connect api.example.com:443 -servername api.example.com \
  | openssl x509 -noout -text | grep -E "Subject|Issuer|Not After"

# cert-manager lifecycle objects
kubectl get certificate,order,challenge -A
kubectl describe certificate api-tls-secret -n default
```

> 🇮🇳 **Hinglish intuition:** cert-manager = dedicated employee jo automatically 30 din pehle passport renewal ke liye apply karta hai. Agar ek baar wrong address (misconfigured issuer) — passport expire, site band, raat ko fix karo.

**Three-sentence interview summary:** TLS provides confidentiality, integrity, and authenticity via a certificate chain rooted in a pre-installed CA. The handshake uses ECDHE asymmetric key exchange to agree on a per-session symmetric key (forward secrecy); all HTTP payload is then AES-encrypted with that key. In Kubernetes, the Ingress controller terminates TLS using a cert stored in a Secret — cert-manager automates the full lifecycle via ACME (Let's Encrypt), renewing 30 days before expiry.

---

## C. Pod Lifecycle & Health

### The three probes — distinct actions, distinct timing

| Probe | Question it answers | Fail action | When it runs |
|---|---|---|---|
| **Startup** | "Has the application finished booting?" | Restarts container (but holds readiness/liveness until it passes) | Only during initial startup |
| **Readiness** | "Is the pod ready to receive traffic right now?" | Removes pod from EndpointSlice — traffic stops, pod stays alive | Entire pod lifetime |
| **Liveness** | "Is the process stuck / deadlocked?" | Restarts container (kills it) | Entire pod lifetime |

```mermaid
flowchart TD
    BOOT["Container<br/>starting up"]:::run
    SP{"Startup Probe<br/>pass?"}:::cd
    READY{"Readiness Probe<br/>pass?"}:::cd
    LIVE{"Liveness Probe<br/>pass?"}:::cd
    TRAFFIC(["In EndpointSlice<br/>traffic ON"]):::run
    NOTRAF(["Removed from<br/>EndpointSlice"]):::warn
    KRESTART(["kubelet restarts<br/>container"]):::warn

    BOOT --> SP
    SP -->|"fail × threshold"| KRESTART
    SP -->|"pass — boot done"| READY
    SP -->|"pass — activates"| LIVE
    READY -->|"pass"| TRAFFIC
    READY -->|"fail"| NOTRAF
    NOTRAF -->|"re-check"| READY
    LIVE -->|"fail × threshold"| KRESTART

    classDef shared fill:#fff9c4,stroke:#f9a825,color:#4a3800;
    classDef cd fill:#f3e5f5,stroke:#8e24aa,color:#4a148c;
    classDef run fill:#e0f2f1,stroke:#00897b,color:#004d40;
    classDef obs fill:#f1f8e9,stroke:#689f38,color:#33691e;
    classDef net fill:#e3f2fd,stroke:#1976d2,color:#0d47a1;
    classDef warn fill:#fdeeee,stroke:#d64545,color:#b23030;
```

*Probe lifecycle: startup probe gates liveness + readiness during slow boot; readiness failure pulls the pod from traffic without killing it; liveness failure restarts the container.*

**Key interaction:** Startup probe blocks liveness and readiness probes until it passes. Without it, a slow-starting app (30-second JVM warmup) gets killed by liveness before it finishes booting → `CrashLoopBackOff` despite correct code.

```yaml
livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 0       # startup probe handles the delay
  periodSeconds: 10
  failureThreshold: 3
  timeoutSeconds: 5

readinessProbe:
  httpGet:
    path: /ready
    port: 8080
  periodSeconds: 10
  failureThreshold: 3

startupProbe:
  httpGet:
    path: /healthz
    port: 8080
  failureThreshold: 30         # 30 × 10s = 300s max boot time allowed
  periodSeconds: 10
```

**Debug probes:**
```bash
kubectl describe pod <name>    # Events section: "Liveness probe failed", "Readiness probe failed"
kubectl get events --field-selector involvedObject.name=<pod>
```

🇮🇳 **Hinglish intuition:** Naya employee analogy. Startup = "training poori hui?" (sirf joining ke waqt). Readiness = "abhi kaam ke liye available ho?" (poori zindagi). Liveness = "behosh to nahi?" (poori zindagi). Teen alag sawaal, teen alag consequences.

> 🔮 **Predict pehle (socho, phir aage padho):** Tum liveness probe ke andar database ka health check daal dete ho. DB thodi slow ho jaati hai. Saare pods ka kya hota hai?

### The liveness footgun — cascading restarts

This is one of the most common production disasters. Do not put external dependency checks in the liveness probe.

```
WRONG: liveness hits /healthz-deep which checks DB connection
   │
   DB hits load spike → response slows to 3s
   │ liveness timeoutSeconds:1 → FAIL
   │
   kubelet restarts ALL pods (liveness failed)
   │
   Restarted pods ALL try to reconnect to DB simultaneously
   │ DB load spikes further
   │ Liveness fails again → ALL pods restart again
   │
   ☠️ Cascading restart loop. DB glitch became full outage.
```

**Rule:**
- **Liveness** = only checks whether *this process itself* is alive/not-deadlocked. An in-process health flag is enough. Never check DB, cache, or external APIs.
- **Readiness** = checks whether the pod is ready to serve traffic, including dependency availability. Readiness failure removes the pod from load balancing (traffic stops) without killing it — the correct response to a slow DB.

🇮🇳 **Hinglish intuition:** Liveness = smoke detector. Chhoti dhuaan pe poori building khali kara di — rescue ke bajaye aur bada haadsa. External dependency ko liveness mein daalna = building-level panic trigger for a neighbour's cigarette.

### QoS classes — who dies first when RAM runs out

K8s derives a QoS (Quality of Service) class from the `requests` and `limits` you set. When node memory pressure occurs, the kubelet evicts in QoS order.

| QoS Class | How to get it | OOM eviction order |
|---|---|---|
| **Guaranteed** | `requests.cpu == limits.cpu` AND `requests.memory == limits.memory` (both set, both equal) | Last to be evicted |
| **Burstable** | `requests < limits`, or only one of cpu/memory set | Middle |
| **BestEffort** | No requests, no limits at all | **First to die** |

```bash
kubectl describe pod <name> | grep "QoS Class"  # shows assigned class
```

> **Critical workloads:** always set `requests == limits` (Guaranteed class). A monitoring pod accidentally left as BestEffort will be the first victim when the node runs hot.

🇮🇳 **Hinglish intuition:** Titanic lifeboat priority. Guaranteed = first class (pehle life-jacket). BestEffort = ticket nahi tha (paani mein pehle). requests/limits hi teri ticket class decide karte hain.

### Graceful shutdown — the other half of zero-downtime

Zero-downtime has two halves: the new pod becoming ready (readiness) and the old pod draining cleanly (graceful shutdown). Both are required.

```
Pod termination sequence:
──────────────────────────────────────────────────────
t=0   kubelet sends SIGTERM to container
      AND
      endpoint controller removes pod from EndpointSlice

Problem: these two events are async.
  SIGTERM may arrive before kube-proxy has propagated
  the slice update to all nodes.
  → New requests still arrive while app is shutting down.
  → App gets SIGTERM and closes → connection reset → 502.

Fix: preStop hook adds a sleep buffer
──────────────────────────────────────────────────────
lifecycle:
  preStop:
    exec:
      command: ["sleep", "5"]   # wait for slice propagation before SIGTERM

Then:
  t=0   preStop hook starts (sleep 5)          ← grace clock ALSO starts at t=0
  t=5   SIGTERM sent (slice already removed → no new traffic)
  t=5   App drains in-flight requests
  t=30  terminationGracePeriodSeconds expires (counted from t=0) → SIGKILL
```

!!! warning "The grace clock starts at pod deletion, not at SIGTERM"
    `terminationGracePeriodSeconds` is measured from **t=0** (pod deletion) — the preStop hook runs *inside* it, not before it. So:

    ```
    actual drain window = terminationGracePeriodSeconds − preStop duration
                        = 30 − 5 = 25s   (not 30s)
    ```

    If your app needs 30s to drain and you add a 5s preStop with the default 30s grace, it gets SIGKILLed with 5s of work left — connections reset, and it looks exactly like the bug you were trying to fix. **Rule:** `terminationGracePeriodSeconds > preStop + worst-case drain time`, with headroom.

```bash
# Check if graceful shutdown is configured:
kubectl get pod <name> -o yaml | grep -A5 lifecycle
kubectl get pod <name> -o yaml | grep terminationGracePeriodSeconds
```

🇮🇳 **Hinglish intuition:** Dukaan band karna. "Closed" sign lagao (slice se hato) — naye customer mat aao. Andar jo hain unhe finish karne do (in-flight requests). Phir shutter girao (SIGKILL). SIGTERM = "andar walon ko niklne do" signal.

### Pod lifecycle phases, conditions, and container states

**Pod phases (top-level status):**

| Phase | Meaning | First debug command |
|---|---|---|
| `Pending` | Not yet scheduled, or image pulling | `kubectl describe pod` (Events) |
| `Running` | At least one container running (may not be Ready) | `kubectl describe pod`, `kubectl logs` |
| `Succeeded` | All containers exited with code 0 (Jobs) | `kubectl logs` |
| `Failed` | Container exited non-zero | `kubectl logs --previous` |
| `Unknown` | kubelet unreachable | `kubectl describe node` |

**Container states (under each container):**

| State | Common reason | Fix direction |
|---|---|---|
| `Waiting: ContainerCreating` | Image pulling | Check image tag, registry auth |
| `Waiting: ImagePullBackOff` | Image not found / registry auth failure | `kubectl describe pod` → check image name, `imagePullSecrets` |
| `Waiting: CrashLoopBackOff` | Container starts then exits | `kubectl logs --previous` |
| `Terminated: OOMKilled (137)` | RAM limit exceeded | Raise limits or fix memory leak |

**READY 0/1:** Container is Running but readiness probe fails. Pod is alive but receiving zero traffic. Check `kubectl describe pod` for readiness probe events.

**CrashLoopBackOff backoff:** 10s → 20s → 40s → 80s → 160s → capped at **300s**. The doubling delay is why a recently-crashed pod seems "fine" but was restarting minutes ago.

---

## D. Autoscaling Internals (HPA)

HPA (Horizontal Pod Autoscaler) scales the *number of pods*. It does not scale nodes (that is Cluster Autoscaler — different component, see `06-M5-sizing-and-cost`).

### The formula

```
desiredReplicas = ceil( currentReplicas × (currentMetricValue / targetMetricValue) )

Example:
  currentReplicas = 3
  currentCPU = 90%
  targetCPU = 50%
  desiredReplicas = ceil(3 × 90/50) = ceil(5.4) = 6
```

### What HPA needs to function

1. **metrics-server** installed in the cluster — it scrapes kubelet for pod CPU/memory every 15s. Without it, `kubectl get hpa` shows `<unknown>/50%` and never scales.
2. **`requests` set on pods** — the percentage is computed as `currentUsage / requests`. Without a request baseline, the percentage cannot be calculated.

```bash
kubectl get hpa                     # shows current metrics and target
kubectl top pods                    # if this works, metrics-server is up
kubectl describe hpa <name>         # full event log of scale decisions
```

### Scale-up fast, scale-down slow

| Direction | Default behavior | Why |
|---|---|---|
| **Scale up** | Immediate (next check cycle, ~15s) | Under-provisioning hurts users now |
| **Scale down** | Waits 300s stabilization window | Prevents "flapping" — remove pods, load comes back, add pods, remove again |

```yaml
spec:
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300   # wait 5 min before removing pods
    scaleUp:
      stabilizationWindowSeconds: 0     # scale up immediately
```

🇮🇳 **Hinglish intuition:** Cruise control. Target speed set karo (CPU 50%). Load badha — system accelerate karta (fast). Load ghata — brakes dheere-dheere lagata (slow, taaki bump par baar-baar accelerate/brake na karna pade = flapping).

---

## E. State & Security

### StatefulSet / PV / PVC lifecycle

**Use StatefulSets when each replica needs its own stable identity and its own persistent disk** — databases, message brokers, distributed stores. Deployments are wrong for these: they share identity and have no persistent disk association.

```
StatefulSet "postgres" (replicas: 3)
  │
  ├── postgres-0  ←── PVC: data-postgres-0  ←── PV (10Gi disk)
  ├── postgres-1  ←── PVC: data-postgres-1  ←── PV (10Gi disk)
  └── postgres-2  ←── PVC: data-postgres-2  ←── PV (10Gi disk)

Ordered startup: 0 starts first, becomes Ready, then 1, then 2.
Ordered delete: 2 first, then 1, then 0.
```

**Stable identity:**
- DNS hostname: `postgres-0.postgres-headless.default.svc.cluster.local`
- This hostname is stable across restarts — if postgres-0 restarts, it comes back as postgres-0 on the same disk.

**PV (Persistent Volume) and PVC (Persistent Volume Claim) lifecycle:**

| Concept | What it is |
|---|---|
| **PV** | A piece of storage in the cluster (provisioned by admin or dynamically) |
| **PVC** | A request for storage by a pod/StatefulSet — binds to a matching PV |
| **StorageClass** | Defines how PVs are dynamically provisioned (e.g., `local-path` on bare clusters, `gp3` on EKS) |

**Critical behavior — deleting a StatefulSet does NOT delete PVCs.** The PVCs (and thus the PVs and the data) survive. This is intentional: data outlives the controller. You must explicitly delete PVCs to free storage.

```bash
kubectl get pvc                        # see all claims and their bound PVs
kubectl describe pvc data-postgres-0   # see binding status and capacity
kubectl get pv                         # see all PVs in cluster

# Dynamic provisioning (StorageClass local-path on bare-metal):
kubectl get storageclass
```

> **Bare cluster gotcha:** Without a StorageClass + provisioner (e.g., `rancher/local-path-provisioner`), PVCs stay in `Pending` forever — no PV is created. Install a provisioner before deploying StatefulSets.

### Storage lifecycle — provision → attach → mount

The section above showed that a PVC binds to a PV. Here is what actually happens under the hood — three sequential stages that explain the majority of storage production incidents.

**The rental-unit analogy:**

| K8s concept | Rental analogy |
|---|---|
| **Pod** | Tenant who needs a room |
| **PVC** | Rental application form |
| **PV** | The actual physical unit |
| **StorageClass** | Rental company — sets disk type, speed, reclaim policy |
| **CSI driver** | Warehouse staff who physically build and deliver the unit |

```mermaid
flowchart LR
  PVC["PVC created<br/>tenant rental form"]:::ctl
  SC["StorageClass<br/>rental company"]:::store
  CSI["CSI driver<br/>createVolume"]:::run
  EBS["EBS volume<br/>one AZ only"]:::store
  NODE["Node<br/>single attach"]:::ok
  POD["Pod filesystem<br/>volume mounted"]:::run
  PVC -->|"1 provision"| SC
  SC --> CSI
  CSI -->|"disk created"| EBS
  EBS -->|"2 attach to node"| NODE
  NODE -->|"3 mount and bind"| POD
  classDef ctl fill:#e3f2fd,stroke:#1976d2,color:#0d47a1;
  classDef store fill:#fff3e0,stroke:#ef6c00,color:#e65100;
  classDef run fill:#e0f2f1,stroke:#00897b,color:#004d40;
  classDef ok fill:#e8f5e9,stroke:#43a047,color:#1b5e20;
```

*Three-stage storage lifecycle: PVC triggers CSI to provision a disk (EBS built in one AZ); the disk attaches to a single node; kubelet formats and bind-mounts it into the pod's filesystem.*

**Stage details:**

- **① Provision:** The StorageClass instructs the CSI driver (`ebs.csi.aws.com`) to call the cloud API and create a disk. EBS volumes are provisioned in **one specific Availability Zone** — baked in at creation time, cannot be changed later.
- **② Attach:** The EBS volume is attached to the node where the pod is scheduled (equivalent to `aws ec2 attach-volume`). EBS is a block device and supports **one node at a time** — it is not a network file system.
- **③ Mount:** kubelet detects the attached block device, formats it if new, and bind-mounts it into the pod's container filesystem at the path specified in `volumeMounts`.

**Access modes:**

| Mode | Code | Meaning | Typical backend |
|---|---|---|---|
| **ReadWriteOnce** | RWO | One node mounts read-write | EBS, local-path — block devices |
| **ReadWriteMany** | RWX | Many nodes mount read-write simultaneously | EFS, CephFS — network file systems |
| **ReadOnlyMany** | ROX | Many nodes mount read-only | Pre-populated datasets, model weights |

> **The "3 replicas can't share one EBS" trap:** A Deployment with `replicas: 3` and a single RWO PVC can only schedule one pod — the other two cannot attach the same EBS volume and stay `Pending`. Use EFS (RWX) for shared storage across pods, or use a StatefulSet with `volumeClaimTemplates` so each replica gets its own dedicated PVC.

!!! danger "Two storage patterns that cause outages or data loss"
    **Multi-Attach error (RWO + pod rescheduling):** A pod is rescheduled to a new node but the old node has not released the EBS attachment — node is slow to drain, or the kubelet crashed. The new pod's start blocks on `Unable to attach or mount volumes` for up to 6 minutes on EKS (the volume-detach timeout). Mitigation: use `volumeBindingMode: WaitForFirstConsumer` on the StorageClass so the disk is always provisioned in the same AZ the pod lands in, reducing reschedule-to-new-AZ scenarios.

    **`reclaimPolicy: Delete` = silent data loss:** The default reclaim policy on most dynamic StorageClasses is `Delete`. When the PVC is deleted, the underlying EBS volume is **immediately and permanently deleted** with no confirmation prompt. For production databases set `reclaimPolicy: Retain` on the StorageClass before first use, or patch individual PVs after provisioning.
    ```bash
    kubectl get storageclass -o yaml | grep reclaimPolicy
    kubectl patch pv <pv-name> -p '{"spec":{"persistentVolumeReclaimPolicy":"Retain"}}'
    ```

**StatefulSet `volumeClaimTemplates` — per-replica stable identity:**

```yaml
volumeClaimTemplates:
- metadata:
    name: data
  spec:
    accessModes: ["ReadWriteOnce"]
    storageClassName: gp3
    resources:
      requests:
        storage: 10Gi
```

This generates PVCs named `data-db-0`, `data-db-1`, `data-db-2`. When the `db-0` pod restarts — even after a crash or node failure — it always re-binds `data-db-0`. The primary always gets its own disk, never a replica's. This stable identity is what makes StatefulSets safe for databases with leader/follower roles.

> 🇮🇳 **Hinglish intuition:** EBS = personal locker (ek banda, ek locker, ek sheher). EFS = shared office fridge (sab ek saath use kar sakte). StorageClass RWO le liya aur teen pods ko share karna tha? Wahi fridge-locker confusion hai.

**Storage gotchas quick-reference:**

| Symptom | Root cause | Fix |
|---|---|---|
| PVC stuck `Pending` | No StorageClass or provisioner not installed | `kubectl describe pvc` → install provisioner or create StorageClass |
| PVC stuck `Pending` on EKS | AZ mismatch — volume in `us-east-1a`, pod on `us-east-1b` node | Use `volumeBindingMode: WaitForFirstConsumer` on StorageClass |
| `Multi-Attach error` on pod reschedule | EBS (RWO) still attached to old node | Wait for detach timeout; force-delete stuck pod; check old node health |
| Data deleted after `kubectl delete pvc` | `reclaimPolicy: Delete` (StorageClass default) | Set `Retain` on StorageClass before first PVC; patch PV if already provisioned |
| 2 of 3 Deployment replicas stuck `Pending` | RWO PVC — only one node can attach EBS | Switch to RWX backend (EFS) or use StatefulSet with `volumeClaimTemplates` |

### RBAC — Role-Based Access Control

RBAC (Role-Based Access Control) controls what identities (users, service accounts) can do inside the K8s API. It is additive — by default, a ServiceAccount can do nothing. You grant permissions explicitly.

**Four objects:**

| Object | Scope | What it does |
|---|---|---|
| **Role** | Namespace | Grants permissions within one namespace |
| **ClusterRole** | Cluster-wide | Grants permissions across all namespaces (or non-namespaced resources like nodes) |
| **RoleBinding** | Namespace | Binds a Role or ClusterRole to a subject (user, group, ServiceAccount) in one namespace |
| **ClusterRoleBinding** | Cluster-wide | Binds a ClusterRole to a subject across the whole cluster |

**ServiceAccount (SA):** Every pod runs as a ServiceAccount. Default SA exists in every namespace. Tokens are auto-mounted at `/var/run/secrets/kubernetes.io/serviceaccount/token`.

```yaml
# Minimal: read pods in the "monitoring" namespace only
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: monitoring
  name: pod-reader
rules:
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: read-pods
  namespace: monitoring
subjects:
- kind: ServiceAccount
  name: metrics-collector
  namespace: monitoring
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```

**Least-privilege principle:** Pods should run as a dedicated ServiceAccount with only the permissions they need. Running as `cluster-admin` (a ClusterRole that allows everything on every resource) from a pod means that if the pod is compromised, the attacker has full cluster control — including reading Secrets, creating privileged pods, and deleting workloads.

```bash
# Test what a ServiceAccount can do:
kubectl auth can-i list pods --namespace=default --as=system:serviceaccount:monitoring:metrics-collector
# → yes / no

kubectl auth can-i delete deployments --namespace=production \
  --as=system:serviceaccount:ci:deployer
# Use this to verify before granting or before troubleshooting "Forbidden" errors

kubectl get rolebindings,clusterrolebindings -A | grep <serviceaccount>
```

> **Interview answer alert:** "Why shouldn't pods run as cluster-admin?" — blast radius. Compromised pod = attacker reads all Secrets (API keys, DB passwords), creates new privileged pods, exfiltrates data. RBAC limits blast radius to what that specific pod legitimately needs.

### Hardening a pod: `securityContext`

RBAC controls what the pod's *identity* can do via the K8s API. `securityContext` controls what the running *process* can do at the Linux level — two complementary layers. Both are required for defence-in-depth.

```yaml
spec:
  automountServiceAccountToken: false   # don't mount the SA token unless the app calls the K8s API
  securityContext:
    runAsNonRoot: true                  # refuse to start if the image runs as root (UID 0)
    runAsUser: 1000
    fsGroup: 2000                       # files created in mounted volumes are owned by this GID
  containers:
    - name: app
      securityContext:
        allowPrivilegeEscalation: false # process can't gain more privileges than it started with
        readOnlyRootFilesystem: true    # filesystem is read-only (mount an emptyDir for /tmp if needed)
        capabilities:
          drop: ["ALL"]                 # drop all Linux capabilities; add back only what's needed
```

**Field-by-field:**

| Field | What it does |
|---|---|
| `runAsNonRoot: true` | K8s refuses to start the pod if the image's `USER` is root. Pairs with the non-root image from [M3](04-M3-docker.md) — the image must actually be non-root or this rejects it at admission. |
| `allowPrivilegeEscalation: false` | Prevents `setuid`/`sudo` tricks from gaining more permissions than the process started with. |
| `readOnlyRootFilesystem: true` | Stops an attacker writing a payload (reverse-shell, crypto miner) to the container filesystem. Mount `emptyDir` volumes for any path that genuinely needs writes (e.g., `/tmp`). |
| `capabilities: drop: ["ALL"]` | Strips all Linux capabilities (raw sockets, binding ports < 1024, etc.) — least privilege at the kernel level. Add back only what the app truly needs, e.g. `add: ["NET_BIND_SERVICE"]` to listen on port 443. |
| `automountServiceAccountToken: false` | Prevents a compromised pod from calling the K8s API with the SA token auto-mounted at `/var/run/secrets/kubernetes.io/serviceaccount/token`. Set `true` only for pods that legitimately need to call the K8s API (operators, admission webhooks). |

> 🇮🇳 **Hinglish intuition:** RBAC = office ID card (kaun sa door khulta hai). securityContext = job description (andar jaake kya *kar* sakta hai). Dono chahiye — card bhi, rules bhi.

```bash
# Verify the effective security settings on a running pod:
kubectl get pod <name> -o yaml | grep -A20 securityContext
```

### Spreading replicas for HA: anti-affinity & topology spread

**WHY:** By default the K8s scheduler may place all three replicas of a Deployment on the same node or in the same Availability Zone. That node crashes or that AZ goes down → total outage despite having three "replicas."

**The modern fix — `topologySpreadConstraints`:**

```yaml
spec:
  topologySpreadConstraints:
    - maxSkew: 1
      topologyKey: topology.kubernetes.io/zone   # spread evenly across AZs
      whenUnsatisfiable: DoNotSchedule           # hard constraint — never violate the skew
      labelSelector:
        matchLabels:
          app: myapp
```

`maxSkew: 1` means the replica count difference between the most-loaded and least-loaded zone must not exceed 1. With 3 replicas across 3 AZs: 1-1-1. `DoNotSchedule` makes this a hard constraint — the scheduler will not place a pod that would violate the skew. (`ScheduleAnyway` is the soft-preference alternative.)

**The older approach — `podAntiAffinity`:**

```yaml
      affinity:
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            - labelSelector:
                matchLabels:
                  app: myapp
              topologyKey: kubernetes.io/hostname   # no two replicas on the same node
```

`podAntiAffinity` says "don't co-locate two replicas on the same node." It is simpler but operates at a single topology level. `topologySpreadConstraints` works at any topology level (node, zone, region, rack) and can balance across multiple dimensions simultaneously. Use `topologySpreadConstraints` for new workloads; `podAntiAffinity` remains valid for strict "never two on the same node" rules.

> 🇮🇳 **Hinglish intuition:** Teen employees — teen alag office branches mein bhejo. Ek branch band ho jaaye toh baaki kaam karte rahein. `topologySpreadConstraints` = HR policy "equal distribution across cities." `podAntiAffinity` = "same cabin mein do log nahi" — useful, par sirf ek level pe kaam karta.

> Cross-link: HA replica count and multi-AZ sizing decisions → [M5 sizing and cost](06-M5-sizing-and-cost.md).

### Helm — templated, versioned K8s packages

Helm is the Kubernetes package manager. Instead of maintaining 10 YAML files per application and copying them between environments, you write a **chart** with templates and inject environment-specific values.

**Three core concepts:**

| Term | What it is |
|---|---|
| **Chart** | A directory of YAML templates + `Chart.yaml` metadata |
| **Values** | A `values.yaml` file (or `--set` flags) that fills in template variables |
| **Release** | A named, versioned deployment of a chart into a cluster (`helm install my-api ./chart`) |

```bash
# Install a chart (creates a Release named "my-api")
helm install my-api ./chart -f values-prod.yaml

# Upgrade (creates new release revision)
helm upgrade my-api ./chart -f values-prod.yaml

# Rollback to previous revision
helm rollback my-api 1

# See all releases
helm list

# View rendered YAML before applying (dry run)
helm template my-api ./chart -f values-prod.yaml
```

**Helm vs Kustomize vs raw YAML:**

| Approach | When to use |
|---|---|
| **Raw YAML** | Simple, single-environment apps; learning; capstone projects |
| **Kustomize** | Multi-environment overlays (base + prod-patch); built into kubectl; no templating language |
| **Helm** | Third-party software installs (`helm install cert-manager`, `helm install prometheus`); team-shared charts with complex parameterization |

> Reach for Helm when you are consuming community charts (cert-manager, nginx ingress, Prometheus/Grafana) — they all ship as Helm charts. For your own app in small teams, Kustomize often suffices. See `12-capstone-url-shortener` and `13-capstone-microshop` for practical examples.

---

## F. The Full Instrumented Request Lifecycle

This traces a single HTTP request from the internet to the database and back, with per-hop latency and the debug command that isolates each hop.

```mermaid
flowchart TD
    CLIENT(["Client<br/>browser or curl"]):::net
    LB{{"Cloud LB<br/>AWS ALB"}}:::net
    ING{{"nginx Ingress<br/>Host header routing"}}:::net
    SVC["Service<br/>ClusterIP"]:::net
    KP["kube-proxy<br/>iptables DNAT"]:::net
    EPS[("EndpointSlice<br/>Ready pod IPs")]:::net
    POD["App Pod<br/>:8080"]:::run
    DB[("Database<br/>:5432")]:::run

    CLIENT -->|"HTTPS :443"| LB
    LB -->|"NodePort :30080"| ING
    ING -->|"Host match<br/>to Service"| SVC
    SVC --> KP
    KP -.->|"reads"| EPS
    KP -->|"DNAT to pod IP"| POD
    POD -->|"SQL query"| DB

    classDef shared fill:#fff9c4,stroke:#f9a825,color:#4a3800;
    classDef cd fill:#f3e5f5,stroke:#8e24aa,color:#4a148c;
    classDef run fill:#e0f2f1,stroke:#00897b,color:#004d40;
    classDef obs fill:#f1f8e9,stroke:#689f38,color:#33691e;
    classDef net fill:#e3f2fd,stroke:#1976d2,color:#0d47a1;
    classDef warn fill:#fdeeee,stroke:#d64545,color:#b23030;
```

*Instrumented request lifecycle: Client → cloud LB → nginx Ingress (TLS + Host-header routing) → Service ClusterIP → kube-proxy reads EndpointSlice (DNAT) → App Pod → Database. DB round-trip dominates latency; cluster overhead is ~1–3 ms.*

??? note "Text version (ASCII)"
    ```
    INTERNET
       │
       │ ①  TCP :443 (HTTPS)
       ▼  latency: network RTT (ms)
    ┌─────────────────────────┐
    │  Load Balancer / DNS    │  debug: curl -v https://api.example.com
    │  (AWS ALB / NodePort)   │  latency: ~1ms LB routing
    └─────────────┬───────────┘
                  │ ② NodePort :30080 or Ingress controller pod
                  ▼  latency: ~0.1ms kernel
    ┌─────────────────────────┐
    │  nginx Ingress Pod      │  debug: kubectl logs -n ingress-nginx deploy/...
    │  Host: api.example.com  │  common fail: 404 = host header not matched
    │  TLS termination        │  debug: kubectl describe ingress
    └─────────────┬───────────┘
                  │ ③  Service ClusterIP → kube-proxy (iptables/IPVS)
                  ▼  latency: ~0.1ms iptables DNAT
    ┌─────────────────────────┐
    │  kube-proxy             │  debug: kubectl get endpointslices
    │  ClusterIP → pod IP     │  common fail: empty slice = readiness failed
    └─────────────┬───────────┘
                  │ ④  Pod network (CNI: Calico)
                  ▼  latency: ~0.1–0.5ms cross-node
    ┌─────────────────────────┐
    │  App Pod :8080          │  debug: kubectl exec pod -- curl localhost:8080/health
    │  FastAPI / Express      │  debug: kubectl logs <pod>
    │  Handles request logic  │  common fail: CrashLoopBackOff / OOMKilled
    └─────────────┬───────────┘
                  │ ⑤  CoreDNS lookup → DB Service DNS
                  ▼  latency: ~0.5ms DNS
    ┌─────────────────────────┐
    │  Database               │  debug: kubectl exec pod -- nc -zv <db-host> 5432
    │  RDS :5432 / ClusterIP  │  debug: kubectl exec pod -- nslookup db-service
    │  Persistent data layer  │  common fail: SG :5432 blocked / DNS fail
    └─────────────────────────┘

    Dominant latency: DB round-trip (①+⑤) >> network (②③④) in µs–ms
    Total per-request overhead vs bare metal: ~1–3ms on healthy cluster
    ```

**Systematic debug ladder (hop-by-hop, never guess):**
```bash
# ① Can the load balancer reach the node?
curl -v http://<node-ip>:30080/

# ② Is the Ingress controller routing correctly?
kubectl describe ingress <name>
kubectl logs -n ingress-nginx deploy/ingress-nginx-controller --tail=50
curl -H 'Host: api.example.com' http://<node-ip>:30080/   # test host header

# ③ Does the Service have endpoints?
kubectl get endpointslices -l kubernetes.io/service-name=api-svc
kubectl describe svc api-svc    # check selector matches pod labels

# ④ Is the pod healthy?
kubectl get pods -l app=api     # check READY column and STATUS
kubectl describe pod <name>     # check probe events
kubectl logs <name> --previous  # logs from last crash

# ⑤ Can the pod reach the database?
kubectl exec -it <pod> -- nc -zv <db-host> 5432
kubectl exec -it <pod> -- nslookup db-service
```

---

## Beginner Mistakes vs Senior Insights

| Topic | Beginner says | Senior knows |
|---|---|---|
| Liveness probe | "Check DB in liveness to verify health" | DB check in liveness → cascading restarts. DB checks belong in readiness. |
| Probes | "Readiness and liveness are the same" | Readiness: removes from traffic. Liveness: restarts. Startup: holds the other two during boot. |
| QoS | "Pod with highest memory usage gets killed" | QoS class is primary: BestEffort dies first regardless of usage |
| Graceful shutdown | "Rolling update is always zero-downtime" | Only if app handles SIGTERM and preStop sleep covers slice propagation race |
| HPA | "HPA scales nodes automatically" | HPA scales pods. Cluster Autoscaler scales nodes. Different components. |
| HPA debug | "HPA not working" | First check: metrics-server running? pods have `requests` set? |
| DNS | "Use pod IP in config" | Pod IPs are ephemeral. Use Service DNS name — it survives pod restarts. |
| Ingress | "404 from nginx = app is down" | 404 from nginx often means Host header not matched in Ingress rules |
| RBAC | "Pods need cluster-admin to do anything" | Least-privilege SA with targeted Role. cluster-admin = full blast radius if compromised |
| StatefulSet | "Delete StatefulSet = delete data" | PVCs survive StatefulSet deletion by design. Explicit `kubectl delete pvc` needed. |
| etcd | "etcd is like a cache" | etcd is the source of truth. Lose etcd without backup = lose cluster state entirely. |
| EndpointSlice | "Service routes traffic directly" | Service is virtual. kube-proxy reads EndpointSlice → programs iptables rules → routes packets. |
| iptables | "iptables and IPVS are equivalent" | iptables is O(n); at scale (>500 svcs) IPVS is measurably faster (O(1) hash). |
| NetworkPolicy | "AWS SG protects pod traffic" | SGs protect at node level. NetworkPolicy protects at pod level (same node, different pods). |

### NOT to say in interviews

- "Readiness and liveness are the same thing" — they have opposite fail actions.
- "Liveness probe should check database connectivity" — this is the cascading restart footgun.
- "The pod with the most memory usage gets evicted first" — QoS class is the primary factor.
- "Rolling update is always zero-downtime" — requires readiness probe + graceful SIGTERM handling.
- "HPA adds more nodes when CPU is high" — HPA adds pods; Cluster Autoscaler adds nodes.
- "Pod IP is stable, I can use it in config" — pod IPs change on restart; use Service DNS names.
- "404 from nginx means the backend service is broken" — check Ingress host/path rules and Host header first.
- "Just give the pod cluster-admin, it's simpler" — maximum blast radius if the pod is compromised.
- "Delete the StatefulSet and the data is gone" — PVCs survive; must be explicitly deleted.
- "etcd is just a cache" — etcd is the cluster's only persistent truth; treat it like production database with backups.

---

## Memory Shortcuts

| Concept | One-liner |
|---|---|
| apiserver | Only component that touches etcd directly |
| etcd | Cluster's **hard drive** (persistent, WAL + snapshots) — lose it without backup = amnesia |
| Raft quorum | ≥3 control-plane nodes (odd); majority must agree to write |
| CNI/Calico | Cross-node pod routing (BGP / overlay / eBPF) |
| EndpointSlice | Live list of Ready pod IPs; kube-proxy reads this |
| iptables vs IPVS | O(n) vs O(1) — switch to IPVS above ~500 Services |
| Startup probe | Holds liveness/readiness during slow boot |
| Readiness fail | Traffic removed, pod alive |
| Liveness fail | Container restarted (kill signal) |
| Liveness footgun | External check in liveness → cascading restarts |
| QoS Guaranteed | requests == limits (both); safest from eviction |
| QoS BestEffort | No requests/limits; first to die on memory pressure |
| SIGTERM + preStop | Graceful shutdown: slice removed → sleep 5 → SIGTERM → drain → SIGKILL |
| HPA formula | ceil(current × currentMetric / targetMetric) |
| HPA needs | metrics-server + pod requests |
| Scale-down slow | 300s stabilization window — prevents flapping |
| CoreDNS FQDN | `<svc>.<ns>.svc.cluster.local` → ClusterIP |
| Ingress | Host-header routing at nginx layer → Service |
| 404 from nginx | Host header not matched in Ingress rules |
| NetworkPolicy | Pod-to-pod firewall (SGs are node-level, this is pod-level) |
| StatefulSet identity | pod-0/1/2, stable hostname, own PVC per replica |
| PVC survival | PVCs outlive StatefulSet deletion — explicit delete needed |
| RBAC least privilege | SA + Role + RoleBinding (scoped); never cluster-admin for app pods |
| Helm | Chart + Values + Release (templated versioned K8s packages) |

---

## Summary

This chapter completed the K8s picture that M4 deferred:

- **Control plane** (six actors) and the seven-step `kubectl apply` journey through etcd → scheduler → kubelet.
- **Networking** — CNI for cross-node routing, EndpointSlice (not legacy Endpoints) for service discovery, iptables O(n) vs IPVS O(1) at scale, CoreDNS for stable service names, Ingress + cert-manager for production HTTPS, NetworkPolicy for pod-level firewall.
- **Pod lifecycle** — the three probes (startup / readiness / liveness) with distinct fail actions, the liveness footgun, QoS classes determining OOM eviction order, graceful shutdown race and the preStop sleep fix.
- **HPA** — ceiling-division formula, metrics-server dependency, asymmetric scale-up/down timing.
- **State and security** — StatefulSet stable identity with per-replica PVCs that outlive the controller, RBAC four-object model with least-privilege ServiceAccounts, Helm for templated packaging.
- **Full request lifecycle** with per-hop latency and the debug command that isolates each hop.

The capstone (`12-capstone-url-shortener`, `13-capstone-microshop`) exercises all of this live. The interview bank (`14-interview-bank`) covers the full rapid-fire set.

---

## Self-Check Quiz

Pehle memory se jawab do, phir neeche kholo.

1. You run `kubectl apply` on a Deployment. Trace the exact sequence: which component acts in which order, and what does each write/read?

2. A pod shows `READY 0/1`. The pod phase is `Running`. What is the most likely cause, and what two commands confirm it?

3. Your liveness probe points to `/healthz` which internally calls the database. Load spikes. What happens, step by step? What is the correct fix?

4. You have three pods. Node runs out of RAM. Pod A has no requests/limits. Pod B has `requests: cpu 100m` and `limits: cpu 200m`. Pod C has `requests: cpu 100m, memory: 128Mi` and `limits: cpu 100m, memory: 128Mi`. Which pod is evicted first? Why?

5. An HPA shows `<unknown>/50%` and never changes replica count. Name two root causes and the commands to confirm each.

6. Users get 404 from your nginx Ingress controller but the backend Service and pods are healthy. What is the most likely cause, and how do you test it with one `curl` command?

7. You delete a StatefulSet with 3 replicas. The PVCs are still present. Is this a bug? What must you do to actually free the storage?

8. A new microservice pod needs to call the Kubernetes API (to list ConfigMaps). It returns `403 Forbidden`. Trace the RBAC objects you need to create, and give the `kubectl auth can-i` command to verify before deploying.

<details markdown="1"><summary>Jawab dekho</summary>

1. kubectl → apiserver (YAML validate) → writes Deployment to etcd → Deployment controller creates ReplicaSet → etcd → ReplicaSet controller creates Pod objects → etcd → Scheduler assigns nodes → writes nodeName to Pod → etcd → kubelet starts containers via containerd → writes Running/Ready status back to apiserver/etcd.
2. Readiness probe failing. Pod alive, zero traffic. `kubectl describe pod <name>` (Events: "Readiness probe failed") aur `kubectl get endpointslices` (pod IP absent from slice).
3. DB spike → liveness timeoutSeconds exceeded → FAIL → kubelet restarts ALL pods → reconnect storm on DB → further spike → cascading restart loop. Fix: DB check sirf readiness mein; liveness = in-process health flag only (never external dep).
4. Pod A (no requests/limits) = BestEffort → FIRST to die. Pod B (cpu requests < limits, memory nahi) = Burstable. Pod C (requests == limits for both) = Guaranteed → LAST. Eviction order: A → B → C.
5. (a) metrics-server install nahi — confirm: `kubectl top pods` fails. (b) pods mein `requests` set nahi — confirm: `kubectl describe hpa <name>` shows "unable to get metrics for".
6. nginx 404 with healthy backend = Host header mismatch in Ingress rules. Test: `curl -H 'Host: api.example.com' http://<node-ip>:30080/` — 200 aaye to Host header hi missing tha.
7. Intentional, not a bug — PVCs survive StatefulSet deletion by design; data outlives the controller. Free storage: `kubectl delete pvc data-postgres-0 data-postgres-1 data-postgres-2` explicitly.
8. Create: ServiceAccount → Role (verbs: `get,list,watch` on `configmaps`, scoped to namespace) → RoleBinding (SA → Role). Verify: `kubectl auth can-i list configmaps -n <ns> --as=system:serviceaccount:<ns>:config-reader` → must return `yes`.
</details>

---

## Hands-On Lab

**✅ Sahi hua to aisa dikhega:** `kubectl describe pod guaranteed | grep "QoS Class"` returns `Guaranteed`; Lab 2 mein `kubectl get pods -w` pe `RESTARTS` counter dheere-dheere badhta dikhta hai; Lab 3 ka naya pod `kubectl get endpointslices` mein Ready hone ke 10s ke andar appear karta hai; Lab 4 mein `curl -H 'Host: myapp.example.com' http://<node-ip>:80/` returns HTTP 200 (nginx default 404 nahi); Lab 5 mein `kubectl auth can-i list secrets -n default --as=system:serviceaccount:default:limited-reader` returns `no`.

**Goal:** experience each major concept by breaking and fixing it.

### Lab 1: Hit each QoS class and trigger OOM

```bash
# BestEffort (no requests/limits)
kubectl run besteffort --image=nginx
kubectl describe pod besteffort | grep "QoS Class"   # → BestEffort

# Burstable (request < limit)
kubectl run burstable --image=nginx \
  --requests='cpu=100m,memory=64Mi' --limits='cpu=500m,memory=256Mi'
kubectl describe pod burstable | grep "QoS Class"    # → Burstable

# Guaranteed (request == limit)
kubectl run guaranteed --image=nginx \
  --requests='cpu=100m,memory=128Mi' --limits='cpu=100m,memory=128Mi'
kubectl describe pod guaranteed | grep "QoS Class"   # → Guaranteed
```

### Lab 2: Break liveness, watch the restart

```yaml
# Deploy with an liveness probe that will fail after 30s
livenessProbe:
  exec:
    command: ["sh", "-c", "test $(date +%s) -lt $(($(cat /tmp/start) + 30))"]
  periodSeconds: 5
```
```bash
kubectl get pods -w                   # watch RESTARTS counter climb
kubectl describe pod <name>           # see "Liveness probe failed" events
kubectl logs <name> --previous        # logs from last run
```

### Lab 3: Add probes + resources to an existing Deployment

Start from a minimal Deployment (no probes, no resources). Add startup + readiness + liveness probes and `requests == limits`. Verify:
```bash
kubectl rollout status deploy/<name>
kubectl describe pod <new-pod>        # verify probe configuration
kubectl get endpointslices            # pod should appear within ~10s of Ready
```

### Lab 4: Add an Ingress

```bash
# Install nginx ingress controller
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml

# Create Ingress for your Service
kubectl apply -f ingress.yaml

# Test with Host header (before DNS is configured)
curl -H 'Host: myapp.example.com' http://<node-ip>:80/

# Debug if 404:
kubectl describe ingress <name>       # check rules
kubectl logs -n ingress-nginx deploy/ingress-nginx-controller
```

### Lab 5: RBAC — kubectl auth can-i with a limited ServiceAccount

```bash
# Create a ServiceAccount
kubectl create serviceaccount limited-reader -n default

# Create Role (pods only, no secrets)
kubectl create role pod-reader --verb=get,list,watch --resource=pods -n default

# Bind SA to Role
kubectl create rolebinding pod-reader-binding \
  --role=pod-reader --serviceaccount=default:limited-reader -n default

# Verify permissions
kubectl auth can-i list pods -n default \
  --as=system:serviceaccount:default:limited-reader   # → yes
kubectl auth can-i list secrets -n default \
  --as=system:serviceaccount:default:limited-reader   # → no
kubectl auth can-i list pods -n kube-system \
  --as=system:serviceaccount:default:limited-reader   # → no (scoped to default only)
```

---

## Interview Rapid-Fire (~15 Qs)

Pehle memory se jawab do, phir neeche kholo.

Full bank in `14-interview-bank.md`. These are the highest-signal M9 questions:

<details markdown="1"><summary>Jawab dekho</summary>

| # | Question | One-line answer |
|---|---|---|
| 1 | Which K8s component is the only one that touches etcd? | kube-apiserver |
| 2 | etcd Raft quorum — minimum nodes for 1-failure tolerance? | 3 nodes (majority = 2) |
| 3 | What is the difference between readiness and liveness probe on failure? | Readiness: removes from traffic (pod lives). Liveness: restarts container. |
| 4 | What does the startup probe do that the other two can't? | Holds liveness + readiness until app finishes booting — prevents crash-loop on slow start |
| 5 | Liveness probe calls the database — what happens during a DB spike? | Cascading restart loop. Fix: DB checks go in readiness, not liveness. |
| 6 | Node RAM full. Which pod dies first — BestEffort or Guaranteed? | BestEffort first. QoS class is the eviction order determinant. |
| 7 | How do you make a pod Guaranteed QoS? | Set requests == limits for both CPU and memory |
| 8 | Why does HPA show `<unknown>/50%`? | metrics-server not installed, or pods missing `requests` |
| 9 | HPA scales up immediately but down slowly — why? | 300s stabilization window prevents flapping on transient load drops |
| 10 | Pod is Running but EndpointSlice is empty — two possible causes? | Readiness probe failing, or Service selector doesn't match pod labels |
| 11 | iptables vs IPVS for large clusters — key difference? | iptables O(n) rule scan; IPVS O(1) hash lookup — measurably faster above ~500 Services |
| 12 | nginx Ingress returns 404 but the Service is healthy — first thing to check? | Host header in the request must match the Ingress `host:` rule exactly |
| 13 | Delete a StatefulSet — what happens to the PVCs? | PVCs survive by design. Must `kubectl delete pvc` explicitly to free storage. |
| 14 | Why shouldn't an app pod run as cluster-admin? | Compromised pod = full cluster access. Blast radius includes all Secrets, all namespaces. |
| 15 | What does `kubectl auth can-i list secrets --as=system:serviceaccount:ns:name` do? | Tests what a specific ServiceAccount is permitted to do — use before deploying or debugging 403s |

</details>

---

## Production Challenge

### Challenge 1: "Pod is Running but zero traffic"

You deployed a new version. `kubectl get pods` shows `Running`. Users report zero responses. Traffic dropped to zero.

**Walkthrough:**
```bash
# Step 1: Is the pod in the EndpointSlice?
kubectl get endpointslices -l kubernetes.io/service-name=<svc>
# → Empty? Pod is not receiving traffic. Investigate why.

# Step 2: Is readiness probe passing?
kubectl describe pod <name>
# → Look for: "Readiness probe failed" in Events

# Step 3: Does the Service selector match pod labels?
kubectl describe svc <name>         # shows Selector
kubectl get pod <name> --show-labels  # shows actual labels
# → Mismatch? Fix the selector or the pod labels.

# Step 4: Can the probe endpoint respond?
kubectl exec <pod> -- curl -s localhost:8080/ready
# → Non-200? Fix the /ready endpoint in the application.

# Root causes in order of frequency:
# 1. Readiness probe endpoint returns non-200 (app bug / not ready yet)
# 2. Service selector label typo
# 3. Startup probe failing (slow-start app — add startupProbe)
# 4. Pod has no requests set and readiness path wasn't fixed (OOMKilled on boot)
```

### Challenge 2: "502 Bad Gateway walkthrough"

Users report intermittent 502 errors during deployments. No errors between deployments.

**Walkthrough — graceful shutdown diagnosis:**
```bash
# Confirm 502s correlate with rollout events:
kubectl rollout history deploy/<name>
# Check error-rate spike in Prometheus/Grafana during each rollout (→ 10-M8)

# Check if preStop hook exists:
kubectl get pod <name> -o yaml | grep -A10 lifecycle
# → Missing preStop? That's your problem.

# Check terminationGracePeriodSeconds:
kubectl get pod <name> -o yaml | grep terminationGracePeriodSeconds
# → Default 30s. Should be > your max request duration + preStop sleep.

# Fix: add preStop sleep and verify SIGTERM handling in app code
lifecycle:
  preStop:
    exec:
      command: ["sleep", "5"]
# Then redeploy. Monitor error rate during next rollout — should drop to zero.

# If still 502 after fix: app is not handling SIGTERM gracefully.
# Check: does the app server (gunicorn/express/spring) have graceful shutdown configured?
# Python gunicorn: --graceful-timeout 30
# Node.js: process.on('SIGTERM', () => server.close(...))
```

---

*Next: `12-capstone-url-shortener` — apply every concept in this chapter to a real production-grade URL shortener built from scratch. See `14-interview-bank` for the full 30+ rapid-fire question set across all modules.*
