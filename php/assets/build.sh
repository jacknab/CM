#!/bin/bash
# Minifies the hand-edited *.src.css / *.src.js source files into the paths
# header.php/footer.php actually reference (style.css, main.js,
# livechat-widget.js). Run this after editing any *.src.* file.
#
# Edit the .src files, never the minified output directly — it gets
# overwritten every time this script runs.
set -euo pipefail
cd "$(dirname "$0")"

ESBUILD=/apps/CM/artifacts/api-server/node_modules/.bin/esbuild

"$ESBUILD" css/style.src.css --minify --outfile=css/style.css
"$ESBUILD" js/main.src.js --minify --outfile=js/main.js
"$ESBUILD" js/livechat-widget.src.js --minify --outfile=js/livechat-widget.js

echo "Built: css/style.css, js/main.js, js/livechat-widget.js"
