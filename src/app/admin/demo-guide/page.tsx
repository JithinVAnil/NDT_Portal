import { Suspense } from "react";
import { DemoGuidePage } from "@/features/admin/system-pages";

export default function Page() {
  return (
    <Suspense>
      <DemoGuidePage />
    </Suspense>
  );
}
