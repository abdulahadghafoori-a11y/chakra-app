import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";

import * as schema from "@/drizzle/schema";
import { resolveDatabaseUrl } from "@/lib/database-url";

let _db: NeonHttpDatabase<typeof schema> | null = null;

function getDb(): NeonHttpDatabase<typeof schema> {
  if (_db) return _db;
  let url: string;
  try {
    url = resolveDatabaseUrl();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `${msg} Copy .env.example to .env.local and configure Neon.`,
    );
  }
  _db = drizzle(neon(url), { schema });
  return _db;
}

/** Lazy Neon + Drizzle client so importing modules does not require env at build time. */
export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real as object, prop, receiver);
    return typeof value === "function"
      ? (value as (...a: unknown[]) => unknown).bind(real)
      : value;
  },
});
