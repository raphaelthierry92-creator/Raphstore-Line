// Fonction de paiement Raphstore.line
// La clé secrète Stripe vient de la variable d'environnement STRIPE_SECRET_KEY (jamais dans le code).
// Les prix sont lus côté serveur dans le catalogue géré depuis /admin.html :
// un client ne peut donc pas modifier le prix depuis son navigateur.
// Plus besoin de créer les prix dans Stripe : ajouter un article dans l'admin suffit.
// ---- Catalogue (Netlify Blobs) — même bloc dans chaque fonction ----
import { getStore } from '@netlify/blobs';

type Product = {
  id: string;
  name: string;
  price: number;
  ancienPrix?: number;
  cat: string;
  etat?: string;
  desc?: string;
  nouveau?: boolean;
  vendu?: boolean;
  unique: boolean;
  images: string[];
  icon?: string;
};

const catalogueStore = () => getStore({ name: 'catalogue', consistency: 'strong' });
const photoStore = () => getStore({ name: 'photos', consistency: 'strong' });

async function loadCatalogue(origin: string): Promise<Product[]> {
  const saved = await catalogueStore().get('products', { type: 'json' });
  if (Array.isArray(saved)) return saved as Product[];
  const res = await fetch(`${origin}/catalogue-initial.json`);
  if (!res.ok) throw new Error('Catalogue de départ introuvable');
  return (await res.json()) as Product[];
}

async function saveCatalogue(list: Product[]) {
  await catalogueStore().setJSON('products', list);
}

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
// ---------------------------------------------------------------

// Livraison : pays de l'Union européenne
const EU_COUNTRIES = ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE'];

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
  if (items.length > 30) return json({ error: 'Panier trop volumineux.' }, 400);

  const origin = new URL(req.url).origin;
  let catalogue;
  try {
    catalogue = await loadCatalogue(origin);
  } catch (e) {
    console.error(e);
    return json({ error: 'Catalogue indisponible, réessayez dans un instant.' }, 503);
  }

  const params = new URLSearchParams();
  params.append('mode', 'payment');
  params.append('locale', 'fr');
  params.append('phone_number_collection[enabled]', 'true');
  params.append('allow_promotion_codes', 'true');

  EU_COUNTRIES.forEach((c, i) =>
    params.append(`shipping_address_collection[allowed_countries][${i}]`, c),
  );
  params.append('shipping_options[0][shipping_rate_data][type]', 'fixed_amount');
  params.append('shipping_options[0][shipping_rate_data][fixed_amount][amount]', '0');
  params.append('shipping_options[0][shipping_rate_data][fixed_amount][currency]', 'eur');
  params.append('shipping_options[0][shipping_rate_data][display_name]', 'Livraison gratuite (UE)');

  let n = 0;
  const seen = new Set<string>();
  for (const item of items) {
    const p = catalogue.find(x => x.id === item?.id);
    const qty = Math.floor(Number(item?.qty));
    if (!p || p.vendu) return json({ error: "Un article du panier n'est plus disponible." }, 400);
    if (seen.has(p.id)) return json({ error: 'Panier invalide.' }, 400);
    seen.add(p.id);
    if (!Number.isFinite(qty) || qty < 1 || qty > (p.unique ? 1 : 10)) return json({ error: 'Quantité invalide.' }, 400);
    params.append(`line_items[${n}][quantity]`, String(qty));
    params.append(`line_items[${n}][price_data][currency]`, 'eur');
    params.append(`line_items[${n}][price_data][unit_amount]`, String(Math.round(p.price * 100)));
    params.append(`line_items[${n}][price_data][product_data][name]`, p.name);
    params.append(`line_items[${n}][price_data][product_data][metadata][article]`, p.id);
    if (p.images[0]) params.append(`line_items[${n}][price_data][product_data][images][0]`, origin + p.images[0]);
    n++;
  }

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
