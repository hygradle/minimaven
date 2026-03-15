export function authorize(request: Request, env: Env): Response | null {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Bearer realm="minimaven"' },
    });
  }

  const token = header.slice(7);
  if (token !== env.PUBLISH_TOKEN) {
    return new Response("Forbidden", { status: 403 });
  }

  return null;
}
