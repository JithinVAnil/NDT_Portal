import { Suspense } from "react";
import { MyCoursePage } from "@/features/learner/learner-pages";

export default function Page() {
  return (
    <Suspense>
      <MyCoursePage />
    </Suspense>
  );
}
