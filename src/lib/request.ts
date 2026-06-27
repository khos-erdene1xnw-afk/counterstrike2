export function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

export function userAgent(request: Request): string {
  return request.headers.get('user-agent') ?? 'unknown';
}
