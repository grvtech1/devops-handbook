/* Company 2 — BillFree Labs · growing SaaS on Kubernetes.
   Real architecture: 7 stateless Deployments via one reusable Helm chart,
   self-managed Postgres StatefulSet, ArgoCD selfHeal, 6 PrometheusRule alerts.
   Pedagogical role: the platform DabbaDrop needed — and its new failure modes. */
window.CO_BILLFREE = {
  id:'billfree', name:'BillFree Labs', tag:'Growing SaaS', unlock:700,
  role:'Platform Engineer', env:'billfree-prod',
  stack:'EKS · Helm · ArgoCD GitOps · Prometheus · HPA',
  blurb:'A field-service SaaS. 7 microservices, one reusable Helm chart, GitOps deploys, real alerting. Everything DabbaDrop lacked, you now have — and with it, an entirely new class of failure.',
  services:[
    {n:'api-gateway',rep:'2/2',mem:'118Mi',cpu:'62m'},
    {n:'auth-service',rep:'2/2',mem:'171Mi',cpu:'41m'},
    {n:'ticket-service',rep:'2/2',mem:'104Mi',cpu:'38m'},
    {n:'analytics-service',rep:'2/2',mem:'131Mi',cpu:'55m'},
    {n:'calllog-service',rep:'2/2',mem:'99Mi',cpu:'27m'},
    {n:'report-service',rep:'2/2',mem:'112Mi',cpu:'33m'},
    {n:'web',rep:'2/2',mem:'87Mi',cpu:'19m'},
    {n:'postgres',rep:'1/1',mem:'201Mi',cpu:'88m'},
  ],
  arch:`                          🌐 users
                            │ HTTPS
                    ┌───────▼────────┐
                    │  ingress-nginx │
                    └───────┬────────┘
                    ┌───────▼────────┐
                    │  api-gateway   │  ← rate-limit, CORS, JWT verify
                    └───┬────┬───┬───┘
              ┌─────────┘    │   └─────────┐
        ┌─────▼─────┐  ┌─────▼─────┐ ┌─────▼──────┐
        │   auth    │  │  ticket   │ │ analytics  │  ← Deployments (stateless, HPA 2→8)
        └─────┬─────┘  └─────┬─────┘ └─────┬──────┘
              └──────────────┼─────────────┘
                       ┌─────▼──────┐
                       │ postgres-0 │  ← StatefulSet + PVC 5Gi (self-managed)
                       └────────────┘

  <span class="k">Deploy path</span>    git push → CI (test·build·scan) → image tag in Git → Argo CD sync → rolling update
  <span class="k">Observability</span>  ServiceMonitor → Prometheus → 6 alert rules → Alertmanager → #platform-oncall
  <span class="k">Failure points</span> postgres-0 is a single replica · auth memory limit 256Mi · HPA ceiling 8`,
  risks:[
    ['SPOF','postgres runs <span class="mono">replicas: 1</span> — the whole platform depends on one pod and one PVC'],
    ['Capacity','Several services run near their memory limit in steady state'],
    ['Pipeline','CI can commit an image tag even when the push step failed'],
  ],
  incidents:[
{
  id:'INC-2891', sev:'critical', alert:'PodCrashLooping', svc:'auth-service',
  title:'auth-service CrashLoopBackOff',
  paged:'03:14 IST', mttr:'14m', skill:'Resource limits · exit codes',
  teaches:'Reading exit 137 as an external kill, not an app bug',
  impact:{
    business:'~48% of login requests failing. Support tickets rising.',
    customer:"Users intermittently can't sign in. Retry sometimes works (1 of 2 pods healthy).",
    rule:'PodCrashLooping · restarts > 3 in 15m · severity: critical'
  },
  cmds:{
    'kubectl get pods -n billfree':{id:'get',out:[
      ['NAME                                READY   STATUS             RESTARTS      AGE','out'],
      ['api-gateway-7d4b9c6f8-xk2pq         1/1     Running            0             6d','out'],
      ['auth-service-5f8c7d9b4-9fm3l        0/1     CrashLoopBackOff   7 (42s ago)   6d','hi'],
      ['auth-service-5f8c7d9b4-p2wqz        1/1     Running            0             6d','out'],
      ['ticket-service-6b9d8c5f7-mn4rt      1/1     Running            0             6d','out'],
      ['postgres-0                          1/1     Running            0             12d','out'],
    ]},
    'kubectl describe pod auth-service-5f8c7d9b4-9fm3l -n billfree':{id:'describe',out:[
      ['Name:         auth-service-5f8c7d9b4-9fm3l','out'],
      ['Containers:','out'],['  auth-service:','out'],
      ['    State:          Waiting','out'],
      ['      Reason:       CrashLoopBackOff','warn'],
      ['    Last State:     Terminated','out'],
      ['      Reason:       OOMKilled','hi'],
      ['      Exit Code:    137','hi'],
      ['    Restart Count:  7','warn'],
      ['    Limits:','out'],['      cpu:     500m','out'],['      memory:  256Mi','hi'],
      ['    Requests:','out'],['      cpu:     50m','out'],['      memory:  96Mi','out'],
      ['Events:','out'],
      ['  Warning  BackOff  42s (x7)  kubelet  Back-off restarting failed container','warn'],
    ]},
    'kubectl logs auth-service-5f8c7d9b4-9fm3l -n billfree --previous':{id:'logs',out:[
      ['{"level":"info","msg":"auth-service starting","port":8080}','out'],
      ['{"level":"info","msg":"connected to postgres","host":"postgres:5432"}','out'],
      ['{"level":"info","msg":"jwt keys loaded"}','out'],
      ['{"level":"info","msg":"listening","addr":":8080"}','out'],
      ['','out'],
      ['── log ends abruptly · no error, no stack trace ──','warn'],
      ['💡 The app did NOT crash itself. Something killed it from outside.','hi'],
    ]},
    'kubectl top pod -n billfree':{id:'top',out:[
      ['NAME                                CPU(cores)   MEMORY(bytes)','out'],
      ['api-gateway-7d4b9c6f8-xk2pq         62m          118Mi','out'],
      ['auth-service-5f8c7d9b4-p2wqz        41m          254Mi','hi'],
      ['postgres-0                          88m          201Mi','out'],
      ['','out'],
      ['💡 auth-service at 254Mi — its limit is 256Mi. Sitting at 99%.','hi'],
    ]},
    'kubectl get events -n billfree --sort-by=.lastTimestamp':{id:'events',out:[
      ['LAST SEEN   TYPE      REASON      OBJECT                             MESSAGE','out'],
      ['4m          Warning   BackOff     pod/auth-service-5f8c7d9b4-9fm3l   Back-off restarting failed container','warn'],
      ['12m         Warning   Unhealthy   pod/auth-service-5f8c7d9b4-9fm3l   Readiness probe failed','warn'],
      ['','out'],
      ['💡 No image, scheduling, or DB errors — this is a runtime kill.','hi'],
    ]},
  },
  aliases:{
    'kubectl get pods':'kubectl get pods -n billfree',
    'kubectl top pod':'kubectl top pod -n billfree',
    'kubectl get events -n billfree':'kubectl get events -n billfree --sort-by=.lastTimestamp',
    'kubectl describe pod auth-service-5f8c7d9b4-9fm3l':'kubectl describe pod auth-service-5f8c7d9b4-9fm3l -n billfree',
    'kubectl logs auth-service-5f8c7d9b4-9fm3l --previous':'kubectl logs auth-service-5f8c7d9b4-9fm3l -n billfree --previous',
  },
  evidence:'exit code <b class="mono">137</b> · <b class="mono">Reason: OOMKilled</b> · logs end with no error · memory <b class="mono">254Mi</b> against a <b class="mono">256Mi</b> limit',
  choices:[
    {k:'A',t:'Bad image / wrong tag',d:'The container image is broken or missing.',ok:false,
     why:"The image pulled fine — you'd see ImagePullBackOff, not a running-then-killed container. The logs show it started successfully."},
    {k:'B',t:'Memory limit too low — container OOMKilled',d:'The kernel killed it for exceeding its 256Mi limit.',ok:true},
    {k:'C',t:'Postgres is down',d:"The service can't reach its database and exits.",ok:false,
     why:'The logs show <b class="mono">"connected to postgres"</b> — the DB is reachable. postgres-0 is Running 1/1.'},
    {k:'D',t:'Liveness probe timeout too aggressive',d:'kubelet is killing a healthy-but-slow container.',ok:false,
     why:'A probe kill shows <b class="mono">Reason: Error</b> with probe-failure events as the cause. Here <b class="mono">Reason: OOMKilled</b> is explicit.'},
  ],
  correctTitle:'✓ Correct — OOMKilled',
  correctBody:'Exit <b class="mono">137</b> = SIGKILL. Paired with <b class="mono">Reason: OOMKilled</b>, the kernel killed the container for breaching its 256Mi limit. The silent log is the giveaway: the app never errored — it was killed mid-breath. Memory at 254/256Mi confirms it.',
  fixNote:'This cluster is <b>GitOps-managed</b> — you do not <span class="mono">kubectl edit</span> production. Change the values in Git; Argo CD syncs it.',
  fixDiff:`deploy/apps/auth-service/values.yaml

 resources:
   requests:
     cpu: 50m
     memory: 96Mi
   limits:
     cpu: 500m
<span class="del">-    memory: 256Mi</span>
<span class="add">+    memory: 512Mi</span>`,
  shipLabel:'⬆ Commit &amp; push → Argo CD sync',
  shipOut:`$ git commit -m "fix(auth): raise memory limit 256Mi → 512Mi (OOMKilled)"
$ git push
<span class="add">→ Argo CD  auth-service  OutOfSync → Syncing → Synced ✓</span>
<span class="add">→ rolling update  maxUnavailable: 0  · zero downtime</span>
<span class="add">→ auth-service-6c9d8f2a1-k4mzp   1/1   Running   0   18s</span>
<span class="add">→ alert PodCrashLooping  RESOLVED</span>`,
  shipNote:'Git stayed the source of truth, so the change is reviewed, audited, and reproducible.',
  wrongLabel:'✎ kubectl edit deployment (hotfix)',
  wrongTitle:'⚠ It works… for about 90 seconds',
  wrongOut:`$ kubectl edit deployment auth-service -n billfree
deployment.apps/auth-service edited
<span class="del">→ Argo CD  auth-service  OutOfSync (manual change detected)</span>
<span class="del">→ selfHeal: true  → reverting to Git state…</span>
<span class="del">→ memory limit back to 256Mi · OOMKill returns</span>`,
  wrongNote:'This cluster runs Argo CD with <b class="mono">selfHeal: true</b>. Git is the source of truth — anything you hand-patch gets reverted. <b>Fix it in Git.</b>',
  rcaModel:`What happened: From 03:14–03:28 IST, ~48% of login requests failed. One of two auth-service pods was in CrashLoopBackOff (7 restarts).

Root cause: auth-service memory grew to its 256Mi limit; the kernel OOMKilled the container (exit 137). It restarted, refilled memory, and was killed again — a loop. Not an application bug; a capacity misconfiguration.

Detection: PodCrashLooping alert (restarts > 3 in 15m) paged on-call. Detected in 4m.

Resolution: Raised the memory limit to 512Mi via deploy/apps/auth-service/values.yaml; Argo CD synced; rolling update restored both pods. MTTR 14m.

Prevention:
1. BILL-482 — profile the memory growth (suspected unbounded JWT cache). A limit bump is a bandage, not a cure.
2. BILL-483 — alert at 90% of memory limit so we catch it BEFORE the OOMKill.
3. Review requests/limits headroom across all services — auth ran at 99% of limit in steady state.`,
  feedback:'"You followed the evidence instead of guessing — <b>describe → logs --previous → top</b> is exactly the order I want to see. You correctly read <span class="mono">exit 137</span> as an external kill rather than an app bug, and you shipped through Git instead of hot-patching prod.<br><br>Next level: raising the limit stopped the bleeding, but <b>you didn\'t answer <i>why</i> memory grew</b>. A Senior would open a follow-up ticket to profile the leak — a limit bump is a bandage, not a cure."',
  tickets:[
    ['P2','BILL-482','Profile auth-service memory growth — suspect JWT cache unbounded'],
    ['P3','BILL-483','Add HighMemoryUtilization alert at 90% — catch it before OOM'],
  ]
},
{
  id:'INC-2904', sev:'critical', alert:'TargetDown', svc:'ticket-service',
  title:'ticket-service ImagePullBackOff after deploy',
  paged:'11:02 IST', mttr:'9m', skill:'Supply chain · CI → registry → Git',
  teaches:'The image must exist in the registry BEFORE its tag lands in Git',
  impact:{
    business:'Ticket creation down. Field agents cannot log customer issues.',
    customer:'"Create ticket" returns 503. Complete outage of the ticketing feature.',
    rule:'TargetDown · up == 0 for 2m · severity: critical'
  },
  cmds:{
    'kubectl get pods -n billfree':{id:'get',out:[
      ['NAME                                READY   STATUS             RESTARTS   AGE','out'],
      ['api-gateway-7d4b9c6f8-xk2pq         1/1     Running            0          6d','out'],
      ['ticket-service-9c4f2a1b8-t7xkm      0/1     ImagePullBackOff   0          4m','hi'],
      ['ticket-service-9c4f2a1b8-w3nlp      0/1     ImagePullBackOff   0          4m','hi'],
      ['postgres-0                          1/1     Running            0          12d','out'],
      ['','out'],
      ['💡 Both new pods failing to pull. The old ReplicaSet was already scaled down.','hi'],
    ]},
    'kubectl describe pod ticket-service-9c4f2a1b8-t7xkm -n billfree':{id:'describe',out:[
      ['Name:         ticket-service-9c4f2a1b8-t7xkm','out'],
      ['Containers:','out'],['  ticket-service:','out'],
      ['    Image:  ghcr.io/grvtech1/billfree-techops/ticket-service:9f3c1a8e2b','hi'],
      ['    State:  Waiting','out'],
      ['      Reason: ImagePullBackOff','warn'],
      ['Events:','out'],
      ['  Normal   Pulling  4m   kubelet  Pulling image "ghcr.io/.../ticket-service:9f3c1a8e2b"','out'],
      ['  Warning  Failed   4m   kubelet  Failed to pull image: manifest unknown','hi'],
      ['  Warning  Failed   4m   kubelet  Error: ErrImagePull','warn'],
      ['  Warning  Failed   3m   kubelet  Error: ImagePullBackOff','warn'],
      ['','out'],
      ['💡 "manifest unknown" = the registry answered, but that TAG does not exist.','hi'],
    ]},
    'crane ls ghcr.io/grvtech1/billfree-techops/ticket-service':{id:'registry',out:[
      ['48b3805d1ef943b0fc52fbcbdd5e172edb706f16','out'],
      ['7a2e5c9d3f1b8a6e4c2d0b9f7e5a3c1d8b6f4e2a','out'],
      ['latest','out'],
      ['','out'],
      ['💡 Tag 9f3c1a8e2b is NOT in the registry. It was never pushed.','hi'],
    ]},
    'gh run list --repo grvtech1/billfree-techops --limit 3':{id:'ci',out:[
      ['STATUS   TITLE                          WORKFLOW   BRANCH  ID','out'],
      ['X        fix(ticket): add SLA field     ci.yml     main    9f3c1a8e2b','hi'],
      ['✓        chore: bump deps               ci.yml     main    7a2e5c9d3f','out'],
      ['','out'],
      ['💡 The CI run for 9f3c1a8e2b FAILED — but the image tag still reached Git.','hi'],
    ]},
    'kubectl get events -n billfree --sort-by=.lastTimestamp':{id:'events',out:[
      ['LAST SEEN   TYPE      REASON   OBJECT                              MESSAGE','out'],
      ['3m          Warning   Failed   pod/ticket-service-9c4f2a1b8-t7xkm  Error: ImagePullBackOff','warn'],
      ['4m          Warning   Failed   pod/ticket-service-9c4f2a1b8-t7xkm  Failed to pull image: manifest unknown','hi'],
      ['','out'],
      ['💡 No OOM, no crash — the container never started at all.','hi'],
    ]},
  },
  aliases:{
    'kubectl get pods':'kubectl get pods -n billfree',
    'kubectl describe pod ticket-service-9c4f2a1b8-t7xkm':'kubectl describe pod ticket-service-9c4f2a1b8-t7xkm -n billfree',
    'kubectl get events -n billfree':'kubectl get events -n billfree --sort-by=.lastTimestamp',
  },
  evidence:'<b class="mono">manifest unknown</b> · <b class="mono">ImagePullBackOff</b> · tag <b class="mono">9f3c1a8e2b</b> missing from the registry · that CI run <b>failed</b>',
  choices:[
    {k:'A',t:'Registry auth / imagePullSecret expired',d:'The cluster can no longer authenticate to ghcr.io.',ok:false,
     why:'An auth failure returns <b class="mono">unauthorized</b> or <b class="mono">denied</b>, and it would break <i>every</i> service. Here only ticket-service fails, and the error is <b class="mono">manifest unknown</b> — the registry answered us fine, it just has no such tag.'},
    {k:'B',t:'The image tag never existed — CI failed at the push step, but the tag still landed in Git',d:'Git points at an image that was never published.',ok:true},
    {k:'C',t:'Node disk is full — kubelet cannot unpack the image',d:'No space to store image layers.',ok:false,
     why:'Disk pressure shows as <b class="mono">no space left on device</b> plus node <b class="mono">DiskPressure</b> taints and pod evictions. Nothing here says that, and other pods pull fine.'},
    {k:'D',t:'NetworkPolicy is blocking egress to ghcr.io',d:'The cluster cannot reach the registry.',ok:false,
     why:'A blocked network times out (<b class="mono">i/o timeout</b> / <b class="mono">connection refused</b>). We got a real HTTP answer — <b class="mono">manifest unknown</b> — so we reached the registry.'},
  ],
  correctTitle:'✓ Correct — the image was never pushed',
  correctBody:'<b class="mono">manifest unknown</b> means the registry replied "that tag isn\'t here." The CI run for <b class="mono">9f3c1a8e2b</b> failed — but the tag was still committed to the config repo, so Argo CD dutifully deployed a pointer to nothing. <b>This is a broken pipeline contract:</b> the image must exist in the registry <i>before</i> its tag is allowed into Git.',
  fixNote:'The cluster is fine — <b>Git is wrong.</b> Roll the tag back to the last known-good SHA and let Argo CD restore service. Then fix the pipeline so this cannot recur.',
  fixDiff:`deploy/apps/ticket-service/values.yaml

 image:
   repository: ghcr.io/grvtech1/billfree-techops/ticket-service
<span class="del">-  tag: "9f3c1a8e2b"          # ← image never pushed (CI failed)</span>
<span class="add">+  tag: "48b3805d1ef943b0fc52fbcbdd5e172edb706f16"   # last known-good</span>`,
  shipLabel:'⬆ git revert → push → Argo CD sync',
  shipOut:`$ git revert a91f4c2 --no-edit
$ git push
<span class="add">→ Argo CD  ticket-service  OutOfSync → Syncing → Synced ✓</span>
<span class="add">→ ticket-service-6b9d8c5f7-mn4rt   1/1   Running   0   22s</span>
<span class="add">→ ticket-service-6b9d8c5f7-qp8vz   1/1   Running   0   19s</span>
<span class="add">→ alert TargetDown  RESOLVED</span>`,
  shipNote:'<b class="mono">git revert</b> (not <b class="mono">reset</b>) — it keeps history intact and is safe on a shared branch. Service restored in under a minute.',
  wrongLabel:'🔄 kubectl delete pod (force a re-pull)',
  wrongTitle:'⚠ Nothing changes — the tag still doesn\'t exist',
  wrongOut:`$ kubectl delete pod ticket-service-9c4f2a1b8-t7xkm -n billfree
pod "ticket-service-9c4f2a1b8-t7xkm" deleted
<span class="del">→ ReplicaSet creates a replacement…</span>
<span class="del">→ new pod pulls the SAME tag 9f3c1a8e2b</span>
<span class="del">→ Failed to pull image: manifest unknown</span>
<span class="del">→ ImagePullBackOff (again)</span>`,
  wrongNote:'Restarting only helps when the failure is <i>transient</i>. A missing tag is <b>deterministic</b> — it will fail identically, forever. Fix the pointer, not the pod.',
  rcaModel:`What happened: From 11:02–11:11 IST, ticket creation was fully down (503). Both ticket-service pods sat in ImagePullBackOff.

Root cause: CI run 9f3c1a8e2b failed at the image-push step, but the workflow still committed that image tag to the config repo. Argo CD synced Git faithfully and deployed a tag that was never published — the registry returned "manifest unknown". Kubernetes behaved correctly; our pipeline lied to it.

Detection: TargetDown alert (up == 0 for 2m) paged on-call. Detected in 2m.

Resolution: git revert of the tag commit back to the last known-good SHA; Argo CD synced; both pods Running. MTTR 9m.

Prevention:
1. BILL-501 — make the tag-bump job depend on push success (needs: build-push) so a failed build can never update Git.
2. BILL-502 — verify the manifest exists in the registry before committing the tag (crane manifest check in CI).
3. BILL-503 — keep the previous ReplicaSet available during rollout so a bad tag cannot take all pods down at once.`,
  feedback:'"Excellent read. You didn\'t stop at <span class="mono">ImagePullBackOff</span> — you asked <b>why</b> the pull failed and distinguished <span class="mono">manifest unknown</span> (tag missing) from an auth or network failure. That distinction is the whole incident.<br><br>Best part: you checked the <b>CI run</b>. Most engineers stay inside the cluster; you followed the chain back to where the lie originated. That\'s platform thinking.<br><br>Next level: you restored service — now make it structurally impossible. Git should never be able to reference an unpublished image."',
  tickets:[
    ['P1','BILL-501','Gate the tag-bump job on push success (needs: build-push)'],
    ['P2','BILL-502','Verify manifest exists in registry before committing a tag'],
    ['P3','BILL-503','Keep previous ReplicaSet available during rollout'],
  ]
},
{
  id:'INC-2915', sev:'critical', alert:'TargetDown', svc:'report-service',
  title:'report-service up but serving nothing',
  paged:'16:45 IST', mttr:'11m', skill:'Labels · selectors · endpoints',
  teaches:'"Running" ≠ "receiving traffic" — the Service finds pods by LABELS',
  impact:{
    business:'All report generation failing. Month-end close blocked for finance.',
    customer:'Reports page returns 503. Pods look perfectly healthy in the dashboard.',
    rule:'TargetDown · up == 0 for 2m · severity: critical'
  },
  cmds:{
    'kubectl get pods -n billfree':{id:'get',out:[
      ['NAME                                READY   STATUS    RESTARTS   AGE','out'],
      ['report-service-7f9c2d4a6-h5jkl      1/1     Running   0          8m','ok'],
      ['report-service-7f9c2d4a6-r2mnb      1/1     Running   0          8m','ok'],
      ['api-gateway-7d4b9c6f8-xk2pq         1/1     Running   0          6d','out'],
      ['','out'],
      ['💡 Pods look PERFECT. 1/1 Running, no restarts. Yet traffic is dying.','hi'],
    ]},
    'kubectl get svc,endpoints -n billfree':{id:'endpoints',out:[
      ['NAME                        TYPE        CLUSTER-IP      PORT(S)','out'],
      ['service/report-service      ClusterIP   10.96.142.87    80/TCP','out'],
      ['service/api-gateway         ClusterIP   10.96.201.14    8080/TCP','out'],
      ['','out'],
      ['NAME                          ENDPOINTS','out'],
      ['endpoints/report-service      <none>','hi'],
      ['endpoints/api-gateway         10.244.1.7:8080,10.244.2.4:8080','out'],
      ['','out'],
      ['💡 report-service has ZERO endpoints. The Service is pointing at nothing.','hi'],
    ]},
    'kubectl describe svc report-service -n billfree':{id:'describe',out:[
      ['Name:       report-service','out'],
      ['Selector:   app.kubernetes.io/instance=report-service,app.kubernetes.io/name=report-service','hi'],
      ['Type:       ClusterIP','out'],
      ['IP:         10.96.142.87','out'],
      ['Port:       http  80/TCP','out'],
      ['Endpoints:  <none>','hi'],
      ['','out'],
      ['💡 The Service is LOOKING for name=report-service. Are the pods wearing that label?','hi'],
    ]},
    'kubectl get pods -n billfree --show-labels':{id:'labels',out:[
      ['NAME                             READY   STATUS    LABELS','out'],
      ['report-service-7f9c2d4a6-h5jkl   1/1     Running   app.kubernetes.io/instance=report-service,app.kubernetes.io/name=reports','hi'],
      ['report-service-7f9c2d4a6-r2mnb   1/1     Running   app.kubernetes.io/instance=report-service,app.kubernetes.io/name=reports','hi'],
      ['api-gateway-7d4b9c6f8-xk2pq      1/1     Running   app.kubernetes.io/instance=api-gateway,app.kubernetes.io/name=api-gateway','out'],
      ['','out'],
      ['💡 FOUND IT. Pods say name=reports. Service wants name=report-service. Mismatch.','hi'],
    ]},
    'git log --oneline -3 -- deploy/apps/report-service/values.yaml':{id:'git',out:[
      ['c4e91a2 refactor: shorten nameOverride to "reports"','hi'],
      ['a71b3f8 chore: bump image tag','out'],
      ['9e2d5c1 feat: add report-service','out'],
      ['','out'],
      ['💡 A "harmless" rename 8 minutes ago changed the pod labels.','hi'],
    ]},
  },
  aliases:{
    'kubectl get pods':'kubectl get pods -n billfree',
    'kubectl get endpoints -n billfree':'kubectl get svc,endpoints -n billfree',
    'kubectl describe svc report-service':'kubectl describe svc report-service -n billfree',
    'kubectl get pods --show-labels':'kubectl get pods -n billfree --show-labels',
  },
  evidence:'pods <b class="mono">1/1 Running</b> · Service endpoints <b class="mono">&lt;none&gt;</b> · selector wants <b class="mono">name=report-service</b> · pods wear <b class="mono">name=reports</b>',
  choices:[
    {k:'A',t:'Pods are crashing',d:'The containers keep restarting so traffic fails.',ok:false,
     why:'They are <b class="mono">1/1 Running</b> with <b class="mono">0</b> restarts and have been up 8m. Nothing is crashing — that is exactly what makes this incident sneaky.'},
    {k:'B',t:'Service selector no longer matches pod labels — endpoints are empty',d:'A rename changed the pod labels; the Service is looking for a label nobody wears.',ok:true},
    {k:'C',t:'NetworkPolicy is blocking traffic to the pods',d:'A firewall rule dropped the packets.',ok:false,
     why:'A NetworkPolicy blocks packets <i>after</i> routing — the Service would still list endpoints. Here <b class="mono">Endpoints: &lt;none&gt;</b>, so traffic has nowhere to be sent in the first place.'},
    {k:'D',t:'Ingress is misconfigured',d:'The route to the Service is wrong.',ok:false,
     why:'Ingress sits <i>in front of</i> the Service. Even a perfect Ingress cannot help a Service with zero endpoints — you would just move the 503 one hop upstream.'},
  ],
  correctTitle:'✓ Correct — selector/label mismatch',
  correctBody:'A Service does not know about Deployments or pod names. It finds pods by <b>label selector</b> → builds an <b>EndpointSlice</b> of ready pod IPs. Someone shortened <b class="mono">nameOverride</b> to <b class="mono">reports</b>, which changed the pod labels — but the Service still selects <b class="mono">name=report-service</b>. Zero matches → zero endpoints → every request 503s, while the pods sit there perfectly healthy. <b>Labels are the glue. Break the glue and healthy pods become invisible.</b>',
  fixNote:'Nothing is wrong with the pods or the Service individually — the <b>glue between them</b> is broken. Restore the name so labels and selector agree again.',
  fixDiff:`deploy/apps/report-service/values.yaml

<span class="del">-nameOverride: reports</span>
<span class="add">+nameOverride: report-service</span>

 image:
   repository: ghcr.io/grvtech1/billfree-techops/report-service`,
  shipLabel:'⬆ git revert → push → Argo CD sync',
  shipOut:`$ git revert c4e91a2 --no-edit
$ git push
<span class="add">→ Argo CD  report-service  OutOfSync → Syncing → Synced ✓</span>
<span class="add">→ pods re-created with label app.kubernetes.io/name=report-service</span>
<span class="add">→ endpoints/report-service   10.244.1.9:8080,10.244.2.6:8080</span>
<span class="add">→ alert TargetDown  RESOLVED</span>`,
  shipNote:'Endpoints repopulated the instant the labels matched again. No pod was ever unhealthy.',
  wrongLabel:'🔄 kubectl rollout restart deployment',
  wrongTitle:'⚠ New pods, same wrong labels',
  wrongOut:`$ kubectl rollout restart deployment report-service -n billfree
deployment.apps/report-service restarted
<span class="del">→ 2 new pods created… 1/1 Running</span>
<span class="del">→ labels: app.kubernetes.io/name=reports   (unchanged — it comes from Git)</span>
<span class="del">→ endpoints/report-service   &lt;none&gt;</span>
<span class="del">→ still 503</span>`,
  wrongNote:'Restarting recreates pods from the <i>same template</i> — the labels come from the chart values, so they come back identical. When the pods are healthy, restarting them is never the fix.',
  rcaModel:`What happened: From 16:45–16:56 IST, report generation returned 503 for all users. Month-end close was blocked. Pods were 1/1 Running the entire time — nothing looked wrong on the dashboard.

Root cause: A refactor commit shortened nameOverride from "report-service" to "reports". That value feeds the pod labels via the chart helpers, so pods were re-created with app.kubernetes.io/name=reports. The Service selector still targeted name=report-service, so it matched zero pods and its EndpointSlice went empty. Healthy pods, no route to them.

Detection: TargetDown alert (up == 0 for 2m) — Prometheus scrapes through the Service, so empty endpoints look identical to "service is down". Detected in 2m.

Resolution: git revert of the rename; Argo CD synced; pods re-created with matching labels; endpoints repopulated immediately. MTTR 11m.

Prevention:
1. BILL-517 — CI check: fail if any Service selector matches zero pods in the rendered manifests (helm template + selector diff).
2. BILL-518 — treat nameOverride as an immutable field; document that it drives labels, not just display names.
3. BILL-519 — add an alert on Service endpoints == 0, which names the failure precisely instead of the generic TargetDown.`,
  feedback:'"This is the one that fools most engineers, and you didn\'t take the bait. The pods were green — the natural instinct is to restart them and hope. You went to <span class="mono">get endpoints</span> and found the truth in one command.<br><br><b>Running ≠ reachable.</b> You now understand that a Service is just a label query, and labels are the glue holding the whole cluster together. Then you traced it to the exact commit — that\'s root cause, not symptom.<br><br>Next level: your prevention idea (CI failing on a zero-match selector) is genuinely senior thinking. Build it."',
  tickets:[
    ['P1','BILL-517','CI check: fail build if a Service selector matches zero pods'],
    ['P2','BILL-518','Document nameOverride as label-driving / effectively immutable'],
    ['P3','BILL-519','Alert on Service endpoints == 0 (more precise than TargetDown)'],
  ]
},
{
  id:'INC-2938', sev:'critical', alert:'HighErrorRate', svc:'postgres',
  title:'postgres-0 disk full — writes failing platform-wide',
  paged:'02:38 IST', mttr:'23m', skill:'StatefulSet · PVC · storage',
  teaches:'Stateful debugging — and why a single-replica DB is a SPOF',
  impact:{
    business:'All writes failing platform-wide. Revenue-affecting: no new tickets, no new users.',
    customer:'Reads work, every save fails with 500. Data being lost at the edge.',
    rule:'HighErrorRate · 5xx > 5% for 5m · severity: critical'
  },
  cmds:{
    'kubectl get pods -n billfree':{id:'get',out:[
      ['NAME                             READY   STATUS    RESTARTS   AGE','out'],
      ['postgres-0                       1/1     Running   0          12d','warn'],
      ['auth-service-5f8c7d9b4-p2wqz     1/1     Running   0          6d','out'],
      ['ticket-service-6b9d8c5f7-mn4rt   1/1     Running   0          6d','out'],
      ['','out'],
      ['💡 Everything Running — including postgres. But 5xx is at 31%.','hi'],
    ]},
    'kubectl logs postgres-0 -n billfree --tail=20':{id:'logs',out:[
      ['2026-07-16 02:36:11 UTC [1] LOG:  checkpoint starting: time','out'],
      ['2026-07-16 02:37:44 UTC [412] ERROR:  could not extend file "base/16384/2601": No space left on device','hi'],
      ['2026-07-16 02:37:44 UTC [412] HINT:  Check free disk space.','hi'],
      ['2026-07-16 02:38:02 UTC [418] FATAL:  could not write to file "pg_wal/xlogtemp.418": No space left on device','hi'],
      ['2026-07-16 02:38:09 UTC [1] LOG:  database system is shut down request ignored','warn'],
      ['','out'],
      ['💡 The database is UP but cannot WRITE. Reads succeed, writes 500.','hi'],
    ]},
    'kubectl exec postgres-0 -n billfree -- df -h /var/lib/postgresql/data':{id:'df',out:[
      ['Filesystem      Size  Used Avail Use% Mounted on','out'],
      ['/dev/nvme1n1    4.9G  4.9G     0 100% /var/lib/postgresql/data','hi'],
      ['','out'],
      ['💡 100% full. Zero bytes available. This is the whole incident.','hi'],
    ]},
    'kubectl get pvc -n billfree':{id:'pvc',out:[
      ['NAME             STATUS   VOLUME       CAPACITY   ACCESS MODES   STORAGECLASS   AGE','out'],
      ['data-postgres-0  Bound    pvc-8f2a...  5Gi        RWO            gp3            12d','hi'],
      ['','out'],
      ['💡 5Gi PVC — created by the StatefulSet volumeClaimTemplates 12 days ago.','hi'],
    ]},
    'kubectl get storageclass gp3 -o jsonpath="{.allowVolumeExpansion}"':{id:'sc',out:[
      ['true','ok'],
      ['','out'],
      ['💡 allowVolumeExpansion: true → we can grow this PVC in place, no data loss.','hi'],
    ]},
  },
  aliases:{
    'kubectl get pods':'kubectl get pods -n billfree',
    'kubectl logs postgres-0':'kubectl logs postgres-0 -n billfree --tail=20',
    'kubectl exec postgres-0 -- df -h':'kubectl exec postgres-0 -n billfree -- df -h /var/lib/postgresql/data',
    'kubectl get pvc':'kubectl get pvc -n billfree',
  },
  evidence:'<b class="mono">No space left on device</b> · disk <b class="mono">100%</b> (4.9G/4.9G) · PVC is <b class="mono">5Gi</b> · postgres is <b class="mono">Running</b> but cannot write',
  choices:[
    {k:'A',t:'Postgres crashed and needs a restart',d:'The database process died.',ok:false,
     why:'postgres-0 is <b class="mono">1/1 Running</b> with 0 restarts and is still serving reads. It is alive — it simply cannot write a single byte.'},
    {k:'B',t:'The 5Gi PVC is full — no space left on device',d:'The volume backing postgres has no free space, so every write fails.',ok:true},
    {k:'C',t:'Network partition between services and postgres',d:'The services cannot reach the database.',ok:false,
     why:'If the network were down you would see connection timeouts, and <i>reads</i> would fail too. Reads work fine — we are connected and getting real errors back from postgres.'},
    {k:'D',t:'Connection pool exhausted — too many clients',d:'Postgres is refusing new connections.',ok:false,
     why:'That raises <b class="mono">FATAL: sorry, too many clients already</b>. Our logs say <b class="mono">No space left on device</b> — an unambiguous disk error.'},
  ],
  correctTitle:'✓ Correct — the PVC is full',
  correctBody:'Postgres is <i>running</i> but its 5Gi volume has zero free bytes, so every write — including the WAL — fails. That is why reads succeed and writes 500: a uniquely confusing signature that only makes sense once you look at the disk. <b>This is the StatefulSet reality:</b> pods are disposable, but that PVC is the one thing that is not. Deleting the pod changes nothing — the same full disk gets re-mounted.',
  fixNote:'The StorageClass has <b class="mono">allowVolumeExpansion: true</b>, so we can grow the volume in place with no data loss. Note: <b class="mono">volumeClaimTemplates</b> in a StatefulSet is immutable — you patch the <b>PVC</b> directly, then update Git so the next re-create matches.',
  fixDiff:`# 1) Expand the live PVC (immediate relief, no data loss)
$ kubectl patch pvc data-postgres-0 -n billfree \\
    -p '{"spec":{"resources":{"requests":{"storage":"20Gi"}}}}'

# 2) Update Git so a future re-create matches reality
deploy/platform/postgres.yaml

   volumeClaimTemplates:
     - metadata:
         name: data
       spec:
         accessModes: ["ReadWriteOnce"]
         resources:
           requests:
<span class="del">-            storage: 5Gi</span>
<span class="add">+            storage: 20Gi</span>`,
  shipLabel:'⬆ Patch PVC + commit to Git',
  shipOut:`$ kubectl patch pvc data-postgres-0 -n billfree -p '{"spec":{"resources":{"requests":{"storage":"20Gi"}}}}'
persistentvolumeclaim/data-postgres-0 patched
<span class="add">→ Condition: FileSystemResizePending → Resizing → resized ✓</span>
<span class="add">→ df -h  /var/lib/postgresql/data   20G  4.9G  15G  25%</span>
<span class="add">→ postgres: checkpoint completed · WAL writing again</span>
<span class="add">→ 5xx rate 31% → 0.2%</span>
$ git commit -m "fix(platform): grow postgres PVC 5Gi → 20Gi (disk full)" &amp;&amp; git push
<span class="add">→ Argo CD  platform  Synced ✓</span>
<span class="add">→ alert HighErrorRate  RESOLVED</span>`,
  shipNote:'Online expansion — no downtime, no data loss. Git updated so the cluster and the repo agree again (no drift).',
  wrongLabel:'🔄 kubectl delete pod postgres-0',
  wrongTitle:'⚠ Dangerous — and it fixes nothing',
  wrongOut:`$ kubectl delete pod postgres-0 -n billfree
pod "postgres-0" deleted
<span class="del">→ StatefulSet re-creates postgres-0…</span>
<span class="del">→ re-mounts the SAME PVC data-postgres-0 (that is the point of a StatefulSet)</span>
<span class="del">→ df -h  →  4.9G  4.9G  0  100%</span>
<span class="del">→ still: No space left on device</span>
<span class="del">→ …and you just took the ONLY database replica down mid-incident</span>`,
  wrongNote:'The pod was never the problem — the <b>volume</b> is. A StatefulSet deliberately re-attaches the same PVC to the same ordinal, so the full disk comes right back. Worse: with <b class="mono">replicas: 1</b> you just caused a hard outage on top of a soft one.',
  rcaModel:`What happened: From 02:38–03:01 IST, every write across the platform failed with 500 (5xx peaked at 31%). Reads continued to work, which delayed diagnosis. postgres-0 was Running 1/1 the whole time.

Root cause: The postgres PVC (5Gi, provisioned 12 days ago from the StatefulSet volumeClaimTemplates) reached 100% utilisation. Postgres could not extend its data files or write WAL — "No space left on device" — so all writes failed while reads served fine from existing pages. We had no alert on volume utilisation, so we learned about it from the customer-facing error rate instead.

Detection: HighErrorRate alert (5xx > 5% for 5m). Detected in 5m — too slow. The disk had been filling for days with no warning.

Resolution: Expanded the PVC in place to 20Gi (StorageClass gp3 has allowVolumeExpansion: true) — online, no data loss. Committed the new size to deploy/platform/postgres.yaml so Git matches the cluster. MTTR 23m.

Prevention:
1. BILL-534 — alert on kubelet_volume_stats_available_bytes < 20%. This should have paged us days ago, not at 100%.
2. BILL-535 — postgres runs replicas: 1 with no automated backup verification. It is a single point of failure for the entire platform. Evaluate CloudNativePG (the chart comment already suggests it) or a managed RDS.
3. BILL-536 — set a WAL retention/archive policy; unbounded WAL was a large share of the growth.
4. BILL-537 — capacity review: 5Gi was chosen at bootstrap and never revisited against real growth.`,
  feedback:'"Strong work under pressure at 2:38 AM. The reads-work/writes-fail signature confuses most people into hunting for an application bug — you went to the logs, saw <span class="mono">No space left on device</span>, and confirmed it with <span class="mono">df</span> inside the pod. Evidence, then action.<br><br>The best decision you made was the one you <b>didn\'t</b>: you didn\'t delete the pod. With <span class="mono">replicas: 1</span>, that would have turned a write outage into a total outage — and the PVC would have come back just as full.<br><br>Next level: this incident was <b>predictable</b>. A disk fills gradually — it should page us at 80%, not at 100% via customer 5xx. And it is time to have the honest conversation about a single-replica database holding the whole platform."',
  tickets:[
    ['P1','BILL-534','Alert on PVC utilisation > 80% (kubelet_volume_stats_available_bytes)'],
    ['P1','BILL-535','postgres replicas:1 is a SPOF — evaluate CloudNativePG or managed RDS'],
    ['P2','BILL-536','Set WAL retention / archive policy'],
    ['P3','BILL-537','Capacity review — 5Gi never revisited since bootstrap'],
  ]
},
{
  id:'INC-2952', sev:'critical', alert:'PodCrashLooping', svc:'analytics-service',
  title:'analytics-service CrashLoopBackOff — again exit 137',
  paged:'09:47 IST', mttr:'21m', skill:'Probes · liveness vs readiness',
  teaches:'exit 137 is not always OOM — an aggressive liveness probe kills healthy containers',
  impact:{
    business:'Analytics dashboards timing out. Scheduled reports incomplete for 3 enterprise accounts.',
    customer:'Dashboard spins, then errors. Data is intact — it just cannot be served reliably.',
    rule:'PodCrashLooping · restarts > 3 in 15m · severity: critical'
  },
  cmds:{
    'kubectl get pods -n billfree':{id:'get',out:[
      ['NAME                                READY   STATUS             RESTARTS      AGE','out'],
      ['api-gateway-7d4b9c6f8-xk2pq         1/1     Running            0             9d','out'],
      ['auth-service-6c9d8f2a1-k4mzp        1/1     Running            0             3d','out'],
      ['analytics-service-8b3f6d2c9-r7hjt   0/1     CrashLoopBackOff   5 (38s ago)   9d','hi'],
      ['analytics-service-8b3f6d2c9-v2klq   1/1     Running            0             9d','out'],
      ['postgres-0                          1/1     Running            0             15d','out'],
      ['','out'],
      ['💡 Looks identical to INC-2891. Do not assume it is the same cause.','hi'],
    ]},
    'kubectl describe pod analytics-service-8b3f6d2c9-r7hjt -n billfree':{id:'describe',out:[
      ['Name:         analytics-service-8b3f6d2c9-r7hjt','out'],
      ['Containers:','out'],['  analytics-service:','out'],
      ['    State:          Waiting','out'],
      ['      Reason:       CrashLoopBackOff','warn'],
      ['    Last State:     Terminated','out'],
      ['      Reason:       Error','hi'],
      ['      Exit Code:    137','hi'],
      ['    Restart Count:  5','warn'],
      ['    Limits:','out'],['      cpu:     500m','out'],['      memory:  512Mi','out'],
      ['    Requests:','out'],['      cpu:     50m','out'],['      memory:  128Mi','out'],
      ['    Liveness:   http-get http://:8080/healthz delay=5s timeout=1s period=5s #success=1 #failure=3','hi'],
      ['    Readiness:  http-get http://:8080/readyz  delay=5s timeout=1s period=10s #success=1 #failure=3','out'],
      ['Events:','out'],
      ['  Warning  Unhealthy  2m (x15)  kubelet  Liveness probe failed: Get "http://10.244.2.31:8080/healthz": context deadline exceeded','hi'],
      ['  Normal   Killing    2m (x5)   kubelet  Container analytics-service failed liveness probe, will be restarted','hi'],
      ['','out'],
      ['💡 Reason: Error — NOT OOMKilled. Compare with INC-2891.','hi'],
    ]},
    'kubectl logs analytics-service-8b3f6d2c9-r7hjt -n billfree --previous':{id:'logs',out:[
      ['{"level":"info","msg":"analytics-service starting","port":8080}','out'],
      ['{"level":"info","msg":"connected to postgres","host":"postgres:5432"}','out'],
      ['{"level":"info","msg":"listening","addr":":8080"}','out'],
      ['{"level":"info","msg":"report generated","account":"acme-corp","rows":184203,"ms":1180}','out'],
      ['{"level":"info","msg":"report generated","account":"initech","rows":201884,"ms":1240}','out'],
      ['','out'],
      ['── log ends abruptly · no error, no stack trace, no OOM ──','warn'],
      ['💡 It was serving fine. Note those 1.2s report times — remember that number.','hi'],
    ]},
    'kubectl top pod -n billfree':{id:'top',out:[
      ['NAME                                CPU(cores)   MEMORY(bytes)','out'],
      ['api-gateway-7d4b9c6f8-xk2pq         62m          118Mi','out'],
      ['analytics-service-8b3f6d2c9-v2klq   340m         118Mi','hi'],
      ['postgres-0                          88m          201Mi','out'],
      ['','out'],
      ['💡 Memory 118Mi against a 512Mi limit — 23%. Memory is NOT the problem here.','hi'],
    ]},
    'kubectl get events -n billfree --sort-by=.lastTimestamp':{id:'events',out:[
      ['LAST SEEN   TYPE      REASON      OBJECT                                  MESSAGE','out'],
      ['38s         Warning   Unhealthy   pod/analytics-service-8b3f6d2c9-r7hjt   Liveness probe failed: context deadline exceeded','hi'],
      ['38s         Normal    Killing     pod/analytics-service-8b3f6d2c9-r7hjt   failed liveness probe, will be restarted','hi'],
      ['2m          Warning   BackOff     pod/analytics-service-8b3f6d2c9-r7hjt   Back-off restarting failed container','warn'],
      ['','out'],
      ['💡 No OOM event anywhere. The kubelet is doing the killing, deliberately.','hi'],
    ]},
  },
  aliases:{
    'kubectl get pods':'kubectl get pods -n billfree',
    'kubectl top pod':'kubectl top pod -n billfree',
    'kubectl get events -n billfree':'kubectl get events -n billfree --sort-by=.lastTimestamp',
    'kubectl describe pod analytics-service-8b3f6d2c9-r7hjt':'kubectl describe pod analytics-service-8b3f6d2c9-r7hjt -n billfree',
    'kubectl logs analytics-service-8b3f6d2c9-r7hjt --previous':'kubectl logs analytics-service-8b3f6d2c9-r7hjt -n billfree --previous',
  },
  evidence:'exit <b class="mono">137</b> but <b class="mono">Reason: Error</b> (not OOMKilled) · memory <b class="mono">118Mi</b> of a <b class="mono">512Mi</b> limit · <b class="mono">Liveness probe failed: context deadline exceeded</b> · liveness <b class="mono">timeout=1s</b> · reports take <b class="mono">1.2s</b>',
  choices:[
    {k:'A',t:'Memory limit too low — OOMKilled',d:'Same as INC-2891 — the kernel killed it.',ok:false,
     why:'Two things say no. <b class="mono">top</b> shows 118Mi against a 512Mi limit (23%), and <b class="mono">describe</b> says <b class="mono">Reason: Error</b>, not <b class="mono">OOMKilled</b>. For an OOM kill, <b>both</b> the exit code AND the Reason must line up. Exit 137 alone is not enough.'},
    {k:'B',t:'Liveness probe timeout too aggressive — kubelet is killing a healthy container',d:'The app is briefly slow; the 1s probe times out and kubelet restarts it.',ok:true},
    {k:'C',t:'Readiness probe misconfigured',d:'The readiness check is failing and taking the pod down.',ok:false,
     why:'A readiness failure <b>never kills a container</b> — it only removes the pod from the Service endpoints (it goes 0/1 but keeps Running). A <b>restart loop</b> can only come from liveness (or a crash).'},
    {k:'D',t:'Application deadlock or bug',d:'The code hangs and the process dies.',ok:false,
     why:'The logs show it serving reports normally right up to the kill — no error, no stack trace. And it dies at a regular cadence, which points to an external timer, not a bug. A real deadlock would not restart cleanly and then repeat identically.'},
  ],
  correctTitle:'✓ Correct — the liveness probe killed a healthy container',
  correctBody:'Exit <b class="mono">137</b> = SIGKILL — and <b>two</b> different things send it: the kernel OOM killer, or <b>the kubelet after a failed liveness probe</b>. The <b class="mono">Reason:</b> field tells you which — <b class="mono">OOMKilled</b> vs <b class="mono">Error</b>. Here: <b class="mono">timeout=1s</b>, but a large report blocks the event loop for <b class="mono">~1.2s</b>. The probe times out, 3 failures in a row, kubelet kills it. <b>The app was never unhealthy — it was briefly busy.</b> This is the classic self-inflicted outage: the probe meant to protect availability is the thing destroying it.',
  fixNote:'GitOps cluster — fix the probe values in Git. And note the direction: <b>readiness</b> can be strict (it just parks traffic), <b>liveness</b> must be forgiving (it kills).',
  fixDiff:`deploy/apps/analytics-service/values.yaml

 probes:
   liveness:
     path: /healthz
<span class="del">-    timeoutSeconds: 1</span>
<span class="del">-    periodSeconds: 5</span>
<span class="del">-    failureThreshold: 3</span>
<span class="add">+    timeoutSeconds: 5        # a slow reply is not a dead app</span>
<span class="add">+    periodSeconds: 10</span>
<span class="add">+    failureThreshold: 6      # ~60s of real failure before killing</span>
<span class="add">+    initialDelaySeconds: 20  # let it warm up first</span>
   readiness:
     path: /readyz            # readiness stays strict — it only parks traffic`,
  shipLabel:'⬆ Commit &amp; push → Argo CD sync',
  shipOut:`$ git commit -m "fix(analytics): relax liveness probe — killing healthy pods (exit 137, Reason: Error)"
$ git push
<span class="add">→ Argo CD  analytics-service  OutOfSync → Syncing → Synced ✓</span>
<span class="add">→ analytics-service-9f2a7c4d1-x8ntv   1/1   Running   0   45s</span>
<span class="add">→ Liveness probe failures: 0 · restarts: 0 · reports still serving</span>
<span class="add">→ alert PodCrashLooping  RESOLVED</span>`,
  shipNote:'The app never changed. Only our expectation of how fast it must answer did.',
  wrongLabel:'✎ Raise the memory limit (it IS exit 137…)',
  wrongTitle:'⚠ 137 sent you to the wrong place',
  wrongOut:`$ # values.yaml: memory 512Mi → 1Gi · commit · push
<span class="add">→ Argo CD  analytics-service  Synced ✓</span>
<span class="add">→ analytics-service-3d8b1e5f2-q9wzr   1/1   Running   0   30s</span>
<span class="del">→ 4m later…  Liveness probe failed: context deadline exceeded</span>
<span class="del">→ Killing container · Restart Count: 1</span>
<span class="del">→ alert PodCrashLooping  FIRING again</span>
<span class="del">→ memory usage: still 118Mi. You bought 512Mi nobody was asking for.</span>`,
  wrongNote:'<b class="mono">exit 137</b> has two parents: the OOM killer and the kubelet. You treated the one it did not have. Always read <b class="mono">Reason:</b> before you act — <b class="mono">OOMKilled</b> or <b class="mono">Error</b>. That one field is the whole diagnosis.',
  rcaModel:`What happened: From 09:47–10:08 IST, one of two analytics-service pods sat in CrashLoopBackOff (5 restarts). Dashboards for 3 enterprise accounts timed out; scheduled reports were incomplete.

Root cause: The liveness probe was configured with timeoutSeconds: 1. Large report generation blocks the request path for ~1.2s, so /healthz answered late. Three consecutive timeouts caused the kubelet to SIGKILL the container (exit 137, Reason: Error) — repeatedly. The container was healthy throughout; the probe was measuring "fast" and calling it "alive".

Detection: PodCrashLooping alert paged on-call. Same alert and same exit code as INC-2891 (OOMKill), which initially misdirected triage — the differentiator is the Reason field, not the exit code.

Resolution: Relaxed the liveness probe (timeout 1s→5s, period 5s→10s, failureThreshold 3→6, added initialDelay 20s) via Git; Argo CD synced. MTTR 21m.

Prevention:
1. BILL-611 — audit every liveness probe in the chart for timeoutSeconds < 3. This pattern almost certainly exists elsewhere.
2. BILL-612 — /healthz must be a cheap liveness endpoint that does not touch the DB or share the busy request path.
3. BILL-613 — question whether analytics-service needs a liveness probe at all. Readiness already parks traffic on a slow pod; liveness only adds a way to kill it.
4. BILL-614 — profile the 1.2s report blocking time (suspect synchronous serialisation of ~200k rows).`,
  feedback:'"This is the incident that separates people who <i>memorise</i> from people who <i>read</i>. Exit <span class="mono">137</span> is famous as \'OOM\' — and you had a previous OOM incident on this very cluster to anchor the bias. You went to <b>describe</b>, saw <span class="mono">Reason: Error</span> instead of <span class="mono">OOMKilled</span>, checked <b>top</b>, found 23% memory use, and refused the easy answer. That is real diagnostic discipline.<br><br>Next level: the senior question here is not <i>what timeout?</i> — it is <b>why does this service have a liveness probe at all?</b> Readiness already removes a slow pod from traffic. Liveness only adds the ability to kill it. A restarted pod does not fix a slow report — it just drops the connections and starts cold. Many senior teams run readiness-only for exactly this reason: <b>a badly tuned liveness probe causes far more outages than it prevents.</b>"',
  tickets:[
    ['P1','BILL-611','Audit all liveness probes for timeoutSeconds < 3 — this pattern will exist elsewhere'],
    ['P2','BILL-612','/healthz must be cheap — must not touch DB or share the busy request path'],
    ['P2','BILL-613','Evaluate removing liveness from analytics-service — readiness may be sufficient'],
    ['P3','BILL-614','Profile the 1.2s blocking report serialisation (~200k rows)'],
  ]
},
{
  id:'INC-2967', sev:'warning', alert:'HighErrorRate', svc:'api-gateway',
  title:'A 5xx spike on every single deploy',
  paged:'14:22 IST', mttr:'28m', skill:'Graceful shutdown · SIGTERM · preStop',
  teaches:'maxUnavailable: 0 is not zero-downtime — endpoint removal and SIGTERM race each other',
  impact:{
    business:'~700 failed requests per deploy. 6 deploys/day. Nobody logged it as an incident — it "always did that".',
    customer:'A brief burst of 502s for ~5 seconds during each release. Retries succeed, so few complain.',
    rule:'HighErrorRate · 5xx ratio > 5% for 5m · severity: warning'
  },
  cmds:{
    'kubectl get pods -n billfree':{id:'get',out:[
      ['NAME                                READY   STATUS        RESTARTS   AGE','out'],
      ['api-gateway-7d4b9c6f8-xk2pq         1/1     Terminating   0          9d','hi'],
      ['api-gateway-8e5c1a9d3-m2vbn         1/1     Running       0          22s','out'],
      ['api-gateway-8e5c1a9d3-j6plc         1/1     Running       0          14s','out'],
      ['postgres-0                          1/1     Running       0          15d','out'],
      ['','out'],
      ['💡 A rollout is in progress. The 5xx spike lines up exactly with this window.','hi'],
    ]},
    'kubectl describe deployment api-gateway -n billfree':{id:'describe',out:[
      ['Name:               api-gateway','out'],
      ['Replicas:           2 desired | 2 updated | 3 total','out'],
      ['StrategyType:       RollingUpdate','out'],
      ['RollingUpdateStrategy:  0 max unavailable, 1 max surge','hi'],
      ['Pod Template:','out'],
      ['  Containers:','out'],
      ['   api-gateway:','out'],
      ['    Readiness:  http-get http://:8080/readyz delay=5s timeout=1s period=10s','out'],
      ['    Lifecycle:  <none>','hi'],
      ['  TerminationGracePeriodSeconds:  30','out'],
      ['','out'],
      ['💡 maxUnavailable is already 0 — so this is NOT a "too few pods" problem.','hi'],
      ['💡 Lifecycle: <none> — there is no preStop hook.','hi'],
    ]},
    'kubectl logs api-gateway-7d4b9c6f8-xk2pq -n billfree':{id:'logs',out:[
      ['{"level":"info","msg":"request","path":"/api/tickets","status":200,"ms":42}','out'],
      ['{"level":"info","msg":"request","path":"/api/auth/verify","status":200,"ms":11}','out'],
      ['{"level":"info","msg":"request","path":"/api/reports","status":200,"ms":88}','out'],
      ['','out'],
      ['── SIGTERM received ──','hi'],
      ['── container exits immediately · 3 in-flight requests dropped ──','warn'],
      ['','out'],
      ['💡 The app got SIGTERM and quit on the spot. It did not drain anything.','hi'],
      ['💡 And requests were STILL arriving when it died.','hi'],
    ]},
    'kubectl get endpoints api-gateway -n billfree':{id:'endpoints',out:[
      ['NAME          ENDPOINTS                                          AGE','out'],
      ['api-gateway   10.244.1.14:8080,10.244.2.9:8080,10.244.3.22:8080  9d','hi'],
      ['','out'],
      ['💡 THREE endpoints — the Terminating pod (10.244.1.14) is still listed.','hi'],
      ['💡 It is dying, and the Service is still sending it traffic.','hi'],
    ]},
    'kubectl get events -n billfree --sort-by=.lastTimestamp':{id:'events',out:[
      ['LAST SEEN   TYPE     REASON             OBJECT                        MESSAGE','out'],
      ['24s         Normal   ScalingReplicaSet  deployment/api-gateway        Scaled up replica set api-gateway-8e5c1a9d3 to 1','out'],
      ['20s         Normal   Killing            pod/api-gateway-7d4b9c6f8-xk2pq  Stopping container api-gateway','hi'],
      ['','out'],
      ['💡 No errors, no crashes. This is a normal, healthy rollout — that drops requests.','hi'],
    ]},
  },
  aliases:{
    'kubectl get pods':'kubectl get pods -n billfree',
    'kubectl describe deployment api-gateway':'kubectl describe deployment api-gateway -n billfree',
    'kubectl get endpoints api-gateway':'kubectl get endpoints api-gateway -n billfree',
    'kubectl logs api-gateway-7d4b9c6f8-xk2pq':'kubectl logs api-gateway-7d4b9c6f8-xk2pq -n billfree',
    'kubectl get events -n billfree':'kubectl get events -n billfree --sort-by=.lastTimestamp',
  },
  evidence:'5xx <b>only</b> during rollouts · <b class="mono">maxUnavailable: 0</b> already · <b class="mono">Lifecycle: &lt;none&gt;</b> (no preStop) · app exits immediately on SIGTERM · the <b class="mono">Terminating</b> pod is <b>still in the endpoints list</b>',
  choices:[
    {k:'A',t:'maxUnavailable is too high — not enough pods during rollout',d:'Lower it so a pod is always available.',ok:false,
     why:'It is already <b class="mono">0</b> with <b class="mono">maxSurge: 1</b> — a new pod is Ready <i>before</i> the old one is touched. Replica count is not the problem; the problem is what happens to the old pod in its last two seconds.'},
    {k:'B',t:'HPA is scaling down too aggressively',d:'Pods are being removed under load.',ok:false,
     why:'The 5xx correlate exactly with <b>deploys</b>, not with load. Events show <b class="mono">ScalingReplicaSet</b> from a rollout, not an HPA scale-down.'},
    {k:'C',t:'No graceful shutdown — the pod is killed mid-request while the Service still routes to it',d:'SIGTERM and endpoint removal happen concurrently, and the app does not drain.',ok:true},
    {k:'D',t:'Readiness probe is missing',d:'Traffic hits pods before they are ready.',ok:false,
     why:'Readiness exists (<b class="mono">/readyz</b>) and governs pods coming <b>up</b>. Our errors happen to the pod going <b>down</b> — readiness has no say in that path.'},
  ],
  correctTitle:'✓ Correct — nothing drained; the pod died holding live traffic',
  correctBody:'When a pod is deleted, <b>two things start at the same moment — they are not ordered</b>:<br><br><b>1.</b> kubelet sends <b class="mono">SIGTERM</b> to your container.<br><b>2.</b> The endpoints controller removes the pod IP → every node\'s kube-proxy must then update its iptables rules.<br><br>Step 2 <b>takes time to propagate across the cluster</b>. Step 1 is instant. So for a second or two the pod is <b>shutting down while traffic is still arriving</b> — and this app exits immediately on SIGTERM, dropping every in-flight request. <b class="mono">maxUnavailable: 0</b> cannot help: it counts pods, not the requests inside them. This is the most common cause of "our deploys always blip".',
  fixNote:'Two fixes, and you need <b>both</b>. <b class="mono">preStop</b> buys time for the endpoint removal to propagate; the SIGTERM handler drains what is in flight.',
  fixDiff:`deploy/charts/microservice/templates/deployment.yaml

     containers:
       - name: {{ .Chart.Name }}
<span class="add">+        lifecycle:</span>
<span class="add">+          preStop:</span>
<span class="add">+            exec:</span>
<span class="add">+              command: ["sh","-c","sleep 10"]   # keep serving while</span>
<span class="add">+                                                 # endpoints propagate</span>
<span class="add">+    terminationGracePeriodSeconds: 45   # must exceed preStop + drain time</span>

<span class="k"># and in the app (the half YAML cannot do):</span>
<span class="add">+  on SIGTERM:  stop accepting new conns → finish in-flight → exit 0</span>`,
  shipLabel:'⬆ Commit &amp; push → Argo CD sync',
  shipOut:`$ git commit -m "fix(chart): add preStop drain + SIGTERM handling — 5xx on every rollout"
$ git push
<span class="add">→ Argo CD  platform  OutOfSync → Syncing → Synced ✓</span>
<span class="add">→ rolling update across all 7 services</span>
<span class="add">→ old pod: SIGTERM → preStop sleep 10s → endpoints propagated → drained → exit 0</span>
<span class="add">→ 5xx during rollout: 0</span>
<span class="add">→ alert HighErrorRate  RESOLVED</span>`,
  shipNote:'It went into the shared chart, so all 7 services got it at once. That is the payoff of one reusable chart.',
  wrongLabel:'✎ Add more replicas — that should absorb it',
  wrongTitle:'⚠ Same blip, more pods',
  wrongOut:`$ # replicaCount: 2 → 6 · commit · push
<span class="add">→ Argo CD  Synced ✓  · 6 pods Running</span>
<span class="del">→ next deploy:  5xx spike again — identical shape</span>
<span class="del">→ (now 6 pods each drop their in-flight requests instead of 2)</span>`,
  wrongNote:'Every pod that terminates without draining drops its in-flight requests. More replicas = more terminations = the same bug, six times. <b>You cannot out-scale a correctness problem.</b>',
  rcaModel:`What happened: A ~5s burst of 502s accompanied every deploy — roughly 700 failed requests per release, 6 releases/day. It had been happening for months and was treated as normal.

Root cause: Pods terminated without draining. On delete, SIGTERM and Service endpoint removal happen concurrently; endpoint removal must propagate to kube-proxy on every node, which takes ~1-2s. During that window the terminating pod still receives traffic — and the app exited immediately on SIGTERM, dropping in-flight requests. No preStop hook existed. maxUnavailable: 0 gave false confidence: it guarantees pod count, not request safety.

Detection: Not detected as an incident for months — the HighErrorRate alert is a 5m ratio, and a 5s spike across 6 deploys/day never breached it. Found only when investigating customer reports of intermittent 502s.

Resolution: Added a preStop sleep 10 and raised terminationGracePeriodSeconds to 45 in the shared microservice chart (all 7 services), plus SIGTERM draining in the app. Rollout 5xx dropped to zero. MTTR 28m.

Prevention:
1. BILL-702 — SIGTERM handling is now a service checklist item; a service without it does not get merged.
2. BILL-703 — add a deploy-window SLO burn check; a short sharp spike must not hide inside a 5-minute ratio.
3. BILL-704 — chart defaults now ship preStop + grace period, so new services inherit correctness.`,
  feedback:'"The most valuable thing you did was <b>disbelieve <span class="mono">maxUnavailable: 0</span></b>. That setting is the number one source of false confidence about zero-downtime deploys — it guarantees <i>pods</i>, not <i>requests</i>. You went to the endpoints list and saw the terminating pod still there. That is the whole incident in one command.<br><br>Also worth noting: this ran for <b>months</b> without paging anyone. A 5-second spike cannot breach a 5-minute ratio alert. <b>Your alerts define what you are able to see</b> — and this one was shaped so that a real, recurring, customer-facing defect was mathematically invisible.<br><br>Next level: you fixed it in the shared chart rather than in one service. Seven services, one commit. That is platform thinking."',
  tickets:[
    ['P1','BILL-702','SIGTERM draining is now a service checklist item — enforce in review'],
    ['P2','BILL-703','Deploy-window error budget check — 5s spikes hide inside 5m ratios'],
    ['P2','BILL-704','Chart defaults ship preStop + grace period for all new services'],
  ]
},
{
  id:'INC-2980', sev:'critical', alert:'TargetDown', svc:'postgres',
  title:'postgres-0 Pending — and it will never schedule',
  paged:'04:03 IST', mttr:'37m', skill:'StatefulSet · PVC topology · AZ binding',
  teaches:'An EBS volume lives in ONE availability zone — the pod can only come back where its disk is',
  impact:{
    business:'Total platform outage. Every service depends on postgres. Nothing works.',
    customer:'The product is down. Not degraded — down.',
    rule:'TargetDown · up == 0 for 2m · severity: critical'
  },
  cmds:{
    'kubectl get pods -n billfree -o wide':{id:'get',out:[
      ['NAME                                READY   STATUS    RESTARTS   AGE   NODE','out'],
      ['api-gateway-8e5c1a9d3-m2vbn         1/1     Running   0          2d    ip-10-0-2-51','out'],
      ['auth-service-6c9d8f2a1-k4mzp        0/1     Running   0          2d    ip-10-0-2-51','warn'],
      ['postgres-0                          0/1     Pending   0          6m    <none>','hi'],
      ['','out'],
      ['💡 postgres-0 has NO node. It has not been placed at all.','hi'],
      ['💡 auth is Running but 0/1 — its readiness needs the DB.','hi'],
    ]},
    'kubectl get nodes -L topology.kubernetes.io/zone':{id:'nodes',out:[
      ['NAME            STATUS   ROLES    AGE   VERSION   ZONE','out'],
      ['ip-10-0-2-51    Ready    <none>   21d   v1.29.4   us-east-1b','out'],
      ['ip-10-0-3-88    Ready    <none>   21d   v1.29.4   us-east-1c','out'],
      ['ip-10-0-3-91    Ready    <none>   9d    v1.29.4   us-east-1c','out'],
      ['','out'],
      ['💡 Three healthy nodes — in 1b and 1c. NOTHING in us-east-1a.','hi'],
      ['💡 The 1a node was terminated by AWS at 03:57.','hi'],
    ]},
    'kubectl describe pod postgres-0 -n billfree':{id:'describe',out:[
      ['Name:         postgres-0','out'],
      ['Status:       Pending','warn'],
      ['Node:         <none>','hi'],
      ['Volumes:','out'],
      ['  data:','out'],
      ['    Type:       PersistentVolumeClaim','out'],
      ['    ClaimName:  data-postgres-0','out'],
      ['Events:','out'],
      ['  Warning  FailedScheduling  6m (x9)  default-scheduler  0/3 nodes are available: 3 node(s) had volume node affinity conflict.','hi'],
      ['','out'],
      ['💡 NOT "Insufficient cpu/memory". The word is: volume node affinity conflict.','hi'],
      ['💡 There is plenty of room. The scheduler is refusing on purpose.','hi'],
    ]},
    'kubectl get pv -o wide':{id:'pv',out:[
      ['NAME       CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS   CLAIM                     STORAGECLASS','out'],
      ['pvc-8a3f   5Gi        RWO            Delete           Bound    billfree/data-postgres-0  gp3','hi'],
      ['','out'],
      ['Node Affinity:','out'],
      ['  Required Terms:','out'],
      ['    topology.kubernetes.io/zone in [us-east-1a]','hi'],
      ['','out'],
      ['💡 The disk itself is pinned to us-east-1a. This is EBS — it cannot leave its zone.','hi'],
      ['⚠  RECLAIM POLICY: Delete — remember this before you touch anything.','warn'],
    ]},
    'kubectl get events -n billfree --sort-by=.lastTimestamp':{id:'events',out:[
      ['LAST SEEN   TYPE      REASON             OBJECT           MESSAGE','out'],
      ['6m          Warning   FailedScheduling   pod/postgres-0   volume node affinity conflict','hi'],
      ['7m          Normal    NodeNotReady       node/ip-10-0-1-40  Node ip-10-0-1-40 status is now: NodeNotReady','warn'],
      ['','out'],
      ['💡 ip-10-0-1-40 was the us-east-1a node. AWS retired it.','hi'],
    ]},
  },
  aliases:{
    'kubectl get pods':'kubectl get pods -n billfree -o wide',
    'kubectl get pods -n billfree':'kubectl get pods -n billfree -o wide',
    'kubectl get nodes':'kubectl get nodes -L topology.kubernetes.io/zone',
    'kubectl describe pod postgres-0':'kubectl describe pod postgres-0 -n billfree',
    'kubectl get pv':'kubectl get pv -o wide',
    'kubectl get events -n billfree':'kubectl get events -n billfree --sort-by=.lastTimestamp',
  },
  evidence:'<b class="mono">volume node affinity conflict</b> (not Insufficient cpu/memory) · PV pinned to <b class="mono">topology.kubernetes.io/zone in [us-east-1a]</b> · the only 1a node was terminated · surviving nodes are in 1b/1c · <b class="mono">RECLAIM POLICY: Delete</b>',
  choices:[
    {k:'A',t:'Insufficient CPU/memory on the remaining nodes',d:'The cluster is out of capacity.',ok:false,
     why:'The scheduler is explicit about which check failed: <b class="mono">volume node affinity conflict</b>. If it were capacity, it would say <b class="mono">Insufficient cpu</b> or <b class="mono">Insufficient memory</b>. <b>Read the exact rejection reason</b> — the scheduler always names it.'},
    {k:'B',t:'The PVC\'s EBS volume lives in us-east-1a and no node remains in that zone',d:'The disk cannot move; the pod must go to the disk.',ok:true},
    {k:'C',t:'The remaining nodes carry a taint postgres does not tolerate',d:'A NoSchedule taint is repelling it.',ok:false,
     why:'A taint produces a different message: <b class="mono">node(s) had untolerated taint {...}</b>. Ours says volume node affinity. Different filter, different message.'},
    {k:'D',t:'The StatefulSet is missing its headless Service',d:'postgres cannot get a stable identity.',ok:false,
     why:'A missing headless Service breaks DNS identity, not scheduling — the pod would still be placed on a node. Ours is never placed at all, and the reason names the volume.'},
  ],
  correctTitle:'✓ Correct — the pod cannot go to the disk, so it goes nowhere',
  correctBody:'An <b>EBS volume is zonal</b>. It physically exists in <b class="mono">us-east-1a</b> and cannot be attached to a node in another AZ — that is a property of AWS block storage, not a Kubernetes bug. So the PV carries <b class="mono">nodeAffinity: zone in [us-east-1a]</b>, and the scheduler honours it: no 1a node → no placement → <b class="mono">Pending</b>, forever. Add a hundred nodes in 1b and nothing changes.<br><br>And here is the sentence that matters: <b>with <span class="mono">replicas: 1</span>, a single AZ going away is a total outage of your entire platform.</b> The AZ did exactly what AWS says an AZ may do at any time.',
  fixNote:'⚠ <b>This one is not fixed inside Kubernetes.</b> The pod cannot move to the disk — so a node must come back to where the disk lives. That is an <b>infrastructure</b> action, in the layer below.',
  fixDiff:`infra/terraform/compute.tf   ← NOT a kubectl fix

 module "node_group" {
   subnet_ids = [
     aws_subnet.private_1b.id,
     aws_subnet.private_1c.id,
<span class="add">+    aws_subnet.private_1a.id,   # bring capacity back to 1a</span>
   ]
<span class="del">-  desired_size = 3</span>
<span class="add">+  desired_size = 4            # so the ASG places one in 1a</span>
 }

<span class="k"># fastest path at 04:00 — scale the ASG in us-east-1a:</span>
<span class="k">$ aws autoscaling set-desired-capacity \\</span>
<span class="k">    --auto-scaling-group-name billfree-ng-1a --desired-capacity 1</span>
<span class="k"># node joins 1a → scheduler places postgres-0 → PVC attaches → Running</span>`,
  shipLabel:'⬆ Restore capacity in us-east-1a',
  shipOut:`$ aws autoscaling set-desired-capacity --auto-scaling-group-name billfree-ng-1a --desired-capacity 1
<span class="add">→ ip-10-0-1-77   Ready   us-east-1a   38s</span>
<span class="add">→ postgres-0     Pending → ContainerCreating   (attaching pvc-8a3f)</span>
<span class="add">→ postgres-0     1/1     Running   0   52s   ip-10-0-1-77</span>
<span class="add">→ data intact — same volume, same 5Gi, nothing lost</span>
<span class="add">→ auth-service   1/1     Running   (readiness recovered)</span>
<span class="add">→ alert TargetDown  RESOLVED</span>`,
  shipNote:'The pod went to the disk. The disk never moved — and it never can.',
  wrongLabel:'✎ Delete the PVC and let it recreate',
  wrongTitle:'☠ You just deleted the database',
  wrongOut:`$ kubectl delete pvc data-postgres-0 -n billfree
persistentvolumeclaim "data-postgres-0" deleted
<span class="del">→ PV pvc-8a3f  Bound → Released</span>
<span class="del">→ reclaimPolicy: Delete  → EBS vol-0a3f8b2c1 DELETING</span>
<span class="del">→ EBS volume deleted.</span>
<span class="del">→ postgres-0 schedules instantly on a 1b node ✓ … with an empty 5Gi disk.</span>
<span class="del">→ Every customer record, invoice, and ticket: gone.</span>
<span class="del">→ Last snapshot: none configured.</span>`,
  wrongNote:'This is the single most destructive key on the keyboard, and it <b>looks like it worked</b> — the Pending cleared instantly. The StorageClass had <b class="mono">reclaimPolicy: Delete</b>, so releasing the claim destroyed the underlying EBS volume. <b>Pending is frustrating. Pending is not data loss. Deleting a bound PVC is.</b> When a stuck pod tempts you toward the PVC, stop and go one layer down instead.',
  rcaModel:`What happened: At 03:57 AWS retired the EC2 instance that was our only node in us-east-1a. postgres-0 was evicted and entered Pending, where it stayed. Because every service depends on postgres, the platform was fully down for 37 minutes.

Root cause: postgres-0's PVC is backed by a gp3 EBS volume in us-east-1a. EBS is zonal, so the PV carries a node affinity requiring us-east-1a. With no node left in that AZ, the scheduler could not place the pod — correctly. The surviving nodes in 1b/1c had ample capacity and were irrelevant.

The deeper cause is architectural: postgres runs replicas: 1 with a single zonal volume. A single AZ event — which AWS explicitly permits at any time — is therefore a total platform outage. This risk was known and logged as BILL-535 during INC-2938 and had not been actioned.

Detection: TargetDown paged at 04:03, 6m after the node was retired.

Resolution: Scaled the us-east-1a node group to 1. The node joined, postgres-0 scheduled, the PVC re-attached, and the data was intact. MTTR 37m.

Prevention:
1. BILL-801 — postgres replicas:1 with a zonal disk is a single-AZ SPOF. Decide now: CloudNativePG with multi-AZ replicas, or managed RDS Multi-AZ. This is the second incident caused by this design.
2. BILL-802 — no automated postgres backups existed. Snapshot schedule + a tested restore, this week.
3. BILL-803 — keep standing capacity in all three AZs so no single AZ has zero nodes.
4. BILL-804 — alert when any AZ has zero Ready nodes, before it becomes a scheduling failure.`,
  feedback:'"You did the two things that mattered. First you read the <b>exact</b> scheduler message — <span class="mono">volume node affinity conflict</span>, not <span class="mono">Insufficient cpu</span> — and let it take you to the PV instead of guessing about capacity. Second, and this is the one I care about: <b>at 04:00, with the platform down, you did not delete the PVC.</b> It would have cleared the Pending in seconds and destroyed every byte the company owns. Under that pressure, the discipline to go <i>down</i> a layer rather than reach for the fast button is exactly the difference between a Senior and an outage post-mortem with a resignation attached.<br><br>Next level: this is the <b>second</b> incident from <span class="mono">replicas: 1</span> — INC-2938 raised BILL-535 and it was never picked up. A risk you have written down and not fixed is not a known risk; it is a scheduled outage. And notice where the fix lived: <b>not in Kubernetes at all</b>. The pod could not move to the disk, so the node had to. Knowing which layer owns the problem is most of the job."',
  tickets:[
    ['P1','BILL-801','postgres replicas:1 + zonal PVC = single-AZ SPOF — CloudNativePG multi-AZ or managed RDS. SECOND incident.'],
    ['P1','BILL-802','No postgres backups exist. Snapshot schedule + tested restore — this week.'],
    ['P2','BILL-803','Maintain standing capacity in all 3 AZs'],
    ['P3','BILL-804','Alert when any AZ has zero Ready nodes'],
  ]
},
{
  id:'INC-2996', sev:'warning', alert:'Deployment not progressing', svc:'report-service',
  title:'New nodes added, and nothing will schedule on them',
  paged:'10:15 IST', mttr:'16m', skill:'Scheduling · taints · tolerations · affinity',
  teaches:'Resources are only half of scheduling — taints repel, tolerations permit, affinity attracts',
  impact:{
    business:'Nightly report generation cannot scale up. Enterprise report SLA at risk for tomorrow 06:00.',
    customer:'Scheduled reports will be late. No live impact yet — this is the hour before the outage.',
    rule:'KubeDeploymentReplicasMismatch · desired != available for 15m · severity: warning'
  },
  cmds:{
    'kubectl get pods -n billfree':{id:'get',out:[
      ['NAME                                READY   STATUS    RESTARTS   AGE','out'],
      ['report-service-5d9c8b3f2-w4tnq      1/1     Running   0          4d','out'],
      ['report-service-5d9c8b3f2-h8xmv      1/1     Running   0          4d','out'],
      ['report-service-5d9c8b3f2-k3zrp      0/1     Pending   0          12m','hi'],
      ['report-service-5d9c8b3f2-b7ynf      0/1     Pending   0          12m','hi'],
      ['','out'],
      ['💡 HPA scaled to 4. Two are stuck Pending — even though we just added nodes.','hi'],
    ]},
    'kubectl get nodes -L workload':{id:'nodes',out:[
      ['NAME            STATUS   ROLES    AGE   VERSION   WORKLOAD','out'],
      ['ip-10-0-2-51    Ready    <none>   21d   v1.29.4','out'],
      ['ip-10-0-3-88    Ready    <none>   21d   v1.29.4','out'],
      ['ip-10-0-3-91    Ready    <none>   9d    v1.29.4','out'],
      ['ip-10-0-4-12    Ready    <none>   40m   v1.29.4   batch','hi'],
      ['ip-10-0-4-19    Ready    <none>   40m   v1.29.4   batch','hi'],
      ['','out'],
      ['💡 Two brand-new "batch" nodes, added this morning, sitting empty.','hi'],
    ]},
    'kubectl describe pod report-service-5d9c8b3f2-k3zrp -n billfree':{id:'describe',out:[
      ['Name:         report-service-5d9c8b3f2-k3zrp','out'],
      ['Status:       Pending','warn'],
      ['Node:         <none>','out'],
      ['    Requests:','out'],['      cpu:     50m','out'],['      memory:  96Mi','out'],
      ['Tolerations:  node.kubernetes.io/not-ready:NoExecute op=Exists for 300s','hi'],
      ['Events:','out'],
      ['  Warning  FailedScheduling  12m (x8)  default-scheduler  0/5 nodes are available: 2 node(s) had untolerated taint {workload: batch}, 3 Insufficient memory.','hi'],
      ['','out'],
      ['💡 TWO different reasons at once. Read both halves.','hi'],
      ['💡 3 old nodes: full. 2 new nodes: room, but they repel this pod.','hi'],
    ]},
    'kubectl describe node ip-10-0-4-12':{id:'node',out:[
      ['Name:               ip-10-0-4-12','out'],
      ['Labels:             workload=batch','hi'],
      ['                    topology.kubernetes.io/zone=us-east-1c','out'],
      ['Taints:             workload=batch:NoSchedule','hi'],
      ['Allocatable:','out'],
      ['  cpu:                3920m','out'],
      ['  memory:             7620Mi','out'],
      ['Non-terminated Pods: (2 in total)   ← only DaemonSets','out'],
      ['Allocated resources:','out'],
      ['  cpu     180m (4%)     memory  220Mi (2%)','hi'],
      ['','out'],
      ['💡 98% of this node is free. And nothing will go there.','hi'],
      ['💡 Taint = the node saying "stay away unless you carry a matching pass".','hi'],
    ]},
    'kubectl get events -n billfree --sort-by=.lastTimestamp':{id:'events',out:[
      ['LAST SEEN   TYPE      REASON             OBJECT                          MESSAGE','out'],
      ['12m         Warning   FailedScheduling   pod/report-service-5d9c8b3f2-k3zrp   untolerated taint {workload: batch}','hi'],
      ['12m         Normal    SuccessfulCreate   replicaset/report-service-5d9c8b3f2  Created pod','out'],
      ['','out'],
      ['💡 Kubernetes is not broken. It is obeying a rule we wrote and forgot.','hi'],
    ]},
  },
  aliases:{
    'kubectl get pods':'kubectl get pods -n billfree',
    'kubectl get nodes':'kubectl get nodes -L workload',
    'kubectl describe pod report-service-5d9c8b3f2-k3zrp':'kubectl describe pod report-service-5d9c8b3f2-k3zrp -n billfree',
    'kubectl describe node':'kubectl describe node ip-10-0-4-12',
    'kubectl get events -n billfree':'kubectl get events -n billfree --sort-by=.lastTimestamp',
  },
  evidence:'<b class="mono">0/5 nodes available: 2 node(s) had untolerated taint {workload: batch}, 3 Insufficient memory</b> · the 2 batch nodes are <b>98% free</b> · they carry <b class="mono">workload=batch:NoSchedule</b> · the pod has <b>no matching toleration</b>',
  choices:[
    {k:'A',t:'The cluster is out of capacity — add more nodes',d:'Everything is full; scale the cluster.',ok:false,
     why:'We <b>just added</b> two nodes and they are 98% empty. Adding a third changes nothing — new batch nodes would carry the same taint and be rejected identically. The capacity exists; the pod is not allowed to use it.'},
    {k:'B',t:'The batch nodes carry a NoSchedule taint and the pod has no matching toleration',d:'The nodes are deliberately repelling pods that do not carry the pass.',ok:true},
    {k:'C',t:'The nodeSelector on report-service points at the wrong label',d:'It is targeting nodes that do not exist.',ok:false,
     why:'A nodeSelector mismatch reports <b class="mono">node(s) didn\'t match Pod\'s node affinity/selector</b>. Our message is <b class="mono">untolerated taint</b> — a different filter, with a different message. The scheduler tells you exactly which gate closed.'},
    {k:'D',t:'The PVC cannot bind',d:'A volume problem is blocking scheduling.',ok:false,
     why:'report-service is stateless and mounts no PVC. A volume problem reads <b class="mono">volume node affinity conflict</b> (see INC-2980) — not a taint message.'},
  ],
  correctTitle:'✓ Correct — the nodes are repelling the pod, on purpose',
  correctBody:'A <b>taint</b> is a node saying: <i>"stay away unless you carry a matching pass."</i> A <b>toleration</b> is that pass on the pod. The batch node group was created with <b class="mono">workload=batch:NoSchedule</b> to reserve it for nightly jobs — a good decision that nobody told report-service about.<br><br>And now the nuance that catches most people: <b>a toleration only PERMITS — it does not ATTRACT.</b> Adding a toleration lets the pod land on batch nodes; it does not make it prefer them. It could just as easily go to a general node. If you want it to actually <i>go</i> there, you need <b class="mono">nodeAffinity</b> / <b class="mono">nodeSelector</b> too.<br><br><b>Taint repels · Toleration permits · Affinity attracts.</b> Three different jobs. You usually need two of them together.',
  fixNote:'Give report-service both halves: the <b>pass</b> to be allowed on batch nodes, and the <b>pull</b> to actually prefer them.',
  fixDiff:`deploy/apps/report-service/values.yaml

<span class="add">+tolerations:                    # the PASS — allowed to land there</span>
<span class="add">+  - key: workload</span>
<span class="add">+    operator: Equal</span>
<span class="add">+    value: batch</span>
<span class="add">+    effect: NoSchedule</span>
<span class="add">+</span>
<span class="add">+affinity:                       # the PULL — actually prefer there</span>
<span class="add">+  nodeAffinity:</span>
<span class="add">+    preferredDuringSchedulingIgnoredDuringExecution:</span>
<span class="add">+      - weight: 100</span>
<span class="add">+        preference:</span>
<span class="add">+          matchExpressions:</span>
<span class="add">+            - key: workload</span>
<span class="add">+              operator: In</span>
<span class="add">+              values: ["batch"]</span>

<span class="k"># toleration alone = allowed but may still land on a general node</span>
<span class="k"># preferred (not required) = if batch is full, general still works</span>`,
  shipLabel:'⬆ Commit &amp; push → Argo CD sync',
  shipOut:`$ git commit -m "feat(report): tolerate + prefer batch nodes — 2 replicas stuck Pending"
$ git push
<span class="add">→ Argo CD  report-service  OutOfSync → Syncing → Synced ✓</span>
<span class="add">→ report-service-7f4a2d8c1-q6mvx   1/1   Running   0   19s   ip-10-0-4-12</span>
<span class="add">→ report-service-7f4a2d8c1-t9jbc   1/1   Running   0   17s   ip-10-0-4-19</span>
<span class="add">→ 4/4 available · HPA satisfied · batch nodes finally earning their bill</span>
<span class="add">→ alert KubeDeploymentReplicasMismatch  RESOLVED</span>`,
  shipNote:'preferred, not required — so if the batch nodes are full at 02:00, reports still run on general nodes instead of sitting Pending.',
  wrongLabel:'✎ Just remove the taint from the batch nodes',
  wrongTitle:'⚠ It works — and you dismantled the reason the nodes exist',
  wrongOut:`$ kubectl taint nodes ip-10-0-4-12 ip-10-0-4-19 workload=batch:NoSchedule-
node/ip-10-0-4-12 untainted
<span class="add">→ report-service   4/4   Running ✓   (fixed!)</span>
<span class="del">→ …by 14:00: api-gateway, web, auth pods scheduled onto the batch nodes too</span>
<span class="del">→ 02:00 nightly batch job: Pending — no room on its own dedicated nodes</span>
<span class="del">→ the isolation those nodes were bought for: gone</span>
<span class="del">→ and the taint is not in Git — the next node the ASG creates has it back</span>`,
  wrongNote:'Two failures in one. <b>You solved your problem by deleting someone else\'s guarantee</b> — the taint was the entire point of a dedicated node group. And you did it with <span class="mono">kubectl</span> on a GitOps cluster: the change is untracked, unreviewed, and the ASG will hand it back on the next node it launches. <b>When a rule blocks you, find out why it exists before you delete it.</b>',
  rcaModel:`What happened: HPA scaled report-service from 2 to 4 replicas ahead of the nightly report window. Two replicas sat Pending for 12 minutes despite two freshly-added, almost-empty nodes.

Root cause: The new node group was provisioned with the taint workload=batch:NoSchedule to reserve it for nightly batch jobs. report-service carries no matching toleration, so the scheduler correctly refused those nodes; the three general nodes were genuinely out of memory. Two independent reasons appeared in one message: "2 node(s) had untolerated taint {workload: batch}, 3 Insufficient memory".

Nothing was broken. The cluster obeyed a rule we wrote and did not propagate to the workloads that needed it.

Detection: KubeDeploymentReplicasMismatch (desired != available for 15m). Caught in the quiet hour before the 06:00 report SLA, not during it.

Resolution: Added a toleration (permission) plus a preferred nodeAffinity (attraction) to report-service values.yaml; Argo CD synced; both replicas scheduled onto batch nodes. MTTR 16m.

Prevention:
1. BILL-905 — the taint was added to infra without a corresponding change to any workload. Taint changes must ship with the tolerations they require, in the same PR.
2. BILL-906 — alert on Pending pods > 5m. Pending is silent; it only becomes visible when it becomes an outage.
3. BILL-907 — document the node groups and their taints. The batch group's purpose lived in one engineer's memory.`,
  feedback:'"The detail I want to call out: the scheduler gave you <b>two reasons in one line</b> — <span class="mono">2 node(s) had untolerated taint</span> AND <span class="mono">3 Insufficient memory</span> — and you read both halves. Most people read the first clause, conclude \'out of memory\', and go buy nodes that will be rejected exactly the same way. The pod was not short of capacity; it was short of <b>permission</b>.<br><br>You also got the nuance right in the fix: a <b>toleration only permits, it does not attract</b>. Toleration alone would have let the pod land anywhere, including back on the full general nodes. Adding <span class="mono">preferred</span> affinity pulls it to batch while still allowing a fallback — required affinity would have traded Pending-now for Pending-at-02:00.<br><br>And you did not rip the taint out. That taint was the entire reason the node group exists. Deleting the rule that blocks you is the fastest fix and the most expensive one — it works today and quietly breaks whatever the rule was protecting."',
  tickets:[
    ['P1','BILL-905','Taint changes must ship with required tolerations in the same PR'],
    ['P2','BILL-906','Alert on pods Pending > 5m — Pending is silent until it is an outage'],
    ['P3','BILL-907','Document node groups, their taints, and their purpose'],
  ]
},
  ]
};
