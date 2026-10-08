import { Suspense } from "react";
import { BatchesPage } from "@/features/batches/batches";

export default function Page() {
  return (
    <Suspense>
      <BatchesPage role="DEPARTMENT" />
    </Suspense>
  );
}
