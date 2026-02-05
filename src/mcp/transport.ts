import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./server";

type SessionData = {
  transport: StreamableHTTPServerTransport;
  token: string;
};

const sessions = new Map<string, SessionData>();

export async function handleMcpRequest(req: Request): Promise<Response> {
  const sessionId = req.headers.get("mcp-session-id");
  const apiKey = req.headers.get("api-key");

  if (req.method === "POST") {
    let body: unknown;

    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32700, message: "Parse error" },
          id: null,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      const response = await handleTransportRequest(session.transport, body);
      return response;
    }

    if (!apiKey || !apiKey.startsWith("sk-")) {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Unauthorized: invalid or missing api-key" },
          id: null,
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });

    const server = createMcpServer(apiKey);
    await server.connect(transport);

    if (transport.sessionId) {
      sessions.set(transport.sessionId, { transport, token: apiKey });
    }

    const response = await handleTransportRequest(transport, body);
    return response;
  }

  if (req.method === "GET") {
    if (!sessionId || !sessions.has(sessionId)) {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Session not found" },
          id: null,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const session = sessions.get(sessionId)!;
    return handleTransportSse(session.transport);
  }

  if (req.method === "DELETE") {
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      await session.transport.close();
      sessions.delete(sessionId);
    }
    return new Response(null, { status: 204 });
  }

  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed" },
      id: null,
    }),
    { status: 405, headers: { "Content-Type": "application/json" } }
  );
}

async function handleTransportRequest(
  transport: StreamableHTTPServerTransport,
  body: unknown
): Promise<Response> {
  return new Promise((resolve) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (transport.sessionId) {
      headers["mcp-session-id"] = transport.sessionId;
    }

    let responseBody = "";
    let statusCode = 200;

    const mockRes = {
      statusCode: 200,
      headersSent: false,
      setHeader(name: string, value: string) {
        headers[name.toLowerCase()] = value;
      },
      writeHead(code: number, hdrs?: Record<string, string>) {
        statusCode = code;
        if (hdrs) {
          for (const [k, v] of Object.entries(hdrs)) {
            headers[k.toLowerCase()] = v;
          }
        }
        return this;
      },
      write(chunk: string | Buffer) {
        responseBody += typeof chunk === "string" ? chunk : chunk.toString();
        return true;
      },
      end(chunk?: string | Buffer) {
        if (chunk) {
          responseBody += typeof chunk === "string" ? chunk : chunk.toString();
        }
        this.headersSent = true;
        resolve(new Response(responseBody || null, { status: statusCode, headers }));
      },
      on(_event: string, _handler: () => void) {
        return this;
      },
      flushHeaders() {},
    };

    const mockReq = {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "mcp-session-id": transport.sessionId ?? "",
      },
      body,
    };

    transport.handleRequest(mockReq as any, mockRes as any, body);
  });
}

function handleTransportSse(transport: StreamableHTTPServerTransport): Response {
  const headers = new Headers({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "mcp-session-id": transport.sessionId ?? "",
  });

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const mockRes = {
        statusCode: 200,
        headersSent: false,
        setHeader() {},
        writeHead() {
          return this;
        },
        write(chunk: string | Buffer) {
          const data = typeof chunk === "string" ? chunk : chunk.toString();
          controller.enqueue(encoder.encode(data));
          return true;
        },
        end() {
          controller.close();
        },
        on(_event: string, _handler: () => void) {
          return this;
        },
        flushHeaders() {
          this.headersSent = true;
        },
      };

      const mockReq = {
        method: "GET",
        headers: {
          accept: "text/event-stream",
          "mcp-session-id": transport.sessionId ?? "",
        },
      };

      transport.handleRequest(mockReq as any, mockRes as any);
    },
  });

  return new Response(stream, { status: 200, headers });
}
