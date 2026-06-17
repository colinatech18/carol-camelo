import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Carol Camelo — Acompanhamento clínico" },
      { name: "description", content: "Sistema interno de acompanhamento de pacientes para clínica de saúde mental." },
      { property: "og:title", content: "Carol Camelo — Acompanhamento clínico" },
      { name: "twitter:title", content: "Carol Camelo — Acompanhamento clínico" },
      { property: "og:description", content: "Sistema interno de acompanhamento de pacientes para clínica de saúde mental." },
      { name: "twitter:description", content: "Sistema interno de acompanhamento de pacientes para clínica de saúde mental." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/ac9ce10b-3cec-461d-89ae-29acf3f8b9d8/id-preview-f45125ed--07f30b1d-73cb-4239-b18a-02e9ca7ad120.lovable.app-1779124671156.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/ac9ce10b-3cec-461d-89ae-29acf3f8b9d8/id-preview-f45125ed--07f30b1d-73cb-4239-b18a-02e9ca7ad120.lovable.app-1779124671156.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

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
