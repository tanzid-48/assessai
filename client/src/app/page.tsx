"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  BookOpenCheck,
  ClipboardCheck,
  FileText,
  GraduationCap,
  Library,
  Lock,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

type Card = { icon: LucideIcon; title: string; text: string };

// The path from a PDF to a published result
const STEPS: Card[] = [
  {
    icon: FileText,
    title: "Upload materials",
    text: "The teacher adds CLOs and topics and uploads course PDFs. Every page becomes searchable.",
  },
  {
    icon: Sparkles,
    title: "AI writes questions",
    text: "MCQ, short and broad questions with difficulty, Bloom level, CLO and the exact source page.",
  },
  {
    icon: Library,
    title: "Teacher approves",
    text: "Edit, approve or reject. Only approved questions reach papers, practice and exams.",
  },
  {
    icon: Timer,
    title: "Timed exam",
    text: "Shuffled questions, a server-side timer, autosave and a tab-switch log.",
  },
  {
    icon: ClipboardCheck,
    title: "Marks you can trust",
    text: "The AI marks against a scheme the teacher approved. Nothing is published without approval.",
  },
];

const TEACHER: Card[] = [
  {
    icon: Sparkles,
    title: "Questions from your own materials",
    text: "Every question links to a CLO, a topic and a page.",
  },
  {
    icon: FileText,
    title: "Papers and answer keys",
    text: "Mid-term, quiz or custom layouts with coverage, exported to Word.",
  },
  {
    icon: ClipboardCheck,
    title: "Marking with reasons",
    text: "Marks per criterion with a one-sentence justification you can change.",
  },
  {
    icon: BarChart3,
    title: "Class analytics",
    text: "See the hardest topics and who needs help.",
  },
];

const STUDENT: Card[] = [
  {
    icon: BookOpenCheck,
    title: "Practice by topic",
    text: "The solution and the source pages appear right after you answer.",
  },
  {
    icon: MessageSquareText,
    title: "AI tutor",
    text: "Answers only from your course materials, and says so when it cannot find the answer.",
  },
  {
    icon: Timer,
    title: "Fair timed exams",
    text: "Autosave, a clear countdown and automatic hand-in when the time ends.",
  },
  {
    icon: BarChart3,
    title: "Your progress",
    text: "Topic scores and your weak topics, with one tap to practise them.",
  },
];

const PRINCIPLES: Card[] = [
  {
    icon: ShieldCheck,
    title: "The AI never decides alone",
    text: "AI marks stay unapproved until the teacher approves them. Students see nothing before the results are published.",
  },
  {
    icon: BookOpenCheck,
    title: "Every answer has a source",
    text: "Questions, solutions and tutor answers point to the file and page they came from.",
  },
  {
    icon: Lock,
    title: "Rules live on the server",
    text: "Time, shuffling, marks and the exam lock are decided by the server. The AI tutor and practice are closed during an exam.",
  },
];

function IconBox({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
      <Icon size={20} />
    </div>
  );
}

function Section({
  id,
  title,
  subtitle,
  children,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="mx-auto w-full max-w-6xl scroll-mt-16 px-4 py-14 sm:px-6 sm:py-20"
    >
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-3 text-neutral-600 dark:text-neutral-400">
            {subtitle}
          </p>
        )}
      </div>
      <div className="mt-10">{children}</div>
    </section>
  );
}

function Features({ role, cards }: { role: string; cards: Card[] }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
        {role}
      </p>
      <ul className="mt-4 space-y-4">
        {cards.map((c) => (
          <li key={c.title} className="flex gap-3">
            <IconBox icon={c.icon} />
            <div>
              <p className="text-sm font-semibold">{c.title}</p>
              <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">
                {c.text}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Home() {
  const { data: session } = authClient.useSession();
  const [status, setStatus] = useState<"checking" | "ok" | "down">("checking");

  // Call the Express health route to confirm client and server are connected
  useEffect(() => {
    api<{ ok: boolean }>("/api/health")
      .then((d) => setStatus(d.ok ? "ok" : "down"))
      .catch(() => setStatus("down"));
  }, []);

  const signedIn = Boolean(session);

  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/80 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <GraduationCap size={18} />
            </span>
            PUB AssessAI
          </Link>
          <nav className="flex items-center gap-2">
            <a
              href="#how"
              className="hidden rounded-lg px-3 py-2 text-sm text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 sm:inline"
            >
              How it works
            </a>
            {signedIn ? (
              <Link
                href="/dashboard"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
              >
                Open dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
                >
                  Get started
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <div className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-indigo-50 to-transparent dark:from-indigo-500/10"
        />
        <div className="anim-slide-up relative mx-auto max-w-4xl px-4 pb-10 pt-16 text-center sm:px-6 sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-medium text-indigo-700 dark:border-indigo-500/30 dark:bg-neutral-900 dark:text-indigo-300">
            <Sparkles size={13} />
            AI question preparation, assessment and learning
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-6xl">
            From course material to{" "}
            <span className="text-indigo-600 dark:text-indigo-400">
              trusted results
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-neutral-600 dark:text-neutral-400 sm:text-lg">
            Teachers turn their own PDFs into questions, papers and timed exams.
            The AI helps with marking, but the teacher always has the last word.
            Students get practice, explanations from the materials and a clear
            view of their progress.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={signedIn ? "/dashboard" : "/register"}
              className="w-full rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 sm:w-auto"
            >
              {signedIn ? "Open your dashboard" : "Create an account"}
            </Link>
            {!signedIn && (
              <Link
                href="/login"
                className="w-full rounded-lg border border-neutral-300 px-6 py-3 text-sm font-semibold transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800 sm:w-auto"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Three promises */}
      <div className="mx-auto grid max-w-6xl gap-4 px-4 sm:px-6 md:grid-cols-3">
        {PRINCIPLES.map((p) => (
          <div
            key={p.title}
            className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <IconBox icon={p.icon} />
            <p className="mt-3 text-sm font-semibold">{p.title}</p>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              {p.text}
            </p>
          </div>
        ))}
      </div>

      {/* How it works */}
      <Section
        id="how"
        title="How it works"
        subtitle="One path from a PDF to a published, approved result."
      >
        <ol className="grid gap-4 md:grid-cols-5">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              className="relative rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
            >
              <span className="absolute right-4 top-4 text-xs font-semibold text-neutral-400">
                {i + 1}
              </span>
              <IconBox icon={s.icon} />
              <p className="mt-3 text-sm font-semibold">{s.title}</p>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                {s.text}
              </p>
            </li>
          ))}
        </ol>
      </Section>

      {/* By role */}
      <div className="border-y border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/40">
        <Section title="Built for teachers and students">
          <div className="grid gap-4 md:grid-cols-2">
            <Features role="For teachers" cards={TEACHER} />
            <Features role="For students" cards={STUDENT} />
          </div>
        </Section>
      </div>

      {/* Final call */}
      <Section title="Ready to try it?">
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href={signedIn ? "/dashboard" : "/login"}
            className="w-full rounded-lg bg-indigo-600 px-6 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-indigo-500 sm:w-auto"
          >
            {signedIn ? "Open your dashboard" : "Sign in"}
          </Link>
          {!signedIn && (
            <Link
              href="/register"
              className="w-full rounded-lg border border-neutral-300 px-6 py-3 text-center text-sm font-semibold transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800 sm:w-auto"
            >
              Create an account
            </Link>
          )}
        </div>
      </Section>

      {/* Footer */}
      <footer className="border-t border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-neutral-500 sm:flex-row sm:px-6">
          <p>
            PUB CSE Fest-26 Hackathon · Problem B2 · Team ASTRA-23 · Pundra
            University of Science &amp; Technology
          </p>
          <p className="inline-flex items-center gap-2" aria-live="polite">
            <span
              className={`h-2 w-2 rounded-full ${
                status === "ok"
                  ? "bg-emerald-500"
                  : status === "down"
                    ? "bg-red-500"
                    : "animate-pulse bg-neutral-400"
              }`}
            />
            {status === "ok"
              ? "Server connected"
              : status === "down"
                ? "Server not reachable"
                : "Checking server..."}
          </p>
        </div>
      </footer>
    </div>
  );
}
