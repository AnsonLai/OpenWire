"""Bounded, persistent preview metadata lookups for the scheduled news fetcher."""
import json
import threading
import time


class ArticleMetadataCache:
    def __init__(self, path='data/article_metadata.json', image_budget=400, url_budget=320):
        self.path = path
        self.budgets = {'image': image_budget, 'url': url_budget}
        self.used = {'image': 0, 'url': 0}
        self.entries = None
        self.pending = {}
        self.lock = threading.Lock()

    def _load(self):
        try:
            with open(self.path, encoding='utf8') as source:
                data = json.load(source)
            self.entries = data if isinstance(data, dict) else {}
        except (OSError, ValueError):
            self.entries = {}

    def get(self, kind, url, lookup):
        key = kind + ':' + url
        with self.lock:
            if self.entries is None:
                self._load()
            entry = self.entries.get(key)
            if isinstance(entry, dict) and isinstance(entry.get('at'), (int, float)):
                value = entry.get('value')
                ttl = 7 * 86400 if value else 15 * 60
                if isinstance(value, str) and 0 <= time.time() - entry['at'] < ttl:
                    return value
            waiting = self.pending.get(key)
            if not waiting:
                if self.used[kind] >= self.budgets[kind]:
                    return ''
                self.used[kind] += 1
                self.pending[key] = threading.Event()
        if waiting:
            waiting.wait()
            with self.lock:
                return self.entries.get(key, {}).get('value', '')
        value = ''
        try:
            candidate = lookup()
            if isinstance(candidate, str):
                value = candidate
        except Exception:
            # A failed preview lookup must never fail a headlines refresh.
            pass
        finally:
            with self.lock:
                self.entries[key] = {'value': value, 'at': time.time()}
                self.pending.pop(key).set()
        return value

    def snapshot(self):
        with self.lock:
            entries = self.entries or {}
            usable = [(key, entry) for key, entry in entries.items()
                      if isinstance(entry, dict) and isinstance(entry.get('at'), (int, float))
                      and isinstance(entry.get('value'), str)]
            return dict(sorted(usable, key=lambda pair: pair[1]['at'], reverse=True)[:1000])
