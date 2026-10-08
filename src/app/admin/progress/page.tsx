import { Suspense } from "react";
import { ProgressPage } from "@/features/progress/progress-page";

export default function Page() {
  return (
    <Suspense>
      <ProgressPage role="ADMIN" />
    </Suspense>
  );
}
