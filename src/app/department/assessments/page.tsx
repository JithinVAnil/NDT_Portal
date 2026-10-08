import { Suspense } from "react";
import { AssessmentsPage } from "@/features/assessments/assessments-page";

export default function Page() {
  return (
    <Suspense>
      <AssessmentsPage role="DEPARTMENT" />
    </Suspense>
  );
}
