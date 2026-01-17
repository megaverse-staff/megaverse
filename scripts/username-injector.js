/*
  Forumactif – stable USERNAME injector
  Goal: inject the current user's username inside:
    <span class="USERNAME" id="USER-NAME"></span>

  Why older scripts fail:
  - FA miscvars often uses HTML entities: &#123;USERNAME&#125; (not {USERNAME})
  - DOM targets may appear after scripts run
  - XHR can be cached or race with injection

  This script:
  - Fetches /popup_help.php?l=miscvars with cache-busting + no-store
  - Parses USERNAME robustly (supports {USERNAME} and &#123;USERNAME&#125;)
  - Retries with backoff
  - Watches DOM (MutationObserver) to inject when #USER-NAME appears
*/
(function () {
  const TARGET_SELECTOR = '.USERNAME, #USER-NAME';
  const MISC_URL = '/popup_help.php?l=miscvars';
  const MAX_RETRIES = 8;

  let cachedUsername = null;

  function setUsername(username) {
    if (!username) return false;

    const nodes = document.querySelectorAll(TARGET_SELECTOR);
    if (!nodes.length) return false;

    nodes.forEach((el) => {
      // Avoid SVGAnimatedString edge cases
      if (!el || (el.className && el.className.baseVal)) return;

      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.value = username;
      } else {
        el.textContent = username;
      }
    });

    return true;
  }

  function decodeHtml(str) {
    const d = document.createElement('div');
    d.innerHTML = str;
    return (d.textContent || d.innerText || '').trim();
  }

  function extractUsernameFromMiscvars(html) {
    // Matches both:
    //  <strong>&#123;USERNAME&#125;</strong> ...
    //  <strong>{USERNAME}</strong> ...
    // Captures the value right after the ":" up to the next <span
    const re = /<strong>(?:\{USERNAME\}|&#123;USERNAME&#125;)<\/strong>\s*&nbsp;:\s*&nbsp;\s*([\s\S]*?)\s*&nbsp;\s*<span/i;
    const m = html.match(re);
    if (!m || !m[1]) return null;
    return decodeHtml(m[1]);
  }

  async function fetchUsername(attempt) {
    const n = attempt || 0;

    if (cachedUsername) {
      setUsername(cachedUsername);
      return;
    }

    try {
      const res = await fetch(MISC_URL + '&_ts=' + Date.now(), {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });

      if (res.ok) {
        const text = await res.text();
        const uname = extractUsernameFromMiscvars(text);
        if (uname) {
          cachedUsername = uname;
          setUsername(uname);
          return;
        }
      }
    } catch (e) {
      // ignore and retry
    }

    if (n < MAX_RETRIES) {
      const delay = 150 * Math.pow(1.55, n); // progressive backoff
      setTimeout(() => fetchUsername(n + 1), delay);
    }
  }

  function boot() {
    // Try ASAP
    fetchUsername(0);

    // Also try after full load (covers late FA injections)
    window.addEventListener('load', () => fetchUsername(1), { once: true });

    // Observe DOM: when #USER-NAME is inserted, fill it
    const obs = new MutationObserver(() => {
      if (cachedUsername) {
        if (setUsername(cachedUsername)) obs.disconnect();
      } else {
        // If targets appear before username is cached, re-fetch once
        if (document.querySelector('#USER-NAME') || document.querySelector('.USERNAME')) {
          fetchUsername(2);
        }
      }
    });

    obs.observe(document.documentElement, { childList: true, subtree: true });

    // Safety polling (stops after 12s)
    const start = Date.now();
    const poll = setInterval(() => {
      if (cachedUsername) {
        if (setUsername(cachedUsername)) {
          clearInterval(poll);
          obs.disconnect();
        }
        return;
      }
      if (Date.now() - start > 12000) {
        clearInterval(poll);
        return;
      }
      fetchUsername(3);
    }, 800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();