import { createClient } from "@supabase/supabase-js";

export function normalizeSupabaseUrl(value) {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/rest\/v1$/i, "");
}

const supabaseUrl = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

function isValidSupabaseUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.pathname.replaceAll("/", "");
  } catch {
    return false;
  }
}

const missingSupabaseVariables = [
  !supabaseUrl && "VITE_SUPABASE_URL",
  !supabaseAnonKey && "VITE_SUPABASE_ANON_KEY"
].filter(Boolean);

export const supabaseConfigurationError = missingSupabaseVariables.length
  ? `Faltan variables de Supabase: ${missingSupabaseVariables.join(", ")}.`
  : !isValidSupabaseUrl(supabaseUrl)
    ? "VITE_SUPABASE_URL no es una URL válida de proyecto Supabase."
    : "";

export const isSupabaseConfigured = !supabaseConfigurationError;

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;

export async function debugSupabaseConnection() {
  const result = {
    hasUrl: Boolean(supabaseUrl),
    hasAnonKey: Boolean(supabaseAnonKey),
    url: supabaseUrl || null,
    hasSession: false,
    hasUserId: false,
    userId: null,
    profiles: { ok: false, error: null },
    onboardingAnswers: { ok: false, error: null }
  };

  if (!supabase) {
    console.error("Supabase configuration error:", supabaseConfigurationError);
    return result;
  }

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  result.hasSession = Boolean(session);
  if (sessionError) console.error("Supabase session error:", sessionError);

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  result.hasUserId = Boolean(user?.id);
  result.userId = user?.id || null;
  if (userError) console.error("Supabase user error:", userError);

  const { error: profilesError } = await supabase.from("profiles").select("id").limit(1);
  result.profiles = { ok: !profilesError, error: profilesError || null };
  if (profilesError) console.error("Supabase profiles error:", profilesError);

  const { error: onboardingError } = await supabase.from("onboarding_answers").select("user_id").limit(1);
  result.onboardingAnswers = { ok: !onboardingError, error: onboardingError || null };
  if (onboardingError) console.error("Supabase onboarding_answers error:", onboardingError);

  console.info("Supabase connection debug:", result);
  return result;
}

export async function getProfile(userId) {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function ensureUserProfile(user) {
  if (!supabase || !user) return null;
  const existingProfile = await getProfile(user.id);
  if (existingProfile) return existingProfile;

  const profile = {
    id: user.id,
    email: user.email,
    onboarding_completed: false,
    tone_preference: "directo"
  };
  const { data, error } = await supabase.from("profiles").insert(profile).select().single();
  if (!error) return data;
  if (error.code === "23505") return getProfile(user.id);
  throw error;
}

export async function updateProfile(userId, values) {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase.from("profiles").update(values).eq("id", userId).select().single();
  if (error) throw error;
  return data;
}

export async function saveOnboarding(answers, questions = []) {
  if (!supabase) throw new Error(supabaseConfigurationError || "Supabase no está configurado.");

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error("No hay usuario activo");

  const answerRows = questions.map((item, index) => ({
    user_id: user.id,
    block_number: item.block_number ?? index + 1,
    question_id: item.id,
    question: item.title || item.question || item.id,
    answer: toJsonAnswer(answers[item.id])
  }));

  if (!answerRows.length) throw new Error("No hay respuestas de onboarding para guardar.");

  for (const row of answerRows) {
    const { data: existingAnswer, error: readAnswerError } = await supabase
      .from("onboarding_answers")
      .select("question_id")
      .eq("user_id", user.id)
      .eq("question_id", row.question_id)
      .limit(1)
      .maybeSingle();
    if (readAnswerError) throw onboardingAnswersError(readAnswerError);

    const answerQuery = existingAnswer
      ? supabase
          .from("onboarding_answers")
          .update(row)
          .eq("user_id", user.id)
          .eq("question_id", row.question_id)
      : supabase.from("onboarding_answers").insert(row);
    const { error: answerError } = await answerQuery;
    if (answerError) throw onboardingAnswersError(answerError);
  }

  const memories = [
    ["profile", "display_name", answers.name],
    ["goals", "main_goal", answers.main_goal],
    ["goals", "motivation", answers.motivation],
    ["work_style", "preferred_work_style", answers.work_style],
    ["distractions", "main_distraction", answers.main_distraction],
    ["tone", "tone_preference", answers.tone_preference],
    ["tools", "preferred_tools", answers.tools]
  ].filter(([, , value]) => String(value || "").trim()).map(([category, memory_key, value]) => ({
    user_id: user.id,
    category,
    memory_key,
    memory_value: { value: String(value).trim() }
  }));

  if (memories.length) {
    for (const memory of memories) {
      const { data: existingMemory, error: readMemoryError } = await supabase
        .from("user_memory")
        .select("id")
        .eq("user_id", user.id)
        .eq("category", memory.category)
        .eq("memory_key", memory.memory_key)
        .maybeSingle();
      if (readMemoryError) throw memoryTableError(readMemoryError);
      const memoryQuery = existingMemory
        ? supabase.from("user_memory").update({ memory_value: memory.memory_value }).eq("id", existingMemory.id)
        : supabase.from("user_memory").insert(memory);
      const { error: memoryError } = await memoryQuery;
      if (memoryError) throw memoryTableError(memoryError);
    }
  }

  return updateProfile(user.id, {
    name: String(answers.name || "").trim(),
    tone_preference: answers.tone_preference,
    onboarding_completed: true
  });
}

function toJsonAnswer(value) {
  const normalized = typeof value === "string" ? { value } : value ?? { value: null };
  try {
    return JSON.parse(JSON.stringify(normalized));
  } catch {
    throw new Error("Una respuesta del onboarding no contiene JSON válido.");
  }
}

function isSchemaCacheError(error, table) {
  const message = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return error?.code === "PGRST205" || (message.includes(table.toLowerCase()) && message.includes("schema cache"));
}

function isMissingTable(error, table) {
  const message = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return error?.code === "42P01" && message.includes(table.toLowerCase());
}

function onboardingAnswersError(error) {
  console.error("Supabase onboarding_answers error:", error);
  if (isSchemaCacheError(error, "onboarding_answers")) {
    const schemaError = new Error("Supabase no reconoce la tabla todavía. Ejecuta notify pgrst, 'reload schema';");
    schemaError.code = "ONBOARDING_SCHEMA_CACHE";
    schemaError.cause = error;
    return schemaError;
  }
  if (isMissingTable(error, "onboarding_answers")) {
    const missingError = new Error("Falta crear la tabla onboarding_answers en Supabase.");
    missingError.code = "MISSING_ONBOARDING_ANSWERS";
    missingError.cause = error;
    return missingError;
  }
  return error;
}

function memoryTableError(error) {
  if (isSchemaCacheError(error, "user_memory")) {
    const schemaError = new Error("Supabase no reconoce la tabla user_memory todavía. Recarga la caché del esquema.");
    schemaError.code = "USER_MEMORY_SCHEMA_CACHE";
    schemaError.cause = error;
    return schemaError;
  }
  if (!isMissingTable(error, "user_memory")) return error;
  const friendlyError = new Error("Falta crear la tabla user_memory en Supabase.");
  friendlyError.code = "MISSING_USER_MEMORY";
  return friendlyError;
}

export async function getUserMemory(userId) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase.from("user_memory").select("*").eq("user_id", userId);
  if (error) throw error;
  return data || [];
}

async function getRecent(table, userId, limit = 5) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function loadUserContext(userId) {
  if (!supabase || !userId) return { profile: null, userMemory: [], antiFallSessions: [], launch10Sessions: [], deepWorkSessions: [] };
  const [profile, userMemory, antiFallSessions, launch10Sessions, deepWorkSessions] = await Promise.all([
    getProfile(userId),
    getUserMemory(userId),
    getRecent("anti_fall_sessions", userId),
    getRecent("launch10_sessions", userId),
    getRecent("deep_work_sessions", userId)
  ]);
  return { profile, userMemory, antiFallSessions, launch10Sessions, deepWorkSessions };
}

export async function saveAntiFallSession(antiFallData) {
  if (!supabase) {
    const configurationError = new Error(supabaseConfigurationError || "Supabase no está configurado.");
    console.error("Error guardando anti_fall_sessions:", configurationError);
    throw configurationError;
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (!user) {
    const sessionError = new Error("No hay sesión activa. Vuelve a iniciar sesión.");
    if (userError) console.error("Error obteniendo sesión para anti_fall_sessions:", userError);
    console.error("Error guardando anti_fall_sessions:", sessionError);
    throw sessionError;
  }
  if (userError) {
    console.error("Error obteniendo sesión para anti_fall_sessions:", userError);
    throw userError;
  }

  const payload = cleanUndefined({
    user_id: user.id,
    problem: antiFallData.problem || "",
    details: antiFallData.details || "",
    emotion: antiFallData.emotion || "",
    avoided_task: antiFallData.avoidedTask || antiFallData.avoided_task || "",
    minimal_action: antiFallData.minimalAction || antiFallData.minimal_action || "",
    shield: antiFallData.shield || "",
    completed: Boolean(antiFallData.completed),
    abandoned: Boolean(antiFallData.abandoned),
    failure_streak: Number(antiFallData.failureStreak ?? antiFallData.failure_streak ?? 0),
    ai_result: antiFallData.aiResult || antiFallData.ai_result || {}
  });

  const { data, error } = await supabase.from("anti_fall_sessions").insert(payload).select().single();
  if (error) {
    console.error("Error guardando anti_fall_sessions:", error);
    console.error("Payload anti_fall_sessions:", payload);
    throw error;
  }
  return data;
}

export async function saveLaunch10Session(launchData) {
  if (!supabase) {
    const configurationError = new Error(supabaseConfigurationError || "Supabase no está configurado.");
    console.error("Error guardando launch10_sessions:", configurationError);
    throw configurationError;
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (!user) {
    const sessionError = new Error("No hay sesión activa. Vuelve a iniciar sesión.");
    if (userError) console.error("Error obteniendo sesión para launch10_sessions:", userError);
    console.error("Error guardando launch10_sessions:", sessionError);
    throw sessionError;
  }
  if (userError) {
    console.error("Error obteniendo sesión para launch10_sessions:", userError);
    throw userError;
  }

  const payload = cleanUndefined({
    user_id: user.id,
    task: launchData.task || "",
    desired_result: launchData.desiredResult || launchData.desired_result || "",
    blockage: launchData.blockage || "",
    excuse: launchData.excuse || "",
    questionnaire_answers: launchData.questionnaireAnswers || launchData.questionnaire_answers || {},
    plan: launchData.plan || {},
    completed: Boolean(launchData.completed),
    abandoned: Boolean(launchData.abandoned),
    result_text: launchData.resultText || launchData.result_text || ""
  });

  const { data, error } = await supabase.from("launch10_sessions").insert(payload).select().single();
  if (error) {
    console.error("Error guardando launch10_sessions:", error);
    console.error("Payload launch10_sessions:", payload);
    throw error;
  }
  return data;
}

export async function updateLaunch10Session(sessionId, values) {
  if (!supabase || !sessionId) return null;
  const payload = cleanUndefined({
    result_text: values.resultText || values.result_text || ""
  });
  const { data, error } = await supabase.from("launch10_sessions").update(payload).eq("id", sessionId).select().single();
  if (error) {
    console.error("Error actualizando launch10_sessions:", error);
    console.error("Payload launch10_sessions:", payload);
    throw error;
  }
  return data;
}

export async function saveDeepWorkSession(deepWorkData) {
  if (!supabase) throw new Error(supabaseConfigurationError || "Supabase no está configurado.");
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error("No hay sesión activa. Vuelve a iniciar sesión.");
  const payload = cleanUndefined({
    user_id: user.id,
    task: deepWorkData.task || "",
    desired_result: deepWorkData.desiredResult || "",
    duration_minutes: Number(deepWorkData.durationMinutes || 45),
    distractions: deepWorkData.distractions || [],
    ai_plan: deepWorkData.analysis || {},
    completed: Boolean(deepWorkData.completed),
    abandoned: Boolean(deepWorkData.abandoned),
    success_level: deepWorkData.successLevel || null,
    actual_result: deepWorkData.actualResult || "",
    pending: deepWorkData.pending || "",
    distraction_report: [deepWorkData.distracted, deepWorkData.distractionReport].filter(Boolean).join(" — "),
    steps_completed: Number(deepWorkData.stepsCompleted || 0)
  });
  const { data, error } = await supabase.from("deep_work_sessions").insert(payload).select().single();
  if (error) {
    console.error("Error guardando deep_work_sessions:", error);
    console.error("Payload deep_work_sessions:", payload);
    throw error;
  }
  return data;
}

export async function updateDeepWorkMemory(userId, session) {
  if (!supabase || !userId) return;
  const memories = [
    ["deep_work", "last_session", { task: session.task, duration_minutes: session.durationMinutes, success: session.successLevel, abandoned: session.abandoned }],
    ["work_style", "deep_work_duration", { value: session.completed ? session.durationMinutes : null, successful: Boolean(session.completed) }],
    ["patterns", "deep_work_outcome", { task: session.task, success: session.successLevel, abandoned: session.abandoned }]
  ];
  if (session.distractionReport || session.distractions?.length) memories.push([
    "distractions", "deep_work_latest", { selected: session.distractions || [], reported: session.distractionReport || "" }
  ]);
  for (const [category, memory_key, memory_value] of memories) {
    const { error } = await supabase.from("user_memory").upsert({
      user_id: userId, category, memory_key, memory_value, updated_at: new Date().toISOString()
    }, { onConflict: "user_id,category,memory_key" });
    if (error) throw memoryTableError(error);
  }
}

export async function getCoachHistory(userId, limit = 30) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from("coach_messages")
    .select("id,role,message,ai_result,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).reverse();
}

export async function saveCoachExchange(userId, userMessage, assistantResponse) {
  if (!supabase || !userId) throw new Error(supabaseConfigurationError || "Supabase no está configurado.");
  const { data, error } = await supabase.from("coach_messages").insert([
    { user_id: userId, role: "user", message: String(userMessage || "").trim(), ai_result: null },
    { user_id: userId, role: "assistant", message: assistantResponse?.respuesta || "", ai_result: assistantResponse }
  ]).select();
  if (error) throw error;
  return data;
}

export async function saveCoachMemories(userId, memories = []) {
  if (!supabase || !userId || !memories.length) return;
  for (const memory of memories) {
    const { error } = await supabase.from("user_memory").upsert({
      user_id: userId,
      category: memory.category,
      memory_key: memory.memory_key,
      memory_value: memory.memory_value,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id,category,memory_key" });
    if (error) throw memoryTableError(error);
  }
}

function cleanUndefined(payload) {
  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined) payload[key] = null;
  });
  return payload;
}
