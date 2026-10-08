import { Suspense } from "react";
import { NominationDetailPage } from "@/features/nominations/nomination-detail";

export default function Page() {
  return (
    <Suspense>
      <NominationDetailPage role="ADMIN" />
    </Suspense>
  );
}
