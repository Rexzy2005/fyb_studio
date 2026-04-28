import { redirect } from "next/navigation";
import { auth } from "@/backend/auth/config";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  if (!session.user.isOnboarded) redirect("/onboarding");

  return <>{children}</>;
}
