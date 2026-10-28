import {
  BookOpen,
  ClipboardCheck,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Library,
  MessageSquare,
  Pencil,
  Timer,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

export type Role = "admin" | "teacher" | "student";
export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  soon?: boolean;
};

// Items marked soon are hidden from the sidebar until their page is built.
// When a page is ready, delete its "soon: true".
export const NAV: Record<Role, NavItem[]> = {
  admin: [
    { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
    { label: "Courses", href: "/admin/courses", icon: BookOpen },
    { label: "Users", href: "/admin/users", icon: Users, soon: true },
    {
      label: "Enrolments",
      href: "/admin/enrolments",
      icon: ClipboardList,
    },
  ],
  teacher: [
    { label: "Dashboard", href: "/teacher", icon: LayoutDashboard },
    {
      label: "Materials",
      href: "/teacher/materials",
      icon: FileText,
      soon: true,
    },
    {
      label: "Question bank",
      href: "/teacher/questions",
      icon: Library,
      soon: true,
    },
    {
      label: "Question papers",
      href: "/teacher/papers",
      icon: ClipboardList,
      soon: true,
    },
    {
      label: "Assessments",
      href: "/teacher/assessments",
      icon: Timer,
      soon: true,
    },
    {
      label: "Marking",
      href: "/teacher/marking",
      icon: ClipboardCheck,
      soon: true,
    },
  ],
  student: [
    { label: "Dashboard", href: "/student", icon: LayoutDashboard },
    { label: "Practice", href: "/student/practice", icon: Pencil },
    { label: "Exams", href: "/student/exams", icon: Timer },
    {
      label: "Feedback",
      href: "/student/feedback",
      icon: MessageSquare,
      soon: true,
    },
    {
      label: "Progress",
      href: "/student/progress",
      icon: TrendingUp,
    },
  ],
};
