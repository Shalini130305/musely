import crypto from 'crypto';

// Base32 RFC 4648 characters
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateBase32Secret(length = 20): string {
  const buffer = crypto.randomBytes(length);
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31];
  }

  return output;
}

export function base32ToBuffer(base32: string): Buffer {
  const cleanBase32 = base32.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleanBase32.length; i++) {
    const val = BASE32_CHARS.indexOf(cleanBase32[i]);
    if (val === -1) continue;

    value = (value << 5) | val;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generate standard RFC 6238 TOTP code for a given timestamp
 */
export function generateTOTP(secret: string, timestampMs = Date.now(), timeStepSec = 30): string {
  const secretBuffer = base32ToBuffer(secret);
  const timeStep = Math.floor(timestampMs / 1000 / timeStepSec);

  const counterBuffer = Buffer.alloc(8);
  // Write 64-bit integer big-endian
  counterBuffer.writeBigUInt64BE(BigInt(timeStep));

  const hmac = crypto.createHmac('sha1', secretBuffer);
  hmac.update(counterBuffer);
  const digest = hmac.digest();

  // Dynamic truncation
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const strCode = (code % 1000000).toString().padStart(6, '0');
  return strCode;
}

/**
 * Verify TOTP with window of +/- 1 time step (30 seconds drift tolerance)
 */
export function verifyTOTP(
  token: string,
  secret: string,
  window = 1,
  timeStepSec = 30
): boolean {
  if (!token || !secret) return false;
  const cleanToken = token.trim();
  if (cleanToken.length !== 6) return false;

  const now = Date.now();
  for (let error = -window; error <= window; error++) {
    const checkTime = now + error * timeStepSec * 1000;
    const expected = generateTOTP(secret, checkTime, timeStepSec);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(cleanToken))) {
      return true;
    }
  }
  return false;
}

/**
 * Generate a set of 8 random recovery codes, formatted like ABCD-EFGH
 */
export function generateRecoveryCodes(count = 8): { rawCodes: string[]; hashedCodes: string[] } {
  const rawCodes: string[] = [];
  const hashedCodes: string[] = [];

  for (let i = 0; i < count; i++) {
    const part1 = crypto.randomBytes(3).toString('hex').toUpperCase();
    const part2 = crypto.randomBytes(3).toString('hex').toUpperCase();
    const code = `${part1}-${part2}`;
    rawCodes.push(code);

    const hash = hashRecoveryCode(code);
    hashedCodes.push(hash);
  }

  return { rawCodes, hashedCodes };
}

export function hashRecoveryCode(code: string): string {
  const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export function verifyAndConsumeRecoveryCode(
  inputCode: string,
  storedHashedCodes: string[]
): { valid: boolean; remainingHashedCodes: string[] } {
  const inputHash = hashRecoveryCode(inputCode);
  const index = storedHashedCodes.findIndex(h => h === inputHash);

  if (index === -1) {
    return { valid: false, remainingHashedCodes: storedHashedCodes };
  }

  const remainingHashedCodes = [...storedHashedCodes];
  remainingHashedCodes.splice(index, 1);
  return { valid: true, remainingHashedCodes };
}

export const generateTOTPSecret = generateBase32Secret;
export const verifyRecoveryCode = verifyAndConsumeRecoveryCode;

