import { Suspense } from "react";
import { MyAssessmentsPage } from "@/features/learner/learner-pages";

export default function Page() {
  return (
    <Suspense>
      <MyAssessmentsPage />
    </Suspense>
  );
}
