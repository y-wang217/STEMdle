"use client";
export function LogoutButton() {
  return (
    <button
      className="text-neutral-500 underline"
      onClick={async () => {
        await fetch("/api/admin/logout", { method: "POST" });
        window.location.href = "/admin/login";
      }}
    >
      Sign out
    </button>
  );
}
