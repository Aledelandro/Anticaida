const ALLOWED_MODULES = ["antifall", "launch10", "deepwork", "stats", "profile"];
const ALLOWED_TONES = ["normal", "directo", "duro", "muy_duro"];
const ALLOWED_PROBLEMS = ["caida", "procrastinacion", "arranque", "trabajo_profundo", "decision", "emprendimiento", "mentalidad", "organizacion", "otro"];
const LOCAL_COACH_PREFIX = "modoEjecucionCoachMessages";

const moduleCopy = {
  antifall: ["Sistema Anticaída", "Corta la caída y vuelve a ejecutar.", "Ir a Sistema Anticaída"],
  launch10: ["Arranque 10", "Convierte bloqueo en acción mínima.", "Ir a Arranque 10"],
  deepwork: ["Trabajo Profundo", "Entra en un bloque serio con foco.", "Ir a Trabajo Profundo"],
  stats: ["Estadísticas", "Revisa tus patrones y rachas.", "Ver Estadísticas"],
  profile: ["Perfil", "Ajusta tu memoria y preferencias.", "Ir a Perfil"]
};

function recommendation(module) {
  const [titulo, descripcion, boton] = moduleCopy[module];
  return { module, titulo, descripcion, boton };
}

function normalizeModule(item) {
  const value = typeof item === "string" ? { module: item } : item;
  if (!ALLOWED_MODULES.includes(value?.module)) return null;
  return {
    ...recommendation(value.module),
    module: value.module,
    titulo: String(value.titulo || moduleCopy[value.module][0]).trim().slice(0, 80),
    descripcion: String(value.descripcion || moduleCopy[value.module][1]).trim().slice(0, 160),
    boton: String(value.boton || moduleCopy[value.module][2]).trim().slice(0, 60)
  };
}

export function normalizeCoachModules(modules) {
  if (!Array.isArray(modules)) return [];
  const seen = new Set();
  return modules.map(normalizeModule).filter((item) => {
    if (!item || seen.has(item.module)) return false;
    seen.add(item.module);
    return true;
  }).slice(0, 2);
}

function searchableText(message) {
  return String(message || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function detectCoachIntent(message) {
  const value = searchableText(message);
  const fall = /\b(he jugado|jugue|he vuelto a jugar|me he ido a jugar|me fui a jugar|he fallado|he caido|he recaido|recai|abandone|he abandonado|rompi mi compromiso)\b/.test(value)
    || /\b(tenia|deberia) que trabajar\b.*\b(y|pero)\b.*\b(jugue|he jugado)\b/.test(value)
    || /\bprocrastin(?:e|ado|ando)\b.*\bjugando\b/.test(value);
  if (fall) return { intent: "caida", primaryModule: "antifall" };
  if (/\b(no se por donde empezar|me cuesta empezar|no arranco|estoy bloqueado|procrastinando)\b/.test(value)) {
    return { intent: "arranque", primaryModule: "launch10" };
  }
  if (/\b(quiero concentrarme|bloque de trabajo|trabajo profundo|hacer 45|hacer 25 minutos|foco)\b/.test(value)) {
    return { intent: "trabajo_profundo", primaryModule: "deepwork" };
  }
  return null;
}

function moduleBlock(module) {
  return { type: "module", ...recommendation(module) };
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

export function normalizeCoachResult(result, fallback, detectedIntent = null) {
  if (!result || typeof result.respuesta !== "string" || !result.respuesta.trim()) return fallback;
  let modules = normalizeCoachModules(result.modulos_recomendados);
  let blocks = Array.isArray(result.bloques)
    ? result.bloques.slice(0, 8).map((block) => {
        if (block?.type === "text" && String(block.content || "").trim()) {
          return { type: "text", content: String(block.content).trim().slice(0, 900) };
        }
        if (block?.type === "module") {
          const normalized = normalizeModule(block);
          return normalized ? { type: "module", ...normalized } : null;
        }
        return null;
      }).filter(Boolean)
    : [];
  let textCount = 0;
  let moduleCount = 0;
  blocks = blocks.filter((block) => {
    if (block.type === "text") return ++textCount <= 2;
    if (block.type === "module") return ++moduleCount <= 2;
    return false;
  });
  if (detectedIntent?.primaryModule) {
    const primary = recommendation(detectedIntent.primaryModule);
    modules = [primary, ...modules.filter((item) => item.module !== primary.module)].slice(0, 2);
    const moduleBlocks = blocks.filter((block) => block.type === "module" && block.module !== primary.module);
    const textBlocks = blocks.filter((block) => block.type === "text");
    blocks = [
      ...(textBlocks[0] ? [textBlocks[0]] : []),
      { type: "module", ...primary },
      ...moduleBlocks.slice(0, 1),
      ...textBlocks.slice(1)
    ].slice(0, 5);
  }
  const hasTextBlock = blocks.some((block) => block.type === "text");
  const hasRecommendedModuleBlock = !modules.length || modules.some((item) =>
    blocks.some((block) => block.type === "module" && block.module === item.module)
  );
  if (!hasTextBlock || !hasRecommendedModuleBlock) blocks = [];
  if (!blocks.length) {
    blocks = [
      { type: "text", content: result.respuesta.trim().slice(0, 450) },
      ...modules.map((item) => ({ type: "module", ...item })),
      ...(String(result.pregunta_siguiente || "").trim()
        ? [{ type: "text", content: String(result.pregunta_siguiente).trim().slice(0, 120) }]
        : [])
    ];
  }
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
    respuesta: result.respuesta.trim().slice(0, 450),
    diagnostico: String(result.diagnostico || fallback.diagnostico).trim().slice(0, 160),
    tono: ALLOWED_TONES.includes(result.tono) ? result.tono : fallback.tono,
    tipo_problema: detectedIntent?.intent || (ALLOWED_PROBLEMS.includes(result.tipo_problema) ? result.tipo_problema : fallback.tipo_problema),
    bloques: blocks.length ? blocks : fallback.bloques,
    modulos_recomendados: modules.length ? modules : blocks.some((block) => block.type === "module") ? [] : fallback.modulos_recomendados,
    accion_inmediata: String(result.accion_inmediata || fallback.accion_inmediata).trim().slice(0, 160),
    pregunta_siguiente: String(result.pregunta_siguiente || "").trim().slice(0, 120),
    memorias_a_guardar: memories
  };
}

export function getLocalCoachResponse(message, context = {}) {
  const value = String(message || "").toLowerCase();
  const detectedIntent = detectCoachIntent(message);
  const failures = (context.antiFallSessions || []).filter((item) => !item.completed).length;
  const tone = ["duro", "muy_duro"].includes(context.profile?.tone_preference)
    ? context.profile.tone_preference
    : failures >= 2 ? "duro" : "directo";
  let tipo = "otro";
  let modules = ["launch10"];
  let respuesta = "No necesitas resolverlo todo ahora. Necesitas convertirlo en una acción visible y pequeña.";
  let accion = "Escribe el resultado mínimo que puedes dejar terminado en los próximos 10 minutos.";
  let pregunta = "¿Qué resultado concreto necesitas tener al terminar esos 10 minutos?";

  if (detectedIntent?.intent === "caida" || /jug|roblox|ps5|steam|reca[ií]|he fallado|he ca[ií]do|volv[ií] a|abandon|ca[ií]da|quiero procrastinar/.test(value)) {
    tipo = "caida";
    modules = ["antifall", "launch10"];
    respuesta = failures >= 2
      ? "Esto ya se está repitiendo. No lo conviertas en identidad ni lo negocies: corta la caída ahora."
      : "Esto no es falta de información. Es una caída. No la conviertas en identidad: reajusta ahora.";
    accion = "Cierra la distracción, ponte de pie y activa el Sistema Anticaída.";
    pregunta = "¿Qué estabas evitando justo antes de caer?";
  } else if (detectedIntent?.intent === "arranque" || /procrast|no tengo ganas|no s[eé] empezar|no consigo empezar|por d[oó]nde empezar|bloquead/.test(value)) {
    tipo = /no s[eé] empezar|por d[oó]nde empezar|no consigo empezar/.test(value) ? "arranque" : "procrastinacion";
    modules = ["launch10"];
    respuesta = "El problema ahora no es la tarea completa. Es la fricción del primer movimiento. Reduce el alcance y empieza antes de volver a pensarlo.";
    accion = "Abre la herramienta necesaria y trabaja solo en el primer resultado visible durante 10 minutos.";
    pregunta = "¿Cuál es la tarea exacta que estás evitando?";
  } else if (detectedIntent?.intent === "trabajo_profundo" || /foco|concentr|bloque serio|bloque de trabajo|trabajo profundo|distracci/.test(value)) {
    tipo = "trabajo_profundo";
    modules = ["deepwork"];
    respuesta = "Ya sabes que necesitas ejecutar. Deja de reorganizar y protege un bloque con un único objetivo.";
    accion = "Define un entregable, elimina una distracción y empieza un bloque de Trabajo Profundo.";
    pregunta = "¿Qué entregable único debe existir al terminar el bloque?";
  } else if (/estad[ií]stica|patr[oó]n|racha/.test(value)) {
    tipo = "otro";
    modules = ["stats"];
    respuesta = "No lo interpretes por sensaciones. Revisa los datos y localiza qué conducta se está repitiendo.";
    accion = "Abre Estadísticas y revisa la racha y los últimos registros.";
    pregunta = "¿Qué patrón aparece con más frecuencia en tus últimos registros?";
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
  let blocks;
  if (tipo === "caida") {
    blocks = [
      { type: "text", content: "Esto es una caída, no una identidad. Reajusta ahora." },
      moduleBlock("antifall"),
      { type: "text", content: "Después usa Arranque 10 para decidir el primer paso." },
      moduleBlock("launch10")
    ];
  } else {
    blocks = [
      { type: "text", content: respuesta },
      ...modules.map(moduleBlock)
    ];
  }
  return {
    bloques: blocks,
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
