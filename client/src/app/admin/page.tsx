import RoleGuard from "@/components/RoleGuard";

export default function AdminPage() {
  return (
    <RoleGuard role="admin">
      <h2 className="text-xl font-semibold">Admin dashboard</h2>
    </RoleGuard>
  );
}
