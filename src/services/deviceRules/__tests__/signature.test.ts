import fs from 'fs';
import path from 'path';
import {ed25519} from '@noble/curves/ed25519';
import {sha256} from '@noble/hashes/sha2';
import {bytesToHex, utf8ToBytes} from '@noble/hashes/utils';

import {RULES_PUBLIC_KEY, verifyRules} from '../signature';

const secret = ed25519.utils.randomPrivateKey();
const publicKey = bytesToHex(ed25519.getPublicKey(secret));

// What veille/sign_rules.sh writes next to the rules.
const sign = (text: string, signedAt = '2026-11-05T21:00:00Z') => {
  const hash = bytesToHex(sha256(utf8ToBytes(text)));
  const message = utf8ToBytes(`crampon-rules-v1\n${hash}\n${signedAt}`);
  return {
    sha256: hash,
    signedAt,
    signature: bytesToHex(ed25519.sign(message, secret)),
  };
};

describe('verifyRules', () => {
  const text = '{"rules_version": "2026-11-04.1+crampon.é"}\n';

  it('returns the signing time of an intact, signed file', () => {
    expect(verifyRules(text, sign(text), publicKey)).toBe(
      '2026-11-05T21:00:00Z',
    );
  });

  it('refuses a modified file, a moved date, another key or garbage', () => {
    const sig = sign(text);
    expect(verifyRules(text + ' ', sig, publicKey)).toBeNull();
    expect(
      verifyRules(text, {...sig, signedAt: '2027-01-01T00:00:00Z'}, publicKey),
    ).toBeNull();
    expect(verifyRules(text, sig)).toBeNull();
    expect(verifyRules(text, {...sig, signature: 'zz'}, publicKey)).toBeNull();
  });

  it('checks a signature made by veille/sign_rules.sh with openssl', () => {
    // Fixture signed with the real Crampon key on 5 Nov 2026.
    const dir = path.join(__dirname, 'fixtures');
    const signed = fs.readFileSync(path.join(dir, 'signed-rules.json'), 'utf8');
    const sig = JSON.parse(
      fs.readFileSync(path.join(dir, 'signed-rules.json.sig'), 'utf8'),
    );
    expect(verifyRules(signed, sig, RULES_PUBLIC_KEY)).toBe(sig.signedAt);
  });
});
