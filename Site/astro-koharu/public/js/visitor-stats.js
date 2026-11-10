// No third-party tracker, cookies, IP storage, or cross-site requests.
(function () {
  const key = 'blogpublish:visitor-id:v1';
  const number = (n) => new Intl.NumberFormat('zh-CN').format(n);
  function visitorId() {
    try {
      let id = localStorage.getItem(key);
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(key, id);
      }
      return id;
    } catch {
      // Storage-blocked visits can still be counted but won't have a stable UV identity.
      return crypto.randomUUID();
    }
  }
  function show(data) {
    for (const [name, value] of [['pv', data.pv], ['uv', data.uv], ['post', data.postPv]]) {
      if (!Number.isSafeInteger(value) || value < 0) continue;
      document.querySelectorAll('[data-visitor-' + name + ']').forEach((element) => {
        element.textContent = number(value);
      });
    }
  }
  let latest = 0;
  async function update() {
    const path = location.pathname.replace(/\/+$/, '') || '/';
    const sequence = ++latest;
    // Throttle reloads and fast client-side revisits; server also enforces 60 seconds.
    let send = true;
    try {
      const key = 'blogpublish:visit:' + path;
      const last = Number(sessionStorage.getItem(key) || 0);
      if (Date.now() - last < 60000) send = false;
      else sessionStorage.setItem(key, String(Date.now()));
    } catch { /* Session storage may be disabled. */ }
    try {
      const response = await fetch('/api/visits' + (send ? '' : '?path=' + encodeURIComponent(path)), {
        method: send ? 'POST' : 'GET',
        ...(send ? {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path, visitor: visitorId() }),
        } : {}),
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) return;
      const data = await response.json();
      if (sequence === latest && location.pathname.replace(/\/+$/, '') === path) show(data);
    } catch { /* Stats are optional and must never interrupt reading. */ }
  }
  document.addEventListener('astro:page-load', update);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', update, { once: true });
  else update();
})();
