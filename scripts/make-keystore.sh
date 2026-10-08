#!/usr/bin/env bash
# Generate a new signing key and owner-only GitHub-secret files. Never print secrets.
# Existing keys are never overwritten: upgrades must retain their original signer.
set -euo pipefail
umask 077

task_keystore="${1:-./.signing/release.keystore}"
task_alias="${KEY_ALIAS:-fend-offline}"
task_days="${VALIDITY_DAYS:-10000}"
task_secret_dir="${task_keystore}.secrets"

if ! keytool -help >/dev/null 2>&1; then
  echo 'keytool is not usable — install a JDK first.' >&2
  exit 1
fi
if [ -e "$task_keystore" ] || [ -e "$task_secret_dir" ]; then
  echo 'Refusing to overwrite an existing signing key or secret directory.' >&2
  exit 1
fi
case "$task_days" in ''|*[!0-9]*) echo 'VALIDITY_DAYS must be a positive integer.' >&2; exit 1;; esac
if [ "$task_days" -le 0 ]; then echo 'VALIDITY_DAYS must be positive.' >&2; exit 1; fi

task_password="${ANDROID_KEYSTORE_PASSWORD:-}"
if [ -z "$task_password" ]; then task_password="$(openssl rand -base64 24 | tr -d '\n')"; fi
mkdir -p "$(dirname "$task_keystore")"
mkdir "$task_secret_dir"
task_tmp="$(mktemp -d "$(dirname "$task_keystore")/.fend-key.XXXXXX")"
task_complete=0
trap 'rm -rf "$task_tmp"; if [ "$task_complete" -eq 0 ]; then rm -rf "$task_secret_dir"; fi' EXIT

# env form keeps the password out of command arguments and terminal logs.
export FEND_KEYSTORE_PASSWORD="$task_password"
keytool -genkeypair -keystore "$task_tmp/release.keystore" -alias "$task_alias" \
  -keyalg RSA -keysize 4096 -validity "$task_days" \
  -storepass:env FEND_KEYSTORE_PASSWORD -keypass:env FEND_KEYSTORE_PASSWORD \
  -dname 'CN=fend-offline, OU=personal, O=fend-offline, C=CN' >/dev/null
unset FEND_KEYSTORE_PASSWORD

base64 < "$task_tmp/release.keystore" | tr -d '\n' > "$task_secret_dir/ANDROID_KEYSTORE_BASE64"
printf '%s' "$task_password" > "$task_secret_dir/ANDROID_KEYSTORE_PASSWORD"
printf '%s' "$task_alias" > "$task_secret_dir/ANDROID_KEY_ALIAS"
printf '%s' "$task_password" > "$task_secret_dir/ANDROID_KEY_PASSWORD"
# An atomic no-overwrite publication also protects concurrent invocations.
ln "$task_tmp/release.keystore" "$task_keystore"
task_complete=1
unset task_password

printf 'Signing key saved to: %s\nOwner-only secret files saved to: %s\n' "$task_keystore" "$task_secret_dir"
echo 'Back up the signing key and credentials securely. Upload the files using stdin:'
for task_secret in ANDROID_KEYSTORE_BASE64 ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD; do
  printf '  gh secret set %s -R TatsuhiroC/fend-offline < %q\n' "$task_secret" "$task_secret_dir/$task_secret"
done
