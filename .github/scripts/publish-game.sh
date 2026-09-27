#!/usr/bin/env bash
# Publish one game's single-file build to the gh-pages branch.
#
#   publish-game.sh <game> <path/to/index.html>
#
# Layout on gh-pages:
#   <game>/index.html                   the live build
#   <game>/builds/<date>-<sha>/         every build ever published, never overwritten
#   <game>/builds/manifest.tsv          id, published at, source, sha256
#   <game>/builds/index.html            list of every build, newest first
#
# Rules:
#   - Only <game>/ is touched. Other games and the arcade root are left alone.
#   - If the build is byte-identical to what's live, nothing is committed or pushed.
#   - If the build matches an archived build (a revert), it goes live without a duplicate archive.
#   - Builds that were live before archiving existed are kept as builds/earlier-<hash>/.
#   - If another game pushes to gh-pages first, start over from theirs (up to 5 tries).
#
# Env: REMOTE (git URL of the repo), GITHUB_SHA, GITHUB_REF_NAME (both optional locally).
set -euo pipefail

GAME="${1:?usage: publish-game.sh <game> <index.html>}"
BUILD="$(cd "$(dirname "${2:?usage: publish-game.sh <game> <index.html>}")" && pwd)/$(basename "$2")"
REMOTE="${REMOTE:?set REMOTE to the repository git URL}"
SHA="${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo local)}"
SHA7="${SHA::7}"
SOURCE="${GITHUB_REF_NAME:-local}@${SHA7}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

[ -s "$BUILD" ] || { echo "No build at $BUILD" >&2; exit 1; }
hash_of() { sha256sum "$1" | cut -c1-64; }
NEW="$(hash_of "$BUILD")"

write_index() {
  local dir="$1"
  {
    cat <<HTML
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${GAME} builds</title>
<style>
  body { margin: 0; padding: 32px 16px; background: #0d0a22; color: #f6f0e1; font: 15px/1.5 system-ui, sans-serif; }
  main { max-width: 720px; margin: 0 auto; }
  h1 { margin: 0 0 4px; font-size: 26px; }
  p { color: #b8b0d8; margin: 0 0 20px; }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  td, th { text-align: left; padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.1); }
  th { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: #b8b0d8; }
  a { color: #ffd54a; }
  .live { color: #3df0b4; font-weight: 700; }
</style></head>
<body><main>
<h1>${GAME}: every published build</h1>
<p><a href="../">Play the live build</a>. Older builds stay here so nothing is ever overwritten.</p>
<table><tr><th>Build</th><th>Published</th><th>Source</th><th></th></tr>
HTML
    local live
    live="$(hash_of "$dir/index.html")"
    tac "$dir/builds/manifest.tsv" | while IFS=$'\t' read -r id at src h; do
      [ -n "$id" ] || continue
      local tag=""
      [ "$h" = "$live" ] && tag='<span class="live">live</span>'
      printf '<tr><td><a href="%s/">%s</a></td><td>%s</td><td>%s</td><td>%s</td></tr>\n' "$id" "$id" "$at" "$src" "$tag"
    done
    echo '</table></main></body></html>'
  } > "$dir/builds/index.html"
}

for attempt in 1 2 3 4 5; do
  site="$WORK/site"
  rm -rf "$site"
  if git ls-remote --exit-code --heads "$REMOTE" gh-pages >/dev/null 2>&1; then
    git clone --quiet --depth 1 --branch gh-pages "$REMOTE" "$site"
  else
    git init --quiet -b gh-pages "$site"
    git -C "$site" remote add origin "$REMOTE"
  fi
  dir="$site/$GAME"
  manifest="$dir/builds/manifest.tsv"
  mkdir -p "$dir/builds"
  touch "$manifest"

  if [ -f "$dir/index.html" ] && [ "$(hash_of "$dir/index.html")" = "$NEW" ]; then
    echo "$GAME is unchanged; nothing to publish."
    exit 0
  fi

  # Keep whatever is live right now if it was never archived.
  if [ -f "$dir/index.html" ]; then
    old="$(hash_of "$dir/index.html")"
    if ! cut -f4 "$manifest" | grep -qx "$old"; then
      id="earlier-${old::8}"
      mkdir -p "$dir/builds/$id"
      cp "$dir/index.html" "$dir/builds/$id/index.html"
      printf '%s\t%s\t%s\t%s\n' "$id" "before archiving" "unknown" "$old" >> "$manifest"
    fi
  fi

  if cut -f4 "$manifest" | grep -qx "$NEW"; then
    echo "$GAME matches an archived build; making it live again without a duplicate archive."
  else
    base="$(date -u +%Y-%m-%d)-${SHA7}"
    id="$base"
    n=2
    while [ -e "$dir/builds/$id" ]; do
      id="$base-$n"
      n=$((n + 1))
    done
    mkdir "$dir/builds/$id"
    cp "$BUILD" "$dir/builds/$id/index.html"
    printf '%s\t%s\t%s\t%s\n' "$id" "$(date -u +%Y-%m-%dT%H:%MZ)" "$SOURCE" "$NEW" >> "$manifest"
  fi
  cp "$BUILD" "$dir/index.html"
  write_index "$dir"
  touch "$site/.nojekyll"

  git -C "$site" config user.name 'github-actions[bot]'
  git -C "$site" config user.email '41898282+github-actions[bot]@users.noreply.github.com'
  git -C "$site" add -A
  git -C "$site" commit --quiet -m "Publish $GAME from $SOURCE"
  if git -C "$site" push --quiet origin gh-pages; then
    echo "Published $GAME from $SOURCE"
    exit 0
  fi
  echo "gh-pages moved underneath us, retrying ($attempt)"
  sleep $((attempt * 3))
done
echo "Could not publish $GAME after 5 tries" >&2
exit 1
