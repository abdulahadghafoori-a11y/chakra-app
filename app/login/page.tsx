import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { loginStaff, readStaffSessionPayload } from "@/app/sales/login/actions";

export const dynamic = "force-dynamic";

type SearchParams = { next?: string; error?: string };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const next = sp.next?.trim() ?? "";
  const safeNext =
    next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const err = sp.error?.trim();

  const existing = await readStaffSessionPayload();
  if (existing) {
    redirect(safeNext);
  }

  return (
    <div className="bg-muted/30 flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Staff sign in</CardTitle>
          <CardDescription>
            Use the email and password set up with{" "}
            <code className="text-xs">npm run staff:create-user</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {err === "config" ? (
            <p className="text-destructive mb-4 text-sm">
              Server is not configured: set{" "}
              <code className="text-xs">AUTH_SECRET</code> (32+ characters).
            </p>
          ) : null}
          {err === "1" ? (
            <p className="text-destructive mb-4 text-sm">
              Invalid email or password.
            </p>
          ) : null}
          <form action={loginStaff} className="space-y-4">
            <input type="hidden" name="next" value={safeNext} />
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="text-sm"
              />
            </div>
            <Button type="submit" className="w-full">
              Continue
            </Button>
          </form>
          <p className="text-muted-foreground mt-4 text-center text-xs">
            <Link href="/" className="underline-offset-2 hover:underline">
              Back to home
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
