import type { Role } from "@/lib/constants";

export type NavItem = { href: string; label: string; icon: string; roles: Role[] };

const V: Role[] = ["VENDOR_ADMIN", "VENDOR_STAFF"];
const VA: Role[] = ["VENDOR_ADMIN"];

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard", roles: V },
  { href: "/rfqs", label: "RFQs", icon: "FileText", roles: V },
  { href: "/jobs", label: "Job Orders", icon: "ClipboardList", roles: V },
  { href: "/customers", label: "Customers", icon: "Building2", roles: V },
  { href: "/surveyors", label: "Surveyors", icon: "HardHat", roles: V },
  { href: "/reports", label: "Reports", icon: "FileCheck2", roles: V },
  { href: "/invoices", label: "Invoices", icon: "ReceiptIndianRupee", roles: V },
  { href: "/billing", label: "Packages & Credits", icon: "Coins", roles: V },
  { href: "/users", label: "User Management", icon: "Users", roles: VA },
  { href: "/support", label: "Support", icon: "LifeBuoy", roles: V },
  { href: "/settings", label: "Settings", icon: "Settings", roles: V },
  { href: "/admin", label: "Platform Admin", icon: "ShieldCheck", roles: ["PLATFORM_ADMIN"] },
  { href: "/admin/taxonomy", label: "Taxonomy & Rates", icon: "Network", roles: ["PLATFORM_ADMIN"] },
  { href: "/admin/templates", label: "Survey Templates", icon: "LayoutTemplate", roles: ["PLATFORM_ADMIN"] },
  { href: "/admin/tenants", label: "Tenants", icon: "Building", roles: ["PLATFORM_ADMIN"] },
  { href: "/admin/audit", label: "Audit Log", icon: "History", roles: ["PLATFORM_ADMIN"] },
  { href: "/admin/support", label: "Support Queue", icon: "LifeBuoy", roles: ["PLATFORM_ADMIN"] },
  { href: "/settings", label: "Settings", icon: "Settings", roles: ["PLATFORM_ADMIN"] },
];
