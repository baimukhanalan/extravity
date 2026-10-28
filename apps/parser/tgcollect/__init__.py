"""Telegram collector: reads public channels over MTProto (Telethon),
extracts opportunity candidates from free-form posts and hands them to the
app's moderation queue through the shared ingest endpoint.

Deliberate boundaries:
  * only public channels the signed-in account can already read;
  * no member lists, no private chats, no forwarding of personal data;
  * FloodWait is always honoured, never worked around;
  * nothing is auto-published — every candidate lands in moderation.
"""
