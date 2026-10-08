import { Suspense } from "react";
import { LearnersPage } from "@/features/learners/learners-page";

export default function Page() {
  return (
    <Suspense>
      <LearnersPage role="DEPARTMENT" />
    </Suspense>
  );
}
