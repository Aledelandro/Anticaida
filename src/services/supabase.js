import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;

export async function getProfile(userId) {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createProfile(user) {
  if (!supabase || !user) return null;
  const profile = { id: user.id, email: user.email, onboarding_completed: false };
  const { data, error } = await supabase.from("profiles").upsert(profile, { onConflict: "id" }).select().single();
  if (error) throw error;
  return data;
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
  if (readAnswersError) throw readAnswersError;
  const answersQuery = existingAnswers
    ? supabase.from("onboarding_answers").update({ answers }).eq("id", existingAnswers.id)
    : supabase.from("onboarding_answers").insert({ user_id: userId, answers });
  const { error: answersError } = await answersQuery;
  if (answersError) throw answersError;

  const memories = [
    ["main_goal", answers.main_goal],
    ["main_obstacle", answers.main_obstacle],
    ["motivation", answers.motivation],
    ["preferred_tone", answers.preferred_tone]
  ].filter(([, content]) => String(content || "").trim()).map(([memory_type, content]) => ({
    user_id: userId,
    memory_type,
    content: String(content).trim()
  }));

  if (memories.length) {
    for (const memory of memories) {
      const { data: existingMemory, error: readMemoryError } = await supabase
        .from("user_memory")
        .select("id")
        .eq("user_id", userId)
        .eq("memory_type", memory.memory_type)
        .maybeSingle();
      if (readMemoryError) throw readMemoryError;
      const memoryQuery = existingMemory
        ? supabase.from("user_memory").update({ content: memory.content }).eq("id", existingMemory.id)
        : supabase.from("user_memory").insert(memory);
      const { error: memoryError } = await memoryQuery;
      if (memoryError) throw memoryError;
    }
  }

  return updateProfile(userId, {
    name: String(answers.name || "").trim(),
    preferred_tone: answers.preferred_tone,
    onboarding_completed: true
  });
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
