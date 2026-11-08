/**
 * Silk & Soul — Cloudflare Worker (Firestore + Client-Side Live Stock)
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

function fmtPrice(n) { return Number(n || 0).toLocaleString('en-IN'); }

async function fetchProductBySlug(env, slug) {
  const url = `${FS_BASE}/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery?key=${env.FIREBASE_API_KEY}`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'products' }],
      where: { fieldFilter: { field: { fieldPath: 'slug' }, op: 'EQUAL', value: { stringValue: slug } } },
      limit: 1
    }
  };
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) return null;
    const arr = await res.json();
    const hit = arr.find((x) => x.document);
    return hit ? parseDoc(hit.document) : null;
  } catch { return null; }
}

async function fetchRelatedProducts(env, category, excludeId) {
  const url = `${FS_BASE}/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery?key=${env.FIREBASE_API_KEY}`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'products' }],
      where: { fieldFilter: { field: { fieldPath: 'category' }, op: 'EQUAL', value: { stringValue: category } } },
      limit: 5
    }
  };
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) return [];
    const arr = await res.json();
    return arr.filter(x => x.document).map(x => parseDoc(x.document)).filter(p => p.id !== excludeId).slice(0, 4);
  } catch { return []; }
}

function renderProductCard(p) {
  const priceStr = fmtPrice(p.price);
  const oldPriceStr = p.oldPrice > p.price ? fmtPrice(p.oldPrice) : '';
  const tag = p.tag ? `<span class="tag">${esc(p.tag)}</span>` : '';
  const url = `/products/${p.slug || p.id}`;
  const img = p.image || 'https://placehold.co/300x400/F0E8DE/7B2D4E?text=Silk+%26+Soul';
  const inStock = Number(p.stock) > 0;
  
  return `
    <div class="product-card">
      <div class="product-image">
        <a href="${url}"><img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy" /></a>
        ${tag}
        <button class="wishlist-btn" data-product-id="${p.id}" aria-label="Add to wishlist">♡</button>
      </div>
      <div class="product-info">
        <a href="${url}" style="text-decoration:none;color:inherit;">
          <div class="name">${esc(p.name)}</div>
          <div class="variant">${esc(p.variant || 'Saree')}</div>
        </a>
        <div class="price-row">
          <span class="price">₹${priceStr}</span>
          ${oldPriceStr ? `<span class="price-old">₹${oldPriceStr}</span>` : ''}
        </div>
        <div class="rating">
          <span class="stars">★★★★★</span>
          <span class="count">(${p.reviews || 0})</span>
        </div>
        <button class="btn-add" 
          data-product-id="${p.id}" 
          data-name="${esc(p.name)}" 
          data-variant="${esc(p.variant || '')}" 
          data-price="${p.price}" 
          data-image="${esc(img)}"
          ${!inStock ? 'disabled style="background:#bbb;cursor:not-allowed;"' : ''}>
          ${inStock ? 'Add to Cart' : 'Out of Stock'}
        </button>
      </div>
    </div>
  `;
}

function renderProductPage(p, relatedProducts) {
  const priceStr = fmtPrice(p.price);
  const oldPriceStr = p.oldPrice > p.price ? fmtPrice(p.oldPrice) : '';
  const discount = p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
  const stock = Number(p.stock || 0);
  const inStock = stock > 0;
  const image = p.image || 'https://placehold.co/600x800/F0E8DE/7B2D4E?text=Silk+%26+Soul';
  const cartPayload = JSON.stringify({ id: p.id, name: p.name, variant: p.variant || '', price: Number(p.price) || 0, image: image });
  
  const relatedHtml = relatedProducts.length > 0 ? `
    <section class="related-products">
      <div class="container">
        <h2 class="related-title">You May Also Like</h2>
        <div class="product-grid">
          ${relatedProducts.map(renderProductCard).join('')}
        </div>
      </div>
    </section>
  ` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(p.name)} — Silk &amp; Soul</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--primary:#7B2D4E;--primary-dark:#5A1E38;--gold:#C9A96E;--gold-light:#DFC896;--gold-pale:#F4EDE0;--cream:#FCF8F3;--beige:#F0E8DE;--warm-white:#FFFCF9;--text-dark:#2D1B1A;--text-soft:#4A3A38;--text-muted:#7A6A68;--shadow:0 8px 40px rgba(45,27,26,0.08);--shadow-hover:0 16px 56px rgba(45,27,26,0.14);--radius:16px;--radius-sm:8px;--transition:0.35s cubic-bezier(0.25,0.46,0.45,0.94);}
*{margin:0;padding:0;box-sizing:border-box}html{scroll-behavior:smooth}body{font-family:'Inter',sans-serif;background:var(--warm-white);color:var(--text-dark);line-height:1.6;-webkit-font-smoothing:antialiased;overflow-x:hidden}img{max-width:100%;display:block}a{text-decoration:none;color:inherit}.container{max-width:1280px;margin:0 auto;padding:0 24px}

.header{position:sticky;top:0;z-index:100;background:rgba(255,252,249,0.94);backdrop-filter:blur(16px);border-bottom:1px solid rgba(45,27,26,0.05);transition:box-shadow 0.4s ease}
.header-inner{display:flex;align-items:center;justify-content:space-between;gap:20px;height:70px}
.logo{font-family:'Playfair Display',serif;font-size:1.7rem;font-weight:700;color:var(--primary);display:flex;align-items:center;gap:4px;flex-shrink:0}
.logo .logo-icon{font-size:1.3rem;color:var(--gold);margin-right:2px}.logo .logo-amp{color:var(--gold);font-weight:400;font-style:italic}
.nav{display:flex;align-items:center;gap:36px}
.nav a{font-size:0.9rem;font-weight:500;color:var(--text-soft);letter-spacing:0.6px;text-transform:uppercase;position:relative;padding:4px 0;transition:var(--transition)}
.nav a:hover{color:var(--primary)}
.nav-actions{display:flex;align-items:center;gap:8px}
.nav-actions .icon-btn{width:42px;height:42px;border-radius:50%;border:1px solid rgba(45,27,26,0.06);display:flex;align-items:center;justify-content:center;font-size:1.15rem;color:var(--text-soft);position:relative;transition:var(--transition)}
.nav-actions .icon-btn:hover{background:var(--gold-pale);color:var(--primary)}
.nav-actions .icon-btn .badge{position:absolute;top:-4px;right:-4px;background:var(--primary);color:#fff;font-size:0.6rem;font-weight:600;width:19px;height:19px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.mobile-toggle{display:none;background:none;border:none;font-size:1.5rem;color:var(--text-dark);cursor:pointer}
@media(max-width:1024px){.nav{display:none}.mobile-toggle{display:block}.nav.open{display:flex;flex-direction:column;position:absolute;top:70px;left:0;right:0;background:var(--warm-white);padding:20px;box-shadow:0 10px 20px rgba(0,0,0,0.05)}}

.product-page{padding:60px 0}
.product-layout{display:grid;grid-template-columns:1fr 1fr;gap:60px;align-items:start}
@media(max-width:900px){.product-layout{grid-template-columns:1fr;gap:32px}}
.imgbox{position:relative;border-radius:16px;overflow:hidden;background:var(--beige);aspect-ratio:3/4;box-shadow:var(--shadow-hover)}
.imgbox img{width:100%;height:100%;object-fit:cover}
.tag{position:absolute;top:16px;left:16px;background:var(--gold);color:var(--text-dark);font-size:.7rem;font-weight:600;padding:5px 14px;border-radius:50px;text-transform:uppercase}
.details h1{font-family:'Playfair Display',serif;font-size:2.6rem;line-height:1.15;margin-bottom:8px}
.variant{color:var(--text-muted);font-size:1rem;margin-bottom:20px}
.rating{color:var(--gold);font-size:1.05rem;letter-spacing:2px;margin-bottom:22px}
.rating .count{color:var(--text-muted);font-size:.85rem;margin-left:8px;letter-spacing:0}
.pricerow{display:flex;align-items:baseline;gap:14px;margin-bottom:6px}
.price{font-size:2rem;font-weight:700;color:var(--primary);font-family:'Playfair Display',serif}
.price-old{font-size:1.1rem;color:var(--text-muted);text-decoration:line-through}
.discount{display:inline-block;background:var(--gold-pale);color:var(--primary);font-size:.8rem;font-weight:600;padding:4px 12px;border-radius:50px;margin-bottom:22px}
.desc{color:var(--text-soft);line-height:1.75;margin-bottom:26px}
.stock{font-size:.9rem;font-weight:600;margin-bottom:18px;display:flex;align-items:center;gap:6px}
.stock.in{color:#1F8A4C}.stock.out{color:#C0392B}
.btn-add{display:inline-flex;align-items:center;justify-content:center;background:var(--primary);color:#fff;padding:16px 40px;border-radius:50px;font-weight:600;font-size:1.05rem;border:none;cursor:pointer;transition:.3s;box-shadow:0 8px 24px rgba(123,45,78,.3);width:100%;max-width:340px}
.btn-add:hover:not(:disabled){background:var(--primary-dark);transform:translateY(-2px)}
.btn-add:disabled{background:#bbb;cursor:not-allowed}
.features{margin-top:32px;padding-top:24px;border-top:1px solid rgba(45,27,26,.08);display:grid;gap:12px}
.feature{display:flex;gap:10px;font-size:.9rem;color:var(--text-soft)}
.feature b{color:var(--gold)}

.related-products{padding:80px 0;background:var(--cream);border-top:1px solid rgba(45,27,26,0.05)}
.related-title{font-family:'Playfair Display',serif;font-size:2rem;text-align:center;margin-bottom:40px;color:var(--text-dark)}
.product-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:28px}
@media(max-width:1024px){.product-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:480px){.product-grid{grid-template-columns:1fr 1fr;gap:12px}}
.product-card{background:var(--warm-white);border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow);transition:.3s;border:1px solid rgba(45,27,26,.04);display:flex;flex-direction:column}
.product-card:hover{transform:translateY(-6px);box-shadow:var(--shadow-hover);border-color:var(--gold-light)}
.product-image{position:relative;aspect-ratio:3/4;overflow:hidden;background:var(--beige);display:flex;align-items:center;justify-content:center}
.product-image img{width:100%;height:100%;object-fit:contain;transition:transform 0.6s ease}
.product-image .wishlist-btn{position:absolute;top:14px;right:14px;background:rgba(255,252,249,0.85);border:none;width:38px;height:38px;border-radius:50%;font-size:1.1rem;cursor:pointer;color:var(--text-soft)}
.product-info{padding:18px 20px;flex:1;display:flex;flex-direction:column;gap:4px}
.product-info .name{font-weight:600;font-size:1.05rem;color:var(--text-dark)}
.product-info .variant{font-size:0.85rem;color:var(--text-muted)}
.product-info .price-row{display:flex;align-items:center;gap:12px;margin:8px 0}
.product-info .price{font-weight:700;font-size:1.2rem;color:var(--primary)}
.product-info .price-old{font-size:0.9rem;color:var(--text-muted);text-decoration:line-through}
.product-info .rating{display:flex;align-items:center;gap:6px;font-size:0.85rem;margin-bottom:12px}
.product-info .rating .stars{color:var(--gold)}
.product-info .btn-add{width:100%;padding:12px;border:none;background:var(--primary);color:#fff;border-radius:50px;font-weight:600;font-size:0.95rem;cursor:pointer;margin-top:auto}
.product-info .btn-add:hover{background:var(--primary-dark)}

.footer{padding:56px 0 32px;background:var(--text-dark);color:rgba(255,255,255,0.7);border-top:3px solid var(--gold)}
.footer .container{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:48px}
@media(max-width:768px){.footer .container{grid-template-columns:1fr 1fr}}
@media(max-width:480px){.footer .container{grid-template-columns:1fr}}
.footer-brand .logo{color:#fff;margin-bottom:14px}.footer-brand .logo .logo-icon{color:var(--gold)}
.footer-brand p{font-size:0.9rem;line-height:1.7;color:rgba(255,255,255,0.6)}
.footer-col h4{color:#fff;font-weight:600;font-size:0.95rem;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:18px;position:relative;padding-bottom:8px}
.footer-col h4::after{content:'';position:absolute;bottom:0;left:0;width:28px;height:2px;background:var(--gold);border-radius:2px}
.footer-col a{display:block;font-size:0.9rem;color:rgba(255,255,255,0.5);margin-bottom:10px;transition:.3s}
.footer-col a:hover{color:var(--gold);transform:translateX(3px)}
.footer-divider{grid-column:1/-1;border:none;height:1px;background:linear-gradient(90deg,transparent,rgba(201,169,110,0.2),transparent);margin:28px 0 24px}
.footer-bottom{text-align:center;font-size:0.8rem;color:rgba(255,255,255,0.35);grid-column:1/-1}
.footer-bottom .heart{color:var(--gold)}
</style>
</head>
<body>

<header class="header">
  <div class="container header-inner">
    <a href="/" class="logo"><span class="logo-icon">✦</span><span class="logo-silk">Silk</span><span class="logo-amp">&amp;</span><span class="logo-soul">Soul</span></a>
    <nav class="nav" id="mainNav">
      <a href="/#categories">Sarees</a><a href="/#best-sellers">Best Sellers</a><a href="/#testimonials">Reviews</a><a href="/shop">Shop</a>
    </nav>
    <div class="nav-actions">
      <a href="/wishlist.html" class="icon-btn">♡<span class="badge" id="wishlistBadge">0</span></a>
      <a href="/cart.html" class="icon-btn">🛒<span class="badge" id="cartBadge">0</span></a>
      <button class="mobile-toggle" id="mobileToggle">☰</button>
    </div>
  </div>
</header>

<section class="product-page">
  <div class="container product-layout">
    <div class="imgbox">
      ${p.tag ? `<span class="tag">${esc(p.tag)}</span>` : ''}
      <img src="${esc(image)}" alt="${esc(p.name)}" />
    </div>
    <div class="details">
      <h1>${esc(p.name)}</h1>
      <div class="variant">${esc(p.variant || '')}</div>
      <div class="rating">★★★★★<span class="count">(${p.reviews || 0} reviews)</span></div>
      <div class="pricerow">
        <span class="price">₹${priceStr}</span>
        ${oldPriceStr ? `<span class="price-old">₹${oldPriceStr}</span>` : ''}
      </div>
      ${discount ? `<div class="discount">Save ${discount}%</div>` : ''}
      <p class="desc">${esc(p.description || 'Handcrafted with love, this saree blends comfort with timeless elegance.')}</p>
      
      <div class="stock ${inStock ? 'in' : 'out'}" id="mainStock">
        ${inStock ? `✓ In Stock (${stock} available)` : '✗ Out of Stock'}
      </div>
      
      <button class="btn-add" id="mainAddBtn" ${inStock ? '' : 'disabled'}>
        ${inStock ? '✦ Add to Cart' : 'Out of Stock'}
      </button>
      
      <div class="features">
        <div class="feature"><b>✓</b> Free shipping above ₹999</div>
        <div class="feature"><b>✓</b> 7-day easy returns</div>
        <div class="feature"><b>✓</b> 100% authentic handwoven</div>
      </div>
    </div>
  </div>
</section>

${relatedHtml}

<footer class="footer">
  <div class="container">
    <div class="footer-brand">
      <div class="logo"><span class="logo-icon">✦</span><span class="logo-silk">Silk</span><span class="logo-amp">&amp;</span><span class="logo-soul">Soul</span></div>
      <p>Sarees designed for real life — where elegance meets everyday comfort.</p>
    </div>
    <div class="footer-col"><h4>Shop</h4><a href="/shop">Cotton Sarees</a><a href="/shop">Silk Sarees</a><a href="/shop">Georgette</a><a href="/shop">Designer Drapes</a></div>
    <div class="footer-col"><h4>Support</h4><a href="#">Shipping Info</a><a href="#">Returns &amp; Exchanges</a><a href="#">Size Guide</a><a href="#">Contact Us</a></div>
    <div class="footer-col"><h4>Company</h4><a href="#">About Us</a><a href="#">Our Story</a><a href="#">Sustainability</a><a href="#">Careers</a></div>
    <hr class="footer-divider" />
    <div class="footer-bottom">© 2026 Silk &amp; Soul. Made with <span class="heart">♥</span> for women who move the world.</div>
  </div>
</footer>

<!-- FIREBASE LIVE STOCK CHECKER -->
<script type="module">
  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
  import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

  const firebaseConfig = {
    apiKey: "AIzaSyAV_cCJFySKWCfY3zPsZMkb5Oau9BAQNlc",
    authDomain: "silk-and-soul.firebaseapp.com",
    projectId: "silk-and-soul",
    storageBucket: "silk-and-soul.firebasestorage.app",
    messagingSenderId: "925303527952",
    appId: "1:925303527952:web:111e2a00f85cb9859e4895"
  };

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const productId = "${p.id}";

  // LIVE LISTENER FOR THIS SPECIFIC PRODUCT
  onSnapshot(doc(db, "products", productId), (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      const stock = Number(data.stock) || 0;
      const inStock = stock > 0;
      
      const stockEl = document.getElementById('mainStock');
      const btnEl = document.getElementById('mainAddBtn');

      if (inStock) {
        stockEl.className = 'stock in';
        stockEl.innerHTML = `✓ In Stock (${stock} available)`;
        btnEl.disabled = false;
        btnEl.innerHTML = '✦ Add to Cart';
        btnEl.style.background = '';
        btnEl.style.cursor = 'pointer';
      } else {
        stockEl.className = 'stock out';
        stockEl.innerHTML = '✗ Out of Stock';
        btnEl.disabled = true;
        btnEl.innerHTML = 'Out of Stock';
        btnEl.style.background = '#bbb';
        btnEl.style.cursor = 'not-allowed';
      }
    }
  });

  // Cart Functions
  function getCart() { try { return JSON.parse(localStorage.getItem('silkSoulCart') || '[]'); } catch { return []; } }
  function saveCart(cart) { localStorage.setItem('silkSoulCart', JSON.stringify(cart)); updateCartBadge(); }
  function updateCartBadge() { document.getElementById('cartBadge').textContent = getCart().reduce((s,i)=>s+(i.quantity||1),0); }
  function getWishlist() { try { return JSON.parse(localStorage.getItem('silkSoulWishlist') || '[]'); } catch { return []; } }

  const mainBtn = document.getElementById('mainAddBtn');
  if (mainBtn) {
    mainBtn.addEventListener('click', () => {
      if (mainBtn.disabled) return;
      const product = ${cartPayload};
      let cart = getCart();
      const existing = cart.find(i => i.id === product.id);
      if (existing) existing.quantity = (existing.quantity || 1) + 1;
      else cart.push({ ...product, quantity: 1 });
      saveCart(cart);
      window.location.href = '/cart.html';
    });
  }

  document.addEventListener('click', (e) => {
    const addBtn = e.target.closest('.product-info .btn-add');
    if (addBtn && !addBtn.disabled) {
      e.preventDefault();
      const id = addBtn.dataset.productId;
      let cart = getCart();
      const existing = cart.find(i => i.id === id);
      if (existing) existing.quantity = (existing.quantity || 1) + 1;
      else cart.push({ id, name: addBtn.dataset.name, variant: addBtn.dataset.variant, price: parseFloat(addBtn.dataset.price), image: addBtn.dataset.image, quantity: 1 });
      saveCart(cart);
      window.location.href = '/cart.html';
      return;
    }
    const wishBtn = e.target.closest('.wishlist-btn');
    if (wishBtn) { 
        e.preventDefault(); 
        let w = getWishlist(); 
        let i = w.indexOf(wishBtn.dataset.productId); 
        if(i>-1) w.splice(i,1); else w.push(wishBtn.dataset.productId); 
        localStorage.setItem('silkSoulWishlist', JSON.stringify(w)); 
        document.getElementById('wishlistBadge').textContent = w.length;
    }
  });

  updateCartBadge();
  document.getElementById('wishlistBadge').textContent = getWishlist().length;
  document.getElementById('mobileToggle').addEventListener('click', () => {
    document.getElementById('mainNav').classList.toggle('open');
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
      if (path.startsWith('/products/')) {
        const slug = decodeURIComponent(path.replace('/products/', '').replace(/\/$/, ''));
        const product = await fetchProductBySlug(env, slug);
        
        if (!product) {
          return new Response(`<h1 style="text-align:center;padding:50px;font-family:sans-serif">Product Not Found. <a href="/">Go Home</a></h1>`, { status: 404, headers: { 'Content-Type': 'text/html' } });
        }
        
        const related = await fetchRelatedProducts(env, product.category, product.id);
        
        return new Response(renderProductPage(product, related), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }

      return env.ASSETS.fetch(request);
    } catch (err) {
      return new Response('Server error: ' + err.message, { status: 500 });
    }
  }
};
