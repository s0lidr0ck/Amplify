export async function streamNdjson<T>(
  response: Response,
  onMessage: (payload: T) => void
) {
  if (!response.ok) {
    const text = await response.text();
    try {
      const json = JSON.parse(text) as { detail?: string };
      throw new Error(json.detail ?? `API error ${response.status}`);
    } catch (parseError) {
      if (parseError instanceof SyntaxError) {
        throw new Error(`API error ${response.status}: ${text}`);
      }
      throw parseError;
    }
  }

  if (!response.body) {
    throw new Error("No response stream returned.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      onMessage(JSON.parse(line) as T);
    }
  }

  const tail = buffer.trim();
  if (tail) {
    onMessage(JSON.parse(tail) as T);
  }
}
