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
    name: 'allorigins_get',
    buildUrl: (target) => `https://api.allorigins.win/get?url=${encodeURIComponent(target)}`,
    unwrap: (raw) => {
      if (typeof raw === 'object' && typeof raw?.contents === 'string') return raw.contents;
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
  const deadline = Date.now() + (options.totalTimeoutMs || timeoutMs * (PROXY_PROVIDERS.length + 1));

  let lastError = null;

  const providers = options.directFirst === false ? PROXY_PROVIDERS : [
    { name: 'direct', buildUrl: (target) => target, unwrap: (raw) => raw },
    ...PROXY_PROVIDERS,
  ];
  for (const proxy of providers) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const proxyUrl = proxy.buildUrl(targetUrl);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Math.min(timeoutMs, remaining));

    try {
      const response = await fetch(proxyUrl, {
        signal: controller.signal,
        headers: {
          'Accept': responseType === 'json' ? 'application/json' : 'text/xml, text/html, text/plain, */*'
        }
      });

      if (!response.ok) {
        lastError = new Error(`Proxy ${proxy.name} returned HTTP ${response.status}`);
        continue; // Try next proxy in waterfall
      }

      const raw = await response.text();
      const unwrapped = proxy.unwrap ? proxy.unwrap(raw) : raw;
      const data = responseType === 'json' && typeof unwrapped === 'string' ? JSON.parse(unwrapped) : unwrapped;
      return { ok: true, data, status: response.status, proxy: proxy.name };
    } catch (err) {
      lastError = err;
      // Continue to next proxy in waterfall
    } finally {
      clearTimeout(timeoutId);
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
