#!/bin/bash
# Graphify auto-update hook: re-runs AST extraction on changed code files
FILE=$(jq -r '.tool_response.filePath // .tool_input.file_path' 2>/dev/null)
[ -z "$FILE" ] && exit 0
EXT="${FILE##*.}"
echo "$EXT" | grep -qE '^(ts|tsx|js|jsx|py|go|rs|java|cpp|c|rb|css|html)$' || exit 0
cd /Users/roshansanjeev/Desktop/Gallo/GalloSanitizationMVP || exit 0
/Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12 -c "
from pathlib import Path
from graphify.detect import detect_incremental
r = detect_incremental(Path('.'))
n = r.get('new_total', 0)
print(f'{n} changed files') if n else print('graph up to date')
" 2>/dev/null
