"use client";

/**
 * Fetch-based SSE connection. Unlike EventSource, this supports custom headers
 * (X-Account-Token) so we don't leak tokens via URL query parameters.
 *
 * Returns an abort function to close the connection.
 */
export function connectSSE(
  url: string,
  token: string,
  onMessage: (data: Record<string, unknown>) => void,
  onError?: (err: unknown) => void,
): () => void {
  const controller = new AbortController();

  (async () => {
    try {
      const response = await fetch(url, {
        headers: {
          "X-Account-Token": token,
          "Accept": "text/event-stream",
        },
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`SSE connection failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              onMessage(data as Record<string, unknown>);
            } catch { /* skip malformed */ }
          }
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        onError?.(err);
      }
    }
  })();

  return () => controller.abort();
}
