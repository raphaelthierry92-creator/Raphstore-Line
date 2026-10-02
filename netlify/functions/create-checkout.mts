// Fonction de paiement Raphstore.line
// La clé secrète Stripe vient de la variable d'environnement STRIPE_SECRET_KEY (jamais dans le code).

// Correspondance article du site -> prix Stripe.
// Pour ajouter un article : ajouter une ligne ici ET dans index.html (même id).
const PRICES: Record<string, string> = {
  smartphones: 'price_1UKYilFVsWQ4jKiFaxQgYhG1',
  telephones: 'price_1UKYioFVsWQ4jKiFwWtAXm0X',
  ecouteurs: 'price_1UKYiqFVsWQ4jKiFGjk5n7YQ',
  lunettes: 'price_1UKYitFVsWQ4jKiFfwl5F8f5',
  accessoires: 'price_1UKhbQFVsWQ4jKiF9tshvbJB',
  ordinateurs: 'price_1UKhbTFVsWQ4jKiFBzb7WW1d',
  montres: 'price_1UL7FHFVsWQ4jKiFbCT27Teb',
  reflex: 'price_1UKmOqFVsWQ4jKiFMXFxB2cY',
  bridge: 'price_1UKmOuFVsWQ4jKiFCdaS30fP',
  iphone13: 'price_1UKmTJFVsWQ4jKiFU602ouHK',
  iphone15: 'price_1UKmVrFVsWQ4jKiFI6hejeJE',
  iphone14: 'price_1UKudpFVsWQ4jKiF49ULXwF1',
  tabletteA7: 'price_1ULedVFVsWQ4jKiFoV6TfgpH',
  note20: 'price_1UMFfZFVsWQ4jKiFiE3UXKaD',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export default async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return json({ error: 'Paiement non configuré.' }, 500);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Requête invalide.' }, 400);
  }

  const items = Array.isArray(body?.items) ? body.items : [];
  if (items.length === 0) return json({ error: 'Votre panier est vide.' }, 400);

  const params = new URLSearchParams();
  params.append('mode', 'payment');

  let n = 0;
  for (const item of items) {
    const price = PRICES[item?.id];
    const qty = Math.floor(Number(item?.qty));
    if (!price) return json({ error: "Un article du panier n'est plus disponible." }, 400);
    if (!Number.isFinite(qty) || qty < 1 || qty > 10) return json({ error: 'Quantité invalide.' }, 400);
    params.append(`line_items[${n}][price]`, price);
    params.append(`line_items[${n}][quantity]`, String(qty));
    n++;
  }

  const origin = new URL(req.url).origin;
  params.append('success_url', `${origin}/?checkout=success`);
  params.append('cancel_url', `${origin}/?checkout=cancel`);

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });
  const session: any = await res.json();

  if (!res.ok || !session.url) {
    console.error('Stripe error', session?.error?.message);
    return json({ error: 'Erreur lors de la création du paiement.' }, 502);
  }

  return json({ url: session.url });
};

export const config = { path: '/api/create-checkout' };
