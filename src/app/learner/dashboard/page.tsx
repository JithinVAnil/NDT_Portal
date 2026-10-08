import { Suspense } from "react";
import { LearnerDashboard } from "@/features/learner/learner-pages";

export default function Page() {
  return (
    <Suspense>
      <LearnerDashboard />
    </Suspense>
  );
}
