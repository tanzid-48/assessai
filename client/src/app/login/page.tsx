"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import {
  AuthShell,
  ErrorBox,
  Field,
  GoogleButton,
  OrDivider,
  SubmitButton,
} from "@/components/AuthShell";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await authClient.signIn.email({ email, password });

    setLoading(false);
    if (error) {
      setError(error.message || "Invalid email or password");
      return;
    }
    router.push("/dashboard");
  }

  async function handleGoogle() {
    // After Google, the user returns to /dashboard, which redirects by role
    await authClient.signIn.social({
      provider: "google",
      callbackURL: `${window.location.origin}/dashboard`,
    });
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to continue to your dashboard."
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@pub.edu"
          autoComplete="email"
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="Your password"
          autoComplete="current-password"
        />

        <ErrorBox message={error} />
        <SubmitButton loading={loading}>
          {loading ? "Logging in..." : "Log in"}
        </SubmitButton>
      </form>

      <OrDivider />
      <GoogleButton onClick={handleGoogle} label="Continue with Google" />

      <p className="mt-8 text-center text-sm text-neutral-500">
        New here?{" "}
        <Link
          href="/register"
          className="font-semibold text-indigo-500 hover:underline"
        >
          Create a student account
        </Link>
      </p>
    </AuthShell>
  );
}
