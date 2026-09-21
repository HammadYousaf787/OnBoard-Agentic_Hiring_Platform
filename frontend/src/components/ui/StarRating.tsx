import { Star, StarHalf } from "lucide-react";
import clsx from "clsx";

export function StarRating({
  value,
  size = "md",
  showValue = true,
  className,
}: {
  value: number;
  size?: "sm" | "md" | "lg";
  showValue?: boolean;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(5, value));
  const full = Math.floor(clamped);
  const hasHalf = clamped - full >= 0.5;
  const empty = 5 - full - (hasHalf ? 1 : 0);

  const iconSize = { sm: "h-3.5 w-3.5", md: "h-4 w-4", lg: "h-5 w-5" }[size];
  const textSize = { sm: "text-xs", md: "text-sm", lg: "text-base" }[size];

  return (
    <div className={clsx("inline-flex items-center gap-1", className)}>
      <div className="flex items-center text-amber-400">
        {Array.from({ length: full }).map((_, i) => (
          <Star key={`full-${i}`} className={iconSize} fill="currentColor" strokeWidth={0} />
        ))}
        {hasHalf && (
          <StarHalf className={iconSize} fill="currentColor" strokeWidth={0} />
        )}
        {Array.from({ length: empty }).map((_, i) => (
          <Star key={`empty-${i}`} className={clsx(iconSize, "text-gray-200")} fill="currentColor" strokeWidth={0} />
        ))}
      </div>
      {showValue && (
        <span className={clsx(textSize, "font-medium text-foreground")}>
          {clamped.toFixed(1)}
        </span>
      )}
    </div>
  );
}
