"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { staffUsers } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/staff-auth/password";
import {
  createStaffSessionJwt,
  isAuthSecretConfigured,
  STAFF_SESSION_COOKIE,
  staffSessionCookieOptions,
  verifyStaffSessionJwt,
} from "@/lib/staff-auth/session";

function safeNextPath(raw: string | null | undefined): string {
  const s = raw?.trim() ?? "";
  if (s.startsWith("/") && !s.startsWith("//")) return s;
  return "/";
}

export async function loginStaff(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? ""));

  if (!isAuthSecretConfigured()) {
    redirect("/login?error=config");
  }
  if (!email || !password) {
    redirect("/login?error=1");
  }

  const rows = await db
    .select({
      id: staffUsers.id,
      passwordHash: staffUsers.passwordHash,
    })
    .from(staffUsers)
    .where(eq(staffUsers.email, email))
    .limit(1);

  const row = rows[0];
  const ok = row && (await verifyPassword(password, row.passwordHash));
  if (!ok) {
    redirect("/login?error=1");
  }

  const jwt = await createStaffSessionJwt({ id: row!.id, email });
  (await cookies()).set(STAFF_SESSION_COOKIE, jwt, staffSessionCookieOptions());
  redirect(next);
}

export async function logoutStaff() {
  (await cookies()).delete(STAFF_SESSION_COOKIE);
  redirect("/login");
}

/** Used by login page: if already signed redirect away. */
export async function readStaffSessionPayload(): Promise<{
  sub: string;
  email: string;
} | null> {
  if (!isAuthSecretConfigured()) return null;
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  return verifyStaffSessionJwt(token);
}
