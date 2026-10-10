/**
 * archiveService.js
 * 
 * Performs fast, non-blocking archive checks for paywalled articles.
 * Uses in-memory caching and strict timeouts to ensure checking an archive
 * never blocks or freezes the user interface.
 * 
 * SOLID: Single Responsibility Principle - archive availability detection only.
 */

import { fetchWithProxy } from './fetchProxy.js';
import { resolvePublisherUrl } from './publisherUrlService.js';

// In-memory cache for the session to prevent repeated requests
const archiveCache = new Map();

/**
 * Checks if a given article URL has been archived on archive.is.
 * 
 * @param {string} targetUrl - The canonical article URL to check.
 * @param {number} [timeoutMs=2800] - Fast timeout for the quick check.
 * @returns {Promise<{ available: boolean, archiveUrl?: string, error?: string }>}
 */
export async function checkArchiveIs(targetUrl, timeoutMs = 2800) {
  if (!targetUrl) return { available: false };
  targetUrl = await resolvePublisherUrl(targetUrl);
  if (!targetUrl) return { available: false, error: 'Publisher link is not available yet' };

  // Return cached result if available
  if (archiveCache.has(targetUrl)) {
    return archiveCache.get(targetUrl);
  }

  // archive.is timemap endpoint returns HTTP 200 with memento list if archived,
  // or HTTP 404 if no snapshot has been captured yet.
  const timemapEndpoint = `https://archive.is/timemap/${targetUrl}`;

  try {
    const result = await fetchWithProxy(timemapEndpoint, {
      timeoutMs,
      responseType: 'text'
    });

    if (result.ok && result.data && result.data.includes('rel="memento"')) {
      const entry = {
        available: true,
        archiveUrl: `https://archive.is/newest/${targetUrl}`,
      };
      archiveCache.set(targetUrl, entry);
      return entry;
    }

    // HTTP 404 or empty response means no archive version currently exists
    const entry = { available: false };
    archiveCache.set(targetUrl, entry);
    return entry;
  } catch (error) {
    console.warn({ targetUrl, error: error?.message }, 'Archive check failed or timed out');
    const fallback = { available: false, error: 'Timed out or unavailable' };
    archiveCache.set(targetUrl, fallback);
    return fallback;
  }
}

/**
 * Checks Internet Archive (Wayback Machine) availability.
 * 
 * @param {string} targetUrl
 * @param {number} [timeoutMs=2800]
 * @returns {Promise<{ available: boolean, archiveUrl?: string }>}
 */
export async function checkWayback(targetUrl, timeoutMs = 2800) {
  if (!targetUrl) return { available: false };
  targetUrl = await resolvePublisherUrl(targetUrl);
  if (!targetUrl) return { available: false, error: 'Publisher link is not available yet' };

  const cacheKey = `wayback:${targetUrl}`;
  if (archiveCache.has(cacheKey)) {
    return archiveCache.get(cacheKey);
  }

  const waybackEndpoint = `https://archive.org/wayback/available?url=${encodeURIComponent(targetUrl)}`;

  try {
    const result = await fetchWithProxy(waybackEndpoint, {
      timeoutMs,
      responseType: 'json'
    });

    if (result.ok && result.data?.archived_snapshots?.closest?.available) {
      const entry = {
        available: true,
        archiveUrl: result.data.archived_snapshots.closest.url.replace(/^http:/, 'https:')
      };
      archiveCache.set(cacheKey, entry);
      return entry;
    }

    const entry = { available: false };
    archiveCache.set(cacheKey, entry);
    return entry;
  } catch (error) {
    console.warn({ targetUrl, error: error?.message }, 'Wayback check failed');
    return { available: false };
  }
}
