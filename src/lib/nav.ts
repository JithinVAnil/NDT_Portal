import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Clapperboard,
  FileBarChart,
  FileCheck2,
  FlaskConical,
  GraduationCap,
  Layers,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
  MapPin,
  MonitorPlay,
  PlayCircle,
  RefreshCcw,
  ScrollText,
  Settings,
  ShieldCheck,
  Trophy,
  UserCircle,
  UserCog,
  Users,
  Presentation,
  UserSquare,
} from "lucide-react";
import type { Role } from "@/types/api";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}
export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export const NAV: Record<Role, NavGroup[]> = {
  ADMIN: [
    { items: [{ label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard }] },
    {
      label: "Programme Workflow",
      items: [
        { label: "Nominations", href: "/admin/nominations", icon: ClipboardList },
        { label: "Learners", href: "/admin/learners", icon: Users },
        { label: "Departments", href: "/admin/departments", icon: Building2 },
        { label: "Users", href: "/admin/users", icon: UserCog },
      ],
    },
    {
      label: "Curriculum & Content",
      items: [
        { label: "Courses", href: "/admin/courses", icon: BookOpen },
        { label: "Content Library", href: "/admin/content", icon: MonitorPlay },
        { label: "Content Production", href: "/admin/content-production", icon: Clapperboard },
        { label: "Content QC", href: "/admin/content-qc", icon: ShieldCheck },
      ],
    },
    {
      label: "Training Delivery",
      items: [
        { label: "Training Calendar", href: "/admin/calendar", icon: CalendarDays },
        { label: "Batches", href: "/admin/batches", icon: Layers },
        { label: "Attendance", href: "/admin/attendance", icon: CalendarCheck },
        { label: "Assessments", href: "/admin/assessments", icon: ClipboardCheck },
        { label: "Progress", href: "/admin/progress", icon: Activity },
      ],
    },
    {
      label: "Masters",
      items: [
        { label: "Training Venues", href: "/admin/venues", icon: MapPin },
        { label: "Trainers", href: "/admin/trainers", icon: UserSquare },
      ],
    },
    {
      label: "Monitoring",
      items: [
        { label: "Reports", href: "/admin/reports", icon: FileBarChart },
        { label: "NDU Integration", href: "/admin/ndu", icon: RefreshCcw },
        { label: "Audit Trail", href: "/admin/audit", icon: ScrollText },
        { label: "Notifications", href: "/admin/notifications", icon: Bell },
      ],
    },
    {
      label: "Programme",
      items: [
        { label: "Requirement Coverage", href: "/admin/coverage", icon: ListChecks },
        { label: "Settings", href: "/admin/settings", icon: Settings },
        { label: "Demo Guide", href: "/admin/demo-guide", icon: Presentation },
      ],
    },
  ],
  DEPARTMENT: [
    { items: [{ label: "Dashboard", href: "/department/dashboard", icon: LayoutDashboard }] },
    {
      label: "Department",
      items: [
        { label: "Nominations", href: "/department/nominations", icon: ClipboardList },
        { label: "Learners", href: "/department/learners", icon: Users },
        { label: "Batches", href: "/department/batches", icon: Layers },
        { label: "Attendance", href: "/department/attendance", icon: CalendarCheck },
        { label: "Assessments", href: "/department/assessments", icon: ClipboardCheck },
        { label: "Progress", href: "/department/progress", icon: Activity },
        { label: "Reports", href: "/department/reports", icon: FileBarChart },
        { label: "Notifications", href: "/department/notifications", icon: Bell },
      ],
    },
  ],
  LEARNER: [
    { items: [{ label: "Dashboard", href: "/learner/dashboard", icon: LayoutDashboard }] },
    {
      label: "My Learning",
      items: [
        { label: "My Course", href: "/learner/course", icon: GraduationCap },
        { label: "My Modules", href: "/learner/modules", icon: BookOpen },
        { label: "My Content", href: "/learner/content", icon: PlayCircle },
        { label: "My Practicals", href: "/learner/practicals", icon: FlaskConical },
        { label: "My Assessments", href: "/learner/assessments", icon: FileCheck2 },
      ],
    },
    {
      label: "My Record",
      items: [
        { label: "My Progress", href: "/learner/progress", icon: BarChart3 },
        { label: "My Attendance", href: "/learner/attendance", icon: CalendarCheck },
        { label: "My Completion", href: "/learner/completion", icon: Trophy },
        { label: "Notifications", href: "/learner/notifications", icon: Bell },
        { label: "Profile", href: "/learner/profile", icon: UserCircle },
      ],
    },
  ],
};

export const ROLE_PREFIX: Record<Role, string> = { ADMIN: "/admin", DEPARTMENT: "/department", LEARNER: "/learner" };
