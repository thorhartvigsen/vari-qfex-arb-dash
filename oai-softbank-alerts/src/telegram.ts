import { telegramBotToken } from "./config.ts";

export async function telegramSend(chatId: string, text: string): Promise<void> {
  const token = telegramBotToken();
  if (!token) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN not set — skip:", text.slice(0, 160));
    return;
  }
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`telegram ${response.status}: ${body.slice(0, 300)}`);
  }
}

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
