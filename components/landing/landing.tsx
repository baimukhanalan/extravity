"use client";

import { useEffect, useRef } from "react";
import { LANDING_MARKUP } from "./markup";
import { initLanding } from "./init";

export const HERO_IMAGE_SRC_SET = [
  "/images/extravity-home-night-640.webp 640w",
  "/images/extravity-home-night-1024.webp 1024w",
  "/images/extravity-home-night-1536.webp 1536w",
].join(", ");

const HERO_PICTURE_MARKUP = `<picture data-hero-picture aria-hidden="true">
    <source type="image/webp" srcset="${HERO_IMAGE_SRC_SET}" sizes="100vw">
    <img src="/images/extravity-home-night.png" width="1536" height="1024" sizes="100vw" fetchpriority="high" decoding="async" alt="">
  </picture>`;

const LANDING_COPY_REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  ['data-count="460" data-suffix="+">0', 'data-count="__OPP_COUNT__">0'],
  ['data-count="20">0', '>0 ₸'],
  ['data-count="16">0', '>24/7'],
  ['data-count="12400">0', '>✓'],
  [">проверенных возможностей</div>", ">открытых возможностей в каталоге</div>"],
  [">категорий</div>", ">каталог и ручная подача</div>"],
  [">городов Казахстана</div>", ">доступ из любого города</div>"],
  [">школьников уже с нами</div>", ">ручная подача напрямую</div>"],
  [">* показатели демонстрационные</div>", ">Счётчик возможностей загружается из актуального каталога.</div>"],
  [">96</span>", "></span>"],
  [">54</span>", "></span>"],
  [">128</span>", "></span>"],
  [">* распределение демонстрационное · онлайн-возможности доступны из любого города</div>", ">Онлайн-возможности доступны из любого города.</div>"],
  [">навсегда</p>", ">каталог и ручная подача</p>"],
  [">Календарь дедлайнов + ICS</span>", ">Ручная подача заявок</span>"],
  [">Портфолио достижений</span>", ">Календарь дедлайнов и портфолио</span>"],
  [">Про</h3>", ">Расширенный поиск</h3>"],
  [">2 490₸<span", ">2 990 ₸<span"],
  ["> /мес</span>", " data-i18n=\"price.per_month\"> /мес</span>"],
  [">для активного школьника</p>", ">для точного подбора возможностей</p>"],
  [">Расширенные рекомендации + match score</span>", ">Расширенные рекомендации и match score</span>"],
  [">Application Pack и подготовка заявок</span>", ">Умные фильтры и сохранённые поиски</span>"],
  [">Напоминания в Telegram</span>", ">Напоминания о дедлайнах</span>"],
  [">Попробовать Про</a>", ">Выбрать расширенный поиск</a>"],
  [">* цены демонстрационные</div>", ">Каталог и ручная подача доступны бесплатно.</div>"],
  [">Каталог, базовый поиск, календарь и портфолио доступны бесплатно. Расширенные рекомендации и подготовка заявок — на платных тарифах.</p>", ">Каталог и ручная подача заявок доступны бесплатно.</p>"],
  [">Нет. Мы готовим Application Pack и помогаем заполнить, но финальное подтверждение всегда за вами. Автоматическая подача — только через официальные интеграции.</p>", ">Заявку можно подать вручную на официальном сайте организатора.</p>"],
  ["Олимпиады, хакатоны, MUN, стажировки и летние программы Казахстана. Подберём подходящие, напомним о дедлайне и поможем собрать заявку — в одном пространстве.", "Актуальные конкурсы, программы и стажировки для школьников Казахстана. Найди подходящее и подавай заявку вручную бесплатно."],
];

export function landingMarkupWithCurrentOffer(markup: string): string {
  let currentMarkup = LANDING_COPY_REPLACEMENTS.reduce(
    (result, [before, after]) => result.replace(before, after),
    markup,
  );

  const pricingStart = currentMarkup.indexOf('<section id="pricing"');
  const mentorCardStart = currentMarkup.indexOf('<div data-reveal="up" data-delay="180"', pricingStart);
  const pricingNoteStart = currentMarkup.indexOf('\n    </div>\n    <div data-i18n="price.note"', mentorCardStart);
  if (pricingStart !== -1 && mentorCardStart !== -1 && pricingNoteStart !== -1) {
    currentMarkup = currentMarkup.slice(0, mentorCardStart) + currentMarkup.slice(pricingNoteStart);
  }

  const removeSection = (startMarker: string, endMarker: string) => {
    const start = currentMarkup.indexOf(startMarker);
    const end = currentMarkup.indexOf(endMarker, start);
    if (start !== -1 && end !== -1) {
      currentMarkup = currentMarkup.slice(0, start) + currentMarkup.slice(end);
    }
  };
  removeSection("<!-- ================= STATS", "<!-- ================= DIRECTIONS");
  removeSection("<!-- ================= SUCCESS STORIES", "<!-- ================= PORTFOLIO TIMELINE");
  removeSection("<!-- ================= PARTNERS", "<!-- ================= SECURITY");

  currentMarkup = currentMarkup.replace(
    /\n  <div data-hero-media[\s\S]*?\n  <div data-parallax=/,
    "\n  <div data-parallax=",
  );
  currentMarkup = currentMarkup.replace(
    /(<section id="top"[^>]*>)/,
    `$1\n  ${HERO_PICTURE_MARKUP}`,
  );

  const preloaderStart = currentMarkup.indexOf("\n<div data-preloader");
  if (preloaderStart !== -1) {
    currentMarkup = currentMarkup.slice(0, preloaderStart);
  }

  return currentMarkup;
}

/**
 * Renders the ported design markup and runs its interactive script AFTER
 * hydration (useEffect), so React's hydration doesn't undo the script's DOM
 * mutations (preloader curtain, parallax, reveals, etc.). The live opportunity
 * count is substituted into the "N возможностей открыто сейчас" line.
 */
export function Landing({ oppCount }: { oppCount: number | null }) {
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return; // guard against React StrictMode's double effect invoke
    ran.current = true;
    initLanding();
  }, []);

  const markup = landingMarkupWithCurrentOffer(LANDING_MARKUP);
  const html = oppCount === null
    ? markup.replace(/<span data-i18n="hero.live">[\s\S]*?<\/span>/, "")
    : markup.replaceAll("__OPP_COUNT__", String(oppCount));
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
