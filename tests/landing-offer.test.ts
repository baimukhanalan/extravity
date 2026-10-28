import { describe, expect, it } from "vitest";
import { HERO_IMAGE_SRC_SET, landingMarkupWithCurrentOffer } from "@/components/landing/landing";
import { LANDING_MARKUP } from "@/components/landing/markup";

describe("landing offer", () => {
  const markup = landingMarkupWithCurrentOffer(LANDING_MARKUP);

  it("shows the free manual path", () => {
    expect(markup).toContain("Каталог и ручная подача заявок доступны бесплатно");
    expect(markup).toContain("Расширенный поиск");
  });

  it("removes illustrative plan pricing", () => {
    expect(markup).not.toContain("2 490₸");
    expect(markup).not.toContain("4 900₸");
    expect(markup).not.toContain("цены демонстрационные");
    expect(markup).not.toContain("Нет. Мы готовим Application Pack");
  });

  it("uses the live opportunity count without invented audience metrics", () => {
    expect(markup).toContain("__OPP_COUNT__");
    expect(markup).not.toContain('data-count="460"');
    expect(markup).not.toContain('data-count="12400"');
    expect(markup).not.toContain("показатели демонстрационные");
    expect(markup).not.toContain(">96</span>");
    expect(markup).not.toContain(">54</span>");
    expect(markup).not.toContain(">128</span>");
    expect(markup).not.toContain("распределение демонстрационное");
    expect(markup).not.toContain("Счётчик возможностей загружается из актуального каталога");
    expect(markup).not.toContain("data-preloader");
  });

  it("does not show illustrative testimonials or unconfirmed partners", () => {
    expect(markup).not.toContain("истории иллюстративные");
    expect(markup).not.toContain("партнёры показаны как пример");
    expect(markup).not.toContain("Счётчик возможностей загружается из актуального каталога");
  });

  it("uses responsive local hero media without loading the hidden remote image", () => {
    expect(markup).toContain("data-hero-picture");
    expect(markup).toContain(`srcset="${HERO_IMAGE_SRC_SET}"`);
    expect(markup).toContain('sizes="100vw"');
    expect(markup).toContain('fetchpriority="high"');
    expect(markup).not.toContain("cloudfront.net");
    expect(markup).not.toContain("data-hero-media");
  });
});
