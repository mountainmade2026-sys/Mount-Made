(function (global) {
  const PROVIDER_PACKAGES = {
    gpay: 'com.google.android.apps.nbu.paisa.user',
    phonepe: 'com.phonepe.app',
    paytm: 'net.one97.paytm'
  };

  function normalizeUpiRecipient(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^upi:/i.test(raw)) {
      return raw.replace(/^upi:/i, 'upi://');
    }
    if (/^(https?:\/\/|data:|file:\/\/)/i.test(raw)) {
      return '';
    }
    if (/^[\/\\]/.test(raw) || raw.includes('/')) {
      return '';
    }
    return raw;
  }

  function parseUpiAmount(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    const numeric = Number(raw.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }

  function encodeUpiQueryString(params) {
    const encoded = params.toString().replace(/\+/g, '%20');
    return encoded.replace(/pa=([^&]*)/, (match, value) => 'pa=' + value.replace(/%40/g, '@'));
  }

  function buildProviderDeepLink(payload, provider = 'gpay') {
    if (!payload) return null;

    const rawValue = normalizeUpiRecipient(payload.paymentValue);
    const upiId = normalizeUpiRecipient(payload.upiId);
    const phone = String(payload.phoneNumber || '').trim();

    let recipient = rawValue;
    if (/^https?:\/\//i.test(rawValue) || /^data:/i.test(rawValue) || /^file:\/\//i.test(rawValue) || /^[\/\\]/.test(rawValue) || rawValue.includes('/')) {
      recipient = upiId || phone || '';
    }
    if (!recipient) recipient = upiId || phone || '';
    recipient = String(recipient || '').trim();
    if (!recipient) return null;

    if (/^upi:\/\/(pay)?/i.test(recipient)) {
      let normalized = recipient.replace(/^upi:pay/i, 'upi://pay');
      normalized = normalized.replace(/^upi:\/\//i, 'upi://');
      try {
        const url = new URL(normalized);
        const params = new URLSearchParams(url.search);
        const payeeName = String(payload.payeeName || 'Mount Made').trim();
        const orderNote = `Order ${payload.orderNumber || ''}`.trim();
        const amount = parseUpiAmount(payload.amount);

        if (payeeName) params.set('pn', payeeName);
        if (orderNote) params.set('tn', orderNote);
        if (amount !== null) {
          params.set('am', amount.toFixed(2));
        }
        params.set('cu', 'INR');

        return `upi://pay?${encodeUpiQueryString(params)}`;
      } catch (e) {
        return null;
      }
    }

    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(recipient)) {
      return null;
    }

    const params = new URLSearchParams({
      pa: recipient,
      pn: payload.payeeName || 'Mount Made',
      tn: `Order ${payload.orderNumber || ''}`.trim(),
      cu: 'INR'
    });
    const amount = parseUpiAmount(payload.amount);
    if (amount !== null) {
      params.set('am', amount.toFixed(2));
    }

    return `upi://pay?${encodeUpiQueryString(params)}`;
  }

  function buildAndroidIntentUrl(link, provider = 'gpay') {
    if (!link) return null;
    const packageName = PROVIDER_PACKAGES[provider] || PROVIDER_PACKAGES.gpay;
    try {
      const parsed = new URL(link);
      const pathname = parsed.pathname === '/' ? '' : parsed.pathname;
      const target = `${parsed.host}${pathname}${parsed.search}`.replace(/^\/+/, '');
      return `intent://${target}#Intent;scheme=upi;package=${packageName};end`;
    } catch (e) {
      const safeSuffix = String(link).replace(/^upi:\/\//i, '');
      return `intent://${safeSuffix}#Intent;scheme=upi;package=${packageName};end`;
    }
  }

  function isCapacitorNative() {
    return !!(global.Capacitor && typeof global.Capacitor.isNativePlatform === 'function' && global.Capacitor.isNativePlatform());
  }

  function launchPaymentLink(link, provider = 'gpay') {
    if (!link) return false;

    const ua = global.navigator?.userAgent || '';
    const tryBrowserOpen = () => {
      try {
        if (global.Capacitor?.Plugins?.Browser?.open) {
          global.Capacitor.Plugins.Browser.open({ url: link, presentationStyle: 'popover' });
          return true;
        }
      } catch (e) {
        // ignore and fall back
      }

      try {
        if (global.open(link, '_blank', 'noopener,noreferrer')) return true;
      } catch (e) {
        // ignore
      }

      try {
        global.location.href = link;
        return true;
      } catch (e) {
        return false;
      }
    };

    if (/Android/i.test(ua)) {
      const intentUrl = buildAndroidIntentUrl(link, provider);
      try {
        global.location.href = intentUrl;
        return true;
      } catch (e) {
        // fall through
      }

      try {
        if (global.open(intentUrl, '_blank', 'noopener,noreferrer')) return true;
      } catch (e) {
        // fall through
      }
    }

    if (isCapacitorNative()) {
      return tryBrowserOpen();
    }

    try {
      global.location.href = link;
      return true;
    } catch (e) {
      return tryBrowserOpen();
    }
  }

  const api = {
    normalizeUpiRecipient,
    parseUpiAmount,
    encodeUpiQueryString,
    buildProviderDeepLink,
    buildAndroidIntentUrl,
    isCapacitorNative,
    launchPaymentLink
  };

  global.PaymentDeepLinks = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
