const ANTIFALL_HISTORY_KEY = "sistemaAnticaidaHistory";
const ANTIFALL_ACTIVE_KEY = "sistemaAnticaidaActive";
const LAUNCH_HISTORY_KEY = "modoEjecucionLaunchHistory";
const COUNTERS_KEY = "modoEjecucionCounters";

function readArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeArray(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export const readHistory = () => readArray(ANTIFALL_HISTORY_KEY);
export const readLaunchHistory = () => readArray(LAUNCH_HISTORY_KEY);
export const saveActiveProtocol = (protocol) => localStorage.setItem(ANTIFALL_ACTIVE_KEY, JSON.stringify(protocol));
export const clearActiveProtocol = () => localStorage.removeItem(ANTIFALL_ACTIVE_KEY);

export function updateActiveProtocol(values) {
  try {
    const active = JSON.parse(localStorage.getItem(ANTIFALL_ACTIVE_KEY) || "null");
    if (active) saveActiveProtocol({ ...active, ...values });
  } catch {
    clearActiveProtocol();
  }
}

function readCounters() {
  try {
    return { antifallStarted: 0, launchStarted: 0, ...JSON.parse(localStorage.getItem(COUNTERS_KEY) || "{}") };
  } catch {
    return { antifallStarted: 0, launchStarted: 0 };
  }
}

export function recordProtocolStarted(module) {
  const counters = readCounters();
  const key = module === "launch10" ? "launchStarted" : "antifallStarted";
  counters[key] += 1;
  localStorage.setItem(COUNTERS_KEY, JSON.stringify(counters));
}

export function createProtocolRecord(protocol) {
  return {
    id: crypto.randomUUID(), module: "antifall",
    date: protocol.startedAt || new Date().toISOString(), endedAt: protocol.endedAt || new Date().toISOString(),
    problemId: protocol.problemId || "", problem: protocol.problem || "", details: protocol.details || "",
    reset: protocol.reset || "", emotion: protocol.emotion === "Otro" ? protocol.customEmotion : protocol.emotion,
    avoidedTask: protocol.avoidedTask || "", consequence: protocol.consequence || "",
    minimalAction: protocol.action || "", completed: Boolean(protocol.completed),
    abandoned: protocol.abandoned ?? !Boolean(protocol.completed),
    shield: protocol.shield === "Otro ajuste personalizado." ? protocol.customShield : protocol.shield,
    analysis: protocol.analysis || null
  };
}

export function saveProtocol(protocol) {
  const record = createProtocolRecord(protocol);
  writeArray(ANTIFALL_HISTORY_KEY, [record, ...readHistory()]);
  clearActiveProtocol();
  return record;
}

export function createLaunchRecord(launch) {
  return {
    ...launch, id: crypto.randomUUID(), module: "launch10",
    date: launch.startedAt || new Date().toISOString(), endedAt: launch.endedAt || new Date().toISOString(),
    completed: Boolean(launch.completed), abandoned: launch.abandoned ?? !Boolean(launch.completed)
  };
}

export function saveLaunch(launch) {
  const record = createLaunchRecord(launch);
  writeArray(LAUNCH_HISTORY_KEY, [record, ...readLaunchHistory()]);
  return record;
}

export function updateLatestLaunch(values) {
  const history = readLaunchHistory();
  if (history.length) writeArray(LAUNCH_HISTORY_KEY, [{ ...history[0], ...values }, ...history.slice(1)]);
}

export function markActiveFailureIfNeeded() {
  try {
    const active = JSON.parse(localStorage.getItem(ANTIFALL_ACTIVE_KEY) || "null");
    if (!active?.abandonedByClose || active.actionCompleted || !active.problemId) return false;
    saveProtocol({ ...active, completed: false });
    return true;
  } catch {
    clearActiveProtocol();
    return false;
  }
}

function bestStreak(history) {
  let best = 0, running = 0;
  for (const item of [...history].reverse()) {
    running = item.completed ? running + 1 : 0;
    best = Math.max(best, running);
  }
  return best;
}

function leadingStreak(history, completed) {
  let count = 0;
  for (const item of history) {
    if (Boolean(item.completed) !== completed) break;
    count += 1;
  }
  return count;
}

function mostRepeated(values) {
  const counts = new Map();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

export function getStats(history = readHistory(), problem = "") {
  const scoped = problem ? history.filter((item) => item.problemId === problem || item.problem === problem) : history;
  const completed = scoped.filter((item) => item.completed).length;
  return {
    total: problem ? scoped.length : Math.max(readCounters().antifallStarted, scoped.length), completed,
    failed: scoped.length - completed, failStreak: leadingStreak(scoped, false),
    completionStreak: leadingStreak(scoped, true), bestCompletionStreak: bestStreak(scoped),
    mostRepeatedProblem: mostRepeated(history.map((item) => item.problem)),
    mostRepeatedEmotion: mostRepeated(history.map((item) => item.emotion))
  };
}

export function getLaunchStats(history = readLaunchHistory()) {
  const completed = history.filter((item) => item.completed).length;
  return {
    total: Math.max(readCounters().launchStarted, history.length), completed, failed: history.length - completed,
    failStreak: leadingStreak(history, false), completionStreak: leadingStreak(history, true),
    bestCompletionStreak: bestStreak(history), mostRepeatedBlockage: mostRepeated(history.map((item) => item.blockage)),
    mostRepeatedExcuse: mostRepeated(history.map((item) => item.excuse))
  };
}

export function getCombinedStats(antiHistory = readHistory(), launchHistory = readLaunchHistory()) {
  const anti = getStats(antiHistory), launch = getLaunchStats(launchHistory);
  const recent = [...antiHistory, ...launchHistory].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
  return { anti, launch, total: anti.total + launch.total, completed: anti.completed + launch.completed,
    failed: anti.failed + launch.failed, bestStreak: Math.max(anti.bestCompletionStreak, launch.bestCompletionStreak),
    failStreak: Math.max(anti.failStreak, launch.failStreak), recent };
}

export const buildGeminiPayload = ({ protocol, stats, config }) => ({ protocol, stats, contexto: config.context, opciones: config });

export function fallbackAnalysis({ protocol, stats, firmness, config }) {
  const target = protocol.avoidedTask?.trim() || protocol.details?.trim() || "la tarea que estás evitando";
  let action = config.minimalActions[0];
  if (protocol.problemId === "procrastination") action = `Abre ${target} y trabaja solo 10 minutos en una parte concreta.`;
  if (protocol.problemId === "lowEnergy") action = `Haz durante 10 minutos la parte más mecánica de: ${target}.`;
  if (protocol.problemId === "doubts") action = `Define una prueba reversible sobre ${target} y ejecútala durante 10 minutos.`;
  if (protocol.problemId === "abandonment") action = `Haz una reparación visible de 10 minutos sobre: ${target}.`;
  if (protocol.problemId === "other") action = `Reduce ${target} a un solo paso visible y ejecútalo durante 10 minutos.`;
  return { diagnostico: `El patrón intenta alejarte de ${target}. Ejecuta el primer paso visible.`, tono: firmness.tone,
    reset_fisico: protocol.reset || config.resetOptions[0], accion_minima: action, mensaje_duro: firmness.message,
    blindaje_recomendado: config.shieldOptions[0], pregunta_reflexion: `¿Qué excusa apareció justo antes de evitar ${target}?`, stats };
}

export function detectLaunchCategory(task = "") {
  const value = task.toLowerCase();
  if (/buscar producto|producto ganador|winning/.test(value)) return "producto";
  if (/anuncio|ads|campaña|meta|tiktok|google/.test(value)) return "ads";
  if (/shopify|web|landing|hero|sección|pagina|página/.test(value)) return "shopify";
  if (/estudiar|examen|clase|tema|asignatura/.test(value)) return "estudio";
  if (/vídeo|video|grabar|editar|hook|guion/.test(value)) return "video";
  if (/negocio|cliente|venta|oferta|propuesta/.test(value)) return "negocio";
  return "otro";
}

const questionSets = {
  ads: [
    ["platform", "¿Dónde vas a promocionar el producto?", "single_choice", ["Meta Ads", "TikTok Ads", "Google Ads", "Orgánico", "Email", "Otro"]],
    ["assets", "¿Qué tienes ya preparado?", "single_choice", ["Nada", "Solo el producto", "Creativos hechos", "Copy hecho", "Campaña casi lista"]],
    ["missing", "¿Qué falta exactamente?", "single_choice", ["Creativo", "Copy", "Configuración", "Landing", "Oferta", "Presupuesto"]],
    ["product", "¿Cuál es el producto?", "text", []],
    ["goal", "¿Qué quieres dejar terminado en este bloque?", "text", []]
  ],
  shopify: [
    ["page", "¿Qué página vas a tocar?", "single_choice", ["Inicio", "Producto", "Colección", "Landing", "Carrito", "Otra"]],
    ["section", "¿Qué sección concreta?", "single_choice", ["Hero", "Beneficios", "Galería", "Oferta", "Reseñas", "Otra"]],
    ["state", "¿Cuál es el estado actual?", "single_choice", ["No existe", "Está rota", "Está incompleta", "Solo necesita cambios"]],
    ["product", "¿Para qué producto es?", "text", []],
    ["change", "¿Qué cambio visible quieres dejar hecho?", "text", []]
  ],
  estudio: [
    ["subject", "¿Qué asignatura estás estudiando?", "text", []],
    ["topic", "¿Qué tema exacto toca ahora?", "text", []],
    ["deadline", "¿Cuándo es el examen o entrega?", "text", []],
    ["difficulty", "¿Qué nivel de dificultad tiene?", "single_choice", ["Bajo", "Medio", "Alto", "No lo sé"]],
    ["time", "¿Cuánto tiempo tienes disponible?", "single_choice", ["10 min", "20 min", "30 min", "1 hora o más"]]
  ],
  video: [
    ["platform", "¿Para qué plataforma es?", "single_choice", ["TikTok", "Instagram", "YouTube", "Meta Ads", "Otra"]],
    ["format", "¿Qué formato necesitas?", "single_choice", ["Anuncio", "Vídeo corto", "Tutorial", "UGC", "Vídeo largo"]],
    ["script", "¿Ya tienes guion?", "single_choice", ["Sí", "No", "A medias", "Solo tengo el hook"]],
    ["duration", "¿Qué duración tendrá?", "single_choice", ["15 s", "30 s", "60 s", "Más de 1 min"]],
    ["state", "¿Qué falta exactamente?", "single_choice", ["Hook", "Guion", "Grabar", "Primer corte", "Editar", "Publicar"]]
  ],
  producto: [
    ["niche", "¿Qué nicho estás investigando?", "text", []],
    ["market", "¿En qué mercado venderás?", "text", []],
    ["tool", "¿Qué herramienta vas a usar?", "single_choice", ["Meta Ads Library", "TikTok Creative Center", "Minea", "Amazon", "Otra"]],
    ["criterion", "¿Qué criterio usarás para validar?", "single_choice", ["Demanda", "Margen", "Creativos", "Competencia", "Proveedor"]],
    ["quantity", "¿Cuántos candidatos necesitas?", "single_choice", ["1", "3", "5", "10"]]
  ],
  negocio: [
    ["area", "¿Qué área del negocio afecta?", "single_choice", ["Ventas", "Marketing", "Operaciones", "Producto", "Cliente"]],
    ["deliverable", "¿Qué entregable concreto necesitas?", "text", []],
    ["recipient", "¿Quién usará el resultado?", "text", []],
    ["state", "¿En qué estado está ahora?", "single_choice", ["Sin empezar", "Empezado", "Bloqueado", "Casi terminado"]]
  ],
  otro: [
    ["output", "¿Qué resultado visible quieres obtener?", "text", []],
    ["state", "¿Qué tienes ya hecho?", "text", []],
    ["missing", "¿Qué falta exactamente?", "text", []],
    ["tool", "¿Qué herramienta necesitas abrir?", "text", []]
  ]
};

export function getLocalLaunchQuestionnaire(task, blockage) {
  const category = detectLaunchCategory(task);
  return {
    category,
    intro: `Antes de crear el plan, necesito cerrar el alcance de esta tarea ${blockage ? `y cortar el bloqueo “${blockage}”` : ""}.`,
    questions: questionSets[category].map(([id, question, type, options]) => ({ id, question, type, options }))
  };
}

function answer(answers, key, fallback) {
  return String(answers?.[key] || fallback);
}

export function getLocalLaunchPlan(task, blockage, answers = {}, stats = getLaunchStats()) {
  const category = detectLaunchCategory(task);
  const plans = {
    ads: [
      ["Abrir la plataforma", `Abre ${answer(answers, "platform", "la plataforma publicitaria")} y entra en la cuenta correcta.`, 2, "Cuenta publicitaria abierta."],
      ["Crear la estructura", `Crea una campaña en borrador para ${answer(answers, "product", "el producto")} sin publicarla.`, 4, "Campaña nueva creada en borrador."],
      ["Cerrar lo que falta", `Trabaja solo en ${answer(answers, "missing", "el elemento pendiente")} con lo que ya existe.`, 6, "Elemento pendiente avanzado de forma visible."],
      ["Guardar el borrador", "Revisa el nombre y guarda sin ampliar el alcance.", 2, "Borrador guardado y localizable."]
    ],
    shopify: [
      ["Abrir el editor", `Abre ${answer(answers, "page", "la página indicada")} en Shopify.`, 2, "Página correcta abierta en el editor."],
      ["Aislar la sección", `Selecciona solo ${answer(answers, "section", "la sección pendiente")} y no toques el resto.`, 2, "Sección concreta seleccionada."],
      ["Hacer un cambio visible", answer(answers, "change", "Completa el cambio más visible de esa sección."), 7, "Cambio aplicado en la sección."],
      ["Previsualizar", "Comprueba móvil y escritorio y guarda.", 3, "Cambio guardado y comprobado."]
    ],
    estudio: [
      ["Abrir el material", `Abre únicamente ${answer(answers, "topic", "el tema indicado")} de ${answer(answers, "subject", "la asignatura")}.`, 2, "Tema correcto abierto."],
      ["Leer una unidad", "Lee una página o apartado y marca las tres ideas clave.", 7, "Tres ideas clave identificadas."],
      ["Comprobar comprensión", "Resuelve un ejercicio o explícalo en cinco líneas sin mirar.", 6, "Una comprobación de comprensión terminada."]
    ],
    video: [
      ["Abrir el proyecto", `Abre el proyecto para ${answer(answers, "platform", "la plataforma elegida")} y deja solo los archivos necesarios.`, 2, "Proyecto y recursos abiertos."],
      ["Cerrar el inicio", `Crea solo ${answer(answers, "state", "el hook o primer corte")} para un vídeo de ${answer(answers, "duration", "duración corta")}.`, 7, "Inicio del vídeo terminado."],
      ["Guardar versión 1", "Reproduce una vez, corrige solo un error evidente y guarda.", 4, "Primera versión guardada."]
    ],
    producto: [
      ["Abrir la fuente", `Abre ${answer(answers, "tool", "la herramienta de investigación")} con el mercado ${answer(answers, "market", "objetivo")}.`, 2, "Fuente de investigación abierta."],
      ["Aplicar un criterio", `Busca en ${answer(answers, "niche", "el nicho elegido")} usando solo el criterio ${answer(answers, "criterion", "principal")}.`, 8, "Primer candidato evaluado."],
      ["Registrar candidatos", `Guarda hasta ${answer(answers, "quantity", "3")} candidatos con enlace y una razón.`, 6, "Lista corta registrada."]
    ],
    negocio: [
      ["Abrir el entregable", `Crea o abre: ${answer(answers, "deliverable", task)}.`, 2, "Documento o herramienta abiertos."],
      ["Crear la versión mínima", `Escribe la versión mínima útil para ${answer(answers, "recipient", "su destinatario")}.`, 8, "Primera versión visible terminada."],
      ["Guardar siguiente decisión", "Anota una sola decisión pendiente y guarda.", 2, "Trabajo guardado con siguiente paso claro."]
    ],
    otro: [
      ["Abrir la herramienta", `Abre ${answer(answers, "tool", "la herramienta necesaria")} y elimina distracciones.`, 2, "Entorno preparado."],
      ["Crear el primer resultado", answer(answers, "output", `Haz el primer paso visible de: ${task}.`), 8, "Primer resultado visible creado."],
      ["Guardar y decidir", "Guarda el avance y escribe el siguiente paso exacto.", 2, "Avance guardado y próximo paso escrito."]
    ]
  };
  const steps = plans[category];
  const action = steps[0][1];
  return {
    diagnostico: `No te bloquea la capacidad. Te bloquea intentar abarcar “${task}” sin cerrar el alcance.`,
    categoria_tarea: category,
    accion_minima: action,
    duracion_recomendada: steps.reduce((sum, step) => sum + step[2], 0),
    pasos: steps.map(([titulo, descripcion, duracion_minutos, resultado]) => ({ titulo, descripcion, duracion_minutos, resultado })),
    primer_movimiento: action,
    mensaje_directo: stats.failStreak >= 2 ? "Ya has abandonado antes. Ejecuta el paso 1 sin abrir otra tarea." : "No completes todo. Ejecuta el paso 1.",
    no_hacer: ["No abrir otra tarea.", "No rediseñar todo el proyecto.", "No buscar más información de la necesaria."],
    siguiente_paso_si_termina: "Revisa el resultado visible y decide un único bloque adicional.",
    tono: stats.failStreak >= 3 ? "muy_duro" : stats.failStreak >= 2 ? "duro" : "directo",
    bloqueo: blockage
  };
}

export const getLocalLaunchProtocol = (launch, stats) => getLocalLaunchPlan(launch.task, launch.blockage, launch.answers, stats);
