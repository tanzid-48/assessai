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

// Sample courses from the CSE department course list.
// assigned: true gives the course to Teacher One.
const COURSES = [
  {
    code: "CSE 4205",
    title: "Digital Image Processing",
    credits: 3,
    assigned: true,
  },
  {
    code: "CSE 4105",
    title: "Artificial Intelligence",
    credits: 3,
    assigned: true,
  },
  { code: "CSE 4203", title: "Machine Learning", credits: 3, assigned: false },
  {
    code: "CSE 2103",
    title: "Database Management System",
    credits: 3,
    assigned: false,
  },
  { code: "CSE 3103", title: "Operating Systems", credits: 3, assigned: false },
  {
    code: "CSE 4123",
    title: "Simulation and Modeling",
    credits: 3,
    assigned: true,
  },
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

  // Create the sample courses. Running the seed again never duplicates them.
  const teacher = await db
    .collection("user")
    .findOne({ email: "teacher@pub.edu" });
  const courses = db.collection("courses");

  for (const c of COURSES) {
    const base = { title: c.title, credits: c.credits, createdAt: new Date() };

    await courses.updateOne(
      { code: c.code },
      c.assigned && teacher
        ? { $set: { teacherId: teacher._id }, $setOnInsert: base }
        : { $setOnInsert: { ...base, teacherId: null } },
      { upsert: true },
    );
    console.log(`Course ${c.code} ready`);
  }

  console.log("Seed finished");
  await client.close();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
