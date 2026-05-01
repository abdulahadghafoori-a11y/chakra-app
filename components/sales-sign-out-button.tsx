import { Button } from "@/components/ui/button";
import { logoutStaff } from "@/app/sales/login/actions";

export function SalesSignOutButton() {
  return (
    <form action={logoutStaff}>
      <Button type="submit" variant="ghost" size="sm">
        Sign out
      </Button>
    </form>
  );
}
