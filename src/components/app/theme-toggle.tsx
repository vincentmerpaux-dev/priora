"use client";

import { Moon, Sun } from "@/components/icons";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  function toggle() {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    document.cookie = `priora-theme=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Changer de thème" title="Changer de thème">
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
    </Button>
  );
}
