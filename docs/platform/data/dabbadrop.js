/* Company 1 — DabbaDrop · seed-stage startup, one VM, Docker Compose, no monitoring.
   Pedagogical role: this company CREATES the pain that Company 2 (BillFree) solves.
   Every incident here should make the learner want orchestration, CI, and alerting. */
window.CO_DABBADROP = {
  id:'dabbadrop', name:'DabbaDrop', tag:'Seed-stage startup', unlock:0,
  role:'You are the only engineer', env:'prod-vm-1',
  stack:'1 VM · Docker Compose · manual deploys · no monitoring',
  blurb:'A tiffin-delivery startup. 400 orders/day, 11 people, one server. You SSH in to deploy. There is no CI, no monitoring, and no second engineer. Everything here works — until it doesn\'t.',
  services:[
    {n:'nginx',rep:'1/1',mem:'24Mi',cpu:'3m'},
    {n:'api',rep:'1/1',mem:'186Mi',cpu:'31m'},
    {n:'postgres',rep:'1/1',mem:'142Mi',cpu:'22m'},
    {n:'redis',rep:'1/1',mem:'18Mi',cpu:'2m'},
  ],
  arch:`                          🌐 users
                            │ HTTPS
                    ┌───────▼────────┐
                    │     nginx      │  :80 :443
                    └───────┬────────┘
                    ┌───────▼────────┐
                    │      api       │  :3000  (node)
                    └───┬────────┬───┘
              ┌─────────┘        └─────────┐
        ┌─────▼─────┐              ┌───────▼───┐
        │ postgres  │              │   redis   │
        └───────────┘              └───────────┘

  <span class="k">ALL OF IT on ONE box</span>   prod-vm-1 · 2 vCPU · 4 GB RAM · 40 GB disk
  <span class="k">Deploy</span>          ssh prod-vm-1 → git pull → docker compose up -d --build
  <span class="k">Monitoring</span>      none. You find out from a customer WhatsApp.
  <span class="k">Backups</span>         cron → pg_dump → /home/ubuntu/backups  (same disk as prod!)
  <span class="k">Rollback</span>        …there isn't one.`,
  risks:[
    ['SPOF','One VM runs everything. If the box dies, the company is offline.'],
    ['Blind','No metrics, no alerts, no log aggregation. Detection = customer complaint.'],
    ['No rollback','Images are built on the server and tagged <span class="mono">latest</span>. The previous artifact is gone.'],
    ['Backups','pg_dump writes to the same disk it is backing up.'],
  ],
  incidents:[
  {
    id:'INC-1043', sev:'critical', alert:'Customer WhatsApp to the founder', svc:'api',
    title:'The site is down and nobody knew for 6 hours',
    paged:'09:12 IST (via WhatsApp)', mttr:'6h 20m', skill:'Restart policies · why orchestration exists',
    teaches:'A crashed container stays dead without a supervisor — and without monitoring, nobody finds out',
    impact:{
      business:'~6 hours of zero orders. Roughly ₹1.4L of lost GMV and a founder apologising on Twitter.',
      customer:'App shows "something went wrong" on every screen. Nobody could place an order all morning.',
      rule:'No alert rule exists. Detection came from a customer message at 09:12 — the API died at 02:51.'
    },
    cmds:{
      'ssh ubuntu@prod-vm-1':{id:'ssh',out:[
        ['Welcome to Ubuntu 22.04.3 LTS (GNU/Linux 5.15.0-91-generic x86_64)','out'],
        ['Last login: Tue Jul  9 14:22:07 2026 from 106.51.x.x','out'],
        ['','out'],
        ['💡 8 days since the last login. Nobody watches this box.','hi'],
      ]},
      'docker compose ps':{id:'ps',out:[
        ['NAME       IMAGE            STATUS                     PORTS','out'],
        ['nginx      nginx:alpine     Up 8 days                  0.0.0.0:80->80/tcp','out'],
        ['api        dabbadrop-api    Exited (1) 6 hours ago','hi'],
        ['postgres   postgres:15      Up 8 days                  5432/tcp','out'],
        ['redis      redis:7-alpine   Up 8 days                  6379/tcp','out'],
        ['','out'],
        ['💡 api Exited 6 HOURS ago. Nothing restarted it. Nothing told anyone.','hi'],
      ]},
      'docker compose logs api --tail=25':{id:'logs',out:[
        ['api  | {"level":"info","msg":"order placed","id":"ord_88214"}','out'],
        ['api  | {"level":"info","msg":"order placed","id":"ord_88215"}','out'],
        ['api  | /app/src/routes/orders.js:142','hi'],
        ['api  |     const slot = payload.delivery.slot.trim();','hi'],
        ['api  |                                     ^','hi'],
        ["api  | TypeError: Cannot read properties of undefined (reading 'trim')",'hi'],
        ['api  |     at placeOrder (/app/src/routes/orders.js:142:39)','out'],
        ['api  | ','out'],
        ['api  | Node.js v20.11.0','out'],
        ['api exited with code 1','hi'],
        ['','out'],
        ['💡 One malformed order (no delivery slot) threw → process exited → stayed dead.','hi'],
      ]},
      'docker inspect api --format "{{.HostConfig.RestartPolicy.Name}}"':{id:'restart',out:[
        ['no','hi'],
        ['','out'],
        ['💡 RestartPolicy: "no". Docker was told to do nothing when it dies. So it did nothing.','hi'],
      ]},
      'free -h && uptime':{id:'sys',out:[
        ['               total        used        free      shared  buff/cache   available','out'],
        ['Mem:           3.8Gi       521Mi       2.1Gi        12Mi       1.2Gi       3.1Gi','out'],
        ['Swap:             0B          0B          0B','out'],
        ['','out'],
        [' 09:14:22 up 8 days,  2:11,  1 user,  load average: 0.04, 0.09, 0.06','out'],
        ['','out'],
        ['💡 Plenty of RAM, box healthy, uptime 8 days. The VM never had a problem.','hi'],
      ]},
    },
    aliases:{
      'ssh prod-vm-1':'ssh ubuntu@prod-vm-1',
      'docker ps':'docker compose ps',
      'docker compose logs api':'docker compose logs api --tail=25',
      'free -h':'free -h && uptime',
      'uptime':'free -h && uptime',
    },
    evidence:'api <b class="mono">Exited (1) 6 hours ago</b> · an unhandled <b class="mono">TypeError</b> in the logs · <b class="mono">RestartPolicy: no</b> · the VM itself is perfectly healthy',
    choices:[
      {k:'A',t:'The VM rebooted and containers did not come back',d:'The host went down overnight.',ok:false,
       why:'<b class="mono">uptime</b> says 8 days — the box never rebooted. And the other three containers have been Up for 8 days straight. Only <i>api</i> died.'},
      {k:'B',t:'The api container crashed on a bad request and nothing restarted it — and nothing alerted anyone',d:'An unhandled exception exited the process; with RestartPolicy "no" it stayed dead, and with no monitoring nobody found out for 6 hours.',ok:true},
      {k:'C',t:'Postgres is down so the API cannot start',d:'The database dependency failed.',ok:false,
       why:'postgres is <b class="mono">Up 8 days</b>, and the api logs show it happily serving orders right up to the crash. The DB was never involved.'},
      {k:'D',t:'The server ran out of memory',d:'OOM killed the process.',ok:false,
       why:'<b class="mono">free -h</b> shows 3.1Gi available and no swap pressure. Also an OOM kill gives exit 137 — this is <b class="mono">exit 1</b> with a JavaScript stack trace. The app killed itself.'},
    ],
    correctTitle:'✓ Correct — it crashed, and nothing was watching',
    correctBody:'This is actually <b>two failures stacked</b>, and both matter.<br><br><b>1. It died:</b> one order arrived without a <span class="mono">delivery.slot</span>, the code called <span class="mono">.trim()</span> on <span class="mono">undefined</span>, Node exited 1. That is a bug — bugs happen.<br><br><b>2. It <i>stayed</i> dead for 6 hours:</b> that is the real incident. <span class="mono">RestartPolicy: no</span> meant nothing brought it back, and no monitoring meant nobody knew until a customer complained. <b>A one-line crash became a six-hour outage because there was no supervisor and no alarm.</b>',
    fixNote:'Two fixes, two horizons. <b>Now:</b> make the container come back by itself. <b>Soon:</b> the real answer is a supervisor that does this properly and tells you when it happens.',
    fixDiff:`docker-compose.yml

   api:
     build: .
     ports: ["3000:3000"]
<span class="add">+    restart: unless-stopped          # bring it back automatically</span>
<span class="add">+    healthcheck:                     # …and know whether it is actually alive</span>
<span class="add">+      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]</span>
<span class="add">+      interval: 30s</span>
<span class="add">+      timeout: 3s</span>
<span class="add">+      retries: 3</span>
     depends_on: [postgres, redis]`,
    shipLabel:'⬆ Add restart policy + healthcheck → redeploy',
    shipOut:`$ docker compose up -d
<span class="add">→ Recreating api … done</span>
<span class="add">→ api   Up 4 seconds (health: starting)</span>
<span class="add">→ api   Up 38 seconds (healthy)</span>
$ curl -s localhost:3000/health
<span class="add">{"status":"ok"}</span>
<span class="add">→ orders flowing again</span>

<span class="k"># proof it now self-heals:</span>
$ docker kill api && sleep 5 && docker compose ps
<span class="add">→ api   Up 2 seconds (health: starting)     ← it came back on its own ✓</span>`,
    shipNote:'The container now restarts itself. That closes the 6-hour hole — but notice what you still do <b>not</b> have: any way to know it happened. You would still be finding out from customers, just faster.',
    wrongLabel:'▶ docker compose up -d (just start it)',
    wrongTitle:'⚠ The site is back — and it will die again tonight',
    wrongOut:`$ docker compose up -d
<span class="add">→ Starting api … done</span>
<span class="add">→ api   Up 3 seconds</span>
<span class="del">→ RestartPolicy: no    (unchanged)</span>
<span class="del">→ monitoring: none     (unchanged)</span>
<span class="del">→ next bad order → exit 1 → dead until someone notices</span>`,
    wrongNote:'You restored service without changing a single condition that caused the outage. The next malformed order — tonight, at 02:00 — produces the identical six-hour outage. <b>Restoring service is not resolving an incident.</b>',
    rcaModel:`What happened: The api container exited at 02:51 IST and stayed down until 09:14 — 6 hours 23 minutes of complete outage. No orders could be placed. We learned about it when a customer messaged the founder at 09:12.

Root cause: Two compounding failures.
1. A malformed order (missing delivery.slot) hit an unguarded .trim() in orders.js:142. Node threw an unhandled TypeError and exited 1.
2. The container had RestartPolicy: no, so nothing brought it back, and we have no monitoring or alerting, so nobody knew for 6 hours.

The bug caused a crash. The lack of a supervisor and the lack of alerting turned a crash into a six-hour outage. The second part is the real failure.

Detection: A customer WhatsApp message to the founder, 6h21m after the outage began. This is not detection — this is being told.

Resolution: Added restart: unless-stopped and a healthcheck to docker-compose.yml; redeployed. Verified self-healing by killing the container and watching it return. MTTR (from detection) 2m; from actual outage start, 6h23m.

Prevention:
1. DD-11 — validate the order payload; never call .trim() on unvalidated input. (Fixes this bug.)
2. DD-12 — uptime monitoring on /health with an alert to the founder's phone. We must never learn about downtime from a customer again. (Fixes the detection gap.)
3. DD-13 — we are one VM with no supervisor, no alerting, and no rollback. Restart policies are a patch. Evaluate a real orchestrator before we take more orders — this incident class disappears entirely when something is actively keeping the service alive and telling us when it isn't.`,
    feedback:'"You did the right thing in the right order: you looked at <span class="mono">ps</span>, read the logs, and — this is the bit most people skip — you checked <span class="mono">free</span> and <span class="mono">uptime</span> to <i>rule out</i> the host. That is how you avoid fixing the wrong thing.<br><br>Best decision: you didn\'t just <span class="mono">up -d</span> and go for chai. You noticed that the outage was not really the crash — it was the <b>6 hours</b>. A crash is a bug; six hours is a missing system.<br><br>Sit with that: we have no supervisor and no alarm. Right now the thing keeping DabbaDrop online is <i>you noticing</i>. That does not scale past this room."',
    tickets:[
      ['P1','DD-11','Validate order payload — guard against missing delivery.slot'],
      ['P1','DD-12','Uptime monitoring on /health → alert the founder\'s phone'],
      ['P2','DD-13','We need a real supervisor + alerting — evaluate an orchestrator'],
    ]
  },
  {
    id:'INC-1057', sev:'critical', alert:'Disk full — everything failing', svc:'postgres',
    title:'Docker logs ate the entire server',
    paged:'23:41 IST', mttr:'47m', skill:'Linux disk · log rotation · open file handles',
    teaches:'Unbounded logs fill disks — and deleting a file an open process holds frees nothing',
    impact:{
      business:'All writes failing during dinner rush — the single busiest hour of the day. Orders lost, not just delayed.',
      customer:'Checkout fails. Cart empties. Users retry and give up.',
      rule:'No alert rule exists. Detection: the founder tried to place a test order.'
    },
    cmds:{
      'df -h':{id:'df',out:[
        ['Filesystem      Size  Used Avail Use% Mounted on','out'],
        ['/dev/sda1        39G   39G     0 100% /','hi'],
        ['tmpfs           1.9G     0  1.9G   0% /dev/shm','out'],
        ['','out'],
        ['💡 100%. Zero bytes free on the root disk. Everything on this box is affected.','hi'],
      ]},
      'sudo du -sh /var/lib/docker/* | sort -rh | head':{id:'du',out:[
        ['34G     /var/lib/docker/containers','hi'],
        ['2.1G    /var/lib/docker/overlay2','out'],
        ['118M    /var/lib/docker/image','out'],
        ['','out'],
        ['💡 34GB of "containers" — that directory holds LOGS, not images.','hi'],
      ]},
      'sudo ls -lhS /var/lib/docker/containers/*/*-json.log':{id:'logs',out:[
        ['-rw-r----- 1 root root  31G Jul 17 23:40 /var/lib/docker/containers/9f2a.../9f2a...-json.log','hi'],
        ['-rw-r----- 1 root root 2.4G Jul 17 23:40 /var/lib/docker/containers/4c81.../4c81...-json.log','warn'],
        ['-rw-r----- 1 root root  61M Jul 17 23:40 /var/lib/docker/containers/7bd3.../7bd3...-json.log','out'],
        ['','out'],
        ['💡 ONE log file is 31GB. That container has been writing since day one.','hi'],
      ]},
      'cat /etc/docker/daemon.json':{id:'daemon',out:[
        ['cat: /etc/docker/daemon.json: No such file or directory','hi'],
        ['','out'],
        ['💡 No daemon config at all → json-file driver → NO log rotation by default.','hi'],
        ['   Docker will happily write a single log file until the disk dies.','hi'],
      ]},
      'docker compose logs postgres --tail=5':{id:'pg',out:[
        ['postgres | 2026-07-17 23:39:02 UTC [1] PANIC:  could not write to file "pg_wal/xlogtemp.612": No space left on device','hi'],
        ['postgres | 2026-07-17 23:39:02 UTC [1] LOG:  WAL writer process was terminated by signal 6: Aborted','hi'],
        ['postgres | 2026-07-17 23:39:11 UTC [1] LOG:  database system is in recovery mode','warn'],
        ['','out'],
        ['💡 Postgres cannot write WAL → every INSERT fails → checkout is dead.','hi'],
      ]},
    },
    aliases:{
      'du -sh /var/lib/docker/*':'sudo du -sh /var/lib/docker/* | sort -rh | head',
      'ls -lh /var/lib/docker/containers':'sudo ls -lhS /var/lib/docker/containers/*/*-json.log',
      'docker compose logs postgres':'docker compose logs postgres --tail=5',
      'cat /etc/docker/daemon.json 2>/dev/null':'cat /etc/docker/daemon.json',
    },
    evidence:'disk <b class="mono">100%</b> (39G/39G) · <b class="mono">/var/lib/docker/containers</b> = 34G · one <b class="mono">-json.log</b> is <b class="mono">31GB</b> · no <b class="mono">daemon.json</b> → no log rotation · postgres <b class="mono">No space left on device</b>',
    choices:[
      {k:'A',t:'The database grew too large for the disk',d:'Postgres data outgrew 40GB.',ok:false,
       why:'Postgres data lives in its volume, and <b class="mono">du</b> puts 34 of the 39 GB in <b class="mono">/var/lib/docker/containers</b> — that directory holds container <i>logs</i>, not database files. The DB is a victim here, not the cause.'},
      {k:'B',t:'Docker\'s json-file log driver has no rotation by default — one container\'s log grew to 31GB',d:'With no daemon.json, Docker writes a single unbounded log file per container until the disk is gone.',ok:true},
      {k:'C',t:'Someone uploaded large files to the server',d:'User content filled the disk.',ok:false,
       why:'The 34GB is accounted for precisely: <b class="mono">/var/lib/docker/containers</b>, in <b class="mono">-json.log</b> files. Nothing points at user uploads, and we can name the exact 31GB file.'},
      {k:'D',t:'The pg_dump backups filled the disk',d:'The backup cron ran out of control.',ok:false,
       why:'A fair suspicion — backups <i>do</i> write to this same disk, which is its own scandal. But the numbers say 34GB is Docker logs. Backups are a real second finding, not this root cause.'},
    ],
    correctTitle:'✓ Correct — unbounded container logs',
    correctBody:'Docker\'s default <span class="mono">json-file</span> driver has <b>no rotation unless you configure it</b>. Every line your app has ever logged, since the day this container started, is in one file. It grew to 31GB, hit 100% disk, and then <i>everything</i> on the box broke — postgres could not write WAL, so every order failed.<br><br>Note the shape of this failure: <b>the noisiest container killed the database.</b> On one VM there is no isolation — one service\'s bad habit takes down every other service sharing that disk.',
    fixNote:'Order matters here. Free space first (carefully — see the trap below), then configure rotation so it cannot recur. And note: <b class="mono">rm</b> is not as simple as it looks when a process holds the file open.',
    fixDiff:`# 1) Truncate the log WITHOUT deleting it (the file handle stays valid)
$ sudo truncate -s 0 /var/lib/docker/containers/9f2a*/9f2a*-json.log
$ df -h /            →  39G  5.1G  32G  14% /     ← space back immediately

# 2) Configure rotation so this can never happen again
/etc/docker/daemon.json  (new file)
<span class="add">+{</span>
<span class="add">+  "log-driver": "json-file",</span>
<span class="add">+  "log-opts": {</span>
<span class="add">+    "max-size": "50m",     # rotate at 50MB</span>
<span class="add">+    "max-file": "3"        # keep 3 → 150MB ceiling per container</span>
<span class="add">+  }</span>
<span class="add">+}</span>

$ sudo systemctl restart docker    # applies to newly-created containers
$ docker compose up -d --force-recreate`,
    shipLabel:'⬆ truncate + configure rotation',
    shipOut:`$ sudo truncate -s 0 /var/lib/docker/containers/9f2a*/9f2a*-json.log
$ df -h /
<span class="add">/dev/sda1   39G  5.1G   32G  14% /        ← 32GB free, instantly</span>
$ sudo systemctl restart docker && docker compose up -d --force-recreate
<span class="add">→ postgres  Up (healthy) · WAL writing again</span>
<span class="add">→ api       Up (healthy)</span>
$ curl -s -XPOST localhost:3000/orders -d @test-order.json
<span class="add">{"id":"ord_88231","status":"confirmed"}    ← checkout works</span>
<span class="add">→ per-container log ceiling now 150MB (50m × 3)</span>`,
    shipNote:'<b class="mono">truncate</b> rather than <b class="mono">rm</b> — that detail is the whole trick, and it is the difference between a 2-minute fix and a confusing 30-minute one. Rotation now caps every container at 150MB.',
    wrongLabel:'🗑 sudo rm the 31GB log file',
    wrongTitle:'⚠ The classic Linux trap — disk still shows 100%',
    wrongOut:`$ sudo rm /var/lib/docker/containers/9f2a*/9f2a*-json.log
$ df -h /
<span class="del">/dev/sda1   39G   39G     0 100% /        ← STILL FULL. What?!</span>

$ sudo lsof | grep deleted
<span class="del">dockerd  912  root  7w  REG  8,1  33285996544  (deleted) /var/lib/docker/…-json.log</span>

<span class="del">→ You unlinked the directory entry, but dockerd still holds the file OPEN.</span>
<span class="del">→ Linux frees the blocks only when the last file handle closes.</span>
<span class="del">→ The 31GB is still allocated. Nothing improved. Postgres still cannot write.</span>`,
    wrongNote:'This one bites everybody once. <b>Deleting a file does not free space while a process holds it open</b> — <span class="mono">rm</span> only removes the name; the inode survives until the last handle closes. You would now have to restart Docker (taking prod down) to reclaim it. <span class="mono">truncate -s 0</span> empties the file <i>in place</i>, so the handle stays valid and the space returns instantly. Same goal, no outage.',
    rcaModel:`What happened: From 23:39 to 00:26 IST — during the dinner rush, our peak hour — every order failed. The root filesystem on prod-vm-1 hit 100%, postgres could not write WAL, and all INSERTs errored.

Root cause: Docker's json-file log driver does not rotate logs unless configured, and we had no /etc/docker/daemon.json at all. A single container's log file had been growing since the day it was first started and reached 31GB, consuming 34GB of a 40GB disk. When the disk hit 100%, postgres — which shares that disk — could no longer write.

This is the single-VM failure mode: the noisiest container took down the database. There is no isolation between services on one box.

Detection: The founder tried to place a test order and it failed. Nothing alerted us. The disk had been filling for weeks with no warning whatsoever.

Resolution: Truncated the oversized log in place with truncate -s 0 (NOT rm — dockerd holds the file open, so rm would not have freed the blocks without restarting Docker). Space returned instantly. Then created /etc/docker/daemon.json with max-size 50m / max-file 3, restarted Docker, and recreated containers. MTTR 47m.

Prevention:
1. DD-21 — disk usage alert at 80%. A disk fills gradually; there is no excuse for finding out at 100% via failed orders.
2. DD-22 — the app logs a line per request at info level. Reduce log volume and ship logs off this box entirely.
3. DD-23 — pg_dump backups write to /home/ubuntu/backups, on the same disk they are backing up. When this disk filled, our backups were also failing — silently. Move backups off-box (S3) immediately. This is arguably scarier than the outage.
4. DD-24 — one VM means one service's bad behaviour breaks every other service. This will keep happening in new forms until workloads are isolated.`,
    feedback:'"Textbook triage. <span class="mono">df</span> → <span class="mono">du</span> → find the actual file. You didn\'t guess; you followed the bytes down to a single 31GB log and then asked <i>why</i> it was allowed to get that big — <span class="mono">daemon.json</span> missing. That last question is what separates a fix from a root cause.<br><br>And you used <b class="mono">truncate</b>, not <b class="mono">rm</b>. I want you to appreciate how many engineers lose thirty minutes to that trap at midnight, staring at a <span class="mono">df</span> that stubbornly says 100% after they \'freed\' 31GB.<br><br>Now the part that should worry you more than the outage: our backups write to the disk that just filled. <b>Our backups have been failing too, and we would only have discovered that while trying to restore.</b> Fix that this week."',
    tickets:[
      ['P1','DD-21','Disk usage alert at 80% — never discover a full disk from failed orders'],
      ['P1','DD-23','Backups write to the same disk they protect — move to S3 NOW'],
      ['P2','DD-22','Reduce app log volume; ship logs off the box'],
      ['P2','DD-24','One VM = no isolation; one noisy container can kill the DB'],
    ]
  },
  {
    id:'INC-1069', sev:'critical', alert:'Checkout broken after deploy', svc:'api',
    title:'The deploy broke prod and there is nothing to roll back to',
    paged:'18:22 IST', mttr:'31m', skill:'Immutable artifacts · why :latest is a trap',
    teaches:'A mutable tag built on the server means the previous artifact no longer exists',
    impact:{
      business:'Checkout down during the evening rush. Every order attempt fails at payment.',
      customer:'Users fill a cart, hit pay, get a 500. Trust damage on top of lost revenue.',
      rule:'No alert rule. Detection: you deployed, then a customer complained 9 minutes later.'
    },
    cmds:{
      'docker compose ps':{id:'ps',out:[
        ['NAME       IMAGE            STATUS              PORTS','out'],
        ['nginx      nginx:alpine     Up 9 days           0.0.0.0:80->80/tcp','out'],
        ['api        dabbadrop-api    Up 4 minutes        3000/tcp','warn'],
        ['postgres   postgres:15      Up 9 days           5432/tcp','out'],
        ['redis      redis:7-alpine   Up 9 days           6379/tcp','out'],
        ['','out'],
        ['💡 api is UP — it is not crashed. It is running the broken code, healthily.','hi'],
      ]},
      'curl -s -o /dev/null -w "%{http_code}" localhost:3000/checkout':{id:'curl',out:[
        ['500','hi'],
        ['','out'],
        ['💡 Serving 500s. Container healthy, code broken. No crash to point at.','hi'],
      ]},
      'docker compose logs api --tail=15':{id:'logs',out:[
        ['api  | {"level":"error","msg":"payment gateway error","err":"razorpay: key_id is required"}','hi'],
        ['api  |     at createOrder (/app/src/payments/razorpay.js:31:11)','out'],
        ['api  |     at checkout (/app/src/routes/checkout.js:88:22)','out'],
        ['','out'],
        ['💡 The new code reads RAZORPAY_KEY_ID — which was never added to .env on this box.','hi'],
      ]},
      'docker images | head':{id:'images',out:[
        ['REPOSITORY       TAG       IMAGE ID       CREATED         SIZE','out'],
        ['dabbadrop-api    latest    a4f91c2e8b13   4 minutes ago   412MB','hi'],
        ['postgres         15        6c8f2a1d4e97   3 weeks ago     379MB','out'],
        ['nginx            alpine    2b7d9e4c1a86   5 weeks ago     43MB','out'],
        ['','out'],
        ['💡 ONE api image. Tagged "latest". Built 4 min ago. The previous one is GONE —','hi'],
        ['   the build overwrote the tag and the old layers were pruned.','hi'],
      ]},
      'git log --oneline -5':{id:'git',out:[
        ['e7a2f19 (HEAD -> main) feat: switch payments to razorpay','hi'],
        ['c4d81b3 fix: order slot validation','out'],
        ['9f22e07 chore: bump deps','out'],
        ['b18c4a5 feat: delivery slots','out'],
        ['','out'],
        ['💡 e7a2f19 is live and broken. c4d81b3 was the last good one — but no image exists for it.','hi'],
      ]},
    },
    aliases:{
      'docker ps':'docker compose ps',
      'curl localhost:3000/checkout':'curl -s -o /dev/null -w "%{http_code}" localhost:3000/checkout',
      'docker compose logs api':'docker compose logs api --tail=15',
      'docker images':'docker images | head',
      'git log':'git log --oneline -5',
    },
    evidence:'api <b class="mono">Up</b> and healthy but serving <b class="mono">500</b> · new code needs <b class="mono">RAZORPAY_KEY_ID</b> which is not in <b class="mono">.env</b> · only <b class="mono">ONE</b> api image exists, tagged <b class="mono">latest</b>, built 4 minutes ago',
    choices:[
      {k:'A',t:'The database migration failed',d:'A schema change broke checkout.',ok:false,
       why:'The error is explicit: <b class="mono">razorpay: key_id is required</b>, thrown in <b class="mono">payments/razorpay.js</b>. No migration ran, and postgres has been Up for 9 days untouched.'},
      {k:'B',t:'`latest` is a mutable tag and the image was rebuilt in place — the previous artifact no longer exists, so there is no rollback target',d:'The deploy overwrote the only image. Git has the old code, but no built artifact for it.',ok:true},
      {k:'C',t:'The VM is out of memory',d:'Resource pressure is causing 500s.',ok:false,
       why:'Nothing suggests resource pressure, and the failure is deterministic and specific — every checkout throws the same missing-config error. OOM does not produce tidy application errors; it produces dead processes.'},
      {k:'D',t:'nginx is misconfigured and routing wrongly',d:'The proxy layer is broken.',ok:false,
       why:'The 500 comes from the api itself with a real stack trace — we reached the app fine. nginx has been Up 9 days and was not touched by this deploy.'},
    ],
    correctTitle:'✓ Correct — you have no rollback target',
    correctBody:'Two things went wrong and they compound.<br><br><b>The trigger:</b> new code needs <span class="mono">RAZORPAY_KEY_ID</span>; it exists on your laptop\'s <span class="mono">.env</span> and nowhere else. Config drift — the server\'s <span class="mono">.env</span> is hand-maintained and nobody wrote it down.<br><br><b>The real problem:</b> you cannot undo it. <span class="mono">docker compose up -d --build</span> built a new image and moved the <span class="mono">latest</span> tag onto it. <b><span class="mono">latest</span> is not a version — it is a sticky note that always points at whatever you built last.</b> The previous image was untagged and pruned. Git has the old <i>code</i>, but there is no old <i>artifact</i>. Your only path back is to rebuild — minutes of downtime, during the rush, under pressure.',
    fixNote:'Right now: get back to known-good the only way you can — rebuild the old commit. Then remove the entire class of problem by tagging images with the commit SHA, so every build is a permanent, addressable artifact.',
    fixDiff:`# NOW — rebuild the last known-good commit (the only path back)
$ git checkout c4d81b3
$ docker compose up -d --build          # ~4 min of downtime. Painful. Necessary.

# NEXT — make rollback instant, forever: tag by commit SHA
deploy.sh
<span class="del">-docker compose up -d --build            # builds :latest, destroys the old one</span>
<span class="add">+SHA=$(git rev-parse --short HEAD)</span>
<span class="add">+docker build -t dabbadrop-api:$SHA .    # immutable, addressable artifact</span>
<span class="add">+docker tag dabbadrop-api:$SHA dabbadrop-api:current</span>
<span class="add">+API_IMAGE=dabbadrop-api:$SHA docker compose up -d</span>
<span class="add">+# rollback becomes:  API_IMAGE=dabbadrop-api:c4d81b3 docker compose up -d   (seconds)</span>

# AND — stop config drift
<span class="add">+.env.example committed to git; deploy fails loudly if a required key is missing</span>`,
    shipLabel:'⬆ Rebuild known-good + adopt SHA tags',
    shipOut:`$ git checkout c4d81b3
$ docker compose up -d --build
<span class="warn">→ building… (4m 11s of downtime — this is the cost of :latest)</span>
<span class="add">→ api   Up (healthy)</span>
$ curl -s -o /dev/null -w "%{http_code}" localhost:3000/checkout
<span class="add">200        ← checkout restored</span>

<span class="k"># going forward, images are immutable:</span>
$ docker images | grep dabbadrop
<span class="add">dabbadrop-api   c4d81b3   a4f91c2e8b13   now     412MB</span>
<span class="add">dabbadrop-api   e7a2f19   b7c02d5f9a41   18m     412MB   ← the broken one, still there</span>
<span class="add">→ rollback is now: API_IMAGE=dabbadrop-api:c4d81b3 docker compose up -d  (3 seconds)</span>`,
    shipNote:'Note what changed: the broken image <b>still exists</b> under its own SHA. Nothing overwrote anything. Every build is now a permanent artifact you can jump between in seconds — which is exactly what a rollback is.',
    wrongLabel:'⬇ docker compose pull (get the previous image)',
    wrongTitle:'⚠ There is nothing to pull — you build on the server',
    wrongOut:`$ docker compose pull api
<span class="del">→ Pulling api … ERROR: pull access denied for dabbadrop-api,</span>
<span class="del">  repository does not exist or may require 'docker login'</span>

<span class="del">→ This image was never pushed anywhere. It only ever existed on this box.</span>
<span class="del">→ There is no registry. There is no history. There is only :latest —</span>
<span class="del">  and :latest IS the broken one.</span>`,
    wrongNote:'This is the moment the lesson lands. <b>You cannot pull what you never pushed.</b> Building on the production server means your artifact has no home, no history, and no name other than a tag that always means "newest". A registry plus immutable SHA tags is not ceremony — it is the difference between a 3-second rollback and a 4-minute rebuild during your busiest hour.',
    rcaModel:`What happened: At 18:22 IST I deployed e7a2f19 (razorpay payments). Checkout began returning 500 on every request. Because there was no image to roll back to, restoring service required rebuilding the previous commit on the server — 4 minutes of additional downtime during the evening rush. Total impact 31 minutes.

Root cause: Two issues, one trigger and one amplifier.
1. Trigger: the new code requires RAZORPAY_KEY_ID. That variable exists in my local .env and was never added to the server's hand-maintained .env. Config drift — the server's configuration lives nowhere but the server.
2. Amplifier (the real problem): we build images on the production box and tag them :latest. The build overwrote the only existing artifact, so the previously-working image ceased to exist. Git had the old code; nothing had the old build. :latest is a mutable pointer, not a version.

The bad deploy was recoverable in principle. It took 31 minutes because we had destroyed the thing we needed to recover to.

Detection: A customer complaint 9 minutes after deploy. We deployed a payments change during peak hours with no smoke test and no monitoring.

Resolution: git checkout c4d81b3 and rebuild on the server (4m downtime). Then changed deploy.sh to build and tag images by commit SHA, so every build is a permanent artifact and rollback is an image swap measured in seconds.

Prevention:
1. DD-31 — tag every image with the commit SHA; never deploy :latest. Rollback becomes instant. (Done.)
2. DD-32 — commit .env.example and fail the deploy loudly when a required key is missing, instead of discovering it via 500s in production.
3. DD-33 — smoke-test /checkout after deploy and roll back automatically on failure. A machine should catch this in 20 seconds, not a customer in 9 minutes.
4. DD-34 — do not deploy payments changes during peak hours by hand. We need a pipeline that builds once, tests, and promotes a known artifact — not a human running --build on prod.`,
    feedback:'"Good instinct on the first move: <span class="mono">docker images</span>. Most people stare at logs for ten minutes; you asked \'what can I even go back to?\' and found the answer was <i>nothing</i>. Knowing your rollback options <b>before</b> you start fixing is senior behaviour.<br><br>You also correctly separated the trigger (a missing env var) from the actual incident (no rollback path). Anyone can miss an env var. Not being able to undo it in under a minute is a systems failure, and that is the one worth your attention.<br><br>Look at what you have now told me across three incidents: nothing restarts our services, nothing watches them, and nothing lets us undo a bad change. Each time we patched the symptom. <b>These are not three separate problems — they are one missing platform.</b> Write that up. I will back you."',
    tickets:[
      ['P1','DD-31','Tag images by commit SHA — never deploy :latest again'],
      ['P1','DD-33','Smoke-test /checkout after deploy; auto-rollback on failure'],
      ['P2','DD-32','Commit .env.example; fail deploy on missing required keys'],
      ['P2','DD-34','Stop hand-deploying to prod — build once, promote an artifact'],
    ]
  },
  ]
};
