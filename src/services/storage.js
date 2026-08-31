const HISTORY_KEY = "sistemaAnticaidaHistory";
const ACTIVE_KEY = "sistemaAnticaidaActive";

export function readHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function saveActiveProtocol(protocol) {
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(protocol));
}

export function updateActiveProtocol(values) {
  const active = JSON.parse(localStorage.getItem(ACTIVE_KEY) || "null");
  if (!active) return;
  localStorage.setItem(ACTIVE_KEY, JSON.stringify({ ...active, ...values }));
}

export function clearActiveProtocol() {
  localStorage.removeItem(ACTIVE_KEY);
}

export function saveProtocol(protocol) {
  const history = readHistory();
  const emotion = protocol.emotion === "Otro" ? protocol.customEmotion : protocol.emotion;
  const shield = protocol.shield === "Otro ajuste personalizado." ? protocol.customShield : protocol.shield;
  const previousProblemStats = getStats(history, protocol.problemId || protocol.problem);
  const completed = Boolean(protocol.completed);
  const failStreak = completed ? 0 : previousProblemStats.failStreak + 1;
  const completionStreak = completed ? previousProblemStats.completionStreak + 1 : 0;

  const record = {
    id: crypto.randomUUID(),
    date: protocol.startedAt || new Date().toISOString(),
    endedAt: protocol.endedAt || new Date().toISOString(),
    problemId: protocol.problemId || "",
    problem: protocol.problem,
    details: protocol.details,
    reset: protocol.reset,
    emotion,
    avoidedTask: protocol.avoidedTask,
    consequence: protocol.consequence,
    minimalAction: protocol.action,
    completed,
    shield,
    failStreak,
    completionStreak,
    analysis: protocol.analysis
  };

  writeHistory([record, ...history]);
  clearActiveProtocol();
  return record;
}

export function markActiveFailureIfNeeded() {
  const active = JSON.parse(localStorage.getItem(ACTIVE_KEY) || "null");
  if (!active?.abandonedByClose || active.actionCompleted || (!active.problemId && !active.problem)) return false;
  saveProtocol({ ...active, completed: false, endedAt: new Date().toISOString() });
  return true;
}

function mostRepeated(items) {
  const counts = new Map();
  for (const item of items.filter(Boolean)) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

export function getStats(history, problem = "") {
  const scoped = problem
    ? history.filter((item) => item.problemId === problem || item.problem === problem)
    : history;
  const total = scoped.length;
  const completed = scoped.filter((item) => item.completed).length;
  const failed = total - completed;
  let failStreak = 0;
  let completionStreak = 0;
  let bestCompletionStreak = 0;

  for (const item of scoped) {
    if (item.completed) {
      if (failStreak === 0) completionStreak += 1;
    } else if (completionStreak === 0) {
      failStreak += 1;
    }
  }

  let running = 0;
  for (const item of [...scoped].reverse()) {
    if (item.completed) {
      running += 1;
      bestCompletionStreak = Math.max(bestCompletionStreak, running);
    } else {
      running = 0;
    }
  }

  return {
    total,
    completed,
    failed,
    failStreak,
    completionStreak,
    bestCompletionStreak,
    mostRepeatedProblem: mostRepeated(history.map((item) => item.problem)),
    mostRepeatedEmotion: mostRepeated(history.map((item) => item.emotion))
  };
}

export function buildGeminiPayload({ protocol, stats, previous, config }) {
  return {
    problema_id: protocol.problemId,
    problema_seleccionado: protocol.problem,
    contexto_del_problema: config.context,
    texto_usuario: protocol.details,
    emocion_seleccionada: protocol.emotion === "Otro" ? protocol.customEmotion : protocol.emotion,
    que_estaba_evitando: protocol.avoidedTask,
    historial_de_fallos: {
      total_protocolos_mismo_problema: stats.total,
      veces_completadas: stats.completed,
      veces_abandonadas: stats.failed,
      racha_fallos_seguidos: stats.failStreak,
      racha_acciones_minimas_completadas: stats.completionStreak
    },
    racha_actual: stats.failStreak,
    accion_minima_anterior: previous?.minimalAction || "",
    blindaje_anterior: previous?.shield || "",
    opciones_base_disponibles: {
      emociones: config.defaultEmotionOptions,
      resets_fisicos: config.resetOptions,
      acciones_minimas: config.minimalActions,
      blindajes: config.shieldOptions,
      mensajes_duros_base: config.hardMessages
    }
  };
}

function detailTarget(protocol) {
  const details = protocol.details?.trim();
  const avoided = protocol.avoidedTask?.trim();
  return details || avoided || "la tarea que estás evitando";
}

export function fallbackAnalysis({ protocol, stats, firmness, config }) {
  const target = detailTarget(protocol);
  const action = protocol.action || localActionForProblem(protocol.problemId, target, config, stats);

  return {
    diagnostico:
      `Estás usando ${config.context} para evitar: ${target}. No necesitas resolver todo ahora; necesitas abrir el punto concreto y ejecutar el primer movimiento.`,
    tono: firmness.tone,
    reset_fisico: protocol.reset || config.resetOptions[0],
    accion_minima: personalizeAction(action, target),
    mensaje_duro: `${firmness.message} Objetivo inmediato: ${target}.`,
    blindaje_recomendado: config.shieldOptions[0],
    pregunta_reflexion: `¿Qué excusa apareció justo antes de evitar ${target}?`
  };
}

function personalizeAction(action, target) {
  if (!target || target === "la tarea que estás evitando") return action;
  if (action.includes(target)) return action;
  if (action.toLowerCase().includes("10 minutos")) {
    return `Trabaja 10 minutos en esto: ${target}. Cambia una sola cosa concreta y no negocies.`;
  }
  return `${action} Aplicado ahora a: ${target}.`;
}

function localActionForProblem(problemId, target, config, stats) {
  if (problemId === "procrastination") {
    return `Abre exactamente esto: ${target}. Trabaja 10 minutos y cambia solo una parte concreta. Si es un anuncio, edita únicamente el primer hook.`;
  }
  if (problemId === "lowEnergy") {
    return `Haz 10 minutos a ritmo bajo sobre esto: ${target}. Solo abre, ordena y completa el paso más fácil que siga moviendo el trabajo.`;
  }
  if (problemId === "doubts") {
    return `Convierte la duda en una prueba: define una decisión reversible sobre ${target} y ejecuta el primer paso durante 10 minutos.`;
  }
  if (problemId === "abandonment") {
    return `Haz una reparación de 10 minutos sobre esto: ${target}. No compenses todo; vuelve al sistema con una acción visible.`;
  }
  if (problemId === "other") {
    return `Reduce el problema a una acción mínima: trabaja 10 minutos en ${target} sin cambiar de tarea.`;
  }
  return stats.failStreak >= 3
    ? config.minimalActions[0]
    : config.minimalActions[Math.min(1, config.minimalActions.length - 1)];
}
