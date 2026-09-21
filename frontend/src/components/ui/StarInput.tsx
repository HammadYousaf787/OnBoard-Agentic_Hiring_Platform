"use client";

import { useState } from "react";
import { StarRating } from "./StarRating";

/** Click-to-rate stars in half-star steps; clicking the current value again is left to the caller (clear button). */
export function StarInput({
  value,
  onChange,
  disabled,
}: {
  value: number | undefined;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;

  return (
    <div className="inline-flex items-center gap-2">
      <div className="relative inline-block" onMouseLeave={() => setHover(null)}>
        <StarRating value={shown} size="lg" showValue={false} />
        {!disabled && (
          <div className="absolute inset-0 flex" role="radiogroup" aria-label="HR rating">
            {Array.from({ length: 10 }, (_, i) => {
              const v = (i + 1) / 2;
              return (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={value === v}
                  aria-label={`Rate ${v} stars`}
                  className="flex-1 cursor-pointer"
                  onMouseEnter={() => setHover(v)}
                  onFocus={() => setHover(v)}
                  onBlur={() => setHover(null)}
                  onClick={() => onChange(v)}
                />
              );
            })}
          </div>
        )}
      </div>
      <span className="text-sm font-medium text-foreground">
        {shown > 0 ? shown.toFixed(1) : "Not rated"}
      </span>
    </div>
  );
}
