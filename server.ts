// server.ts
import express from 'express';
import { parse as parseCookie } from "cookie";

const app = express();
app.use(express.json());

// Em memória: sessão ↔ chat_id do OpenClaw
const sessions = new Map<string, { chatId: string; messages: any[] }>();

const OPENCLAW_GATEWAY = "http://localhost:18789";

function getSessionId(req: express.Request): string {
  const cookies = parseCookie(req.headers.cookie || "");
  let sid = cookies["session_id"];
  if (!sid) {
    sid = `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
  return sid;
}


// GET /api/tags → só um modelo fixo
app.get("/api/tags", (_req, res) => {
  res.json({
    models: [
      {
        name: "openclaw-default",
        size: 0,
        modified_at: new Date().toISOString(),
        digest: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      },
    ],
  });
});

// POST /api/chat
app.post("/api/chat", async (req, res) => {
  const { model, messages, stream, options } = req.body;

  // Ignoramos o `model` do cliente e usamos só o nosso modelo virtual
  if (model !== "openclaw-default") {
    return res.status(400).json({ error: "Only model 'openclaw-default' is supported" });
  }

  const sessionId = getSessionId(req);
  let session = sessions.get(sessionId);
  if (!session) {
    // Aqui você pode optar por:
    // a) criar um novo chat no OpenClaw e obter um chat_id (via HTTP)
    // b) ou simplesmente deixar o OpenClaw decidir o contexto por você
    session = { chatId: `chat_${sessionId}`, messages: [] };
    sessions.set(sessionId, session);
  }

  // Mapeia para o formato OpenAI-style que o OpenClaw entende
  const openclawPayload = {
    model: "openrouter/anthropic-claude-3-sonnet", // ajuste para o seu modelo no OpenRouter
    messages: session.messages.concat(messages),
    stream: stream ?? true,
    // outros campos de options, se quiser espelhar
  };

  try {
//const GATEWAY_TOKEN = "__OPENCLAW_REDACTED__"; // seu token aqui
const GATEWAY_TOKEN = "31685159d72b89b89c24a43d6377801a"
const rsp = await fetch("http://127.0.0.1:18789/tools/invoke", {
  method: "POST",
  headers: { 
    "Content-Type": "application/json",
    "Authorization": `Bearer ${GATEWAY_TOKEN}`
  },
  body: JSON.stringify({
    tool: "echo",
    args: { 
      message: messages[messages.length - 1].content 
    }
  }),
});

    if (!rsp.ok) throw new Error(`OpenClaw error: ${rsp.status}`);

    if (stream) {
      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Transfer-Encoding", "chunked");

      const reader = rsp.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(new TextDecoder().decode(value));
      }
      res.end();
    } else {
      const data = await rsp.json();
      // Espelha de volta como resposta “Ollama‑style”
      res.json({
        model: "openclaw-default",
        created_at: new Date().toISOString(),
        message: {
          role: "assistant",
          content: data.choices?.[0]?.message?.content || "",
        },
        done: true,
        total_duration: 0,
        load_duration: 0,
        prompt_eval_count: 0,
        eval_count: 0,
        eval_duration: 0,
      });
    }
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: "Internal proxy error" });
  }
});

app.listen(11434, () => {
  console.log("Ollama proxy listening on http://localhost:11434");
});
