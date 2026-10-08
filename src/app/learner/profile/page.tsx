import { Suspense } from "react";
import { MyProfilePage } from "@/features/learner/learner-pages";

export default function Page() {
  return (
    <Suspense>
      <MyProfilePage />
    </Suspense>
  );
}
