#!/usr/bin/env bash
set -e

TS="1780388848617"
BASE="/home/runner/workspace/templates-storage"
NPM_BASE="$BASE/_hair_salon_npm_base"

SLUGS=(
  "noir" "botanica" "edit" "velvet" "sol"
  "shoreline" "shift" "sakura" "obsidian" "terra"
  "luna" "verdant" "riviera" "concrete" "petal"
  "forge" "linen" "marea" "dusk" "blanc"
  "ember" "fern" "prism" "roast" "orchid"
)

PKG_JSON='{
  "name": "hair-salon-template",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "lucide-react": "^0.344.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.18",
    "postcss": "^8.4.35",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.5.3",
    "vite": "^5.4.2"
  }
}'

VITE_CONFIG='import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { exclude: ["lucide-react"] },
});'

TAILWIND_CFG='/** @type {import("tailwindcss").Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: { extend: {} },
  plugins: [],
};'

POSTCSS_CFG='export default { plugins: { tailwindcss: {}, autoprefixer: {} } };'

TSCONFIG='{ "files": [], "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }] }'

TSCONFIG_APP='{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}'

TSCONFIG_NODE='{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["vite.config.ts"]
}'

MAIN_TSX='import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);'

VITE_ENV='/// <reference types="vite/client" />'

echo "=== Setting up npm base ==="
mkdir -p "$NPM_BASE"
echo "$PKG_JSON" > "$NPM_BASE/package.json"
cd "$NPM_BASE"
npm install --prefer-offline 2>&1 | tail -5
echo "npm base ready."

echo "=== Creating template directories ==="
for SLUG in "${SLUGS[@]}"; do
  DIR="$BASE/hair-salon-${SLUG}-${TS}/project"
  mkdir -p "$DIR/src"

  echo "$PKG_JSON" > "$DIR/package.json"
  echo "$VITE_CONFIG" > "$DIR/vite.config.ts"
  echo "$TAILWIND_CFG" > "$DIR/tailwind.config.js"
  echo "$POSTCSS_CFG" > "$DIR/postcss.config.js"
  echo "$TSCONFIG" > "$DIR/tsconfig.json"
  echo "$TSCONFIG_APP" > "$DIR/tsconfig.app.json"
  echo "$TSCONFIG_NODE" > "$DIR/tsconfig.node.json"
  echo "$MAIN_TSX" > "$DIR/src/main.tsx"
  echo "$VITE_ENV" > "$DIR/src/vite-env.d.ts"

  cat > "$DIR/index.html" << 'HTML'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Hair Salon</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
HTML

  ln -sf "$NPM_BASE/node_modules" "$DIR/node_modules"
  echo "  Created: hair-salon-${SLUG}-${TS}"
done

echo "=== All directories ready ==="
