"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function Home() {
  const [status, setStatus] = useState("Checking server...");

  useEffect(() => {
    // Call the Express health route to confirm client and server are connected
    api<{ ok: boolean; db: string }>("/api/health")
      .then((d) =>
        setStatus(
          d.ok ? `Server connected (database: ${d.db})` : "Server problem",
        ),
      )
      .catch((e) => setStatus("Connection failed: " + e.message));
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold">PUB AssessAI</h1>
        <p className="mt-3 text-gray-600">{status}</p>
      </div>
    </main>
  );
}
