import { ReactNode } from "react";
import clsx from "clsx";

/**
 * Marks copy that only exists for this demo/prototype (seed data, sample
 * credentials, simulated AI, etc.) so it's clear what is placeholder vs.
 * real product behavior.
 */
export function DemoTag({ className }: { className?: string }) {
  return (
    <span
      className={clsx(
        "font-semibold tracking-wide text-primary",
        className
      )}
    >
      [demo]
    </span>
  );
}

export function DemoText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={className}>
      <DemoTag /> {children}
    </span>
  );
}
