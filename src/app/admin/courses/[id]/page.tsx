import { Suspense } from "react";
import { CourseDetailPage } from "@/features/courses/courses-page";

export default function Page() {
  return (
    <Suspense>
      <CourseDetailPage />
    </Suspense>
  );
}
