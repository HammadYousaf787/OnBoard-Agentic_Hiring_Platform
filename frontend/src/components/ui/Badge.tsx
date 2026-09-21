import { ReactNode } from "react";
import clsx from "clsx";

type Tone = "gray" | "green" | "amber" | "red" | "indigo" | "blue";

const toneClasses: Record<Tone, string> = {
  gray: "bg-gray-100 text-gray-700",
  green: "bg-success-soft text-success",
  amber: "bg-warning-soft text-warning",
  red: "bg-danger-soft text-danger",
  indigo: "bg-primary-soft text-primary",
  blue: "bg-blue-50 text-blue-600",
};

export function Badge({
  children,
  tone = "gray",
  className,
  dot,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        toneClasses[tone],
        className
      )}
    >
      {dot && (
        <span
          className={clsx("h-1.5 w-1.5 rounded-full", {
            "bg-gray-500": tone === "gray",
            "bg-success": tone === "green",
            "bg-warning": tone === "amber",
            "bg-danger": tone === "red",
            "bg-primary": tone === "indigo",
            "bg-blue-600": tone === "blue",
          })}
        />
      )}
      {children}
    </span>
  );
}
