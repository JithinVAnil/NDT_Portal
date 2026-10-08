import { Suspense } from "react";
import { LearnerDetailPage } from "@/features/learners/learner-detail";

export default function Page() {
  return (
    <Suspense>
      <LearnerDetailPage role="DEPARTMENT" />
    </Suspense>
  );
}
