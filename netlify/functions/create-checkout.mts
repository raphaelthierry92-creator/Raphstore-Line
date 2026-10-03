// Fonction de paiement Raphstore.line
// La clé secrète Stripe vient de la variable d'environnement STRIPE_SECRET_KEY (jamais dans le code).
// - Clé sk_test_...  -> mode test (prix TEST_PRICES)
// - Clé sk_live_...  -> paiements réels (prix LIVE_PRICES)
// Pour ajouter un article : ajouter une ligne dans LES DEUX listes ET dans index.html (même id).

const TEST_PRICES: Record<string, string> = {
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
  a15: 'price_1UMGBYFVsWQ4jKiFtVlPjU1D',
  a53: 'price_1UMGBoFVsWQ4jKiFgU87I8iV',
  redminote13: 'price_1UMGBgFVsWQ4jKiFV8Ohu2ik',
  tabA8: 'price_1UMGDpFVsWQ4jKiFIWItZbRx',
  hp14: 'price_1UMGElFVsWQ4jKiFYGDqtp7z',  thinkplus: 'price_1UMNVMFVsWQ4jKiFknMTgvwK',

};

const LIVE_PRICES: Record<string, string> = {
  smartphones: 'price_1UMIrnFAAzBsA0FOFNacoq5D',
  telephones: 'price_1UMIrrFAAzBsA0FOOWwu16TM',
  ecouteurs: 'price_1UMIrvFAAzBsA0FOGoM0kHKv',
  lunettes: 'price_1UMIrzFAAzBsA0FOAL5oeTEV',
  accessoires: 'price_1UMIs3FAAzBsA0FOSO41PN1a',
  ordinateurs: 'price_1UMIs7FAAzBsA0FOakuuMGn0',
  montres: 'price_1UMIsBFAAzBsA0FOz4V1bFIB',
  reflex: 'price_1UMIsFFAAzBsA0FOJzkYbdG0',
  bridge: 'price_1UMIsJFAAzBsA0FOzuORsi6T',
  iphone13: 'price_1UMIsOFAAzBsA0FOhBDos9TB',
  iphone15: 'price_1UMIsSFAAzBsA0FOUOLsNu8P',
  iphone14: 'price_1UMIsWFAAzBsA0FOXBooKhJw',
  tabletteA7: 'price_1UMIsaFAAzBsA0FOIieLcBmt',
  note20: 'price_1UMIsfFAAzBsA0FOXLNDHng0',
  a15: 'price_1UMIsjFAAzBsA0FOHDAOUTvW',
  a53: 'price_1UMIsnFAAzBsA0FOoDCq5Wak',
  redminote13: 'price_1UMIsrFAAzBsA0FORMweCFnS',
  tabA8: 'price_1UMIsvFAAzBsA0FOd4eLCXUm',
  hp14: 'price_1UMIt0FAAzBsA0FOsakRq1VD',  thinkplus: 'price_1UMNVPFAAzBsA0FOPqnJIfNh',

};

// Livraison : pays de l'Union européenne
const EU_COUNTRIES = ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE'];

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export default async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return json({ error: 'Paiement non configuré.' }, 500);
  const PRICES = key.includes('_live_') ? LIVE_PRICES : TEST_PRICES;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Requête invalide.' }, 400);
  }

  const items = Array.isArray(body?.items) ? body.items : [];
  if (items.length === 0) return json({ error: 'Votre panier est vide.' }, 400);
  if (items.length > 30) return json({ error: 'Panier trop volumineux.' }, 400);

  const params = new URLSearchParams();
  params.append('mode', 'payment');
  params.append('locale', 'fr');
  params.append('phone_number_collection[enabled]', 'true');
  EU_COUNTRIES.forEach((c, i) =>
    params.append(`shipping_address_collection[allowed_countries][${i}]`, c),
  );
  params.append('shipping_options[0][shipping_rate_data][type]', 'fixed_amount');
  params.append('shipping_options[0][shipping_rate_data][fixed_amount][amount]', '0');
  params.append('shipping_options[0][shipping_rate_data][fixed_amount][currency]', 'eur');
  params.append('shipping_options[0][shipping_rate_data][display_name]', 'Livraison gratuite (UE)');

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
