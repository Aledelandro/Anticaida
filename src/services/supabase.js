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
  if (!supabase || !userId) return { profile: null, userMemory: [], antiFallSessions: [], launch10Sessions: [] };
  const [profile, userMemory, antiFallSessions, launch10Sessions] = await Promise.all([
    getProfile(userId),
    getUserMemory(userId),
    getRecent("anti_fall_sessions", userId),
    getRecent("launch10_sessions", userId)
  ]);
  return { profile, userMemory, antiFallSessions, launch10Sessions };
}

export async function saveAntiFallSession(userId, record) {
  if (!supabase || !userId) return null;
  const row = {
    user_id: userId,
    problem_id: record.problemId,
    problem: record.problem,
    details: record.details,
    reset_action: record.reset,
    emotion: record.emotion,
    avoided_task: record.avoidedTask,
    consequence: record.consequence,
    minimal_action: record.minimalAction,
    shield: record.shield,
    completed: record.completed,
    analysis: record.analysis,
    started_at: record.date,
    ended_at: record.endedAt
  };
  const { data, error } = await supabase.from("anti_fall_sessions").insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function saveLaunch10Session(userId, record) {
  if (!supabase || !userId) return null;
  const row = {
    user_id: userId,
    task: record.task,
    desired_result: record.desiredResult,
    blockage: record.blockage,
    excuse: record.excuse,
    questionnaire: record.questionnaire,
    answers: record.answers,
    plan: record.analysis,
    duration: record.duration,
    actual_result: record.actualResult,
    completed: record.completed,
    started_at: record.date,
    ended_at: record.endedAt
  };
  const { data, error } = await supabase.from("launch10_sessions").insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function updateLaunch10Session(sessionId, values) {
  if (!supabase || !sessionId) return null;
  const { data, error } = await supabase.from("launch10_sessions").update(values).eq("id", sessionId).select().single();
  if (error) throw error;
  return data;
}
