#!/bin/sh
# The viewer loads JSON with fetch(), which needs http:// rather than file://
cd "$(dirname "$0")" && echo "→ http://localhost:8777" && python3 -m http.server 8777
