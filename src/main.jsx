import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, AlertTriangle, BarChart3, CheckCircle2, ChevronLeft, Clock, Dumbbell, Flame, Lock, LogOut, Play, Rocket, RotateCcw, Shield, Target, User, XCircle } from "lucide-react";
import "./styles.css";
import { getProblemConfig, problemOptions } from "./problemConfigs";
import { analyzeAntiFallWithGemini, analyzeLaunchWithGemini, generateLaunchQuestionnaireWithGemini } from "./services/gemini";
import {
  buildGeminiPayload, createLaunchRecord, createProtocolRecord, fallbackAnalysis, getCombinedStats, getLaunchStats, getLocalLaunchPlan, getLocalLaunchQuestionnaire, getStats,
  markActiveFailureIfNeeded, readHistory, readLaunchHistory, recordProtocolStarted, saveActiveProtocol,
  saveLaunch, saveProtocol, updateActiveProtocol, updateLatestLaunch
} from "./services/storage";
import {
  debugSupabaseConnection, ensureUserProfile, isSupabaseConfigured, loadUserContext, saveAntiFallSession,
  saveLaunch10Session, saveOnboarding, supabase, supabaseConfigurationError, updateLaunch10Session, updateProfile
} from "./services/supabase";

const initialProtocol = {
  problemId: "", problem: "", details: "", reset: "", emotion: "", customEmotion: "",
  avoidedTask: "", consequence: "", action: "", shield: "", customShield: "", analysis: null,
  actionCompleted: false, startedAt: ""
};

const initialLaunch = {
  task: "", desiredResult: "", blockage: "", customBlockage: "", excuse: "", analysis: null,
  questionnaire: null, answers: {}, duration: 10, actualResult: "", completed: false, startedAt: "", saved: false
};

const launchBlockages = [
  "No sé por dónde empezar", "Me parece demasiado grande", "Me da pereza", "Me da miedo hacerlo mal",
  "Estoy cansado", "Quiero hacer otra cosa", "Estoy buscando hacerlo perfecto", "Otro"
];

function toneFromFailures(failStreak, config) {
  const messages = config?.hardMessages || [];
  if (failStreak >= 4) return { level: 4, tone: "muy_duro", message: messages[3] || "No negocies. Ejecuta la acción mínima." };
  if (failStreak >= 3) return { level: 3, tone: "duro", message: messages[2] || "Estás repitiendo el patrón. Muévete." };
  if (failStreak >= 2) return { level: 2, tone: "directo", message: messages[1] || "Esto ya es un patrón. Córtalo ahora." };
  return { level: 1, tone: "normal", message: messages[0] || "Puedes reajustar ahora." };
}

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataMessage, setDataMessage] = useState("");
  const [currentModule, setCurrentModule] = useState("menu");
  const [antiStep, setAntiStep] = useState("home");
  const [launchStep, setLaunchStep] = useState("home");
  const [protocol, setProtocol] = useState(initialProtocol);
  const [launch, setLaunch] = useState(initialLaunch);
  const [antiHistory, setAntiHistory] = useState(() => readHistory());
  const [launchHistory, setLaunchHistory] = useState(() => readLaunchHistory());
  const [loading, setLoading] = useState(false);

  const antiStats = useMemo(() => getStats(antiHistory), [antiHistory]);
  const launchStats = useMemo(() => getLaunchStats(launchHistory), [launchHistory]);
  const combinedStats = useMemo(() => getCombinedStats(antiHistory, launchHistory), [antiHistory, launchHistory]);
  const config = getProblemConfig(protocol.problemId);
  const problemStats = useMemo(() => getStats(antiHistory, protocol.problemId), [antiHistory, protocol.problemId]);
  const firmness = toneFromFailures(problemStats.failStreak, config);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return undefined;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setProfile(null);
        setCurrentModule("menu");
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (authLoading || !supabase) return;
    debugSupabaseConnection().catch((error) => console.error("Supabase connection debug error:", error));
  }, [authLoading, session?.user?.id]);

  useEffect(() => {
    if (!session?.user) return;
    let active = true;
    async function hydrate() {
      try {
        const nextProfile = await ensureUserProfile(session.user);
        if (!active) return;
        setProfile(nextProfile);
        const context = await loadUserContext(session.user.id);
        if (!active) return;
        setAntiHistory(context.antiFallSessions.map(normalizeAntiSession));
        setLaunchHistory(context.launch10Sessions.map(normalizeLaunchSession));
        setDataMessage("");
      } catch (error) {
        if (!active) return;
        console.error("Supabase hydration error:", error);
        setDataMessage(error?.message || "No se pudo cargar la información de Supabase.");
        if (markActiveFailureIfNeeded()) setAntiHistory(readHistory());
        setProfile((current) => current || {
          id: session.user.id, email: session.user.email, onboarding_completed: false
        });
      }
    }
    hydrate();
    return () => { active = false; };
  }, [session?.user?.id]);

  useEffect(() => {
    const beforeUnload = (event) => {
      if (currentModule === "antifall" && !["home", "summary"].includes(antiStep) && protocol.problemId) {
        updateActiveProtocol({ abandonedByClose: true });
        event.preventDefault();
        event.returnValue = "Hay un protocolo activo.";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [currentModule, antiStep, protocol.problemId]);

  function patchProtocol(values) {
    setProtocol((current) => {
      const next = { ...current, ...values };
      updateActiveProtocol(next);
      return next;
    });
  }

  function patchLaunch(values) {
    setLaunch((current) => ({ ...current, ...values }));
  }

  function openModule(module) {
    setCurrentModule(module);
    if (module === "antifall") setAntiStep("home");
    if (module === "launch10") setLaunchStep("home");
  }

  async function persistAnti(finished) {
    const record = createProtocolRecord(finished);
    try {
      const remote = await saveAntiFallSession(session.user.id, record);
      const saved = { ...record, id: remote?.id || record.id };
      setAntiHistory((history) => [saved, ...history]);
      return saved;
    } catch {
      const saved = saveProtocol(finished);
      setAntiHistory(readHistory());
      setDataMessage("No se pudo guardar en Supabase. La sesión quedó respaldada localmente.");
      return saved;
    }
  }

  async function persistLaunch(finished) {
    const record = createLaunchRecord(finished);
    try {
      const remote = await saveLaunch10Session(session.user.id, record);
      const saved = { ...record, id: remote?.id || record.id, remoteSessionId: remote?.id };
      setLaunchHistory((history) => [saved, ...history]);
      return saved;
    } catch {
      const saved = saveLaunch(finished);
      setLaunchHistory(readLaunchHistory());
      setDataMessage("No se pudo guardar en Supabase. La sesión quedó respaldada localmente.");
      return saved;
    }
  }

  async function getGeminiContext() {
    try {
      return await loadUserContext(session.user.id);
    } catch {
      return {
        profile,
        userMemory: [],
        antiFallSessions: antiHistory.slice(0, 5),
        launch10Sessions: launchHistory.slice(0, 5)
      };
    }
  }

  async function goMenu() {
    if (currentModule === "antifall" && !["home", "summary"].includes(antiStep) && protocol.startedAt) {
      await persistAnti({ ...protocol, completed: false, endedAt: new Date().toISOString() });
      setProtocol(initialProtocol);
    }
    if (currentModule === "launch10" && !["home", "summary"].includes(launchStep) && launch.startedAt && !launch.saved) {
      await persistLaunch({ ...launch, blockage: effectiveBlockage(launch), completed: false });
      setLaunch(initialLaunch);
    }
    setCurrentModule("menu");
  }

  function startAntiFall() {
    const fresh = { ...initialProtocol, startedAt: new Date().toISOString() };
    recordProtocolStarted("antifall");
    setProtocol(fresh);
    saveActiveProtocol(fresh);
    setAntiStep("problem");
  }

  async function prepareAntiAnalysis() {
    const local = fallbackAnalysis({ protocol, stats: problemStats, firmness, config });
    patchProtocol({ analysis: local, action: local.accion_minima });
    setAntiStep("reset");
    setLoading(true);
    const userContext = await getGeminiContext();
    const result = await analyzeAntiFallWithGemini({ ...buildGeminiPayload({ protocol, stats: problemStats, config }), userContext });
    if (result) patchProtocol({ analysis: { ...local, ...result }, action: result.accion_minima || local.accion_minima });
    setLoading(false);
  }

  async function generateAntiAction() {
    const local = fallbackAnalysis({ protocol, stats: problemStats, firmness, config });
    patchProtocol({ analysis: local, action: local.accion_minima });
    setAntiStep("action");
    setLoading(true);
    const userContext = await getGeminiContext();
    const result = await analyzeAntiFallWithGemini({ ...buildGeminiPayload({ protocol, stats: problemStats, config }), userContext });
    if (result) patchProtocol({ analysis: { ...local, ...result }, action: result.accion_minima || local.accion_minima });
    setLoading(false);
  }

  async function finishAntiFall() {
    const finished = { ...protocol, completed: true, actionCompleted: true, endedAt: new Date().toISOString() };
    setProtocol(finished);
    await persistAnti(finished);
    setAntiStep("summary");
  }

  function startLaunch() {
    recordProtocolStarted("launch10");
    setLaunch({ ...initialLaunch, startedAt: new Date().toISOString() });
    setLaunchStep("task");
  }

  async function generateLaunchQuestionnaire() {
    const local = getLocalLaunchQuestionnaire(launch.task, effectiveBlockage(launch));
    patchLaunch({ questionnaire: local, answers: {} });
    setLaunchStep("questionnaire");
    setLoading(true);
    const userContext = await getGeminiContext();
    const result = await generateLaunchQuestionnaireWithGemini({
      task: launch.task, desiredResult: launch.desiredResult, blockage: effectiveBlockage(launch), excuse: launch.excuse,
      userContext
    });
    patchLaunch({ questionnaire: normalizeQuestionnaire(result, local) });
    setLoading(false);
  }

  async function generateLaunchAction() {
    const local = getLocalLaunchPlan(launch.task, effectiveBlockage(launch), launch.answers, launchStats);
    patchLaunch({ analysis: local, duration: local.duracion_recomendada });
    setLaunchStep("action");
    setLoading(true);
    const userContext = await getGeminiContext();
    const result = await analyzeLaunchWithGemini({
      tarea: launch.task, resultado_deseado: launch.desiredResult, bloqueo: effectiveBlockage(launch), excusa: launch.excuse,
      respuestas_cuestionario: launch.answers, preguntas: launch.questionnaire?.questions,
      historial: { total: launchStats.total, completados: launchStats.completed, abandonados: launchStats.failed },
      racha_abandonos: launchStats.failStreak, racha_completados: launchStats.completionStreak,
      ultimos_5: launchHistory.slice(0, 5), userContext
    });
    const plan = normalizeLaunchPlan(result, local);
    patchLaunch({ analysis: plan, duration: plan.duracion_recomendada });
    setLoading(false);
  }

  async function finishLaunch(completed) {
    const finished = { ...launch, blockage: effectiveBlockage(launch), completed, saved: true, endedAt: new Date().toISOString() };
    const saved = await persistLaunch(finished);
    setLaunch({ ...finished, remoteSessionId: saved.remoteSessionId });
    setLaunchStep("summary");
  }

  async function saveLaunchResult() {
    try {
      if (!launch.remoteSessionId) throw new Error("No remote session");
      await updateLaunch10Session(launch.remoteSessionId, { actual_result: launch.actualResult });
      setLaunchHistory((history) => history.map((item, index) => index ? item : { ...item, actualResult: launch.actualResult }));
    } catch {
      updateLatestLaunch({ actualResult: launch.actualResult });
      setLaunchHistory(readLaunchHistory());
      setDataMessage("No se pudo actualizar Supabase. El resultado quedó respaldado localmente.");
    }
    patchLaunch({ saved: true });
  }

  if (authLoading) return <AppLoading text="Comprobando sesión…" />;
  if (!isSupabaseConfigured) return <AppLoading text={supabaseConfigurationError} />;
  if (!session) return <AuthScreen />;
  if (!profile) return <AppLoading text="Cargando tu perfil…" />;
  if (!profile.onboarding_completed) return <OnboardingScreen profile={profile} onComplete={setProfile} />;

  return (
    <main className="app"><div className="shell">
      {dataMessage && <div className="data-message">{dataMessage}</div>}
      {currentModule !== "menu" && <TopBar currentModule={currentModule} antiStats={antiStats} onMenu={goMenu} onStats={async () => { await goMenu(); setCurrentModule("stats"); }} />}
      {currentModule === "menu" && <MainMenu onOpen={openModule} onProfile={() => setCurrentModule("profile")} />}
      {currentModule === "profile" && <ProfileScreen user={session.user} profile={profile} onProfile={setProfile} onMenu={goMenu} />}
      {currentModule === "stats" && <StatsScreen combined={combinedStats} onMenu={goMenu} />}
      {currentModule === "antifall" && (
        <AntiFallModule step={antiStep} protocol={protocol} stats={antiStats} problemStats={problemStats} firmness={firmness}
          config={config} loading={loading} onPatch={patchProtocol} onStart={startAntiFall} onAnalyze={prepareAntiAnalysis}
          onGenerateAction={generateAntiAction} onStep={setAntiStep} onFinish={finishAntiFall} onMenu={goMenu} />
      )}
      {currentModule === "launch10" && (
        <LaunchModule step={launchStep} launch={launch} loading={loading} onPatch={patchLaunch} onStart={startLaunch}
          onQuestionnaire={generateLaunchQuestionnaire} onGenerate={generateLaunchAction} onStep={setLaunchStep}
          onFinish={finishLaunch} onSave={saveLaunchResult} onMenu={goMenu} />
      )}
    </div></main>
  );
}

function normalizeAntiSession(row) {
  return {
    id: row.id, module: "antifall", date: row.started_at || row.created_at,
    endedAt: row.ended_at, problemId: row.problem_id || "", problem: row.problem || "",
    details: row.details || "", reset: row.reset_action || "", emotion: row.emotion || "",
    avoidedTask: row.avoided_task || "", consequence: row.consequence || "",
    minimalAction: row.minimal_action || "", completed: Boolean(row.completed),
    shield: row.shield || "", analysis: row.analysis || null
  };
}

function normalizeLaunchSession(row) {
  return {
    id: row.id, remoteSessionId: row.id, module: "launch10", date: row.started_at || row.created_at,
    endedAt: row.ended_at, task: row.task || "", desiredResult: row.desired_result || "",
    blockage: row.blockage || "", excuse: row.excuse || "", questionnaire: row.questionnaire,
    answers: row.answers || {}, analysis: row.plan, duration: row.duration || 10,
    actualResult: row.actual_result || "", completed: Boolean(row.completed), saved: true
  };
}

function AppLoading({ text }) {
  return <main className="app"><div className="shell auth-shell"><div className="auth-card center"><Target size={38} /><h1>Modo Ejecución</h1><p className="subtitle">{text}</p></div></div></main>;
}

function AuthScreen() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const redirectTo = `${window.location.origin}/`;
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo }
        });
        if (error) throw error;
        if (data.session?.user) {
          await ensureUserProfile(data.session.user);
          setMessage("Cuenta creada. Vamos a configurar tu sistema.");
        } else {
          setMessage("Cuenta creada. Revisa tu correo para confirmar.");
        }
      }
    } catch (error) {
      setMessage(getSpanishAuthError(error));
    } finally {
      setBusy(false);
    }
  }

  return <main className="app"><div className="shell auth-shell"><section className="auth-card">
    <div className="auth-heading"><div className="step-icon"><Target /></div><p className="eyebrow">Sistema personal de ejecución</p><h1>{mode === "login" ? "Entrar" : "Crear cuenta"}</h1><p className="subtitle">Tu progreso y tus sesiones quedarán sincronizados.</p></div>
    <div className="auth-tabs"><button className={mode === "login" ? "selected" : ""} onClick={() => { setMode("login"); setMessage(""); }}>Login</button><button className={mode === "register" ? "selected" : ""} onClick={() => { setMode("register"); setMessage(""); }}>Registro</button></div>
    <form className="auth-form" onSubmit={submit}>
      <label className="field"><span>Email</span><input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" /></label>
      <label className="field"><span>Contraseña</span><input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" /></label>
      {message && <p className="form-message">{message}</p>}
      <button className="primary-button large" disabled={busy}>{busy ? "Procesando…" : mode === "login" ? "Entrar" : "Crear cuenta"}</button>
    </form>
  </section></div></main>;
}

function getSpanishAuthError(error) {
  const code = error?.code || "";
  const message = String(error?.message || "").toLowerCase();
  if (code === "invalid_credentials" || message.includes("invalid login credentials")) return "Email o contraseña incorrectos.";
  if (code === "email_not_confirmed" || message.includes("email not confirmed")) return "Debes confirmar tu correo antes de iniciar sesión.";
  if (code === "user_already_exists" || message.includes("already registered")) return "Ya existe una cuenta con este email.";
  if (code === "weak_password" || message.includes("password")) return "La contraseña no cumple los requisitos de seguridad.";
  if (message.includes("rate limit")) return "Demasiados intentos. Espera un momento y vuelve a probar.";
  return "No se pudo completar el acceso. Inténtalo de nuevo.";
}

const onboardingQuestions = [
  { id: "name", title: "¿Cómo quieres que te llamemos?", type: "text", placeholder: "Tu nombre" },
  { id: "main_goal", title: "¿Cuál es tu objetivo principal ahora?", type: "textarea", placeholder: "El resultado que quieres conseguir" },
  { id: "motivation", title: "¿Por qué es importante cambiarlo?", type: "textarea", placeholder: "La razón que no quieres olvidar" },
  { id: "work_style", title: "¿Cómo trabajas mejor?", type: "choice", options: [["bloques_cortos", "Bloques cortos"], ["bloques_largos", "Bloques largos"], ["paso_a_paso", "Paso a paso"], ["con_presion", "Con presión"]] },
  { id: "main_distraction", title: "¿Cuál es tu principal distracción?", type: "textarea", placeholder: "Juegos, redes, móvil, perfeccionismo…" },
  { id: "tools", title: "¿Qué herramientas usas para trabajar?", type: "textarea", placeholder: "Shopify, Notion, Meta Ads, cuaderno…" },
  { id: "tone_preference", title: "¿Qué tono prefieres cuando te bloqueas?", type: "choice", options: [["normal", "Normal"], ["directo", "Directo"], ["duro", "Duro"], ["muy_duro", "Muy duro"]] }
];

function OnboardingScreen({ profile, onComplete }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({ name: profile.name || "", tone_preference: profile.tone_preference || "directo" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const question = onboardingQuestions[step];
  const value = String(answers[question.id] || "").trim();

  async function next() {
    if (step < onboardingQuestions.length - 1) {
      setStep((current) => current + 1);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const nextProfile = await saveOnboarding(answers, onboardingQuestions);
      onComplete(nextProfile);
    } catch (saveError) {
      console.error("Supabase onboarding save error:", saveError);
      setError(saveError?.message || "No se pudo guardar el onboarding.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="app"><div className="shell onboarding-shell"><section className="screen onboarding-card">
    <div className="onboarding-progress"><span>Configuración inicial · {step + 1} de {onboardingQuestions.length}</span><div><i style={{ width: `${((step + 1) / onboardingQuestions.length) * 100}%` }} /></div></div>
    <div className="step-header"><div className="step-icon"><User /></div><div><p className="eyebrow">Personaliza tu sistema</p><h1>{question.title}</h1></div></div>
    {question.type === "choice" ? <div className="option-grid">{question.options.map(([optionValue, label]) => <button key={optionValue} className={`option ${answers[question.id] === optionValue ? "selected" : ""}`} onClick={() => setAnswers({ ...answers, [question.id]: optionValue })}>{label}</button>)}</div> : <label className="field"><span>Tu respuesta</span>{question.type === "textarea" ? <textarea autoFocus value={answers[question.id] || ""} onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.value })} placeholder={question.placeholder} /> : <input autoFocus value={answers[question.id] || ""} onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.value })} placeholder={question.placeholder} />}</label>}
    {error && <p className="form-message">{error}</p>}
    <div className="button-row"><button className="secondary-button" disabled={step === 0 || busy} onClick={() => setStep((current) => current - 1)}><ChevronLeft size={18} />Atrás</button><button className="primary-button" disabled={!value || busy} onClick={next}>{busy ? "Guardando…" : step === onboardingQuestions.length - 1 ? "Terminar" : "Siguiente"}</button></div>
  </section></div></main>;
}

function ProfileScreen({ user, profile, onProfile, onMenu }) {
  const [name, setName] = useState(profile.name || "");
  const [tone, setTone] = useState(profile.tone_preference || "directo");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const next = await updateProfile(user.id, { name: name.trim(), tone_preference: tone });
      onProfile(next);
      setMessage("Perfil actualizado.");
    } catch (error) {
      setMessage(error?.message || "No se pudo actualizar el perfil.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="screen profile-screen"><StepHeader icon={<User />} title="Perfil" text="Ajusta cómo quieres usar Modo Ejecución." />
    <form className="profile-card" onSubmit={save}>
      <label className="field"><span>Nombre</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="field"><span>Email</span><input value={user.email || ""} readOnly /></label>
      <label className="field"><span>Tono preferido</span><select value={tone} onChange={(e) => setTone(e.target.value)}><option value="normal">Normal</option><option value="directo">Directo</option><option value="duro">Duro</option><option value="muy_duro">Muy duro</option></select></label>
      {message && <p className="form-message">{message}</p>}
      <div className="button-row"><button className="primary-button" disabled={busy || !name.trim()}>{busy ? "Guardando…" : "Guardar cambios"}</button><button className="secondary-button" type="button" onClick={onMenu}>Volver al menú</button></div>
    </form>
    <button className="danger-button logout-button" onClick={() => supabase.auth.signOut()}><LogOut size={18} />Cerrar sesión</button>
  </section>;
}

function effectiveBlockage(launch) {
  return launch.blockage === "Otro" ? launch.customBlockage.trim() || "Otro" : launch.blockage;
}

function normalizeQuestionnaire(result, fallback) {
  if (!result || !Array.isArray(result.questions)) return fallback;
  const questions = result.questions.slice(0, 6).map((item, index) => {
    const type = item?.type === "single_choice" && Array.isArray(item.options) && item.options.length >= 2 ? "single_choice" : "text";
    return {
      id: String(item?.id || `question_${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40),
      question: String(item?.question || "").trim(),
      type,
      options: type === "single_choice" ? item.options.map(String).filter(Boolean).slice(0, 8) : []
    };
  }).filter((item) => item.question);
  if (questions.length < 3) return fallback;
  return { category: fallback.category, intro: String(result.intro || fallback.intro), questions };
}

function normalizeLaunchPlan(result, fallback) {
  if (!result || !Array.isArray(result.pasos) || !result.pasos.length) return fallback;
  const pasos = result.pasos.slice(0, 6).map((step, index) => ({
    titulo: String(step?.titulo || `Paso ${index + 1}`),
    descripcion: String(step?.descripcion || "Ejecuta este paso sin ampliar el alcance."),
    duracion_minutos: Math.min(10, Math.max(1, Number(step?.duracion_minutos) || 5)),
    resultado: String(step?.resultado || "Resultado visible completado.")
  }));
  const total = pasos.reduce((sum, step) => sum + step.duracion_minutos, 0);
  if (total < 5 || total > 30) return fallback;
  const allowedCategories = ["ads", "shopify", "estudio", "video", "producto", "negocio", "otro"];
  const allowedTones = ["normal", "directo", "duro", "muy_duro"];
  return {
    ...fallback, ...result, pasos,
    categoria_tarea: allowedCategories.includes(result.categoria_tarea) ? result.categoria_tarea : fallback.categoria_tarea,
    duracion_recomendada: total,
    no_hacer: Array.isArray(result.no_hacer) && result.no_hacer.length ? result.no_hacer.map(String).slice(0, 5) : fallback.no_hacer,
    tono: allowedTones.includes(result.tono) ? result.tono : fallback.tono
  };
}

function TopBar({ currentModule, antiStats, onMenu, onStats }) {
  return <header className="topbar">
    <button className="brand" onClick={onMenu}><Target size={22} />Modo Ejecución</button>
    <div className="top-actions">
      {currentModule === "antifall" && <span className="pill danger"><Flame size={16} />Fallos seguidos: {antiStats.failStreak}</span>}
      <button className="icon-button" onClick={onStats} title="Estadísticas"><BarChart3 size={20} /></button>
      <button className="ghost-button" onClick={onMenu}>Menú</button>
    </div>
  </header>;
}

function MainMenu({ onOpen, onProfile }) {
  const cards = [
    ["Sistema Anticaída", "Cuando estás a punto de caer, jugar, procrastinar o abandonar.", <Shield />, "antifall", "Entrar"],
    ["Arranque 10", "Cuando sabes lo que tienes que hacer, pero no consigues empezar.", <Rocket />, "launch10", "Entrar"],
    ["Trabajo Profundo", "Bloques serios de ejecución con objetivo claro.", <Clock />],
    ["Decisión Rápida", "Cuando estás bloqueado dudando.", <AlertTriangle />],
    ["Detector de Excusas", "Cuando te estás contando una mentira para no actuar.", <Activity />],
    ["Estadísticas", "Tu identidad medida en datos.", <BarChart3 />, "stats", "Ver estadísticas"]
  ];
  return <section className="screen main-menu">
    <div className="menu-heading"><div className="menu-heading-row"><div><p className="eyebrow">Sistema personal de ejecución</p><h1>MODO EJECUCIÓN</h1></div><button className="secondary-button profile-button" onClick={onProfile}><User size={18} />Perfil</button></div><p className="subtitle">No esperes motivación. Entra en movimiento.</p></div>
    <div className="module-grid">{cards.map(([title, description, icon, module, label]) => <article className="module-card" key={title}>
      <div className="module-icon">{icon}</div><div className="module-copy"><h2>{title}</h2><p>{description}</p></div>
      {module ? <button className="primary-button" onClick={() => onOpen(module)}>{label}</button> : <span className="soon"><Lock size={14} />Próximamente</span>}
    </article>)}</div>
  </section>;
}

function AntiFallModule({ step, protocol, stats, problemStats, firmness, config, loading, onPatch, onStart, onAnalyze, onGenerateAction, onStep, onFinish, onMenu }) {
  if (step === "home") return <section className="screen home"><div className="stack center"><p className="eyebrow">Herramienta de disciplina personal</p><h1>Sistema Anticaída</h1><p className="subtitle">No eres una persona que abandona. Eres una persona que reajusta.</p><button className="primary-button large" onClick={onStart}><Play size={22} />Activar protocolo</button><button className="secondary-button" onClick={onMenu}>Menú</button></div><div className="metric-row"><Metric label="Iniciados" value={stats.total} /><Metric label="Completados" value={stats.completed} /><Metric label="Mejor racha" value={stats.bestCompletionStreak} /></div></section>;
  if (step === "problem") return <ProblemScreen protocol={protocol} firmness={firmness} onPatch={onPatch} onNext={onAnalyze} />;
  if (step === "reset") return <ResetScreen protocol={protocol} firmness={firmness} config={config} loading={loading} onPatch={onPatch} onNext={() => onStep("emotion")} />;
  if (step === "emotion") return <EmotionScreen protocol={protocol} config={config} onPatch={onPatch} onNext={onGenerateAction} />;
  if (step === "action") return <AntiActionScreen protocol={protocol} firmness={firmness} config={config} loading={loading} onPatch={onPatch} onNext={() => onStep("shield")} />;
  if (step === "shield") return <ShieldScreen protocol={protocol} config={config} onPatch={onPatch} onFinish={onFinish} />;
  return <AntiSummary protocol={protocol} stats={problemStats} onStart={onStart} onMenu={onMenu} />;
}

function ProblemScreen({ protocol, firmness, onPatch, onNext }) {
  const selected = getProblemConfig(protocol.problemId);
  const valid = protocol.problemId && (protocol.problemId !== "other" || protocol.details.trim());
  return <section className="screen"><StepHeader icon={<AlertTriangle />} title="Selecciona el problema" text="Nombra el patrón con precisión." /><FirmnessBanner firmness={firmness} />
    <div className="option-grid">{problemOptions.map((item) => <button key={item.id} className={`option ${protocol.problemId === item.id ? "selected" : ""}`} onClick={() => onPatch({ problemId: item.id, problem: item.label, reset: "", emotion: "", action: "", shield: "", analysis: null })}>{item.label}</button>)}</div>
    <label className="field"><span>Detalles {protocol.problemId === "other" ? "(obligatorios)" : "opcionales"}</span><textarea value={protocol.details} onChange={(e) => onPatch({ details: e.target.value })} placeholder={selected.detailPlaceholder} /></label>
    <button className="primary-button" disabled={!valid} onClick={onNext}>Continuar</button>
  </section>;
}

function ResetScreen({ protocol, firmness, config, loading, onPatch, onNext }) {
  const options = [...new Set([protocol.analysis?.reset_fisico, ...config.resetOptions].filter(Boolean))];
  return <section className="screen"><StepHeader icon={<Dumbbell />} title="Haz un reset físico" text="Antes de pensar, cambia tu estado." /><FirmnessBanner firmness={firmness} message={protocol.analysis?.mensaje_duro} />
    {loading && <p className="recommendation">Gemini está afinando el protocolo. El flujo local ya está disponible.</p>}
    <div className="option-grid">{options.map((item) => <button key={item} className={`option ${protocol.reset === item ? "selected" : ""}`} onClick={() => onPatch({ reset: item })}>{item}</button>)}</div>
    <button className="primary-button" disabled={!protocol.reset} onClick={onNext}>Ya hice el reset físico</button>
  </section>;
}

function EmotionScreen({ protocol, config, onPatch, onNext }) {
  const emotion = protocol.emotion === "Otro" ? protocol.customEmotion.trim() : protocol.emotion;
  const valid = emotion && protocol.avoidedTask.trim() && protocol.consequence.trim();
  return <section className="screen"><StepHeader icon={<Activity />} title={config.emotionQuestion} text="Mira el patrón de frente y baja a una acción concreta." />
    <div className="option-grid compact">{config.defaultEmotionOptions.map((item) => <button key={item} className={`option ${protocol.emotion === item ? "selected" : ""}`} onClick={() => onPatch({ emotion: item })}>{item}</button>)}</div>
    {protocol.emotion === "Otro" && <label className="field"><span>Emoción real</span><input value={protocol.customEmotion} onChange={(e) => onPatch({ customEmotion: e.target.value })} /></label>}
    <label className="field"><span>{config.avoidedQuestion}</span><textarea value={protocol.avoidedTask} onChange={(e) => onPatch({ avoidedTask: e.target.value })} placeholder="La tarea concreta que estás evitando." /></label>
    <label className="field"><span>{config.consequenceQuestion}</span><textarea value={protocol.consequence} onChange={(e) => onPatch({ consequence: e.target.value })} placeholder="La consecuencia real, sin adornos." /></label>
    <button className="primary-button" disabled={!valid} onClick={onNext}>Continuar a la acción</button>
  </section>;
}

function AntiActionScreen({ protocol, firmness, config, loading, onPatch, onNext }) {
  const [running, setRunning] = useState(false);
  return <section className="screen"><StepHeader icon={<Clock />} title="Ejecuta la acción mínima" text="No resuelvas todo. Rompe la caída." /><FirmnessBanner firmness={firmness} message={protocol.analysis?.mensaje_duro} />
    <div className="action-panel"><p className="eyebrow">{loading ? "Gemini está afinando la acción…" : "Acción mínima"}</p><h2>{protocol.action || config.minimalActions[0]}</h2><p>{protocol.analysis?.diagnostico}</p>
      <Countdown minutes={10} running={running} />
      {!running ? <button className="primary-button large" onClick={() => { setRunning(true); onPatch({ actionStartedAt: new Date().toISOString() }); }}><Play size={20} />Empiezo ahora</button> : <button className="primary-button large success" onClick={onNext}><CheckCircle2 size={20} />He terminado</button>}
    </div>
  </section>;
}

function ShieldScreen({ protocol, config, onPatch, onFinish }) {
  const options = [...new Set([protocol.analysis?.blindaje_recomendado, ...config.shieldOptions].filter(Boolean))];
  const value = protocol.shield === "Otro ajuste personalizado." ? protocol.customShield.trim() : protocol.shield;
  return <section className="screen"><StepHeader icon={<Lock />} title="Elige un blindaje preventivo" text="Cierra la puerta al patrón de mañana." />
    <div className="option-grid">{options.map((item) => <button key={item} className={`option ${protocol.shield === item ? "selected" : ""}`} onClick={() => onPatch({ shield: item })}>{item}</button>)}</div>
    {protocol.shield === "Otro ajuste personalizado." && <label className="field"><span>Ajuste personalizado</span><input value={protocol.customShield} onChange={(e) => onPatch({ customShield: e.target.value })} /></label>}
    <button className="primary-button" disabled={!value} onClick={onFinish}>Guardar y completar</button>
  </section>;
}

function AntiSummary({ protocol, stats, onStart, onMenu }) {
  return <section className="screen"><StepHeader icon={<CheckCircle2 />} title="Protocolo completado" text="Hoy no has abandonado. Has reajustado." />
    <div className="summary-list"><SummaryRow label="Problema" value={protocol.problem} /><SummaryRow label="Detalles" value={protocol.details} /><SummaryRow label="Acción mínima" value={protocol.action} /><SummaryRow label="Blindaje" value={protocol.shield === "Otro ajuste personalizado." ? protocol.customShield : protocol.shield} /><SummaryRow label="Mejor racha" value={stats.bestCompletionStreak} /></div>
    <div className="button-row"><button className="primary-button" onClick={onStart}>Activar otro protocolo</button><button className="secondary-button" onClick={onMenu}>Menú</button></div>
  </section>;
}

function LaunchModule({ step, launch, loading, onPatch, onStart, onQuestionnaire, onGenerate, onStep, onFinish, onSave, onMenu }) {
  if (step === "home") return <section className="screen home"><div className="stack center"><p className="eyebrow">Protocolo de inicio</p><h1>Arranque 10</h1><p className="subtitle">Convierte una tarea grande en una acción tan pequeña que no puedas rechazarla.</p><p className="launch-mantra">No tienes que tener ganas. Tienes que empezar pequeño.</p><div className="button-row center"><button className="primary-button large" onClick={onStart}><Rocket size={20} />Empezar arranque</button><button className="secondary-button" onClick={onMenu}>Menú</button></div></div></section>;
  if (step === "task") return <LaunchTask launch={launch} onPatch={onPatch} onNext={() => onStep("blockage")} />;
  if (step === "blockage") return <LaunchBlockage launch={launch} onPatch={onPatch} onNext={onQuestionnaire} />;
  if (step === "questionnaire") return <LaunchQuestionnaire launch={launch} loading={loading} onPatch={onPatch} onGenerate={onGenerate} />;
  if (step === "action") return <LaunchAction launch={launch} loading={loading} onPatch={onPatch} onStart={() => onStep("timer")} onRegenerate={onGenerate} onMenu={onMenu} />;
  if (step === "timer") return <LaunchTimer launch={launch} onComplete={() => onFinish(true)} onAbandon={() => onFinish(false)} />;
  return <LaunchSummary launch={launch} onPatch={onPatch} onSave={onSave} onStart={onStart} onMenu={onMenu} />;
}

function LaunchTask({ launch, onPatch, onNext }) {
  return <section className="screen"><StepHeader icon={<Target />} title="¿Qué tienes que hacer?" text="Define la tarea sin convertirla en un proyecto infinito." />
    <label className="field"><span>¿Qué tienes que hacer?</span><textarea autoFocus value={launch.task} onChange={(e) => onPatch({ task: e.target.value })} placeholder="Ejemplo: editar anuncio, cambiar web, buscar productos, estudiar..." /></label>
    <label className="field"><span>¿Cuál sería un resultado útil? <small>Opcional</small></span><textarea value={launch.desiredResult} onChange={(e) => onPatch({ desiredResult: e.target.value })} placeholder="Ejemplo: escribir 3 hooks o cambiar el titular." /></label>
    <button className="primary-button" disabled={!launch.task.trim()} onClick={onNext}>Continuar</button>
  </section>;
}

function LaunchBlockage({ launch, onPatch, onNext }) {
  const valid = launch.blockage && (launch.blockage !== "Otro" || launch.customBlockage.trim());
  return <section className="screen"><StepHeader icon={<AlertTriangle />} title="¿Qué parte te cuesta empezar?" text="Nombra el bloqueo. No lo adornes." />
    <div className="option-grid">{launchBlockages.map((item) => <button key={item} className={`option ${launch.blockage === item ? "selected" : ""}`} onClick={() => onPatch({ blockage: item })}>{item}</button>)}</div>
    {launch.blockage === "Otro" && <label className="field"><span>Describe el bloqueo</span><input value={launch.customBlockage} onChange={(e) => onPatch({ customBlockage: e.target.value })} /></label>}
    <label className="field"><span>¿Qué excusa te estás contando? <small>Opcional</small></span><textarea value={launch.excuse} onChange={(e) => onPatch({ excuse: e.target.value })} placeholder="Ejemplo: luego lo hago, necesito inspirarme..." /></label>
    <button className="primary-button" disabled={!valid} onClick={onNext}>Crear cuestionario personalizado</button>
  </section>;
}

function LaunchQuestionnaire({ launch, loading, onPatch, onGenerate }) {
  const questionnaire = launch.questionnaire;
  const questions = questionnaire?.questions || [];
  const valid = questions.length >= 3 && questions.every((item) => String(launch.answers?.[item.id] || "").trim());
  function setAnswer(id, value) {
    onPatch({ answers: { ...launch.answers, [id]: value } });
  }
  return <section className="screen"><StepHeader icon={<Target />} title="Cuestionario inteligente" text={questionnaire?.intro || "Cerrando el alcance de la tarea."} />
    {loading && <p className="recommendation">Gemini está personalizando las preguntas. Puedes responder ya al cuestionario local.</p>}
    <div className="questionnaire">{questions.map((item, index) => <div className="question-card" key={item.id}>
      <p className="eyebrow">Pregunta {index + 1}</p><h2>{item.question}</h2>
      {item.type === "single_choice" ? <div className="choice-list">{item.options.map((option) => <button key={option} className={`option ${launch.answers?.[item.id] === option ? "selected" : ""}`} onClick={() => setAnswer(item.id, option)}>{option}</button>)}</div> : <input value={launch.answers?.[item.id] || ""} onChange={(e) => setAnswer(item.id, e.target.value)} placeholder="Respuesta concreta" />}
    </div>)}</div>
    <button className="primary-button large" disabled={!valid || loading} onClick={onGenerate}>Generar plan de ejecución</button>
  </section>;
}

function LaunchAction({ launch, loading, onPatch, onStart, onRegenerate, onMenu }) {
  const analysis = launch.analysis;
  const total = analysis?.pasos?.reduce((sum, step) => sum + Number(step.duracion_minutos || 0), 0) || analysis?.duracion_recomendada || 10;
  return <section className="screen"><StepHeader icon={<Rocket />} title="Acción mínima generada" text="No termines la tarea. Rompe el inicio." />
    <div className={`analysis-card tone-${analysis?.tono || "directo"}`}><p className="eyebrow">{loading ? "Gemini está afinando la respuesta…" : "Protocolo listo"}</p>
      <AnalysisItem label="Diagnóstico" value={analysis?.diagnostico} />
      <div className="minimal-action"><span>Acción mínima exacta</span><h2>{analysis?.accion_minima}</h2></div>
      <div className="execution-plan"><div className="plan-heading"><div><p className="eyebrow">Plan de ejecución</p><h2>{analysis?.pasos?.length || 0} pasos concretos</h2></div><strong>{total} min</strong></div>
        {analysis?.pasos?.map((step, index) => <div className="plan-step" key={`${step.titulo}-${index}`}><span className="step-number">{index + 1}</span><div><div className="step-title"><h3>{step.titulo}</h3><b>{step.duracion_minutos} min</b></div><p>{step.descripcion}</p><small>Resultado: {step.resultado}</small></div></div>)}
      </div>
      <div className="analysis-grid"><AnalysisItem label="Duración total aproximada" value={`${total} minutos`} /><AnalysisItem label="Primer movimiento" value={analysis?.primer_movimiento} /></div>
      <div className="dont-list"><p className="eyebrow">Qué no hacer ahora</p><ul>{analysis?.no_hacer?.map((item) => <li key={item}>{item}</li>)}</ul></div>
      <blockquote>{analysis?.mensaje_directo}</blockquote>
    </div>
    <div className="button-row"><button className="primary-button large" disabled={loading} onClick={onStart}><Play size={20} />Empezar paso 1</button><button className="secondary-button" disabled={loading} onClick={onRegenerate}><RotateCcw size={17} />Regenerar</button><button className="ghost-button" onClick={onMenu}>Menú</button></div>
  </section>;
}

function LaunchTimer({ launch, onComplete, onAbandon }) {
  const steps = launch.analysis?.pasos || [];
  const [current, setCurrent] = useState(0);
  const [completed, setCompleted] = useState([]);
  const step = steps[current];
  function advance(skipped = false) {
    setCompleted((items) => [...items, { index: current, skipped }]);
    if (current >= steps.length - 1) onComplete();
    else setCurrent((value) => value + 1);
  }
  if (!step) return <section className="screen"><p>No hay pasos disponibles.</p><button className="primary-button" onClick={onComplete}>Finalizar</button></section>;
  return <section className="screen timer-screen"><div className="step-progress"><span>Paso {current + 1} de {steps.length}</span><div><i style={{ width: `${((current + 1) / steps.length) * 100}%` }} /></div></div>
    <div className="step-runner"><span className="step-number large">{current + 1}</span><p className="eyebrow">Paso actual</p><h1>{step.titulo}</h1><p className="subtitle">{step.descripcion}</p>
      <div className="expected-result"><span>Resultado esperado</span><strong>{step.resultado}</strong></div><Countdown key={current} minutes={step.duracion_minutos} running />
      <div className="button-row center"><button className="primary-button large success" onClick={() => advance(false)}><CheckCircle2 size={20} />Paso completado</button><button className="secondary-button" onClick={() => advance(true)}>Saltar paso</button><button className="danger-button" onClick={onAbandon}>Abandonar</button></div>
      {completed.length > 0 && <p className="timer-note">{completed.filter((item) => !item.skipped).length} pasos completados · {completed.filter((item) => item.skipped).length} saltados</p>}
    </div></section>;
}

function LaunchSummary({ launch, onPatch, onSave, onStart, onMenu }) {
  if (!launch.completed) return <section className="screen"><StepHeader icon={<XCircle />} title="Arranque abandonado" text="Queda registrado. El patrón se rompe ejecutando pequeño." /><div className="button-row"><button className="primary-button" onClick={onStart}>Hacer otro arranque</button><button className="secondary-button" onClick={onMenu}>Menú</button></div></section>;
  return <section className="screen"><StepHeader icon={<CheckCircle2 />} title="Arranque completado" text="No necesitabas ganas. Necesitabas empezar." />
    <div className="summary-list"><SummaryRow label="Tarea" value={launch.task} /><SummaryRow label="Bloqueo" value={launch.blockage} /><SummaryRow label="Excusa" value={launch.excuse} /><SummaryRow label="Categoría" value={launch.analysis?.categoria_tarea} /><SummaryRow label="Acción mínima" value={launch.analysis?.accion_minima} /><SummaryRow label="Plan completado" value={`${launch.analysis?.pasos?.length || 0} pasos · ${launch.duration} minutos aprox.`} /></div>
    <label className="field"><span>¿Qué hiciste realmente? <small>Opcional</small></span><textarea value={launch.actualResult} onChange={(e) => onPatch({ actualResult: e.target.value })} /></label>
    <div className="button-row"><button className="primary-button" onClick={onSave}>Guardar</button><button className="secondary-button" onClick={onStart}>Hacer otro arranque</button><button className="ghost-button" onClick={onMenu}>Menú</button></div>
  </section>;
}

function Countdown({ minutes, running }) {
  const [seconds, setSeconds] = useState(minutes * 60);
  useEffect(() => setSeconds(minutes * 60), [minutes]);
  useEffect(() => {
    if (!running || seconds <= 0) return undefined;
    const id = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(id);
  }, [running, seconds <= 0]);
  return <div className="timer">{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</div>;
}

function StatsScreen({ combined, onMenu }) {
  return <section className="screen"><StepHeader icon={<BarChart3 />} title="Estadísticas" text="Tu identidad medida en datos." />
    <h2>Resumen combinado</h2><div className="metric-grid"><Metric label="Iniciados" value={combined.total} /><Metric label="Completados" value={combined.completed} /><Metric label="Abandonados" value={combined.failed} /><Metric label="Mejor racha" value={combined.bestStreak} /><Metric label="Fallos seguidos" value={combined.failStreak} /></div>
    <h2>Sistema Anticaída</h2><div className="metric-grid"><Metric label="Protocolos iniciados" value={combined.anti.total} /><Metric label="Completados" value={combined.anti.completed} /><Metric label="Abandonados" value={combined.anti.failed} /><Metric label="Mejor racha" value={combined.anti.bestCompletionStreak} /></div>
    <h2>Arranque 10</h2><div className="metric-grid"><Metric label="Arranques iniciados" value={combined.launch.total} /><Metric label="Completados" value={combined.launch.completed} /><Metric label="Abandonados" value={combined.launch.failed} /><Metric label="Mejor racha" value={combined.launch.bestCompletionStreak} /></div>
    <h2>Últimos 5 registros</h2><div className="history">{combined.recent.length ? combined.recent.map((item) => <div className="history-row" key={item.id}><span>{new Date(item.date).toLocaleString("es-ES")}</span><strong>{item.completed ? "Completado" : "Abandonado"}</strong><span>{item.module === "launch10" ? `Arranque 10 — ${item.task}` : `Anticaída — ${item.problem}`}</span></div>) : <p className="empty-state">Sin registros todavía.</p>}</div>
    <button className="secondary-button" onClick={onMenu}><ChevronLeft size={18} />Menú</button>
  </section>;
}

function StepHeader({ icon, title, text }) { return <div className="step-header"><div className="step-icon">{icon}</div><div><h1>{title}</h1><p>{text}</p></div></div>; }
function FirmnessBanner({ firmness, message }) { return <div className={`firmness tone-${firmness.tone}`}><strong>Nivel {firmness.level}</strong><span>{message || firmness.message}</span></div>; }
function Metric({ label, value }) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div>; }
function SummaryRow({ label, value }) { return <div className="summary-row"><span>{label}</span><strong>{value || "No registrado"}</strong></div>; }
function AnalysisItem({ label, value }) { return <div className="analysis-item"><span>{label}</span><p>{value || "Preparando…"}</p></div>; }

createRoot(document.getElementById("root")).render(<App />);
