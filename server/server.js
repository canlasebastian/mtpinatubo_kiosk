import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Explicitly look for .env in server directory, root directory, or .env.txt (common Windows extension issue)
const envLocations = [
  path.join(__dirname, ".env"),
  path.join(__dirname, ".env.txt"),
  path.join(__dirname, "..", ".env"),
  path.resolve(process.cwd(), ".env")
];

for (const envPath of envLocations) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

// Strip any accidental quotes or whitespace
if (process.env.GEMINI_API_KEY) {
  process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY.replace(/^["']|["']$/g, "").trim();
}

const app = express();
const port = process.env.PORT || 3001;

// Allow all origins so the kiosk works regardless of hostname or local IP.
// The API key stays server-side, so opening CORS here is safe.
app.use(cors());
app.use(express.json({ limit: "256kb" }));

const hasValidKey =
  Boolean(process.env.GEMINI_API_KEY) &&
  process.env.GEMINI_API_KEY !== "your_gemini_api_key_here";

if (!hasValidKey) {
  console.warn(
    "\n⚠️  [Apo Namalyari Proxy] GEMINI_API_KEY is not configured in server/.env."
  );
  console.warn(
    "👉 The museum kiosk will run normally, but the AI chatbot requires an API key."
  );
  console.warn(
    "👉 To enable AI answers, create server/.env with: GEMINI_API_KEY=your_key_here\n"
  );
}

const ai = hasValidKey ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

// gemini-3.5-flash-lite — fast, cost-efficient model for kiosk chat turns
const MODEL = "gemini-3.5-flash-lite";

const DEFAULT_SYSTEM =
  "You are a knowledgeable and engaging museum guide for the 1991 Mount Pinatubo eruption exhibit. " +
  "Answer questions about the volcano, the eruption, its causes, timeline, impact, and recovery. " +
  "Keep answers concise, informative, and appropriate for a museum kiosk audience.";

// Simple health-check endpoint — open http://localhost:3001/health to confirm
// the server is running and the API key is loaded.
app.get("/health", (_req, res) => {
  res.json({ status: "ok", model: MODEL, keyLoaded: hasValidKey });
});

app.post("/api/chat", async (req, res) => {
  if (!ai) {
    return res.json({
      reply:
        "The Apo Namalyari AI guide is currently in offline mode because GEMINI_API_KEY is not configured in server/.env. All interactive exhibits, 3D simulations, and archives remain fully accessible!",
    });
  }
  try {
    const messages = Array.isArray(req.body.messages) ? req.body.messages : [];
    const systemInstruction = (typeof req.body.systemInstruction === "string" && req.body.systemInstruction.trim())
      ? req.body.systemInstruction.trim()
      : DEFAULT_SYSTEM;
    const maxOutputTokens = typeof req.body.maxOutputTokens === "number" ? req.body.maxOutputTokens : 500;
    const temperature = typeof req.body.temperature === "number" ? req.body.temperature : 0.5;

    const contents = messages
      .filter(m => (m.role === "user" || m.role === "model") && m.content?.trim())
      .slice(-12)
      .map(m => ({ role: m.role, parts: [{ text: m.content.trim() }] }));

    if (!contents.length) {
      return res.status(400).json({ error: "No message provided." });
    }

    const response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: { systemInstruction, maxOutputTokens, temperature },
    });

    res.json({ reply: response.text?.trim() });
  } catch (error) {
    console.error("Gemini API error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// gemini-3.5-flash — used for knowledge/web-search-style queries
const WEB_SEARCH_MODEL = "gemini-3.5-flash";
const WEB_SEARCH_SYSTEM =
  "You are Apo Namalyari, a knowledgeable guide to Mount Pinatubo at a museum kiosk in the Philippines. " +
  "Use your extensive pre-trained knowledge base to answer the visitor's question. " +
  "IMPORTANT: Only answer if the question is clearly about Mount Pinatubo, its 1991 eruption, lahar, the Aeta people, " +
  "PHIVOLCS, Clark Air Base, Zambales, or events directly connected to the volcano. " +
  "If the question has nothing to do with Pinatubo or its history, respond with exactly: " +
  "\"That doesn't appear to be related to Mount Pinatubo. Feel free to ask about the 1991 eruption, the lahars, the Aeta people, or the recovery.\" " +
  "Otherwise answer in 1-3 concise sentences, no markdown, no bullet points, no source citations.";

app.post("/api/web-search", async (req, res) => {
  if (!ai) {
    return res.json({
      reply:
        "The Apo Namalyari AI guide is currently in offline mode because GEMINI_API_KEY is not configured in server/.env.",
    });
  }
  try {
    const question = typeof req.body.question === "string" ? req.body.question.trim() : "";
    if (!question) {
      return res.status(400).json({ error: "Missing question." });
    }
    const response = await ai.models.generateContent({
      model: WEB_SEARCH_MODEL,
      contents: [{ role: "user", parts: [{ text: question }] }],
      config: {
        systemInstruction: WEB_SEARCH_SYSTEM,
        maxOutputTokens: 400,
        temperature: 0.3,
      },
    });
    res.json({ reply: response.text?.trim() });
  } catch (error) {
    console.error("Web search error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () =>
  console.log(`Pinatubo proxy running on http://localhost:${port}`)
);