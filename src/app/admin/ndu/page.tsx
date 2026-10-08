import { Suspense } from "react";
import { NduPage } from "@/features/ndu/ndu-page";

export default function Page() {
  return (
    <Suspense>
      <NduPage />
    </Suspense>
  );
}
