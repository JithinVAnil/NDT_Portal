import { Suspense } from "react";
import { MyPracticalsPage } from "@/features/learner/learner-pages";

export default function Page() {
  return (
    <Suspense>
      <MyPracticalsPage />
    </Suspense>
  );
}
