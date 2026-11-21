#!/bin/sh
# Prints the path of a portable Python or Node.js for the desktop app, downloading it on first use.
#
# apps/api/plm-python and apps/web/plm-node call this when the machine has no suitable Python (3.11+)
# or Node.js (20+). The pinned builds below are downloaded once into $OPENSHELL_DATA_DIR/runtimes (the
# app's data folder; without it ~/.cache/anamnesies/runtimes), checked against their SHA-256 and
# unpacked. Progress goes to stderr; stdout is only the path.
#
#   sh ensure.sh python|node
#
# Keep the versions close to ensure.ps1 (Windows takes the signed python.org build from NuGet there).
# Needs the executable bit (git add --chmod=+x scripts/runtimes/ensure.sh).
set -eu

tool="${1:-}"
say() { echo "[runtimes] $*" >&2; }

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64)              platform=darwin-arm64 ;;
  Darwin-x86_64)             platform=darwin-x64 ;;
  Linux-x86_64)              platform=linux-x64 ;;
  Linux-aarch64|Linux-arm64) platform=linux-arm64 ;;
  *) say "no portable $tool for $(uname -s) $(uname -m); install it yourself"; exit 127 ;;
esac

# Portable CPython (https://github.com/astral-sh/python-build-standalone) and the official Node.js build.
PY_RELEASE=20261110
PY_VERSION=3.13.18
NODE_VERSION=24.22.3
case "$tool-$platform" in
  python-darwin-arm64) triple=aarch64-apple-darwin;      sha256=7a2384641584ab9984221fcb0fc9265df465922af71be71410529e2a9c3f0540 ;;
  python-darwin-x64)   triple=x86_64-apple-darwin;       sha256=d27d59a722db9f69926eb6d9564071247221f45a04da920ea7f3001c97e32f9b ;;
  python-linux-x64)    triple=x86_64-unknown-linux-gnu;  sha256=f2d2199eb25880e07863b391cf7124e7ffa1338b0d65600dfcec117c4223a7fb ;;
  python-linux-arm64)  triple=aarch64-unknown-linux-gnu; sha256=55c00325f7c1fddf325dfc621aabdfbbac4dc54adda224af88ec411dc12db239 ;;
  node-darwin-arm64)   sha256=ff6e17d4874b76d272212b908cc020d6e815fba5a6c7eaaa06add725840307fd ;;
  node-darwin-x64)     sha256=977614af0504c81045e7fd85596dbca0e5f951b96681516dadafedcca8c447f7 ;;
  node-linux-x64)      sha256=061ec3e3062115705b56b51fa9cc330ab50d34b6969387d4e4b1a50c6809acc2 ;;
  node-linux-arm64)    sha256=261af2af250dfd7e9f25cf151d1b2713a0adf8f10a9ad116c4947f68627affe8 ;;
  *) echo "usage: ensure.sh python|node" >&2; exit 2 ;;
esac
if [ "$tool" = python ]; then
  name="python-$PY_VERSION+$PY_RELEASE"
  url="https://github.com/astral-sh/python-build-standalone/releases/download/$PY_RELEASE/cpython-$PY_VERSION%2B$PY_RELEASE-$triple-install_only_stripped.tar.gz"
  exe="python/bin/python3"
else
  name="node-v$NODE_VERSION"
  url="https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-$platform.tar.gz"
  exe="node-v$NODE_VERSION-$platform/bin/node"
fi

base="${OPENSHELL_DATA_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/anamnesies}"
runtimes="$base/runtimes"
target="$runtimes/$name"

if [ ! -x "$target/$exe" ]; then
  mkdir -p "$runtimes"
  # A folder of its own per attempt: the services may start at the same time and both download.
  work="$runtimes/.download-$tool-$$"
  rm -rf "$work" && mkdir -p "$work/unpacked"
  trap 'rm -rf "$work"' EXIT
  say "$tool was not found on this computer; downloading $name (once, into $runtimes)"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 3 -o "$work/archive.tar.gz" "$url"
  else
    wget -q -O "$work/archive.tar.gz" "$url"
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "$work/archive.tar.gz" | cut -d' ' -f1)"
  else
    actual="$(shasum -a 256 "$work/archive.tar.gz" | cut -d' ' -f1)"
  fi
  if [ "$actual" != "$sha256" ]; then
    say "checksum mismatch for $url: $actual"
    exit 1
  fi
  tar -xzf "$work/archive.tar.gz" -C "$work/unpacked"
  [ -x "$target/$exe" ] || mv "$work/unpacked" "$target" 2>/dev/null || [ -x "$target/$exe" ]
  say "$tool is ready: $target/$exe"
fi

echo "$target/$exe"
