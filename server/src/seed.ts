import "dotenv/config";
import { auth } from "./auth";
import { client, db } from "./db";

// Demo accounts for every role. The password is for local demo only.
const PASSWORD = "Pass@1234";
const USERS = [
  { name: "Admin", email: "admin@pub.edu", role: "admin" },
  { name: "Teacher One", email: "teacher@pub.edu", role: "teacher" },
  { name: "Student One", email: "student@pub.edu", role: "student" },
];

async function main() {
  await client.connect();

  for (const u of USERS) {
    // Create the account through BetterAuth so the password is hashed properly
    try {
      await auth.api.signUpEmail({
        body: { name: u.name, email: u.email, password: PASSWORD },
      });
      console.log(`Created ${u.email}`);
    } catch {
      console.log(`${u.email} already exists, skipping sign-up`);
    }

    // Set the role directly in the database (clients can never do this)
    await db
      .collection("user")
      .updateOne({ email: u.email }, { $set: { role: u.role } });
  }

  console.log("Seed finished");
  await client.close();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
