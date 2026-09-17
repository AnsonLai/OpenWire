/**
 * fetchProxy.js
 * 
 * Lightweight HTTP fetch utility designed for static websites on Azure Storage.
 * Handles CORS by routing requests through high-speed public CORS proxies
 * with automated failover and strict timeouts to keep the UI snappy.
 * 
 * SOLID: Single Responsibility Principle - network proxying and error resilience only.
 */

// Waterfall of CORS proxies for static hosting
const PROXY_PROVIDERS = [
  {
    name: 'corsproxy_io',
    buildUrl: (target) => `https://corsproxy.io/?url=${encodeURIComponent(target)}`,
    unwrap: (raw) => raw,
  },
  {
    name: 'allorigins_get',
    buildUrl: (target) => `https://api.allorigins.win/get?url=${encodeURIComponent(target)}`,
    unwrap: (raw) => {
      if (typeof raw === 'object' && raw?.contents) return raw.contents;
      if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          return parsed.contents || raw;
        } catch {
          return raw;
        }
      }
      return raw;
    },
  },
  {
    name: 'codetabs',
    buildUrl: (target) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
    unwrap: (raw) => raw,
  },
];

/**
 * Fetches content via proxy waterfall with timeout.
 * 
 * @param {string} targetUrl - The target URL to fetch.
 * @param {object} options
 * @param {number} [options.timeoutMs=5000] - Request timeout in milliseconds.
 * @param {string} [options.responseType='text'] - 'text' | 'json'
 * @returns {Promise<{ ok: boolean, data: any, status: number, error?: string }>}
 */
export async function fetchWithProxy(targetUrl, options = {}) {
  const timeoutMs = options.timeoutMs || 5000;
  const responseType = options.responseType || 'text';

  let lastError = null;

  for (const proxy of PROXY_PROVIDERS) {
    const proxyUrl = proxy.buildUrl(targetUrl);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(proxyUrl, {
        signal: controller.signal,
        headers: {
          'Accept': responseType === 'json' ? 'application/json' : 'text/xml, text/html, text/plain, */*'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        lastError = new Error(`Proxy ${proxy.name} returned HTTP ${response.status}`);
        continue; // Try next proxy in waterfall
      }

      const raw = responseType === 'json' ? await response.json() : await response.text();
      const data = proxy.unwrap ? proxy.unwrap(raw) : raw;
      return { ok: true, data, status: response.status, proxy: proxy.name };
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;
      // Continue to next proxy in waterfall
    }
  }

  // Graceful quiet debug message if proxies are unavailable or blocked by target
  console.debug({ targetUrl, error: lastError?.message }, 'CORS proxies unreachable or timed out for target');
  return {
    ok: false,
    data: null,
    status: 0,
    error: lastError ? lastError.message : 'Network error'
  };
}
