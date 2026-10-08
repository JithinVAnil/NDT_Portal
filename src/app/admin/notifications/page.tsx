import { Suspense } from "react";
import { NotificationsPage } from "@/features/admin/system-pages";

export default function Page() {
  return (
    <Suspense>
      <NotificationsPage role="ADMIN" />
    </Suspense>
  );
}
