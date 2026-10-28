"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import RoleGuard from "@/components/RoleGuard";
import PageHeader from "@/components/PageHeader";
import PracticeSetup from "@/components/PracticeSetup";
import PracticePlayer from "@/components/PracticePlayer";
import TutorPanel from "@/components/TutorPanel";
import { api } from "@/lib/api";
import type { CourseInfo, Session, StartBody } from "@/lib/practice";

const fieldClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-neutral-700 dark:bg-neutral-950";

type Tab = "practice" | "tutor";

function PracticeView() {
  const router = useRouter();
  const params = useSearchParams();

  const [courses, setCourses] = useState<CourseInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("practice");
  const [session, setSession] = useState<Session | null>(null);
  const [starting, setStarting] = useState(false);
  const [tutorCourse, setTutorCourse] = useState("");
  // Changes with every new setup form, so the form starts fresh after a session
  const [formKey, setFormKey] = useState(0);
  const [preTopic, setPreTopic] = useState(params.get("topic") ?? "");
  const [preCourse, setPreCourse] = useState(params.get("course") ?? "");
  const resumed = useRef(false);

  // The courses with their topics, and (after a reload) the session that was open
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await api<{ courses: CourseInfo[] }>(
          "/api/practice/courses",
        );
        if (!alive) return;
        setCourses(data.courses);
        setTutorCourse(
          data.courses.find((c) => c.courseId === params.get("course"))
            ?.courseId ??
            data.courses[0]?.courseId ??
            "",
        );

        const id = params.get("session");
        if (id && !resumed.current) {
          resumed.current = true;
          try {
            const s = await api<Session>(`/api/practice/sessions/${id}`);
            if (alive) setSession(s);
          } catch {
            router.replace("/student/practice");
          }
        }
      } catch (e) {
        if (alive)
          setError(e instanceof Error ? e.message : "Could not load practice");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start(body: StartBody) {
    setStarting(true);
    try {
      const s = await api<Session>("/api/practice/sessions", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setSession(s);
      // The session id in the address lets the student continue after a reload
      router.replace(`/student/practice?session=${s.sessionId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start practice");
    } finally {
      setStarting(false);
    }
  }

  function leave(topicName?: string) {
    const course = courses.find((c) =>
      c.topics.some((t) => t.name === topicName),
    );
    setPreCourse(course?.courseId ?? preCourse);
    setPreTopic(
      course?.topics.find((t) => t.name === topicName)?.topicId ?? "",
    );
    setSession(null);
    setFormKey((k) => k + 1);
    router.replace("/student/practice");
  }

  if (loading) {
    return (
      <div className="h-64 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-900" />
    );
  }
  if (error) return <p className="text-sm text-red-500">{error}</p>;
  if (courses.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500 dark:border-neutral-700">
        You are not enrolled in any course yet.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {!session && (
        <div className="inline-flex rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800">
          {(["practice", "tutor"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === t
                  ? "bg-white shadow-sm dark:bg-neutral-950"
                  : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
              }`}
            >
              {t === "practice" ? "Practice" : "AI tutor"}
            </button>
          ))}
        </div>
      )}

      {session ? (
        <PracticePlayer
          session={session}
          onChange={setSession}
          onExit={() => leave()}
          onPractiseTopic={(name) => leave(name)}
        />
      ) : tab === "practice" ? (
        <PracticeSetup
          key={formKey}
          courses={courses}
          initialCourseId={preCourse}
          initialTopicId={preTopic}
          busy={starting}
          onStart={(b) => void start(b)}
        />
      ) : (
        <div className="space-y-4">
          {courses.length > 1 && (
            <label className="block sm:max-w-sm">
              <span className="text-sm font-medium">Course</span>
              <select
                value={tutorCourse}
                onChange={(e) => setTutorCourse(e.target.value)}
                className={`${fieldClass} mt-1.5`}
              >
                {courses.map((c) => (
                  <option key={c.courseId} value={c.courseId}>
                    {c.code} · {c.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <TutorPanel key={tutorCourse} courseId={tutorCourse} />
        </div>
      )}
    </div>
  );
}

export default function PracticePage() {
  return (
    <RoleGuard role="student">
      <div className="space-y-6">
        <PageHeader
          title="Practice"
          description="Practise with approved questions at any time. The solution appears after you answer."
        />
        <Suspense
          fallback={
            <div className="h-64 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-900" />
          }
        >
          <PracticeView />
        </Suspense>
      </div>
    </RoleGuard>
  );
}
