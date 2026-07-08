const fetch = global.fetch || require('node-fetch');
const url = process.argv[2] || 'http://localhost:3000';
const email = process.argv[3] || 'loadtest1@gmail.com';
const password = process.argv[4] || 'LoadTest@123';

(async () => {
  try {
    const loginRes = await fetch(`${url.replace(/\/$/, '')}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: email, password })
    });
    const loginBody = await loginRes.text();
    console.log('Login status:', loginRes.status, 'body:', loginBody);
    if (!loginRes.ok) return;
    const loginJson = JSON.parse(loginBody);
    const token = loginJson.token;

    const prodRes = await fetch(`${url.replace(/\/$/, '')}/api/products`);
    const prodJson = await prodRes.json();
    const products = Array.isArray(prodJson.products) ? prodJson.products : prodJson;
    console.log('Products count:', products.length);
    const p = products[0];
    const price = Number(p.price || p.offer_price || 0) || 10;
    const order = { items: [{ product_id: p.id, product_name: p.name || 'x', quantity: 1, price, subtotal: price }], shipping_address: { full_name: 'Load Test', phone: '9999999999', address_line_1: 'Test', city: 'Test', state: 'TS', postal_code: '560001', country: 'India' }, payment_method: 'cash_on_delivery', total_amount: price, delivery_charge: 0 };

    const ordRes = await fetch(`${url.replace(/\/$/, '')}/api/orders`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(order)
    });
    const ordText = await ordRes.text();
    console.log('Order status:', ordRes.status, 'body:', ordText);
  } catch (err) {
    console.error('Debug error:', err);
  }
})();
