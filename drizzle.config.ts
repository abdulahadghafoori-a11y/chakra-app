import { config } from "dotenv";

config();
config({ path: ".env.local", override: true });

import { defineConfig } from "drizzle-kit";

import { resolveDatabaseUrl } from "./lib/database-url";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: resolveDatabaseUrl(),
  },
});
