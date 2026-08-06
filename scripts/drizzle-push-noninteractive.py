#!/usr/bin/env python3
"""
Non-interactive wrapper for drizzle-kit push.

drizzle-kit's prompt library (clack/prompts) calls process.stdin.setRawMode()
which requires a real TTY.  When stdin is a pipe (the `yes "" | cmd` pattern),
setRawMode() throws ENOTTY and the prompt hangs indefinitely.

This script allocates a pseudo-TTY via pty.fork() so drizzle-kit sees a real
terminal.  Any time output stops flowing (i.e. a prompt is waiting for input)
we send an Enter keypress, which always accepts the default selection ("create
table/column" is always the ❯ default in drizzle-kit's rename-detection menu).

Usage:
  python3 scripts/drizzle-push-noninteractive.py <output-file>

Writes all captured output to <output-file>.
Exits with drizzle-kit's exit code.
"""

import os
import pty
import select
import sys
import time

if len(sys.argv) != 2:
    print("usage: drizzle-push-noninteractive.py <output-file>", file=sys.stderr)
    sys.exit(1)

output_file = sys.argv[1]

cmd = [
    "pnpm", "--filter", "@workspace/db", "run", "push-force"
]

(pid, master_fd) = pty.fork()

if pid == 0:
    # Child: exec pnpm.  pty.fork() already set up the PTY as stdin/stdout/stderr.
    os.execvp(cmd[0], cmd)
    # unreachable
    sys.exit(127)

# Parent: capture output and auto-answer prompts.
chunks = []
last_data_time = time.time()
IDLE_ENTER_INTERVAL = 0.4  # send Enter after this many seconds of silence

try:
    while True:
        # 50 ms poll so we can inject Enter quickly when needed
        r, _, _ = select.select([master_fd], [], [], 0.05)
        if r:
            try:
                data = os.read(master_fd, 4096)
            except OSError:
                # Child closed the PTY (normal EOF)
                break
            if not data:
                break
            chunks.append(data)
            last_data_time = time.time()
        else:
            # No output — check if we should send an Enter keypress
            if time.time() - last_data_time >= IDLE_ENTER_INTERVAL:
                try:
                    # Raw-mode terminals expect \r (carriage return) for Enter,
                    # NOT \n.  clack/prompts uses raw mode and only recognises \r
                    # as the "return" key — \n is ignored.
                    os.write(master_fd, b"\r")
                except OSError:
                    break
                last_data_time = time.time()
except OSError:
    pass

# Reap the child
try:
    _, raw_status = os.waitpid(pid, 0)
    exit_code = os.WEXITSTATUS(raw_status) if os.WIFEXITED(raw_status) else 1
except ChildProcessError:
    exit_code = 0

# Write captured output (strip ANSI escape codes for clean grep later)
raw_output = b"".join(chunks)
# Decode best-effort, replace undecodable bytes
text_output = raw_output.decode("utf-8", errors="replace")
# Strip common ANSI/VT100 sequences so downstream grep works
import re
ansi_escape = re.compile(r"\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")
clean_output = ansi_escape.sub("", text_output)
# Strip carriage returns (PTY uses \r\n)
clean_output = clean_output.replace("\r\n", "\n").replace("\r", "\n")

with open(output_file, "w", encoding="utf-8") as f:
    f.write(clean_output)

sys.exit(exit_code)
