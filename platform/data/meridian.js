/* Company 3 — Meridian Financial · regulated fintech, multi-team EKS, RBAC/IRSA/audit.
   Pedagogical role: here the cluster WORKS. The incidents are about blast radius,
   least privilege, and proving what happened to an auditor. Nothing crashes —
   the danger is what a mistake is ALLOWED to reach. */
window.CO_MERIDIAN = {
  id:'meridian', name:'Meridian Financial', tag:'Regulated enterprise', unlock:2100,
  role:'Senior Platform Engineer · Platform team', env:'meridian-prod (eu-west-1)',
  stack:'EKS multi-team · Istio mTLS · IRSA · Kyverno · audit → SIEM',
  blurb:'A licensed payments company. 60 engineers across payments, ledger, and KYC teams. Every API call to the cluster is logged and retained for 7 years. Nothing here crash-loops — the platform is solid. The incidents are about who can reach what, and proving it.',
  services:[
    {n:'payments-api',rep:'6/6',mem:'412Mi',cpu:'240m'},
    {n:'ledger-api',rep:'4/4',mem:'386Mi',cpu:'190m'},
    {n:'kyc-api',rep:'3/3',mem:'298Mi',cpu:'110m'},
    {n:'recon-worker',rep:'2/2',mem:'204Mi',cpu:'85m'},
    {n:'analytics-etl',rep:'2/2',mem:'512Mi',cpu:'320m'},
    {n:'istio-ingress',rep:'3/3',mem:'96Mi',cpu:'45m'},
  ],
  arch:`                     🌐 clients  (mTLS, pinned certs)
                            │
                    ┌───────▼────────┐
                    │  AWS ALB + WAF │
                    └───────┬────────┘
                    ┌───────▼────────┐
                    │ istio-ingress  │  ← mTLS enforced east-west
                    └───┬────┬───┬───┘
        ┌───────────────┘    │   └───────────────┐
  ┌─────▼────────┐  ┌────────▼──────┐  ┌─────────▼────┐
  │ payments-prod│  │  ledger-prod  │  │   kyc-prod   │   ← namespace per team
  │ payments-team│  │  ledger-team  │  │   kyc-team   │
  └─────┬────────┘  └────────┬──────┘  └─────────┬────┘
        └────────────────────┼───────────────────┘
                    ┌────────▼────────┐
                    │ RDS Multi-AZ    │  ← KMS encrypted · PITR · audited
                    └─────────────────┘

  <span class="k">Human access</span>   Okta → IAM Identity Center → EKS RBAC   (no static kubeconfigs)
  <span class="k">Pod → AWS</span>      IRSA: ServiceAccount ⇄ IAM role          (no node instance profile)
  <span class="k">Audit</span>          EKS audit log → CloudWatch → Splunk      (7-year retention)
  <span class="k">Policy</span>         Kyverno admission: no :latest · no privileged · limits required
  <span class="k">Change</span>         prod deploy = 2 approvals + linked change ticket`,
  risks:[
    ['Blast radius','60 engineers, one cluster. A wrong RBAC grant reaches other teams\' secrets.'],
    ['Standing access','Long-lived credentials anywhere are an audit finding waiting to happen.'],
    ['Proof','It is not enough to be secure — we must be able to PROVE it to a regulator.'],
    ['Prune','Automation with delete rights can remove things no human would ever delete.'],
  ],
  incidents:[
  {
    id:'INC-4102', sev:'critical', alert:'Quarterly access review — RBAC finding', svc:'analytics-etl',
    title:'A ServiceAccount has cluster-admin',
    paged:'11:30 IST (audit finding, not an outage)', mttr:'2h 05m', skill:'RBAC · least privilege · blast radius',
    teaches:'Understand what a permission is USED for before you revoke it',
    impact:{
      business:'Audit finding ahead of a PCI-DSS assessment. If unresolved it becomes a reportable control failure.',
      customer:'No customer impact — and that is the point. Nothing is broken. The risk is what this COULD do.',
      rule:'Kyverno policy report: ClusterRoleBinding grants cluster-admin to a namespaced workload'
    },
    cmds:{
      'kubectl get clusterrolebindings -o wide | grep analytics':{id:'crb',out:[
        ['NAME               ROLE                        AGE   USERS  GROUPS  SERVICEACCOUNTS','out'],
        ['analytics-admin    ClusterRole/cluster-admin   247d                 data-prod/analytics-sa','hi'],
        ['','out'],
        ['💡 cluster-admin. Bound 247 days ago. To an ETL job.','hi'],
      ]},
      'kubectl auth can-i --list --as=system:serviceaccount:data-prod:analytics-sa':{id:'canilist',out:[
        ['Resources    Non-Resource URLs   Resource Names   Verbs','out'],
        ['*.*          []                  []               [*]','hi'],
        ['             [*]                 []               [*]','hi'],
        ['','out'],
        ['💡 *.* / [*] — every resource, every verb, every namespace. Including secrets.','hi'],
      ]},
      'kubectl auth can-i get secrets -n payments-prod --as=system:serviceaccount:data-prod:analytics-sa':{id:'cansec',out:[
        ['yes','hi'],
        ['','out'],
        ['💡 An analytics ETL pod can read PAYMENT secrets. That is the blast radius.','hi'],
        ['   If that pod is ever compromised, the attacker owns the cluster.','hi'],
      ]},
      'kubectl logs -n kube-system -l component=kube-apiserver --since=720h | grep analytics-sa | awk \'{print $6,$7}\' | sort | uniq -c | sort -rn':{id:'audit',out:[
        ['  14208 list  pods.data-prod','ok'],
        ['   3104 get   configmaps.data-prod','ok'],
        ['    892 list  jobs.data-prod','ok'],
        ['','out'],
        ['💡 30 days of audit log: it ONLY ever reads pods/configmaps/jobs in its OWN namespace.','hi'],
        ['   It has cluster-admin and uses ~0.1% of it. Now you know exactly what to grant.','hi'],
      ]},
      'git log --oneline -3 -- clusters/prod/rbac/analytics.yaml':{id:'git',out:[
        ['b81f0c4 fix: analytics job cannot list pods — grant admin','hi'],
        ['4a92e17 feat: onboard analytics-etl','out'],
        ['','out'],
        ['💡 "cannot list pods → grant admin". Someone hit a permission error 247 days ago','hi'],
        ['   and reached for the biggest hammer available. It worked, so it shipped.','hi'],
      ]},
    },
    aliases:{
      'kubectl get clusterrolebindings | grep analytics':'kubectl get clusterrolebindings -o wide | grep analytics',
      'kubectl auth can-i --list --as=system:serviceaccount:data-prod:analytics-sa -n data-prod':'kubectl auth can-i --list --as=system:serviceaccount:data-prod:analytics-sa',
      'git log clusters/prod/rbac/analytics.yaml':'git log --oneline -3 -- clusters/prod/rbac/analytics.yaml',
    },
    evidence:'<b class="mono">analytics-sa</b> → <b class="mono">cluster-admin</b> for 247 days · <b class="mono">can-i --list</b> returns <b class="mono">*.*  [*]</b> · it can read <b class="mono">payments-prod</b> secrets · but 30 days of audit log show it only ever reads <b>pods/configmaps/jobs in its own namespace</b>',
    choices:[
      {k:'A',t:'The ServiceAccount token has leaked',d:'Someone stole the credentials and is using them.',ok:false,
       why:'No evidence of that. The audit log shows only normal, expected in-namespace reads — nothing anomalous. The finding is not that it <i>was</i> abused; it is that it <i>could</i> be, catastrophically. Do not invent a breach.'},
      {k:'B',t:'A ClusterRoleBinding grants cluster-admin to a workload that only needs namespaced read — least privilege violation with cluster-wide blast radius',d:'The permission vastly exceeds the need; if that pod is ever compromised the attacker owns every secret in the cluster.',ok:true},
      {k:'C',t:'RBAC is disabled on this cluster',d:'Authorization is not being enforced.',ok:false,
       why:'RBAC is very much enforced — that is <i>why</i> <b class="mono">can-i</b> can answer these questions precisely. The system worked exactly as configured. We configured it wrong.'},
      {k:'D',t:'The pod is running as root',d:'Container security context is too permissive.',ok:false,
       why:'A different (real) concern, but unrelated. Running as root is power <i>inside</i> the container; cluster-admin is power over <i>the entire cluster API</i>. Kyverno already blocks privileged pods here.'},
    ],
    correctTitle:'✓ Correct — and note what the audit log gave you',
    correctBody:'247 days ago someone hit "cannot list pods", granted <span class="mono">cluster-admin</span>, and moved on. It worked, so nobody revisited it. That is how almost every over-privileged binding in the world is born.<br><br><b>The blast radius is the finding.</b> Nothing is broken and nothing was abused — but an ETL pod that parses CSVs can currently read every secret in <span class="mono">payments-prod</span>. One dependency compromise in that image and an attacker owns the payments platform. In a regulated environment, "we <i>could</i> be catastrophically breached" is itself the failure.<br><br><b>The move that made this safe:</b> you read 30 days of audit log <i>before</i> touching anything. Now you are not guessing at least privilege — you have measured it.',
    fixNote:'Do not just delete the binding — it does need <i>some</i> access, and revoking blindly turns an audit finding into an outage (see the trap). Replace cluster-admin with exactly what the audit log proves it uses: namespaced read.',
    fixDiff:`clusters/prod/rbac/analytics.yaml

<span class="del">-# "analytics job cannot list pods — grant admin"  (247 days ago)</span>
<span class="del">-apiVersion: rbac.authorization.k8s.io/v1</span>
<span class="del">-kind: ClusterRoleBinding                # cluster-wide. every namespace.</span>
<span class="del">-metadata: { name: analytics-admin }</span>
<span class="del">-roleRef:  { kind: ClusterRole, name: cluster-admin }</span>
<span class="del">-subjects: [{ kind: ServiceAccount, name: analytics-sa, namespace: data-prod }]</span>

<span class="add">+# Scoped to exactly what 30 days of audit log show it actually uses.</span>
<span class="add">+apiVersion: rbac.authorization.k8s.io/v1</span>
<span class="add">+kind: Role                              # namespaced, not cluster-wide</span>
<span class="add">+metadata: { name: analytics-reader, namespace: data-prod }</span>
<span class="add">+rules:</span>
<span class="add">+  - apiGroups: [""]</span>
<span class="add">+    resources: ["pods", "configmaps"]</span>
<span class="add">+    verbs: ["get", "list"]              # read only. no write, no delete.</span>
<span class="add">+  - apiGroups: ["batch"]</span>
<span class="add">+    resources: ["jobs"]</span>
<span class="add">+    verbs: ["get", "list"]</span>
<span class="add">+---</span>
<span class="add">+kind: RoleBinding                       # binds only within data-prod</span>
<span class="add">+metadata: { name: analytics-reader, namespace: data-prod }</span>
<span class="add">+roleRef:  { kind: Role, name: analytics-reader }</span>
<span class="add">+subjects: [{ kind: ServiceAccount, name: analytics-sa, namespace: data-prod }]</span>`,
    shipLabel:'⬆ Scope the role → PR (2 approvals) → Argo sync',
    shipOut:`$ git commit -m "security(rbac): scope analytics-sa to namespaced read (CVE-AUDIT-Q3-014)"
$ gh pr create --title "Remove cluster-admin from analytics-sa" --reviewer platform-team,security-team
<span class="add">→ PR #1892  ✓ security-team approved  ✓ platform-team approved  ✓ CHG-4471 linked</span>
$ # merged → Argo CD sync
<span class="add">→ clusterrolebinding.rbac/analytics-admin  pruned</span>
<span class="add">→ role.rbac/analytics-reader  created</span>
<span class="add">→ rolebinding.rbac/analytics-reader  created</span>

<span class="k"># verify the blast radius is gone:</span>
$ kubectl auth can-i get secrets -n payments-prod --as=system:serviceaccount:data-prod:analytics-sa
<span class="add">no                                    ← blast radius closed ✓</span>
$ kubectl auth can-i list pods -n data-prod --as=system:serviceaccount:data-prod:analytics-sa
<span class="add">yes                                   ← still does its job ✓</span>
$ kubectl logs -n data-prod -l app=analytics-etl --tail=3
<span class="add">{"level":"info","msg":"etl run complete","rows":184203}   ← no regression ✓</span>`,
    shipNote:'Both checks matter. <b class="mono">can-i get secrets → no</b> proves the finding is closed; <b class="mono">can-i list pods → yes</b> plus a clean ETL run proves you did not break the thing you were securing. An auditor will ask for exactly this pair.',
    wrongLabel:'🗑 kubectl delete clusterrolebinding analytics-admin',
    wrongTitle:'⚠ Finding closed, service broken — you caused an incident',
    wrongOut:`$ kubectl delete clusterrolebinding analytics-admin
clusterrolebinding.rbac.authorization.k8s.io "analytics-admin" deleted
<span class="add">→ can-i get secrets -n payments-prod → no    (finding technically closed)</span>

<span class="del">→ 14:02  analytics-etl  CrashLoopBackOff</span>
<span class="del">→ logs: pods is forbidden: User "system:serviceaccount:data-prod:analytics-sa"</span>
<span class="del">        cannot list resource "pods" in the namespace "data-prod"</span>
<span class="del">→ nightly reconciliation feed to the ledger team: FAILED</span>
<span class="del">→ …and Argo CD reverts your manual delete on next sync anyway (selfHeal)</span>`,
    wrongNote:'You removed <i>all</i> of its access, when it legitimately needed <i>some</i>. The ETL broke, the ledger team\'s nightly feed failed, and you created a Sev-2 while closing a Sev-3. This is why the audit log query matters: <b>measure what a principal actually uses, then grant exactly that.</b> Revoking blindly is not security — it is just a different outage. (Also: this cluster is GitOps-managed. Your delete gets reverted on the next sync, so the finding comes back too.)',
    rcaModel:`What happened: A quarterly access review flagged that ClusterRoleBinding analytics-admin granted cluster-admin to analytics-sa, a namespaced ETL workload in data-prod. There was no outage and no evidence of abuse. The finding is one of exposure: that ServiceAccount could read every secret in every namespace, including payments-prod.

Root cause: 247 days ago (commit b81f0c4, "analytics job cannot list pods — grant admin") an engineer hit an RBAC denial and resolved it with cluster-admin. It worked, the PR was approved, and nothing revisited it. We had no control that treats a cluster-admin grant as exceptional, and no periodic re-attestation of standing permissions.

Blast radius assessment: analytics-etl runs a third-party CSV/parquet parsing image. A single dependency compromise in that image would have yielded full cluster admin, including payment credentials and KMS-backed secrets. Under PCI-DSS this is a segregation-of-duties control failure regardless of whether it was exploited.

Evidence of actual use: 30 days of EKS audit log show analytics-sa performing only get/list on pods, configmaps, and jobs within data-prod (~18k calls, zero outside its namespace, zero writes, zero secret access). It used approximately 0.1% of what it was granted.

Resolution: Replaced the ClusterRoleBinding with a namespaced Role granting get/list on pods, configmaps, and jobs in data-prod only, plus a matching RoleBinding. Verified via kubectl auth can-i that secret access in payments-prod is now denied, that the workload retains the access it needs, and that the ETL completed normally. Shipped through a PR with security-team and platform-team approval, linked to CHG-4471. MTTR 2h05m (investigation-bound, no outage).

Prevention:
1. MER-711 — Kyverno policy: deny any ClusterRoleBinding to cluster-admin for a ServiceAccount, with a documented break-glass exception path. Make the easy thing impossible.
2. MER-712 — quarterly automated RBAC attestation: diff every principal's granted permissions against 90 days of audit-log usage; anything unused for a quarter is proposed for revocation.
3. MER-713 — when an engineer hits an RBAC denial, they must have a fast, obvious way to request the correct scoped role. b81f0c4 happened because "grant admin" was the path of least resistance at 6pm. If the right thing is slower than the wrong thing, we will keep getting this finding.
4. MER-714 — audit every other cluster-admin binding in the estate using the same usage-diff method; assume this is not the only one.`,
    feedback:'"This is the one I judge senior engineers on, and you passed the part that matters.<br><br>The junior move is to see cluster-admin, feel righteous, and delete the binding. Finding closed, security scorecard green, ETL dead, ledger team\'s nightly feed broken, and you are now in a Sev-2 of your own making. <b>You did not do that.</b> You went to the audit log first and asked what this thing actually <i>does</i> — 18,000 calls, all in its own namespace, all reads. Then you granted exactly that. You turned least privilege from a slogan into a measurement.<br><br>I also liked that you did not overclaim. You wrote \'no evidence of abuse\' instead of implying a breach. In a regulated shop, an RCA that dramatises gets read by lawyers.<br><br>Now the systemic point, and it is your best ticket: this happened because at 6pm on some Tuesday, <span class=\'mono\'>grant admin</span> was easier than finding the right role. Security controls that are slower than the insecure path lose, every time. <b>Fix the paved road, not just this binding.</b>"',
    tickets:[
      ['P1','MER-711','Kyverno: deny ClusterRoleBinding → cluster-admin for ServiceAccounts'],
      ['P1','MER-714','Audit all other cluster-admin bindings via usage-diff'],
      ['P2','MER-712','Quarterly RBAC attestation: granted vs actually-used'],
      ['P2','MER-713','Make requesting a correct scoped role faster than granting admin'],
    ]
  },
  {
    id:'INC-4118', sev:'critical', alert:'Secret scanner — AKIA key in commit', svc:'kyc-api',
    title:'AWS access key committed to Git',
    paged:'04:07 IST', mttr:'3h 40m', skill:'Secret rotation · static keys vs IRSA',
    teaches:'Deleting a leaked secret does nothing — git history is forever. Only rotation counts.',
    impact:{
      business:'Reportable security event. A valid long-lived AWS key with S3 and RDS read access was in a repo 41 engineers can clone.',
      customer:'No confirmed data access. But we must prove that to a regulator, not assert it.',
      rule:'GitGuardian: AWS AKIA credential detected in commit 3f81a2c (kyc-api repo, main branch)'
    },
    cmds:{
      'git log -p --all -S AKIA --oneline | head -20':{id:'gitlog',out:[
        ['3f81a2c fix(kyc): add s3 access for document uploads','hi'],
        ['+  AWS_ACCESS_KEY_ID: AKIA4XMPL7QK2VN9EXAMPLE','hi'],
        ['+  AWS_SECRET_ACCESS_KEY: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY','hi'],
        ['','out'],
        ['💡 Committed 6 days ago, to main. The repo has 41 collaborators.','hi'],
      ]},
      'aws iam get-access-key-last-used --access-key-id AKIA4XMPL7QK2VN9EXAMPLE':{id:'lastused',out:[
        ['{','out'],
        ['  "UserName": "kyc-service-user",','out'],
        ['  "AccessKeyLastUsed": {','out'],
        ['    "LastUsedDate": "2026-07-17T03:58:00Z",','out'],
        ['    "ServiceName": "s3",','out'],
        ['    "Region": "eu-west-1"','out'],
        ['  }','out'],
        ['}','out'],
        ['','out'],
        ['💡 The key is LIVE and was used 9 minutes ago. It is not dormant.','hi'],
      ]},
      'aws iam list-attached-user-policies --user-name kyc-service-user':{id:'policies',out:[
        ['{','out'],
        ['  "AttachedPolicies": [','out'],
        ['    { "PolicyName": "AmazonS3FullAccess" },','hi'],
        ['    { "PolicyName": "AmazonRDSReadOnlyAccess" }','hi'],
        ['  ]','out'],
        ['}','out'],
        ['','out'],
        ['💡 S3 FULL access (not just the kyc bucket) + RDS read. That is the blast radius.','hi'],
      ]},
      'aws cloudtrail lookup-events --lookup-attributes AttributeKey=AccessKeyId,AttributeValue=AKIA4XMPL7QK2VN9EXAMPLE --max-results 5':{id:'cloudtrail',out:[
        ['EventTime            EventName        SourceIPAddress   UserAgent','out'],
        ['2026-07-17 03:58:00  GetObject        10.4.21.88        aws-sdk-go/kyc-api','ok'],
        ['2026-07-17 02:14:00  PutObject        10.4.21.88        aws-sdk-go/kyc-api','ok'],
        ['2026-07-16 22:41:00  GetObject        10.4.21.88        aws-sdk-go/kyc-api','ok'],
        ['','out'],
        ['💡 All calls from 10.4.21.88 — our own EKS node CIDR. No external source IP.','hi'],
        ['   No evidence of misuse. That is good news, but it is NOT a reason to relax.','hi'],
      ]},
      'kubectl get sa kyc-api -n kyc-prod -o jsonpath="{.metadata.annotations}"':{id:'irsa',out:[
        ['{}','hi'],
        ['','out'],
        ['💡 No eks.amazonaws.com/role-arn annotation → this SA does NOT use IRSA.','hi'],
        ['   Every other service here uses IRSA. kyc-api was onboarded with a static key.','hi'],
      ]},
    },
    aliases:{
      'git log -S AKIA':'git log -p --all -S AKIA --oneline | head -20',
      'aws iam get-access-key-last-used':'aws iam get-access-key-last-used --access-key-id AKIA4XMPL7QK2VN9EXAMPLE',
      'aws cloudtrail lookup-events':'aws cloudtrail lookup-events --lookup-attributes AttributeKey=AccessKeyId,AttributeValue=AKIA4XMPL7QK2VN9EXAMPLE --max-results 5',
      'kubectl get sa kyc-api -n kyc-prod -o yaml':'kubectl get sa kyc-api -n kyc-prod -o jsonpath="{.metadata.annotations}"',
    },
    evidence:'a <b>live</b> AKIA key in <b class="mono">main</b> for 6 days · repo has <b>41 collaborators</b> · key has <b class="mono">S3FullAccess</b> + <b class="mono">RDSReadOnly</b> · CloudTrail shows only our own node IPs · the SA has <b>no IRSA annotation</b>',
    choices:[
      {k:'A',t:'Delete the file and force-push — problem solved',d:'Remove the secret from the repo and move on.',ok:false,
       why:'The key does not live in the working tree — it lives in <b>every commit, every clone, every fork, every CI cache, and every developer\'s reflog</b>. 41 people have it on disk right now. Rewriting history does not reach any of those copies, and the key stays valid the entire time. This is the single most common wrong answer to a leaked credential.'},
      {k:'B',t:'The key must be ROTATED immediately — deletion is meaningless because history is forever; and the real fix is to stop using static keys at all (IRSA)',d:'Deactivate the key, verify via CloudTrail, then replace the whole pattern with short-lived IRSA credentials.',ok:true},
      {k:'C',t:'Make the repository private',d:'Restrict who can see the code.',ok:false,
       why:'The repository <i>is</i> already private — and it still has 41 collaborators, CI runners, and forks. "Private" is not a control against a credential that 41 people can read. Confidentiality of the repo was never the boundary; the key\'s validity is.'},
      {k:'D',t:'Rotate the GitHub token that allowed the push',d:'The push credential is the problem.',ok:false,
       why:'The GitHub token is not what leaked, and it grants nothing in AWS. You would be rotating an unrelated credential while a live key with S3FullAccess sits in main. Rotate the thing that is exposed.'},
    ],
    correctTitle:'✓ Correct — rotate first, then eliminate the pattern',
    correctBody:'<b>Git history is immutable in practice.</b> The moment a secret is committed and pushed, treat it as public forever: it is in 41 clones, in CI caches, in forks, in reflogs, in backups. You cannot recall it. The only thing you control is whether it still <i>works</i>.<br><br>So the order is non-negotiable: <b>deactivate the key first</b> (stop the bleeding), <b>then</b> establish what it did (CloudTrail), <b>then</b> remove the reason a static key existed at all.<br><br>And that last part is the real finding. Every other service at Meridian uses <b>IRSA</b> — the pod assumes an IAM role via its ServiceAccount and gets short-lived, auto-rotated credentials. There is no key to leak because there is no key. <span class="mono">kyc-api</span> was onboarded with a static key as a shortcut. <b>A secret that does not exist cannot be committed.</b>',
    fixNote:'Sequence matters and an auditor will check it: <b>1)</b> deactivate — do not delete yet, a deactivated key still yields CloudTrail history; <b>2)</b> prove scope of use; <b>3)</b> replace with IRSA so this class of leak becomes impossible; <b>4)</b> only then clean the repo and add scanning.',
    fixDiff:`# 1) STOP THE BLEEDING — deactivate immediately (do NOT delete yet: keep it for forensics)
$ aws iam update-access-key --access-key-id AKIA4XMPL7QK2VN9EXAMPLE \\
    --status Inactive --user-name kyc-service-user

# 2) ELIMINATE THE PATTERN — IRSA instead of a static key
clusters/prod/kyc/serviceaccount.yaml
 apiVersion: v1
 kind: ServiceAccount
 metadata:
   name: kyc-api
   namespace: kyc-prod
<span class="add">+  annotations:</span>
<span class="add">+    eks.amazonaws.com/role-arn: arn:aws:iam::4021:role/kyc-api-s3   # short-lived, auto-rotated</span>

deploy/apps/kyc-api/values.yaml
<span class="del">-envFrom:</span>
<span class="del">-  - secretRef:</span>
<span class="del">-      name: kyc-aws-static-key      # AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY</span>
<span class="add">+# no AWS credentials needed — the SDK reads the IRSA web identity token</span>

# 3) SCOPE IT DOWN while we are here (it never needed S3 *FullAccess*)
iam/kyc-api-s3-policy.json
<span class="del">-  "Resource": "*"                              # every bucket in the account</span>
<span class="add">+  "Resource": "arn:aws:s3:::meridian-kyc-docs/*"   # only its own bucket</span>

# 4) Clean up + prevent
$ aws iam delete-access-key --access-key-id AKIA...    # after forensics window
<span class="add">+ pre-commit: gitleaks   +  CI: gitleaks --redact  (block the push, not just alert)</span>`,
    shipLabel:'⬆ Deactivate → IRSA → scope → scan',
    shipOut:`$ aws iam update-access-key --access-key-id AKIA4XMPL7QK2VN9EXAMPLE --status Inactive --user-name kyc-service-user
<span class="add">→ key AKIA4XMPL… status: Inactive        ← the leaked key is now worthless (T+4m)</span>

$ gh pr create --title "security(kyc): migrate to IRSA, drop static AWS key" --reviewer security-team,platform-team
<span class="add">→ PR #1907  ✓ security-team  ✓ platform-team  ✓ CHG-4488 (P1 security) linked</span>
<span class="add">→ Argo CD sync → kyc-api pods recreated with web identity token</span>

$ kubectl exec -n kyc-prod deploy/kyc-api -- env | grep AWS
<span class="add">AWS_ROLE_ARN=arn:aws:iam::4021:role/kyc-api-s3</span>
<span class="add">AWS_WEB_IDENTITY_TOKEN_FILE=/var/run/secrets/eks.amazonaws.com/serviceaccount/token</span>
<span class="add">→ no AWS_ACCESS_KEY_ID anywhere. There is no key to leak. ✓</span>

$ kubectl logs -n kyc-prod -l app=kyc-api --tail=2
<span class="add">{"level":"info","msg":"document uploaded","bucket":"meridian-kyc-docs"}   ← works ✓</span>

$ aws s3 ls s3://meridian-ledger-exports --profile kyc-api-role
<span class="add">An error occurred (AccessDenied)          ← blast radius scoped to its own bucket ✓</span>`,
    shipNote:'Four minutes from page to a worthless key — that is the number the regulator cares about. But the durable win is the last two checks: there is now <b>no credential to leak</b>, and even the role it assumes can only touch its own bucket.',
    wrongLabel:'🧹 git rm + filter-branch + force-push',
    wrongTitle:'⚠ The key is still live — and you just rewrote shared history',
    wrongOut:`$ git rm kyc-api/values-prod.yaml && git commit -m "remove secret"
$ git filter-branch --force --index-filter 'git rm --cached --ignore-unmatch kyc-api/values-prod.yaml' HEAD
$ git push --force origin main
<span class="add">→ main rewritten. The secret is gone from the repo. Looks clean!</span>

<span class="del">→ aws iam get-access-key-last-used AKIA4XMPL…</span>
<span class="del">    LastUsedDate: 2026-07-17T04:22:00Z    ← STILL LIVE. STILL WORKING.</span>
<span class="del">→ 41 local clones still contain it in their reflog</span>
<span class="del">→ 3 forks still contain it. GitHub's cached views still contain it.</span>
<span class="del">→ CI cache on 6 runners still contains it</span>
<span class="del">→ …and you force-pushed main: 41 engineers' branches now diverge. Two teams blocked.</span>`,
    wrongNote:'This is the instinct almost everyone has, and it is <b>exactly backwards</b>. You spent 40 minutes making the repo <i>look</i> clean while the key kept working the entire time — an attacker with a clone from last week is unaffected by your history rewrite. Meanwhile you force-pushed a shared branch and broke 41 people\'s work. <b>A leaked secret is not a Git problem. It is a credential-validity problem.</b> Rotate first, in the first 60 seconds. Clean the repo later, calmly, if at all.',
    rcaModel:`What happened: At 04:07 IST our secret scanner detected a live AWS access key (AKIA4XMPL…) committed to the main branch of the kyc-api repository in commit 3f81a2c, six days earlier. The key belonged to IAM user kyc-service-user and carried AmazonS3FullAccess and AmazonRDSReadOnlyAccess. The repository is private but has 41 collaborators. No outage occurred.

Root cause: kyc-api was onboarded using a long-lived static IAM access key, injected via a Kubernetes Secret, at a time when the rest of the estate had already standardised on IRSA. Because a static key existed, it could be — and eventually was — pasted into a values file and committed. Every other service at Meridian has no credential to leak, because IRSA issues short-lived tokens automatically. The leak is a symptom; the static key is the root cause.

Contributing factor: the IAM user held S3FullAccess rather than access scoped to the kyc bucket, which unnecessarily widened the blast radius from one bucket to every bucket in the account.

Exposure assessment: CloudTrail for the full lifetime of the key shows all API calls originating from 10.4.21.88 — our own EKS node CIDR — with user agent aws-sdk-go/kyc-api. There are no calls from external source IPs and no anomalous API patterns. We assess with high confidence that the key was not used by an unauthorised party. We are explicitly not asserting that no third party obtained a copy: 41 collaborators, forks, and CI caches all had read access for six days, so we treat the key as compromised regardless of observed use.

Resolution:
- T+4m: key deactivated (set Inactive, not deleted, to preserve forensics).
- T+35m: CloudTrail review completed; no evidence of misuse.
- T+2h10m: kyc-api migrated to IRSA (ServiceAccount annotated with role ARN); static-key Secret removed; verified the pod carries no AWS_ACCESS_KEY_ID.
- T+2h40m: IAM policy scoped from S3FullAccess to arn:aws:s3:::meridian-kyc-docs/* only; verified access to other buckets is denied.
- T+3h40m: key deleted after the forensics window; gitleaks added to pre-commit and CI.
MTTR 3h40m; time-to-neutralise 4m.

Prevention:
1. MER-802 — gitleaks in pre-commit and as a blocking CI check. Detection at push time, not six days later. Blocking, not advisory.
2. MER-803 — audit the estate for any remaining static IAM keys; migrate all to IRSA. Ban long-lived keys by policy (SCP denying iam:CreateAccessKey outside break-glass).
3. MER-804 — enforce least privilege on IAM roles: no service gets *FullAccess. Scope to named resources.
4. MER-805 — onboarding checklist and template must make IRSA the default path. This key existed only because a shortcut was available; remove the shortcut.
5. MER-806 — document and drill the rotate-first runbook. The instinct to "clean the repo" first is common and wastes the only minutes that matter.`,
    feedback:'"Four minutes from page to Inactive. That is the number I will quote to the regulator, and it is the only number in this incident that was ever under our control.<br><br>You got the <b>order</b> right, which is the whole test. The overwhelming instinct — and I have watched senior people do this at 4am — is to reach for <span class=\'mono\'>git filter-branch</span> and make the repo look clean. Forty minutes later the repo is pristine, main is force-pushed, two teams are blocked, and <b>the key still works</b>. You understood immediately that a leaked secret is not a Git problem. It is a credential-validity problem. Rotate, then investigate, then tidy.<br><br>I also want to credit the sentence in your RCA: \'we assess no misuse, but we treat the key as compromised regardless.\' That is precisely the register. You did not overclaim safety you cannot prove, and you did not dramatise a breach we have no evidence of. Auditors read RCAs. That paragraph is why this stays a finding and not an escalation.<br><br>And the best part is that you refused to stop at rotation. You asked why a static key existed <i>at all</i> when the other twelve services here have nothing to leak. That is the fix. A secret that does not exist cannot be committed, cannot be scanned for, and cannot page us at 4am."',
    tickets:[
      ['P1','MER-802','gitleaks in pre-commit + blocking CI check'],
      ['P1','MER-803','Audit + migrate all remaining static IAM keys to IRSA; SCP-deny key creation'],
      ['P2','MER-804','No *FullAccess — scope every service role to named resources'],
      ['P2','MER-805','Onboarding template must default to IRSA'],
      ['P3','MER-806','Document + drill the rotate-first runbook'],
    ]
  },
  {
    id:'INC-4131', sev:'critical', alert:'ledger-staging namespace missing', svc:'ledger-api',
    title:'Who deleted the ledger-staging namespace?',
    paged:'15:18 IST', mttr:'1h 52m', skill:'Audit forensics · automation blast radius',
    teaches:'Automation with delete rights removes things no human would ever delete',
    impact:{
      business:'Ledger team blocked — no staging environment to validate the quarter-close release. Release at risk.',
      customer:'No production impact. But an environment vanished and, until we can say why, we cannot rule out prod being next.',
      rule:'Namespace ledger-staging: NotFound. Nobody admits to deleting it.'
    },
    cmds:{
      'kubectl get ns':{id:'ns',out:[
        ['NAME               STATUS   AGE','out'],
        ['payments-prod      Active   312d','out'],
        ['ledger-prod        Active   312d','out'],
        ['kyc-prod           Active   289d','out'],
        ['payments-staging   Active   312d','out'],
        ['data-prod          Active   247d','out'],
        ['','out'],
        ['💡 ledger-staging is simply GONE. And with it every PVC, Secret, and ConfigMap.','hi'],
      ]},
      'aws logs filter-log-events --log-group-name /aws/eks/meridian-prod/cluster --filter-pattern \'{ $.verb = "delete" && $.objectRef.resource = "namespaces" }\' --start-time 1752700000000':{id:'audit',out:[
        ['{','out'],
        ['  "verb": "delete",','out'],
        ['  "objectRef": { "resource": "namespaces", "name": "ledger-staging" },','hi'],
        ['  "user": {','out'],
        ['    "username": "system:serviceaccount:argocd:argocd-application-controller",','hi'],
        ['    "groups": ["system:serviceaccounts:argocd"]','out'],
        ['  },','out'],
        ['  "sourceIPs": ["10.4.19.203"],','out'],
        ['  "requestReceivedTimestamp": "2026-07-17T15:11:04Z",','out'],
        ['  "responseStatus": { "code": 200 }','out'],
        ['}','out'],
        ['','out'],
        ['💡 Not a human. ArgoCD did it. At 15:11. And the API said 200 — it was ALLOWED.','hi'],
      ]},
      'kubectl describe clusterrole argocd-application-controller | grep -A4 namespaces':{id:'role',out:[
        ['Resources    Non-Resource URLs   Resource Names   Verbs','out'],
        ['namespaces   []                  []               [get list watch create update delete]','hi'],
        ['*            []                  []               [get list watch create update patch delete]','hi'],
        ['','out'],
        ['💡 ArgoCD has delete on namespaces, cluster-wide. Nothing stops it removing prod.','hi'],
      ]},
      'git log --oneline -3 -- clusters/prod/ledger/':{id:'git',out:[
        ['a72fe91 chore: remove unused staging overlay','hi'],
        ['5c103d8 feat(ledger): quarter-close reconciliation','out'],
        ['','out'],
        ['💡 15:09 — someone deleted the staging overlay directory in Git,','hi'],
        ['   thinking they were tidying up a folder. ArgoCD synced 2 min later and','hi'],
        ['   pruned the real namespace. Git said it should not exist, so it stopped existing.','hi'],
      ]},
      'kubectl get application ledger -n argocd -o jsonpath="{.spec.syncPolicy}"':{id:'syncpolicy',out:[
        ['{"automated":{"prune":true,"selfHeal":true}}','hi'],
        ['','out'],
        ['💡 prune: true — "anything not in Git gets deleted". Including namespaces.','hi'],
        ['   No prune protection, no confirmation, no exception for namespaces.','hi'],
      ]},
    },
    aliases:{
      'kubectl get namespaces':'kubectl get ns',
      'kubectl describe clusterrole argocd-application-controller':'kubectl describe clusterrole argocd-application-controller | grep -A4 namespaces',
      'git log clusters/prod/ledger/':'git log --oneline -3 -- clusters/prod/ledger/',
      'kubectl get application ledger -n argocd -o yaml':'kubectl get application ledger -n argocd -o jsonpath="{.spec.syncPolicy}"',
    },
    evidence:'audit log names <b class="mono">argocd-application-controller</b>, not a human · response <b class="mono">200</b> (allowed) · ArgoCD holds <b class="mono">delete</b> on <b class="mono">namespaces</b> cluster-wide · commit <b class="mono">a72fe91</b> "remove unused staging overlay" landed 2 minutes earlier · syncPolicy has <b class="mono">prune: true</b>',
    choices:[
      {k:'A',t:'Someone deleted it maliciously',d:'An insider removed the environment.',ok:false,
       why:'The audit log is unambiguous: the caller was <b class="mono">system:serviceaccount:argocd:argocd-application-controller</b> from our own node CIDR. Reaching for malice when the audit log names a service account is how you start a witch-hunt and miss the actual control gap. Read the log.'},
      {k:'B',t:'ArgoCD pruned it — a directory was removed from Git, and the controller had cluster-wide delete on namespaces, so it did exactly what it was told',d:'Automation with delete rights removed an entire environment because a folder disappeared from a commit.',ok:true},
      {k:'C',t:'The cluster autoscaler removed it',d:'Node scaling took the namespace with it.',ok:false,
       why:'The autoscaler manages <i>nodes</i>, not API objects. It has no ability to delete a namespace and never appears in this audit trail. Namespaces are not scheduled onto nodes.'},
      {k:'D',t:'etcd corruption lost the object',d:'A storage-layer failure dropped the namespace.',ok:false,
       why:'Corruption does not produce a clean, authenticated <b class="mono">delete</b> verb with a 200 response and a named caller. We have a receipt showing a legitimate, authorised API call. The system did not fail — it obeyed.'},
    ],
    correctTitle:'✓ Correct — and nothing malfunctioned',
    correctBody:'That is what makes this incident worth your attention. <b>Every component did exactly what it was configured to do.</b> An engineer removed a directory they believed was unused. ArgoCD compared Git to the cluster, found a namespace that Git no longer described, and — holding <span class="mono">delete</span> on <span class="mono">namespaces</span> cluster-wide with <span class="mono">prune: true</span> — removed it. The API server checked RBAC, found the permission present, and returned <b class="mono">200</b>.<br><br>No bug. No malice. No failure. <b>A folder deletion in a PR became an environment deletion in production, because nothing in the chain thought a namespace deserved more ceremony than a ConfigMap.</b><br><br>And notice what the audit log bought you: within 90 seconds you knew <i>who</i> (a ServiceAccount, not a person), <i>when</i> (15:11:04), and <i>that it was allowed</i>. Without it you would still be interrogating colleagues.',
    fixNote:'Restore first, then remove the capability. The honest question is not "who did this" — it is <b>"why was this even possible?"</b> Automation should not be able to delete an environment because a folder vanished from a commit.',
    fixDiff:`# 1) RESTORE — re-add the overlay to Git and let ArgoCD rebuild it
$ git revert a72fe91 --no-edit && git push
<span class="warn">→ namespace + Deployments return… but PVC data does NOT. Restore from Velero:</span>
$ velero restore create --from-backup ledger-staging-daily-20260717

# 2) TAKE AWAY THE CAPABILITY — ArgoCD must not delete namespaces
clusters/prod/argocd/rbac.yaml
   - apiGroups: [""]
     resources: ["namespaces"]
<span class="del">-    verbs: ["get","list","watch","create","update","delete"]</span>
<span class="add">+    verbs: ["get","list","watch","create"]      # create yes, delete NEVER</span>

# 3) DEFENCE IN DEPTH — namespaces opt out of prune entirely
clusters/prod/ledger/namespace.yaml
 metadata:
   name: ledger-staging
<span class="add">+  annotations:</span>
<span class="add">+    argocd.argoproj.io/sync-options: Prune=false      # never auto-remove</span>

# 4) A LAST LINE — admission policy blocks it even if 2 and 3 fail
policies/deny-ns-delete.yaml  (Kyverno)
<span class="add">+  match: { resources: { kinds: ["Namespace"], operations: ["DELETE"] } }</span>
<span class="add">+  exclude: { subjects: [{ kind: Group, name: platform-break-glass }] }</span>
<span class="add">+  validate: { message: "Namespace deletion requires break-glass", deny: {} }</span>`,
    shipLabel:'⬆ Restore + revoke delete + Prune=false + admission policy',
    shipOut:`$ git revert a72fe91 --no-edit && git push
<span class="add">→ Argo CD  ledger  OutOfSync → Syncing → Synced ✓</span>
<span class="add">→ namespace/ledger-staging  created</span>
$ velero restore create --from-backup ledger-staging-daily-20260717
<span class="add">→ Restore completed: 14 PVCs, 9 Secrets, 22 ConfigMaps restored ✓</span>
<span class="add">→ ledger-api-6f8c9d2b1-x4kmp   1/1   Running   ← staging is back (T+1h52m)</span>

$ gh pr create --title "security: ArgoCD must not delete namespaces" --reviewer platform-team,security-team
<span class="add">→ PR #1934  ✓ platform-team  ✓ security-team  ✓ CHG-4502 linked → merged</span>

<span class="k"># prove the capability is gone — three independent layers:</span>
$ kubectl auth can-i delete namespaces --as=system:serviceaccount:argocd:argocd-application-controller
<span class="add">no                                          ← RBAC: revoked ✓</span>
$ kubectl get ns ledger-staging -o jsonpath='{.metadata.annotations}'
<span class="add">{"argocd.argoproj.io/sync-options":"Prune=false"}   ← prune: opted out ✓</span>
$ kubectl delete ns payments-staging --dry-run=server
<span class="add">Error: admission webhook "kyverno" denied: Namespace deletion requires break-glass  ← policy: blocked ✓</span>`,
    shipNote:'Three independent layers, each of which alone would have prevented this: RBAC no longer grants it, the namespace opts out of prune, and admission control refuses it regardless. Note that <b>Velero mattered more than the revert</b> — Git restored the shape of the environment; only the backup restored the data.',
    wrongLabel:'🔨 kubectl create namespace ledger-staging',
    wrongTitle:'⚠ You made an empty shell — and set up the next outage',
    wrongOut:`$ kubectl create namespace ledger-staging
namespace/ledger-staging created
<span class="add">→ It's back! …an empty namespace with nothing in it.</span>

<span class="del">→ 14 PVCs: still gone. Ledger staging data: still gone.</span>
<span class="del">→ 9 Secrets: still gone. Nothing can start.</span>
<span class="del">→ Git still says ledger-staging should not exist</span>
<span class="del">→ Argo CD next sync (3 min): prune: true → deletes it AGAIN</span>
<span class="del">→ ArgoCD still holds delete on namespaces. Nothing stops it doing this to ledger-PROD.</span>`,
    wrongNote:'Three failures in one command. You recreated a <b>shell</b> — namespaces do not carry PVCs or Secrets, so nothing can actually run. You fought Git instead of fixing it, so ArgoCD deletes it again within three minutes. And most importantly you left the capability untouched: <b>the automation that just deleted staging can still delete production the moment someone tidies the wrong folder.</b> The incident is not "a namespace is missing" — it is "we allow this to be possible."',
    rcaModel:`What happened: At 15:11 IST the ledger-staging namespace was deleted from meridian-prod, taking 14 PVCs, 9 Secrets, and 22 ConfigMaps with it. The ledger team lost their staging environment two days before quarter-close validation. No production impact. Nobody had knowingly deleted anything.

Root cause: Nothing malfunctioned. At 15:09 commit a72fe91 ("chore: remove unused staging overlay") deleted the clusters/prod/ledger/staging/ directory. The engineer believed they were removing a dead folder. Two minutes later ArgoCD reconciled: the ledger Application has syncPolicy prune: true, so any live object no longer described by Git is removed. The argocd-application-controller ClusterRole holds delete on namespaces cluster-wide, so the API server authorised the call and returned 200.

Every layer behaved exactly as configured. A directory deletion in a PR became an environment deletion in production because no control in the chain treated a namespace as more consequential than a ConfigMap.

Detection and attribution: The EKS audit log identified the caller (system:serviceaccount:argocd:argocd-application-controller), the timestamp (15:11:04Z), the source IP (10.4.19.203, our node CIDR), and the authorisation result (200) within 90 seconds of investigation. Without audit logging this would have been an unresolvable argument between teams. This is the control working.

Resolution:
- git revert a72fe91 restored the namespace and workload definitions.
- Velero restore from the daily backup recovered the 14 PVCs, 9 Secrets, and 22 ConfigMaps. Git restored the shape; only the backup restored the data. Had Velero not been running, this would have been permanent data loss.
- Removed delete on namespaces from the ArgoCD ClusterRole.
- Annotated namespaces with argocd.argoproj.io/sync-options: Prune=false.
- Added a Kyverno policy denying namespace DELETE except for the platform-break-glass group.
MTTR 1h52m.

Prevention:
1. MER-901 — ArgoCD ClusterRole must not include delete on namespaces. Automation may create environments; only a human with break-glass may destroy one. (Done.)
2. MER-902 — Prune=false on all namespaces and PVCs across every Application. Pruning is right for Deployments; it is not right for anything holding state. (Done.)
3. MER-903 — Kyverno admission policy denying namespace deletion outside break-glass, as a final independent layer. (Done.)
4. MER-904 — CI must render the diff of a PR's destructive effects ("this PR will DELETE: namespace/ledger-staging, 14 PVCs") and require an explicit approval label. a72fe91 was reviewed and approved by two people; the PR looked like a folder removal, because that is all a reviewer can see today. Make the blast radius visible at review time.
5. MER-905 — verify Velero backup restores for every namespace monthly. We were one working backup away from permanent loss of a regulated environment, and we had not tested a restore in 90 days.`,
    feedback:'"Ninety seconds from \'the namespace is gone\' to naming the exact caller, timestamp, and authorisation result. That is what seven years of audit retention is <i>for</i>, and it is the difference between an RCA and a witch-hunt. I have watched teams burn two days and a great deal of trust arguing about who ran what. You opened the log.<br><br>And you did not take the bait. \'Nobody admits to deleting it\' pulls hard toward malice or blame. The answer was that <b>nothing malfunctioned and nobody did anything wrong</b> — a tidy-up commit, a controller doing precisely its job, an API server correctly authorising a permission we had granted. That is the most uncomfortable kind of incident, because there is no villain to point at. There is only a capability we should never have handed out.<br><br>Your instinct to reach for Velero rather than declaring victory at <span class=\'mono\'>git revert</span> is what actually saved the ledger team. Git restored the <i>shape</i> of that environment. Only the backup restored the <i>data</i>. Sit with how close that was — MER-905 says we had not tested a restore in 90 days. We were one untested backup away from permanently losing a regulated environment.<br><br>But MER-904 is the ticket that shows me you are ready for Principal. Two people <b>approved</b> a72fe91. They were not careless — the PR genuinely looked like deleting an unused folder. <b>The review surface hid the blast radius.</b> Making CI say \'this PR will DELETE namespace/ledger-staging and 14 PVCs\' fixes the entire class, not this instance. That is the difference between fixing an incident and fixing the system that produced it.<br><br>One more thing, and then I will stop. The same controller that deleted staging could have deleted <span class=\'mono\'>ledger-prod</span>. Same permission, same prune policy, same two-minute reconcile. We found out on the cheapest possible environment, two days before quarter-close, with a working backup. <b>That was luck, not design.</b> You have now converted that luck into three independent controls. Well done."',
    tickets:[
      ['P1','MER-901','ArgoCD must not hold delete on namespaces'],
      ['P1','MER-905','Test Velero restores monthly — 90 days untested is a fiction'],
      ['P1','MER-904','CI must surface destructive effects of a PR + require explicit approval'],
      ['P2','MER-902','Prune=false on all namespaces and PVCs'],
      ['P2','MER-903','Kyverno: deny namespace deletion outside break-glass'],
    ]
  },
  ]
};
