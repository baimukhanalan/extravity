import assert from "node:assert/strict";
import test from "node:test";
import { fallbackChatsFromCollections } from "./chat-fallback.mjs";

test("fallback accepts both WhatsApp serialized ID formats without direct chats", () => {
  globalThis.window = {
    require: () => ({
      Chat: {
        getModelsArray: () => [
          { id: { _serialized: "a@g.us" }, name: "Group A" },
          { id: { $1: "b@g.us" }, name: "Group B" },
          { id: { $1: "person@c.us" }, name: "Direct" },
        ],
      },
      WAWebNewsletterCollection: {
        getModelsArray: () => [{ id: { $1: "news@newsletter" }, name: "Channel" }],
      },
    }),
  };
  try {
    assert.deepEqual(fallbackChatsFromCollections().rows.map((row) => row.id), [
      "a@g.us", "b@g.us", "news@newsletter",
    ]);
  } finally {
    delete globalThis.window;
  }
});
