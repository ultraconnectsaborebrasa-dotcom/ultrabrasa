import { createFileRoute, redirect } from "@tanstack/react-router";

// Compatibility route for older desktop/web links that still point to /login.
// The canonical authentication page in this project is /auth.
export const Route = createFileRoute("/login")({
  beforeLoad: () => {
    throw redirect({ to: "/auth", replace: true });
  },
});
