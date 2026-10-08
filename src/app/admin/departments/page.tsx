import { Suspense } from "react";
import { DepartmentsPage } from "@/features/admin/departments-users";

export default function Page() {
  return (
    <Suspense>
      <DepartmentsPage />
    </Suspense>
  );
}
