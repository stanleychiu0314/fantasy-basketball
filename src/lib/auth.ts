import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "gooners_admin";
const THIRTY_DAYS_S = 60 * 60 * 24 * 30;

/** The cookie holds an HMAC of a fixed string, keyed by the admin password. Changing the password logs everyone out. */
function sessionToken(): string | null {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) return null;
  return createHmac("sha256", secret).update("gooners-admin-session").digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function isAdmin(): Promise<boolean> {
  const token = sessionToken();
  if (!token) return false;
  const value = (await cookies()).get(COOKIE)?.value;
  return !!value && safeEqual(value, token);
}

/** Check the password and set the session cookie. Returns false on a wrong password. */
export async function logIn(password: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD;
  const token = sessionToken();
  if (!expected || !token || !safeEqual(password, expected)) return false;
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: THIRTY_DAYS_S,
  });
  return true;
}

export async function logOut(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
