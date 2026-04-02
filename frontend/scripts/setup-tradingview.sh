#!/bin/sh
# Download TradingView Charting Library files into public/static/
# Requires access to https://github.com/tradingview/charting_library
# Request access at https://www.tradingview.com/advanced-charts/
#
# Usage: sh scripts/setup-tradingview.sh

set -e

REPO="https://github.com/tradingview/charting_library.git"
BRANCH="master"
TMP_DIR=".tv_tmp"
DEST="public/static"

echo "Cloning TradingView Charting Library (shallow)..."
rm -rf "$TMP_DIR"
git clone --depth 1 -b "$BRANCH" "$REPO" "$TMP_DIR"

echo "Copying files to $DEST..."
mkdir -p "$DEST"
rm -rf "$DEST/charting_library" "$DEST/datafeeds"
cp -r "$TMP_DIR/charting_library" "$DEST/charting_library"
cp -r "$TMP_DIR/datafeeds"        "$DEST/datafeeds"

rm -rf "$TMP_DIR"
echo "Done. Files are in $DEST/charting_library and $DEST/datafeeds"
echo "These paths are gitignored — do not commit them."
