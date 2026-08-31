export const apiRequest = async (url: string, options?: RequestInit) => {
  const response = await fetch(url, { credentials: 'include', ...options });
  if (!response.ok) {
    const contentType = response.headers.get('content-type') ?? '';
    const error = contentType.includes('application/json')
      ? await response.json()
      : { message: await response.text() };
    throw new Error(error.message || error.error || `Request failed (${response.status})`);
  }
  return response.json();
};
