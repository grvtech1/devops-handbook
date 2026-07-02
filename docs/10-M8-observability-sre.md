# M8 — Observability & SRE

> **Core question: It is 2 a.m. and something is slow. How do you see inside a running system — without SSHing into every pod and grepping log files one by one?**

> **⏱️ Time:** ~55 min padho · **🎚️ Level:** Advanced · **📋 Pehle chahiye:** [M4](05-M4-kubernetes-core.md), [M7](08-M7-gitops.md)
>
> **Is module ke baad tum kar paoge:**
> - Prometheus metrics, Loki logs, aur OpenTelemetry traces ka fark explain karo aur ek production incident mein teeno use karo
> - SLI/SLO/error budget define karo aur yeh bolo ke error budget exhaust hone pe team kya karti hai
> - Cardinality explosion diagnose aur fix karo (high-cardinality label → Prometheus OOM)

> ### ↩️ Recall gate — shuru karne se pehle
> Pichhle modules se 3 sawaal. **Pehle memory se jawab do, phir kholo.** (Yeh retrieve karna hi lifetime yaad rakhta hai — dobara padhna nahi.)
>
> 1. *(M4)* K8s mein readiness probe aur liveness probe mein kya fark hai? Readiness probe fail hone par Service ka kya hota hai?
> 2. *(M7)* `selfHeal: true` set hai aur kisi ne `kubectl edit deployment` se live image tag change kar diya. Argo kya karega — Cause A ya Cause B, aur kitne time mein?
> 3. *(M6)* CI mein `github.sha` tag kyun use karte hain `latest` ki jagah? Ek concrete problem batao jo `latest` se production mein aata hai.
>
> <details markdown="1"><summary>Jawab</summary>
>
> 1. Readiness fail → pod Service ke EndpointSlice se hata diya jaata hai (traffic nahi milta, restart nahi hota). Liveness fail → pod restart hota hai. Dono alag cheezein — alag problems ke liye. &nbsp; 2. Cause B (cluster drifted from Git). selfHeal ~30s–3min mein Git wala version wapas apply karta hai. &nbsp; 3. `latest` mutable hai — alag nodes pe alag images pull ho sakti hain, rollback mushkil. `github.sha` immutable hai — exactly wohi build deploy hota hai jo test se guzri.
> </details>

*(Formerly tracked as M10 in the Principal Track; renumbered M8 here as the first Operate module.)*

---

**MODULE MAP**
`00-INDEX` · `01-M0-foundations` · `02-M1-terraform` · `03-M2-ansible` · `04-M3-docker` · `05-M4-kubernetes-core` · `06-M5-sizing-and-cost` · `07-M6-cicd` · `08-M7-gitops` · `09-connected-system` · **`10-M8-observability-sre`** · `11-M9-advanced-k8s-internals` · `12-capstone-url-shortener` · `13-capstone-microshop` · `14-interview-bank` · `15-roadmap-M11-M18` · `16-reference-appendix`

---

## The 60-second version

Kubernetes tells you a pod is `Running`. It does not tell you that pod is answering in 3 seconds instead of 80 milliseconds, or silently returning errors on 2% of requests, or about to run out of memory in 20 minutes. That gap — between "process is alive" and "system is healthy" — is what observability fills.

Observability has three pillars, each answering a different question:

- **Metrics** (Prometheus): numbers over time — *"how much, how many, how fast?"*
- **Logs** (Loki / ELK): discrete events — *"what exactly happened on this request?"*
- **Traces** (OpenTelemetry + Jaeger): a request's journey across services — *"where did the time go?"*

The business layer on top is **SRE** — Site Reliability Engineering. It turns raw telemetry into a governance contract: an **error budget** that answers the question "are we reliable enough to ship this risky change right now?"

You alert on metrics. You debug with logs and traces. You make deploy/freeze decisions with error budgets. Each tool has one job.

---

## Why this exists / what it replaced

### The before state: flying blind

Before structured observability, the typical production investigation looked like this:

1. Customer complains — or worse, nobody notices until a spike in support tickets.
2. Engineer SSHes into a server and runs `tail -f /var/log/app.log`.
3. Searches for `ERROR` with grep.
4. Finds something, guesses a cause, restarts the service, hopes it goes away.
5. Redeploys and watches manually for ten minutes.

This approach has two fundamental problems:

**You can only ask questions you thought of in advance.** If you did not add that specific log line before the incident, the evidence you need does not exist. You are flying blind on every incident you did not predict.

**Instinct is not evidence.** "I think it's the database" is not scoped, not time-bound, and not reproducible. It is a guess. Guesses lead to wrong fixes and repeated incidents.

### Monitoring vs observability — an important distinction

These terms are often used interchangeably but they describe different capabilities:

| | Monitoring | Observability |
|---|---|---|
| **What it handles** | Known-unknowns — problems you anticipated | Unknown-unknowns — questions you did not think to ask before the incident |
| **Mental model** | Set up dashboards and alerts for things you know can break | Instrument the system so you can ask new questions of live data without redeploying |
| **Example** | "Alert if CPU > 80%" | "What was the p99 latency of `/shorten` for users in the `IN` region at 14:32 yesterday?" |
| **Limitation** | Only catches what you predicted | Requires upfront instrumentation investment |

A well-instrumented system gives you **both**: pre-built dashboards for the things you expect, and raw queryable data for the things you did not.

🇮🇳 **Hinglish intuition:** M4 ka reconciliation loop ek chowkidar hai jo sirf ek sawaal poochta hai — *"kitne pod chahiye, kitne hain?"* Observability alag cheez hai: CCTV + ek logbook + ek GPS tracker. CCTV (metrics) counts everything always. Logbook (logs) records what each event was. GPS tracker (traces) follows one customer's complete journey end-to-end. Chowkidar ko in teeno ki zaroorat hai — sirf headcount kaafi nahi.

---

## The three pillars

Every production system must answer three structurally different questions. Each question needs a different data shape — which is why you run three separate tools, not one.

```
┌─────────────────────────────────────────────────────────────────────┐
│                     THE THREE PILLARS                               │
│                                                                     │
│  QUESTION               PILLAR          TOOL          DATA SHAPE    │
│  ─────────────────────────────────────────────────────────────────  │
│  "How much / how many   METRICS         Prometheus    Numeric       │
│   over time?"                                         time-series   │
│                                                                     │
│  "What exactly          LOGS            Loki / ELK    Structured    │
│   happened here?"                                     text events   │
│                                                                     │
│  "Where did the time    TRACES          OTel +        Timed span    │
│   go across services?"                 Jaeger         trees         │
└─────────────────────────────────────────────────────────────────────┘

  Metrics say SOMETHING is wrong.
  Logs say WHAT it was.
  Traces say WHERE (which hop) it happened.
```

| Pillar | Question it answers | Data shape | Tool | Cost at scale |
|--------|---------------------|------------|------|---------------|
| **Metrics** | How much / how many, over time? | Numeric time-series, cheap to store for years | Prometheus | Low |
| **Logs** | What exactly happened on this one request? | Unstructured / structured text | Loki (or ELK) | Medium–high |
| **Traces** | Where did the time go, across services? | Tree of timed spans per request | OpenTelemetry + Jaeger | Medium |

**The rule of thumb that saves hours at 2 a.m.:** alert on metrics, debug with logs and traces. Alerting on logs directly (grep for ERROR every minute) does not scale past a handful of services — that is exactly what metrics exist to replace.

---

### Metrics — Prometheus

**Model.** Prometheus is a fitness tracker that only counts numbers, never records why. It polls (scrapes) your app every N seconds — a PULL model, the same pattern as Argo CD in M7, where the system reaches out rather than waiting to be pushed to. Your app exposes a `/metrics` HTTP endpoint in plain text. Prometheus scrapes it on a configurable interval, stores it in a local time-series database (TSDB — Time Series DataBase), and makes it queryable via **PromQL** (Prometheus Query Language).

**The four metric types:**

| Type | Behavior | Use for | PromQL note |
|------|----------|---------|-------------|
| **Counter** | Only goes up; resets on restart | Total requests, total errors | Always query `rate()`, never raw value |
| **Gauge** | Goes up and down | Current memory, current queue depth | Query raw value is fine |
| **Histogram** | Buckets of observations (e.g. `<100ms`, `<500ms`, `<1s`) | Request latency, response size | Enables p50/p95/p99 queries |
| **Summary** | Pre-computed quantiles, client-side | Legacy; rarely preferred now | Less flexible than histogram |

**Numbers to know:**
- Default scrape interval: `15s`
- Default local retention: `15d`
- Prometheus is stateful (local TSDB) — in production, teams run **Thanos** or **Mimir** for high availability and long-term storage beyond 15 days

> 🔮 **Predict pehle (socho, phir aage padho):** Tum ek metric mein `user_id` label add kar dete ho (lakhon unique values). Prometheus ka kya hota hai?

**The number-one real incident in this space — cardinality explosion:**

A `Counter` or `Histogram` with a label like `user_id` or `request_path` (when the path includes a dynamic ID) creates one new time-series per unique label value. Prometheus RAM usage scales with the *count of unique time-series*, not with data volume. 10,000 users × 5 metrics = 50,000 series. Add one high-cardinality label and that becomes millions.

Teams have taken down their entire monitoring stack — Prometheus OOMing and getting killed by K8s — by adding a label with good intentions. The full war story is in the Real Production Example section below.

> 🔧 **War story:** Prometheus pod baar baar OOMKilled ho raha tha — RAM double karne ke baad bhi; ek developer ne debugging ke liye `user_id` label add kiya tha jisse 2M+ unique time-series ban gaye. `curl .../api/v1/status/tsdb` se root cause mila, label hatate hi fix hua. Poori kahani + lesson → [Interview Bank](14-interview-bank.md).

**Rule:** labels must have a small, bounded, predictable set of values — `method`, `status_code`, `route_template` are fine. `user_id`, `order_id`, and raw `path` strings with dynamic segments are not.

🇮🇳 **Hinglish intuition:** metrics = har 15 second mein CCTV ki ek photo. Prometheus poochta hai "abhi kya count hai?" — wo history nahi samajhta, sirf current number likhta. Cardinality explosion = har user ke liye alag CCTV channel kholna. Ek building mein 50,000 channels ka CCTV system koi run nahi kar sakta — RAM khatam ho jaati hai.

---

### Logs — Loki / ELK

**Model.** Logs are the discrete event record — what happened on each specific request. Loki is "Prometheus but for logs": same PromQL-style query language called **LogQL**, same label-based indexing, deliberately does *not* index full text (unlike Elasticsearch / ELK) to stay cheap at scale.

**Mechanism.** Your app writes logs to stdout — never to a file inside the container (containers are cattle, per M0; when the pod dies, so does any file written inside it). A node-level log-shipper agent runs as a DaemonSet: **Promtail** (Loki's native shipper) or **Fluent Bit** (more universal). It tails container stdout, attaches Kubernetes labels (`pod`, `namespace`, `app`), and ships to Loki. You then query:

```
{app="urlshort"} |= "ERROR"
{app="urlshort", namespace="prod"} | json | latency_ms > 500
```

**Structured logging vs `print()`:**

This is one of the highest-leverage habits a senior engineer has. Consider:

```python
# Beginner: free-text print
print(f"shortened {code} for user {uid}")

# Senior: structured JSON log
logger.info("url_shortened", extra={"code": code, "user_id": uid,
            "trace_id": trace_id, "duration_ms": elapsed})
```

The first produces a string you have to regex-parse at 2 a.m. The second produces a JSON object with named fields you can filter, aggregate, and join to traces by `trace_id` — all in the query interface, without writing code.

Senior engineers standardize a JSON log schema across every service on day one. This is not premature optimisation; it is baseline infrastructure.

**Log levels — small but important.** Every log line carries a *level* so you can separate signal from noise: `DEBUG` (dev detail, off in prod), `INFO` (normal events — "request served"), `WARN` (odd but handled — "retrying DB"), `ERROR` (a request failed), `FATAL/CRITICAL` (the process is dying). In production you run at `INFO` and alert on `ERROR`+ *rates* — not on raw log volume. Make the level a **field** in the JSON (`"level":"error"`), not just free text, so `LogQL`/queries can filter on it. A flood of `ERROR` right after a deploy is often your fastest incident signal — quicker than a metric alert's `for: 5m` window.

> 🇮🇳 **Hinglish intuition:** Log level = volume knob. `DEBUG` = sab kuch (dev me), `INFO` = normal, `WARN` = "dekh lena", `ERROR` = "ab dekho", `FATAL` = "mar gaya". Prod me `INFO` pe chalao, page sirf `ERROR`+ pe.

**The stdout buffering pitfall.** Some language runtimes buffer stdout when not attached to a TTY (a terminal). In production containers, there is no TTY. Logs appear in batches or not at all until the buffer flushes on process exit. Classic symptom: "the pod crashed but there are no logs." Fix: force unbuffered output — in Python, `PYTHONUNBUFFERED=1`; in Node, logs go to process.stdout which is synchronous; in Go, the standard library does not buffer stdout.

---

### Traces — OpenTelemetry + Jaeger

**Model.** A trace is a relay race with a stopwatch at every handoff. One user request gets a `trace_id` — a unique identifier that travels with the request across every service it touches. Each service adds one or more timed **spans** — units of work with a start time, end time, and metadata. The result is a waterfall diagram showing exactly where the time went, down to the individual database query.

**OpenTelemetry (OTel)** is the vendor-neutral SDK and protocol for generating traces (and metrics and logs). You instrument once with OTel; you can send to Jaeger, Tempo, Zipkin, or a commercial backend without changing app code. **Jaeger** is the open-source backend for storing and visualising traces.

**Mechanism:**

1. OTel SDK auto-instruments your framework (FastAPI, Express, Spring Boot) with minimal config — often 3–5 lines.
2. On each inbound request, the SDK checks for a `traceparent` HTTP header (W3C Trace Context standard). If present, it joins the existing trace. If absent, it creates a new `trace_id`.
3. On each outbound call (HTTP, database, queue), the SDK injects `traceparent` into the request headers, propagating the trace downstream.
4. Spans are collected by an OTel Collector sidecar or DaemonSet, then forwarded to Jaeger.
5. In Jaeger's UI, you click one `trace_id` and see a full waterfall: which service took how long, where the tail latency lives.

**The sampling cost.** 100% trace sampling at high traffic is expensive — each span is stored, indexed, and queried. Production systems use sampling strategies:
- **Head-based sampling:** decide at the start of the request (e.g. "sample 1% of all requests").
- **Tail-based sampling:** collect all spans, but only *persist* the trace if it met a condition (was slow, had an error). More expensive to run but more useful — you keep the interesting traces, drop the boring ones.

**Where traces earn their pay.** Tracing a single-service app is low-value — a simple log gives you the same information. Tracing earns its keep the moment you have two or more services calling each other. When your metrics show p99 is 3 seconds but you cannot tell if the slowness is in your app code, the downstream Postgres query, or the Redis call — a trace for one of those slow requests shows the span breakdown immediately.

🇮🇳 **Hinglish intuition:** trace = ek grahak ka poora safar — restaurant mein ghusa, order diya, chef ne banaya, waiter ne laya. Har step pe stopwatch. Agar 20-minute delay hai to trace seedha batata: "chef ke paas 18 minute lage" — order lene ya lany nahi. Metrics sirf bolta "20 minute lage." Trace batata "kahan."

---

## SLIs, SLOs, SLAs, and error budgets

This section separates "I set up Grafana" from "I run production." It is how observability becomes a **decision-making tool**, not just a dashboard.

```
┌──────────────────────────────────────────────────────────────────┐
│              SLI / SLO / SLA / ERROR BUDGET                      │
│                                                                  │
│  SLI ─────────── what you measure                               │
│  (e.g. % of /shorten requests returning <500 in <300ms)         │
│           │                                                      │
│           ▼                                                      │
│  SLO ─────────── your internal target for that SLI              │
│  (e.g. 99.5% of requests meet that bar, over 30 days)           │
│           │                                                      │
│           ▼                                                      │
│  ERROR BUDGET = 100% − SLO = 0.5% = ~3.6 hours/month           │
│  ┌────────────────────────────────────────────────────┐         │
│  │ BUDGET REMAINING > 0  →  ship risky changes        │         │
│  │ BUDGET EXHAUSTED      →  reliability work only     │         │
│  └────────────────────────────────────────────────────┘         │
│           │                                                      │
│           ▼                                                      │
│  SLA ─────────── external / contractual promise                 │
│  (e.g. 99.0% uptime or customer gets a credit)                  │
│  Always looser than SLO — SLO is your internal buffer           │
└──────────────────────────────────────────────────────────────────┘
```

| Term | Definition | Capstone example |
|------|------------|-----------------|
| **SLI** — Service Level Indicator | The actual measured signal | `% of /shorten requests returning non-5xx in <300ms` |
| **SLO** — Service Level Objective | Your internal target for that SLI | `99.5% of requests meet that bar over 30 days` |
| **SLA** — Service Level Agreement | The external, often contractual promise — with financial penalty if missed | `99.0% uptime or customer gets credited` |
| **Error budget** | `100% − SLO` — how much failure you are allowed | `0.5% = ~3.6 hours/month of allowed degradation` |

**Why the SLO is always stricter than the SLA.** You need a buffer between what you promise yourself and what you promise customers. If your SLO is 99.5% and you burn through it, your team goes into reliability-only mode — no risky deploys. By the time you hit your SLA (99.0%), you should have already fixed the problem. If your SLO and SLA were the same number, you would have no warning before breaching the customer contract.

**The senior insight most training skips — the error budget as governance.** The error budget turns "should we ship this risky change?" from a political argument into a number. If budget remains: ship. If budget is exhausted: only reliability work until the window resets. This is how Google SRE resolves the permanent tension between feature velocity and reliability — without either side winning by politics. The number decides.

**p99 vs. average — why this matters for SLIs.** Average latency hides the tail. If 95% of requests take 50ms and 5% take 5,000ms, the average is around 300ms — looks fine. 1 in 20 users has a terrible experience. A histogram-based SLI on **p99** would catch this; an average-based SLI would not. Always define SLIs using percentile latency, not mean.

🇮🇳 **Hinglish intuition:** error budget = kitni galti allowed hai. Agar 99.5% uptime ka SLO hai, to 0.5% — yaani mahine mein roughly 3.6 ghante — toot-phoot ka allowance hai. Jab tak budget hai, naya feature ship karo. Budget khatam? Rukjao — pehle system theek karo. Yeh rule politics ko hataata hai — number decide karta hai.

---

## The Four Golden Signals

Google SRE defined four signals that together describe the health of almost any service. If you can only instrument four things, instrument these:

| Signal | What it measures | Example metric | Why it matters |
|--------|-----------------|----------------|----------------|
| **Latency** | How long requests take — split by success and error | p99 of `http_request_duration_seconds` | Slow is often worse than down — users tolerate brief downtime but abandon slow apps |
| **Traffic** | How much demand is hitting the system | `rate(http_requests_total[5m])` | Baseline for capacity decisions and anomaly detection |
| **Errors** | The rate of requests that fail | `rate(http_requests_total{status=~"5.."}[5m])` | The most direct signal that users are experiencing failures |
| **Saturation** | How "full" the system is — the resource closest to its limit | CPU throttling, memory usage %, queue depth | Predicts future failure before it becomes current failure |

**Note on latency and errors:** always track latency separately for successful and failed requests. A request that fails in 1ms inflates the "fast" bucket and masks a real problem if you are averaging across success and failure together.

---

## Alerting that does not page you for nothing

### How Alertmanager works

Prometheus evaluates alert **rules** — PromQL expressions that should evaluate to false during normal operation. When an expression evaluates to true (e.g. error rate exceeds threshold), Prometheus fires an alert to **Alertmanager** (Alert Manager).

Alertmanager's job is not to forward every alert. It does four things:

1. **Deduplication:** if 50 pods all fire the same alert at the same time, Alertmanager sends one page, not 50.
2. **Grouping:** related alerts (same service, same time window) arrive as one notification with context, not as a flood.
3. **Routing:** based on labels (`team="payments"`, `severity="critical"`), Alertmanager routes the alert to the right channel — Slack, PagerDuty, email, webhook.
4. **Silences and inhibitions:** a silence suppresses specific alerts during a known maintenance window. An *inhibition* rule suppresses downstream alerts when a higher-priority alert is already firing — do not page for "disk full" on a node when "node down" is already firing for the same node. The disk problem is not actionable while the node is unreachable.

### Alert on symptoms, not causes

This is the single most common mistake in on-call setups:

| Pattern | Example | Problem |
|---------|---------|---------|
| **Cause-based (bad)** | `CPU > 80%` | CPU at 80% might be totally fine — high CPU during a batch job is expected. Users notice nothing. |
| **Symptom-based (good)** | `error_rate > 1% for 5m` | Users are receiving errors right now. This is unambiguously actionable. |

Alerting on causes produces **alert fatigue** — too many pages that require human judgement to determine whether they matter. Engineers start ignoring pages. Real incidents get lost in the noise.

**The rule:** page on what users feel (symptoms). Put everything else on a dashboard panel — visible but silent.

### The `for:` duration rule

```yaml
# BAD: a single scrape blip pages someone at 3 a.m.
- alert: HighErrorRate
  expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.01

# GOOD: transient spikes self-resolve before anyone is paged
- alert: HighErrorRate
  expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.01
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "Error rate above 1% for 5 minutes on {{ $labels.service }}"
```

The `for: 5m` field tells Prometheus to hold the alert in a `pending` state for 5 minutes before it fires. A transient network blip that lasts 30 seconds resolves itself; a real problem persists. In practice, the duration threshold matters more than the numeric threshold — it is the difference between waking someone up for nothing and waking them up for a real incident.

---

## Request lifecycle, instrumented

This extends the request lifecycle from `09-connected-system.md` — same request, now with every telemetry emission point annotated.

```
REQUEST LIFECYCLE WITH TELEMETRY EMISSION POINTS

 1. User ──► POST :30080/shorten
                │
 2. NodePort → kube-proxy → Service → EndpointSlice → Pod
                │
                │  [TRACE]  span started: trace_id=abc123, service=urlshort
                │
 3. Pod (FastAPI) handles the request
                │
                │  [METRIC] http_requests_total{route="/shorten", method="POST"} += 1
                │  [METRIC] http_request_duration_seconds histogram observes start
                │  [LOG]    {"event":"request_received","route":"/shorten",
                │            "trace_id":"abc123","ts":"2025-07-02T02:14:03Z"}
                │
 4. Pod ──────► Postgres :5432  INSERT INTO urls ...
                │
                │  [TRACE]  child span: db_insert
                │           trace_id=abc123, parent=span1, start=+002ms
                │
 5. Postgres responds
                │
                │  [TRACE]  child span closed: db_insert duration=031ms
                │  [LOG]    {"event":"db_insert_ok","code":"xyz7k",
                │            "duration_ms":31,"trace_id":"abc123"}
                │
 6. Response ──► User  HTTP 201
                │
                │  [TRACE]  root span closed: total_duration=043ms
                │  [METRIC] http_request_duration_seconds observes 0.043
                │  [LOG]    {"event":"request_complete","status":201,
                │            "duration_ms":43,"trace_id":"abc123"}
                │
 7. (async, every 15s)
    Prometheus scrapes Pod /metrics endpoint
    → TSDB records new counter and histogram values

 8. (continuous, via DaemonSet)
    Promtail/Fluent Bit tails pod stdout
    → ships structured log lines to Loki

 9. (every 15–30s, rule evaluation)
    Prometheus evaluates: rate(http_requests_total{status=~"5.."}[5m]) > 0.01 for 5m?
    → FALSE → nothing happens  ← this is the normal, silent case
    → TRUE  → Alertmanager fires → routes to Slack/PagerDuty → M9 incident begins
```

The `⤷` emissions at steps 3, 4, 5, 6 happen **on every single request, always** — they are not conditional debugging code turned on during incidents. This is the mental shift: instrumentation is baseline infrastructure you build in *before* anything breaks, so that when it does break you already have the evidence. Adding instrumentation after an incident to understand the last incident is too late.

---

## Real production example — the cardinality explosion

This is the most common class of observability incident across the industry. The pattern is documented widely and most teams encounter it eventually.

**The setup.** A team wants to debug a slow endpoint. They add a new metric:

```python
request_duration.labels(path=request.url.path).observe(elapsed)
```

In staging, there are a handful of routes. Looks fine. In production, the path includes a dynamic resource ID:

```
/users/8271/orders/49182
/users/8272/orders/49183
/users/8273/orders/49184
...
```

Each unique path value creates a new time-series. With thousands of users per hour, the series count goes from ~50,000 (healthy) to several million within 24 hours.

**What happens next.** Prometheus's in-memory series count explodes. RAM usage climbs. Kubernetes OOM-kills the Prometheus pod. The pod restarts, loads the on-disk TSDB, and OOMs again. **Dashboards go blank during an unrelated ongoing incident** — the observability layer became the outage, blinding the team at the worst possible moment.

**The fix — two layers.**

Layer 1 — fix the label immediately:

```python
# WRONG: raw path with dynamic segment
request_duration.labels(path=request.url.path).observe(elapsed)

# CORRECT: route template — bounded set of values
request_duration.labels(route="/users/{id}/orders/{order_id}").observe(elapsed)
```

Layer 2 — add a cardinality guardrail in the Prometheus scrape config so no single bad label can repeat this:

```yaml
# prometheus.yml scrape config
scrape_configs:
  - job_name: urlshort
    metric_relabel_configs:
      - source_labels: [__name__]
        regex: 'http_request_duration_seconds'
        target_label: path
        replacement: ''        # drop the 'path' label entirely on this metric
```

**The lesson that generalises.** Observability infrastructure is itself production infrastructure. It needs the same sizing and reliability discipline as the apps it watches (M5). A bug in the monitoring layer can blind you during the exact moment you need it most. Senior engineers ask "can my monitoring survive the incident it is supposed to help me see?" as a real design question — not an afterthought.

---

## Commands, explained

```bash
# Port-forward Prometheus to localhost:9090
# Why: access the UI and HTTP API without a LoadBalancer; works in any cluster
kubectl port-forward svc/prometheus-server 9090:80 -n monitoring

# Port-forward Grafana to localhost:3000
# Why: same reason — dev and debugging access without exposing a public endpoint
kubectl port-forward svc/grafana 3000:80 -n monitoring

# Check what Prometheus is currently scraping and each target's last-scrape status
# Why: most "I don't see my app's metrics" problems are a misconfigured ServiceMonitor
kubectl exec -it <prometheus-pod> -n monitoring -- \
  wget -qO- localhost:9090/api/v1/targets | python3 -m json.tool | grep -E '"health"|"scrapeUrl"'

# Query Prometheus via HTTP (no UI needed) — 5xx rate over last 5 minutes
# Why: useful in CI, in scripts, or when port-forwarding Grafana is not convenient
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=rate(http_requests_total{status=~"5.."}[5m])'

# Query Prometheus — p99 latency of /shorten
# Why: this is the SLI query; put it in your dashboard and alert rule
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{route="/shorten"}[5m]))'

# Tail logs from your app via Loki CLI
# Why: faster than the Grafana UI for quick label-filtered tailing in a terminal
logcli query '{app="urlshort", namespace="prod"} |= "ERROR"' --limit=50 --tail

# Evaluate what an alert rule currently resolves to
# Why: before adding the rule, verify the PromQL expression returns the values you expect
kubectl exec -it <prometheus-pod> -n monitoring -- \
  promtool query instant http://localhost:9090 \
  'rate(http_requests_total{status=~"5.."}[5m])'

# Check Prometheus TSDB statistics including top series by metric name
# Why: first diagnostic when suspecting cardinality explosion
curl -s 'http://localhost:9090/api/v1/status/tsdb' | python3 -m json.tool | head -60
```

---

## Beginner mistakes vs senior insights

| Beginner | Senior |
|----------|--------|
| "I added Grafana, we are observable now." | A dashboard nobody looks at until something is already broken is not observability — it is decoration. Observability means alerts that page *before* users complain. |
| Alerts on every metric that *could* matter: CPU, memory, disk, queue depth, JVM heap... | Alerts only on **SLO burn rate** (symptom). Everything else is a dashboard panel — visible, not loud. |
| Alert rule with no `for:` duration — a single scrape blip pages on-call at 3 a.m. | Always pair a threshold with a `for:` duration. Transient noise self-resolves; real problems persist. |
| Adds a `user_id` label to a metric "to make debugging easier." | Labels must have a bounded set of values. A `user_id` label in a high-traffic app destroys Prometheus in under 24 hours. |
| "It's slow" (vague, unscoped). | "p99 on `/shorten` went from 80ms to 1.2s starting at 14:32, correlates with the RDS CPU spike — likely a slow query. Here is a trace ID for one of the slow requests." Evidence-based, time-bound, actionable. |
| Logs with `print(f"done {code}")` — free text. | Structured JSON logs with a `trace_id` field on every line, so any log line can be joined to its full trace and correlated metric context without guessing. |
| Builds observability in a "monitoring namespace" that has no resource limits, no alerts on Prometheus itself, no redundancy. | Treats observability infra as production infra: resource requests/limits, a watchdog alert on Prometheus's own health, and (in large orgs) Thanos/Mimir for HA. |

---

## Memory shortcuts

| Concept | One line to recall it |
|---------|----------------------|
| Metrics / logs / traces | How much / what exactly / where did the time go |
| Prometheus pull model | Same PULL pattern as Argo — scrapes every 15s, never gets pushed to |
| Counter vs Gauge | Counter only goes up (query `rate()`); Gauge goes up and down (query raw) |
| Histogram | Buckets of observations → enables p99; this is why you use it for latency |
| Cardinality | Unique label combinations = RAM cost in Prometheus; keep labels bounded |
| p99 > average | Average hides the tail that users feel; histogram quantile catches it |
| SLI / SLO / SLA | Measured / your target / contractual promise (SLA always looser than SLO) |
| Error budget | `100% − SLO` = allowed failure; exhausted → freeze risky deploys |
| Four Golden Signals | Latency, Traffic, Errors, Saturation |
| Alert on symptoms | Error rate pages you; CPU-at-80% stays on a dashboard |
| `for: 5m` | Holds alert in pending — noise self-resolves, real problems do not |
| Structured logging | JSON with `trace_id` on every line — queryable, joinable, not regex'd |
| Tail-based sampling | Keep traces that errored or were slow; drop boring ones — cost control |

---

## Summary

Observability is the layer that turns "the pod is running" into "the system is healthy, and I have evidence." It has three pillars answering three structurally different questions: metrics (how much), logs (what exactly), traces (where). Each requires different infrastructure because each produces a different data shape.

On top of the technical pillars sits the SRE model: SLIs define what you measure, SLOs define your target, the error budget (`100% − SLO`) defines how much failure you are allowed, and that number governs whether risky changes ship or freeze. This turns reliability from a vague aspiration into a concrete, daily decision input.

Alerting done right pages on symptoms (error rate, SLO burn rate), not causes (CPU, disk). The `for:` duration is what separates a page that wakes someone up for nothing from one that wakes them up for a real incident.

The cardinality lesson is the one that bites almost every team once: high-cardinality labels destroy Prometheus from the inside. The fix is label discipline upfront, plus a cardinality guardrail in the scrape config.

Observability infrastructure is itself production infrastructure. If it goes down during an incident, you are flying blind exactly when you need it most.

---

## Self-check quiz

Pehle memory se jawab do, phir neeche kholo.

<details markdown="1"><summary>Jawab dekho</summary>

1. Log-based alerting scale nahi karta — har rule ke liye ek grep/regex job chahiye, high-volume logs pe aggregate queries slow hoti hain, aur volume badhne par load bahut zyada hota hai. Metrics (pre-aggregated counters/histograms) isi liye exist karte hain — log-grepping replace karne ke liye alerting mein.
2. `{route, method, status, user_id}` — `user_id` ke millions of unique values hain → millions of unique time-series → Prometheus RAM explode → OOMKilled. Bounded labels (route, method, status) safe hain; unbounded labels (user_id, order_id) cardinality explosion laate hain.
3. Majority requests fast hain lekin ek tail bahut slow hai (4.8s). p99 pe alert karo — yeh tail ko pakadta hai joh users feel karte hain. Average mein yeh problem chhup jaati hai, alert nahi aata.
4. SLO internal target hai (99.5%); SLA external/contractual promise hai (99.0%). SLO hamesha stricter hota hai taake SLO breach hone par team pehle hi act kare — SLA breach se pehle warning buffer milta hai.
5. **Deduplication** (ek node se 40 alerts → 1 page) aur **inhibition** (downstream alerts suppress ho jaate hain jab higher-priority "node down" alert pehle se fire ho raha ho — disk-full page actionable nahi jab node hi unreachable ho).
6. Threshold decide karta hai kab condition trigger ho; `for:` decide karta hai kab page jaaye. 30-second transient spike threshold meet karta hai — bina `for:` ke bhi 3am page. Real incidents persist karte hain; noise nahi karta. Duration zyada matter karta hai.
7. Sabse zyada likely: cardinality explosion — high-cardinality label ne millions of unique time-series bana diye. Pehla diagnostic: `curl -s 'http://localhost:9090/api/v1/status/tsdb' | python3 -m json.tool | head -60` se series count aur top metrics dekho.
8. Application code fast hai; bottleneck ek slow DB insert (1.9s) hai. Next: RDS slow query logs check karo, missing index dhundho, DB CPU/connections aur Prometheus mein connection pool saturation dekho.
</details>

1. Why can you not simply alert directly on raw log lines at scale? What breaks first?
2. A metric has labels `{route, method, status}` versus `{route, method, status, user_id}`. Which risks cardinality explosion, and why specifically?
3. Average latency is 120ms. p99 latency is 4.8 seconds. What is actually happening? Which number do you alert on and why?
4. What is the practical difference between an SLO and an SLA, and why is the SLO always the stricter number?
5. Alertmanager fires 40 pages in 90 seconds when one node goes down. Name the two Alertmanager features that would have prevented this.
6. Why does the `for: 5m` field on an alert rule matter more than the threshold value in practice?
7. Your Prometheus pod is OOMing every hour. No application incidents are occurring. What is the most likely root cause and what is the first diagnostic command you run?
8. A trace shows that a `/shorten` request took 2.1 seconds total, with 1.9 seconds spent in a single child span labelled `db_insert`. What does this tell you, and what do you do next?

---

## Hands-on lab — instrument the capstone url-shortener

This lab bolts onto `url-shortener/` from `12-capstone-url-shortener.md`. No new project. You extend what you already built.

### Prerequisites
- Working Kind cluster from the capstone
- `helm` installed
- A free Slack workspace with an incoming webhook URL

### Step 1 — expose metrics from the app (3 lines)

```python
# In url-shortener/app/main.py — add after imports
from prometheus_fastapi_instrumentator import Instrumentator

# After `app = FastAPI()`
Instrumentator().instrument(app).expose(app)
```

This auto-exposes `/metrics` with request count and latency histogram, labeled by **route template** (not raw path — the cardinality lesson, applied immediately).

```bash
pip install prometheus-fastapi-instrumentator
# Rebuild your image and push
docker build -t urlshort:v2-obs .
kind load docker-image urlshort:v2-obs
```

### Step 2 — deploy the Prometheus stack

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm install monitoring prometheus-community/kube-prometheus-stack \
  -n monitoring --create-namespace \
  --set grafana.adminPassword=admin123
```

This single Helm release deploys Prometheus, Grafana, Alertmanager, and a set of default K8s dashboards.

### Step 3 — tell Prometheus about your app (your first CRD)

```yaml
# monitoring/servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: urlshort
  namespace: monitoring
  labels:
    release: monitoring   # must match the Helm release label
spec:
  selector:
    matchLabels:
      app: urlshort
  namespaceSelector:
    matchNames:
      - default
  endpoints:
    - port: http
      path: /metrics
      interval: 15s
```

```bash
kubectl apply -f monitoring/servicemonitor.yaml
# Verify: Prometheus UI → Status → Targets → urlshort should appear as UP
kubectl port-forward svc/monitoring-kube-prometheus-prometheus 9090:9090 -n monitoring
```

A `ServiceMonitor` is a Custom Resource Definition (CRD) — your first preview of the CRD/operator pattern covered in M9.

### Step 4 — build one Grafana panel

```bash
kubectl port-forward svc/monitoring-grafana 3000:80 -n monitoring
# Open http://localhost:3000 — login admin / admin123
```

Create a new dashboard. Add a panel with this PromQL:

```
histogram_quantile(0.50, rate(http_request_duration_seconds_bucket{route="/shorten"}[5m]))
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{route="/shorten"}[5m]))
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{route="/shorten"}[5m]))
```

Three lines on one panel: p50, p95, p99 latency of your endpoint. This is your SLI panel.

### Step 5 — write one alert rule

```yaml
# monitoring/alert-rules.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: urlshort-alerts
  namespace: monitoring
  labels:
    release: monitoring
spec:
  groups:
    - name: urlshort.rules
      interval: 30s
      rules:
        - alert: HighErrorRate
          expr: |
            rate(http_requests_total{job="urlshort", status=~"5.."}[5m])
            /
            rate(http_requests_total{job="urlshort"}[5m])
            > 0.01
          for: 5m
          labels:
            severity: critical
            team: backend
          annotations:
            summary: "Error rate above 1% on urlshort"
            description: "{{ $value | humanizePercentage }} of requests are failing."
```

### Step 6 — route to Slack

In Alertmanager's config (via the Helm values), add a Slack receiver:

```yaml
alertmanager:
  config:
    route:
      receiver: slack-notifications
    receivers:
      - name: slack-notifications
        slack_configs:
          - api_url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL'
            channel: '#alerts'
            title: '{{ .GroupLabels.alertname }}'
            text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
```

### Step 7 — prove it fires

Break the database connection string deliberately in a test branch:

```bash
kubectl set env deployment/urlshort DATABASE_URL="postgresql://wrong:wrong@nowhere/db"
```

Watch the error rate climb. Within approximately 5–6 minutes (scrape interval × `for:` window), the alert moves from `pending` to `firing` in the Prometheus UI and a message arrives in Slack.

Then revert:

```bash
kubectl set env deployment/urlshort DATABASE_URL="postgresql://postgres:postgres@postgres-svc/urldb"
```

### Step 8 — commit to GitOps

```bash
git add monitoring/servicemonitor.yaml monitoring/alert-rules.yaml
git commit -m "feat(obs): add Prometheus ServiceMonitor and error rate alert for urlshort"
git push
```

Argo CD (from M7) picks this up and applies the monitoring config. Your alert rules are now **declarative and drift-proof** — they live in Git like everything else in the system.

**✅ Sahi hua to aisa dikhega:** Grafana panel mein `/shorten` ke p50/p95/p99 latency ki teen alag lines dikh rahi hain; jab `kubectl set env` se DB URL galat karo, Prometheus UI mein alert `PENDING` se `FIRING` mein jaata hai aur lagbhag 5–6 minute mein Slack channel mein `HighErrorRate` message aa jaata hai; DB URL revert karne par alert wapas resolve ho jaata hai aur Grafana mein error rate zero pe aa jaata hai.

---

## Interview questions

1. **"Design the alerting strategy for a payments API. Walk me through what you page on versus what goes on a dashboard, and why."**
   *Expected direction:* page on SLO burn rate, success rate, and p99 latency crossing a threshold for a sustained duration. Dashboard-only: CPU, memory, queue depth, disk. Explain the symptom-vs-cause distinction and why cause-based alerts cause fatigue.

2. **"Explain p99 latency versus average. Why is average a bad SLI for most services?"**
   *Expected direction:* average hides the tail. If 95% of requests are fast and 5% are very slow, the average looks fine while 1-in-20 users has a bad experience. p99 catches this; it represents the experience of the slowest 1% of users, which is often a canary for broader degradation. Histograms enable percentile queries; averages do not.

3. **"Your error budget is exhausted 10 days into a 30-day window. What actually changes in how your team operates?"**
   *Expected direction:* no new risky feature deployments until the budget recovers. The team shifts to reliability work: fixing the root cause of the failures that burned the budget, improving test coverage, running postmortems. Describe how this is a governance decision, not a political one.

4. **"A team adds a `user_id` label to their request counter metric and within 24 hours Prometheus is OOMing. What happened and how do you fix it, both immediately and structurally?"**
   *Expected direction:* cardinality explosion — millions of unique time-series from unique user IDs. Immediate fix: drop the label at the Prometheus scrape relabelling config. Structural fix: replace with a route template label, enforce cardinality limits at the scrape level, add a Prometheus self-monitoring alert on `prometheus_tsdb_head_series > threshold`.

5. **"Metrics, logs, and traces all show green, but a customer calls to say the app is down for them. Where do you look?"**
   *Expected direction:* your instrumentation only covers what it covers. Possible gaps: CDN or DNS issue outside your cluster, a client-side JavaScript error, a mobile network problem, a synthetic monitor that would have caught this vs real-user monitoring. The answer surfaces the limits of server-side telemetry and introduces the concept of synthetic monitoring.

6. **"How would you prevent a single engineer's bad metric label from taking down Prometheus for the whole organisation?"**
   *Expected direction:* metric relabelling rules to drop or cap high-cardinality labels, per-job cardinality limits in Prometheus config, alerting on `prometheus_tsdb_head_series`, code review gates for any new `labels()` call in application metrics definitions, and in large orgs — a separate Prometheus per team so one team's explosion cannot affect another's.

7. **"What is tail-based trace sampling and when would you use it over head-based sampling?"**
   *Expected direction:* tail-based sampling collects all spans but only persists a trace if it meets a post-hoc condition (slow, errored). More useful because you keep the interesting traces and drop the boring ones. More expensive to run (need to buffer spans before deciding). Use it when you need high fidelity on errors and outliers but cannot afford 100% sampling at production traffic volumes.

---

## Production challenge

> Your `/shorten` endpoint's p99 latency has crept from 100ms to 1.5 seconds over two weeks. No alert fired — you are only alerting on error rate, not latency. A customer complained. Using only what M8 gives you — metrics, logs, and traces — design your investigation path in order and state what each step rules in or out. Then design the SLO and alert rule that would have caught this on day 3, not day 14.

*Guidance: start with the metric to scope the time range and whether it is request-wide or endpoint-specific; move to a trace for one of the slow requests to identify which span is slow; move to logs for that `trace_id` to see any warnings around the slow span. For the SLO design, define the SLI (p99 < X ms), the SLO target, and write the PromQL for an alert with a `for:` duration that would have fired early enough to be useful.*

---

*Next: `11-M9-advanced-k8s-internals.md` — when an alert fires and you need to investigate a running cluster deeply: node pressure, eviction thresholds, priority classes, and why your critical pod got evicted during a node memory spike.*

*For the incident response flow that begins the moment an Alertmanager notification fires, see `15-roadmap-M11-M18.md` — M11 is the first module in that track.*
