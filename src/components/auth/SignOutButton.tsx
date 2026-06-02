"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { hardSignOut } from "@/lib/auth/hardSignOut";

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={pending}
      onClick={async () => {
        setPending(true);
        await hardSignOut("/");
      }}
    >
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
