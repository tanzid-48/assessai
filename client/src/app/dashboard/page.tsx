"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function DashboardRedirect() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    const role = (session.user as { role?: string }).role ?? "student";
    router.replace(`/${role}`);
  }, [isPending, session, router]);

  return <p className="p-8 text-gray-500">Redirecting...</p>;
}
