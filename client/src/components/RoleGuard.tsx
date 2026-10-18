"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import DashboardShell from "@/components/DashboardShell";
import type { Role } from "@/lib/nav";

type Props = {
  role: Role;
  children: React.ReactNode;
};

export default function RoleGuard({ role, children }: Props) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const userRole =
    (session?.user as { role?: string } | undefined)?.role ?? "student";

  // Redirect if not logged in or the role does not match.
  // This is only for convenience; the real protection is requireRole on the server.
  useEffect(() => {
    if (isPending) return;
    if (!session) router.replace("/login");
    else if (userRole !== role) router.replace(`/${userRole}`);
  }, [isPending, session, userRole, role, router]);

  async function handleLogout() {
    await authClient.signOut();
    router.replace("/login");
  }

  if (isPending || !session || userRole !== role) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-neutral-500">
        Loading...
      </div>
    );
  }

  return (
    <DashboardShell
      role={role}
      userName={session.user.name}
      onLogout={handleLogout}
    >
      {children}
    </DashboardShell>
  );
}
