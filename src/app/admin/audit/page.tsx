import { Suspense } from "react";
import { AuditPage } from "@/features/admin/audit-page";

export default function Page() {
  return (
    <Suspense>
      <AuditPage />
    </Suspense>
  );
}
