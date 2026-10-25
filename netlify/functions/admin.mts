// API de l'espace admin (/admin.html).
// Le mot de passe vient de la variable d'environnement Netlify ADMIN_PASSWORD (jamais dans le code).
import { createHash, timingSafeEqual } from 'node:crypto';
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

const MAX_PHOTOS = 12;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const IMG_RE = /^\/(photo-[\w-]+|api\/photo\/[\w-]+)\.jpg$/;

const sha = (s: string) => createHash('sha256').update(s).digest();
function passwordOk(given: string | null) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || !given) return false;
  return timingSafeEqual(sha(given), sha(expected));
}

const blobKey = (url: string) => (url.startsWith('/api/photo/') ? url.slice('/api/photo/'.length) : null);

function slug(name: string) {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'article';
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

function clean(input: any, previous?: Product): Product | string {
  const name = String(input?.name ?? '').trim();
  if (!name || name.length > 120) return 'Le nom est obligatoire (120 caractères max).';
  const price = Math.round(Number(input?.price) * 100) / 100;
  if (!Number.isFinite(price) || price <= 0 || price > 100000) return 'Prix invalide.';
  let ancienPrix: number | undefined;
  if (input?.ancienPrix !== undefined && input?.ancienPrix !== null && input?.ancienPrix !== '') {
    ancienPrix = Math.round(Number(input.ancienPrix) * 100) / 100;
    if (!Number.isFinite(ancienPrix) || ancienPrix <= price) return "L'ancien prix doit être plus élevé que le prix.";
  }
  const cat = String(input?.cat ?? '');
  if (!/^[a-z]{2,30}$/.test(cat)) return 'Catégorie invalide.';
  const etat = String(input?.etat ?? '').trim().slice(0, 40);
  const desc = String(input?.desc ?? '').trim().slice(0, 3000);
  const images = Array.isArray(input?.images) ? input.images.map(String) : [];
  if (images.length > MAX_PHOTOS) return `${MAX_PHOTOS} photos maximum par article.`;
  if (images.some((u: string) => !IMG_RE.test(u))) return 'Photo invalide.';

  const p: Product = {
    id: previous?.id ?? slug(name),
    name, price, cat,
    unique: input?.unique !== false,
    images,
  };
  if (ancienPrix) p.ancienPrix = ancienPrix;
  if (etat) p.etat = etat;
  if (desc) p.desc = desc;
  if (input?.nouveau) p.nouveau = true;
  if (input?.vendu) p.vendu = true;
  if (previous?.icon) p.icon = previous.icon;
  return p;
}

async function deletePhotos(urls: string[]) {
  const store = photoStore();
  await Promise.all(urls.map(blobKey).filter(Boolean).map(k => store.delete(k as string)));
}

export default async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);
  if (!process.env.ADMIN_PASSWORD) return json({ error: 'Mot de passe admin non configuré sur Netlify (ADMIN_PASSWORD).' }, 500);
  if (!passwordOk(req.headers.get('x-admin-password'))) {
    await new Promise(r => setTimeout(r, 800)); // freine les essais de mot de passe
    return json({ error: 'Mot de passe incorrect.' }, 401);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Requête invalide.' }, 400); }
  const origin = new URL(req.url).origin;

  switch (body?.action) {
    case 'login':
      return json({ ok: true });

    case 'list':
      return json(await loadCatalogue(origin));

    case 'upload': {
      const b64 = String(body?.data ?? '').replace(/^data:image\/jpeg;base64,/, '');
      const bytes = Buffer.from(b64, 'base64');
      if (bytes.length < 100 || bytes.length > MAX_PHOTO_BYTES) return json({ error: 'Photo trop lourde ou vide.' }, 400);
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return json({ error: 'Format de photo non reconnu.' }, 400);
      const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      await photoStore().set(key, bytes);
      return json({ url: `/api/photo/${key}` });
    }

    case 'save': {
      const list = await loadCatalogue(origin);
      const idx = body?.product?.id ? list.findIndex(p => p.id === body.product.id) : -1;
      if (body?.product?.id && idx === -1) return json({ error: 'Article introuvable (supprimé ailleurs ?).' }, 404);
      const previous = idx >= 0 ? list[idx] : undefined;
      const p = clean(body?.product, previous);
      if (typeof p === 'string') return json({ error: p }, 400);
      if (idx >= 0) list[idx] = p; else list.push(p);
      await saveCatalogue(list);
      if (previous) await deletePhotos(previous.images.filter(u => !p.images.includes(u)));
      return json({ ok: true, product: p });
    }

    case 'delete': {
      const list = await loadCatalogue(origin);
      const p = list.find(x => x.id === body?.id);
      if (!p) return json({ error: 'Article introuvable.' }, 404);
      await saveCatalogue(list.filter(x => x.id !== p.id));
      await deletePhotos(p.images);
      return json({ ok: true });
    }

    case 'discard': {
      // Photos envoyées puis abandonnées (article non enregistré)
      const urls = (Array.isArray(body?.urls) ? body.urls : []).map(String).filter((u: string) => IMG_RE.test(u));
      const used = new Set((await loadCatalogue(origin)).flatMap(p => p.images));
      await deletePhotos(urls.filter((u: string) => !used.has(u)));
      return json({ ok: true });
    }

    default:
      return json({ error: 'Action inconnue.' }, 400);
  }
};

export const config = { path: '/api/admin' };
