import RoleGuard from "@/components/RoleGuard";

export default function StudentPage() {
  return (
    <RoleGuard role="student">
      <h2 className="text-xl font-semibold">Student dashboard</h2>
    </RoleGuard>
  );
}
