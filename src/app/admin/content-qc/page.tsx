import { Suspense } from "react";
import { ContentQcPage } from "@/features/content/content-production";

export default function Page() {
  return (
    <Suspense>
      <ContentQcPage />
    </Suspense>
  );
}
