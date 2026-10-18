export type Role = "admin" | "teacher" | "student";
export type NavItem = { label: string; href: string; soon?: boolean };

export const NAV: Record<Role, NavItem[]> = {
  admin: [
    { label: "Dashboard", href: "/admin" },
    { label: "Courses", href: "/admin/courses", soon: true },
    { label: "Users", href: "/admin/users", soon: true },
    { label: "Enrolments", href: "/admin/enrolments", soon: true },
  ],
  teacher: [
    { label: "Dashboard", href: "/teacher" },
    { label: "Materials", href: "/teacher/materials", soon: true },
    { label: "Question bank", href: "/teacher/questions", soon: true },
    { label: "Question papers", href: "/teacher/papers", soon: true },
    { label: "Assessments", href: "/teacher/assessments", soon: true },
    { label: "Marking", href: "/teacher/marking", soon: true },
  ],
  student: [
    { label: "Dashboard", href: "/student" },
    { label: "Practice", href: "/student/practice", soon: true },
    { label: "Exams", href: "/student/exams", soon: true },
    { label: "Feedback", href: "/student/feedback", soon: true },
    { label: "Progress", href: "/student/progress", soon: true },
  ],
};
