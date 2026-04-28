"use client";

import { ClientOnly } from "@/components/theme/ClientOnly";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export function ThemeToggleFloating() {
  return (
    <div className="fixed bottom-4 right-4 z-50">
      <ClientOnly>
        <ThemeToggle compact />
      </ClientOnly>
    </div>
  );
}

