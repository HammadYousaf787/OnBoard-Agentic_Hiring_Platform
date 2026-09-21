"use client";

import {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  forwardRef,
} from "react";
import clsx from "clsx";

const baseControlClasses =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-gray-400 outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary-soft disabled:bg-gray-50 disabled:text-gray-400";

export function Label(props: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      {...props}
      className={clsx("mb-1.5 block text-sm font-medium text-foreground", props.className)}
    />
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => (
    <input ref={ref} className={clsx(baseControlClasses, className)} {...rest} />
  )
);
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...rest }, ref) => (
  <textarea ref={ref} className={clsx(baseControlClasses, "resize-none", className)} {...rest} />
));
Textarea.displayName = "Textarea";

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...rest }, ref) => (
  <select ref={ref} className={clsx(baseControlClasses, "cursor-pointer", className)} {...rest} />
));
Select.displayName = "Select";

export function FieldGroup({
  label,
  htmlFor,
  error,
  hint,
  children,
  required,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor}>
        {label} {required && <span className="text-danger">*</span>}
      </Label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
