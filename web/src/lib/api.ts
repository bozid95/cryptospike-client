/**
 * Helper untuk melakukan HTTP fetch dengan otomatis menyematkan JWT Token
 * dan menangani sesi kadaluarsa (HTTP 401 Unauthorized)
 */
export async function authFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = localStorage.getItem("cryptospike_jwt");

  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Jika token tidak valid atau expired (401), otomatis bersihkan auth dan reload
  if (response.status === 401) {
    localStorage.removeItem("cryptospike_auth");
    localStorage.removeItem("cryptospike_jwt");
    localStorage.removeItem("cryptospike_user");
    window.location.reload();
  }

  return response;
}
