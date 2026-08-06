#!/bin/bash
set -e

trap 'kill $(jobs -p) 2>/dev/null; exit' SIGTERM SIGINT EXIT

# ── Bootstrap — install workspace dependencies if node_modules are missing ────
# Use flock so concurrent workflow starts don't race on pnpm install
(
  flock -x 200
  if [ ! -d "node_modules" ]; then
    echo "[pos-start] node_modules missing — running pnpm install..."
    pnpm install --no-frozen-lockfile
    echo "[pos-start] pnpm install complete."
  fi
) 200>/tmp/pnpm-workspace-install.lock

if [ -n "$REPLIT_DEV_DOMAIN" ]; then
  export EXPO_PUBLIC_API_URL="https://${REPLIT_DEV_DOMAIN}"
  echo "[pos-start] EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL}"
else
  export EXPO_PUBLIC_API_URL="http://localhost:9200"
  echo "[pos-start] WARNING: REPLIT_DEV_DOMAIN not set, using localhost"
fi

export BROWSER=none
export EXPO_NO_DEVTOOLS=1
export EXPO_NO_TELEMETRY=1
export EXPO_NO_DOCTOR=1
export EXPO_NO_DEPENDENCY_VALIDATION=1
export REACT_NATIVE_START_DEVTOOLS=false

# ── Silence the dotslash DevTools noise ──────────────────────────────────────
# Expo's file-watcher crashes if it tries to watch a dotslash temp path that
# doesn't exist. Clear any stale dotslash cache so Metro doesn't try to watch
# half-deleted temp paths, then stub out the binary so it's never re-created.
rm -rf /home/runner/workspace/.cache/dotslash 2>/dev/null || true
mkdir -p /tmp/certxa-stubs
cat > /tmp/certxa-stubs/dotslash << 'EOF'
#!/bin/bash
exit 0
EOF
chmod +x /tmp/certxa-stubs/dotslash
export PATH="/tmp/certxa-stubs:$PATH"

# ── Patch @tanstack/query-core exports (belt-and-suspenders) ─────────────────
# Primary fix: metro.config.js sets unstable_enablePackageExports=false so
# Metro uses the `main` field (→ legacy build) instead of the exports field.
# This runtime patch is a safety net — finds every copy regardless of pnpm path.
echo "[pos-start] Patching @tanstack/query-core exports → legacy build..."
node -e "
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let found = [];
try {
  found = execSync(\"find node_modules -name 'package.json' -path '*/query-core/package.json' 2>/dev/null\")
    .toString().trim().split('\n').filter(Boolean);
} catch (_) {}

const targets = new Set(found);
for (const f of found) {
  try {
    const real = fs.realpathSync(path.dirname(f));
    targets.add(path.join(real, 'package.json'));
  } catch (_) {}
}

for (const pkgJsonPath of targets) {
  try {
    if (!fs.existsSync(pkgJsonPath)) continue;
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    if (!pkg.exports || !pkg.exports['.']) continue;
    if (pkg.exports['.'].require && pkg.exports['.'].require.default === './build/legacy/index.cjs') {
      console.log('  already patched:', pkgJsonPath);
      continue;
    }
    pkg.exports['.'].import = {
      types: './build/legacy/index.d.ts',
      default: './build/legacy/index.js',
    };
    pkg.exports['.'].require = {
      types: './build/legacy/index.d.cts',
      default: './build/legacy/index.cjs',
    };
    fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2));
    console.log('  patched:', pkgJsonPath);
  } catch (e) {
    console.warn('  could not patch:', pkgJsonPath, e.message);
  }
}
"

echo "[pos-start] Starting Certxa POS in web mode on port 8083..."
exec pnpm --filter @workspace/certxa-pos exec expo start \
  --web \
  --port 8083
