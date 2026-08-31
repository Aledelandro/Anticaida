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

export function saveProtocol(protocol) {
  const record = {
    id: crypto.randomUUID(), module: "antifall",
    date: protocol.startedAt || new Date().toISOString(), endedAt: protocol.endedAt || new Date().toISOString(),
    problemId: protocol.problemId || "", problem: protocol.problem || "", details: protocol.details || "",
    reset: protocol.reset || "", emotion: protocol.emotion === "Otro" ? protocol.customEmotion : protocol.emotion,
    avoidedTask: protocol.avoidedTask || "", consequence: protocol.consequence || "",
    minimalAction: protocol.action || "", completed: Boolean(protocol.completed),
    shield: protocol.shield === "Otro ajuste personalizado." ? protocol.customShield : protocol.shield,
    analysis: protocol.analysis || null
  };
  writeArray(ANTIFALL_HISTORY_KEY, [record, ...readHistory()]);
  clearActiveProtocol();
  return record;
}

export function saveLaunch(launch) {
  const record = {
    ...launch, id: crypto.randomUUID(), module: "launch10",
    date: launch.startedAt || new Date().toISOString(), endedAt: launch.endedAt || new Date().toISOString(),
    completed: Boolean(launch.completed)
  };
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

export function getLocalLaunchProtocol(launch, stats = getLaunchStats()) {
  const actions = {
    "No sé por dónde empezar": ["Escribe el primer paso exacto y hazlo durante 10 minutos.", 10],
    "Me parece demasiado grande": ["Reduce la tarea a una sola parte y trabaja 10 minutos.", 10],
    "Me da pereza": ["Haz 5 minutos sin pensar en terminar.", 5],
    "Me da miedo hacerlo mal": ["Haz una versión mala e incompleta durante 10 minutos.", 10],
    "Estoy cansado": ["Haz una tarea mecánica de 5 minutos.", 5],
    "Quiero hacer otra cosa": ["Primero cumple 10 minutos. Luego decides.", 10],
    "Estoy buscando hacerlo perfecto": ["Haz la versión más simple y fea posible durante 10 minutos.", 10],
    Otro: ["Haz el primer paso visible durante 10 minutos.", 10]
  };
  const [action, duration] = actions[launch.blockage] || actions.Otro;
  return {
    diagnostico: `La tarea “${launch.task}” sigue siendo demasiado abierta para empezar sin fricción.`,
    excusa_traducida: launch.excuse?.trim() ? `“${launch.excuse.trim()}” es una forma de retrasar el primer movimiento.` : `“${launch.blockage}” está sustituyendo a la acción.`,
    accion_minima: action, duracion_recomendada: duration,
    primer_movimiento: `Abre ahora la herramienta necesaria para “${launch.task}” y deja solo eso visible.`,
    mensaje_directo: stats.failStreak >= 2 ? "Has repetido el abandono. Reduce el alcance y ejecuta sin negociar otra vez." : "No tienes que terminar. Tienes que romper el inicio.",
    siguiente_paso_si_termina: launch.desiredResult || "Define el siguiente paso visible.",
    tono: stats.failStreak >= 3 ? "muy_duro" : stats.failStreak >= 2 ? "duro" : "directo"
  };
}
