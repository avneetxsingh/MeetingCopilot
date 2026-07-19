import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

export function startFakeGroq(responses: { transcript?: string; chat?: unknown; status?: number }) {
  const server = createServer((req, res) => {
    const status = responses.status ?? 200;
    if (status !== 200) {
      res.writeHead(status);
      return res.end(JSON.stringify({ error: { message: "fake failure" } }));
    }
    if (req.url?.includes("/audio/transcriptions")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ text: responses.transcript ?? "hello world" }));
    } else if (req.url?.includes("/chat/completions")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(responses.chat ?? {}) } }] }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise<{ url: string; close(): void }>((resolve) =>
    server.listen(0, () =>
      resolve({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() }),
    ),
  );
}
