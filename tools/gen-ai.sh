#!/usr/bin/env bash
# gen-ai.sh — render raw AI textures via Codex's built-in gpt-image-2 tool.
#
# For each body (or the keys passed as args) that doesn't already have
# tools/_raw/ai/<key>.png, attaches the procedural reference and the per-body
# prompt from tools/prompts.json and asks Codex to image_gen-edit it, saving the
# raw PNG into tools/_raw/ai/. Re-runnable: existing outputs are skipped.
#
# Prereqs: `node tools/gen-refs.mjs` first (refs + prompts.json), an authenticated
# Codex CLI. After this, run `python3 tools/post.py` to bake the final WebP
# maps + their file:// data-url sidecars (assets/img/textures/local-data/).
set -u
cd "$(dirname "$0")/.."

KEYS="${*:-$(node -e 'require("./tools/prompts.json").forEach(p=>console.log(p.key))')}"

for key in $KEYS; do
  out="tools/_raw/ai/$key.png"
  ref="tools/_raw/ref/$key.png"
  if [ -f "$out" ]; then echo "have   $key (skip)"; continue; fi
  if [ ! -f "$ref" ]; then echo "no ref $key (skip)"; continue; fi

  tmp="$(mktemp)"
  node -e '
    const [key,ref,out]=process.argv.slice(1);
    const p=require("./tools/prompts.json").find(x=>x.key===key).prompt;
    process.stdout.write(
`The reference image (${ref}) is ALREADY ATTACHED and visible in this conversation.

Do this with no further questions and minimal preamble: call your built-in image_gen tool ONCE in EDIT mode, using the attached image as the edit base, with the prompt below, to produce a high-resolution equirectangular planet texture (landscape ~2:1, largest size available). Do NOT read more documentation, do NOT use any CLI or OPENAI_API_KEY path, do NOT write code.

PROMPT:
${p}

After it is generated, copy the resulting PNG from $CODEX_HOME/generated_images/ into ./${out} (overwrite if present), then print one line: SAVED <abs-path> <width>x<height>.`);
  ' "$key" "$ref" "$out" > "$tmp"

  echo ">>>>>> generating $key"
  codex exec -s workspace-write -c approval_policy="never" -c model_reasoning_effort="medium" -i "$ref" - < "$tmp" 2>&1 | tail -4
  rm -f "$tmp"
  if [ -f "$out" ]; then echo "ok     $key"; else echo "MISS   $key"; fi
done
echo "===== gen-ai batch done ====="
