import React from "react";
import Link from "next/link";

export function Field({
  label,
  placeholder,
  type = "text",
  required = false,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
}) {
  return (
    <label className="block space-y-1 text-sm text-amber-100/80">
      <span className="text-[11px] uppercase tracking-[0.25em] text-amber-300/70">{label}</span>
      <input
        type={type}
        required={required}
        placeholder={placeholder}
        {...props}
        className="w-full rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-amber-50 placeholder:text-amber-100/50 focus:border-amber-300 focus:outline-none"
      />
      {hint ? <span className="block text-[11px] text-amber-100/60">{hint}</span> : null}
    </label>
  );
}

export function PrimaryButton({
  label,
  icon,
  type = "button",
  className,
  fullWidth = true,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}) {
  const widthClass = fullWidth ? "w-full" : "w-auto";
  return (
    <button
      type={type}
      className={`inline-flex ${widthClass} items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#d2a85d] to-[#c2852e] px-4 py-2 text-sm font-semibold text-slate-950 shadow-[0_10px_30px_rgba(210,168,93,0.35)] transition hover:shadow-[0_16px_40px_rgba(210,168,93,0.45)] focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:from-slate-700 disabled:to-slate-600 disabled:text-amber-100 disabled:shadow-none disabled:cursor-not-allowed disabled:opacity-80 ${className ?? ""}`}
      {...props}
    >
      {icon}
      {label}
    </button>
  );
}

export function Panel({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div className="rounded-2xl border border-amber-500/25 bg-white/5 p-6 shadow-[0_10px_50px_rgba(0,0,0,0.35)]">
      {title ? (
        <p className="text-xs uppercase tracking-[0.3em] text-amber-200/80">{title}</p>
      ) : null}
      <div className={title ? "mt-4" : undefined}>{children}</div>
    </div>
  );
}

export function BackLink({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 text-sm text-amber-200/80 transition hover:text-amber-50"
    >
      ← Назад к выбору ролей
    </Link>
  );
}

export function ButtonLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#f7c66a] via-[#d89c3c] to-[#b7791f] px-5 py-3 text-base font-semibold tracking-wide text-slate-950 shadow-[0_12px_32px_rgba(210,168,93,0.5)] transition hover:translate-y-[-1px] hover:shadow-[0_16px_40px_rgba(210,168,93,0.6)] focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-2 focus:ring-offset-slate-900"
    >
      {icon}
      {label}
    </Link>
  );
}
