# Expanded RSS source library

Checked 2026-10-10T05:22:01.565105+00:00: **69/69 direct feed URLs passed** HTTP, XML, usable-headline, and newest-item-within-seven-days checks. The audit fetches RSS only, not article pages. Browser converter availability is checked separately using **Check enabled feeds**.

## Added feeds

| Category | Feed | RSS URL |
| --- | --- | --- |
| News | NPR News | [RSS](https://feeds.npr.org/1001/rss.xml) |
| News | PBS News | [RSS](https://www.pbs.org/newshour/feeds/rss/headlines) |
| Politics | NPR Politics | [RSS](https://feeds.npr.org/1014/rss.xml) |
| Politics | PBS Politics | [RSS](https://www.pbs.org/newshour/feeds/rss/politics) |
| Politics | The Guardian Politics | [RSS](https://www.theguardian.com/politics/rss) |
| Politics | New York Times Politics | [RSS](https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml) |
| Business | Fortune | [RSS](https://fortune.com/feed/) |
| Finance | Financial Times | [RSS](https://www.ft.com/news-feed?format=rss) |
| Finance | Wall Street Journal Markets | [RSS](https://feeds.content.dowjones.io/public/rss/RSSMarketsMain) |
| Finance | MarketWatch | [RSS](https://feeds.marketwatch.com/marketwatch/topstories) |
| Finance | Bloomberg Markets | [RSS](https://feeds.bloomberg.com/markets/news.rss) |
| Technology | WIRED | [RSS](https://www.wired.com/feed/rss) |
| Science | WIRED Science | [RSS](https://www.wired.com/feed/category/science/latest/rss) |
| Technology | TechCrunch | [RSS](https://techcrunch.com/feed/) |
| Technology | IEEE Spectrum | [RSS](https://spectrum.ieee.org/feeds/feed.rss) |
| Science | Science News | [RSS](https://www.sciencenews.org/feed) |
| Science | Scientific American | [RSS](https://www.scientificamerican.com/platform/syndication/rss/) |
| Science | Phys.org | [RSS](https://phys.org/rss-feed/) |
| Science | Nature (News & Research) | [RSS](https://www.nature.com/nature.rss) |
| Lifestyle | The Guardian Life & Style | [RSS](https://www.theguardian.com/lifeandstyle/rss) |
| Lifestyle | Architectural Digest | [RSS](https://www.architecturaldigest.com/feed/rss) |
| Lifestyle | Vogue | [RSS](https://www.vogue.com/feed/rss) |
| Entertainment | Variety | [RSS](https://variety.com/feed/) |
| Entertainment | The Hollywood Reporter | [RSS](https://www.hollywoodreporter.com/feed/) |
| Entertainment | Deadline | [RSS](https://deadline.com/feed/rss) |
| Entertainment | NPR Culture | [RSS](https://feeds.npr.org/1008/rss.xml) |
| Entertainment | The Guardian Culture | [RSS](https://www.theguardian.com/culture/rss) |
| News | CNA World | [RSS](https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6311) |

The Verge now uses its article RSS rather than its YouTube feed. Bloomberg Markets replaces Bloomberg Quicktake video entries. Ars Technica Science uses its science-specific endpoint. CNN World was excluded because its newest story was from September 2023. Existing regional defaults include The Japan Times, SCMP Asia, CNA, DW, France 24, and Le Monde.

Nature includes both news and research. Public RSS does not imply free full-article access: Fortune, FT, WSJ, Bloomberg and other publishers may require a subscription. No podcast, personal-blog, or video-only feed was added.

## Selection behavior

- Category, subgroup, individual, and visible-search selection controls.
- News aggregators (Google News, Hacker News and Slashdot) are identified separately from individual publications.
- Source preferences are saved locally and apply across topics and cached/live results.
- Google News can be disabled independently of direct feeds.
- Politics, Finance and Lifestyle have built-in topic tabs.

## Research references

- [Feedspot directory](https://rss.feedspot.com/best_rss_feeds/#health-wellness)
- [Plenary awesome RSS feeds](https://github.com/plenaryapp/awesome-rss-feeds#News)
- [PBS official RSS feeds](https://www.pbs.org/newshour/about/pbs-news-rss-feeds)
- [Guardian RSS help](https://www.theguardian.com/help/feeds)
- [WIRED RSS directory](https://www.wired.com/about/rss-feeds/)
- [TechCrunch RSS terms](https://techcrunch.com/rss-terms-of-use/)
- [Science News RSS FAQ](https://www.sciencenews.org/about-science-news/frequently-asked-questions)
- [Phys.org RSS directory](https://phys.org/feeds/)

Publisher directories and direct endpoint checks inform inclusion; third-party directory presence alone is insufficient. Full endpoint results and sample headlines are in [rss-feed-audit.json](rss-feed-audit.json).
