import * as React from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-[var(--radius)] border border-line-strong bg-surface px-3 text-[13px] text-fg placeholder:text-faint transition-colors hover:border-faint focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:opacity-60 aria-[invalid=true]:border-danger";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(control, "h-9", className)} {...p} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(control, "min-h-20 py-2 leading-relaxed", className)} {...p} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => (
  <select ref={ref} className={cn(control, "h-9 appearance-none bg-no-repeat pr-8", className)} {...p}>
    {children}
  </select>
));
Select.displayName = "Select";

/** Label au-dessus du champ, aide optionnelle, erreur dessous. Jamais de placeholder en guise de label. */
export function Field({
  label, htmlFor, hint, error, children, className,
}: { label: string; htmlFor?: string; hint?: string; error?: string | null; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[12px] font-medium text-fg">{label}</label>
      {children}
      {hint && !error ? <p className="text-[12px] text-muted">{hint}</p> : null}
      {error ? <p role="alert" className="text-[12px] text-danger">{error}</p> : null}
    </div>
  );
}
