const ALLOWED_MODULES = ["antifall", "launch10", "deepwork", "stats", "profile"];
const ALLOWED_TONES = ["normal", "directo", "duro", "muy_duro"];
const ALLOWED_PROBLEMS = ["caida", "procrastinacion", "arranque", "trabajo_profundo", "decision", "emprendimiento", "mentalidad", "organizacion", "otro"];
const LOCAL_COACH_PREFIX = "modoEjecucionCoachMessages";

const moduleCopy = {
  antifall: ["Sistema Anticaída", "Corta la caída y vuelve a ejecutar.", "Ir a Sistema Anticaída"],
  launch10: ["Arranque 10", "Reduce el bloqueo a un primer movimiento ejecutable.", "Ir a Arranque 10"],
  deepwork: ["Trabajo Profundo", "Protege un bloque serio para un objetivo concreto.", "Ir a Trabajo Profundo"],
  stats: ["Estadísticas", "Revisa tus datos y detecta el patrón real.", "Ver estadísticas"],
  profile: ["Perfil", "Ajusta tu tono y preferencias de ejecución.", "Ir al perfil"]
};

function recommendation(module) {
  const [titulo, descripcion, boton] = moduleCopy[module];
  return { module, titulo, descripcion, boton };
}

function localCoachKey(userId) {
  return `${LOCAL_COACH_PREFIX}:${userId || "anonymous"}`;
}

export function readLocalCoachMessages(userId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(localCoachKey(userId)) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) =>
      item && ["user", "assistant"].includes(item.role) && typeof item.text === "string" && item.createdAt
    ).slice(-60);
  } catch {
    return [];
  }
}

export function saveLocalCoachExchange(userId, userMessage, assistantResponse) {
  const timestamp = new Date().toISOString();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entries = [
    { id: `local-${suffix}-user`, role: "user", text: String(userMessage || "").trim(), createdAt: timestamp, localOnly: true },
    { id: `local-${suffix}-assistant`, role: "assistant", text: assistantResponse?.respuesta || "", response: assistantResponse, createdAt: timestamp, localOnly: true }
  ];
  try {
    const history = readLocalCoachMessages(userId);
    localStorage.setItem(localCoachKey(userId), JSON.stringify([...history, ...entries].slice(-60)));
  } catch (error) {
    console.error("Local coach persistence error:", error);
  }
  return entries;
}

export function normalizeCoachResult(result, fallback) {
  if (!result || typeof result.respuesta !== "string" || !result.respuesta.trim()) return fallback;
  const modules = Array.isArray(result.modulos_recomendados)
    ? result.modulos_recomendados
        .filter((item) => ALLOWED_MODULES.includes(item?.module))
        .slice(0, 3)
        .map((item) => ({
          ...recommendation(item.module),
          titulo: String(item.titulo || moduleCopy[item.module][0]).slice(0, 80),
          descripcion: String(item.descripcion || moduleCopy[item.module][1]).slice(0, 180),
          boton: String(item.boton || moduleCopy[item.module][2]).slice(0, 60)
        }))
    : [];
  const memories = Array.isArray(result.memorias_a_guardar)
    ? result.memorias_a_guardar.slice(0, 5).filter((item) =>
        item && typeof item.category === "string" && typeof item.memory_key === "string" &&
        item.category.trim() && item.memory_key.trim() && item.memory_value && typeof item.memory_value === "object" && !Array.isArray(item.memory_value)
      ).map((item) => ({
        category: item.category.trim().replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60),
        memory_key: item.memory_key.trim().replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80),
        memory_value: item.memory_value
      }))
    : [];
  return {
    respuesta: result.respuesta.trim().slice(0, 1400),
    diagnostico: String(result.diagnostico || fallback.diagnostico).trim().slice(0, 500),
    tono: ALLOWED_TONES.includes(result.tono) ? result.tono : fallback.tono,
    tipo_problema: ALLOWED_PROBLEMS.includes(result.tipo_problema) ? result.tipo_problema : fallback.tipo_problema,
    modulos_recomendados: modules.length ? modules : fallback.modulos_recomendados,
    accion_inmediata: String(result.accion_inmediata || fallback.accion_inmediata).trim().slice(0, 500),
    pregunta_siguiente: String(result.pregunta_siguiente || "").trim().slice(0, 500),
    memorias_a_guardar: memories
  };
}

export function getLocalCoachResponse(message, context = {}) {
  const value = String(message || "").toLowerCase();
  const failures = (context.antiFallSessions || []).filter((item) => !item.completed).length;
  const tone = ["duro", "muy_duro"].includes(context.profile?.tone_preference)
    ? context.profile.tone_preference
    : failures >= 2 ? "duro" : "directo";
  let tipo = "otro";
  let modules = ["launch10"];
  let respuesta = "No necesitas resolverlo todo ahora. Necesitas convertirlo en una acción visible y pequeña.";
  let accion = "Escribe el resultado mínimo que puedes dejar terminado en los próximos 10 minutos.";
  let pregunta = "¿Qué resultado concreto necesitas tener al terminar esos 10 minutos?";

  if (/juga|reca[ií]|he fallado|volv[ií] a|abandon|ca[ií]da|quiero procrastinar/.test(value)) {
    tipo = "caida";
    modules = ["antifall", "launch10"];
    respuesta = failures >= 2
      ? "Esto ya se está repitiendo. No lo conviertas en identidad ni lo negocies: corta la caída ahora."
      : "Esto no es falta de información. Es una caída. No la conviertas en identidad: reajusta ahora.";
    accion = "Cierra la distracción, ponte de pie y activa el Sistema Anticaída.";
    pregunta = "¿Qué estabas evitando justo antes de caer?";
  } else if (/procrast|no tengo ganas|no consigo empezar|por d[oó]nde empezar|bloquead/.test(value)) {
    tipo = /por d[oó]nde empezar|no consigo empezar/.test(value) ? "arranque" : "procrastinacion";
    modules = ["launch10"];
    respuesta = "El problema ahora no es la tarea completa. Es la fricción del primer movimiento. Reduce el alcance y empieza antes de volver a pensarlo.";
    accion = "Abre la herramienta necesaria y trabaja solo en el primer resultado visible durante 10 minutos.";
    pregunta = "¿Cuál es la tarea exacta que estás evitando?";
  } else if (/foco|concentr|bloque serio|trabajo profundo|distracci/.test(value)) {
    tipo = "trabajo_profundo";
    modules = ["deepwork"];
    respuesta = "Ya sabes que necesitas ejecutar. Deja de reorganizar y protege un bloque con un único objetivo.";
    accion = "Define un entregable, elimina una distracción y empieza un bloque de Trabajo Profundo.";
    pregunta = "¿Qué entregable único debe existir al terminar el bloque?";
  } else if (/negocio|producto|anuncio|campa[nñ]a|cliente|vender|oferta|lanzar/.test(value)) {
    tipo = "emprendimiento";
    modules = /miedo|duda|no s[eé] si/.test(value) ? ["launch10"] : ["deepwork"];
    respuesta = "No intentes conseguir certeza antes de actuar. Define una prueba pequeña que produzca información real.";
    accion = "Formula una hipótesis y ejecuta hoy la prueba reversible más pequeña.";
    pregunta = "¿Qué dato concreto te permitiría decidir sin seguir especulando?";
  } else if (/organizar|tareas|mi d[ií]a|qu[eé] hacer hoy|prioridad/.test(value)) {
    tipo = "organizacion";
    modules = ["launch10", "deepwork"];
    respuesta = "Una lista más larga no te dará claridad. Elige un resultado prioritario y conviértelo en el primer bloque.";
    accion = "Elige la tarea con mayor impacto y define su primer resultado visible.";
    pregunta = "¿Qué tarea cambia más el día si queda terminada?";
  } else if (/mentalidad|miedo|insegur|no soy capaz|fracaso/.test(value)) {
    tipo = "mentalidad";
    modules = ["launch10"];
    respuesta = "No necesitas sentirte seguro para actuar. Necesitas una acción pequeña que contraste esa historia con evidencia.";
    accion = "Haz durante 10 minutos la acción que estás posponiendo por miedo.";
    pregunta = "¿Qué acción harías hoy si no tuvieras que garantizar el resultado?";
  } else if (/decid|no s[eé] si|duda/.test(value)) {
    tipo = "decision";
    modules = ["launch10"];
    respuesta = "No busques una decisión perfecta. Separa lo reversible de lo irreversible y prueba primero lo reversible.";
    accion = "Escribe las dos opciones y el experimento más pequeño que reduciría la incertidumbre.";
    pregunta = "¿Qué parte de esta decisión puedes probar sin comprometerte del todo?";
  }

  const importantPattern = tipo === "caida" || failures >= 2;
  return {
    respuesta,
    diagnostico: `Problema clasificado como ${tipo}.`,
    tono: tone,
    tipo_problema: tipo,
    modulos_recomendados: modules.map(recommendation),
    accion_inmediata: accion,
    pregunta_siguiente: pregunta,
    memorias_a_guardar: importantPattern ? [{
      category: "patterns",
      memory_key: `coach_${tipo}`,
      memory_value: { last_message: String(message).slice(0, 300), recent_failed_sessions: failures, source: "coach" }
    }] : []
  };
}
