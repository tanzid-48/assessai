const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

// Helper for all calls to the Express server.
// credentials: "include" sends the login cookie with every request.
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  // For file uploads the browser must set the Content-Type itself (it adds the multipart boundary)
  const isForm =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: isForm
      ? options.headers
      : { "Content-Type": "application/json", ...(options.headers || {}) },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data as T;
}
