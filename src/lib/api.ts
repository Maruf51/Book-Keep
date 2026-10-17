import { z, ZodError } from "zod";

/**
 * Domain error carrying an API error `code`, a human message and an HTTP
 * status. Thrown by lib helpers (e.g. `lib/booking.ts`) and unwrapped by
 * `handleRouteError` into the shared `{ error: { code, message } }` envelope.
 */
export class HttpError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "HttpError";
    this.code = code;
    this.status = status;
  }
}

export function jsonError(code: string, message: string, status = 400) {
  return Response.json(
    {
      error: { code, message },
    },
    { status }
  );
}

export async function parseJsonBody<T>(request: Request, schema?: z.ZodType<T>) {
  const text = await request.text();

  if (!text) {
    const emptyValue = schema ? schema.parse({}) : ({} as T);
    return emptyValue;
  }

  const json = JSON.parse(text) as unknown;
  if (schema) {
    return schema.parse(json) as T;
  }

  return json as T;
}

export function handleMongoError(error: unknown) {
  const mongoError = error as { code?: number; name?: string; message?: string };

  if (mongoError.code === 11000) {
    return jsonError("SLOT_TAKEN", "The selected slot is no longer available.", 409);
  }

  return jsonError("INTERNAL", mongoError.message ?? "An unexpected error occurred.", 500);
}

/**
 * Central error handler for route handlers. Maps the typed errors thrown by
 * `requireRole` (UNAUTHORIZED/FORBIDDEN), Zod validation errors, Mongo
 * duplicate-key errors, and ObjectId cast errors onto the shared
 * `{ error: { code, message } }` envelope.
 */
export function handleRouteError(
  error: unknown,
  opts?: { duplicateCode?: string; duplicateMessage?: string }
): Response {
  const message = error instanceof Error ? error.message : "";

  if (message === "UNAUTHORIZED") {
    return jsonError("UNAUTHORIZED", "You must be signed in to do that.", 401);
  }

  if (message === "FORBIDDEN") {
    return jsonError("FORBIDDEN", "You don't have permission to do that.", 403);
  }

  if (error instanceof HttpError) {
    return jsonError(error.code, error.message, error.status);
  }

  if (error instanceof ZodError) {
    const first = error.issues[0];
    return jsonError("VALIDATION_ERROR", first?.message ?? "Invalid request data.", 400);
  }

  const named = error as { code?: number; name?: string };

  if (named.code === 11000) {
    return jsonError(
      opts?.duplicateCode ?? "CONFLICT",
      opts?.duplicateMessage ?? "That value is already in use.",
      409
    );
  }

  // Invalid ObjectId in a route param — treat as not found, not a crash.
  if (named.name === "CastError") {
    return jsonError("NOT_FOUND", "Resource not found.", 404);
  }

  console.error("[api] unexpected error", error);
  return jsonError("INTERNAL", "An unexpected error occurred.", 500);
}
