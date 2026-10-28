"""Instagram collector: reads public posts by hashtag through the official
Instagram Graph API and hands captions to the moderation queue.

This is the *legal* path for Instagram, in contrast to scraping:

  * the Graph API is Meta's supported interface for third-party apps;
  * only public posts surfaced by `ig_hashtag_search` + `recent_media` are read;
  * it needs a Business/Creator account, an app reviewed by Meta, and a token —
    without a token the collector runs on a bundled fixture and touches nothing;
  * captions are parsed by the same extractor the Telegram collector uses, so
    everything lands in the moderation queue, never straight in the catalog.

Compare to `docs/instagram-and-scraping.md` for why scraping is not implemented.
"""
