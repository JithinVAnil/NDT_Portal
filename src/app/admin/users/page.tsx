import { Suspense } from "react";
import { UsersPage } from "@/features/admin/departments-users";

export default function Page() {
  return (
    <Suspense>
      <UsersPage />
    </Suspense>
  );
}
