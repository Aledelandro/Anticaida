const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

function extractJson(text) {
  const clean = String(text || "").replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }
}

async function requestGemini(prompt) {
  try {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) return null;
    const response = await fetch(`${API_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        generationConfig: { temperature: 0.35, responseMimeType: "application/json" },
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      })
    });
    if (!response.ok) return null;
    const data = await response.json();
    return extractJson(data?.candidates?.[0]?.content?.parts?.[0]?.text);
  } catch {
    return null;
  }
}

export async function analyzeAntiFallWithGemini(payload) {
  try {
    return await requestGemini(`Eres el analizador del Sistema Anticaída. No des motivación genérica. Convierte el problema en una acción concreta y breve. Devuelve SOLO JSON válido: {"diagnostico":"string","tono":"normal | directo | duro | muy_duro","reset_fisico":"string","accion_minima":"string","mensaje_duro":"string","blindaje_recomendado":"string","pregunta_reflexion":"string"}. Datos: ${JSON.stringify(payload)}`);
  } catch {
    return null;
  }
}

export async function analyzeLaunchWithGemini(payload) {
  try {
    return await requestGemini(`Eres el cerebro de Arranque 10. Reduce la tarea a una acción de 2 a 10 minutos. Usa las palabras del usuario. No insultes. Devuelve SOLO JSON válido: {"diagnostico":"string","excusa_traducida":"string","accion_minima":"string","duracion_recomendada":10,"primer_movimiento":"string","mensaje_directo":"string","siguiente_paso_si_termina":"string","tono":"normal | directo | duro | muy_duro"}. Datos: ${JSON.stringify(payload)}`);
  } catch {
    return null;
  }
}

export const analyzeWithGemini = analyzeAntiFallWithGemini;
