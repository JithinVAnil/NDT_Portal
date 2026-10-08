import { Suspense } from "react";
import { ContentProductionPage } from "@/features/content/content-production";

export default function Page() {
  return (
    <Suspense>
      <ContentProductionPage />
    </Suspense>
  );
}
