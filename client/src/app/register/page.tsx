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

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    // No role is sent. The server always creates new users as "student".
    const { error } = await authClient.signUp.email({ name, email, password });
    setLoading(false);

    if (error) {
      setError(error.message || "Registration failed");
      return;
    }
    router.push("/dashboard");
  }

  async function handleGoogle() {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: `${window.location.origin}/dashboard`,
    });
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Students can register here. Teachers and admins are added by the department."
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <Field
          label="Full name"
          value={name}
          onChange={setName}
          placeholder="Your name"
          autoComplete="name"
        />
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
          placeholder="At least 8 characters"
          autoComplete="new-password"
        />
        <Field
          label="Confirm password"
          type="password"
          value={confirm}
          onChange={setConfirm}
          placeholder="Repeat the password"
          autoComplete="new-password"
        />

        <ErrorBox message={error} />
        <SubmitButton loading={loading}>
          {loading ? "Creating account..." : "Create account"}
        </SubmitButton>
      </form>

      <OrDivider />
      <GoogleButton onClick={handleGoogle} label="Sign up with Google" />

      <p className="mt-8 text-center text-sm text-neutral-500">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-semibold text-indigo-500 hover:underline"
        >
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
