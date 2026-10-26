import { redirect } from "next/navigation";

// The overview is now the admin home. Week pages stay under /admin/analytics/week/N.
// Next.js requires a default export for pages.
export default function AnalyticsPage() {
  redirect("/admin");
}
