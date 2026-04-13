#!/bin/bash
# Ruflo post-edit hook: logs edited file to Ruflo's learning system
# Extracts file path from Claude's PostToolUse stdin JSON
FILE=$(jq -r '.tool_response.filePath // .tool_input.file_path' 2>/dev/null)
[ -z "$FILE" ] && exit 0
EXT="${FILE##*.}"
echo "$EXT" | grep -qE '^(ts|tsx|js|jsx|py|go|rs|java|cpp|c|rb|css|html|json)$' || exit 0
# Output context for Ruflo memory (consumed by the model, not a direct MCP call)
echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PostToolUse\",\"additionalContext\":\"[RUFLO] File edited: $FILE — consider storing significant patterns or decisions to Ruflo memory via mcp__ruflo__memory_store\"}}"
