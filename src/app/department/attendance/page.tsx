import { Suspense } from "react";
import { AttendancePage } from "@/features/attendance/attendance-page";

export default function Page() {
  return (
    <Suspense>
      <AttendancePage role="DEPARTMENT" />
    </Suspense>
  );
}
