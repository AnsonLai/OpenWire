/**
 * settingsExport.js
 * 
 * Generates and downloads a complete snapshot of user settings:
 * - All topics (including comma-separated keywords, assigned sources, visibility, and custom ordering)
 * - Local edition location preferences (city, region)
 * - All RSS feeds and sources catalog (built-in and custom feeds with fair-share quotas)
 * - Paywall rules (domain strategy bypass mappings and custom overrides)
 * 
 * SOLID: Single Responsibility Principle - export generation and download orchestration only.
 */

import { getAllTopics, loadTopicOrder, getLocalEdition } from './topicRegistry.js';
import { getAllSources, getCustomFeeds } from './feedRegistry.js';
import { getAllDomainRules } from './domainRegistry.js';

/**
 * Builds a structured, complete settings snapshot object.
 * 
 * @returns {object} Settings snapshot object
 */
export function generateSettingsBackupObject() {
  const topics = getAllTopics();
  const topicOrder = loadTopicOrder() || topics.map((t) => t.id);
  const localEdition = getLocalEdition();
  const sources = getAllSources();
  const customFeeds = getCustomFeeds();
  const domainRules = getAllDomainRules();

  return {
    version: 1,
    appName: 'OpenWire News Aggregator',
    exportedAt: new Date().toISOString(),
    topics: {
      items: topics,
      order: topicOrder,
      localEdition: localEdition,
    },
    rssFeeds: {
      sources: sources,
      customFeeds: customFeeds,
    },
    paywallRules: domainRules,
  };
}

/**
 * Initiates browser download of the settings backup as a formatted JSON file.
 * 
 * @param {object} [customData] Optional pre-generated backup object
 * @returns {string} The filename generated for the export
 */
export function exportSettingsAsJson(customData = null) {
  const data = customData || generateSettingsBackupObject();
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `openwire_settings_${dateStr}.json`;

  if (typeof document !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const downloadUrl = URL.createObjectURL(blob);

    const downloadLink = document.createElement('a');
    downloadLink.href = downloadUrl;
    downloadLink.download = filename;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

    setTimeout(() => {
      URL.revokeObjectURL(downloadUrl);
    }, 1000);
  }

  return filename;
}
