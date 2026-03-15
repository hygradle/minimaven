import { extractVersion } from "../version";
import { generateMetadata } from "./metadata";

export async function handleGet(request: Request, env: Env): Promise<Response> {
  const key = new URL(request.url).pathname.slice(1);
  if (!key) {
    return new Response("Not Found", { status: 404 });
  }

  // GA-level maven-metadata.xml — generate dynamically from R2 listing
  if (key.endsWith("maven-metadata.xml") && extractVersion(key) === null) {
    const gaPrefix = key.replace("maven-metadata.xml", "");
    return generateMetadata(request, env, gaPrefix);
  }

  if (request.method === "HEAD") {
    const head = await env.ARTIFACTS.head(key);
    if (!head) {
      return new Response(null, { status: 404 });
    }
    return new Response(null, {
      status: 200,
      headers: objectHeaders(head),
    });
  }

  const object = await env.ARTIFACTS.get(key);
  if (!object) {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(object.body, {
    status: 200,
    headers: objectHeaders(object),
  });
}

function objectHeaders(obj: R2Object): Headers {
  const headers = new Headers();
  headers.set("Content-Length", obj.size.toString());
  headers.set("Content-Type", "application/octet-stream");
  if (obj.etag) {
    headers.set("ETag", obj.etag);
  }
  if (obj.uploaded) {
    headers.set("Last-Modified", obj.uploaded.toUTCString());
  }
  return headers;
}
