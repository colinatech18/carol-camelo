import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_app")({
  beforeLoad: ({ location }) => {
    if (location.pathname === "/") {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: () => <AppShell />,
});
