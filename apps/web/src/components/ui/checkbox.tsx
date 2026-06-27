"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CheckboxProps extends Omit<React.ComponentProps<"input">, "type"> {
  onCheckedChange?: (checked: boolean) => void;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, onChange, disabled, ...props }, ref) => {
    return (
      <label
        className={cn(
          "relative inline-flex size-4 shrink-0 cursor-pointer items-center justify-center",
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
      >
        <input
          type="checkbox"
          ref={ref}
          checked={checked}
          disabled={disabled}
          className="peer sr-only"
          onChange={(e) => {
            onChange?.(e);
            onCheckedChange?.(e.target.checked);
          }}
          onClick={(e) => e.stopPropagation()}
          {...props}
        />
        <span
          aria-hidden
          className={cn(
            "pointer-events-none flex size-4 items-center justify-center rounded-[4px] border border-input bg-background shadow-xs transition-colors",
            "peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50",
            "peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground",
            "peer-indeterminate:border-primary peer-indeterminate:bg-primary peer-indeterminate:text-primary-foreground",
            "peer-checked:[&_svg]:opacity-100 peer-indeterminate:[&_svg]:opacity-100",
          )}
        >
          <Check className="size-3 opacity-0" />
        </span>
      </label>
    );
  },
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
