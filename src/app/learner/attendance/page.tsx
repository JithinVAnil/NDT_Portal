import { Suspense } from "react";
import { MyAttendancePage } from "@/features/learner/learner-pages";

export default function Page() {
  return (
    <Suspense>
      <MyAttendancePage />
    </Suspense>
  );
}
