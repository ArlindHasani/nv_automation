export type ExploreLogLevel = "info" | "warn" | "error" | "success";

export interface ExploreStreamLog {
  type: "log";
  level: ExploreLogLevel;
  message: string;
  ts: string;
}

export interface ExploreStreamDone {
  type: "done";
  discovered: number;
  added: string[];
  updated: string[];
  conflicts: unknown[];
  status: "completed" | "partial";
  blockers: Array<{
    question: string;
    type: string;
    reason: string;
    screenshot?: string;
  }>;
  steps: number;
  discoveredNames: string[];
  exploreRun: unknown;
}

export interface ExploreStreamError {
  type: "error";
  error: string;
}

export type ExploreStreamEvent =
  | ExploreStreamLog
  | ExploreStreamDone
  | ExploreStreamError;

export function parseExploreStreamLine(line: string): ExploreStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as ExploreStreamEvent;
  } catch {
    return null;
  }
}

export async function consumeExploreStream(
  response: Response,
  onEvent: (event: ExploreStreamEvent) => void,
  options?: { signal?: AbortSignal },
): Promise<void> {
  if (!response.body) {
    throw new Error("No response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    if (options?.signal?.aborted) {
      await reader.cancel();
      break;
    }
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const event = parseExploreStreamLine(line);
      if (event) onEvent(event);
    }
  }

  if (buffer.trim()) {
    const event = parseExploreStreamLine(buffer);
    if (event) onEvent(event);
  }
}
