import { createFileRoute, redirect } from "@tanstack/react-router";

// Compatibility route for older desktop/web links that still point to /login.
// The canonical authentication page in this project is /auth.
export const Route = createFileRoute("/login")({
  head: () => ({ meta: [
    { title: "Acesso ao PDV — Ultraconnect" },
    { name: "description", content: "Acesso à sua conta do PDV Ultraconnect Sabor e Brasa." },
    { property: "og:title", content: "Acesso ao PDV — Ultraconnect" },
    { property: "og:description", content: "Entre na sua conta individual do PDV Ultraconnect." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  beforeLoad: () => {
    throw redirect({ to: "/auth", replace: true });
  },
});
