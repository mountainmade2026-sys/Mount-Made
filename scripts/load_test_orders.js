// Load test script for creating concurrent orders
// Usage:
//  node scripts/load_test_orders.js --url=http://localhost:3000 --concurrency=200 --count=1000 --token=YOUR_JWT
// If --token is omitted, set TEST_USER_EMAIL and TEST_USER_PASSWORD env vars to login and obtain a token.

const { argv } = require('process');
const fetch = global.fetch || require('node-fetch');

function parseArgs() {
  const args = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function login(url, email, password) {
  const loginUrl = `${url.replace(/\/$/, '')}/api/auth/login`;
  const registerUrl = `${url.replace(/\/$/, '')}/api/auth/register`;
  // Try to login first
  let res = await fetch(loginUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: email, password })
  });
  // If login failed due to missing user, attempt a best-effort register and retry login
  if (res.status === 400 || res.status === 404 || res.status === 401) {
    try {
      await fetch(registerUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, full_name: 'Load Test', phone: '9999999999' })
      });
    } catch (regErr) {
      // ignore registration errors
    }
    res = await fetch(loginUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: email, password })
    });
  }
  if (!res.ok) {
    throw new Error(`Login failed: ${res.status}`);
  }
  const j = await res.json();
  // token available as j.token or j.data?.token
  return j.token || (j.data && j.data.token) || null;
}

async function getProducts(url, token) {
  const res = await fetch(`${url.replace(/\/$/, '')}/api/products`);
  if (!res.ok) throw new Error('Failed to fetch products');
  const j = await res.json();
  return Array.isArray(j.products) ? j.products : j;
}

async function createOrder(url, token, order) {
  const res = await fetch(`${url.replace(/\/$/, '')}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(order)
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

async function main() {
  const args = parseArgs();
  const url = args.url || process.env.TARGET_URL || 'http://localhost:3000';
  const concurrency = parseInt(args.concurrency || process.env.CONCURRENCY || '200', 10);
  const count = parseInt(args.count || process.env.COUNT || '1000', 10);
  let token = args.token || process.env.AUTH_TOKEN || null;

  console.log('Target:', url);
  console.log('Concurrency:', concurrency, 'Total requests:', count);

  if (!token) {
    const email = args.email || process.env.TEST_USER_EMAIL;
    const pwd = args.password || process.env.TEST_USER_PASSWORD;
    if (!email || !pwd) {
      console.error('No token and no TEST_USER_EMAIL/TEST_USER_PASSWORD provided. Exiting.');
      process.exit(1);
    }
    console.log('Logging in as', email);
    token = await login(url, email, pwd);
    if (!token) {
      console.error('Login did not return a token. Exiting.');
      process.exit(1);
    }
    console.log('Obtained token, length:', token.length);
  }

  const products = await getProducts(url, token);
  if (!Array.isArray(products) || products.length === 0) {
    console.error('No products available to build orders. Exiting.');
    process.exit(1);
  }

  // Build a simple shipping address
  // Determine a serviceable postal code: prefer --postal_code, else try to fetch site settings
  let postal = args.postal_code || process.env.POSTAL_CODE || null;
  if (!postal) {
    try {
      const sres = await fetch(`${url.replace(/\/$/, '')}/api/products/settings`);
      if (sres.ok) {
        const sjson = await sres.json();
        const list = (sjson.settings && sjson.settings.cod_available_pincodes) || '';
        const first = String(list || '').split(',').map(x => x.trim()).filter(Boolean)[0];
        if (first) postal = first;
      }
    } catch (e) {
      // ignore
    }
  }
  if (!postal) postal = '110001';

  const shipping = {
    full_name: 'Load Test User',
    phone: '9999999999',
    address_line_1: 'Load Test St',
    city: 'Testville',
    state: 'TS',
    postal_code: String(postal),
    country: 'IN'
  };

  // Prepare orders rotating through available products
  const orders = [];
  for (let i = 0; i < count; i++) {
    const p = products[Math.floor(Math.random() * products.length)];
    const price = Number(p.price || p.offer_price || 0) || 10;
    const item = {
      product_id: p.id,
      product_name: p.name || `product-${p.id}`,
      quantity: 1,
      price: price,
      subtotal: price
    };
    orders.push({ items: [item], shipping_address: shipping, payment_method: 'cash_on_delivery', total_amount: price, delivery_charge: 0 });
  }

  // concurrency-limited runner
  let inFlight = 0;
  let index = 0;
  let successes = 0;
  let failures = 0;
  const latencies = [];

  async function runOne(idx) {
    const order = orders[idx];
    const start = Date.now();
    try {
      const res = await createOrder(url, token, order);
      const dur = Date.now() - start;
      latencies.push(dur);
      if (res.status >= 200 && res.status < 300) successes++; else failures++;
    } catch (err) {
      failures++;
    }
  }

  const workers = [];
  for (let w = 0; w < concurrency; w++) {
    workers.push((async () => {
      while (true) {
        const i = index++;
        if (i >= orders.length) break;
        await runOne(i);
      }
    })());
  }

  await Promise.all(workers);

  const total = successes + failures;
  const sum = latencies.reduce((a,b) => a+b, 0);
  const avg = latencies.length ? (sum / latencies.length).toFixed(2) : 0;
  const max = latencies.length ? Math.max(...latencies) : 0;

  console.log('Done. Total:', total, 'Successes:', successes, 'Failures:', failures);
  console.log('Avg latency (ms):', avg, 'Max (ms):', max);
}

main().catch(err => { console.error('Load test failed:', err); process.exit(1); });
