import io
import unittest
from datetime import datetime, timezone
from unittest.mock import patch
import xml.etree.ElementTree as ET
from article_metadata import ArticleMetadataCache
from preview_text import extract_preview, extract_feed_preview
import sync_news


class PublicPreviewTests(unittest.TestCase):
    def test_page_description_and_lead_exclude_menus_related_stories_and_full_body(self):
        markup = '''<meta content="A new partnership." property="og:description">
        <header>OpenAI menu</header><article><aside><p>Other AI headlines that are unrelated to this article.</p></aside>
        <p>OpenAI will supply machine-learning software to the company.</p>
        <p>A second paragraph describes the proposed agreement in more detail.</p>
        <p>A third paragraph describes the proposed agreement in more detail.</p>
        <p>FOURTH paragraph should not be retained even if it is accessible.</p></article>
        <footer>ChatGPT</footer><script>robotics</script>'''
        result = extract_preview(markup)
        self.assertIn('A new partnership.', result)
        self.assertIn('OpenAI will supply', result)
        for excluded in ('menu', 'unrelated', 'FOURTH', 'ChatGPT', 'robotics'):
            self.assertNotIn(excluded, result)

    def test_schema_description_and_atom_summary_are_supported(self):
        schema = '<script type="application/ld+json">{"@graph":[{"@type":"NewsArticle","description":"OpenAI &amp; a new laboratory."}]}</script>'
        self.assertEqual(extract_preview(schema), 'OpenAI & a new laboratory.')
        item = ET.fromstring('<entry xmlns="http://www.w3.org/2005/Atom"><summary type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p>Machine learning supports this plan.</p></div></summary></entry>')
        self.assertEqual(extract_feed_preview(item), 'Machine learning supports this plan.')
        self.assertEqual(extract_preview('<nav>AI</nav><p>Officials said rain was coming.</p>', fragment=True), 'Officials said rain was coming.')
        self.assertLessEqual(len(extract_preview('A ' * 1000, fragment=True)), 800)

    def test_photo_and_description_use_one_public_request_and_one_cache_budget_slot(self):
        page = b'<meta property="og:image" content="/story-photo.jpg"><meta name="description" content="OpenAI signed a deal."><p>Subscribe for full access.</p>'
        cache = ArticleMetadataCache('unused-test-preview-cache.json', image_budget=1)
        cache.entries = {}
        with patch.object(sync_news, 'metadata_cache', cache), patch.object(sync_news.urllib.request, 'urlopen', return_value=io.BytesIO(page)) as request:
            self.assertEqual(sync_news.extract_page_image('https://example.com/story'), 'https://example.com/story-photo.jpg')
            metadata = sync_news.extract_page_metadata('https://example.com/story')
            self.assertEqual(metadata['summary'], 'OpenAI signed a deal.')
            self.assertEqual(request.call_count, 1)
            self.assertEqual(cache.used['image'], 1)
            self.assertEqual(sync_news.extract_page_metadata('https://example.com/budget-exhausted'), {})
            self.assertEqual(sync_news.extract_page_metadata('https://news.google.com/rss/articles/x'), {})
            self.assertEqual(request.call_count, 1)

    def test_scheduled_ai_feed_does_not_import_other_topics_preview_matches(self):
        date = datetime.now(timezone.utc).isoformat()
        lead = {'title': 'Featured AI story', 'originalUrl': 'https://one.example/lead', 'pubDate': date}
        outside = {'title': 'Partners unveil their agreement', 'summary': 'OpenAI will provide the software.',
                   'originalUrl': 'https://two.example/partnership', 'pubDate': date}
        writes = {}
        def process(topic, _url):
            return [dict(lead if topic == 'ai' else outside)]
        def write(path, records):
            writes[str(path).replace('\\', '/')] = records
        with patch.object(sync_news, 'TOPICS', {'ai': 'ai-feed', 'top': 'top-feed'}), \
             patch.object(sync_news, 'process_topic', side_effect=process), \
             patch.object(sync_news, 'write_json_atomic', side_effect=write):
            sync_news.sync()
        self.assertEqual([article['title'] for article in writes['data/news_ai.json']], [lead['title']])
        self.assertEqual(len(writes['data/preview_articles.json']), 2)


if __name__ == '__main__':
    unittest.main()
