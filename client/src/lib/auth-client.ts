import { createAuthClient } from "better-auth/react";

// The auth server is the Express app, not Next.js
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
});