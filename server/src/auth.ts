import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { db } from "./db";

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

export const auth = betterAuth({
  database: mongodbAdapter(db),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,

  // Only the Next.js client is allowed to call the auth routes
  trustedOrigins: [CLIENT_URL],

  // Email and password login
  emailAndPassword: { enabled: true },

  // Google login. The callback URL registered in Google Cloud is
  // http://localhost:5000/api/auth/callback/google
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },

  user: {
    additionalFields: {
      // Role is stored on the user. input: false means a client can NEVER
      // set it during sign-up, so nobody can register themselves as admin.
      // Users created through Google also get the default role "student".
      role: {
        type: "string",
        required: false,
        defaultValue: "student",
        input: false,
      },
    },
  },
});
