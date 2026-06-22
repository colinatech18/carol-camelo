import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}