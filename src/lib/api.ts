import { z } from "zod";

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
