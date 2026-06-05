#!/usr/bin/env bash
# PreToolUse ガード: docs/developer/project.md への変更をブロックする。
# CLAUDE.md「注意事項」の「project.md は原則編集禁止」を構造的に補強する。
#
# 対応ツール（settings.json の matcher と対応）:
#   - Write / Edit / MultiEdit : tool_input.file_path を検査
#   - Bash                     : tool_input.command 内の project.md への書き込み/削除/移動を検査
#
# 安全側設計（フェイルクローズ）: JSON を解析できない場合は通さずブロックする。
# ブロック時は exit 2（PreToolUse を拒否し、stderr を Claude に返す）。

set -euo pipefail

input=$(cat)

if ! command -v python3 >/dev/null 2>&1; then
  echo "🚫 project.md 保護フック: python3 が見つからないため、安全側で操作をブロックしました。" >&2
  exit 2
fi

HOOK_INPUT="$input" python3 - <<'PY'
import os, sys, json, re

PROTECTED = "docs/developer/project.md"

raw = os.environ.get("HOOK_INPUT", "")
try:
    d = json.loads(raw)
except Exception:
    print("🚫 project.md 保護フック: 入力を解析できなかったため、安全側でブロックしました。", file=sys.stderr)
    sys.exit(2)

ti = d.get("tool_input", {}) or {}

def norm(s):
    return s.replace("\\", "/") if isinstance(s, str) else ""

# Write / Edit / MultiEdit
if PROTECTED in norm(ti.get("file_path", "")):
    print(f"🚫 {PROTECTED} は保護されています（原則編集禁止）。変更が必要な場合は自己判断せず、ユーザーに確認を取ってください。CLAUDE.md を参照。", file=sys.stderr)
    sys.exit(2)

# Bash: project.md への書き込み/削除/移動らしき操作を検出（読み取りは許可）
cmd = ti.get("command", "")
if isinstance(cmd, str) and "project.md" in cmd:
    write_indicators = [r">", r">>", r"\bsed\b[^|]*-i", r"\btee\b", r"\bmv\b",
                        r"\bcp\b", r"\brm\b", r"\btruncate\b", r"\bdd\b", r"\bln\b"]
    if any(re.search(p, cmd) for p in write_indicators):
        print(f"🚫 Bash 経由での {PROTECTED} への書き込み/削除/移動は禁止です（原則編集禁止）。ユーザーに確認を取ってください。", file=sys.stderr)
        sys.exit(2)

sys.exit(0)
PY
