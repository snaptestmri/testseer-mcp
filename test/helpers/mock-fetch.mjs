/** Shared fetch mock keyed by "METHOD URL" for MCP handler unit tests. */
export const responses = new Map();

export function mockFetch(url, init) {
  const key = `${init?.method ?? "GET"} ${url}`;
  const handler = responses.get(key);
  if (!handler) {
    return Promise.reject(new Error(`Unmocked fetch: ${key}`));
  }
  return Promise.resolve(handler(init));
}

export function resetMocks() {
  responses.clear();
}

export function mockJson(method, url, data, { ok = true, status = 200 } = {}) {
  responses.set(`${method} ${url}`, () => ({
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: async () => data,
  }));
}
