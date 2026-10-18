"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  const items = NAV[role];

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
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar: fixed drawer on mobile, sticky column on desktop */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-neutral-200 bg-white transition-transform dark:border-neutral-800 dark:bg-neutral-900 md:sticky md:top-0 md:h-screen md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 font-bold text-white">
            A
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">PUB AssessAI</p>
            <p className="text-xs capitalize text-neutral-500">{role} panel</p>
          </div>
        </div>

        <ul className="space-y-1 px-3">
          {items.map((item) => {
            const active = pathname === item.href;

            // Pages that are not built yet are shown but cannot be clicked
            if (item.soon) {
              return (
                <li key={item.href}>
                  <span className="flex cursor-not-allowed items-center justify-between rounded-lg px-3 py-2 text-sm text-neutral-400 dark:text-neutral-600">
                    {item.label}
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide dark:bg-neutral-800">
                      Soon
                    </span>
                  </span>
                </li>
              );
            }

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/30"
                      : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-neutral-200 bg-white/80 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/80 md:justify-end md:px-8">
          {/* Menu button, only visible on small screens */}
          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 md:hidden"
          >
            ☰
          </button>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight">{userName}</p>
              <p className="text-xs capitalize text-neutral-500">{role}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              {initials}
            </div>
            <button
              onClick={onLogout}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              Logout
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
