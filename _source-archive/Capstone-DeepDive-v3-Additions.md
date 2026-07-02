# 🔬 Capstone Deep-Dive v3 — Missing Internals (Connected)

> v2 ke 7 gaps, **same 5-layer template** (🧠 Model · ⚙️ Mechanism · 🔢 Numbers · 🐛 Failure · 🎤 Interview Q) + difficulty tag (Jr/Mid/Sr) + ⛔ "what NOT to say".
> Ye sab **ek-doosre se connected** hain — end mein "connection map" jod-ta sabko. Companion: [Capstone-DeepDive-Internals.md](Capstone-DeepDive-Internals.md)
>
> 🔢 **Numbers caveat:** defaults version-se-version badalte — apne cluster pe `kubectl explain` / `kubectl version` se verify karo. Yahan ke numbers common-stable defaults hain (estimate, gospel nahi).

---

## 🩺 1. THREE PROBES — Startup, Readiness, Liveness (saath kaise chalte)

- 🧠 **Model:** Naya employee ka safar — **Startup** = "training poori hui?" (join hote waqt), **Readiness** = "abhi kaam ke liye available?" (har waqt), **Liveness** = "zinda/behosh to nahi?" (har waqt). Teeno alag sawaal, alag time.
- ⚙️ **Mechanism:** Tinon health-check, par alag kaam:
  | Probe | Sawaal | Fail → action | Kab chalti |
  |-------|--------|---------------|-----------|
  | **Startup** | "app boot ho gayi?" | restart (par readiness/liveness ko **rok ke rakhti** jab tak ye pass na ho) | sirf shuruaat mein |
  | **Readiness** | "traffic ke ready?" | EndpointSlice se **hata** (traffic rok, maarti nahi) | poore jeevan |
  | **Liveness** | "atki/deadlock to nahi?" | container **restart** (maar deti) | poore jeevan |
  - 🔑 **Startup ka asli kaam:** slow-start app (30s boot) ko **liveness se bachाना.** Bina startup probe, liveness pehle 10s mein "ready nahi" dekh ke app ko **maar** deti — wo kabhi boot hi nahi ho paati (restart loop). Startup probe liveness ko **"ruk, abhi boot ho raha"** bolti.
- 🔢 **Numbers:** Startup `failureThreshold × periodSeconds` = max boot time allowed (e.g. `30 × 10s = 300s` boot ki ijaazat). Readiness default `periodSeconds:10, failureThreshold:3` → ~30s mein eject. Liveness same defaults.
- 🐛 **Failure:** Slow-start app `CrashLoopBackOff` jabki code theek → **liveness ne boot ke beech maar diya** (startup probe nahi tha). Fix: startup probe add karo, ya liveness `initialDelaySeconds` badhao. Debug: `kubectl describe pod` → "Liveness probe failed" events boot-time pe.
- 🎤 **Interview Q [Mid]:** *"Readiness aur Liveness probe mein farak, aur teesri probe kab chahiye?"*
  → Readiness = traffic gate (fail → traffic rok, pod zinda). Liveness = restart trigger (fail → maar+restart). **Startup** = slow-boot apps ke liye — jab tak app boot na ho, liveness/readiness ko hold rakhti, taaki dhीमी boot wali app maari na jaaye.
- ⛔ **NOT to say:** "Readiness aur liveness same hain" / "liveness fail → traffic rok deti" (NAHI — wo **restart** karti, readiness traffic rokti).
- 🔗 **Connect:** Readiness → EndpointSlice (v2 §5) → zero-downtime rolling update (v2 §6). Startup → CrashLoopBackOff debug (v1 §M9).

---

## ⚠️ 2. LIVENESS FOOTGUN — cascading restarts (sabse khatarnak)

- 🧠 **Model:** Smoke-detector jo **chhoti dhuaan** pe poora building khali kara de — bachaane ke bajaye **panic** macha de.
- ⚙️ **Mechanism:** Galti ye — liveness probe mein **external dependency** (DB) check karna. Soch:
  ```
  DB thodi slow ho gayi (load spike)
     → saare pods ki liveness "/health-jo-DB-check-karti" FAIL
     → kubelet saare pods RESTART karta
     → restart ke baad pods phir DB pe load daalte (reconnect)
     → DB aur slow → phir liveness fail → phir restart → ☠️ (cascading)
  ```
  Ek chhoti DB-glitch → **poora app restart-loop** mein. Liveness ne bachaya nahi, **giraya.**
- 🔢 **Numbers:** Aggressive liveness (`timeoutSeconds:1, failureThreshold:1`) = ek slow response pe turant restart. Safe: `timeoutSeconds:5+, failureThreshold:3+`.
- 🐛 **Failure:** Load spike pe **saare pods ek saath restart** (graph mein dikhega) jabki koi sach mein "dead" nahi tha. `kubectl get events` → mass "Killing/Restarting". Fix: liveness sirf **"kya YE process atka/deadlock hai"** check kare (e.g. simple in-process flag), **DB/external check readiness mein** daalo (readiness fail → sirf traffic rukega, restart nahi).
- 🎤 **Interview Q [Sr]:** *"Tumhare saare pods load-spike pe ek saath restart ho rahe the. Kyun ho sakta hai?"*
  → Liveness probe external dependency (DB) check kar rahi thi. DB slow → liveness fail → mass restart → cascading. Fix: **liveness = sirf self/process health; dependency checks readiness mein** (readiness fail = traffic rok, pod zinda).
- ⛔ **NOT to say:** "Liveness mein DB connection check karo taaki pata chale healthy hai" — ye **exact footgun** hai.
- 🔗 **Connect:** Circuit Breaker (M8) — same family (cascading failure rok). Readiness vs Liveness (§1). Blast radius (M9) — liveness ka blast radius poora app.

---

## ⚖️ 3. QoS CLASSES — kaun pehle marta (OOM priority)

- 🧠 **Model:** Titanic ki lifeboat-priority — **Guaranteed = first-class** (last to drown), **BestEffort = no-ticket** (first to go). requests/limits hi ticket-class decide karta.
- ⚙️ **Mechanism:** requests/limits se K8s **3 QoS class** assign karta. Node pe **memory pressure** (RAM khatam) → kubelet **evict** karta is order mein: **BestEffort → Burstable → Guaranteed**.
  | QoS | Condition | OOM-kill priority |
  |-----|-----------|-------------------|
  | **Guaranteed** | requests **==** limits (CPU+RAM dono set, equal) | sabse **safe** (last to die) |
  | **Burstable** | requests < limits (ya kuch hi set) | **middle** |
  | **BestEffort** | **koi** requests/limits nahi | **first to die** 💀 |
  - 🔑 **OOM score:** kernel ko QoS se "kis pod ko pehle maaro" ka hint milta. BestEffort ka OOM-score-adj sabse high → pehle kill.
- 🔢 **Numbers:** Guaranteed ke liye `requests.memory == limits.memory` **aur** `requests.cpu == limits.cpu`. Thoda bhi farak → Burstable.
- 🐛 **Failure:** Node RAM full → tera critical pod **OOMKilled** (137) jabki kम-important pod zinda → tera critical pod **BestEffort/Burstable** tha, kम-important shayad Guaranteed. Fix: critical pods ko `requests==limits` de ke **Guaranteed** banao. Debug: `kubectl describe pod` → "QoS Class: ..." line + eviction events.
- 🎤 **Interview Q [Mid]:** *"Node pe RAM khatam — K8s kaunsa pod pehle maarta?"*
  → QoS class ke hisaab se: **BestEffort pehle, fir Burstable, fir Guaranteed.** Guaranteed (requests==limits) sabse safe. Isliye critical workloads ko requests==limits do.
- ⛔ **NOT to say:** "Jo zyada RAM use kar raha wo marta" — wo factor hai par **primary = QoS class** (usage absolute nahi, class).
- 🔗 **Connect:** requests/limits (M5) → QoS → OOMKilled/137 (M5). Headroom (M5) — node 100% na bharo taaki eviction hi na ho.

---

## 🌐 4. CoreDNS / SERVICE DNS — naam se dhoondhna

- 🧠 **Model:** Phone **contact list** — number (IP) yaad nahi rakhte, **naam** (`"Mom"`) se call karte. CoreDNS = cluster ka contact-list.
- ⚙️ **Mechanism:** Har Service ko ek **DNS naam** milta. Pod IP se nahi, **naam** se baat karta:
  ```
  <service>.<namespace>.svc.cluster.local
  e.g.  url-shortener-db.default.svc.cluster.local
  (same namespace mein sirf "url-shortener-db" kaafi)
  ```
  **CoreDNS** (kube-system mein pod) ye naam → ClusterIP resolve karta. Har pod ke `/etc/resolv.conf` mein CoreDNS ki IP set hoti (kubelet daalta).
  - 🔑 **Kyun naam, IP nahi:** ClusterIP bhi stable hai, par **naam aur bhi portable** — code mein `DB_HOST=url-shortener-db` likho, kisi bhi cluster/namespace mein chale.
- 🔢 **Numbers:** CoreDNS Service IP aksar `10.96.0.10` (Service CIDR ka). FQDN suffix `svc.cluster.local`. (Capstone mein DB = **external RDS**, to wahaan RDS endpoint use hota DNS se — par cluster-internal services ke liye CoreDNS.)
- 🐛 **Failure:** Pod "could not resolve host" / DNS timeout → CoreDNS pods down ya SG `self` rule missing (DNS UDP :53 internal). Debug: `kubectl get pods -n kube-system` (coredns Running?), `kubectl exec pod -- nslookup <service>`.
- 🎤 **Interview Q [Mid]:** *"Pod doosre service ko kaise dhoondhta — IP hardcode karte?"*
  → Nahi. **Service DNS** — `<svc>.<ns>.svc.cluster.local`. CoreDNS resolve karta naam→ClusterIP. Code mein naam likho, IP nahi (pods/IP badalte, naam stable).
- ⛔ **NOT to say:** "Pod IP code mein daal dete" — pods ephemeral, IP badalta; **service naam** use hota.
- 🔗 **Connect:** Service/ClusterIP (v2 §5) — DNS uske upar layer. Stateless config (M0) — `DB_HOST` env se inject.

---

## 🔌 5. GRACEFUL SHUTDOWN — pod hatne pe in-flight requests (zero-downtime ka doosra half)

- 🧠 **Model:** Dukaan band karne se pehle **"andar wale customers ko niklने do"** — shutter ek-dam nahi giraate. SIGTERM = "naye customer mat lo, andar walon ko finish karne do".
- ⚙️ **Mechanism:** Pod terminate hone pe **2 cheezein ek saath** hoti:
  ```
  1. Pod EndpointSlice se HATTA → kube-proxy naye traffic bhejna band
  2. kubelet container ko SIGTERM bhejta → app: "naye request mat lo, in-flight finish karo"
  3. terminationGracePeriodSeconds (default 30s) wait
  4. Agar abhi bhi zinda → SIGKILL (force)
  ```
  - 🔑 **Race condition (classic):** endpoint-removal aur SIGTERM **async** hain — kabhi SIGTERM pehle aa jaata jab traffic abhi bhi aa raha (slice-update propagate hone mein time). Isliye **`preStop` hook mein `sleep 5`** daalte — "thoda ruk, slice update ho jaane do, fir shutdown." App ko bhi **SIGTERM handle** karna chahiye (graceful).
- 🔢 **Numbers:** `terminationGracePeriodSeconds` default **30s**. preStop sleep ~5-10s (slice propagation buffer). SIGTERM → grace → SIGKILL.
- 🐛 **Failure:** Deploy ke waqt kuch users ko **502/connection-reset** → pod ne in-flight requests **drop** kar diye (SIGTERM pe app turant mara, ya endpoint hatne se pehle hi band). Fix: app SIGTERM handle kare (drain) + `preStop: sleep 5` + grace period kaafi. Debug: deploy ke waqt error-rate spike (golden signal).
- 🎤 **Interview Q [Sr]:** *"Rolling update ke dauraan kuch requests fail ho rahe — naya pod to ready tha. Kyun?"*
  → **Purane** pod ka graceful shutdown issue. Pod EndpointSlice se hatne aur SIGTERM ke beech race → in-flight requests drop. Fix: `preStop` sleep (slice propagate hone do) + app SIGTERM-handling (naye reject, purane drain) + sahi grace period.
- ⛔ **NOT to say:** "Rolling update hamesha zero-downtime hai" — sirf tab jab **graceful shutdown + readiness** sahi ho. Warna purane pods requests drop karte.
- 🔗 **Connect:** Rolling update (v2 §6) ka **doosra half** (naya-aaye = readiness; purana-jaaye = graceful shutdown). EndpointSlice (v2 §5). SIGKILL = 137 ka cousin (SIGTERM=15, SIGKILL=9).

---

## 📊 6. POD LIFECYCLE — phases + container states (status padhna)

- 🧠 **Model:** Pod ki **zindagi ke stages** (paida→chal raha→khatam) + container ka **mood** (wait/chal/khatam).
- ⚙️ **Mechanism:** Do level — **Pod phase** (overall) + **Container state** (andar):
  - **Pod phases:** `Pending` (schedule/image-pull ho raha) → `Running` (kam se kam 1 container chal raha) → `Succeeded` (sab complete, exit 0) / `Failed` (koi container fail) / `Unknown` (node se contact nahi).
  - **Container states:** `Waiting` (reason: `ContainerCreating`/`ImagePullBackOff`/`CrashLoopBackOff`) · `Running` · `Terminated` (reason: `Completed`/`Error`/`OOMKilled`).
  - **Pod conditions:** `PodScheduled` → `Initialized` → `ContainersReady` → `Ready` (sab true = traffic-ready).
  - 🔑 **`READY 0/1`** matlab: Running hai (container chal raha) par **`Ready` condition false** (readiness fail) → traffic nahi.
- 🔢 **Numbers:** `CrashLoopBackOff` backoff: 10s, 20s, 40s... **max 300s** (5 min) tak double hota.
- 🐛 **Failure decode (status → wajah):**
  | Status | Matlab | Pehla command |
  |--------|--------|---------------|
  | `Pending` | schedule nahi (resource/taint/IP) | `describe pod` (Events) |
  | `ImagePullBackOff` | image nahi mili (galat tag/no-auth) | `describe pod` |
  | `CrashLoopBackOff` | baar-baar crash | `logs --previous` |
  | `OOMKilled` (137) | RAM limit cross | limits badhao / R-family |
  | `READY 0/1` | Running par readiness fail | `describe` (probe) |
- 🎤 **Interview Q [Jr→Mid]:** *"`kubectl get pods` mein `CrashLoopBackOff` vs `ImagePullBackOff` — farak aur pehla step?"*
  → CrashLoopBackOff = container start hota par **crash** (app error) → `logs --previous`. ImagePullBackOff = container **start hi nahi** hua (image nahi mili/pull fail) → `describe pod` (tag/registry-auth check). Alag layer ki problem.
- ⛔ **NOT to say:** "Pending matlab crash" — Pending = abhi **chala hi nahi** (schedule pending), crash nahi.
- 🔗 **Connect:** M9 debug ladder (`get`→`describe`→`logs`). 137/OOMKilled (M5). Pending 3-reasons (M5).

---

## 📈 7. HPA MECHANICS — auto-scaling andar se

- 🧠 **Model:** **Cruise control** — target set karo (CPU 50%), gaadi khud accelerator dabati/chhodti taaki target maintain ho.
- ⚙️ **Mechanism:** HPA pods ki ginti badhata/ghatata target metric ke hisaab se. **Dependency: `metrics-server`** (jo CPU/RAM metrics deta — bina iske HPA "unknown").
  ```
  desiredReplicas = ceil( currentReplicas × (currentMetric / targetMetric) )
  e.g. 3 pods, CPU 90%, target 50%:  ceil(3 × 90/50) = ceil(5.4) = 6 pods
  ```
  - Har ~15s check. **Scale-UP fast** (load aa raha, jaldi badhao). **Scale-DOWN slow** (stabilization window, default 5 min — taaki flapping na ho: badha-ghata-badha).
- 🔢 **Numbers:** Check interval ~15s. Scale-down stabilization default **300s** (5 min). HPA min/max replicas set karte (`--min=2 --max=10`).
- 🐛 **Failure:** HPA `<unknown>/50%` dikha raha, scale nahi kar raha → **metrics-server install nahi** (ya pods mein `requests` set nahi — HPA % calculate nahi kar sakta bina request-baseline ke). Fix: metrics-server install + pods mein CPU `requests` zaroor. Debug: `kubectl get hpa`, `kubectl top pods` (kaam kiya? to metrics-server OK).
- 🎤 **Interview Q [Mid→Sr]:** *"HPA scale-up fast par scale-down slow kyun? Aur kya chahiye chalने ko?"*
  → Scale-down slow (stabilization window) taaki **flapping** na ho — load thoda gire to turant pods na hataye (phir aaye to phir banao = thrash). Scale-up fast kyunki under-provision = users affected. **Chahiye: metrics-server** (metrics source) + pods mein **`requests`** (% ka baseline).
- ⛔ **NOT to say:** "HPA bas RAM dekh ke nodes badhata" — HPA **pods** badhata (nodes = Cluster Autoscaler), aur default CPU pe (RAM/custom bhi possible).
- 🔗 **Connect:** HPA (pods) vs Cluster Autoscaler (nodes) — M5. requests (M5) HPA ka baseline. Golden signals (M8) — saturation HPA trigger.

---

## 🕸️ CONNECTION MAP — ye 7 kaise jud-te (jaali)

```
            requests/limits (M5)
              │         │
              ▼         ▼
        QoS class    HPA baseline
        (§3 kaun     (§7 % calc)
         marta)
              
   PROBES (§1) ─── Readiness ──► EndpointSlice ──► traffic
      │  Startup (boot bachao)        │
      │  Liveness ─footgun(§2)─► cascading restart
      │                               │
      ▼                               ▼
   Pod lifecycle (§6)          Graceful shutdown (§5)
   (status decode)             (purana pod drain)
              
   CoreDNS (§4) ── naam se ──► Service ──► pods
```

### 🧵 Ek-line jodne wale:
- **requests/limits** ek root hai — usse **QoS** (§3, kaun marta) **aur** **HPA** (§7, scale baseline) dono nikalte.
- **Readiness** ek root hai — usse **traffic-gate** (EndpointSlice), **rolling-update** (naya-aaye), **graceful-shutdown** (§5, purana-jaaye) jud-te.
- **Liveness footgun (§2)** + **Circuit Breaker (M8)** = ek hi family (cascading failure).
- **Pod lifecycle (§6)** = sab debug ka entry (status padho → sahi command).

---

## 🎤 v3 QUICK-FIRE (in 7 ke, answer chhupa ke khud bol)
| # | Q | A |
|---|---|---|
| 1 | Startup probe kyun? | slow-boot app ko liveness se bachाना |
| 2 | Liveness mein DB check? | ❌ footgun — cascading restart; DB → readiness mein |
| 3 | Node RAM full, kaun marta? | BestEffort → Burstable → Guaranteed |
| 4 | Guaranteed QoS? | requests == limits (CPU+RAM) |
| 5 | Pod service ko kaise dhoondhta? | CoreDNS: `<svc>.<ns>.svc.cluster.local` |
| 6 | Graceful shutdown 2 cheez? | EndpointSlice se hatna + SIGTERM (grace 30s) |
| 7 | preStop sleep kyun? | slice-removal vs SIGTERM race buffer |
| 8 | READY 0/1 matlab? | Running par readiness fail (traffic nahi) |
| 9 | CrashLoop vs ImagePull? | crash (logs) vs image-na-mili (describe) |
| 10 | HPA chalने ko kya chahiye? | metrics-server + pods mein requests |
| 11 | HPA scale-down slow kyun? | flapping rok (stabilization window) |
| 12 | HPA kya badhata? | pods (nodes = Cluster Autoscaler) |

---

> **Ab v1 (internals) + v2 (5-layer + interview) + v3 (7 gaps + connections) = complete.** Koi K8s behavior "magic" nahi. System-design + debug, dono round prod-ready. 🚀
