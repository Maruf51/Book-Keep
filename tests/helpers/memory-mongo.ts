import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import UserModel from "@/models/user";
import BusinessModel from "@/models/business";
import ServiceModel from "@/models/service";
import StaffModel from "@/models/staff";
import CustomerModel from "@/models/customer";
import BookingModel from "@/models/booking";
import InvoiceModel from "@/models/invoice";

let mongoServer: MongoMemoryServer | null = null;

declare global {
  var __bookkeep_mongoose_cache:
    | { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null }
    | undefined;
}

export async function startMemoryMongo() {
  if (mongoose.connection.readyState !== 0) {
    return;
  }

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri(), { dbName: "bookkeep-test" });

  // Build every schema index (incl. the unique multikey partial index on
  // bookings.slotKeys that enforces double-booking protection).
  await Promise.all([
    UserModel.syncIndexes(),
    BusinessModel.syncIndexes(),
    ServiceModel.syncIndexes(),
    StaffModel.syncIndexes(),
    CustomerModel.syncIndexes(),
    BookingModel.syncIndexes(),
    InvoiceModel.syncIndexes(),
  ]);

  // Prime the connectToDatabase() cache so route handlers reuse this
  // in-memory connection instead of dialing MONGODB_URI.
  globalThis.__bookkeep_mongoose_cache = {
    conn: mongoose,
    promise: Promise.resolve(mongoose),
  };
}

export async function stopMemoryMongo() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  globalThis.__bookkeep_mongoose_cache = undefined;

  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }
}
