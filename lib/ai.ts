import "server-only";

/**
 * AI text generation for application help. Uses Anthropic when ANTHROPIC_API_KEY
 * is set; otherwise a deterministic, safe template (clearly labelled mock).
 *
 * Hard rule (both modes): NEVER invent achievements or experience. Only rephrase
 * and structure facts the student provided.
 */

export type PromptType =
  | "motivation_letter"
  | "cv_adapt"
  | "shorten"
  | "checklist"
  | "interview_prep"
  | "essay_feedback";

const SYSTEM = `Ты помощник для подготовки заявок школьника. Строгие правила:
- НИКОГДА не выдумывай достижения, опыт, награды или факты. Используй только то, что дал пользователь.
- Не гарантируй победу или поступление.
- Пиши ясно, по делу, уважительно. Язык — как во вводных данных (обычно русский).`;

const MODEL = "claude-sonnet-5";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const KIMI_MODEL = process.env.KIMI_MODEL || "kimi-k2.6";
const KIMI_BASE_URL = process.env.KIMI_BASE_URL || "https://api.moonshot.ai/v1";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";

export type AiResult = { output: string; model: string; tokenUsage: number; safetyStatus: string };

// Shared task instructions, used by whichever provider is configured.
const TASKS: Record<PromptType, string> = {
  motivation_letter: "Составь черновик мотивационного письма из данных ниже. Только предоставленные факты.",
  cv_adapt: "Составь маркированные пункты CV из данных ниже. Только предоставленные факты.",
  shorten: "Сократи текст ниже, сохранив смысл.",
  checklist: "Сформируй чек-лист подготовки заявки на основе данных ниже.",
  interview_prep: "Составь список вероятных вопросов интервью и краткие подсказки по данным ниже.",
  essay_feedback:
    "Дай конструктивную обратную связь по тексту эссе ниже: сильные стороны, слабые места и что усилить. " +
    "Не переписывай за автора и не добавляй фактов — только замечания по структуре, ясности и убедительности.",
};

/**
 * Groq via its OpenAI-compatible Chat Completions API. Same guardrails. Returns
 * null on any error so the caller falls back to the next provider or the mock.
 */
async function callGroq(promptType: PromptType, input: string): Promise<AiResult | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;

  try {
    const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: 1024,
        temperature: 0.4,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `${TASKS[promptType]}\n\n---\n${input}` },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const output = (data.choices?.[0]?.message?.content as string) ?? "";
    if (!output) return null;
    const usage = data.usage?.total_tokens ?? 0;
    return { output, model: GROQ_MODEL, tokenUsage: usage, safetyStatus: "ok" };
  } catch {
    return null;
  }
}

/**
 * Kimi (Moonshot AI) via its OpenAI-compatible Chat Completions API. Same
 * guardrails (system rules + task + input). Returns null on any error so the
 * caller falls back to the next provider or the deterministic mock.
 */
async function callKimi(promptType: PromptType, input: string): Promise<AiResult | null> {
  const key = process.env.KIMI_API_KEY;
  if (!key) return null;

  try {
    const res = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: KIMI_MODEL,
        max_tokens: 1024,
        temperature: 0.4,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `${TASKS[promptType]}\n\n---\n${input}` },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const output = (data.choices?.[0]?.message?.content as string) ?? "";
    if (!output) return null;
    const usage = data.usage?.total_tokens ?? 0;
    return { output, model: KIMI_MODEL, tokenUsage: usage, safetyStatus: "ok" };
  } catch {
    return null;
  }
}

/**
 * Google Gemini via the Generative Language API. Same guardrails as Anthropic
 * (system rules + task + input). Returns null on any error so the caller falls
 * back to Anthropic or the deterministic mock.
 */
async function callGemini(promptType: PromptType, input: string): Promise<AiResult | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: "user", parts: [{ text: `${TASKS[promptType]}\n\n---\n${input}` }] }],
          generationConfig: { maxOutputTokens: 1024, temperature: 0.4 },
        }),
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const output = (data.candidates?.[0]?.content?.parts?.[0]?.text as string) ?? "";
    if (!output) return null;
    const usage = data.usageMetadata?.totalTokenCount ?? 0;
    return { output, model: GEMINI_MODEL, tokenUsage: usage, safetyStatus: "ok" };
  } catch {
    return null;
  }
}

async function callAnthropic(promptType: PromptType, input: string): Promise<AiResult | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const task = TASKS;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM,
        messages: [{ role: "user", content: `${task[promptType]}\n\n---\n${input}` }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const output = (data.content?.[0]?.text as string) ?? "";
    const usage = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
    return { output, model: MODEL, tokenUsage: usage, safetyStatus: "ok" };
  } catch {
    return null;
  }
}

function mockGenerate(promptType: PromptType, input: string): AiResult {
  const facts = input.split("\n").map((l) => l.trim()).filter(Boolean);
  let output: string;
  switch (promptType) {
    case "motivation_letter":
      output =
        `Уважаемый организатор,\n\n` +
        `Меня заинтересовала эта возможность, и я хочу принять в ней участие. ` +
        `Ниже — то, что я могу предложить:\n` +
        facts.map((f) => `— ${f}`).join("\n") +
        `\n\nЯ готов(а) вложить силы и время в подготовку. Спасибо за рассмотрение моей заявки.\n\nС уважением.`;
      break;
    case "cv_adapt":
      output = facts.map((f) => `• ${f}`).join("\n");
      break;
    case "shorten":
      output = input.length > 300 ? input.slice(0, 297).trimEnd() + "…" : input;
      break;
    case "checklist":
      output = ["Проверить требования", "Собрать документы", ...facts.map((f) => `Подготовить: ${f}`), "Финальная вычитка"]
        .map((s) => `☐ ${s}`)
        .join("\n");
      break;
    case "interview_prep":
      output = [
        "Почему вы хотите участвовать? — свяжите с вашими целями.",
        "Расскажите о релевантном опыте — используйте факты из профиля.",
        "Как вы работаете в команде? — приведите пример.",
        ...facts.map((f) => `Вопрос по теме «${f}» — подготовьте короткий ответ.`),
      ].join("\n");
      break;
    case "essay_feedback": {
      const words = input.trim().split(/\s+/).filter(Boolean).length;
      const notes = [
        "Замечания к эссе (демо-режим — включите ANTHROPIC_API_KEY для детального разбора):",
        `• Объём: ~${words} слов${words < 120 ? " — маловато, раскройте мотивацию подробнее." : "."}`,
        "• Структура: проверьте, что есть вступление, пример и вывод.",
        "• Конкретика: подкрепляйте тезисы фактами из своего опыта, а не общими словами.",
        "• Ясность: одна мысль — один абзац; уберите длинные вводные обороты.",
      ];
      output = notes.join("\n");
      break;
    }
  }
  return { output, model: "mock", tokenUsage: 0, safetyStatus: "ok" };
}

export async function generateText(promptType: PromptType, input: string): Promise<AiResult> {
  // Provider order: Groq (project default, currently the only one with live
  // quota), then Kimi, Gemini, Anthropic, then the deterministic mock. Each
  // returns null when unconfigured or on error.
  const real =
    (await callGroq(promptType, input)) ??
    (await callKimi(promptType, input)) ??
    (await callGemini(promptType, input)) ??
    (await callAnthropic(promptType, input));
  return real ?? mockGenerate(promptType, input);
}
