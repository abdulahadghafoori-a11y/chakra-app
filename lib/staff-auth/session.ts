import { SignJWT, jwtVerify } from "jose";

export const STAFF_SESSION_COOKIE = "staff_session";

const MAX_AGE_SEC = 60 * 60 * 24 * 30;
const ALG = "HS256";

function authSecretBytes(): Uint8Array {
  const s = process.env.AUTH_SECRET?.trim();
  if (!s || s.length < 32) {
    throw new Error("AUTH_SECRET must be set and at least 32 characters");
  }
  return new TextEncoder().encode(s);
}

/** True when staff JWT auth can run (middleware / login). */
export function isAuthSecretConfigured(): boolean {
  const s = process.env.AUTH_SECRET?.trim();
  return Boolean(s && s.length >= 32);
}

export async function createStaffSessionJwt(user: {
  id: string;
  email: string;
}): Promise<string> {
  const key = authSecretBytes();
  return new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: ALG })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SEC}s`)
    .sign(key);
}

export async function verifyStaffSessionJwt(
  token: string | undefined,
): Promise<{ sub: string; email: string } | null> {
  if (!token || !isAuthSecretConfigured()) return null;
  try {
    const key = authSecretBytes();
    const { payload } = await jwtVerify(token, key, { algorithms: [ALG] });
    const sub = payload.sub;
    const email = typeof payload.email === "string" ? payload.email : "";
    if (!sub) return null;
    return { sub, email };
  } catch {
    return null;
  }
}

export function staffSessionCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SEC,
  };
}
