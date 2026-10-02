import type { Context, Config } from "@netlify/functions";

// Correspondance entre les identifiants du panier (client) et les Price IDs Stripe (mode test).
const PRICE_IDS: Record<string, string> = {
  smartphones: "price_1UKYilFVsWQ4jKiFaxQgYhG1",
  telephones: "price_1UKYioFVsWQ4jKiFwWtAXm0X",
  ecouteurs: "price_1UKYiqFVsWQ4jKiFGjk5n7YQ",
  lunettes: "price_1UKYitFVsWQ4jKiFfwl5F8f5",
  accessoires: "price_1UKhbQFVsWQ4jKiF9tshvbJB",
  ordinateurs: "price_1UKhbTFVsWQ4jKiFBzb7WW1d",
  montres: "price_1UL7FHFVsWQ4jKiFbCT27Teb",
  reflex: "price_1UKmOqFVsWQ4jKiFMXFxB2cY",
  bridge: "price_1UKmOuFVsWQ4jKiFCdaS30fP",
  iphone13: "price_1UKmTJFVsWQ4jKiFU602ouHK",
  iphone15: "price_1UKmVrFVsWQ4jKiFI6hejeJE",
  iphone14: "price_1UKudpFVsWQ4jKiF49ULXwF1",
};

interface CartItem {
  id: string;
  qty: number;
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const secretKey = Netlify.env.get("STRIPE_SECRET_KEY");
  if (!secretKey) {
    return new Response(
      JSON.stringify({ error: "STRIPE_SECRET_KEY n'est pas configurée sur ce site." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let items: CartItem[];
  try {
    const body = await req.json();
    items = body.items;
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("empty cart");
    }
  } catch {
    return new Response(JSON.stringify({ error: "Panier invalide." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const origin = req.headers.get("origin") || new URL(req.url).origin;

  const params = new URLSearchParams();
  params.append("mode", "payment");
  params.append("success_url", `${origin}/?checkout=success`);
  params.append("cancel_url", `${origin}/?checkout=cancel`);

  let lineIndex = 0;
  for (const item of items) {
    const priceId = PRICE_IDS[item.id];
    const qty = Math.max(1, Math.min(20, Number(item.qty) || 1));
    if (!priceId) continue; // ignore un id inconnu plutôt que planter toute la commande
    params.append(`line_items[${lineIndex}][price]`, priceId);
    params.append(`line_items[${lineIndex}][quantity]`, String(qty));
    lineIndex++;
  }

  if (lineIndex === 0) {
    return new Response(JSON.stringify({ error: "Aucun article reconnu dans le panier." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const session = await stripeRes.json();

  if (!stripeRes.ok) {
    return new Response(
      JSON.stringify({ error: session.error?.message || "Erreur Stripe." }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify({ url: session.url }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const config: Config = {
  path: "/api/create-checkout",
};
