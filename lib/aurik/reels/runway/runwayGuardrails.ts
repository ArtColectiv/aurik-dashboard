/* lib/aurik/reels/runway/runwayGuardrails.ts
 *
 * Runway guardrails:
 * - Safe request logging (no base64 dumps)
 * - Retry policy (only retryable statuses)
 * - Correlation IDs (requestId + runwayRequestId when available)
 * - Allows extra headers (ex: X-Runway-Version)
 */

import crypto from "node:crypto";

export type RunwayGuardrailsOptions = {
  requestId: string;

  // retry/backoff
  maxAttempts?: number; // default 2
  baseDelayMs?: number; // default 800
  maxDelayMs?: number; // default 3000
  timeoutMs?: number; // default 120_000

  // optional extra headers (ex: X-Runway-Version)
  extraHeaders?: Record<string, string>;

  logger?: (
    level: "info" | "warn" | "error",
    message: string,
    meta?: Record<string, unknown>
  ) => void;
};

export type RunwayJobRequest = {
  model: string;
  ratio?: string; // e.g. "720:1280"
  duration?: number; // seconds
  seed?: number;
  promptText?: string;
  // data URL: "data:image/png;base64,...."
  promptImage?: string;

  // any extra fields needed by provider (ex: position)
  extra?: Record<string, unknown>;
};

export type RunwayCallResult<T> =
  | {
      ok: true;
      status: number;
      runwayRequestId?: string;
      data: T;
    }
  | {
      ok: false;
      status: number; // 0 if network/abort
      retryable: boolean;
      runwayRequestId?: string;
      error: {
        message: string;
        details?: unknown;
      };
    };

function defaultLogger(
  level: "info" | "warn" | "error",
  message: string,
  meta?: Record<string, unknown>
) {
  // eslint-disable-next-line no-console
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(
    message,
    meta ?? ""
  );
}

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function truncate(s: string, max = 240): string {
  if (!s) return s;
  if (s.length <= max) return s;
  return s.slice(0, max) + `…(+${s.length - max} chars)`;
}

function parseDataUrlMeta(dataUrl: string): { mime?: string; prefix: string; chars: number; sha256: string } {
  const chars = dataUrl.length;
  const prefix = truncate(dataUrl, 64);
  const sha256 = sha256Hex(dataUrl);

  const m = /^data:([^;]+);base64,/i.exec(dataUrl);
  const mime = m?.[1];
  return { mime, prefix, chars, sha256 };
}

export function summarizeRunwayRequestBody(req: RunwayJobRequest): Record<string, unknown> {
  const promptText = req.promptText ? truncate(req.promptText, 320) : undefined;

  const promptImageMeta = req.promptImage
    ? (() => {
        const meta = parseDataUrlMeta(req.promptImage);
        return {
          mime: meta.mime ?? "unknown",
          chars: meta.chars,
          sha256: meta.sha256,
          prefix: meta.prefix,
        };
      })()
    : undefined;

  return {
    model: req.model,
    ratio: req.ratio,
    duration: req.duration,
    seed: req.seed,
    promptText,
    promptImage: promptImageMeta,
    extraKeys: req.extra ? Object.keys(req.extra).slice(0, 20) : undefined,
  };
}

export function isRetryableRunwayStatus(status: number): boolean {
  // Retry only on:
  // - 429 rate limit/throttle
  // - 5xx server errors
  // - 408 request timeout
  return status === 429 || status === 408 || (status >= 500 && status <= 599);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(ms: number): number {
  const spread = Math.floor(ms * 0.2);
  return ms + Math.floor((Math.random() * 2 - 1) * spread);
}

function computeBackoff(attemptIndex: number, baseDelayMs: number, maxDelayMs: number): number {
  const raw = baseDelayMs * Math.pow(2, attemptIndex);
  return Math.min(maxDelayMs, raw);
}

async function readJsonSafe(res: Response): Promise<unknown> {
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    const text = await res.text().catch(() => "");
    return text ? { nonJsonBody: truncate(text, 600) } : undefined;
  }
  return await res.json().catch(() => undefined);
}

function extractRunwayRequestId(res: Response, body: unknown): string | undefined {
  const headerCandidates = ["x-request-id", "x-runway-request-id", "runway-request-id", "x-correlation-id"];
  for (const h of headerCandidates) {
    const v = res.headers.get(h);
    if (v) return v;
  }

  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    const keys = ["requestId", "request_id", "runwayRequestId", "runway_request_id", "id"];
    for (const k of keys) {
      const v = b[k];
      if (typeof v === "string" && v.length >= 6) return v;
    }
  }
  return undefined;
}

export async function callRunwayWithGuardrails<T>(
  url: string,
  apiKey: string,
  requestBody: RunwayJobRequest,
  opts: RunwayGuardrailsOptions
): Promise<RunwayCallResult<T>> {
  const logger = opts.logger ?? defaultLogger;

  const maxAttempts = Math.max(1, opts.maxAttempts ?? 2);
  const baseDelayMs = Math.max(50, opts.baseDelayMs ?? 800);
  const maxDelayMs = Math.max(baseDelayMs, opts.maxDelayMs ?? 3000);
  const timeoutMs = Math.max(5_000, opts.timeoutMs ?? 120_000);

  const body: Record<string, unknown> = {
    model: requestBody.model,
    ratio: requestBody.ratio,
    duration: requestBody.duration,
    seed: requestBody.seed,
    promptText: requestBody.promptText,
    promptImage: requestBody.promptImage,
    ...(requestBody.extra ?? {}),
  };

  const safeSummary = summarizeRunwayRequestBody(requestBody);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptIndex = attempt - 1;
    const startedAt = Date.now();

    logger("info", `[AURIK][RUNWAY] request attempt=${attempt}/${maxAttempts} requestId=${opts.requestId}`, safeSummary);

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          "x-request-id": opts.requestId,
          ...(opts.extraHeaders ?? {}),
        },
        body: JSON.stringify(body),
        signal: ac.signal,
      });

      clearTimeout(t);

      const status = res.status;
      const parsed = await readJsonSafe(res);
      const runwayRequestId = extractRunwayRequestId(res, parsed);

      if (res.ok) {
        const ms = Date.now() - startedAt;
        logger("info", `[AURIK][RUNWAY] ok status=${status} ms=${ms} requestId=${opts.requestId}`, { runwayRequestId });
        return { ok: true, status, runwayRequestId, data: parsed as T };
      }

      const retryable = isRetryableRunwayStatus(status);
      const ms = Date.now() - startedAt;

      logger(
        retryable ? "warn" : "error",
        `[AURIK][RUNWAY] fail status=${status} retryable=${retryable} ms=${ms} requestId=${opts.requestId}`,
        {
          runwayRequestId,
          safeRequest: safeSummary,
          runwayError: parsed,
        }
      );

      if (!retryable || attempt === maxAttempts) {
        return {
          ok: false,
          status,
          retryable,
          runwayRequestId,
          error: {
            message: `Runway request failed (status ${status})`,
            details: parsed,
          },
        };
      }

      const backoff = jitter(computeBackoff(attemptIndex, baseDelayMs, maxDelayMs));
      await sleep(backoff);
      continue;
    } catch (e: unknown) {
      clearTimeout(t);

      const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "unknown error";
      const isAbort = msg.toLowerCase().includes("aborted") || msg.toLowerCase().includes("abort");

      logger(
        "warn",
        `[AURIK][RUNWAY] network_error retryable=true aborted=${isAbort} attempt=${attempt}/${maxAttempts} requestId=${opts.requestId}`,
        { safeRequest: safeSummary, error: truncate(msg, 500) }
      );

      if (attempt === maxAttempts) {
        return {
          ok: false,
          status: 0,
          retryable: true,
          error: { message: `Runway network error: ${msg}` },
        };
      }

      const backoff = jitter(computeBackoff(attemptIndex, baseDelayMs, maxDelayMs));
      await sleep(backoff);
      continue;
    }
  }

  return {
    ok: false,
    status: 0,
    retryable: false,
    error: { message: "Runway call failed unexpectedly" },
  };
}
