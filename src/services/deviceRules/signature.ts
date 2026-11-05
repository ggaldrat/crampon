import {ed25519} from '@noble/curves/ed25519';
import {sha256} from '@noble/hashes/sha2';
import {bytesToHex, hexToBytes, utf8ToBytes} from '@noble/hashes/utils';

/**
 * Crampon's rules are signed by the model watch (veille/sign_rules.sh, key in
 * the CRAMPON_RULES_SIGNING_KEY secret and ~/crampon/keys on BlandyStudio).
 * The app trusts the signature, not the server: any mirror or peer may serve
 * the file. Public key of rules-signing-ed25519.pem, created 5 Nov 2026.
 */
export const RULES_PUBLIC_KEY =
  '8cb844bd07a44aabf245a5f617c5369fb1480b35e4a573bce9c737e57b4894c0';

/** Published next to the rules, as <rules>.sig. */
export type RulesSignature = {
  sha256: string;
  signedAt: string;
  signature: string;
};

/**
 * The signing time when `text` is exactly the signed file, null otherwise:
 * a wrong hash, a bad signature or a malformed signature file.
 */
export const verifyRules = (
  text: string,
  sig: RulesSignature,
  publicKey: string = RULES_PUBLIC_KEY,
): string | null => {
  try {
    if (bytesToHex(sha256(utf8ToBytes(text))) !== sig.sha256) {
      return null;
    }
    const message = utf8ToBytes(
      `crampon-rules-v1\n${sig.sha256}\n${sig.signedAt}`,
    );
    return ed25519.verify(
      hexToBytes(sig.signature),
      message,
      hexToBytes(publicKey),
    )
      ? sig.signedAt
      : null;
  } catch {
    return null;
  }
};
