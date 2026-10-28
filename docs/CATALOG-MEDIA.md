# Extravity: visual catalog and source media

## Product boundary

- Viewing and filtering the full catalog is free.
- Opening the organizer's verified application page and applying manually is free.
- A card is not published when required facts are stale, contradictory, or unsupported.

## Public opportunity cards

Every published opportunity must have at least one approved image or video. Media may contain multiple ordered items and is presented as a gallery on the detail page. Video is click-to-play, muted by default, and must have a poster.

The student-facing card shows:

- cover image or video poster;
- title and verified organizer;
- category, format, city, applicable age or grade;
- deadline urgency and price;
- fit status when a student profile exists;
- a free action that opens the verified organizer form.

Telegram and Instagram permalinks are internal provenance. They are visible to moderators, not students. The public product shows the organizer and verification status.

## Media publication gate

An opportunity may be public only when:

1. at least one media item is `READY`;
2. reuse rights are `APPROVED`;
3. the media passed MIME, size, malware and metadata checks;
4. an organizer and valid application URL are present;
5. the deadline has not expired;
6. content moderation is approved.

Telegram and Instagram media without documented reuse rights stays in staging. Protected content is not downloaded or republished.

## Catalog UX

- media-first cards with a reserved aspect ratio and no layout shift;
- entire card keyboard- and pointer-clickable; save remains a separate control;
- quick chips for fit, deadline, free, online and category;
- desktop advanced-filter sidebar and mobile filter bottom sheet;
- one-column mobile feed with 44px touch targets;
- expired opportunities excluded by default;
- detail gallery supports swipe, arrows, dots or thumbnails and fullscreen;
- alt text, visible focus, reduced motion and screen-reader announcements.

## Telegram workflow

1. A dedicated account receives a new post from an approved source.
2. The real-time listener stores text and media descriptors.
3. Deterministic rules decide whether the post is an opportunity.
4. Candidate media is downloaded to private staging storage.
5. Albums keep their original order; duplicates are keyed by platform media ID and checksum.
6. Structured fields, media staging IDs and provenance enter ingest.
7. Trusted partner sources may pass the strict publication gate; other sources stop in moderation.
8. A periodic catch-up scanner recovers messages missed by the listener.

The dedicated account reads only approved sources. Private conversational groups are excluded by default.

## Instagram workflow

Supported inputs are reviewed hashtags and mentions, partner submissions, and manual forwarding of a post or reel to the Extravity bot. Every candidate stops in moderation until its facts, media rights and organizer form are checked.

## Delivery order

1. Media schema, private provenance and publication gate.
2. Telegram and Instagram media staging and moderation gallery.
3. Catalog card and accessible detail gallery.
4. Verified profile fields and fit assessment.
5. Production canary and legal review before launch.
