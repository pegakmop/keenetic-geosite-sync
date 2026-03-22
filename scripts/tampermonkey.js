// ==UserScript==
// @name         keenetic-geosite-sync
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description  Autocomplete + API buttons for Keenetic DNS routes (v2fly/domain-list-community)
// @homepage     https://github.com/yangirov/keenetic-geosite-sync
// @match        http://192.168.1.1/*
// @grant        GM.xmlHttpRequest
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @connect      api.github.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const DNS_ROUTE = '/staticRoutes/dns';
  const INPUT_SELECTOR =
    'input.ndw-input__value[formcontrolname="value"][maxlength="64"]';
  const BUTTONS_SELECTOR = '.domain-name-list__buttons-row';
  const API_BASE = 'http://192.168.1.1:3939';
  const API_ACTIONS = [
    ['Health', '/health'],
    ['Sync', '/sync'],
    ['Clean', '/clean'],
  ];
  const TREE_URL =
    'https://api.github.com/repos/v2fly/domain-list-community/git/trees/master?recursive=1';
  const CACHE_KEY = 'v2fly-domain-list-names';
  const CACHE_TS_KEY = 'v2fly-domain-list-ts';
  const CACHE_TTL = 24 * 60 * 60 * 1000;
  const MAX_ITEMS = 20;
  const STARTUP_SYNC_DELAYS_MS = [250, 1000, 2500];

  const state = {
    names: null,
    namesPromise: null,
    input: null,
    dropdown: null,
    observer: null,
  };

  const log = (...args) => console.log('[TM]', ...args);

  const isDnsRoute = () =>
    location.pathname.startsWith(DNS_ROUTE) ||
    (location.pathname.startsWith('/staticRoutes') &&
      (document.querySelector(BUTTONS_SELECTOR) ||
        document.querySelector(INPUT_SELECTOR)));

  const findInput = () => {
    if (!isDnsRoute()) return null;
    const inputs = Array.from(document.querySelectorAll(INPUT_SELECTOR));
    return inputs.find(input => input.offsetParent !== null) || inputs[0] || null;
  };

  const ensureDropdown = () => {
    if (state.dropdown?.parentNode) return state.dropdown;
    if (!document.body) return null;

    state.dropdown = document.createElement('div');
    Object.assign(state.dropdown.style, {
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
    document.body.appendChild(state.dropdown);
    return state.dropdown;
  };

  const hideDropdown = () => {
    if (state.dropdown) state.dropdown.style.display = 'none';
  };

  async function loadNames() {
    if (state.names) return state.names;
    if (state.namesPromise) return state.namesPromise;

    state.namesPromise = (async () => {
      const cached = await GM.getValue(CACHE_KEY, null);
      const cachedAt = await GM.getValue(CACHE_TS_KEY, 0);
      if (cached && Date.now() - cachedAt < CACHE_TTL) {
        state.names = cached;
        return cached;
      }

      log('loading domain list');
      const json = await new Promise((resolve, reject) => {
        GM.xmlHttpRequest({
          method: 'GET',
          url: TREE_URL,
          responseType: 'json',
          headers: { Accept: 'application/vnd.github+json' },
          onload: response =>
            response.status >= 200 && response.status < 300
              ? resolve(response.response)
              : reject(new Error(`HTTP ${response.status}`)),
          onerror: reject,
        });
      });

      state.names = (json.tree || [])
        .filter(
          entry =>
            entry.type === 'blob' &&
            entry.path.startsWith('data/') &&
            !entry.path.slice(5).includes('/')
        )
        .map(entry => entry.path.slice(5))
        .sort();

      await GM.setValue(CACHE_KEY, state.names);
      await GM.setValue(CACHE_TS_KEY, Date.now());
      return state.names;
    })().catch(error => {
      state.namesPromise = null;
      throw error;
    });

    return state.namesPromise;
  }

  function renderSuggestions(input) {
    const dropdown = ensureDropdown();
    if (!dropdown) return;

    const query = input.value.trim().toLowerCase();
    dropdown.innerHTML = '';
    if (!query || !state.names) return hideDropdown();

    let count = 0;
    for (const name of state.names) {
      if (!name.includes(query)) continue;

      const item = document.createElement('div');
      item.textContent = name;
      item.style.padding = '6px 8px';
      item.style.cursor = 'pointer';
      item.onmouseenter = () => (item.style.background = '#f0f0f0');
      item.onmouseleave = () => (item.style.background = '');
      item.onclick = () => {
        input.value = name;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        hideDropdown();
      };
      dropdown.appendChild(item);
      if (++count >= MAX_ITEMS) break;
    }

    if (!count) return hideDropdown();

    const rect = input.getBoundingClientRect();
    dropdown.style.left = rect.left + 'px';
    dropdown.style.top = rect.bottom + 'px';
    dropdown.style.width = rect.width + 'px';
    dropdown.style.display = 'block';
  }

  function attachAutocomplete(input) {
    if (input.__tmAttached) return;

    input.__tmAttached = true;
    input.__tmAutocompleteDisabled = true;
    input.setAttribute('autocomplete', 'new-password');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('name', `__tm_${Math.random().toString(36).slice(2)}`);

    const onInput = () => renderSuggestions(input);
    input.addEventListener('input', onInput, true);
    input.addEventListener('keyup', onInput, true);

    loadNames().catch(error => log('failed to load domain list', error));
  }

  function syncButtons() {
    if (!isDnsRoute()) return;

    const container = document.querySelector(BUTTONS_SELECTOR);
    if (!container) return;

    const injected = Array.from(container.children).filter(
      child => child.__tmApiButton || child.__tmApiSpacer
    );
    if (injected.filter(child => child.__tmApiButton).length >= API_ACTIONS.length) {
      return;
    }

    injected.forEach(child => child.remove());

    const template = Array.from(
      container.querySelectorAll('.ndw-button-wrapper')
    )[0];
    if (!template) return;

    const spacer = document.createElement('div');
    spacer.__tmApiSpacer = true;
    spacer.style.width = '12px';
    container.appendChild(spacer);

    for (const [label, path] of API_ACTIONS) {
      const wrapper = template.cloneNode(true);
      const button = wrapper.querySelector('button');
      const span = button.querySelector('span');

      wrapper.__tmApiButton = true;
      button.querySelectorAll('ndw-svg-icon').forEach(icon => icon.remove());
      if (span) span.textContent = label;
      else button.textContent = label;
      button.disabled = false;
      button.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        window.open(`${API_BASE}${path}`, '_blank', 'noopener');
      };

      container.appendChild(wrapper);
    }

    log('API buttons injected');
  }

  function syncUi() {
    if (!isDnsRoute()) {
      state.input = null;
      hideDropdown();
      return;
    }

    syncButtons();

    const input = findInput();
    if (!input) {
      state.input = null;
      hideDropdown();
      return;
    }

    if (state.input !== input) {
      state.input = input;
      attachAutocomplete(input);
    }
  }

  function boot() {
    if (!state.observer && document.body) {
      state.observer = new MutationObserver(syncUi);
      state.observer.observe(document.body, { childList: true, subtree: true });
    }
    syncUi();
  }

  document.addEventListener('focusin', syncUi, true);
  document.addEventListener(
    'click',
    event => {
      if (
        event.target !== state.input &&
        !(state.dropdown && state.dropdown.contains(event.target))
      ) {
        hideDropdown();
      }
    },
    true
  );
  window.addEventListener('load', boot);

  boot();
  STARTUP_SYNC_DELAYS_MS.forEach(delay => setTimeout(boot, delay));
  log('userscript ready');
})();
