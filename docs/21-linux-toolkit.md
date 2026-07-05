# 21 — Linux: the ground everything runs on

> **Core question:** Every container, pod, pipeline, and server ultimately runs on a Linux process — can you navigate, interrogate, and fix one under pressure?

> **⏱️ Time:** ~50 min · **🎚️ Level:** Beginner→Intermediate · **📋 Pehle chahiye:** [00a Pre-flight](00a-preflight.md)
>
> **Is chapter ke baad tum kar paoge:**
> - Navigate, read, and edit files and directories with confidence in any Linux environment
> - Debug a slow or unresponsive server using the golden five-command flow
> - Use pipes and text tools to mine any log file for errors, counts, and top offenders
>
> **How to use:** ek terminal khol ke har command khud chalao — reading ≠ knowing.

---

> ### ↩️ Recall gate
> Pehle memory se jawab do, phir kholo.
>
> 1. *(00a)* What is a shell — and what is the difference between a shell and a terminal?
> 2. *(00a)* What is the difference between an absolute path and a relative path?
> 3. *(00a)* What is `stdout` — and how is it different from `stderr`?
>
> <details markdown="1"><summary>Jawab dekho</summary>
>
> 1. A **terminal** is the window you type in. A **shell** is the program running inside it (Bash, Zsh, sh) that interprets commands and returns output. The terminal is UI; the shell is the interpreter.
>
> 2. An **absolute path** starts from root `/` and works from anywhere: `/etc/nginx/nginx.conf`. A **relative path** is relative to your current directory: `./scripts/deploy.sh`. `pwd` shows your current position.
>
> 3. **stdout** (file descriptor 1) carries normal output. **stderr** (file descriptor 2) carries error messages. Both print to the screen by default. You can separate them: `cmd 2>/dev/null` silences errors; `cmd 2>&1` merges both into stdout for capture.
>
> </details>

---

## Navigation & finding things

First thing you do on any unknown server: orient yourself.

| Command | What it does | Why you need it |
|---------|-------------|-----------------|
| `pwd` | Print current directory | Baseline — where am I? |
| `ls -lah` | Long, all (hidden files), human-readable sizes | See everything including dotfiles |
| `cd /var/log` | Change directory | Move around the filesystem |
| `cd -` | Go to previous directory | Toggle between two locations |
| `cd ~` | Go home | Back to your user's home directory |
| `tree -L 2` | Visual tree, 2 levels deep | Quick structural overview of a project |
| `find / -name "*.log" 2>/dev/null` | Walk the tree, filter by name, suppress errors | Find any file when you don't know where it lives |
| `find . -type f -mtime -1` | Files modified in the last 24 hours | What changed recently? |
| `find . -size +100M` | Files bigger than 100 MB | **Disk-full culprit hunt** |
| `which kubectl` | Full path of a binary | Is it installed? Which one am I running? |
| `locate nginx.conf` | Instant index-based search | Fast — but the index (`updatedb`) may be stale |

> 🎤 **Interview one-liner:** "`find` walks the filesystem live with filters — name, size, mtime, type. `locate` is instant but uses a prebuilt index that may lag. When the disk is full, `find . -size +100M` is your first move."

> 🇮🇳 **Hinglish intuition:** `find` ek real-time detective hai — koi bhi file dhundh ke deta hai. `locate` ek phone directory hai — tez hai par puraani ho sakti hai. Disk full? `find . -size +100M` seedha chor ko pakadta hai.

---

## Viewing & searching content

Log files are how servers talk to you. Reading them well is half of incident response.

| Command | What it does |
|---------|-------------|
| `cat file` | Dump whole file to screen (small files only) |
| `less file` | Paginated view — `/pattern` to search, `q` to quit |
| `head -n 20 file` | First 20 lines |
| `tail -n 20 file` | Last 20 lines |
| `tail -f app.log` | **Follow live** — new lines appear as they are written |
| `grep "ERROR" app.log` | Filter lines matching a pattern |
| `grep -ri "timeout" /etc` | Recursive, case-insensitive — search a whole directory |
| `grep -c "500" access.log` | Count matching lines only |
| `grep -A3 -B1 "panic" app.log` | 3 lines after + 1 before each match — stack-trace context |

> 🎤 **Interview one-liner:** "`tail -f` watches a log live while a bug happens. `grep -A3 -B1` gives context around the match — critical for stack traces where the useful line is two lines above the word ERROR."

> 🇮🇳 **Hinglish intuition:** `tail -f` ek live TV channel hai. `grep` ek remote hai — sirf wahi dikhao jo chahiye. Dono saath mein: `tail -f app.log | grep ERROR` — live error-only feed, baaki sab mute.

---

## File operations

| Command | What it does | Notes |
|---------|-------------|-------|
| `mkdir -p a/b/c` | Create nested directories in one shot | `-p` creates parents if missing |
| `touch file.txt` | Create empty file or update timestamp | |
| `cp -r src/ dst/` | Copy directory recursively | |
| `mv old new` | Move or rename — works across paths | |
| `rm -rf dir/` | Delete recursively, no confirmation prompt | **No undo — be certain before running** |
| `ln -s /real/path link` | Create a symbolic link | Used for config files and versioned binaries |

> ⚠️ `rm -rf` has no recycle bin. A misplaced `rm -rf /` or `rm -rf ./*` on a production server is irreversible. Always `pwd` and `ls` before running it.

---

## Permissions — know this cold

Every file on Linux has three permission sets — **owner**, **group**, **others** — each with three bits: **r**ead (4), **w**rite (2), e**x**ecute (1).

```
  -rwxr-xr--
  │├──┤├──┤├──┤
  ││  ││  │└── others: r-- = 4
  ││  │└──┘ group:   r-x = 5
  │└──┘ owner:  rwx = 7
  └── file type: - = regular, d = directory, l = symlink
```

**The addition rule:** 7 = 4+2+1 (rwx) · 6 = 4+2+0 (rw-) · 5 = 4+0+1 (r-x) · 4 = 4+0+0 (r--)

| Mode | Symbolic | Owner | Group | Others | Standard use |
|------|----------|-------|-------|--------|--------------|
| `755` | rwxr-xr-x | rwx | r-x | r-x | Scripts, directories |
| `644` | rw-r--r-- | rw- | r-- | r-- | Config files, static assets |
| `600` | rw------- | rw- | --- | --- | SSH private keys, secrets |
| `777` | rwxrwxrwx | rwx | rwx | rwx | **Never in production** |

```bash
chmod 755 script.sh         # make a script executable by all users
chmod +x script.sh          # symbolic: add execute bit to existing permissions
chmod -R 644 config/        # set 644 recursively on all files in a directory
chown devuser:appgroup file  # change owner and group
chown -R devuser app/        # recursive ownership change
umask                        # show the default permission mask for new files
```

> 🎤 **Interview one-liner:** "r=4, w=2, x=1. 755 = owner full access, everyone else read+execute — standard for scripts. 644 = owner read-write, everyone else read-only — standard for config files. chmod 777 is a security hole: any process on the system can overwrite or execute the file."

> 🇮🇳 **Hinglish intuition:** Teen groups ke liye teen daraaze. r=4 padhna, w=2 likhna, x=1 chalana. 755 matlab owner ke paas master key hai; baaki sirf ander aa sakte hain — kuch change nahi kar sakte.

---

## Users, groups & sudo

| Command | What it does |
|---------|-------------|
| `whoami` | Current username |
| `id` | UID, GID, and all group memberships |
| `sudo command` | Run one command as root |
| `su - user` | Switch to another user (full login environment) |
| `sudo useradd -m user` | Create a user with a home directory |
| `sudo passwd user` | Set or change a password |
| `sudo usermod -aG docker user` | Add user to a group (docker, sudo, etc.) |
| `groups user` | List all groups a user belongs to |
| `cat /etc/passwd` | All user accounts on the system |
| `cat /etc/group` | All groups and their members |

> 🎤 **Interview one-liner:** "`sudo usermod -aG docker user` adds a user to the docker group so they can run Docker without `sudo`. The `-a` flag **appends** — omitting it would **replace** all group memberships, locking the user out of other groups."

---

## Processes

A **process** is any running program. Every container, every service, every script is a process with a PID (Process ID). Knowing how to find and control processes is the core of incident response.

| Command | What it does |
|---------|-------------|
| `ps aux` | Snapshot of all processes — user, PID, CPU%, MEM%, command |
| `ps aux \| grep nginx` | Find a specific process by name |
| `top` | Live monitor — CPU and memory per process, updated every second |
| `htop` | Colour-coded `top` with mouse support (install separately) |
| `kill <PID>` | Send SIGTERM (15) — polite shutdown request |
| `kill -9 <PID>` | Send SIGKILL — forced, immediate, no cleanup |
| `pkill -f "python app"` | Kill all processes matching a name or pattern |
| `nohup ./run.sh &` | Run in background, survives terminal close |
| `jobs` / `fg` / `bg` | List / foreground / background shell jobs |

**Signal numbers every engineer must know:**

| Signal | Number | Meaning |
|--------|--------|---------|
| SIGHUP | 1 | Reload config — most daemons restart cleanly on `kill -1` |
| SIGTERM | 15 | Polite shutdown — app can flush data, close connections, then exit |
| SIGKILL | 9 | Forced kill by the kernel — no cleanup, no ceremony |

> 🎤 **Interview one-liner:** "Always try SIGTERM first — just `kill <PID>`. SIGKILL is the last resort because it skips cleanup: open files can be left corrupt and database connections abandoned."

> Containers are Linux processes wrapped in namespaces and cgroups — see [M3 Docker](04-M3-docker.md) for how Docker uses these primitives, and [M9](11-M9-advanced-k8s-internals.md) for how Kubernetes orchestrates them at scale.

---

## System & resources — the debug flow

This is the section most directly tied to incident response. Each command answers one specific diagnostic question.

| Command | What it shows | Incident question it answers |
|---------|--------------|------------------------------|
| `top` | CPU and memory per process, load average, system totals | "What process is burning CPU or RAM?" |
| `df -h` | Disk used/free per filesystem, human-readable | "Is the disk full?" |
| `df -i` | Inode usage per filesystem | "Disk shows space but writes fail?" |
| `du -sh *` | Size of each item in the current directory | "Which directory is the bloat?" |
| `du -sh /var/log` | Total size of a specific path | "How big are my logs?" |
| `free -h` | RAM: total, used, free, buffers/cache, swap used | "Are we swapping? Is OOM near?" |
| `uptime` | Load average (1 / 5 / 15 min) + uptime | "Is load > core count?" (overloaded) |
| `nproc` | Number of CPU cores | Context for interpreting load average |
| `uname -a` | Kernel version, hostname, architecture | "What OS and kernel is this exactly?" |

> 🎤 **Interview one-liner:** "When a server is slow or down I run `top` (CPU/mem spike?), `df -h` (disk full?), `free -h` (swapping?), `journalctl -xe` (recent errors), and `ss -tulnp` (port conflict?). That five-command sequence covers 90% of real incidents."

> ⚠️ **The inode trap:** `df -h` can show gigabytes free while the disk is "full" — if you have millions of tiny files (log fragments, temp files, cache entries), **inodes** (filesystem metadata slots) can be exhausted even with free block space. Always check `df -i` when `df -h` looks healthy but writes are failing.

See [M8 Observability](10-M8-observability-sre.md) for the monitoring-layer view of the same problems — what you are doing manually here, Prometheus + Grafana does automatically and continuously.

---

## Networking

Every connection, every port, every DNS query is inspectable from the command line.

| Command | What it does | When to use it |
|---------|-------------|----------------|
| `ip a` | All network interfaces and assigned IPs | "What IP does this host have?" |
| `ss -tulnp` | All listening sockets: protocol, port, PID, process name | "What is listening on port X?" |
| `ping host` | ICMP reachability — round-trip time | "Is this host alive on the network?" |
| `curl -I https://site` | HTTP headers only — shows status code fast | "Is the web server responding?" |
| `curl -v http://svc:8080` | Full verbose request + response trace | "Why can't I reach this service?" |
| `wget url` | Download a file over HTTP/HTTPS | Fetch artefacts, test download paths |
| `dig example.com` | Full DNS resolution chain | "Is DNS resolving correctly?" |
| `nslookup example.com` | Simple DNS query | Quick lookup — faster to type than dig |
| `nc -zv host 5432` | Test TCP port reachability without sending data | "Can I reach the database port?" |
| `traceroute host` | Each routing hop on the path | "Where is the packet being dropped?" |

> 🎤 **Interview one-liner:** "`ss -tulnp` is the first command for 'port already in use' — it shows every listening port and the PID that owns it. `curl -v` and `nc -zv` test whether a remote port is actually reachable, which separates network/firewall problems from application problems."

> 🇮🇳 **Hinglish intuition:** `ss -tulnp` ek building directory hai — kaun sa process kaun si window pe baith ke sun raha hai. `nc -zv host port` ek door knock hai — khuli hai ya nahi. `curl -v` ek poori conversation hai — andar jao, poochho, jawab suno.

---

## Packages & services

| Command | What it does |
|---------|-------------|
| `sudo apt update` | Refresh package index (Debian/Ubuntu) |
| `sudo apt install -y nginx` | Install without interactive confirmation |
| `sudo apt remove nginx` | Uninstall a package |
| `apt list --installed` | List all installed packages |
| `sudo dnf install -y nginx` | Install on RHEL / Fedora / Amazon Linux |
| `sudo systemctl start nginx` | Start a service right now |
| `sudo systemctl stop nginx` | Stop a service |
| `sudo systemctl restart nginx` | Stop + start (pick up config changes) |
| `sudo systemctl enable nginx` | Start automatically on every boot |
| `sudo systemctl status nginx` | Current state + last few log lines |
| `journalctl -u nginx -f` | Follow a service's log output live |
| `journalctl -u nginx --since "10 min ago"` | Recent logs for a specific service |
| `journalctl -xe` | System-wide recent errors with context |

> 🎤 **Interview one-liner:** "`systemctl enable` means 'start on every boot'. `systemctl start` means 'start right now'. You need both on a new server. `journalctl -u <service> -f` is the first look when a service won't start — it shows the exact error before the process died."

> For the error-response reflex for common service failures see [16 Appendix](16-reference-appendix.md). For the full observability stack built on top of these logs see [M8](10-M8-observability-sre.md).

---

## Text processing & pipes — the Unix superpower

Unix philosophy: small tools, each doing one thing, chained with `|`. The combination is more powerful than any single application.

```bash
# Count 500 errors in an access log
cat access.log | grep "500" | wc -l

# Frequency table — most common items first
sort file | uniq -c | sort -rn

# Top IPs hitting a web server (field 1 of Apache/nginx access log)
awk '{print $1}' access.log | sort | uniq -c | sort -rn | head -10

# Find-and-replace across a file
sed 's/old_value/new_value/g' config.template > config.final

# Extract a column by delimiter (field 1 of /etc/passwd = usernames)
cut -d: -f1 /etc/passwd

# Pull a specific field from structured log lines
grep "ERROR" app.log | awk '{print $4}'
```

| Tool | One job |
|------|---------|
| `grep` | Filter lines by pattern |
| `awk` | Extract columns / arithmetic on fields |
| `sed` | Find-and-replace in a byte stream |
| `cut` | Extract columns by delimiter |
| `sort` | Sort lines lexicographically or numerically |
| `uniq -c` | Count consecutive duplicates (always `sort` first) |
| `wc -l` | Count lines |
| `head -N` / `tail -N` | First / last N lines of a stream |

> 🎤 **Interview one-liner:** "`sort | uniq -c | sort -rn | head` is the frequency-table recipe — it turns any log into a ranked list of top errors, IPs, or status codes in one pipeline. Stick it on any stream."

> 🇮🇳 **Hinglish intuition:** Pipes ek assembly line hain. `grep` filter karta hai, `awk` column nikalti hai, `sort|uniq -c` ginne wala hai, `sort -rn` bada pehle laata hai. Chain bano — bada kaam chhota ho jaata hai.

---

## Archives & transfer

```bash
# Create a compressed archive
tar -czf backup.tar.gz dir/

# Extract an archive
tar -xzf backup.tar.gz

# List archive contents without extracting
tar -tzf backup.tar.gz

# Copy a file to a remote host over SSH
scp file.txt user@host:/remote/path/

# Sync a directory (only changed files, preserves permissions)
rsync -avz src/ user@host:/dst/
```

`tar` flags decoded: `-c` create · `-x` extract · `-z` gzip compression · `-f` filename follows · `-v` verbose output.

`rsync -avz` is preferred over `scp` for directories — it sends only diffs, preserves attributes (`-a`), compresses in transit (`-z`), and shows progress (`-v`). On large deployments the bandwidth savings are significant.

---

## Environment & shell

```bash
echo $PATH            # colon-separated directories the shell searches for commands
export API_KEY=abc    # set an env var visible to this shell and all child processes
env                   # print every environment variable currently set
alias ll='ls -lah'    # create a shorthand (add to ~/.bashrc to persist across sessions)
history               # numbered list of past commands
!123                  # re-run history entry 123
Ctrl+R                # reverse-search history — type part of a past command
man ls                # full manual page (q to quit)
ls --help             # short inline help for most commands
```

> ⚠️ `export VAR=value` sets the variable for the **current session only**. To persist, add it to `~/.bashrc` (user) or `/etc/environment` (system-wide). Without `export`, child processes (scripts, subshells) cannot see the variable — a common source of "env var works in terminal but not in my script" confusion.

---

## The golden debug flow

When someone says "the server is slow" or "my service is down", this sequence covers 90% of real incidents. Run them in order — each either finds the problem or rules it out.

```bash
# Step 1 — Is CPU spiking? Which process owns it?
top
# Press 'P' to sort by CPU usage, 'M' for memory, 'q' to quit.
# Watch for a process at 99% CPU or total load > nproc output.

# Step 2 — Is the disk full?
df -h
# Any filesystem at 100% Use%? Disk full = writes fail = services crash.
# Drill down: du -sh /var/* 2>/dev/null | sort -rh | head -10

# Step 2b — Are inodes exhausted? (disk "full" with space remaining)
df -i
# If IUse% is 100% on any filesystem, you have inode exhaustion — not block exhaustion.
# Find the flood: find /tmp -type f | wc -l

# Step 3 — Are we out of memory or swapping heavily?
free -h
# Check the 'available' column. Near zero + swap in use = OOM is imminent.
# Kubernetes calls this OOMKilled (exit code 137).

# Step 4 — What did the service log right before it died?
journalctl -xe
# Or for a specific service:
journalctl -u myservice --since "15 min ago"

# Step 5 — Is something unexpected listening, or is the port already taken?
ss -tulnp
# Shows every listening port and the PID + process name that owns it.
```

**The decision tree:**

```
top
  └── CPU/mem spike found? → identify PID, kill or investigate
  └── No spike?
        df -h
          └── Filesystem at 100%? → du -sh to find bloat, delete or rotate
          └── Looks ok?
                df -i
                  └── IUse% at 100%? → find and delete the tiny-file storm
                  └── Looks ok?
                        free -h
                          └── Available near zero? → OOM risk; reduce load or add memory
                          └── Ok?
                                journalctl -xe
                                  └── Error found? → fix the root cause
                                  └── No obvious error?
                                        ss -tulnp
                                          └── Wrong port or unexpected listener? → kill/reconfigure
                                          └── All clear → application-level bug; check app logs
```

> 🇮🇳 **Hinglish intuition:** Yeh flow ek doctor ka checkup hai. Pehle pulse (`top`), phir breathing (`df -h`), phir blood pressure (`free -h`), phir patient ki history (`journalctl`), phir sunna stethoscope se (`ss -tulnp`). Sab normal? Toh application ka bug hai — logs mein jao.

This debug flow is the manual version of what [M8 Observability](10-M8-observability-sre.md) automates at scale. See [the connected system diagram](09-connected-system.md) for how the Linux layer relates to every layer above it.

---

## Small but important

Commonly missed in tutorials, constantly used in real work:

| Pattern | What it does | Why it matters |
|---------|-------------|----------------|
| `cmd1 && cmd2` | Run `cmd2` only if `cmd1` exits 0 (success) | `apt update && apt install` — don't install from a stale index |
| `cmd1 \|\| cmd2` | Run `cmd2` only if `cmd1` fails | Fallback / default logic in scripts |
| `cmd1 ; cmd2` | Run `cmd2` always, regardless of `cmd1` outcome | Fire-and-forget sequencing |
| `echo hi > f` | Overwrite file with stdout | Creates or truncates — destructive |
| `echo hi >> f` | Append stdout to existing file | Add without destroying prior content |
| `cmd 2>&1 \| tee out.log` | Merge stderr into stdout, print live AND save to file | Capture full output during long runs |
| `find . -name "*.log" \| xargs rm` | Feed output lines as arguments to another command | Bulk operations when a glob won't reach |
| `watch -n2 'df -h'` | Re-run a command every 2 seconds | Monitor disk / memory without polling manually |
| `df -i` | Show inode usage | A disk can be "full" on inodes with free block space |
| `crontab -e` | Edit the current user's cron schedule | Recurring jobs: `MIN HOUR DOM MON DOW command` |
| `sudo !!` | Re-run the previous command with sudo prepended | "Permission denied" → `sudo !!` saves retyping the whole command |

**Signal quick-reference:**

| Signal | Number | `kill` syntax | App reaction |
|--------|--------|---------------|--------------|
| SIGHUP | 1 | `kill -1 <PID>` | Reload config (most daemons) |
| SIGTERM | 15 | `kill <PID>` | Graceful shutdown — flush, close, exit cleanly |
| SIGKILL | 9 | `kill -9 <PID>` | Immediate forced kill — no cleanup possible |

---

## Hands-on lab

No cloud account needed. Use WSL, a local VM, or `docker run -it ubuntu bash`.

**Drill 1 — Disk-full investigation**

```bash
# Where is disk space going?
df -h
# Find the biggest directories under /var
du -sh /var/* 2>/dev/null | sort -rh | head -10
# Find any file over 100 MB
find /var/log -size +100M 2>/dev/null
# Check inodes too
df -i
```

**Drill 2 — Service down diagnosis**

```bash
# Check a service's current state
sudo systemctl status nginx
# Read its recent log output
journalctl -u nginx --since "10 min ago"
# If nginx is not installed, list running services instead
systemctl list-units --type=service --state=running | head -10
```

**Drill 3 — Port conflict**

```bash
# What is listening on port 8080?
ss -tulnp | grep :8080
# What is listening on all ports?
ss -tulnp
# Cross-reference a PID to a process name
ps aux | grep <PID>
```

**Drill 4 — CPU and memory snapshot**

```bash
# Open top — press 'P' (CPU sort), 'M' (memory sort), 'q' (quit)
top

# Memory breakdown
free -h

# Load average vs core count — if load-1min > nproc, system is overloaded
uptime
nproc
```

**Drill 5 — Log mining with pipes**

```bash
# Count 404 errors in nginx access log
grep "404" /var/log/nginx/access.log 2>/dev/null | wc -l

# Frequency table of HTTP status codes (field 9 in nginx combined format)
awk '{print $9}' /var/log/nginx/access.log 2>/dev/null \
  | sort | uniq -c | sort -rn

# If no web server, scan auth log for failed logins
grep "Failed" /var/log/auth.log 2>/dev/null | tail -20
```

**✅ Sahi hua to aisa dikhega:**

- **Drill 1:** `df -h` prints a table with `Use%` per filesystem. `find /var/log -size +100M` either returns file paths (you found the culprits) or prints nothing (no large files — both are valid outcomes). `df -i` shows inode usage — anything near 100% is a problem worth investigating.
- **Drill 3:** `ss -tulnp | grep :8080` returns a line including a PID and process name if something is listening on 8080, or no output if the port is free. You can identify the process from the PID column.
- **Drill 4:** `top` opens a live display; sorting by CPU/memory puts the heaviest process at the top. `uptime` shows three load numbers — compare the first to `nproc`. Load exceeding core count means the system cannot service all queued work.
- **Drill 5:** Each `awk | sort | uniq -c | sort -rn` pipeline produces a ranked frequency table. If no matching log file exists, the command exits cleanly with no output — that is also a correct result.

---

## Summary

| Topic | The one thing to remember |
|-------|--------------------------|
| Navigation | `find . -size +100M` for disk culprits; `ls -lah` to see everything including hidden files |
| Permissions | r=4, w=2, x=1 · 755 for scripts · 644 for configs · 600 for secrets · never 777 |
| Processes | `kill` = SIGTERM (graceful) · `kill -9` = SIGKILL (last resort) · `ps aux \| grep` to find PIDs |
| Debug flow | `top → df -h → df -i → free -h → journalctl -xe → ss -tulnp` covers 90% of incidents |
| Networking | `ss -tulnp` = who is listening where · `curl -v` + `nc -zv` = is the port reachable |
| Services | `enable` = on boot · `start` = right now · `journalctl -u svc -f` = live logs |
| Pipes | `sort \| uniq -c \| sort -rn \| head` = frequency table from any byte stream |
| Gotchas | `df -i` for inodes · `&&` vs `;` in scripts · `export` makes vars visible to children · `sudo !!` to retry |

---

## Self-check quiz

**Pehle memory se jawab do.**

1. What does `chmod 644 file.txt` allow — and who can write to that file?
2. You run `kill 1234` but the process does not die. What do you try next, and why is it a last resort?
3. `df -h` shows 2 GB free on `/var`. Your application still cannot write a file there. What do you check?
4. A service crashed 3 minutes ago. What single command shows its log output from the last 5 minutes?
5. `ss -tulnp` shows a process on port 8080 that should not be there. What are your next two steps?
6. You need a command to run every night at 2 AM. What tool do you use, and what does the schedule field look like?
7. What is the difference between `cmd1 && cmd2` and `cmd1 ; cmd2`?

<details markdown="1"><summary>Jawab dekho</summary>

1. `644` = owner rw-, group r--, others r--. **Only the owner can write.** Group and others can only read. This is the standard for config files — world-readable but not world-writable.

2. Try `kill -9 <PID>` (SIGKILL). It is a last resort because it bypasses the application's cleanup code — open file handles may not be flushed, database connections not closed, in-flight transactions not rolled back. Use it only when the process genuinely refuses to terminate gracefully.

3. Check **inode exhaustion**: `df -i`. If `IUse%` is at 100% on `/var`, the filesystem has no free inode slots even though block space is available. This happens when millions of small files accumulate. Find and delete the file storm: `find /var -type f | wc -l` to quantify, then investigate subdirectories.

4. `journalctl -u <service-name> --since "5 min ago"` — or `journalctl -u <service-name> -n 100` for the last 100 lines regardless of time.

5. First: **identify** — `ps aux | grep <PID>` to see what the process actually is. Second: **act** — if it is a known conflicting service, `systemctl stop <service>`. If it is an unknown process, investigate before killing it.

6. Use `crontab -e`. An entry for 2 AM daily: `0 2 * * * /path/to/script.sh`. Fields left to right: minute (0), hour (2), day-of-month (*), month (*), day-of-week (*).

7. `&&` is **conditional** — `cmd2` runs only if `cmd1` exits with code 0 (success). `;` is **unconditional** — `cmd2` runs regardless. In scripts, `&&` prevents cascading failures; `;` is "do both no matter what." In CI pipelines `&&` is almost always what you want.

</details>

---

## Interview questions

**1. What is the difference between a soft link (symlink) and a hard link?**
A symlink points to a **path** — if the original file moves or is deleted, the symlink breaks and returns "No such file or directory." A hard link points directly to the **inode** (the actual data on disk) — the data persists until every hard link to it is removed. Hard links cannot span filesystems; symlinks can. In practice, symlinks are far more common and are used heavily for versioned binaries and config files.

**2. Why is `chmod 777` a security problem?**
It grants every user on the system — including any compromised web process, container escape, or rogue script — full read, write, and execute access. Least-privilege principle: scripts should be `755` (executable, not writable by others), config files `644`, secret files `600`. `777` is the "I'll fix permissions later" setting that never gets fixed.

**3. What is the difference between SIGTERM and SIGKILL?**
SIGTERM (signal 15, default `kill`) is a polite request — the process catches it, runs cleanup code, closes connections, flushes buffers, and exits gracefully. SIGKILL (signal 9, `kill -9`) is enforced directly by the kernel — the process has no chance to clean up. Always try SIGTERM first. Use SIGKILL only when the process is truly hung.

**4. How do you find the largest files on a filesystem?**
Start with `df -h` to identify which filesystem is full. Then `du -sh /path/* 2>/dev/null | sort -rh | head -10` to drill into directories. For individual files: `find / -size +100M 2>/dev/null`. The `2>/dev/null` suppresses permission-denied noise.

**5. How do you find what is listening on a specific port?**
`ss -tulnp | grep :8080`. The output includes protocol, local address, PID, and process name. You can then `ps aux | grep <PID>` for more detail or `kill <PID>` to stop it.

**6. What is the difference between an environment variable and a shell variable?**
A shell variable (`VAR=value`) is local to the current shell — child processes and scripts cannot see it. An environment variable (`export VAR=value`) is inherited by all child processes (scripts, subshells, programs launched from the shell). In Docker and Kubernetes, all runtime config is passed as environment variables — which is why `export` matters so much in automation.

**7. Where are system logs and what is the modern way to read them?**
Traditional text logs live in `/var/log/` (`syslog`, `auth.log`, `kern.log`). On all modern systemd-based Linux (Ubuntu 16+, RHEL 7+, Debian 8+), the primary store is the **journal** — read with `journalctl`. Use `journalctl -u <service>` for a specific service, `journalctl -xe` for recent system errors, `journalctl -f` to follow live.

**8. What does load average mean and when is it "too high"?**
Load average (shown by `uptime`) is the average number of processes **waiting for CPU time** over the last 1, 5, and 15 minutes. Compare to `nproc` (core count). Load equal to core count = 100% busy but keeping up. Load greater than core count = processes are queueing — the system cannot service demand. A 1-minute load of 8.0 on a 4-core machine means processes are waiting on average twice as long as they should.

---

## 20-second cheat-sheet

```
NAVIGATE    pwd  ls -lah  cd /path  cd -  find . -size +100M  which cmd
VIEW        tail -f  less  grep -ri  grep -A3 -B1 "pattern" file
PERMISSIONS r=4 w=2 x=1 | 755=scripts  644=files  600=secrets  never 777
PROCESSES   ps aux|grep  top(P=cpu M=mem)  kill(TERM)  kill -9(KILL)
DEBUG FLOW  top → df -h → df -i → free -h → journalctl -xe → ss -tulnp
NETWORK     ss -tulnp  curl -v  nc -zv host port  dig  traceroute
SERVICES    systemctl start|enable|status  journalctl -u svc -f
PIPES       grep | awk | sort | uniq -c | sort -rn | head    wc -l  sed  cut
ARCHIVES    tar -czf out.tgz dir/    tar -xzf file.tgz    rsync -avz src/ dst/
SMALL BITS  && vs ;    2>&1|tee    xargs    watch -n2    df -i    sudo !!
```
