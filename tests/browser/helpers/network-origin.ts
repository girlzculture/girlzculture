import { createServer, request, type ClientRequest, type IncomingHttpHeaders } from "node:http";
import type { Socket } from "node:net";

const hopHeaders = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade",
]);

function forwardedHeaders(headers: IncomingHttpHeaders) {
  const connectionHeaders = String(headers.connection || "").split(",").map(value => value.trim().toLowerCase());
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !hopHeaders.has(name) && !connectionHeaders.includes(name)));
}

// Forward the real acceptance app, then remove its network origin. WebKit's
// setOffline emulation can reject navigation before a service worker handles it.
export async function createNetworkOrigin(baseURL: string | undefined) {
  if (!baseURL) throw new Error("Network outage tests require a loopback acceptance baseURL.");
  const upstream = new URL(baseURL);
  if (upstream.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(upstream.hostname)
    || upstream.username || upstream.password || upstream.pathname !== "/" || upstream.search || upstream.hash) {
    throw new Error("Network outage tests only forward an HTTP loopback acceptance origin.");
  }

  const sockets = new Set<Socket>();
  const requests = new Set<ClientRequest>();
  const server = createServer((incoming, outgoing) => {
    const target = new URL(incoming.url || "/", upstream);
    if (target.origin !== upstream.origin) {
      outgoing.writeHead(400).end();
      return;
    }
    const forwarded = request(target, {
      method: incoming.method,
      headers: { ...forwardedHeaders(incoming.headers), host: upstream.host },
      agent: false,
    }, response => {
      outgoing.writeHead(response.statusCode || 502, forwardedHeaders(response.headers));
      response.on("error", () => outgoing.destroy());
      response.pipe(outgoing);
    });
    requests.add(forwarded);
    forwarded.on("close", () => requests.delete(forwarded));
    forwarded.on("error", () => outgoing.destroy());
    incoming.on("error", () => forwarded.destroy());
    outgoing.on("close", () => { if (!outgoing.writableEnded) forwarded.destroy(); });
    incoming.pipe(forwarded);
  });
  server.on("connection", socket => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing loopback test origin.");
  const origin = `http://127.0.0.1:${address.port}`;
  let closing: Promise<void> | undefined;
  const disconnect = () => closing ??= new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    for (const forwarded of requests) forwarded.destroy();
    for (const socket of sockets) socket.destroy();
  });
  return {
    url(path: string) {
      const target = new URL(path, origin);
      if (target.origin !== origin) throw new Error("Navigation must stay on the isolated loopback origin.");
      return target.href;
    },
    disconnect,
    close: disconnect,
  };
}
