#!/bin/bash
# Signs the app's rules for Crampon: writes <rules>.sig next to them, a JSON
# {sha256, signedAt, signature} where the Ed25519 signature covers
# "crampon-rules-v1\n<sha256>\n<signedAt>". The app checks it with the public
# key in src/services/deviceRules/signature.ts, whatever server or peer
# served the file, and refuses a signedAt older than the one it already has.
#
# Usage: CRAMPON_RULES_SIGNING_KEY="$(cat key.pem)" veille/sign_rules.sh rules.android.v2.json
# Signs only when the rules changed since the last signature.
set -euo pipefail

RULES=$1
SIG=$RULES.sig
SHA=$(sha256sum "$RULES" | cut -d' ' -f1)
if [ -f "$SIG" ] && grep -q "\"sha256\": \"$SHA\"" "$SIG"; then
  echo "signature up to date"
  exit 0
fi
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
(umask 077 && printf '%s\n' "$CRAMPON_RULES_SIGNING_KEY" > "$TMP/key.pem")
AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
printf 'crampon-rules-v1\n%s\n%s' "$SHA" "$AT" > "$TMP/message"
SIGNATURE=$(openssl pkeyutl -sign -inkey "$TMP/key.pem" -rawin -in "$TMP/message" | od -An -tx1 | tr -d ' \n')
printf '{\n "sha256": "%s",\n "signedAt": "%s",\n "signature": "%s"\n}\n' "$SHA" "$AT" "$SIGNATURE" > "$SIG"
echo "signed $RULES ($AT)"
