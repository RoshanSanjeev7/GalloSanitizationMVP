#!/bin/bash
# Ruflo session start hook: reminds Claude to restore Ruflo context
echo "{\"hookSpecificOutput\":{\"hookEventName\":\"SessionStart\",\"additionalContext\":\"[RUFLO] Session starting. Use mcp__ruflo__hooks_session-start with restoreLatest=true to restore previous session context. Use mcp__ruflo__memory_search to check for relevant prior decisions before starting work.\"}}"
