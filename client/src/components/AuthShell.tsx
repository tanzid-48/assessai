"use client";

import { useState } from "react";

const FEATURES = [
  "Questions generated from your own slides and notes",
  "AI marking, published only after teacher approval",
  "Practice and timed exams with integrity checks",
];

const inputClass =
  "w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm outline-none transition placeholder:text-neutral-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-neutral-700 dark:bg-neutral-950";

type FieldProps = {
  label: string;
  type?: "text" | "email" | "password";
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
};

// A labelled input. Password fields get a Show/Hide toggle.
export function Field({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
}: FieldProps) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";

  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <div className="relative">
        <input
          required
          type={isPassword && show ? "text" : type}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} ${isPassword ? "pr-16" : ""}`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute inset-y-0 right-3 text-xs font-medium text-neutral-500 hover:text-indigo-500"
          >
            {show ? "Hide" : "Show"}
          </button>
        )}
      </div>
    </label>
  );
}

// Red message box for form errors
export function ErrorBox({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
      {message}
    </div>
  );
}

// Main gradient button with a spinner while loading
export function SubmitButton({
  loading,
  children,
}: {
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition hover:brightness-110 disabled:opacity-70"
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
      )}
      {children}
    </button>
  );
}

export function GoogleButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-3 rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:hover:bg-neutral-800"
    >
      <svg viewBox="0 0 48 48" className="h-5 w-5">
        <path
          fill="#EA4335"
          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        />
        <path
          fill="#4285F4"
          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
        />
        <path
          fill="#FBBC05"
          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
        />
        <path
          fill="#34A853"
          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
        />
      </svg>
      {label}
    </button>
  );
}

export function OrDivider() {
  return (
    <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wide text-neutral-500">
      <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
      or
      <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
    </div>
  );
}

type ShellProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
};

// Centered card: brand panel on large screens, form always
export function AuthShell({ title, subtitle, children }: ShellProps) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-neutral-100 px-4 py-8 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100 sm:px-6">
      {/* Soft background glow */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-fuchsia-500/20 blur-3xl" />

      {/* The card */}
      <div className="relative w-full max-w-4xl overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900 lg:grid lg:grid-cols-2">
        {/* Brand panel (hidden on small screens) */}
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-10 text-white lg:flex">
          <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-fuchsia-400/20 blur-3xl" />

          <div className="relative flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 font-bold backdrop-blur">
              A
            </div>
            <span className="font-semibold">PUB AssessAI</span>
          </div>

          <div className="relative py-10">
            <h2 className="text-3xl font-bold leading-tight">
              Smarter assessment, grounded in your course material.
            </h2>
            <ul className="mt-6 space-y-3 text-sm text-white/90">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs">
                    ✓
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          <p className="relative text-xs text-white/70">
            PUB CSE Fest-26 Hackathon · Team ASTRA-23
          </p>
        </aside>

        {/* Form panel */}
        <main className="p-6 sm:p-10">
          {/* Small logo, shown only where the brand panel is hidden */}
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 font-bold text-white">
              A
            </div>
            <span className="font-semibold">PUB AssessAI</span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {title}
          </h1>
          <p className="mt-2 text-sm text-neutral-500">{subtitle}</p>

          <div className="mt-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
