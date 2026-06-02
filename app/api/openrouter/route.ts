/**
 * Proxy seguro para llamadas a IA (OpenRouter).
 *
 * Mantiene OPENROUTER_API_KEY en el servidor — nunca llega al navegador.
 * El frontend (chat) hace POST aquí con los mensajes; este handler inyecta
 * el System Prompt experto y delega en el cliente robusto de lib/openrouter.
 *
 * Se ejecuta como Netlify Function (Node.js).
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  chatCompletion,
  ADVERTISING_SYSTEM_PROMPT,
  OpenRouterError,
  MODELS,
  hasImageContent,
  type ChatMessage,
} from '@/lib/openrouter';

export const runtime = 'nodejs';
export const maxDuration = 60; // segundos — límite de Netlify Functions.

interface RequestBody {
  messages: ChatMessage[];
  model?: string;
  fast?: boolean;
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json(
      { error: 'Se requiere un array "messages" no vacío.' },
      { status: 400 },
    );
  }

  // Inyectar el System Prompt si el cliente no lo incluyó.
  const hasSystem = body.messages.some((m) => m.role === 'system');
  const messages: ChatMessage[] = hasSystem
    ? body.messages
    : [{ role: 'system', content: ADVERTISING_SYSTEM_PROMPT }, ...body.messages];

  // Con imágenes de referencia se requiere un modelo con visión: forzamos el
  // modelo alto (el rápido suele ser solo-texto).
  const withImages = hasImageContent(messages);
  const model =
    body.model ??
    (withImages || !body.fast ? MODELS.COPY_HIGH : MODELS.COPY_FAST);

  try {
    const result = await chatCompletion({
      model,
      messages,
      signal: req.signal,
    });
    return NextResponse.json({
      content: result.content,
      model: result.model,
      usage: result.usage,
    });
  } catch (err) {
    if (err instanceof OpenRouterError) {
      const status = err.status ?? 502;
      return NextResponse.json({ error: err.message }, { status });
    }
    return NextResponse.json(
      { error: 'Error inesperado en el proxy de IA.' },
      { status: 500 },
    );
  }
}
