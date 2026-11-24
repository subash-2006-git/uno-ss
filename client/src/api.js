// Thin fetch wrapper for the account/admin endpoints. Always resolves to { ok, status, ...body }.
export async function api(path, { method = 'GET', body, token } = {}) {
  try {
    const res = await fetch(path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, httpStatus: res.status, ...data };
  } catch {
    return { ok: false, error: 'Cannot reach the server' };
  }
}
