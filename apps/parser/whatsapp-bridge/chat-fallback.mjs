export function fallbackChatsFromCollections() {
  const found = window.require("WAWebCollections");
  const chatId = (item) => {
    const id = item?.id?._serialized || item?.id?.$1;
    return typeof id === "string" ? id : "";
  };
  const groups = (found.Chat?.getModelsArray() || [])
    .filter((item) => chatId(item).endsWith("@g.us"))
    .map((item) => ({ id: chatId(item), name: String(item.formattedTitle || item.name || ""), isGroup: true }));
  const channels = (found.WAWebNewsletterCollection?.getModelsArray() || [])
    .filter((item) => chatId(item).endsWith("@newsletter"))
    .map((item) => ({ id: chatId(item), name: String(item.formattedTitle || item.name || ""), isGroup: false }));
  return { rows: [...groups, ...channels] };
}
