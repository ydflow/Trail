import type { FinanceCapability, NewsItem } from '@finagent/core';
import { validateInput } from './validate.ts';
import { sanitizeNewsItem, sanitizeUntrustedText } from '../research/sanitize.ts';

/** Keep a stalled provider call from holding the Pi agent turn forever. */
export const CAPABILITY_TOOL_TIMEOUT_MS = 20_000;

/** Shape the Pi Agent runtime expects for a registered tool. */
export interface CapabilityTool {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute(
    toolCallId: string,
    params: unknown,
    signal: AbortSignal
  ): Promise<{
    content: Array<{ type: 'text'; text: string }>;
    details?: unknown;
    provenance?: unknown;
    evidence?: unknown;
  }>;
}

/**
 * Generate Pi tool objects from capabilities. Each tool's text is the manifest
 * `summary` plus a `DATA: <json>` block, so the agent reads facts while product
 * workflows use the structured `data` from the registry directly.
 */
export function createCapabilityTools(
  capabilities: FinanceCapability[],
  options: { timeoutMs?: number } = {}
): CapabilityTool[] {
  return capabilities.map((cap) => ({
    name: cap.toolName,
    label: cap.name,
    description: cap.description,
    parameters: cap.inputSchema,
    async execute(toolCallId, rawParams, signal) {
      const input = validateInput(cap.inputSchema, rawParams);
      if (signal.aborted) throw signal.reason ?? new Error('Tool execution cancelled.');
      try {
        const result = await runCapabilityWithTimeout(cap, input, signal, options.timeoutMs ?? CAPABILITY_TOOL_TIMEOUT_MS);
        // Security (defense in depth): external-text payloads such as news are
        // sanitized again at the LLM boundary. The capability manifest already
        // sanitizes at ingestion; this wrapper covers any provider that does not.
        const data = isNewsItemList(result.data) ? result.data.map(sanitizeNewsItem) : result.data;
        const summary = result.summary ? sanitizeUntrustedText(result.summary).text : undefined;
        const json = JSON.stringify(data);
        const base = summary ? `${summary}\n\nDATA: ${json}` : `DATA: ${json}`;
        // surface the tool-call id so the model can cite this exact origin.
        const text = `${base}\n\nEVIDENCE: ${toolCallId}`;
        return {
          content: [{ type: 'text', text }],
          details: data,
          provenance: result.provenance,
          evidence: result.evidence,
        };
      } catch (error) {
        if (signal.aborted) throw error;
        // A missing account scope, unavailable provider, or stalled tool is a
        // data gap. Return it as tool content so Pi can continue with the other
        // tools and the final answer can disclose the missing dimension.
        return unavailableToolResult(cap, error);
      }
    },
  }));
}

async function runCapabilityWithTimeout<TInput, TOutput>(
  cap: FinanceCapability<TInput, TOutput>,
  input: TInput,
  parentSignal: AbortSignal,
  timeoutMs: number
) {
  const controller = new AbortController();
  let onAbort: (() => void) | undefined;
  const abort = () => controller.abort(parentSignal.reason);
  parentSignal.addEventListener('abort', abort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (parentSignal.aborted) abort();
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(controller.signal.reason ?? new Error('Tool execution cancelled.'));
      if (controller.signal.aborted) onAbort();
      else controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    timer = setTimeout(() => {
      controller.abort(Object.assign(new Error(`Capability ${cap.id} timed out after ${timeoutMs}ms.`), {
        code: 'CAPABILITY_TIMEOUT',
      }));
    }, timeoutMs);
    controller.signal.throwIfAborted();
    return await Promise.race([cap.execute(input, { signal: controller.signal }), aborted]);
  } finally {
    clearTimeout(timer);
    if (onAbort) controller.signal.removeEventListener('abort', onAbort);
    parentSignal.removeEventListener('abort', abort);
  }
}

function unavailableToolResult(cap: FinanceCapability, error: unknown) {
  const code = readErrorCode(error) ?? 'UNAVAILABLE';
  const message = readErrorMessage(error) ?? 'The data source could not be reached.';
  return {
    content: [{
      type: 'text' as const,
      text: `[TOOL_UNAVAILABLE] ${cap.name} was skipped (${code}): ${message}. Continue with the remaining tools and mark this data dimension unavailable.`,
    }],
    details: { status: 'unavailable', capabilityId: cap.id, code, message },
  };
}

function readErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function readErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : undefined;
}

/** Structural check for news-shaped payloads (title/summary/url items). */
function isNewsItemList(data: unknown): data is NewsItem[] {
  return Array.isArray(data)
    && data.length > 0
    && data.every((item) => {
      if (!item || typeof item !== 'object') return false;
      const record = item as Record<string, unknown>;
      return typeof record.title === 'string' && typeof record.summary === 'string' && typeof record.url === 'string';
    });
}
