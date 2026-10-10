import json
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor
import threading
import time
from article_metadata import ArticleMetadataCache
import sync_news
import xml.etree.ElementTree as ET


class ImageMetadataTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(__file__).resolve().parents[1] / 'dist'
        self.root.mkdir(exist_ok=True)
        self.workspace = tempfile.TemporaryDirectory(dir=self.root)
        self.path = str(Path(self.workspace.name) / 'metadata.json')
        self.cache = ArticleMetadataCache(self.path)

    def tearDown(self):
        self.workspace.cleanup()

    def test_full_article_urls_and_persistent_successes_remain_distinct(self):
        first = 'https://example.com/news/first'
        second = 'https://example.com/news/second'
        self.assertEqual(self.cache.get('image', first, lambda: 'first.jpg'), 'first.jpg')
        self.assertEqual(self.cache.get('image', second, lambda: 'second.jpg'), 'second.jpg')
        Path(self.path).write_text(json.dumps(self.cache.snapshot()), encoding='utf8')
        restored = ArticleMetadataCache(self.path)
        self.assertEqual(restored.get('image', first, lambda: self.fail('Unexpected network lookup')), 'first.jpg')

    def test_failures_expire_and_request_budgets_do_not_poison_later_runs(self):
        cache = ArticleMetadataCache(self.path, image_budget=2)
        with patch('article_metadata.time.time', return_value=1000):
            self.assertEqual(cache.get('image', 'https://example.com/a', lambda: ''), '')
        with patch('article_metadata.time.time', return_value=1100):
            self.assertEqual(cache.get('image', 'https://example.com/a', lambda: self.fail('Cooldown ignored')), '')
        with patch('article_metadata.time.time', return_value=2000):
            self.assertEqual(cache.get('image', 'https://example.com/a', lambda: 'photo.jpg'), 'photo.jpg')
            self.assertEqual(cache.get('image', 'https://example.com/b', lambda: self.fail('Budget ignored')), '')
        self.assertNotIn('image:https://example.com/b', cache.snapshot())

    def test_overlapping_topics_share_one_preview_lookup(self):
        entered = threading.Event()
        finish = threading.Event()
        calls = []
        def lookup():
            calls.append(True)
            entered.set()
            finish.wait(2)
            return 'photo.jpg'
        with ThreadPoolExecutor(max_workers=2) as pool:
            a = pool.submit(self.cache.get, 'image', 'https://example.com/shared', lookup)
            self.assertTrue(entered.wait(2))
            b = pool.submit(self.cache.get, 'image', 'https://example.com/shared', lookup)
            finish.set()
            self.assertEqual(a.result(), 'photo.jpg')
            self.assertEqual(b.result(), 'photo.jpg')
        self.assertEqual(len(calls), 1)

    def test_google_resolution_uses_public_article_and_keeps_publisher_when_it_fails(self):
        item = ET.fromstring('<item><title>Publisher headline - CBC News</title><link>https://news.google.com/rss/articles/test</link><source url="https://www.cbc.ca">CBC News</source></item>')
        with patch.object(sync_news, 'metadata_cache', self.cache), patch.object(sync_news, 'HAS_DECODER', True), \
             patch.object(sync_news, 'SKIP_PAGE_IMAGES', False), \
             patch.object(sync_news, 'gnewsdecoder', create=True, return_value={'success': True, 'decoded_url': 'https://www.cbc.ca/story'}) as decoder, \
             patch.object(sync_news, 'extract_og_image', return_value='https://i.cbc.ca/story-photo.jpg') as preview:
            article = sync_news.process_single_google_item(item, 'canada', 0)
            self.assertEqual(article['originalUrl'], 'https://www.cbc.ca/story')
            self.assertEqual(article['imageUrl'], 'https://i.cbc.ca/story-photo.jpg')
            preview.assert_called_once_with('https://www.cbc.ca/story')
            self.assertEqual(decoder.call_args.kwargs['timeout'], 4)
        with patch.object(sync_news, 'HAS_DECODER', False), patch.object(sync_news, 'SKIP_PAGE_IMAGES', True):
            article = sync_news.process_single_google_item(item, 'canada', 1)
        self.assertEqual(article['source'], 'CBC News')
        self.assertEqual(article['domain'], 'cbc.ca')

    def test_rss_description_photos_work_even_without_article_page_fetches(self):
        item = ET.fromstring('''<item><description><![CDATA[<img src="/site-logo.png"><img src="/story.jpg?w=900&amp;q=80" width="900" height="600">]]></description></item>''')
        self.assertEqual(sync_news.extract_image_from_xml_item(item, 'https://example.com/news'), 'https://example.com/story.jpg?w=900&q=80')

    def test_public_preview_images_do_not_require_article_body_access(self):
        previews = [
            ('<script type="application/ld+json">{"@graph":[{"@type":"NewsArticle","image":{"url":"/preview.jpg"}}]}</script><p>Subscribe to read</p>', 'https://example.com/preview.jpg'),
            ('<figure><img src="/site-logo.png" srcset="/small.jpg 300w, /large.jpg 1200w"></figure>', 'https://example.com/large.jpg'),
        ]
        for markup, expected in previews:
            with self.subTest(expected=expected), patch.object(sync_news.urllib.request, 'urlopen', return_value=io.BytesIO(markup.encode())) as request:
                self.assertEqual(sync_news._fetch_page_image('https://example.com/story'), expected)
                self.assertEqual(request.call_args.args[0].full_url, 'https://example.com/story')
                request.assert_called_once()

    def test_published_mapping_keeps_article_ids_and_excludes_failures_or_expired_urls(self):
        self.cache.entries = {
            'url:https://news.google.com/rss/articles/recent?hl=en-CA': {'value': 'https://www.wsj.com/news/story', 'at': time.time() - 1},
            'url:https://news.google.com/read/expired': {'value': 'https://example.com/old', 'at': time.time() - 8 * 86400},
            'url:https://news.google.com/articles/failed': {'value': '', 'at': time.time()},
            'url:https://news.google.com/articles/challenge': {'value': 'https://www.google.com/sorry/', 'at': time.time()},
            'image:https://example.com/story': {'value': 'https://example.com/photo.jpg', 'at': time.time()},
        }
        with patch.object(sync_news, 'metadata_cache', self.cache):
            self.assertEqual(sync_news.published_publisher_urls(), {'recent': 'https://www.wsj.com/news/story'})

    def test_failed_google_resolution_never_builds_an_archive_link_to_the_wrapper(self):
        wrapper = 'https://news.google.com/rss/articles/failed-wsj'
        article = sync_news.build_article_record('business', 0, 'A headline', 'Wall Street Journal', wrapper, '', '', 'https://www.wsj.com')
        self.assertEqual(article['targetUrl'], wrapper)
        self.assertEqual(article['archiveUrl'], '')
        self.assertEqual(article['badge'], 'Open source')
        self.assertFalse(article['needsArchiveCheck'])
