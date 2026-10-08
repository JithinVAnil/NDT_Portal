import { Suspense } from "react";
import { ContentDetailPage } from "@/features/content/content-detail";

export default function Page() {
  return (
    <Suspense>
      <ContentDetailPage />
    </Suspense>
  );
}
