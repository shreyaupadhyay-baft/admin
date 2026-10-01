import { createHash, randomBytes } from "node:crypto";

// Session tokens are opaque (unguessable random bytes), never structured or
// signed — only their SHA-256 hash is ever persisted, so a database leak
// doesn't yield a usable credential.
export const generateOpaqueToken = (): string => randomBytes(32).toString("base64url");

export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");
