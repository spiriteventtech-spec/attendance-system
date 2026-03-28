/**
 * Centralized utility for handling image URLs in the admin dashboard.
 * Ensures consistent path handling and avoids broken links between API and static assets.
 */
export const getImageUrl = (path: string | null | undefined): string | undefined => {
  if (!path) return undefined;

  // If path is already an absolute URL, return it as is
  if (path.startsWith('http')) return path;

  // Get the base API URL from environment variables
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
  
  // Safely derive the static asset host (stripping /api if present)
  let staticBase = apiBaseUrl.endsWith('/api') ? apiBaseUrl.slice(0, -4) : apiBaseUrl;
  
  // Ensure no double slashes when joining
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const cleanBase = staticBase.endsWith('/') ? staticBase.slice(0, -1) : staticBase;

  // Fallback to origin for relative paths if no API base URL is set
  if (!cleanBase) return cleanPath;

  return `${cleanBase}${cleanPath}`;
};
