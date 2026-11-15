import Link from "next/link";
import { requireAdminPage } from "@/lib/admin/auth";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { ActivityIndicator } from "@/components/admin/ActivityIndicator";

export const dynamic = "force-dynamic";

const NAV = [
  ["/admin", "Dashboard"],
  ["/admin/review", "Review"],
  ["/admin/questions", "Questions"],
  ["/admin/composer", "Composer"],
  ["/admin/published", "Published"],
  ["/admin/audit", "Audit"],
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPage();
  return (
    <div className="admin min-h-screen text-[13px]">
      <nav className="sticky top-0 z-20 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-neutral-300 bg-white/95 px-4 py-2 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <span className="font-semibold">Mathdle Factory</span>
        {NAV.map(([href, label]) => (
          <Link key={href} href={href} className="text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white">
            {label}
          </Link>
        ))}
        <span className="ml-auto" />
        <ActivityIndicator />
        <span className="text-neutral-500">{admin.email}</span>
        <LogoutButton />
      </nav>
      <div className="mx-auto max-w-7xl p-4">{children}</div>
    </div>
  );
}
