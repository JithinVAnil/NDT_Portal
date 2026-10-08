import { PortalShell } from "@/components/layout/portal-shell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <PortalShell role="ADMIN">{children}</PortalShell>;
}
