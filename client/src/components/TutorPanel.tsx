"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, Send, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import type { Source } from "@/lib/practice";

type Reply = { answered: boolean; answer: string; sources: Source[] };
type Message = {
  id: number;
  question: string;
  reply?: Reply;
  error?: string;
};

// The server lets one student ask once every few seconds (to protect the free AI limit).
// The button waits the same time, so the student never sees an error for asking too fast.
const COOLDOWN_SECONDS = 4;

type Props = { courseId: string };

// Ask a question about a course. The answer is written only from the uploaded course materials.
export default function TutorPanel({ courseId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);

  // Count the waiting time down
  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  // Keep the newest message in view
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  async function ask() {
    const question = text.trim();
    if (question.length < 3 || busy || wait > 0) return;

    const id = Date.now();
    setMessages((m) => [...m, { id, question }]);
    setText("");
    setBusy(true);
    setWait(COOLDOWN_SECONDS);

    try {
      const reply = await api<Reply>("/api/tutor/ask", {
        method: "POST",
        body: JSON.stringify({ courseId, question }),
      });
      setMessages((m) => m.map((x) => (x.id === id ? { ...x, reply } : x)));
    } catch (e) {
      const error =
        e instanceof Error ? e.message : "The tutor did not respond";
      setMessages((m) => m.map((x) => (x.id === id ? { ...x, error } : x)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start gap-3 border-b border-neutral-200 p-4 dark:border-neutral-800">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
          <Sparkles size={18} />
        </div>
        <div>
          <p className="text-sm font-semibold">AI tutor</p>
          <p className="text-xs text-neutral-500">
            Answers come only from your course materials, with the pages that
            were used. If the materials do not cover your question, the tutor
            says so.
          </p>
        </div>
      </div>

      <div className="max-h-[28rem] min-h-48 space-y-5 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="py-8 text-center text-sm text-neutral-500">
            Ask anything about this course, for example &quot;What is the
            difference between BFS and DFS?&quot;
          </p>
        )}

        {messages.map((m) => (
          <div key={m.id} className="anim-row-in space-y-2.5">
            <div className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-indigo-600 px-4 py-2 text-sm text-white">
                {m.question}
              </p>
            </div>

            {!m.reply && !m.error && (
              <div className="flex items-center gap-2 text-sm text-neutral-500">
                <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
                Reading the course materials...
              </div>
            )}

            {m.error && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
                {m.error}
              </p>
            )}

            {m.reply && (
              <div
                className={`max-w-[92%] rounded-2xl rounded-bl-sm border px-4 py-3 text-sm ${
                  m.reply.answered
                    ? "border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950"
                    : "border-amber-500/30 bg-amber-500/10"
                }`}
              >
                <p className="whitespace-pre-wrap break-words leading-relaxed">
                  {m.reply.answer}
                </p>
                {m.reply.sources.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {m.reply.sources.map((s) => (
                      <span
                        key={`${s.fileName}:${s.page}`}
                        className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
                      >
                        <BookOpen size={12} />
                        {s.fileName} · page {s.page}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="flex items-end gap-2 border-t border-neutral-200 p-3 dark:border-neutral-800">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter makes a new line
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask();
            }
          }}
          rows={2}
          maxLength={500}
          placeholder="Type your question..."
          aria-label="Your question"
          className="min-w-0 flex-1 resize-none rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-neutral-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-neutral-700 dark:bg-neutral-950"
        />
        <button
          onClick={() => void ask()}
          disabled={text.trim().length < 3 || busy || wait > 0}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send size={15} />
          {wait > 0 ? `${wait}s` : "Ask"}
        </button>
      </div>
    </div>
  );
}
