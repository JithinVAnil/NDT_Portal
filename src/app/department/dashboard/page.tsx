import { Suspense } from "react";
import { DepartmentDashboard } from "@/features/dashboard/department-dashboard";

export default function Page() {
  return (
    <Suspense>
      <DepartmentDashboard />
    </Suspense>
  );
}
