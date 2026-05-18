#!/bin/bash
# ============================================================
# MJ Lernförderung – Clean URL Restructuring Script
# Wandelt pages/xyz.html → pages/xyz/index.html um
# Führe dieses Script im ROOT-Verzeichnis des Repos aus!
# ============================================================

set -e

PAGES_DIR="pages"

# Alle Subpages die umstrukturiert werden
PAGES=(
  "nachhilfe"
  "online"
  "foerderbedarfe"
  "ueber-uns"
  "preise"
  "but"
  "kontakt"
  "jobs"
  "aktuelles"
)

echo "🚀 Starte URL-Restructuring..."
echo ""

for page in "${PAGES[@]}"; do
  SRC="$PAGES_DIR/$page.html"
  DEST_DIR="$PAGES_DIR/$page"
  DEST="$DEST_DIR/index.html"

  if [ ! -f "$SRC" ]; then
    echo "⚠️  Nicht gefunden, überspringe: $SRC"
    continue
  fi

  # Ordner erstellen
  mkdir -p "$DEST_DIR"

  # HTML kopieren und CSS/JS Pfade anpassen
  # ../style.css bleibt gleich (eine Ebene höher = root)
  # ../main.js bleibt gleich
  # ../partials/ bleibt gleich
  # Links zu anderen pages: pages/xyz.html → /pages/xyz/ 
  sed \
    -e 's|href="pages/\([^"]*\)\.html"|href="/pages/\1/"|g' \
    -e 's|href="\.\./pages/\([^"]*\)\.html"|href="/pages/\1/"|g' \
    -e 's|href="datenschutz\.html"|href="/datenschutz/"|g' \
    -e 's|href="impressum\.html"|href="/impressum/"|g' \
    -e 's|href="\.\./datenschutz\.html"|href="/datenschutz/"|g' \
    -e 's|href="\.\./impressum\.html"|href="/impressum/"|g' \
    "$SRC" > "$DEST"

  echo "✅ $SRC → $DEST"
done

echo ""
echo "📄 Verarbeite Root-HTML-Dateien (index, datenschutz, impressum)..."

# Datenschutz & Impressum root-level → eigene Ordner
for rootpage in "datenschutz" "impressum"; do
  SRC="$rootpage.html"
  DEST_DIR="$rootpage"
  DEST="$DEST_DIR/index.html"

  if [ ! -f "$SRC" ]; then
    echo "⚠️  Nicht gefunden, überspringe: $SRC"
    continue
  fi

  mkdir -p "$DEST_DIR"

  sed \
    -e 's|href="pages/\([^"]*\)\.html"|href="/pages/\1/"|g' \
    -e 's|href="datenschutz\.html"|href="/datenschutz/"|g' \
    -e 's|href="impressum\.html"|href="/impressum/"|g' \
    -e 's|href="style\.css"|href="../style.css"|g' \
    -e 's|src="main\.js"|src="../main.js"|g' \
    "$SRC" > "$DEST"

  echo "✅ $SRC → $DEST"
done

echo ""
echo "🔗 Passe index.html Links an..."

# index.html Links patchen (bleibt im root)
sed -i.bak \
  -e 's|href="pages/\([^"]*\)\.html"|href="/pages/\1/"|g' \
  -e 's|href="datenschutz\.html"|href="/datenschutz/"|g' \
  -e 's|href="impressum\.html"|href="/impressum/"|g' \
  index.html

echo "✅ index.html Links aktualisiert (Backup: index.html.bak)"

echo ""
echo "🎉 Fertig! Struktur:"
echo ""
echo "  /pages/nachhilfe/index.html     → mj-lernfoerderung.de/pages/nachhilfe/"
echo "  /pages/online/index.html        → mj-lernfoerderung.de/pages/online/"
echo "  /pages/foerderbedarfe/index.html→ mj-lernfoerderung.de/pages/foerderbedarfe/"
echo "  /pages/ueber-uns/index.html     → mj-lernfoerderung.de/pages/ueber-uns/"
echo "  /pages/preise/index.html        → mj-lernfoerderung.de/pages/preise/"
echo "  /pages/but/index.html           → mj-lernfoerderung.de/pages/but/"
echo "  /pages/kontakt/index.html       → mj-lernfoerderung.de/pages/kontakt/"
echo "  /pages/jobs/index.html          → mj-lernfoerderung.de/pages/jobs/"
echo "  /pages/aktuelles/index.html     → mj-lernfoerderung.de/pages/aktuelles/"
echo "  /datenschutz/index.html         → mj-lernfoerderung.de/datenschutz/"
echo "  /impressum/index.html           → mj-lernfoerderung.de/impressum/"
echo ""
echo "⚠️  WICHTIG: Die alten .html Dateien kannst du danach löschen:"
echo "   git rm pages/nachhilfe.html pages/online.html pages/foerderbedarfe.html"
echo "   git rm pages/ueber-uns.html pages/preise.html pages/but.html"
echo "   git rm pages/kontakt.html pages/jobs.html pages/aktuelles.html"
echo "   git rm datenschutz.html impressum.html"
echo ""
echo "   Dann: git add . && git commit -m 'refactor: clean URLs ohne .html'"
