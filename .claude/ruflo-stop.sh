#!/bin/bash
# Ruflo stop hook: reminds Claude to persist session and analyze changes
echo "{\"hookSpecificOutput\":{\"hookEventName\":\"Stop\",\"additionalContext\":\"[RUFLO] Session ending. Before stopping: (1) Use mcp__ruflo__analyze_diff-risk to check risk of uncommitted changes. (2) Use mcp__ruflo__hooks_session-end with saveState=true to persist session context. (3) Use mcp__ruflo__memory_store to save any significant decisions or patterns discovered this session.\"}}"
