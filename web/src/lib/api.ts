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

  const response = await apiFetch(url, {
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

/**
 * fetch() yang selalu mengembalikan body JSON yang bisa di-parse.
 * Jika server lokal mati / proxy gagal (body kosong atau HTML, mis. HTTP 502),
 * respons diganti JSON { success: false, message } dengan status yang sama,
 * sehingga pemanggil `res.json()` tidak error "Unexpected end of JSON input".
 */
export async function apiFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch {
    return jsonResponse(503, serverDownMessage());
  }

  const text = await response.clone().text();
  try {
    if (text.trim()) {
      JSON.parse(text);
      return response;
    }
  } catch {
    // bukan JSON → ganti di bawah
  }

  const message =
    response.status >= 500 || !text.trim()
      ? serverDownMessage(response.status)
      : `Unexpected server response (HTTP ${response.status}).`;
  return jsonResponse(response.ok ? 502 : response.status, message);
}

function serverDownMessage(status?: number): string {
  return `Local server is not responding${status ? ` (HTTP ${status})` : ""}. Make sure the backend is running (cd server && npm start).`;
}

function jsonResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ success: false, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
