import RoleGuard from "@/components/RoleGuard";

export default function TeacherPage() {
  return (
    <RoleGuard role="teacher">
      <h2 className="text-xl font-semibold">Teacher dashboard</h2>
    </RoleGuard>
  );
}
