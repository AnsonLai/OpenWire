"""Check publisher RSS directly, without fetching article pages or publishing news."""
import argparse
import json
import time
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read_catalog():
    source = (ROOT / 'js/feedCatalog.js').read_text(encoding='utf-8')
    return json.loads(source.split('export const FEED_CATALOG = ', 1)[1].strip().removesuffix(';'))


def check(feed):
    started = time.monotonic()
    result = {key: feed.get(key) for key in ('id', 'name', 'url', 'category')}
    try:
        request = urllib.request.Request(feed['url'], headers={
            'User-Agent': 'Mozilla/5.0 (compatible; OpenWire RSS check)',
            'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        })
        with urllib.request.urlopen(request, timeout=15) as response:
            result.update(httpStatus=response.status, finalUrl=response.url,
                          contentType=response.headers.get('Content-Type', ''))
            payload = response.read(5 * 1024 * 1024 + 1)
        if len(payload) > 5 * 1024 * 1024:
            raise ValueError('Feed exceeds 5 MB limit')
        root = ET.fromstring(payload)
        root_type = root.tag.rsplit('}', 1)[-1].lower()
        if root_type not in ('rss', 'rdf', 'feed'):
            raise ValueError('Response is not RSS or Atom XML')
        items = [node for node in root.iter() if node.tag.rsplit('}', 1)[-1] in ('item', 'entry')]
        usable = []
        dates = []
        titles = []
        for item in items:
            fields = {child.tag.rsplit('}', 1)[-1]: child for child in item}
            title = fields.get('title')
            link = fields.get('link')
            url = ((link.text or '').strip() or link.attrib.get('href', '')) if link is not None else ''
            if title is not None and ''.join(title.itertext()).strip() and url.startswith(('https://', 'http://')):
                usable.append(item)
                titles.append(''.join(title.itertext()).strip())
                for key in ('pubDate', 'published', 'updated', 'date'):
                    if key in fields and fields[key].text:
                        dates.append(fields[key].text)
                        break
        if not usable:
            raise ValueError('Feed has no usable linked headlines')
        timestamps = []
        for date in dates:
            try:
                try:
                    parsed = datetime.fromisoformat(date.replace('Z', '+00:00'))
                except ValueError:
                    parsed = parsedate_to_datetime(date)
                timestamps.append(parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed)
            except (ValueError, TypeError, OverflowError):
                continue
        newest = max(timestamps) if timestamps else None
        age_hours = round((datetime.now(timezone.utc) - newest).total_seconds() / 3600, 1) if newest else None
        result.update(ok=True, itemCount=len(items), usableCount=len(usable),
                      sampleDates=dates[:3], sampleTitles=titles[:3], newestItemAt=newest.isoformat() if newest else None,
                      ageHours=age_hours, fresh=age_hours is not None and -24 <= age_hours <= 168, error='')
    except Exception as error:
        result.update(ok=False, error=str(error))
        if isinstance(error, urllib.error.HTTPError):
            result['httpStatus'] = error.code
    result['durationMs'] = round((time.monotonic() - started) * 1000)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default='research/rss-feed-audit.json')
    parser.add_argument('--workers', type=int, default=6)
    args = parser.parse_args()
    unique = {feed['url']: feed for feed in read_catalog()}
    with ThreadPoolExecutor(max_workers=max(1, min(8, args.workers))) as executor:
        results = list(executor.map(check, unique.values()))
    report = {'checkedAt': datetime.now(timezone.utc).isoformat(), 'method': 'Direct HTTP, parsed RSS/Atom XML and newest item within seven days; no article-page requests',
              'passed': sum(result['ok'] and result.get('fresh', False) for result in results),
              'xmlPassed': sum(result['ok'] for result in results), 'total': len(results), 'results': results}
    destination = ROOT / args.output
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    for result in results:
        passed = result['ok'] and result.get('fresh', False)
        reason = result.get('error', '') or ('' if result.get('fresh') else f"Newest item age: {result.get('ageHours')} hours")
        print(f"{'PASS' if passed else 'FAIL'} {result['name']}: {result.get('usableCount', 0)} headlines {reason}")
    print(f"{report['passed']}/{report['total']} feeds passed. Report: {destination}")


if __name__ == '__main__':
    main()
