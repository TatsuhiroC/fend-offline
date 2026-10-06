#!/usr/bin/env bash
# Generate the Android release keystore used to sign fend-offline APKs, then print the
# four GitHub Secrets you have to add (Settings -> Secrets and variables -> Actions).
#
# Keep the generated .keystore file safe: every future APK must be signed with this same
# key, otherwise Android refuses to install the update over an existing install.
#
# Usage:
#   bash scripts/make-keystore.sh [path/to/release.keystore]
#   KEY_ALIAS=fend ANDROID_KEYSTORE_PASSWORD=... bash scripts/make-keystore.sh

set -euo pipefail

KEYSTORE="${1:-$HOME/.fend-offline/release.keystore}"
ALIAS="${KEY_ALIAS:-fend-offline}"
DAYS="${VALIDITY_DAYS:-10000}"

# macOS ships stub /usr/bin/keytool wrappers that fail unless a JDK is installed,
# so probe it instead of trusting `command -v`.
if ! keytool -help >/dev/null 2>&1; then
	echo "keytool is not usable — no Java runtime found." >&2
	echo "Install a JDK first, e.g.:  brew install --cask temurin" >&2
	exit 1
fi

if [ -e "$KEYSTORE" ]; then
	echo "refusing to overwrite the existing keystore: $KEYSTORE" >&2
	echo "delete it yourself if you really want to start over (existing installs would stop upgrading)." >&2
	exit 1
fi

PW="${ANDROID_KEYSTORE_PASSWORD:-}"
if [ -z "$PW" ]; then
	PW="$(openssl rand -base64 24 | tr -d '\n/+=' | cut -c1-24)"
	echo "generated a store/key password for you (save it somewhere safe):"
	echo
	echo "    $PW"
	echo
fi

mkdir -p "$(dirname "$KEYSTORE")"
keytool -genkeypair \
	-keystore "$KEYSTORE" \
	-alias "$ALIAS" \
	-keyalg RSA \
	-keysize 4096 \
	-validity "$DAYS" \
	-storepass "$PW" \
	-keypass "$PW" \
	-dname "CN=fend-offline, OU=personal, O=fend-offline, C=CN" \
	> /dev/null

B64="$(base64 < "$KEYSTORE" | tr -d '\n')"

cat <<EOF

keystore written to: $KEYSTORE

Add these four repository secrets (Settings -> Secrets and variables -> Actions):

  ANDROID_KEYSTORE_BASE64
$B64

  ANDROID_KEYSTORE_PASSWORD
$PW

  ANDROID_KEY_ALIAS
$ALIAS

  ANDROID_KEY_PASSWORD
$PW

Or with the GitHub CLI (paste the values when prompted):

  printf '%s' '$B64' | gh secret set ANDROID_KEYSTORE_BASE64 -R TatsuhiroC/fend-offline
  gh secret set ANDROID_KEYSTORE_PASSWORD -R TatsuhiroC/fend-offline
  gh secret set ANDROID_KEY_ALIAS -R TatsuhiroC/fend-offline
  gh secret set ANDROID_KEY_PASSWORD -R TatsuhiroC/fend-offline

Optional: pin the expected APK fingerprint so CI fails if signing ever changes:

  keytool -list -v -keystore "$KEYSTORE" -storepass '<password>' | grep SHA256

then add the SHA-256 (with colons) as the ANDROID_CERT_SHA256 secret.
EOF
