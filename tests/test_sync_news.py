import json
import io
import os
from pathlib import Path
import tempfile
import unittest
import xml.etree.ElementTree as ET
from unittest.mock import patch

import sync_news


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.temp_root = Path(__file__).resolve().parents[1] / 'dist'
        self.temp_root.mkdir(exist_ok=True)
        self.workspace = tempfile.TemporaryDirectory(dir=self.temp_root)
        self.original_cwd = os.getcwd()
        os.chdir(self.workspace.name)
        Path('data').mkdir()

    def tearDown(self):
        os.chdir(self.original_cwd)
        self.assertEqual(Path(self.workspace.name).resolve().parent, self.temp_root.resolve())
        self.workspace.cleanup()

    def test_partial_failure_preserves_previous_topic_and_stamps_successful_topic(self):
        previous = [{'title': 'Previous world snapshot'}]
        Path('data/news_world.json').write_text(json.dumps(previous), encoding='utf8')
        def process(topic, _url):
            if topic == 'world':
                raise RuntimeError('Feed temporarily unavailable')
            return [{'title': 'Fresh top story'}]
        with patch.object(sync_news, 'TOPICS', {'top': 'top.xml', 'world': 'world.xml'}), patch.object(sync_news, 'process_topic', process):
            sync_news.sync()
        self.assertEqual(json.loads(Path('data/news_world.json').read_text()), previous)
        top = json.loads(Path('data/news_top.json').read_text())
        self.assertTrue(top[0]['fetchedAt'])
        self.assertEqual(json.loads(Path('news.json').read_text()), top)

    def test_complete_outage_fails_instead_of_publishing_an_empty_site(self):
        previous = [{'title': 'Saved headline'}]
        Path('news.json').write_text(json.dumps(previous), encoding='utf8')
        with patch.object(sync_news, 'TOPICS', {'top': 'top.xml'}), patch.object(sync_news, 'process_topic', return_value=[]):
            with self.assertRaisesRegex(RuntimeError, 'No topics refreshed'):
                sync_news.sync()
        self.assertEqual(json.loads(Path('news.json').read_text()), previous)

    def test_interrupted_write_preserves_last_complete_json_and_removes_temp_file(self):
        target = Path('data/news_top.json')
        target.write_text('[{"title": "Saved"}]', encoding='utf8')
        with patch.object(sync_news.json, 'dump', side_effect=OSError('Write interrupted')):
            with self.assertRaises(OSError):
                sync_news.write_json_atomic(target, [{'title': 'Replacement'}])
        self.assertEqual(json.loads(target.read_text()), [{'title': 'Saved'}])
        self.assertEqual(list(Path('data').iterdir()), [target])

    def test_scheduled_mode_keeps_feed_images_and_skips_article_crawling(self):
        item = ET.fromstring('<item><title>Fresh news</title><link>https://bbc.com/story</link><enclosure type="image/jpeg" url="https://bbc.com/news-photo-1200x800.jpg"/></item>')
        with patch.object(sync_news, 'SKIP_PAGE_IMAGES', True), patch.object(sync_news, 'extract_og_image') as crawl:
            record = sync_news.process_single_google_item(item, 'top', 0)
            self.assertEqual(record['imageUrl'], 'https://bbc.com/news-photo-1200x800.jpg')
            item.remove(item.find('enclosure'))
            sync_news.process_single_google_item(item, 'top', 1)
            crawl.assert_not_called()


class RssParsingTests(unittest.TestCase):
    def test_empty_or_invalid_primary_items_do_not_discard_the_valid_headlines(self):
        xml = b'''<rss><channel><item><title/><link>bad-url</link></item>
        <item><title>Working headline</title><link>https://bbc.com/story</link></item></channel></rss>'''
        with patch.object(sync_news.urllib.request, 'urlopen', return_value=io.BytesIO(xml)), \
             patch.object(sync_news, 'SECONDARY_FEEDS', {}), patch.object(sync_news, 'SKIP_PAGE_IMAGES', True):
            articles = sync_news.process_topic('top', 'https://news.google.com/rss')
        self.assertEqual(len(articles), 1)
        self.assertEqual(articles[0]['title'], 'Working headline')
        self.assertEqual(articles[0]['feedStatus']['sources'][0]['count'], 1)

    def test_atom_uses_article_link_instead_of_self_link_and_keeps_updated_date(self):
        xml = b'''<feed xmlns="http://www.w3.org/2005/Atom"><entry>
          <title>Fresh Atom headline</title>
          <link rel="self" href="https://example.com/entry.atom"/>
          <link rel="alternate" href="https://example.com/article"/>
          <updated>2026-10-09T12:00:00Z</updated>
        </entry></feed>'''
        cfg = {'name': 'Example', 'url': 'https://example.com/atom.xml', 'domain': 'example.com'}
        with patch.object(sync_news.urllib.request, 'urlopen', return_value=io.BytesIO(xml)), patch.object(sync_news, 'SKIP_PAGE_IMAGES', True):
            articles = sync_news.process_direct_feed(cfg, 'technology')
        self.assertEqual(len(articles), 1)
        self.assertEqual(articles[0]['originalUrl'], 'https://example.com/article')
        self.assertEqual(articles[0]['pubDate'], '2026-10-09T12:00:00Z')

    def test_unreadable_rss_reports_failure_for_the_source_status(self):
        cfg = {'name': 'Example', 'url': 'https://example.com/rss.xml', 'domain': 'example.com'}
        with patch.object(sync_news.urllib.request, 'urlopen', return_value=io.BytesIO(b'<broken')):
            with self.assertRaisesRegex(RuntimeError, 'unreadable RSS or Atom'):
                sync_news.process_direct_feed(cfg, 'top')

    def test_partial_publication_reports_sources_and_sorts_atom_and_rss_dates_together(self):
        feeds = [{'name': 'Atom publisher', 'url': 'https://a.example/rss'},
                 {'name': 'RSS publisher', 'url': 'https://b.example/rss'},
                 {'name': 'Failed publisher', 'url': 'https://c.example/rss'}]
        def direct(cfg, _topic):
            if cfg['name'] == 'Failed publisher':
                raise RuntimeError('Publisher temporarily unavailable')
            newer = cfg['name'] == 'Atom publisher'
            return [{'title': 'Explorers discover polar passage' if newer else 'Astronomers photograph distant galaxy',
                     'originalUrl': cfg['url'] + '/story', 'domain': 'a.example' if newer else 'b.example',
                     'pubDate': '2026-10-09T14:00:00Z' if newer else 'Fri, 09 Oct 2026 12:00:00 GMT'}]
        with patch.object(sync_news, 'SECONDARY_FEEDS', {'latest': feeds}), patch.object(sync_news, 'SKIP_PAGE_IMAGES', True), \
             patch.object(sync_news, 'process_direct_feed', side_effect=direct), \
             patch.object(sync_news.urllib.request, 'urlopen', side_effect=OSError('Google News unavailable')):
            articles = sync_news.process_topic('latest', 'https://news.google.com/rss')
        self.assertEqual(articles[0]['domain'], 'a.example')
        sources = articles[0]['feedStatus']['sources']
        self.assertEqual([source['name'] for source in sources if source['status'] == 'unavailable'],
                         ['Google News', 'Failed publisher'])
        self.assertEqual(sources[-1]['error'], 'Publisher temporarily unavailable')
        self.assertTrue(sources[1]['updatedAt'])


if __name__ == '__main__':
    unittest.main()
