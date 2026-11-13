export type OpenRouterPayload = {
  error?: { message?: string };
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  usage?: { cost?: number };
};

export type OpenRouterThrow = (status: number, message: string) => Error;

export type OpenRouterJsonChatInput = {
  apiKey: string;
  model: string;
  schemaName: string;
  schema: Record<string, unknown>;
  system: string;
  user: string | unknown[];
  maxTokens?: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  trimmedJsonMessage?: string;
};

export async function openRouterJsonChat(
  input: OpenRouterJsonChatInput,
  throwHttp: OpenRouterThrow,
): Promise<{ parsed: unknown; finishReason?: string; costUsd: number | null }> {
  const call = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? 55_000;
  let response: Response;
  try {
    response = await call("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Cook & Eat",
      },
      body: JSON.stringify({
        model: input.model,
        max_tokens: input.maxTokens ?? 8000,
        reasoning: { effort: "low" },
        usage: { include: true },
        response_format: {
          type: "json_schema",
          json_schema: { name: input.schemaName, strict: true, schema: input.schema },
        },
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw throwHttp(504, timedOut ? "Модель відповідає надто довго" : "Не вдалося зв'язатися з OpenRouter");
  }

  const payload = (await response.json().catch(() => null)) as OpenRouterPayload | null;
  if (!response.ok || !payload || payload.error) {
    const reason = payload?.error?.message ?? `HTTP ${response.status}`;
    throw throwHttp(502, `OpenRouter (${input.model}): ${reason}`);
  }
  const text = payload.choices?.[0]?.message?.content;
  if (!text) throw throwHttp(502, "Модель повернула порожню відповідь");
  const finishReason = payload.choices?.[0]?.finish_reason;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw throwHttp(
      502,
      finishReason === "length"
        ? (input.trimmedJsonMessage ?? "Відповідь обрізано — занадто багато даних")
        : "Модель повернула некоректні дані",
    );
  }
  const cost = payload.usage?.cost;
  return {
    parsed,
    finishReason,
    costUsd: typeof cost === "number" ? cost : null,
  };
}
