/**
 * Silk & Soul — Cloudflare Worker (Firebase Firestore Edition)
 * ---------------------------------------------------------
 * Routes:
 *   GET /products/:slug  → Firestore se product laata hai aur SEO page render karta hai
 *   GET /admin or /admin/ → admin.html serve karta hai
 *   /*                    → static assets
 */

const FS_BASE = 'https://firestore.googleapis.com/v1';

function parseValue(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return new Date(v.timestampValue).getTime();
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(parseValue);
  if ('mapValue' in v) {
    const o = {};
    for (const [k, vv] of Object.entries(v.mapValue.fields || {})) o[k] = parseValue(vv);
    return o;
  }
  return null;
}

function parseDoc(doc) {
  const id = doc.name.split('/').pop();
  const o = { id };
  for (const [k, v] of Object.entries(doc.fields || {})) o[k] = parseValue(v);
  return o;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

async function fetchProductBySlug(env, slug) {
  const url = `${FS_BASE}/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery?key=${env.FIREBASE_API_KEY}`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'products' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'slug' },
          op: 'EQUAL',
          value: { stringValue: slug }
        }
      },
      limit: 1
    }
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) return null;
    const arr = await res.json();
    const hit = arr.find((x) => x.document);
    return hit ? parseDoc(hit.document) : null;
  } catch {
    return null;
  }
}

function renderProductPage(p) {
  const price = Number(p.price || 0);
  const oldPrice = Number(p.oldPrice || 0);
  const priceStr = price.toLocaleString('en-IN');
  const oldPriceStr = oldPrice > price ? oldPrice.toLocaleString('en-IN') : '';
  const discount = oldPrice > price ? Math.round((1 - price / oldPrice) * 100) : 0;
  const stock = Number(p.stock || 0);
  const inStock = stock > 0;
  const rating = Math.max(0, Math.min(5, Math.round(Number(p.rating) || 5)));
  const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
  const image = p.image || 'https://placehold.co/600x800/F0E8DE/7B2D4E?text=Silk+%26+Soul';
  const name = esc(p.name);
  const variant = esc(p.variant || '');
  const desc = esc(p.description || 'Handcrafted with love, this saree blends comfort with timeless elegance. Perfect for every occasion.');
  const tagHtml = p.tag ? `<span class="tag">${esc(p.tag)}</span>` : '';
  const cartPayload = JSON.stringify({
    id: p.id,
    name: p.name,
    variant: p.variant || '',
    price: Number(p.price) || 0,
    image: p.image || ''
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${name} — Silk &amp; Soul</title>
<meta name="description" content="${desc.slice(0, 150)}" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:#FFFCF9;color:#2D1B1A;line-height:1.6;-webkit-font-smoothing:antialiased}
a{text-decoration:none;color:inherit}
.topbar{position:sticky;top:0;z-index:10;background:rgba(255,252,249,.95);backdrop-filter:blur(12px);border-bottom:1px solid rgba(45,27,26,.06);padding:14px 24px;display:flex;align-items:center;justify-content:space-between}
.logo{font-family:'Playfair Display',serif;font-size:1.4rem;font-weight:700;color:#7B2D4E;display:flex;align-items:center;gap:4px}
.logo .icon{color:#C9A96E}
.logo .amp{color:#C9A96E;font-style:italic;font-weight:400}
.topbar a.back{color:#4A3A38;font-weight:500;font-size:.9rem;padding:8px 16px;border-radius:50px;border:1px solid #e5ddd3;transition:.2s}
.topbar a.back:hover{background:#F4EDE0;border-color:#DFC896;color:#7B2D4E}
.wrap{max-width:1140px;margin:0 auto;padding:40px 24px}
.product{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:start}
@media(max-width:840px){.product{grid-template-columns:1fr;gap:32px}}
.imgbox{position:relative;border-radius:16px;overflow:hidden;background:#F0E8DE;aspect-ratio:3/4;box-shadow:0 20px 60px rgba(45,27,26,.14);display:flex;align-items:center;justify-content:center}
.imgbox img{width:100%;height:100%;object-fit:contain;display:block}
.tag{position:absolute;top:16px;left:16px;background:#C9A96E;color:#2D1B1A;font-size:.7rem;font-weight:600;padding:5px 14px;border-radius:50px;text-transform:uppercase;letter-spacing:.8px;z-index:2;box-shadow:0 2px 8px rgba(201,169,110,.3)}
.details{padding-top:8px}
.details h1{font-family:'Playfair Display',serif;font-size:2.6rem;line-height:1.15;font-weight:700;color:#2D1B1A;margin-bottom:8px}
@media(max-width:840px){.details h1{font-size:2rem}}
.variant{color:#7A6A68;font-size:1rem;margin-bottom:20px}
.rating{color:#C9A96E;font-size:1.05rem;letter-spacing:2px;margin-bottom:22px}
.rating .count{color:#7A6A68;font-size:.85rem;letter-spacing:0;margin-left:8px}
.pricerow{display:flex;align-items:baseline;gap:14px;margin-bottom:6px}
.price{font-size:2rem;font-weight:700;color:#7B2D4E;font-family:'Playfair Display',serif}
.price-old{font-size:1.1rem;color:#7A6A68;text-decoration:line-through}
.discount{display:inline-block;background:#F4EDE0;color:#7B2D4E;font-size:.8rem;font-weight:600;padding:4px 12px;border-radius:50px;margin-bottom:22px}
.desc{color:#4A3A38;font-size:1rem;line-height:1.75;margin-bottom:26px;max-width:520px}
.stock{font-size:.9rem;font-weight:600;margin-bottom:18px;display:flex;align-items:center;gap:6px}
.stock.in{color:#1F8A4C}
.stock.out{color:#C0392B}
.btn-add{display:inline-flex;align-items:center;justify-content:center;gap:10px;background:#7B2D4E;color:#fff;padding:16px 40px;border-radius:50px;font-weight:600;font-size:1.05rem;border:none;cursor:pointer;transition:.3s;box-shadow:0 8px 24px rgba(123,45,78,.3);width:100%;max-width:340px}
.btn-add:hover:not(:disabled){background:#5A1E38;transform:translateY(-2px);box-shadow:0 12px 32px rgba(123,45,78,.4)}
.btn-add:disabled{background:#bbb;cursor:not-allowed;box-shadow:none}
.features{margin-top:32px;padding-top:24px;border-top:1px solid rgba(45,27,26,.08);display:grid;gap:12px}
.feature{display:flex;gap:10px;font-size:.9rem;color:#4A3A38;align-items:center}
.feature .check{color:#C9A96E;font-weight:700;font-size:1.1rem}
.note{margin-top:48px;text-align:center;font-size:.85rem;color:#7A6A68;padding-top:24px;border-top:1px solid rgba(45,27,26,.06)}
</style>
</head>
<body>
<header class="topbar">
  <a href="/" class="logo"><span class="icon">✦</span>Silk<span class="amp">&amp;</span>Soul</a>
  <a href="/" class="back">← Back to Shop</a>
</header>

<div class="wrap">
  <div class="product">
    <div class="imgbox">
      ${tagHtml}
      <img src="${esc(image)}" alt="${name}" />
    </div>
    <div class="details">
      <h1>${name}</h1>
      <div class="variant">${variant}</div>
      <div class="rating">${stars}<span class="count">(${p.reviews || 0} reviews)</span></div>
      <div class="pricerow">
        <span class="price">₹${priceStr}</span>
        ${oldPriceStr ? `<span class="price-old">₹${oldPriceStr}</span>` : ''}
      </div>
      ${discount ? `<div class="discount">✦ Save ${discount}%</div>` : ''}
      <p class="desc">${desc}</p>
      <div class="stock ${inStock ? 'in' : 'out'}">
        ${inStock ? `✓ In Stock · ${stock} available` : '✗ Out of Stock'}
      </div>
      <button class="btn-add" id="addBtn" ${inStock ? '' : 'disabled'}>
        ${inStock ? '✦ Add to Cart' : 'Out of Stock'}
      </button>
      <div class="features">
        <div class="feature"><span class="check">✓</span> Free shipping above ₹999</div>
        <div class="feature"><span class="check">✓</span> 7-day easy returns</div>
        <div class="feature"><span class="check">✓</span> 100% authentic handwoven</div>
      </div>
    </div>
  </div>
  <div class="note">© 2026 Silk &amp; Soul · Made with ♥ for women who move the world</div>
</div>

<script>
document.getElementById('addBtn').addEventListener('click', function () {
  if (this.disabled) return;
  const product = ${cartPayload};
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem('silkSoulCart') || '[]'); } catch {}
  const existing = cart.find(i => i.id === product.id);
  if (existing) existing.quantity = (existing.quantity || 1) + 1;
  else cart.push({ ...product, quantity: 1 });
  localStorage.setItem('silkSoulCart', JSON.stringify(cart));
  window.location.href = '/cart.html';
});
</script>
</body>
</html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Product slug page
      if (path.startsWith('/products/')) {
        const slug = decodeURIComponent(path.replace('/products/', '').replace(/\/$/, ''));
        const product = await fetchProductBySlug(env, slug);
        if (!product) {
          return new Response(`<!DOCTYPE html><html><head><title>Not Found — Silk & Soul</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;600&display=swap" rel="stylesheet">
</head>
<body style="font-family:'Inter',sans-serif;text-align:center;padding:80px 24px;background:#FFFCF9;color:#2D1B1A">
<h1 style="font-family:'Playfair Display',serif;font-size:2.5rem;color:#7B2D4E;margin-bottom:12px">404</h1>
<p style="color:#7A6A68;margin-bottom:24px">Product not found.</p>
<a href="/" style="display:inline-block;background:#7B2D4E;color:#fff;padding:12px 32px;border-radius:50px;text-decoration:none;font-weight:600">← Back to Shop</a>
</body></html>`, {
            status: 404,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        }
        return new Response(renderProductPage(product), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }

      // Admin page rewrite
      if (path === '/admin' || path === '/admin/') {
        const adminUrl = new URL('/admin.html', url).toString();
        return env.ASSETS.fetch(new Request(adminUrl, request));
      }

      // Everything else → static
      return env.ASSETS.fetch(request);
    } catch (err) {
      return new Response('Server error: ' + (err.message || 'unknown'), { status: 500 });
    }
  }
};
