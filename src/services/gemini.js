const GEMINI_MODEL = "gemini-3.6-flash";

async function callGemini(prompt) {
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
            maxOutputTokens: 1200,
            temperature: 0.3,
            responseMimeType: "application/json"
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

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      console.error("Gemini sin texto:", data);
      return null;
    }

    try {
      return JSON.parse(
        text
          .replace(/```json/gi, "")
          .replace(/```/g, "")
          .trim()
      );
    } catch (parseError) {
      console.error("Gemini JSON parse error:", parseError, text);
      return null;
    }
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
Reglas: cada paso dura entre 1 y 10 minutos; el plan total entre 5 y 30 minutos; cada paso tiene un resultado visible; la primera acción puede hacerse ahora; limita anuncios a una campaña/copy/creativo concreto, Shopify a una sección, estudio a una página/tema/ejercicio y vídeo a hook/guion corto/primer corte; endurece el tono ante abandonos repetidos.
Devuelve SOLO JSON válido: {"diagnostico":"string","categoria_tarea":"ads | shopify | estudio | video | producto | negocio | otro","accion_minima":"string","duracion_recomendada":10,"pasos":[{"titulo":"string","descripcion":"string","duracion_minutos":5,"resultado":"string"}],"primer_movimiento":"string","mensaje_directo":"string","no_hacer":["string","string","string"],"siguiente_paso_si_termina":"string","tono":"normal | directo | duro | muy_duro"}.
Datos: ${JSON.stringify(payload)}`;
  try {
    const result = await withTimeout(callGemini(prompt), 30000);
    if (!result) throw new Error("Gemini no devolvió una respuesta válida");
    return result;
  } catch (error) {
    console.error("Gemini launch10 plan error:", error.message);
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
Reglas: total cercano a la duración elegida; pasos de 5 a 25 minutos; primer paso inmediato; reduce el alcance si es grande; anuncios: campaña/copy/creativo; web: una sección; estudio: un tema/ejercicio; vídeo: hook/guion/grabación/edición. Usa la memoria para detectar distracciones y endurecer el tono sin insultar.
Devuelve SOLO JSON válido: {"diagnostico":"string","objetivo_reformulado":"string","regla_del_bloque":"string","pasos":[{"titulo":"string","descripcion":"string","duracion_minutos":10,"resultado":"string"}],"distracciones_a_bloquear":["string"],"mensaje_directo":"string","criterio_de_exito":"string","si_te_bloqueas":"string","tono":"normal | directo | duro | muy_duro"}.
Datos: ${JSON.stringify(payload)}`;
  try {
    const result = await withTimeout(callGemini(prompt), 35000);
    if (!result) throw new Error("Gemini no devolvió una respuesta válida");
    return result;
  } catch (error) {
    console.error("Gemini deep work error:", error.message);
    return null;
  }
}

export async function analyzeCoachMessageWithGemini(payload) {
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

Devuelve SOLO JSON válido con esta forma exacta:
{"respuesta":"string","diagnostico":"string","tono":"normal | directo | duro | muy_duro","tipo_problema":"caida | procrastinacion | arranque | trabajo_profundo | decision | emprendimiento | mentalidad | organizacion | otro","modulos_recomendados":[{"module":"antifall | launch10 | deepwork | stats | profile","titulo":"string","descripcion":"string","boton":"string"}],"accion_inmediata":"string","pregunta_siguiente":"string","memorias_a_guardar":[{"category":"string","memory_key":"string","memory_value":{}}]}.

Contexto real: ${JSON.stringify(payload)}`;
  try {
    const result = await withTimeout(callGemini(prompt), 30000);
    if (!result) throw new Error("Gemini no devolvió una respuesta válida");
    return result;
  } catch (error) {
    console.error("Gemini coach error:", error.message);
    return null;
  }
}

export const analyzeWithGemini = analyzeAntiFallWithGemini;
export { callGemini, withTimeout };
