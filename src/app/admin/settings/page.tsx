import { Suspense } from "react";
import { SettingsPage } from "@/features/admin/system-pages";

export default function Page() {
  return (
    <Suspense>
      <SettingsPage />
    </Suspense>
  );
}
