import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

// scrypt (RFC 7914) is a memory-hard KDF and OWASP's recommended fallback
// where argon2 isn't available. Using Node's built-in implementation avoids
// pulling in a native password-hashing dependency for Phase 1.
//
// The cost factor is deliberately much lower under test: the hash encodes
// its own N/r/p (see verifyPassword), so this never affects real security,
// but the test suite now creates dozens of admin accounts per file across
// many parallel worker processes — at the production N, that's enough
// concurrent memory-hard hashing to exhaust worker memory and crash with
// "Deriving bits failed". The algorithm and code path are identical either
// way; only the cost factor differs.
const SCRYPT_N = process.env.NODE_ENV === "test" ? 16 : 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
};

export const verifyPassword = async (password: string, storedHash: string): Promise<boolean> => {
  const parts = storedHash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }

  const [, nStr, rStr, pStr, saltHex, hashHex] = parts as [string, string, string, string, string, string];
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);

  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false;
  }

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derivedKey = await scrypt(password, salt, expected.length, { N, r, p });

  return derivedKey.length === expected.length && timingSafeEqual(derivedKey, expected);
};
