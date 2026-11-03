import { createFileRoute } from "@tanstack/react-router";

// Serve somente fotos do cardápio (bucket privado), por nome validado; nada além disso é exposto.
export const Route = createFileRoute("/api/public/catalog-photo/$name")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!/^[A-Za-z0-9._-]{1,120}$/.test(params.name)) return new Response("Not found", { status: 404 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage.from("catalog-photos").download(params.name);
        if (error || !data) return new Response("Not found", { status: 404 });
        return new Response(data, { headers: { "Content-Type": data.type || "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" } });
      },
    },
  },
});
