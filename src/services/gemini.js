import { detectCoachIntent, normalizeCoachModules } from "./coach.js";

const GEMINI_MODEL = "gemini-3.6-flash";

export function extractJson(text) {
  if (!text || typeof text !== "string") return null;

  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {}

  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");

  if (first !== -1 && last !== -1 && last > first) {
    const possibleJson = cleaned.slice(first, last + 1);
    try {
      return JSON.parse(possibleJson);
    } catch {}
  }

  console.error("Gemini JSON inválido o incompleto:", cleaned.slice(0, 800));
  return null;
}

export const safeParseGeminiJson = extractJson;

async function callGemini(prompt, generationOverrides = {}) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    console.error("Falta VITE_GEMINI_API_KEY");
    return null;
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            maxOutputTokens: 2200,
            temperature: 0.1,
            responseMimeType: "application/json",
            ...generationOverrides
          }
        })
      }
    );

    const rawText = await response.text();

    if (!response.ok) {
      if (response.status === 404) {
        console.error("Gemini 404. Modelo usado:", GEMINI_MODEL);
      }
      console.error("Gemini HTTP error:", response.status, rawText);
      return null;
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseError) {
      console.error("Gemini response JSON parse error:", parseError, rawText);
      return null;
    }

    const text = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text || "")
      .join("");

    if (!text) {
      console.error("Gemini sin texto:", data);
      return null;
    }

    return extractJson(text);
  } catch (error) {
    console.error("Gemini fetch error:", error);
    return null;
  }
}

function withTimeout(promise, ms = 30000) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(`Gemini timeout after ${ms}ms`)), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

function shortText(value, fallback = "") {
  return String(value || fallback || "").trim().slice(0, 120);
}

function normalizePlanSteps(steps, fallbackSteps, { minMinutes, maxMinutes }) {
  const source = Array.isArray(steps) && steps.length ? steps : fallbackSteps;
  return (Array.isArray(source) ? source : []).slice(0, 4).map((step, index) => ({
    titulo: shortText(step?.titulo, `Paso ${index + 1}`),
    descripcion: shortText(step?.descripcion, "Ejecuta este paso sin ampliar el alcance."),
    duracion_minutos: Math.min(maxMinutes, Math.max(minMinutes, Number(step?.duracion_minutos) || minMinutes)),
    resultado: shortText(step?.resultado, "Resultado visible completado.")
  }));
}

export function validateLaunchPlan(result, fallback = {}) {
  if (!result || typeof result !== "object") return fallback;
  const allowedCategories = ["ads", "shopify", "estudio", "video", "producto", "negocio", "otro"];
  const allowedTones = ["normal", "directo", "duro", "muy_duro"];
  const pasos = normalizePlanSteps(result.pasos, fallback.pasos, { minMinutes: 1, maxMinutes: 10 });
  const fallbackDuration = Number(fallback.duracion_recomendada) || pasos.reduce((sum, step) => sum + step.duracion_minutos, 0) || 10;
  const requestedDuration = typeof result.duracion_recomendada === "number" && Number.isFinite(result.duracion_recomendada)
    ? result.duracion_recomendada
    : fallbackDuration;
  const noHacerSource = Array.isArray(result.no_hacer) && result.no_hacer.length ? result.no_hacer : fallback.no_hacer;

  return {
    ...fallback,
    diagnostico: shortText(result.diagnostico, fallback.diagnostico),
    categoria_tarea: allowedCategories.includes(result.categoria_tarea) ? result.categoria_tarea : fallback.categoria_tarea,
    accion_minima: shortText(result.accion_minima, fallback.accion_minima),
    duracion_recomendada: Math.min(30, Math.max(1, requestedDuration)),
    pasos: pasos.length ? pasos : normalizePlanSteps(fallback.pasos, [], { minMinutes: 1, maxMinutes: 10 }),
    primer_movimiento: shortText(result.primer_movimiento, fallback.primer_movimiento),
    mensaje_directo: shortText(result.mensaje_directo, fallback.mensaje_directo),
    no_hacer: (Array.isArray(noHacerSource) ? noHacerSource : []).map((item) => shortText(item)).filter(Boolean).slice(0, 3),
    siguiente_paso_si_termina: shortText(result.siguiente_paso_si_termina, fallback.siguiente_paso_si_termina),
    tono: allowedTones.includes(result.tono) ? result.tono : fallback.tono
  };
}

export function validateDeepWorkPlan(result, fallback = {}, duration) {
  if (!result || typeof result !== "object") return fallback;
  const tones = ["normal", "directo", "duro", "muy_duro"];
  let pasos = normalizePlanSteps(result.pasos, fallback.pasos, { minMinutes: 5, maxMinutes: 25 });
  const requestedDuration = Number(duration);
  const total = pasos.reduce((sum, step) => sum + step.duracion_minutos, 0);
  if (requestedDuration > 0 && Math.abs(total - requestedDuration) > Math.max(10, requestedDuration * 0.3)) {
    pasos = normalizePlanSteps(fallback.pasos, [], { minMinutes: 5, maxMinutes: 25 });
  }
  const distractionsSource = Array.isArray(result.distracciones_a_bloquear) && result.distracciones_a_bloquear.length
    ? result.distracciones_a_bloquear
    : fallback.distracciones_a_bloquear;

  return {
    ...fallback,
    diagnostico: shortText(result.diagnostico, fallback.diagnostico),
    objetivo_reformulado: shortText(result.objetivo_reformulado, fallback.objetivo_reformulado),
    regla_del_bloque: shortText(result.regla_del_bloque, fallback.regla_del_bloque),
    pasos,
    distracciones_a_bloquear: (Array.isArray(distractionsSource) ? distractionsSource : []).map((item) => shortText(item)).filter(Boolean).slice(0, 3),
    mensaje_directo: shortText(result.mensaje_directo, fallback.mensaje_directo),
    criterio_de_exito: shortText(result.criterio_de_exito, fallback.criterio_de_exito),
    si_te_bloqueas: shortText(result.si_te_bloqueas, fallback.si_te_bloqueas),
    tono: tones.includes(result.tono) ? result.tono : fallback.tono
  };
}

export async function analyzeAntiFallWithGemini(payload) {
  const prompt = `Eres el analizador del Sistema Anticaída. No des motivación genérica. Convierte el problema en una acción concreta y breve. Devuelve SOLO JSON válido: {"diagnostico":"string","tono":"normal | directo | duro | muy_duro","reset_fisico":"string","accion_minima":"string","mensaje_duro":"string","blindaje_recomendado":"string","pregunta_reflexion":"string"}. Datos: ${JSON.stringify(payload)}`;
  try {
    const result = await withTimeout(callGemini(prompt), 20000);
    if (!result) throw new Error("Gemini no devolvió una respuesta válida");
    return result;
  } catch (error) {
    console.error("Gemini anti_fall error:", error.message);
    return null;
  }
}

export async function analyzeLaunchWithGemini(payload) {
  const prompt = `Eres el cerebro de “Arranque 10”. Tu objetivo es convertir una tarea grande en un plan de ejecución pequeño, cómodo y accionable. No des motivación genérica. No expliques teoría. No des un plan enorme. No hagas que el usuario tenga que pensar más. Usa las respuestas del cuestionario.
Reglas: máximo 4 pasos; cada paso dura entre 1 y 10 minutos; el plan total entre 5 y 30 minutos; cada paso tiene un resultado visible; la acción mínima es concreta y puede hacerse ahora; no hagas análisis largo ni repitas la tarea en frases enormes; limita anuncios a una campaña/copy/creativo concreto, Shopify a una sección, estudio a una página/tema/ejercicio y vídeo a hook/guion corto/primer corte; endurece el tono ante abandonos repetidos. Si la tarea es “hacer bundles”, pregunta o decide algo concreto, por ejemplo: “Define 2 packs y un descuento. No cambies toda la oferta.”

IMPORTANTE:
Devuelve SOLO JSON válido.
No uses markdown.
No uses explicaciones largas.
No uses párrafos largos.
No uses comillas simples dentro de frases largas si pueden romper JSON.
Cada string debe ser corto, con un máximo de 120 caracteres por campo de texto.
Incluye máximo 4 pasos y máximo 3 elementos en “no_hacer”.
No escribas más de 900 palabras en total. Si necesitas resumir, resume.

Usa este formato exacto:
{"diagnostico":"string corto","categoria_tarea":"ads | shopify | estudio | video | producto | negocio | otro","accion_minima":"string corto","duracion_recomendada":10,"pasos":[{"titulo":"string corto","descripcion":"string corto","duracion_minutos":5,"resultado":"string corto"}],"primer_movimiento":"string corto","mensaje_directo":"string corto","no_hacer":["string corto","string corto"],"siguiente_paso_si_termina":"string corto","tono":"normal | directo | duro | muy_duro"}.
Datos: ${JSON.stringify(payload)}`;
  try {
    const result = await withTimeout(callGemini(prompt), 30000);
    return result || null;
  } catch (error) {
    console.error("Gemini JSON inválido:", error);
    return null;
  }
}

export async function generateLaunchQuestionnaireWithGemini(taskData) {
  const prompt = `Eres el módulo de preguntas inteligentes de “Arranque 10”. El usuario quiere empezar una tarea, pero está bloqueado. Antes de generar una acción mínima, debes hacer de 3 a 6 preguntas útiles para cerrar el alcance.
No hagas preguntas genéricas si puedes hacerlas específicas. No preguntes cosas innecesarias. No hagas preguntas largas. No des consejos todavía. Analiza la tarea y detecta su categoría: ads, shopify, estudio, video, producto, negocio u otro.
Si trata de anuncios o campañas, pregunta plataforma, estado de creativos, copy, producto, objetivo y qué falta. Si trata de Shopify o web, pregunta página, sección, producto, qué falta y qué cambio quiere hacer. Si trata de estudiar, pregunta asignatura, tema, fecha, dificultad y tiempo disponible. Si trata de vídeo, pregunta plataforma, hook, guion, duración y estado de edición. Si trata de buscar productos, pregunta nicho, mercado, herramienta y criterios de validación.
Devuelve SOLO JSON válido: {"intro":"string","questions":[{"id":"string","question":"string","type":"single_choice | text","options":["string"]}]}.
Datos: ${JSON.stringify(taskData)}`;
  try {
    const result = await withTimeout(callGemini(prompt), 20000);
    if (!result) throw new Error("Gemini no devolvió una respuesta válida");
    return result;
  } catch (error) {
    console.error("Gemini launch10 questionnaire error:", error.message);
    return null;
  }
}

export async function analyzeDeepWorkWithGemini(payload) {
  const prompt = `Prepara un bloque de Trabajo Profundo práctico y sin teoría. Convierte la tarea en pocos pasos ejecutables con resultado visible.
Reglas: máximo 4 pasos; total cercano a la duración elegida; pasos de 5 a 25 minutos; primer paso inmediato; reduce el alcance si es grande; no escribas textos largos ni frases interminables; anuncios: campaña/copy/creativo; web: una sección; estudio: un tema/ejercicio; vídeo: hook/guion/grabación/edición. Usa la memoria para detectar distracciones y endurecer el tono sin insultar.

IMPORTANTE:
Devuelve SOLO JSON válido y no devuelvas nada fuera del JSON.
No uses markdown.
No uses explicaciones largas.
No uses párrafos largos.
No uses comillas simples dentro de frases largas si pueden romper JSON.
Cada string debe ser corto, con un máximo de 120 caracteres por campo de texto.
Incluye máximo 4 pasos y máximo 3 elementos en cualquier lista.
No escribas más de 900 palabras en total. Si necesitas resumir, resume.

Usa este formato exacto:
{"diagnostico":"string corto","objetivo_reformulado":"string corto","regla_del_bloque":"string corto","pasos":[{"titulo":"string corto","descripcion":"string corto","duracion_minutos":10,"resultado":"string corto"}],"distracciones_a_bloquear":["string corto","string corto"],"mensaje_directo":"string corto","criterio_de_exito":"string corto","si_te_bloqueas":"string corto","tono":"normal | directo | duro | muy_duro"}.
Datos: ${JSON.stringify(payload)}`;
  try {
    const result = await withTimeout(callGemini(prompt), 35000);
    return result || null;
  } catch (error) {
    console.error("Gemini JSON inválido:", error);
    return null;
  }
}

export async function analyzeCoachMessageWithGemini(payload) {
  const routedPayload = {
    ...payload,
    ruta_local: payload?.ruta_local || detectCoachIntent(payload?.mensaje_usuario)
  };
  const prompt = `Eres el Asistente de Ejecución de una app llamada “Modo Ejecución”.

Tu función es ayudar al usuario cuando se bloquea, cae, duda, procrastina o necesita decidir qué hacer.

No eres terapeuta. No eres motivador. No haces discursos largos. No das teoría. No insultas. No humillas. No diagnostiques salud mental, no prometas resultados y no inventes datos.

Tu trabajo es: entender el problema; detectar el patrón; decir una acción inmediata; recomendar la herramienta correcta de la app; hacer una pregunta útil si falta información; y guardar memoria solo si detectas un patrón importante.

Herramientas disponibles:
- Sistema Anticaída (antifall): cuando el usuario ya cayó o está a punto de caer.
- Arranque 10 (launch10): cuando sabe qué hacer pero no consigue empezar.
- Trabajo Profundo (deepwork): cuando quiere concentrarse con un objetivo claro.
- Estadísticas (stats): para revisar patrones.
- Perfil (profile): para cambiar datos y preferencias.

Criterios: si ha jugado, recaído, abandonado o fallado, recomienda antifall; si no consigue empezar, launch10; si ya sabe qué hacer y necesita foco, deepwork; en dudas de negocio piensa de forma práctica y recomienda launch10 o deepwork; conecta mentalidad con acción; usa la memoria real; endurece el tono ante patrones repetidos o según la preferencia, sin insultar. Responde de forma directa, útil y breve.

Regla principal:
Si el usuario ya ha fallado, jugado, recaído o roto su compromiso, recomienda Sistema Anticaída primero. No recomiendes Arranque 10 como primera opción en una caída ya ocurrida.
Arranque 10 solo se recomienda cuando el usuario todavía no ha caído y necesita empezar una tarea.
Trabajo Profundo solo se recomienda cuando el usuario ya tiene objetivo y quiere foco.
Si Contexto real incluye una ruta_local, respétala como clasificación prioritaria. Una caída siempre gana ante una mezcla de caída y bloqueo de inicio.

Límites obligatorios: respuesta máximo 450 caracteres; diagnóstico máximo 160 caracteres; acción inmediata máximo 160 caracteres; pregunta siguiente máximo 120 caracteres; máximo 2 bloques de texto; máximo 2 módulos recomendados.

Construye la respuesta como una secuencia ordenada de bloques:
- Primero responde al problema con un bloque type "text".
- Si recomiendas una herramienta, crea un bloque type "module". No metas botones ni nombres de botones dentro del texto.
- Después añade un bloque type "text" con la acción, la transición o la pregunta siguiente cuando sea útil.
- Si recomiendas dos herramientas, explica en un bloque de texto cuándo usar cada una y conserva el orden de ejecución.
- No recomiendes todas las herramientas. Usa como máximo 2 por respuesta, salvo que el usuario pida explícitamente un plan completo.
- Cada descripción de herramienta debe ser corta y específica.

Devuelve SOLO JSON válido. No uses saltos raros dentro de strings. No uses comillas sin escapar. No uses markdown. Completa y cierra siempre todos los strings, arrays y objetos.

Devuelve SOLO JSON válido con esta forma exacta:
{"bloques":[{"type":"text","content":"string"},{"type":"module","module":"antifall | launch10 | deepwork | stats | profile","titulo":"string","descripcion":"string","boton":"string"}],"respuesta":"string","diagnostico":"string","tono":"normal | directo | duro | muy_duro","tipo_problema":"caida | procrastinacion | arranque | trabajo_profundo | decision | emprendimiento | mentalidad | organizacion | otro","modulos_recomendados":[{"module":"antifall | launch10 | deepwork | stats | profile","titulo":"string","descripcion":"string","boton":"string"}],"accion_inmediata":"string","pregunta_siguiente":"string","memorias_a_guardar":[{"category":"string","memory_key":"string","memory_value":{}}]}.

Contexto real: ${JSON.stringify(routedPayload)}`;
  try {
    const result = await withTimeout(callGemini(prompt, {
      responseMimeType: "application/json",
      maxOutputTokens: 3000,
      temperature: 0.1
    }), 30000);
    if (!result) throw new Error("Gemini no devolvió una respuesta válida");
    return result;
  } catch (error) {
    console.error("Gemini coach error:", error.message);
    return null;
  }
}

export const analyzeWithGemini = analyzeAntiFallWithGemini;
export { callGemini, detectCoachIntent, normalizeCoachModules, withTimeout };
