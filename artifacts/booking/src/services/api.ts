export const apiRequest = async (url: string, options?: RequestInit) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Something went wrong');
  }
  return response.json();
};