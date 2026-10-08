import { Suspense } from "react";
import { MyProgressPage } from "@/features/learner/learner-pages";

export default function Page() {
  return (
    <Suspense>
      <MyProgressPage />
    </Suspense>
  );
}
