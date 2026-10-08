import { Suspense } from "react";
import { MyCompletionPage } from "@/features/learner/learner-pages";

export default function Page() {
  return (
    <Suspense>
      <MyCompletionPage />
    </Suspense>
  );
}
