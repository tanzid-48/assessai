import { MongoClient, type Db } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;

// Stop early if the database connection string is missing
if (!MONGODB_URI) {
  console.error("MONGODB_URI is missing in the .env file");
  process.exit(1);
}

export const client = new MongoClient(MONGODB_URI);
let db: Db;

// Connect once when the server starts
export async function connectDB(): Promise<Db> {
  await client.connect();
  db = client.db(); // database name is taken from the connection string

  // Ping the deployment to confirm the connection works
  await db.command({ ping: 1 });
  console.log("Pinged your deployment. You successfully connected to MongoDB!");
  return db;
}

// Use this in any file to get the database, e.g. getDB().collection("courses")
export function getDB(): Db {
  if (!db) throw new Error("Database is not connected yet");
  return db;
}
