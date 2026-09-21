"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { isSameDay } from "@/lib/datetime";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function AppointmentCalendar({
  selectedDate,
  onSelectDate,
  countForDate,
}: {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  countForDate: (date: Date) => number;
}) {
  const [viewDate, setViewDate] = useState(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  );

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const today = new Date();

  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;

  const cells = Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - startWeekday + 1;
    const date = new Date(year, month, dayNum);
    return { date, inMonth: dayNum >= 1 && dayNum <= daysInMonth };
  });

  function goPrev() {
    setViewDate(new Date(year, month - 1, 1));
  }
  function goNext() {
    setViewDate(new Date(year, month + 1, 1));
  }
  function goToday() {
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
    onSelectDate(today);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">
          {viewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={goToday}
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-gray-50 cursor-pointer"
          >
            Today
          </button>
          <button
            onClick={goPrev}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 cursor-pointer"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={goNext}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 cursor-pointer"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1.5">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map(({ date, inMonth }, i) => {
          const count = countForDate(date);
          const isToday = isSameDay(date, today);
          const isSelected = isSameDay(date, selectedDate);
          return (
            <button
              key={i}
              onClick={() => onSelectDate(date)}
              className={clsx(
                "flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-sm transition-colors cursor-pointer",
                !inMonth && "text-gray-300",
                inMonth && !isSelected && "text-foreground hover:bg-gray-50",
                isSelected && "bg-primary text-white",
                isToday && !isSelected && "font-semibold text-primary"
              )}
            >
              <span>{date.getDate()}</span>
              {count > 0 && (
                <span
                  className={clsx(
                    "h-1.5 w-1.5 rounded-full",
                    isSelected ? "bg-white" : "bg-primary"
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
