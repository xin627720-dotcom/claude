#!/bin/bash
# SessionStart hook: install user's Claude Code skills into ~/.claude/skills/
# Skills: gstack, mattpocock, frontend-design, skill-creator
set -uo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

SKILLS_DIR="$HOME/.claude/skills"
mkdir -p "$SKILLS_DIR"

log() { echo "[install-skills] $*" >&2; }

clone_if_missing() {
  local name="$1" url="$2"
  local dest="$SKILLS_DIR/$name"
  if [ -d "$dest/.git" ]; then
    log "$name already installed, skipping"
    return 0
  fi
  log "cloning $name"
  if git clone --depth 1 --quiet "$url" "$dest" 2>/dev/null; then
    log "$name installed"
    return 0
  else
    log "WARN: failed to clone $name"
    rm -rf "$dest" 2>/dev/null || true
    return 1
  fi
}

clone_if_missing gstack https://github.com/garrytan/gstack.git
if [ -x "$SKILLS_DIR/gstack/setup" ] && [ ! -f "$SKILLS_DIR/gstack/.setup-done" ]; then
  log "running gstack ./setup (one-time)"
  (cd "$SKILLS_DIR/gstack" && ./setup) >&2 2>&1 || \
    log "WARN: gstack setup returned non-zero (browse skill may not work, others fine)"
  touch "$SKILLS_DIR/gstack/.setup-done"
fi

clone_if_missing mattpocock https://github.com/mattpocock/skills.git
MP_BASE="$SKILLS_DIR/mattpocock/skills"
if [ -d "$MP_BASE" ]; then
  for picked in productivity/caveman engineering/to-issues; do
    src="$MP_BASE/$picked"
    name=$(basename "$picked")
    if [ -d "$src" ]; then
      ln -sfn "$src" "$SKILLS_DIR/mp-$name"
      log "mp-$name linked"
    fi
  done
fi

ANTHROPIC_CACHE="$SKILLS_DIR/.anthropic-plugins-cache"
if [ ! -d "$ANTHROPIC_CACHE/.git" ]; then
  log "cloning anthropic plugins (sparse: frontend-design + skill-creator)"
  if git clone --depth 1 --filter=blob:none --sparse --quiet \
       https://github.com/anthropics/claude-plugins-official.git \
       "$ANTHROPIC_CACHE" 2>/dev/null; then
    (cd "$ANTHROPIC_CACHE" && git sparse-checkout set \
       "plugins/frontend-design/skills/frontend-design" \
       "plugins/skill-creator/skills/skill-creator") >/dev/null 2>&1 || \
      log "WARN: sparse-checkout failed"
  else
    log "WARN: failed to clone anthropic-plugins-cache"
    rm -rf "$ANTHROPIC_CACHE" 2>/dev/null || true
  fi
fi

FD_SRC="$ANTHROPIC_CACHE/plugins/frontend-design/skills/frontend-design"
if [ -d "$FD_SRC" ]; then
  ln -sfn "$FD_SRC" "$SKILLS_DIR/frontend-design"
  log "frontend-design linked"
fi
SC_SRC="$ANTHROPIC_CACHE/plugins/skill-creator/skills/skill-creator"
if [ -d "$SC_SRC" ]; then
  ln -sfn "$SC_SRC" "$SKILLS_DIR/skill-creator"
  log "skill-creator linked"
fi

INSTALLED=$(ls -1 "$SKILLS_DIR" 2>/dev/null | grep -v '^\.' | tr '\n' ' ')
log "done. installed: $INSTALLED"

exit 0
