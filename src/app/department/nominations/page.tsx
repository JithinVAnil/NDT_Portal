import { Suspense } from "react";
import { NominationsPage } from "@/features/nominations/nominations-page";

export default function Page() {
  return (
    <Suspense>
      <NominationsPage role="DEPARTMENT" />
    </Suspense>
  );
}
