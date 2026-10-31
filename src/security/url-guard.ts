import { ApiError } from '../errors.js';

const rejected = (reason: string) => new ApiError(400, 'url_not_allowed', reason);

export function assertOutboundUrlAllowed(raw: string, allowedOrigins: readonly string[]): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw rejected('URL is not valid');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw rejected('Only http and https URLs are allowed');
  if (url.username || url.password) throw rejected('Credentials in URLs are not allowed');
  if (!allowedOrigins.includes(url.origin)) throw rejected('Destination is not on the allowlist');
  return url;
}
