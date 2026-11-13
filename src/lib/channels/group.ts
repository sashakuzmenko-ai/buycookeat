import { quickAsk } from "./copy.ts";

export function shouldAnswerText(input: {
  chatType: string;
  text: string;
  mentionsBot: boolean;
  repliesToBot: boolean;
}): boolean {
  if (input.chatType === "private") return true;
  if (input.chatType !== "group" && input.chatType !== "supergroup") return false;
  if (quickAsk(input.text) !== null) return true;
  if (input.text.trim().startsWith("/")) return true;
  if (input.mentionsBot) return true;
  if (input.repliesToBot) return true;
  return false;
}
