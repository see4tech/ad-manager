/**
 * Cliente Node.js para OpenRouter.
 *
 * Diseñado para ejecutarse dentro de Netlify Functions (entorno Node serverless).
 * Usa la API Fetch estándar contra el endpoint compatible con OpenAI de OpenRouter,
 * con gestión nativa de errores, timeout (AbortController) y reintentos con backoff
 * ante cuellos de botella de red o rate limiting.
 *
 * Variable de entorno mandatoria: OPENROUTER_API_KEY
 */

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/** Modelos recomendados por la especificación. */
export const MODELS = {
  /** Alta complejidad de marketing / copys de conversión. */
  COPY_HIGH: 'anthropic/claude-3.5-sonnet',
  /** Flujos rápidos y de menor coste. */
  COPY_FAST: 'meta-llama/llama-3-70b-instruct',
  /** Generación de imágenes (salida multimodal). Configurable por env. */
  IMAGE: process.env.OPENROUTER_IMAGE_MODEL || 'google/gemini-2.5-flash-image',
} as const;

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatCompletionOptions {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Timeout por intento, en milisegundos. Default 60s (bajo el límite de Netlify). */
  timeoutMs?: number;
  /** Número de reintentos ante errores transitorios. Default 2. */
  retries?: number;
  /** Señal externa para cancelar (ej: cliente desconectado). */
  signal?: AbortSignal;
}

export interface ChatCompletionResult {
  content: string;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  raw: unknown;
}

/** Error tipado para fallos de la API de OpenRouter. */
export class OpenRouterError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryable: boolean = false,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'OpenRouterError';
  }
}

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new OpenRouterError(
      'Falta la variable de entorno OPENROUTER_API_KEY.',
      undefined,
      false,
    );
  }
  return key;
}

/** Status HTTP que justifican un reintento. */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * System Prompt experto en marcos de conversión publicitaria (AIDA, PAS).
 * Inyectar al inicio de las conversaciones de generación de copys.
 */
export const ADVERTISING_SYSTEM_PROMPT = `Eres un copywriter publicitario experto en marketing de conversión.
Dominas los marcos AIDA (Atención, Interés, Deseo, Acción) y PAS (Problema, Agitación, Solución).
Escribes copys persuasivos, claros y adaptados a la plataforma destino (Instagram, Facebook, LinkedIn).
Cuando se te indique un marco, estructura el texto siguiéndolo explícitamente.
Responde siempre en el idioma del usuario y prioriza un call-to-action fuerte.`;

/**
 * Petición de chat completion a OpenRouter con reintentos y timeout.
 *
 * @throws {OpenRouterError} ante fallos no recuperables o agotamiento de reintentos.
 */
export async function chatCompletion(
  options: ChatCompletionOptions,
): Promise<ChatCompletionResult> {
  const {
    model = MODELS.COPY_HIGH,
    messages,
    temperature = 0.7,
    maxTokens,
    timeoutMs = 60_000,
    retries = 2,
    signal,
  } = options;

  const apiKey = getApiKey();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  const body = JSON.stringify({
    model,
    messages,
    temperature,
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
  });

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    // Timeout por intento, combinado con la señal externa si existe.
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
    const composedSignal = signal
      ? anySignal([signal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers,
        body,
        signal: composedSignal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        const retryable = isRetryableStatus(res.status);
        const err = new OpenRouterError(
          `OpenRouter respondió ${res.status}: ${errText}`,
          res.status,
          retryable,
        );
        if (retryable && attempt < retries) {
          lastError = err;
          await sleep(backoffDelay(attempt, res.headers.get('retry-after')));
          continue;
        }
        throw err;
      }

      const data = (await res.json()) as any;
      const content: string = data?.choices?.[0]?.message?.content ?? '';

      return {
        content,
        model: data?.model ?? model,
        usage: data?.usage,
        raw: data,
      };
    } catch (err) {
      // Errores de red / abort: reintentar si quedan intentos.
      const isAbort = err instanceof Error && err.name === 'AbortError';
      const wasExternalAbort = isAbort && signal?.aborted;

      if (wasExternalAbort) {
        throw new OpenRouterError('Petición cancelada por el cliente.', undefined, false, err);
      }

      lastError = err;
      const isLastAttempt = attempt >= retries;
      if (err instanceof OpenRouterError && !err.retryable) throw err;
      if (isLastAttempt) {
        throw new OpenRouterError(
          isAbort
            ? `Timeout tras ${timeoutMs}ms (intento ${attempt + 1}/${retries + 1}).`
            : `Fallo de red al contactar OpenRouter: ${(err as Error).message}`,
          undefined,
          false,
          err,
        );
      }
      await sleep(backoffDelay(attempt, null));
    } finally {
      clearTimeout(timer);
    }
  }

  // No alcanzable, pero satisface el control de flujo del compilador.
  throw new OpenRouterError(
    'Reintentos agotados contra OpenRouter.',
    undefined,
    false,
    lastError,
  );
}

export interface GeneratedImage {
  /** Data URL base64 (ej: data:image/png;base64,...). */
  dataUrl: string;
  mimeType: string;
  base64: string;
}

export interface GenerateImageOptions {
  prompt: string;
  model?: string;
  aspectRatio?: '1:1' | '2:3' | '3:2';
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Genera una imagen vía el endpoint de chat completions de OpenRouter
 * (modalities: ['image','text']). Devuelve la imagen como data URL base64.
 *
 * @throws {OpenRouterError}
 */
export async function generateImage(
  options: GenerateImageOptions,
): Promise<GeneratedImage> {
  const {
    prompt,
    model = MODELS.IMAGE,
    aspectRatio = '1:1',
    timeoutMs = 55_000,
    signal,
  } = options;

  const apiKey = getApiKey();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const composedSignal = signal
    ? anySignal([signal, controller.signal])
    : controller.signal;

  try {
    const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        modalities: ['image', 'text'],
        image_config: { aspect_ratio: aspectRatio },
      }),
      signal: composedSignal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new OpenRouterError(
        `OpenRouter (imagen) respondió ${res.status}: ${errText}`,
        res.status,
        isRetryableStatus(res.status),
      );
    }

    const data = (await res.json()) as any;
    const url: string | undefined =
      data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url) {
      throw new OpenRouterError(
        'La respuesta no contenía ninguna imagen.',
        undefined,
        false,
      );
    }

    const match = /^data:([^;]+);base64,(.+)$/s.exec(url);
    if (!match) {
      throw new OpenRouterError('Formato de imagen inesperado.', undefined, false);
    }
    return { dataUrl: url, mimeType: match[1], base64: match[2] };
  } catch (err) {
    if (err instanceof OpenRouterError) throw err;
    const isAbort = err instanceof Error && err.name === 'AbortError';
    throw new OpenRouterError(
      isAbort
        ? `Timeout de generación de imagen tras ${timeoutMs}ms.`
        : `Fallo de red en generación de imagen: ${(err as Error).message}`,
      undefined,
      false,
      err,
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Backoff exponencial con jitter; respeta Retry-After si está presente. */
function backoffDelay(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (!Number.isNaN(secs)) return secs * 1000;
  }
  const base = 500 * 2 ** attempt;
  const jitter = base * 0.25 * Math.random();
  return Math.min(base + jitter, 8_000);
}

/**
 * Combina varias AbortSignal en una sola (polyfill de AbortSignal.any,
 * por compatibilidad con runtimes de Node anteriores a 20.3).
 */
function anySignal(signals: AbortSignal[]): AbortSignal {
  if (typeof (AbortSignal as any).any === 'function') {
    return (AbortSignal as any).any(signals);
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  for (const s of signals) {
    if (s.aborted) {
      controller.abort();
      break;
    }
    s.addEventListener('abort', onAbort, { once: true });
  }
  return controller.signal;
}
