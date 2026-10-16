import mongoose from "mongoose";

declare global {
  var __bookkeep_mongoose_cache:
    | {
        conn: typeof mongoose | null;
        promise: Promise<typeof mongoose> | null;
      }
    | undefined;
}

const globalWithMongo = globalThis as typeof globalThis & {
  __bookkeep_mongoose_cache?: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
  };
};

export async function connectToDatabase() {
  if (globalWithMongo.__bookkeep_mongoose_cache?.conn) {
    return globalWithMongo.__bookkeep_mongoose_cache.conn;
  }

  if (!globalWithMongo.__bookkeep_mongoose_cache) {
    const uri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/bookkeep-dev";

    globalWithMongo.__bookkeep_mongoose_cache = {
      conn: null,
      promise: mongoose.connect(uri).then((connection) => connection),
    };
  }

  try {
    globalWithMongo.__bookkeep_mongoose_cache.conn = await globalWithMongo.__bookkeep_mongoose_cache.promise;
  } catch (error) {
    globalWithMongo.__bookkeep_mongoose_cache = undefined;
    throw error;
  }

  return globalWithMongo.__bookkeep_mongoose_cache.conn;
}
