import { Suspense } from "react";
import { ContentLibraryPage } from "@/features/content/content-library";

export default function Page() {
  return (
    <Suspense>
      <ContentLibraryPage />
    </Suspense>
  );
}
