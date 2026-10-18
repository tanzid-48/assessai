import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;

// Stop early if the database connection string is missing
if (!MONGODB_URI) {
  console.error("MONGODB_URI is missing in the .env file");
  process.exit(1);
}

export const client = new MongoClient(MONGODB_URI);

// The database name is taken from the connection string.
// Creating the handle does not connect yet; connectDB() does that.
export const db = client.db();

// Connect once when the server starts
export async function connectDB() {
  await client.connect();

  // Ping the deployment to confirm the connection works
  await db.command({ ping: 1 });
  console.log("Pinged your deployment. You successfully connected to MongoDB!");
}

// Use this in any file to get the database, e.g. getDB().collection("courses")
export function getDB() {
  return db;
}
