import { Suspense } from "react";
import { BatchDetailPage } from "@/features/batches/batches";

export default function Page() {
  return (
    <Suspense>
      <BatchDetailPage role="ADMIN" />
    </Suspense>
  );
}
