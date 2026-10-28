import { describe, it, expect } from "vitest";
import { LOCALES, getDictionary, interpolate, isLocale, type Dict } from "@/lib/i18n";
import { categoryName, formatKzt, formatDate } from "@/lib/utils";

function flatten(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    typeof value === "object" && value !== null
      ? flatten(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe("dictionaries", () => {
  const reference = flatten(getDictionary("ru") as unknown as Record<string, unknown>).sort();

  for (const locale of LOCALES) {
    it(`${locale} has exactly the same keys as ru`, () => {
      const keys = flatten(getDictionary(locale) as unknown as Record<string, unknown>).sort();
      expect(keys).toEqual(reference);
    });

    it(`${locale} has no empty strings`, () => {
      const dict = getDictionary(locale) as unknown as Record<string, Record<string, string>>;
      const empties = Object.entries(dict).flatMap(([section, entries]) =>
        Object.entries(entries)
          .filter(([, v]) => !String(v).trim())
          .map(([k]) => `${section}.${k}`),
      );
      expect(empties).toEqual([]);
    });
  }

  it("falls back to Russian for an unknown locale", () => {
    const dict = getDictionary("de" as unknown as Dict extends never ? never : "ru");
    expect(dict.nav.catalog).toBe("Каталог");
  });
});

describe("isLocale", () => {
  it("accepts supported codes", () => {
    expect(isLocale("kk")).toBe(true);
    expect(isLocale("en")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isLocale("de")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale("")).toBe(false);
  });
});

describe("interpolate", () => {
  it("fills placeholders", () => {
    expect(interpolate("через {n} дн.", { n: 5 })).toBe("через 5 дн.");
  });
  it("leaves unknown placeholders visible instead of printing undefined", () => {
    expect(interpolate("{a} и {b}", { a: 1 })).toBe("1 и {b}");
  });
});

describe("locale-aware formatting", () => {
  const category = { name: "Hackathons", nameRu: "Хакатоны", nameKz: "Хакатондар" };

  it("picks the category name per locale", () => {
    expect(categoryName(category, "ru")).toBe("Хакатоны");
    expect(categoryName(category, "kk")).toBe("Хакатондар");
    expect(categoryName(category, "en")).toBe("Hackathons");
  });

  it("translates the free-price label", () => {
    expect(formatKzt(0, "ru")).toBe("Бесплатно");
    expect(formatKzt(0, "kk")).toBe("Тегін");
    expect(formatKzt(0, "en")).toBe("Free");
  });

  it("keeps the currency symbol in every locale", () => {
    for (const locale of LOCALES) expect(formatKzt(2990, locale)).toContain("₸");
  });

  it("formats dates without throwing in every locale", () => {
    for (const locale of LOCALES) {
      expect(formatDate(new Date("2026-03-01T00:00:00Z"), locale)).toMatch(/2026/);
    }
  });
});
