# 🎓 DevOps Principal Engineer Track — M10 to M18

> **Prerequisite:** M0–M9 (your existing bootcamp + capstone notes). This track does not re-teach Terraform/Ansible/Docker/K8s/GitOps — it assumes reconciliation, push/pull, idempotency, and the golden threads are already internalized.
> **What changes at this level:** M0–M9 answers *"how do I ship this."* M10–M18 answers *"how do I keep this alive under real load, real failure, real cost, and real teams."* This is the delta between bootcamp-graduate and 2.5–5yr production engineer.
> **Format:** same 5-layer template as your Capstone-DeepDive-v2 — 🔴 Model / ⚙️ Mechanism / 🔢 Numbers / 🐛 Failure / 🎤 Interview Q — plus production-specific additions: real incidents, on-call framing, hands-on lab tied to your existing `url-shortener` repo.

---

## 🗺️ Roadmap (M10–M18)

| # | Module | Core production question | Builds on | Introduces |
|---|--------|---------------------------|-----------|------------|
| **M10** | Observability & SRE | "Is it working, and how do you know?" | M4, M7 | Prometheus, Grafana, Loki, SLI/SLO/error budget |
| M11 | Incident Response | "It broke — now what?" | M10 | Severity, runbooks, blameless postmortem, MTTR |
| M12 | Advanced K8s / Platform | "1 cluster → 50 teams" | M4, M7 | Service mesh, CRDs/operators, OPA Gatekeeper |
| M13 | Progressive Delivery | "Ship to 1000 before 1M" | M7 | Canary, blue-green, Argo Rollouts, feature flags |
| M14 | Distributed Systems | "Why does scale break consistency?" | M0 | CAP theorem, Kafka/SQS, distributed locks |
| M15 | Data at Scale | "Snapshot ≠ DR strategy" | M9 | Replication, sharding, Redis, multi-region DR |
| M16 | Security & Supply Chain | "Is this image trustworthy end-to-end?" | M3, M6, M8 | SAST/DAST, SBOM, cosign, Vault, policy-as-code |
| M17 | Cost / FinOps | "Bill 10x'd — why?" | M5 | Spot/reserved mix, showback, capacity forecasting |
| M18 | Platform Engineering | "1000 engineers, 1 platform team" | all | Golden paths, internal developer platform |

M10 is fully built below. Say which module you want expanded next and it gets the same full treatment.

---

# 🟦 M10 — OBSERVABILITY & SRE

## 10.0 System framing (before any tool)

| | |
|---|---|
| **What** | The layer that turns "the app is running" into "the app is *healthy*, and I have evidence." |
| **Why it exists** | K8s (M4) tells you a pod is `Running`. It does not tell you the pod is slow, silently erroring on 2% of requests, or about to OOM in 20 minutes. Reconciliation fixes *known* problems (pod count). Observability finds *unknown* ones. |
| **Where it runs** | Inside the cluster (Prometheus/Grafana/Loki as pods, same as your app) — self-observing infra is standard. |
| **Who owns it** | In a real org: **platform/SRE team** owns the stack (Prometheus, alert routing, dashboards-as-code). **App teams** own their own dashboards/alerts for their service — you don't wait for a central team to tell you your service is slow. |
| **Input** | Every other module's output: pod CPU/memory (M4/M5), request latency (app code), Argo sync status (M7), CI pipeline duration (M6). Observability doesn't produce new *events* — it makes existing events **visible**. |
| **Output** | Dashboards, alerts, and — critically — an **error budget number** that becomes an input to M11 (incident response) and M13 (deploy velocity decisions). |
| **Connects to next** | M11 (an alert firing *is* the trigger for incident response) and M13 (canary analysis reads these same metrics to auto-abort a bad rollout). |

🎓 **Hinglish intuition:** M4's reconciliation loop is a chowkidar that only checks "kitne pod chahiye, kitne hain." Observability is CCTV + a logbook — it sees things the chowkidar's one question never asks: *"in in pods mein se kaunsa slow hai, kaunsa error de raha."*

---

## 10.1 The three pillars

Every production system needs to answer three different question types, and each needs a *different* data shape — this is why you run three separate tools, not one.

| Pillar | Question it answers | Data shape | Tool |
|--------|---------------------|------------|------|
| **Metrics** | "How much / how many, over time?" | Numeric time-series, cheap to store for years | Prometheus |
| **Logs** | "What exactly happened on this one request?" | Unstructured/structured text, expensive at scale | Loki (or ELK) |
| **Traces** | "Where did the time go, across services?" | A tree of timed spans per request | OpenTelemetry + Jaeger |

🔑 **Rule of thumb:** metrics tell you *something* is wrong (error rate up), logs tell you *what* (stack trace), traces tell you *where* (which downstream call is slow). You alert on metrics, you debug with logs and traces. Alerting on logs directly (grep for ERROR every minute) doesn't scale past a handful of services — that's what metrics exist to replace.

---

## 10.2 Metrics — Prometheus

- 🔴 **Model:** Prometheus is a **fitness tracker that only counts, never remembers why**. It polls (scrapes) your app every N seconds and asks "what are your numbers right now" — it doesn't push, it pulls, same PULL pattern you already know from Argo (M7).
- ⚙️ **Mechanism:** Your app exposes a `/metrics` HTTP endpoint (plain text, key-value pairs). Prometheus scrapes it on an interval, stores it as a time-series. You query with **PromQL**. Four metric types:
  - `Counter` — only goes up (total requests, total errors). Reset on restart, so you query `rate()` not the raw value.
  - `Gauge` — goes up/down (current memory, current queue depth).
  - `Histogram` — buckets of observations (request duration in `<100ms`, `<500ms`, `<1s` buckets) — this is how you get **p50/p95/p99 latency**, which matters far more than average latency.
  - `Summary` — like histogram but pre-computed quantiles client-side (less flexible, rarely preferred now).
- 🔢 **Numbers:** default scrape interval `15s`. Prometheus itself is stateful (local TSDB) — in K8s you either accept single-replica risk or run Thanos/Mimir for HA + long-term storage (out of scope for M10, flag for M18). Retention default `15d` locally.
- 🐛 **Failure — cardinality explosion (the #1 real incident in this space):** A `Counter` with a label like `user_id` or `request_path_with_id` creates a **new time-series per unique label value**. 10,000 users × 5 metrics = 50,000 series; Prometheus RAM usage scales with series count, not data volume. Teams have taken down their entire monitoring stack (OOM on Prometheus itself) by adding a high-cardinality label with good intentions. **Rule: labels must have a small, bounded set of values** (`method`, `status_code`, `route_template` — not `user_id`, not raw `path`).
- 🎤 **Interview Q:** *"Why average latency is a bad SLI?"* → Average hides the tail. If 95% of requests are 50ms and 5% are 5000ms, the average (~300ms) looks fine while 1-in-20 users have a terrible experience. You alert on **p99**, not average — that's what histograms are for.

---

## 10.3 Logs — Loki

- 🔴 **Model:** Loki is "Prometheus, but for logs" — same PromQL-like query language (LogQL), same label-based indexing, deliberately *doesn't* index full text (unlike ELK) to stay cheap at scale.
- ⚙️ **Mechanism:** Your app writes logs to stdout (never to a file inside the container — containers are cattle, M0). A node-level agent (Promtail/Fluent Bit) tails container stdout, attaches K8s labels (`pod`, `namespace`, `app`), ships to Loki. You then query: `{app="urlshort"} |= "ERROR"`.
- 🔑 **Structured logging matters:** `logger.info("shortened url", extra={"code": code, "user": uid})` (JSON) is queryable/filterable. `print(f"shortened {code}")` is not — you end up regex-parsing text at 2am. Senior engineers standardize a JSON log format across every service on day one.
- 🐛 **Failure:** stdout buffering — if your app buffers stdout (common in some language runtimes when not attached to a TTY), logs appear in bursts or not at all until the buffer flushes/container dies, making "the pod crashed, but no logs" a classic false lead. Force unbuffered output in production.
- 🎤 **Interview Q:** *"Why not just index everything in Elasticsearch?"* → Cost and operational overhead at scale — full-text indexing is expensive in both storage and compute. Loki's bet: index only labels (cheap, small), grep the log body at query time (works fine because you've already narrowed to one service/pod via labels).

---

## 10.4 Traces — OpenTelemetry + Jaeger

- 🔴 **Model:** A trace is a **relay race with a stopwatch at every handoff**. One user request gets a `trace_id`; every service it touches adds a timed `span`; you get a waterfall diagram of exactly where the 2 seconds went.
- ⚙️ **Mechanism:** OpenTelemetry SDK auto-instruments your framework (FastAPI, in your capstone's case), injects `trace_id`/`span_id` into outgoing requests via headers (`traceparent`), collector aggregates, Jaeger visualizes. This is the *only* pillar that's inherently useless in a single-service system — tracing earns its keep the moment you have 2+ services calling each other (your capstone is single-service; this becomes essential the moment you split into microservices, per your FAQ notes on that topic).
- 🐛 **Failure:** 100% trace sampling at high traffic is expensive (storage + overhead) — production systems sample (e.g. 1% of traces, or "always sample if it errored / is slow" — tail-based sampling).
- 🎤 **Interview Q:** *"Metrics say p99 is 3s. Where do you look next?"* → A trace for one of those slow requests. It shows the span breakdown — e.g. 2.9s was one downstream Postgres query, not app code. Metrics told you *that*; the trace told you *where*.

---

## 10.5 SLI / SLO / SLA / Error budget — the business-facing layer

This is the part that separates "I set up Grafana" from "I run production" — it's how observability becomes a **decision-making tool**, not just a dashboard.

| Term | Definition | Your capstone example |
|------|-----------|------------------------|
| **SLI** (Indicator) | The actual measured number | "% of `/shorten` requests returning `<500` in `<300ms`" |
| **SLO** (Objective) | Your internal target for that SLI | "99.5% of requests meet that bar, over 30 days" |
| **SLA** (Agreement) | The *external*, often contractual promise — usually looser than your SLO, with financial penalty if missed | "99.0% uptime or customer gets credited" |
| **Error budget** | `100% - SLO` = how much failure you're *allowed*. 99.5% SLO = 0.5% budget = ~3.6 hours/month you're allowed to be broken. | Once burned, teams **freeze risky deploys** until budget resets. |

🔑 **This is the senior-engineer insight most bootcamps skip:** the error budget isn't a vanity metric — it's a **governance mechanism**. It turns "should we ship this risky change" from a political argument into a number: *budget remaining > 0 → ship; budget exhausted → only reliability work until it recovers.* This is literally how Google SRE (the team that coined the term) resolves the permanent tension between feature velocity and reliability, without either side "winning" by politics.

---

## 10.6 Alertmanager — the bridge to on-call (M11 preview)

- ⚙️ **Mechanism:** Prometheus doesn't page anyone — it evaluates alert *rules* (PromQL expressions that should be false; when true, fire). Alertmanager receives firing alerts, **deduplicates**, **groups** (100 pods erroring = 1 page, not 100), applies **routing** (which team, based on labels), and **silences/inhibits** (don't page for "disk full" if "node down" already fired for the same node — inhibit the downstream noise).
- 🔑 **Alert on symptoms, not causes.** Page on "error rate > 1% for 5min" (a symptom users feel), not "CPU > 80%" (a cause that may or may not matter — maybe it's fine at 80% CPU and users notice nothing). This is the single most common beginner mistake in on-call setups: too many cause-based alerts → alert fatigue → real pages get ignored.
- 🐛 **Failure — the classic:** alerting on a raw threshold with no `for:` duration → a single scrape blip pages someone at 3am for nothing. Always pair a threshold with a duration (`error_rate > 1% for 5m`) so transient noise self-resolves before paging.

---

## 10.7 Request lifecycle — now with telemetry attached

Extends your existing Section 10 lifecycle diagram (Capstone-DeepDive-v2) — same request, now instrumented:

```
1. User → POST :30080/shorten
2. NodePort → kube-proxy → Service → EndpointSlice → Pod
   ⤷ [trace] span started: trace_id=abc123
3. Pod (FastAPI) handles request
   ⤷ [metric] http_requests_total{route="/shorten"} += 1
   ⤷ [metric] http_request_duration_seconds histogram observes: 0.043
   ⤷ [log]    {"event":"shorten_request","code":"xyz","trace_id":"abc123"}
4. Pod → RDS :5432 INSERT
   ⤷ [trace] child span: db_insert, duration=0.031s
5. Response → user
   ⤷ [trace] span closed: total=0.043s
6. (async, every 15s) Prometheus scrapes pod /metrics
7. (continuous) Loki agent tails pod stdout → ships log line
8. (rule eval, every 15-30s) Prometheus checks: error_rate > 1% for 5m?
   → false → nothing happens (this is the normal, silent case)
   → true  → Alertmanager fires → pages on-call → M11 begins
```

🔑 The telemetry emission (steps with `⤷`) happens **on every single request, always** — it's not conditional debugging code, it's baseline infrastructure. This is the mental shift: instrumentation isn't something you add when something breaks, it's something you build in *so that* when something breaks you already have the evidence.

---

## 10.8 Real production story — the cardinality incident (generalized pattern, seen across the industry)

A common, well-documented class of incident, not a specific attributed quote:

> A team adds a new metric to debug a slow endpoint: `request_duration{path=<full URL with query params>}`. Looks harmless in staging (a handful of routes). In production, the URL includes a dynamic resource ID — thousands of distinct values per hour. Within a day, Prometheus's in-memory series count goes from ~50K to several million. Prometheus itself starts OOMing and getting killed by K8s (ironic — the monitoring system needs monitoring). Dashboards go blank *during an unrelated ongoing incident*, because the observability layer became the outage. Fix: replace the raw path label with a **route template** (`/users/{id}` not `/users/8271`), and add a **cardinality limit** / label-drop rule at the Prometheus scrape config as a guardrail so a single bad label can't repeat this.

**The lesson that generalizes:** observability infrastructure is *itself* production infrastructure — it needs the same sizing/reliability discipline as your app (M5), and a bug in it can blind you during the exact moment you need it most. Senior engineers treat "can my monitoring survive the incident it's supposed to help me see" as a real design question.

---

## 10.9 Commands

```bash
# Port-forward Prometheus/Grafana locally (no LoadBalancer needed for dev)
kubectl port-forward svc/prometheus-server 9090:80 -n monitoring
kubectl port-forward svc/grafana 3000:80 -n monitoring

# Check what Prometheus is actually scraping right now
kubectl exec -it <prometheus-pod> -n monitoring -- wget -qO- localhost:9090/api/v1/targets

# Query directly (PromQL over HTTP) — 5xx rate over last 5 min
curl -s 'localhost:9090/api/v1/query?query=rate(http_requests_total{status=~"5.."}[5m])'

# Tail logs with a label filter (LogQL, via Grafana or logcli)
logcli query '{app="urlshort"} |= "ERROR"' --limit=50

# See what a Prometheus alert rule currently evaluates to
kubectl exec -it <prometheus-pod> -n monitoring -- promtool query instant \
  http://localhost:9090 'rate(http_requests_total{code="500"}[5m])'
```

---

## 10.10 Beginner mistake vs senior insight

| Beginner | Senior |
|----------|--------|
| "I added Grafana, we're observable now." | A dashboard nobody looks at until something's already broken isn't observability — it's decoration. Observability = alerts that page *before* users complain. |
| Alerts on every metric that *could* matter (CPU, memory, disk, queue depth...) | Alerts only on **symptoms** (SLO burn rate). Everything else is a dashboard panel, not a page. |
| "It's slow" (vague) | "p99 on `/shorten` went from 80ms to 1.2s starting 14:32, correlates with the RDS CPU graph — likely a slow query, not the app" (evidence-based, scoped, time-bound) |
| Logs `print()` free text | Structured JSON logs with `trace_id` so one log line can be joined back to its full trace and metric context |

---

## 10.11 Memory anchors

| Concept | One line |
|---------|---------|
| Metrics vs logs vs traces | how much / what exactly / where did time go |
| Prometheus pull model | same PULL pattern as Argo — scrapes, doesn't get pushed to |
| Cardinality | unique label combinations = RAM cost; bound your labels |
| p99 > average | average hides the tail that users actually feel |
| SLI/SLO/SLA | measured / your target / contractual promise (usually looser than SLO) |
| Error budget | 100% − SLO = how much failure you're allowed before freezing risky ships |
| Alert on symptoms | error rate, not CPU — CPU-at-80% might be totally fine |
| `for:` duration | stops a single scrape blip from paging someone at 3am |

---

## 10.12 Hands-on lab — instrument your actual capstone

Bolt this onto `url-shortener/` (no new project — extends what you already built):

1. `pip install prometheus-fastapi-instrumentator` → 3 lines in `main.py` auto-exposes `/metrics` with request count + latency histogram, labeled by route template (not raw path — apply the cardinality lesson immediately).
2. `helm install prometheus prometheus-community/kube-prometheus-stack -n monitoring --create-namespace` — ships Prometheus + Grafana + Alertmanager in one shot.
3. Add a `ServiceMonitor` (or `PodMonitor`) CR pointing at your `urlshort` Service so Prometheus discovers it — this is your first CRD, a preview of M12.
4. Build one Grafana panel: p50/p95/p99 latency of `/shorten`.
5. Write one Alertmanager rule: `error_rate > 1% for 5m` → route to a Slack webhook (free, no PagerDuty account needed for the lab).
6. **Prove it fires:** temporarily break the DB connection string in a test branch, deploy via your existing Argo flow, watch the alert fire in Slack within ~5-6 minutes of the error rate climbing. Then revert.
7. Commit `monitoring/servicemonitor.yaml` + `monitoring/alert-rules.yaml` into your repo under GitOps (M7) — the alert rules should be deployed by Argo like everything else, not clicked into existence manually. This closes the loop: even your monitoring config is now declarative and drift-proof.

---

## 10.13 Self-check quiz

1. Why can't you alert directly on raw log lines at scale — what breaks first?
2. A metric has labels `{route, method, status}` vs `{route, method, status, user_id}` — which one risks cardinality explosion, and why specifically?
3. Average latency is 120ms, p99 is 4.8s. What's actually happening, and which number do you page on?
4. What's the practical difference between an SLO and an SLA, and why is the SLO usually stricter?
5. Alertmanager fires 40 pages in 2 minutes for one node going down. What two Alertmanager features prevent this?
6. Why does adding a `for: 5m` to an alert rule matter more than the threshold value itself, in practice?

---

## 10.14 Interview questions (production-execution level)

- *"Design the alerting strategy for a payments API. Walk me through what you'd page on vs. dashboard-only, and why."*
- *"Your error budget is exhausted 10 days into a 30-day window. What actually changes in how the team operates?"*
- *"You have metrics, logs, and traces all showing green, but a customer says the app is down for them. Where do you look?"* (answer should surface: synthetic monitoring / real-user monitoring gap — your telemetry only sees what your instrumentation covers, e.g. it may miss a CDN/DNS/client-side issue entirely)
- *"How would you prevent a single engineer's bad metric label from taking down Prometheus for the whole org?"*

---

## 10.15 Production challenge

> Your `/shorten` endpoint's p99 latency has crept from 100ms to 1.5s over two weeks — no alerts fired because you're only alerting on error rate, not latency. A customer complains. Using only what M10 gives you (metrics + logs + traces), design your investigation path, in order, and state what each step should rule in or out. Then design the SLO + alert rule that would have caught this on day 3, not day 14.

---

> **Next:** M11 — Incident Response. The alert you just built in the lab fires → what happens in the next 15 minutes is M11. Say "build M11" (or name any other module from the roadmap) to continue the track in this same format.
