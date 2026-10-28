"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Expand, Play, X } from "lucide-react";
import type { OpportunityMedia } from "@prisma/client";
import { railwayMediaDisplayUrl } from "@/lib/railway-media-display";

type GalleryProps = {
  media: OpportunityMedia[];
  title: string;
  notice?: string | null;
};

function MediaItem({
  item,
  title,
  priority = false,
  fullscreen = false,
}: {
  item: OpportunityMedia;
  title: string;
  priority?: boolean;
  fullscreen?: boolean;
}) {
  const railwayUrl = railwayMediaDisplayUrl(item);
  if (item.kind === "VIDEO") {
    return (
      <video
        key={`${item.id}-${fullscreen ? "fullscreen" : "gallery"}`}
        controls
        playsInline
        preload="metadata"
        className="h-full w-full object-contain"
        aria-label={item.altText ?? title}
      >
        <source src={railwayUrl ?? item.url} type={item.mimeType} />
      </video>
    );
  }

  return (
    <Image
      src={railwayUrl ?? item.url}
      unoptimized={Boolean(railwayUrl)}
      alt={item.altText ?? title}
      fill
      priority={priority}
      sizes={fullscreen ? "100vw" : "(max-width: 1024px) 100vw, 700px"}
      className="object-contain"
    />
  );
}

export function OpportunityMediaGallery({ media, title, notice }: GalleryProps) {
  const [index, setIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const current = media[index];

  const previous = useCallback(
    () => setIndex((value) => (value - 1 + media.length) % media.length),
    [media.length],
  );
  const next = useCallback(
    () => setIndex((value) => (value + 1) % media.length),
    [media.length],
  );
  const closeFullscreen = useCallback(() => setFullscreen(false), []);

  useEffect(() => {
    if (!fullscreen) return;

    const previousOverflow = document.body.style.overflow;
    const fullscreenTrigger = expandButtonRef.current;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeFullscreen();
      if (event.key === "ArrowLeft" && media.length > 1) previous();
      if (event.key === "ArrowRight" && media.length > 1) next();
      if (event.key === "Tab") {
        const dialog = closeButtonRef.current?.closest('[role="dialog"]');
        const focusable = dialog?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), video[controls], [href], [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      fullscreenTrigger?.focus();
    };
  }, [closeFullscreen, fullscreen, media.length, next, previous]);

  if (!current) return null;

  return (
    <>
      <section className="mb-6 overflow-hidden rounded-2xl border border-border bg-surface" aria-label={`Медиа: ${title}`}>
        <div className="relative flex min-h-[420px] items-center justify-center bg-black sm:min-h-[560px] lg:min-h-[640px]">
          <MediaItem item={current} title={title} priority={index === 0} />
          {current.rightsState === "LICENSED_FALLBACK" ? (
            <span className="pointer-events-none absolute bottom-4 left-4 z-20 rounded-full bg-black/75 px-3 py-1.5 text-xs font-medium text-white">Иллюстрация, не фото события</span>
          ) : null}
          {current.rightsState === "SOURCE_POST" ? (
            <span className="pointer-events-none absolute bottom-4 left-4 z-20 rounded-full bg-black/75 px-3 py-1.5 text-xs font-medium text-white">Медиа из исходной публикации</span>
          ) : null}
          {notice && current.rightsState === "SOURCE_POST" ? (
            <span className="pointer-events-none absolute left-4 right-4 top-4 z-20 rounded-lg bg-amber-950/95 px-3 py-2 text-sm font-semibold text-white">{notice}</span>
          ) : null}

          {current.kind === "IMAGE" ? (
            <button
              ref={expandButtonRef}
              type="button"
              onClick={() => setFullscreen(true)}
              aria-label="Открыть изображение на весь экран"
              className="absolute inset-0 cursor-zoom-in focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/70 focus-visible:ring-inset"
            >
              <span className="absolute right-3 top-3 inline-flex items-center gap-2 rounded-full bg-black/65 px-3 py-2 text-xs font-medium text-white backdrop-blur transition-colors hover:bg-black/80">
                <Expand className="h-4 w-4" aria-hidden="true" /> На весь экран
              </span>
            </button>
          ) : (
            <button
              ref={expandButtonRef}
              type="button"
              onClick={() => setFullscreen(true)}
              aria-label="Открыть видео на весь экран"
              className="absolute right-3 top-3 inline-flex items-center gap-2 rounded-full bg-black/65 px-3 py-2 text-xs font-medium text-white backdrop-blur transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Expand className="h-4 w-4" aria-hidden="true" /> На весь экран
            </button>
          )}

          {current.kind === "VIDEO" ? (
            <span className="pointer-events-none absolute left-4 top-4 inline-flex items-center gap-1 rounded-full bg-black/65 px-3 py-1.5 text-xs font-medium text-white">
              <Play className="h-3.5 w-3.5" aria-hidden="true" /> Видео
            </span>
          ) : null}
          {media.length > 1 ? (
            <>
              <button type="button" onClick={previous} aria-label="Предыдущее медиа" className="absolute left-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              <button type="button" onClick={next} aria-label="Следующее медиа" className="absolute right-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </>
          ) : null}
        </div>
        {media.length > 1 ? (
          <div className="flex items-center gap-2 overflow-x-auto p-3" aria-label="Выбор медиа">
            {media.map((item, itemIndex) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setIndex(itemIndex)}
                aria-label={`Показать медиа ${itemIndex + 1} из ${media.length}`}
                aria-current={itemIndex === index ? "true" : undefined}
                className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${itemIndex === index ? "border-primary" : "border-transparent"}`}
              >
                {item.kind === "IMAGE" ? (
                  <Image src={railwayMediaDisplayUrl(item) ?? item.url} unoptimized={Boolean(railwayMediaDisplayUrl(item))} alt="" fill sizes="96px" className="object-cover" />
                ) : (
                  <span className="grid h-full place-items-center bg-surface-muted"><Play className="h-4 w-4" aria-hidden="true" /></span>
                )}
              </button>
            ))}
            <span className="ml-auto shrink-0 px-2 text-xs tabular-nums text-muted" aria-live="polite">
              {index + 1} / {media.length}
            </span>
          </div>
        ) : null}
      </section>

      {fullscreen ? (
        <div
          className="fixed inset-0 z-[100] flex bg-black/95 p-2 sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-label={`Полноэкранный просмотр: ${title}`}
        >
          <div
            className="relative m-auto h-full w-full max-w-[1800px] overflow-hidden"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeFullscreen();
            }}
          >
            <MediaItem item={current} title={title} fullscreen />
            {current.rightsState === "LICENSED_FALLBACK" ? (
              <span className="pointer-events-none absolute bottom-3 left-3 z-20 rounded-full bg-black/75 px-3 py-1.5 text-xs font-medium text-white">Иллюстрация, не фото события</span>
            ) : null}
            {current.rightsState === "SOURCE_POST" ? (
              <span className="pointer-events-none absolute bottom-3 left-3 z-20 rounded-full bg-black/75 px-3 py-1.5 text-xs font-medium text-white">Медиа из исходной публикации</span>
            ) : null}
            {notice && current.rightsState === "SOURCE_POST" ? (
              <span className="pointer-events-none absolute left-3 right-16 top-3 z-20 rounded-lg bg-amber-950/95 px-3 py-2 text-sm font-semibold text-white">{notice}</span>
            ) : null}
            <button
              ref={closeButtonRef}
              type="button"
              onClick={closeFullscreen}
              aria-label="Закрыть полноэкранный просмотр"
              className="absolute right-2 top-2 z-20 grid h-12 w-12 place-items-center rounded-full bg-black/70 text-white backdrop-blur transition-colors hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-3 sm:top-3"
            >
              <X className="h-6 w-6" aria-hidden="true" />
            </button>
            {media.length > 1 ? (
              <>
                <button type="button" onClick={previous} aria-label="Предыдущее медиа" className="absolute left-2 top-1/2 z-20 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-black/70 text-white backdrop-blur transition-colors hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:left-4">
                  <ChevronLeft className="h-6 w-6" aria-hidden="true" />
                </button>
                <button type="button" onClick={next} aria-label="Следующее медиа" className="absolute right-2 top-1/2 z-20 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-black/70 text-white backdrop-blur transition-colors hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-4">
                  <ChevronRight className="h-6 w-6" aria-hidden="true" />
                </button>
                <span className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-xs tabular-nums text-white backdrop-blur" aria-live="polite">
                  {index + 1} / {media.length}
                </span>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
