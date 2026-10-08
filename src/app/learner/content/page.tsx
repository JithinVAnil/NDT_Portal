import { Suspense } from "react";
import { MyContentPage } from "@/features/learner/learner-pages";

export default function Page() {
  return (
    <Suspense>
      <MyContentPage />
    </Suspense>
  );
}
