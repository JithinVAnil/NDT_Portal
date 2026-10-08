import { Suspense } from "react";
import { CoveragePage } from "@/features/admin/system-pages";

export default function Page() {
  return (
    <Suspense>
      <CoveragePage />
    </Suspense>
  );
}
