"use client";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import type { CodingMode } from "@/lib/coding/types";
import { cn } from "@/lib/utils";

type ModeSwitchProps = {
  mode: CodingMode;
  onChange: (mode: CodingMode) => void;
};

export function ModeSwitch({ mode, onChange }: ModeSwitchProps) {
  return (
    <ButtonGroup className="rounded-full border border-border/60 bg-muted/40 p-1">
      <Button
        className={cn(
          "h-7 rounded-full px-3 text-xs",
          mode === "chat"
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:text-foreground"
        )}
        onClick={() => onChange("chat")}
        size="sm"
        variant="ghost"
      >
        Chat
      </Button>
      <Button
        className={cn(
          "h-7 rounded-full px-3 text-xs",
          mode === "coding"
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:text-foreground"
        )}
        onClick={() => onChange("coding")}
        size="sm"
        variant="ghost"
      >
        Coding
      </Button>
    </ButtonGroup>
  );
}
