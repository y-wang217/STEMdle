import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/admin/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentAdmin()) redirect("/admin");
  return (
    <div className="admin flex min-h-screen items-center justify-center p-4">
      <LoginForm />
    </div>
  );
}
