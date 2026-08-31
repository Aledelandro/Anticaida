import dotenv from "dotenv";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "127.0.0.1";

app.use(express.json({ limit: "1mb" }));

function extractJson(text) {
  const trimmed = String(text || "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Gemini no devolvió JSON.");
    return JSON.parse(match[0]);
  }
}

function normalizeGeminiResult(raw) {
  const allowedTones = new Set(["normal", "directo", "duro", "muy_duro"]);
  return {
    diagnostico: String(raw.diagnostico || "El patrón intenta sacarte de la ejecución antes de cumplir."),
    tono: allowedTones.has(raw.tono) ? raw.tono : "normal",
    reset_fisico: String(raw.reset_fisico || "Caminar 3 minutos"),
    accion_minima: String(raw.accion_minima || "Trabajar 10 minutos en la tarea más pequeña posible."),
    mensaje_duro: String(raw.mensaje_duro || "No negocies con la caída. Haz 10 minutos. Luego decides."),
    blindaje_recomendado: String(raw.blindaje_recomendado || "Escribir la primera tarea antes de empezar."),
    pregunta_reflexion: String(raw.pregunta_reflexion || "¿Qué excusa aparece justo antes de abandonar?")
  };
}

export async function analyzeWithGemini(payload) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Falta GEMINI_API_KEY en .env");
  }

  const prompt = `Eres un sistema anticaída para un joven emprendedor que quiere evitar malas acciones, evasión, procrastinación, bloqueo, baja energía o abandono durante momentos de trabajo. Tu objetivo no es motivar, sino hacer que ejecute. Usa el problema seleccionado y el campo de detalles del usuario para personalizar TODO: diagnóstico, reset físico, acción mínima, mensaje duro, blindaje recomendado y pregunta de reflexión. Si el usuario describe una tarea concreta, menciónala y reduce la acción mínima a un paso visible de esa tarea. Usa un tono claro, directo y cada vez más duro si detectas fallos repetidos. No insultes, no humilles, pero sé firme. Basado en los datos del usuario, devuelve SOLO un JSON válido con diagnóstico, tono, reset físico, acción mínima, mensaje duro, blindaje recomendado y pregunta de reflexión.

Formato exacto:
{
"diagnostico": "explicación breve de lo que está pasando",
"tono": "normal | directo | duro | muy_duro",
"reset_fisico": "acción física recomendada",
"accion_minima": "acción mínima concreta para hacer ahora",
"mensaje_duro": "mensaje personalizado según la racha de fallos",
"blindaje_recomendado": "ajuste preventivo recomendado",
"pregunta_reflexion": "pregunta para que el usuario entienda su patrón"
}

Datos:
${JSON.stringify(payload, null, 2)}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        generationConfig: {
          temperature: 0.4,
          responseMimeType: "application/json"
        },
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini respondió ${response.status}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return normalizeGeminiResult(extractJson(text));
}

app.post("/api/analyze", async (req, res) => {
  try {
    const result = await analyzeWithGemini(req.body);
    res.json({ ok: true, result });
  } catch (error) {
    res.status(200).json({ ok: false, error: error.message });
  }
});

app.use(express.static(path.join(__dirname, "dist")));
app.get(/.*/, (_, res) => res.sendFile(path.join(__dirname, "dist", "index.html")));

const server = app.listen(port, host, () => {
  console.log(`Sistema Anticaída listo en http://${host}:${port}`);
});

server.on("error", (error) => {
  console.error("No se pudo iniciar el servidor:", error);
  process.exit(1);
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});

process.stdin.resume();
