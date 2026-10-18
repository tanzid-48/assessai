"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

type Props = {
  role: "admin" | "teacher" | "student";
  children: React.ReactNode;
};

export default function RoleGuard({ role, children }: Props) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const userRole =
    (session?.user as { role?: string } | undefined)?.role ?? "student";

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
    return <p className="p-8 text-gray-500">Loading...</p>;
  }

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <h1 className="font-bold">PUB AssessAI</h1>
        <div className="flex items-center gap-4 text-sm">
          <span>
            {session.user.name} ({userRole})
          </span>
          <button
            onClick={handleLogout}
            className="rounded border px-3 py-1 hover:bg-gray-100 hover:text-black"
          >
            Logout
          </button>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
