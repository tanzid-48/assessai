"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap, LogOut, Menu } from "lucide-react";
import { NAV, type Role } from "@/lib/nav";

type Props = {
  role: Role;
  userName: string;
  onLogout: () => void;
  children: React.ReactNode;
};

export default function DashboardShell({
  role,
  userName,
  onLogout,
  children,
}: Props) {
  // Controls the slide-in menu on small screens
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Pages that are not built yet stay hidden
  const items = NAV[role].filter((item) => !item.soon);

  // Up to two letters shown in the avatar circle
  const initials = userName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100 md:flex">
      {/* Dark overlay behind the mobile menu */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar: slide-in drawer on mobile, sticky column on desktop */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-neutral-200 bg-white transition-transform dark:border-neutral-800 dark:bg-neutral-900 md:sticky md:top-0 md:h-screen md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand */}
        <div className="flex h-16 items-center gap-2.5 border-b border-neutral-200 px-5 dark:border-neutral-800">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <GraduationCap size={18} />
          </div>
          <span className="font-semibold tracking-tight">PUB AssessAI</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {items.map((item) => {
            const Icon = item.icon;
            // Nested pages keep their parent highlighted; top-level pages match exactly
            const nested = item.href.split("/").length > 2;
            const active =
              pathname === item.href ||
              (nested && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
                    : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                }`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Signed-in user */}
        <div className="border-t border-neutral-200 p-3 dark:border-neutral-800">
          <div className="flex items-center gap-3 px-2 py-1.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{userName}</p>
              <p className="truncate text-xs capitalize text-neutral-500">
                {role}
              </p>
            </div>
            <button
              onClick={onLogout}
              aria-label="Log out"
              title="Log out"
              className="rounded-md p-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar, only on small screens */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-neutral-200 bg-white px-4 dark:border-neutral-800 dark:bg-neutral-900 md:hidden">
          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="-ml-2 rounded-md p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <Menu size={20} />
          </button>
          <span className="font-semibold">PUB AssessAI</span>
        </header>

        <main className="flex-1 p-4 sm:p-6 md:p-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
