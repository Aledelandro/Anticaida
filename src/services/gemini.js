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
    return await requestGemini(`Eres el cerebro de “Arranque 10”. Tu objetivo es convertir una tarea grande en un plan de ejecución pequeño, cómodo y accionable. No des motivación genérica. No expliques teoría. No des un plan enorme. No hagas que el usuario tenga que pensar más. Usa las respuestas del cuestionario.
Reglas: cada paso dura entre 1 y 10 minutos; el plan total entre 5 y 30 minutos; cada paso tiene un resultado visible; la primera acción puede hacerse ahora; limita anuncios a una campaña/copy/creativo concreto, Shopify a una sección, estudio a una página/tema/ejercicio y vídeo a hook/guion corto/primer corte; endurece el tono ante abandonos repetidos.
Devuelve SOLO JSON válido: {"diagnostico":"string","categoria_tarea":"ads | shopify | estudio | video | producto | negocio | otro","accion_minima":"string","duracion_recomendada":10,"pasos":[{"titulo":"string","descripcion":"string","duracion_minutos":5,"resultado":"string"}],"primer_movimiento":"string","mensaje_directo":"string","no_hacer":["string","string","string"],"siguiente_paso_si_termina":"string","tono":"normal | directo | duro | muy_duro"}.
Datos: ${JSON.stringify(payload)}`);
  } catch {
    return null;
  }
}

export async function generateLaunchQuestionnaireWithGemini(taskData) {
  try {
    return await requestGemini(`Eres el módulo de preguntas inteligentes de “Arranque 10”. El usuario quiere empezar una tarea, pero está bloqueado. Antes de generar una acción mínima, debes hacer de 3 a 6 preguntas útiles para cerrar el alcance.
No hagas preguntas genéricas si puedes hacerlas específicas. No preguntes cosas innecesarias. No hagas preguntas largas. No des consejos todavía. Analiza la tarea y detecta su categoría: ads, shopify, estudio, video, producto, negocio u otro.
Si trata de anuncios o campañas, pregunta plataforma, estado de creativos, copy, producto, objetivo y qué falta. Si trata de Shopify o web, pregunta página, sección, producto, qué falta y qué cambio quiere hacer. Si trata de estudiar, pregunta asignatura, tema, fecha, dificultad y tiempo disponible. Si trata de vídeo, pregunta plataforma, hook, guion, duración y estado de edición. Si trata de buscar productos, pregunta nicho, mercado, herramienta y criterios de validación.
Devuelve SOLO JSON válido: {"intro":"string","questions":[{"id":"string","question":"string","type":"single_choice | text","options":["string"]}]}.
Datos: ${JSON.stringify(taskData)}`);
  } catch {
    return null;
  }
}

export const analyzeWithGemini = analyzeAntiFallWithGemini;
