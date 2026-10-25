// Sert les photos ajoutées depuis l'admin : /api/photo/<nom>
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

export default async (req: Request) => {
  const key = decodeURIComponent(new URL(req.url).pathname.split('/').pop() || '');
  if (!/^[\w-]+\.jpg$/.test(key)) return new Response('Introuvable', { status: 404 });
  const data = await photoStore().get(key, { type: 'arrayBuffer' });
  if (!data) return new Response('Introuvable', { status: 404 });
  return new Response(data, {
    headers: {
      'Content-Type': 'image/jpeg',
      // Chaque photo a un nom unique : elle peut être gardée en cache longtemps.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};

export const config = { path: '/api/photo/*' };
