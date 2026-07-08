const fetch = global.fetch || require('node-fetch');
const url = process.argv[2] || 'http://localhost:3000';
const email = process.argv[3] || 'loadtest1@gmail.com';
const password = process.argv[4] || 'LoadTest@123';
const count = parseInt(process.argv[5] || '20', 10);

(async () => {
  try {
    const loginRes = await fetch(`${url.replace(/\/$/, '')}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: email, password })
    });
    const loginJson = await loginRes.json();
    if (!loginRes.ok) { console.log('Login failed', loginRes.status, loginJson); return; }
    const token = loginJson.token;

    const prodRes = await fetch(`${url.replace(/\/$/, '')}/api/products`);
    const prodJson = await prodRes.json();
    const products = Array.isArray(prodJson.products) ? prodJson.products : prodJson;
    const p = products[0];
    const price = Number(p.price || p.offer_price || 0) || 10;

    const shippingRes = await fetch(`${url.replace(/\/$/, '')}/api/products/settings`);
    const sjson = shippingRes.ok ? await shippingRes.json() : {};
    const list = (sjson.settings && sjson.settings.cod_available_pincodes) || '';
    const postal = String(list || '').split(',').map(x => x.trim()).filter(Boolean)[0] || '110001';

    const order = { items: [{ product_id: p.id, product_name: p.name || 'x', quantity: 1, price, subtotal: price }], shipping_address: { full_name: 'Load Test', phone: '9999999999', address_line_1: 'Test', city: 'Test', state: 'TS', postal_code: postal, country: 'India' }, payment_method: 'cash_on_delivery', total_amount: price, delivery_charge: 0 };

    const promises = [];
    for (let i=0;i<count;i++) {
      promises.push((async (idx)=>{
        const res = await fetch(`${url.replace(/\/$/, '')}/api/orders`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(order)
        });
        const text = await res.text();
        console.log(`#${idx} -> ${res.status} ${text}`);
      })(i));
    }

    await Promise.all(promises);
  } catch (err) {
    console.error('Debug batch error:', err);
  }
})();
