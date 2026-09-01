import { createClient } from "@supabase/supabase-js";

export function normalizeSupabaseUrl(value) {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/rest\/v1$/i, "");
}

const supabaseUrl = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
const missingSupabaseVariables = [
  !supabaseUrl && "VITE_SUPABASE_URL",
  !import.meta.env.VITE_SUPABASE_ANON_KEY && "VITE_SUPABASE_ANON_KEY"
].filter(Boolean);

export const supabaseConfigurationError = missingSupabaseVariables.length
  ? `Faltan variables de Supabase: ${missingSupabaseVariables.join(", ")}.`
  : "";

export const isSupabaseConfigured = !supabaseConfigurationError;

export const supabase = isSupabaseConfigured
  ? createClient(normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL), import.meta.env.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;

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

export async function saveOnboarding(userId, answers) {
  if (!supabase || !userId) throw new Error("Supabase no está configurado.");

  const { data: existingAnswers, error: readAnswersError } = await supabase
    .from("onboarding_answers")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (readAnswersError) throw onboardingTableError(readAnswersError);
  const answersQuery = existingAnswers
    ? supabase.from("onboarding_answers").update({ answers }).eq("id", existingAnswers.id)
    : supabase.from("onboarding_answers").insert({ user_id: userId, answers });
  const { error: answersError } = await answersQuery;
  if (answersError) throw onboardingTableError(answersError);

  const memories = [
    ["profile", "display_name", answers.name],
    ["goals", "main_goal", answers.main_goal],
    ["goals", "motivation", answers.motivation],
    ["work_style", "preferred_work_style", answers.work_style],
    ["distractions", "main_distraction", answers.main_distraction],
    ["tone", "tone_preference", answers.tone_preference],
    ["tools", "preferred_tools", answers.tools]
  ].filter(([, , value]) => String(value || "").trim()).map(([category, memory_key, value]) => ({
    user_id: userId,
    category,
    memory_key,
    memory_value: { value: String(value).trim() }
  }));

  if (memories.length) {
    for (const memory of memories) {
      const { data: existingMemory, error: readMemoryError } = await supabase
        .from("user_memory")
        .select("id")
        .eq("user_id", userId)
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

  return updateProfile(userId, {
    name: String(answers.name || "").trim(),
    tone_preference: answers.tone_preference,
    onboarding_completed: true
  });
}

function isMissingTable(error, table) {
  const message = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return error?.code === "PGRST205" || (message.includes(table.toLowerCase()) && message.includes("schema cache"));
}

function onboardingTableError(error) {
  if (!isMissingTable(error, "onboarding_answers")) return error;
  const friendlyError = new Error("Falta crear la tabla onboarding_answers en Supabase.");
  friendlyError.code = "MISSING_ONBOARDING_ANSWERS";
  return friendlyError;
}

function memoryTableError(error) {
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
