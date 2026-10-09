import json
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


if __name__ == '__main__':
    unittest.main()
