// ==UserScript==
// @name         keenetic-geosite-sync
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Autocomplete DNS routes for domain-list-community names
// @homepage     https://github.com/yangirov/keenetic-geosite-sync
// @match        http://192.168.1.1/staticRoutes/dns
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      api.github.com
// ==/UserScript==

(function () {
  'use strict';

  /* ================== CONFIG ================== */

  const FORCE_REFRESH = false;

  const INPUT_SELECTOR =
    '.ndw-input__field:has(label.ndw-input__label[for]) > input';

  const CACHE_KEY = 'v2fly-domain-list-names';
  const CACHE_TS_KEY = 'v2fly-domain-list-ts';
  const CACHE_TTL = 24 * 60 * 60 * 1000;
  const MAX_ITEMS = 20;

  /* ================== CACHE RESET ================== */

  if (FORCE_REFRESH) {
    GM_deleteValue(CACHE_KEY);
    GM_deleteValue(CACHE_TS_KEY);
    console.log('[TM] cache force-cleared');
  }

  /* ================== UTILS ================== */

  function log(...a) {
    console.log('[TM]', ...a);
  }

  function gmFetchJson(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        responseType: 'json',
        onload: r => resolve(r.response),
        onerror: reject,
      });
    });
  }

  /* ================== DATA ================== */

  async function loadNames() {
    const cached = GM_getValue(CACHE_KEY, null);
    const ts = GM_getValue(CACHE_TS_KEY, 0);

    if (cached && Date.now() - ts < CACHE_TTL) {
      log('using cached names', cached.length);
      return cached;
    }

    log('loading names from github');

    const json = await gmFetchJson(
      'https://api.github.com/repos/v2fly/domain-list-community/contents/data'
    );

    const names = json.map(f => f.name).sort();

    GM_setValue(CACHE_KEY, names);
    GM_setValue(CACHE_TS_KEY, Date.now());

    log('cached', names.length, 'names');
    return names;
  }

  /* ================== AUTOCOMPLETE KILLER ================== */

  function disableNativeAutocomplete(input) {
    const originalName = input.getAttribute('name');
    const fakeName = `__tm_${Math.random().toString(36).slice(2)}`;

    input.addEventListener('focus', () => {
      input.setAttribute('name', fakeName);
    });

    input.addEventListener('blur', () => {
      if (originalName) {
        input.setAttribute('name', originalName);
      } else {
        input.removeAttribute('name');
      }
    });

    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');
  }

  /* ================== DOM ================== */

  function waitForInput() {
    return new Promise(resolve => {
      const i = setInterval(() => {
        const el = document.querySelector(INPUT_SELECTOR);
        if (el) {
          clearInterval(i);
          log('input found');
          resolve(el);
        }
      }, 300);
    });
  }

  function createDropdown() {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      zIndex: 99999,
      background: '#fff',
      border: '1px solid #ccc',
      borderRadius: '4px',
      maxHeight: '200px',
      overflowY: 'auto',
      fontSize: '14px',
      display: 'none',
      boxShadow: '0 4px 12px rgba(0,0,0,.15)',
    });
    document.body.appendChild(el);

    function position(input) {
      const r = input.getBoundingClientRect();
      el.style.left = r.left + 'px';
      el.style.top = r.bottom + 'px';
      el.style.width = r.width + 'px';
    }

    return { el, position };
  }

  /* ================== MAIN ================== */

  (async () => {
    log('script loaded');

    const names = await loadNames();
    const dropdown = createDropdown();

    let currentInput = null;

    function attachToInput(input) {
      if (currentInput === input) return;
      currentInput = input;

      log('attach to input');
      disableNativeAutocomplete(input);

      function onInput() {
        const v = input.value.trim().toLowerCase();
        dropdown.el.innerHTML = '';

        if (!v) {
          dropdown.el.style.display = 'none';
          return;
        }

        const matches = names
          .filter(n => n.includes(v))
          .slice(0, MAX_ITEMS);

        if (!matches.length) {
          dropdown.el.style.display = 'none';
          return;
        }

        dropdown.position(input);
        dropdown.el.style.display = 'block';

        matches.forEach(name => {
          const item = document.createElement('div');
          item.textContent = name;
          Object.assign(item.style, {
            padding: '6px 8px',
            cursor: 'pointer',
          });

          item.onmouseenter = () => item.style.background = '#f0f0f0';
          item.onmouseleave = () => item.style.background = '';

          item.onclick = () => {
            input.value = name;

            // Angular-friendly
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('blur', { bubbles: true }));
            input.dispatchEvent(new Event('focus', { bubbles: true }));

            dropdown.el.style.display = 'none';
          };

          dropdown.el.appendChild(item);
        });
      }

      ['input', 'keyup', 'keydown'].forEach(evt =>
        input.addEventListener(evt, onInput, true)
      );
    }

    attachToInput(await waitForInput());

    const mo = new MutationObserver(() => {
      const el = document.querySelector(INPUT_SELECTOR);
      if (el) attachToInput(el);
    });

    mo.observe(document.body, {
      childList: true,
      subtree: true,
    });

    document.addEventListener('click', e => {
      if (currentInput && e.target !== currentInput && !dropdown.el.contains(e.target)) {
        dropdown.el.style.display = 'none';
      }
    });

    log('autocomplete ready');
  })();
})();
