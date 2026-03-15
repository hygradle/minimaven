import { authorize } from "./auth";
import { handleCleanup } from "./handlers/cleanup";
import { handleGet } from "./handlers/get";
import { handlePut } from "./handlers/put";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    switch (request.method) {
      case "GET":
      case "HEAD":
        return handleGet(request, env);

      case "PUT": {
        const denied = authorize(request, env);
        if (denied) return denied;
        return handlePut(request, env);
      }

      default:
        return new Response("Method Not Allowed", {
          status: 405,
          headers: { Allow: "GET, HEAD, PUT" },
        });
    }
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await handleCleanup(env);
  },
} satisfies ExportedHandler<Env>;
