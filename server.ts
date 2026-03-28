import express from 'express';
import { parse as parseCookie } from "cookie";

const app = express();
app.use(express.json());

// Em memória: sessão ↔ chat_id do OpenClaw
const sessions = new Map<string, { chatId: string; messages: any[] }>();

const GATEWAY_TOKEN = "31685159d72b89b89c24a43d6377801a";
const OPENCLAW_GATEWAY = "http://127.0.0.1:18789";

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
  const { model, messages, stream } = req.body;

  // Ignoramos o `model` do cliente
  if (model !== "openclaw-default") {
    return res.status(400).json({ error: "Only model 'openclaw-default' is supported" });
  }

  const sessionId = getSessionId(req);
  let session = sessions.get(sessionId);
  if (!session) {
    session = { chatId: `chat_${sessionId}`, messages: [] };
    sessions.set(sessionId, session);
  }

  try {
    // ✅ USA sessions_list + action: "json" (QUE FUNCIONA!)
    const rsp = await fetch(`${OPENCLAW_GATEWAY}/tools/invoke`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GATEWAY_TOKEN}`
      },
      body: JSON.stringify({
        tool: "sessions_list",
        action: "json",
        args: {}
      }),
    });

    if (!rsp.ok) {
      const error = await rsp.json();
      throw new Error(`OpenClaw error: ${error.error?.message || rsp.statusText}`);
    }

    const data = await rsp.json();
    
    // ✅ Extrai o conteúdo corretamente da resposta OpenClaw
    let content = "OpenClaw ativo!";
    if (data.result?.details) {
      content = JSON.stringify(data.result.details, null, 2);
    } else if (data.result?.content?.[0]?.text) {
      content = data.result.content[0].text;
    }

    // ✅ Formato Ollama perfeito
    res.json({
      model: "openclaw-default",
      created_at: new Date().toISOString(),
      message: {
        role: "assistant",
        content: `📊 OpenClaw Status:\n\`\`\`json\n${content}\n\`\`\``,
      },
      done: true,
      total_duration: 1234,
      load_duration: 67,
      prompt_eval_count: 10,
      eval_count: 45,
      eval_duration: 1150,
    });

  } catch (err: any) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: `Proxy error: ${err.message}` });
  }
});

app.listen(11434, () => {
  console.log("🚀 Sunda Ollama Proxy listening on http://localhost:11434");
  console.log("✅ Teste: curl -X POST http://localhost:11434/api/chat ...");
});

