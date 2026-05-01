import { cookies } from "next/headers";

import {
  isAuthSecretConfigured,
  STAFF_SESSION_COOKIE,
  verifyStaffSessionJwt,
} from "@/lib/staff-auth/session";

/** Server components / layout: current staff user or null. */
export async function getStaffSessionOptional(): Promise<{
  sub: string;
  email: string;
} | null> {
  if (!isAuthSecretConfigured()) return null;
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  return verifyStaffSessionJwt(token);
}

/** Server actions: require valid staff JWT cookie. */
export async function assertStaffSession(): Promise<void> {
  if (!isAuthSecretConfigured()) {
    throw new Error("AUTH_SECRET is not configured");
  }
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  const payload = await verifyStaffSessionJwt(token);
  if (!payload) {
    throw new Error("Unauthorized");
  }
}
