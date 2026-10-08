import { Suspense } from "react";
import { AdminDashboard } from "@/features/dashboard/admin-dashboard";

export default function Page() {
  return (
    <Suspense>
      <AdminDashboard />
    </Suspense>
  );
}
