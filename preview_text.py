"""Short public descriptions and lead paragraphs, never unrelated page chrome."""
import json
import html
import re
import xml.etree.ElementTree as ET
from html.parser import HTMLParser

PREVIEW_LIMIT = 800


def clean_text(value):
    return re.sub(r'\s+', ' ', html.unescape(value or '')).strip()[:PREVIEW_LIMIT]


class PreviewParser(HTMLParser):
    def __init__(self, fragment=False):
        super().__init__(convert_charrefs=True)
        self.fragment = fragment
        self.stack = []
        self.text = []
        self.paragraphs = []
        self.current = None
        self.descriptions = {}
        self.schema = []
        self.schema_text = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        blocked = tag in ('script', 'style', 'nav', 'aside', 'footer', 'header', 'form', 'noscript', 'button', 'ul', 'ol') \
            or bool(re.search(r'(?:related|recommend|cookie|newsletter|subscribe|promo|advert)',
                              attrs.get('class', '') + ' ' + attrs.get('id', ''), re.I))
        inherited = any(entry[1] for entry in self.stack)
        if tag == 'meta':
            key = (attrs.get('property') or attrs.get('name') or '').lower()
            if key in ('og:description', 'twitter:description', 'description'):
                self.descriptions.setdefault(key, clean_text(attrs.get('content', '')))
        if tag == 'script' and attrs.get('type', '').lower() == 'application/ld+json':
            self.schema_text = ''
        if tag not in ('meta', 'img', 'br', 'hr', 'link', 'input', 'source', 'wbr'):
            self.stack.append((tag, blocked or inherited, attrs.get('itemprop') == 'articleBody'))
        if tag == 'p' and not (blocked or inherited) and self.current is None \
                and any(entry[0] == 'article' or entry[2] for entry in self.stack):
            self.current = []

    def handle_endtag(self, tag):
        if tag == 'script' and self.schema_text is not None:
            try:
                self.schema.append(json.loads(self.schema_text))
            except ValueError:
                pass
            self.schema_text = None
        if tag == 'p' and self.current is not None:
            paragraph = clean_text(' '.join(self.current))
            if len(paragraph) >= 40 and len(self.paragraphs) < 3:
                self.paragraphs.append(paragraph)
            self.current = None
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        if self.schema_text is not None:
            self.schema_text += data
        if any(entry[1] for entry in self.stack):
            return
        if self.fragment:
            self.text.append(data)
        if self.current is not None:
            self.current.append(data)

    def result(self):
        if self.fragment:
            return clean_text(' '.join(self.text))
        description = next((self.descriptions[key] for key in ('og:description', 'description', 'twitter:description')
                            if self.descriptions.get(key)), '')
        if not description:
            for root in self.schema:
                nodes = root if isinstance(root, list) else [root]
                for node in list(nodes):
                    if isinstance(node, dict) and isinstance(node.get('@graph'), list):
                        nodes.extend(node['@graph'])
                for node in nodes:
                    if isinstance(node, dict) and 'article' in str(node.get('@type', '')).lower() \
                            and isinstance(node.get('description'), str):
                        description = clean_text(node['description'])
                        break
                if description:
                    break
        parts = [description] if description else []
        parts.extend(paragraph for paragraph in self.paragraphs if paragraph not in description)
        return clean_text(' '.join(parts))


def extract_preview(markup, fragment=False):
    parser = PreviewParser(fragment)
    try:
        parser.feed(markup or '')
    except (ValueError, TypeError):
        return ''
    return parser.result()


def extract_feed_preview(item):
    for node in item:
        if node.tag.rsplit('}', 1)[-1] in ('description', 'summary', 'content', 'encoded'):
            text = extract_preview((node.text or '') + ''.join(
                ET.tostring(child, encoding='unicode')
                for child in node), fragment=True)
            if text:
                return text
    return ''

