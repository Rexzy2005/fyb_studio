"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { wipeAllClientStorage } from "@/lib/storage/wipeAll";

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={pending}
      onClick={async () => {
        setPending(true);
        await wipeAllClientStorage();
        await signOut({ callbackUrl: "/" });
      }}
    >
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
