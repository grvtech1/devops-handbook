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
  ]
};
