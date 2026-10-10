// Shared catalog: JSON below is also read by sync_news.py and the RSS audit tool.
export const FEED_CATALOG = [
  {
    "id": "cbc_top",
    "name": "CBC News",
    "domain": "cbc.ca",
    "url": "https://www.cbc.ca/cmlink/rss-topstories",
    "topics": [
      "TOP",
      "LATEST"
    ],
    "maxArticles": 10,
    "enabled": true,
    "category": "News",
    "kind": "publisher"
  },
  {
    "id": "global_top",
    "name": "Global News",
    "domain": "globalnews.ca",
    "url": "https://globalnews.ca/feed/",
    "topics": [
      "TOP",
      "LATEST"
    ],
    "maxArticles": 8,
    "enabled": true,
    "category": "News",
    "kind": "publisher"
  },
  {
    "id": "nyt_top",
    "name": "New York Times",
    "domain": "nytimes.com",
    "url": "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml",
    "topics": [
      "TOP",
      "LATEST"
    ],
    "maxArticles": 10,
    "enabled": true,
    "category": "News",
    "kind": "publisher",
    "access": "Some articles may require a subscription"
  },
  {
    "id": "bbc_top",
    "name": "BBC News",
    "domain": "bbc.co.uk",
    "url": "https://feeds.bbci.co.uk/news/rss.xml",
    "topics": [
      "TOP",
      "LATEST"
    ],
    "maxArticles": 10,
    "enabled": true,
    "category": "News",
    "kind": "publisher"
  },
  {
    "id": "cnbc_top",
    "name": "CNBC",
    "domain": "cnbc.com",
    "url": "https://www.cnbc.com/id/100003114/device/rss/rss.html",
    "topics": [
      "TOP",
      "LATEST"
    ],
    "maxArticles": 8,
    "enabled": true,
    "category": "News",
    "kind": "publisher"
  },
  {
    "id": "fox_top",
    "name": "Fox News",
    "domain": "foxnews.com",
    "url": "http://feeds.foxnews.com/foxnews/latest",
    "topics": [
      "TOP",
      "LATEST"
    ],
    "maxArticles": 8,
    "enabled": true,
    "category": "News",
    "kind": "publisher"
  },
  {
    "id": "politico_playbook",
    "name": "Politico",
    "domain": "politico.com",
    "url": "https://rss.politico.com/playbook.xml",
    "topics": [
      "TOP"
    ],
    "maxArticles": 7,
    "enabled": true,
    "category": "News",
    "kind": "publisher"
  },
  {
    "id": "abc_top",
    "name": "ABC News",
    "domain": "abcnews.go.com",
    "url": "https://abcnews.go.com/abcnews/topstories",
    "topics": [
      "TOP",
      "LATEST"
    ],
    "maxArticles": 8,
    "enabled": true,
    "category": "News",
    "kind": "publisher"
  },
  {
    "id": "aljazeera_top",
    "name": "Al Jazeera",
    "domain": "aljazeera.com",
    "url": "https://www.aljazeera.com/xml/rss/all.xml",
    "topics": [
      "TOP",
      "LATEST",
      "WORLD"
    ],
    "maxArticles": 8,
    "enabled": true,
    "category": "News",
    "kind": "publisher"
  },
  {
    "id": "japan_times_top",
    "name": "The Japan Times",
    "domain": "japantimes.co.jp",
    "url": "https://www.japantimes.co.jp/feed/",
    "topics": [
      "TOP",
      "LATEST",
      "WORLD"
    ],
    "maxArticles": 7,
    "enabled": true,
    "category": "News",
    "kind": "publisher",
    "access": "Some articles may require a subscription"
  },
  {
    "id": "scmp_asia",
    "name": "South China Morning Post (Asia)",
    "domain": "scmp.com",
    "url": "https://www.scmp.com/rss/3/feed",
    "topics": [
      "TOP",
      "LATEST",
      "WORLD"
    ],
    "maxArticles": 8,
    "enabled": true,
    "category": "News",
    "kind": "publisher",
    "access": "Some articles may require a subscription"
  },
  {
    "id": "cna_top",
    "name": "CNA",
    "domain": "channelnewsasia.com",
    "url": "https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml",
    "topics": [
      "TOP",
      "LATEST"
    ],
    "maxArticles": 8,
    "enabled": true,
    "category": "News",
    "kind": "publisher"
  },
  {
    "id": "dw_top",
    "name": "Deutsche Welle",
    "domain": "dw.com",
    "url": "https://rss.dw.com/xml/rss-en-all",
    "topics": [
      "TOP",
      "LATEST",
      "WORLD"
    ],
    "maxArticles": 8,
    "enabled": true,
    "category": "News",
    "kind": "publisher"
  },
  {
    "id": "france24_top",
    "name": "France 24",
    "domain": "france24.com",
    "url": "https://www.france24.com/en/rss",
    "topics": [
      "TOP",
      "LATEST",
      "WORLD"
    ],
    "maxArticles": 8,
    "enabled": true,
    "category": "News",
    "kind": "publisher"
  },
  {
    "id": "lemonde_world",
    "name": "Le Monde (International)",
    "domain": "lemonde.fr",
    "url": "https://www.lemonde.fr/en/international/rss_full.xml",
    "topics": [
      "WORLD"
    ],
    "maxArticles": 7,
    "enabled": true,
    "category": "News",
    "kind": "publisher",
    "access": "Some articles may require a subscription"
  },
  {
    "id": "lemonde_europe",
    "name": "Le Monde (Europe)",
    "domain": "lemonde.fr",
    "url": "https://www.lemonde.fr/en/europe/rss_full.xml",
    "topics": [
      "WORLD"
    ],
    "maxArticles": 7,
    "enabled": true,
    "category": "News",
    "kind": "publisher",
    "access": "Some articles may require a subscription"
  },
  {
    "id": "cbc_canada",
    "name": "CBC Canada",
    "domain": "cbc.ca",
    "url": "https://www.cbc.ca/cmlink/rss-canada",
    "topics": [
      "CANADA"
    ],
    "maxArticles": 10,
    "enabled": true,
    "category": "News",
    "kind": "publisher"
  },
  {
    "id": "global_canada",
    "name": "Global News Canada",
    "domain": "globalnews.ca",
    "url": "https://globalnews.ca/feed/",
    "topics": [
      "CANADA"
    ],
    "maxArticles": 8,
    "enabled": true,
    "category": "News",
    "kind": "publisher"
  },
  {
    "id": "cbc_bc",
    "name": "CBC British Columbia",
    "domain": "cbc.ca",
    "url": "https://www.cbc.ca/cmlink/rss-canada-britishcolumbia",
    "topics": [
      "VANCOUVER",
      "BC"
    ],
    "maxArticles": 10,
    "enabled": true,
    "category": "News",
    "kind": "publisher"
  },
  {
    "id": "global_bc",
    "name": "Global News BC",
    "domain": "globalnews.ca",
    "url": "https://globalnews.ca/bc/feed/",
    "topics": [
      "VANCOUVER",
      "BC"
    ],
    "maxArticles": 9,
    "enabled": true,
    "category": "News",
    "kind": "publisher"
  },
  {
    "id": "bbc_world",
    "name": "BBC World",
    "domain": "bbc.co.uk",
    "url": "http://feeds.bbci.co.uk/news/world/rss.xml",
    "topics": [
      "WORLD"
    ],
    "maxArticles": 10,
    "enabled": true,
    "category": "News",
    "kind": "publisher"
  },
  {
    "id": "guardian_world",
    "name": "The Guardian World",
    "domain": "theguardian.com",
    "url": "https://www.theguardian.com/world/rss",
    "topics": [
      "WORLD"
    ],
    "maxArticles": 9,
    "enabled": true,
    "category": "News",
    "kind": "publisher"
  },
  {
    "id": "nyt_world",
    "name": "New York Times World",
    "domain": "nytimes.com",
    "url": "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
    "topics": [
      "WORLD"
    ],
    "maxArticles": 9,
    "enabled": true,
    "category": "News",
    "kind": "publisher",
    "access": "Some articles may require a subscription"
  },
  {
    "id": "cnbc_world",
    "name": "CNBC International",
    "domain": "cnbc.com",
    "url": "https://www.cnbc.com/id/100727362/device/rss/rss.html",
    "topics": [
      "WORLD"
    ],
    "maxArticles": 7,
    "enabled": true,
    "category": "News",
    "kind": "publisher"
  },
  {
    "id": "cbc_world",
    "name": "CBC World",
    "domain": "cbc.ca",
    "url": "https://www.cbc.ca/cmlink/rss-world",
    "topics": [
      "WORLD"
    ],
    "maxArticles": 7,
    "enabled": true,
    "category": "News",
    "kind": "publisher"
  },
  {
    "id": "abc_world",
    "name": "ABC World News",
    "domain": "abcnews.go.com",
    "url": "https://abcnews.go.com/abcnews/internationalheadlines",
    "topics": [
      "WORLD"
    ],
    "maxArticles": 7,
    "enabled": true,
    "category": "News",
    "kind": "publisher"
  },
  {
    "id": "investing_all",
    "name": "Investing.com",
    "domain": "investing.com",
    "url": "https://www.investing.com/rss/news.rss",
    "topics": [
      "BUSINESS"
    ],
    "maxArticles": 9,
    "enabled": true,
    "category": "Business",
    "kind": "publisher"
  },
  {
    "id": "cnbc_business",
    "name": "CNBC",
    "domain": "cnbc.com",
    "url": "https://www.cnbc.com/id/100003114/device/rss/rss.html",
    "topics": [
      "BUSINESS"
    ],
    "maxArticles": 8,
    "enabled": true,
    "category": "Business",
    "kind": "publisher"
  },
  {
    "id": "bbc_business",
    "name": "BBC Business",
    "domain": "bbc.co.uk",
    "url": "https://feeds.bbci.co.uk/news/business/rss.xml",
    "topics": [
      "BUSINESS"
    ],
    "maxArticles": 8,
    "enabled": true,
    "category": "Business",
    "kind": "publisher"
  },
  {
    "id": "cbc_business",
    "name": "CBC Business",
    "domain": "cbc.ca",
    "url": "https://www.cbc.ca/cmlink/rss-business",
    "topics": [
      "BUSINESS"
    ],
    "maxArticles": 8,
    "enabled": true,
    "category": "Business",
    "kind": "publisher"
  },
  {
    "id": "ars_technica",
    "name": "Ars Technica",
    "domain": "arstechnica.com",
    "url": "http://feeds.arstechnica.com/arstechnica/index",
    "topics": [
      "TECHNOLOGY"
    ],
    "maxArticles": 9,
    "enabled": true,
    "category": "Technology",
    "kind": "publisher"
  },
  {
    "id": "the_verge",
    "name": "The Verge",
    "domain": "theverge.com",
    "url": "https://www.theverge.com/rss/index.xml",
    "topics": [
      "TECHNOLOGY"
    ],
    "maxArticles": 8,
    "enabled": true,
    "category": "Technology",
    "kind": "publisher"
  },
  {
    "id": "gizmodo",
    "name": "Gizmodo",
    "domain": "gizmodo.com",
    "url": "https://gizmodo.com/rss",
    "topics": [
      "TECHNOLOGY"
    ],
    "maxArticles": 8,
    "enabled": true,
    "category": "Technology",
    "kind": "publisher"
  },
  {
    "id": "hacker_news",
    "name": "Hacker News",
    "domain": "ycombinator.com",
    "url": "https://news.ycombinator.com/rss",
    "topics": [
      "TECHNOLOGY"
    ],
    "maxArticles": 8,
    "enabled": true,
    "category": "Technology",
    "kind": "aggregator"
  },
  {
    "id": "slashdot",
    "name": "Slashdot",
    "domain": "slashdot.org",
    "url": "http://rss.slashdot.org/Slashdot/slashdotMain",
    "topics": [
      "TECHNOLOGY"
    ],
    "maxArticles": 8,
    "enabled": true,
    "category": "Technology",
    "kind": "aggregator"
  },
  {
    "id": "bbc_tech",
    "name": "BBC Technology",
    "domain": "bbc.co.uk",
    "url": "https://feeds.bbci.co.uk/news/technology/rss.xml",
    "topics": [
      "TECHNOLOGY"
    ],
    "maxArticles": 8,
    "enabled": true,
    "category": "Technology",
    "kind": "publisher"
  },
  {
    "id": "cbc_tech",
    "name": "CBC Tech",
    "domain": "cbc.ca",
    "url": "https://www.cbc.ca/cmlink/rss-technology",
    "topics": [
      "TECHNOLOGY"
    ],
    "maxArticles": 7,
    "enabled": true,
    "category": "Technology",
    "kind": "publisher"
  },
  {
    "id": "bbc_science",
    "name": "BBC Science",
    "domain": "bbc.co.uk",
    "url": "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml",
    "topics": [
      "SCIENCE"
    ],
    "maxArticles": 9,
    "enabled": true,
    "category": "Science",
    "kind": "publisher"
  },
  {
    "id": "ars_science",
    "name": "Ars Technica Science",
    "domain": "arstechnica.com",
    "url": "https://feeds.arstechnica.com/arstechnica/science",
    "topics": [
      "SCIENCE"
    ],
    "maxArticles": 8,
    "enabled": true,
    "category": "Science",
    "kind": "publisher"
  },
  {
    "id": "bbc_entertainment",
    "name": "BBC Entertainment",
    "domain": "bbc.co.uk",
    "url": "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml",
    "topics": [
      "ENTERTAINMENT"
    ],
    "maxArticles": 8,
    "enabled": true,
    "category": "Entertainment",
    "kind": "publisher"
  },
  {
    "id": "abc_entertainment",
    "name": "ABC Entertainment",
    "domain": "abcnews.go.com",
    "url": "https://abcnews.go.com/abcnews/entertainmentheadlines",
    "topics": [
      "ENTERTAINMENT"
    ],
    "maxArticles": 8,
    "enabled": true,
    "category": "Entertainment",
    "kind": "publisher"
  },
  {
    "id": "cbc_sports",
    "name": "CBC Sports",
    "domain": "cbc.ca",
    "url": "https://www.cbc.ca/cmlink/rss-sports",
    "topics": [
      "SPORTS"
    ],
    "maxArticles": 9,
    "enabled": true,
    "category": "Sports",
    "kind": "publisher"
  },
  {
    "id": "abc_sports",
    "name": "ABC Sports",
    "domain": "abcnews.go.com",
    "url": "https://abcnews.go.com/abcnews/sportsheadlines",
    "topics": [
      "SPORTS"
    ],
    "maxArticles": 8,
    "enabled": true,
    "category": "Sports",
    "kind": "publisher"
  },
  {
    "id": "npr_news",
    "name": "NPR News",
    "domain": "npr.org",
    "url": "https://feeds.npr.org/1001/rss.xml",
    "category": "News",
    "kind": "publisher",
    "topics": [
      "TOP",
      "LATEST",
      "WORLD"
    ],
    "maxArticles": 8,
    "enabled": true
  },
  {
    "id": "pbs_news",
    "name": "PBS News",
    "domain": "pbs.org",
    "url": "https://www.pbs.org/newshour/feeds/rss/headlines",
    "category": "News",
    "kind": "publisher",
    "topics": [
      "TOP",
      "LATEST"
    ],
    "maxArticles": 8,
    "enabled": true
  },
  {
    "id": "npr_politics",
    "name": "NPR Politics",
    "domain": "npr.org",
    "url": "https://feeds.npr.org/1014/rss.xml",
    "category": "Politics",
    "kind": "publisher",
    "topics": [
      "POLITICS"
    ],
    "maxArticles": 8,
    "enabled": true
  },
  {
    "id": "pbs_politics",
    "name": "PBS Politics",
    "domain": "pbs.org",
    "url": "https://www.pbs.org/newshour/feeds/rss/politics",
    "category": "Politics",
    "kind": "publisher",
    "topics": [
      "POLITICS"
    ],
    "maxArticles": 8,
    "enabled": true
  },
  {
    "id": "guardian_politics",
    "name": "The Guardian Politics",
    "domain": "theguardian.com",
    "url": "https://www.theguardian.com/politics/rss",
    "category": "Politics",
    "kind": "publisher",
    "topics": [
      "POLITICS"
    ],
    "maxArticles": 8,
    "enabled": true
  },
  {
    "id": "nyt_politics",
    "name": "New York Times Politics",
    "domain": "nytimes.com",
    "url": "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml",
    "category": "Politics",
    "kind": "publisher",
    "topics": [
      "POLITICS"
    ],
    "maxArticles": 8,
    "enabled": true,
    "access": "Some articles may require a subscription"
  },
  {
    "id": "fortune_business",
    "name": "Fortune",
    "domain": "fortune.com",
    "url": "https://fortune.com/feed/",
    "category": "Business",
    "kind": "publisher",
    "topics": [
      "BUSINESS",
      "FINANCE"
    ],
    "maxArticles": 8,
    "enabled": true,
    "access": "Some articles may require a subscription"
  },
  {
    "id": "ft_news",
    "name": "Financial Times",
    "domain": "ft.com",
    "url": "https://www.ft.com/news-feed?format=rss",
    "category": "Finance",
    "kind": "publisher",
    "topics": [
      "BUSINESS",
      "FINANCE"
    ],
    "maxArticles": 8,
    "enabled": true,
    "access": "Some articles may require a subscription"
  },
  {
    "id": "wsj_markets",
    "name": "Wall Street Journal Markets",
    "domain": "wsj.com",
    "url": "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain",
    "category": "Finance",
    "kind": "publisher",
    "topics": [
      "FINANCE"
    ],
    "maxArticles": 8,
    "enabled": true,
    "access": "Some articles may require a subscription"
  },
  {
    "id": "marketwatch_top",
    "name": "MarketWatch",
    "domain": "marketwatch.com",
    "url": "https://feeds.marketwatch.com/marketwatch/topstories",
    "category": "Finance",
    "kind": "publisher",
    "topics": [
      "FINANCE"
    ],
    "maxArticles": 8,
    "enabled": true,
    "access": "Some articles may require a subscription"
  },
  {
    "id": "bloomberg_markets",
    "name": "Bloomberg Markets",
    "domain": "bloomberg.com",
    "url": "https://feeds.bloomberg.com/markets/news.rss",
    "category": "Finance",
    "kind": "publisher",
    "topics": [
      "BUSINESS",
      "FINANCE"
    ],
    "maxArticles": 8,
    "enabled": true,
    "access": "Some articles may require a subscription"
  },
  {
    "id": "wired_tech",
    "name": "WIRED",
    "domain": "wired.com",
    "url": "https://www.wired.com/feed/rss",
    "category": "Technology",
    "kind": "publisher",
    "topics": [
      "TECHNOLOGY"
    ],
    "maxArticles": 8,
    "enabled": true,
    "access": "Some articles may require a subscription"
  },
  {
    "id": "wired_science",
    "name": "WIRED Science",
    "domain": "wired.com",
    "url": "https://www.wired.com/feed/category/science/latest/rss",
    "category": "Science",
    "kind": "publisher",
    "topics": [
      "SCIENCE"
    ],
    "maxArticles": 8,
    "enabled": true,
    "access": "Some articles may require a subscription"
  },
  {
    "id": "techcrunch",
    "name": "TechCrunch",
    "domain": "techcrunch.com",
    "url": "https://techcrunch.com/feed/",
    "category": "Technology",
    "kind": "publisher",
    "topics": [
      "TECHNOLOGY",
      "BUSINESS"
    ],
    "maxArticles": 8,
    "enabled": true
  },
  {
    "id": "ieee_spectrum",
    "name": "IEEE Spectrum",
    "domain": "spectrum.ieee.org",
    "url": "https://spectrum.ieee.org/feeds/feed.rss",
    "category": "Technology",
    "kind": "publisher",
    "topics": [
      "TECHNOLOGY"
    ],
    "maxArticles": 8,
    "enabled": true
  },
  {
    "id": "science_news",
    "name": "Science News",
    "domain": "sciencenews.org",
    "url": "https://www.sciencenews.org/feed",
    "category": "Science",
    "kind": "publisher",
    "topics": [
      "SCIENCE"
    ],
    "maxArticles": 8,
    "enabled": true,
    "access": "Some articles may require a subscription"
  },
  {
    "id": "scientific_american",
    "name": "Scientific American",
    "domain": "scientificamerican.com",
    "url": "https://www.scientificamerican.com/platform/syndication/rss/",
    "category": "Science",
    "kind": "publisher",
    "topics": [
      "SCIENCE"
    ],
    "maxArticles": 8,
    "enabled": true,
    "access": "Some articles may require a subscription"
  },
  {
    "id": "phys_org",
    "name": "Phys.org",
    "domain": "phys.org",
    "url": "https://phys.org/rss-feed/",
    "category": "Science",
    "kind": "publisher",
    "topics": [
      "SCIENCE"
    ],
    "maxArticles": 8,
    "enabled": true
  },
  {
    "id": "nature_news",
    "name": "Nature (News & Research)",
    "domain": "nature.com",
    "url": "https://www.nature.com/nature.rss",
    "category": "Science",
    "kind": "publisher",
    "topics": [
      "SCIENCE"
    ],
    "maxArticles": 8,
    "enabled": true,
    "access": "Some articles may require a subscription"
  },
  {
    "id": "guardian_lifestyle",
    "name": "The Guardian Life & Style",
    "domain": "theguardian.com",
    "url": "https://www.theguardian.com/lifeandstyle/rss",
    "category": "Lifestyle",
    "kind": "publisher",
    "topics": [
      "LIFESTYLE"
    ],
    "maxArticles": 8,
    "enabled": true
  },
  {
    "id": "architectural_digest",
    "name": "Architectural Digest",
    "domain": "architecturaldigest.com",
    "url": "https://www.architecturaldigest.com/feed/rss",
    "category": "Lifestyle",
    "kind": "publisher",
    "topics": [
      "LIFESTYLE"
    ],
    "maxArticles": 8,
    "enabled": true,
    "access": "Some articles may require a subscription"
  },
  {
    "id": "vogue",
    "name": "Vogue",
    "domain": "vogue.com",
    "url": "https://www.vogue.com/feed/rss",
    "category": "Lifestyle",
    "kind": "publisher",
    "topics": [
      "LIFESTYLE"
    ],
    "maxArticles": 8,
    "enabled": true,
    "access": "Some articles may require a subscription"
  },
  {
    "id": "variety",
    "name": "Variety",
    "domain": "variety.com",
    "url": "https://variety.com/feed/",
    "category": "Entertainment",
    "kind": "publisher",
    "topics": [
      "ENTERTAINMENT"
    ],
    "maxArticles": 8,
    "enabled": true,
    "access": "Some articles may require a subscription"
  },
  {
    "id": "hollywood_reporter",
    "name": "The Hollywood Reporter",
    "domain": "hollywoodreporter.com",
    "url": "https://www.hollywoodreporter.com/feed/",
    "category": "Entertainment",
    "kind": "publisher",
    "topics": [
      "ENTERTAINMENT"
    ],
    "maxArticles": 8,
    "enabled": true
  },
  {
    "id": "deadline",
    "name": "Deadline",
    "domain": "deadline.com",
    "url": "https://deadline.com/feed/rss",
    "category": "Entertainment",
    "kind": "publisher",
    "topics": [
      "ENTERTAINMENT"
    ],
    "maxArticles": 8,
    "enabled": true
  },
  {
    "id": "npr_culture",
    "name": "NPR Culture",
    "domain": "npr.org",
    "url": "https://feeds.npr.org/1008/rss.xml",
    "category": "Entertainment",
    "kind": "publisher",
    "topics": [
      "ENTERTAINMENT"
    ],
    "maxArticles": 8,
    "enabled": true
  },
  {
    "id": "guardian_culture",
    "name": "The Guardian Culture",
    "domain": "theguardian.com",
    "url": "https://www.theguardian.com/culture/rss",
    "category": "Entertainment",
    "kind": "publisher",
    "topics": [
      "ENTERTAINMENT"
    ],
    "maxArticles": 8,
    "enabled": true
  },
  {
    "id": "cna_world",
    "name": "CNA World",
    "domain": "channelnewsasia.com",
    "url": "https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6311",
    "category": "News",
    "kind": "publisher",
    "topics": [
      "WORLD"
    ],
    "maxArticles": 7,
    "enabled": true
  }
];
