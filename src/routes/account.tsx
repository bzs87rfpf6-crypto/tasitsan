import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/account")({
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }] }),
  component: () => <Outlet />,
});
