import { Suspense } from "react";
import { CoursesPage } from "@/features/courses/courses-page";

export default function Page() {
  return (
    <Suspense>
      <CoursesPage />
    </Suspense>
  );
}
