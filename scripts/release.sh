#!/usr/bin/env bash

# Usage: scripts/release.sh [patch|minor|major|<version>]
# Bumps package.json, syncs OpenWrt PKG_VERSION, commits and tags.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUMP="${1:-patch}"

cd "$ROOT_DIR"

# Update version in package.json/package-lock.json without tagging
npm version --no-git-tag-version "$BUMP"

# Sync PKG_VERSION in OpenWrt Makefile
NEW_VERSION="$(node -p "require('./package.json').version")"
perl -pi -e "s/^PKG_VERSION:=.*/PKG_VERSION:=${NEW_VERSION}/" "$ROOT_DIR/openwrt/keenetic-geosite-sync/Makefile"

git add package.json package-lock.json openwrt/keenetic-geosite-sync/Makefile
git commit -m "chore: release v$NEW_VERSION"
git tag "v$NEW_VERSION"

echo "Release prepared: v$NEW_VERSION"
