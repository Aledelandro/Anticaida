import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, AlertTriangle, BarChart3, CheckCircle2, ChevronLeft, Clock, Dumbbell, Flame, Lock, Play, Rocket, RotateCcw, Shield, Target, XCircle } from "lucide-react";
import "./styles.css";
import { getProblemConfig, problemOptions } from "./problemConfigs";
import { analyzeAntiFallWithGemini, analyzeLaunchWithGemini } from "./services/gemini";
import {
  buildGeminiPayload, fallbackAnalysis, getCombinedStats, getLaunchStats, getLocalLaunchProtocol, getStats,
  markActiveFailureIfNeeded, readHistory, readLaunchHistory, recordProtocolStarted, saveActiveProtocol,
  saveLaunch, saveProtocol, updateActiveProtocol, updateLatestLaunch
} from "./services/storage";

const initialProtocol = {
  problemId: "", problem: "", details: "", reset: "", emotion: "", customEmotion: "",
  avoidedTask: "", consequence: "", action: "", shield: "", customShield: "", analysis: null,
  actionCompleted: false, startedAt: ""
};

const initialLaunch = {
  task: "", desiredResult: "", blockage: "", customBlockage: "", excuse: "", analysis: null,
  duration: 10, actualResult: "", completed: false, startedAt: "", saved: false
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
    if (markActiveFailureIfNeeded()) setAntiHistory(readHistory());
  }, []);

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

  function goMenu() {
    if (currentModule === "antifall" && !["home", "summary"].includes(antiStep) && protocol.startedAt) {
      saveProtocol({ ...protocol, completed: false, endedAt: new Date().toISOString() });
      setAntiHistory(readHistory());
      setProtocol(initialProtocol);
    }
    if (currentModule === "launch10" && !["home", "summary"].includes(launchStep) && launch.startedAt && !launch.saved) {
      saveLaunch({ ...launch, blockage: effectiveBlockage(launch), completed: false });
      setLaunchHistory(readLaunchHistory());
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
    const result = await analyzeAntiFallWithGemini(buildGeminiPayload({ protocol, stats: problemStats, config }));
    if (result) patchProtocol({ analysis: { ...local, ...result }, action: result.accion_minima || local.accion_minima });
    setLoading(false);
  }

  async function generateAntiAction() {
    const local = fallbackAnalysis({ protocol, stats: problemStats, firmness, config });
    patchProtocol({ analysis: local, action: local.accion_minima });
    setAntiStep("action");
    setLoading(true);
    const result = await analyzeAntiFallWithGemini(buildGeminiPayload({ protocol, stats: problemStats, config }));
    if (result) patchProtocol({ analysis: { ...local, ...result }, action: result.accion_minima || local.accion_minima });
    setLoading(false);
  }

  function finishAntiFall() {
    const finished = { ...protocol, completed: true, actionCompleted: true, endedAt: new Date().toISOString() };
    saveProtocol(finished);
    setProtocol(finished);
    setAntiHistory(readHistory());
    setAntiStep("summary");
  }

  function startLaunch() {
    recordProtocolStarted("launch10");
    setLaunch({ ...initialLaunch, startedAt: new Date().toISOString() });
    setLaunchStep("task");
  }

  async function generateLaunchAction() {
    const local = getLocalLaunchProtocol(launch, launchStats);
    patchLaunch({ analysis: local, duration: local.duracion_recomendada });
    setLaunchStep("action");
    setLoading(true);
    const result = await analyzeLaunchWithGemini({ ...launch, stats: launchStats, recent: launchHistory.slice(0, 5) });
    if (result) {
      const allowedDuration = [2, 5, 10, 25].includes(Number(result.duracion_recomendada)) ? Number(result.duracion_recomendada) : local.duracion_recomendada;
      patchLaunch({ analysis: { ...local, ...result }, duration: allowedDuration });
    }
    setLoading(false);
  }

  function finishLaunch(completed) {
    const finished = { ...launch, blockage: effectiveBlockage(launch), completed, saved: true, endedAt: new Date().toISOString() };
    saveLaunch(finished);
    setLaunch(finished);
    setLaunchHistory(readLaunchHistory());
    setLaunchStep("summary");
  }

  function saveLaunchResult() {
    updateLatestLaunch({ actualResult: launch.actualResult });
    patchLaunch({ saved: true });
    setLaunchHistory(readLaunchHistory());
  }

  return (
    <main className="app"><div className="shell">
      {currentModule !== "menu" && <TopBar currentModule={currentModule} antiStats={antiStats} onMenu={goMenu} onStats={() => { goMenu(); setCurrentModule("stats"); }} />}
      {currentModule === "menu" && <MainMenu onOpen={openModule} />}
      {currentModule === "stats" && <StatsScreen combined={combinedStats} onMenu={goMenu} />}
      {currentModule === "antifall" && (
        <AntiFallModule step={antiStep} protocol={protocol} stats={antiStats} problemStats={problemStats} firmness={firmness}
          config={config} loading={loading} onPatch={patchProtocol} onStart={startAntiFall} onAnalyze={prepareAntiAnalysis}
          onGenerateAction={generateAntiAction} onStep={setAntiStep} onFinish={finishAntiFall} onMenu={goMenu} />
      )}
      {currentModule === "launch10" && (
        <LaunchModule step={launchStep} launch={launch} loading={loading} onPatch={patchLaunch} onStart={startLaunch}
          onGenerate={generateLaunchAction} onStep={setLaunchStep} onFinish={finishLaunch} onSave={saveLaunchResult} onMenu={goMenu} />
      )}
    </div></main>
  );
}

function effectiveBlockage(launch) {
  return launch.blockage === "Otro" ? launch.customBlockage.trim() || "Otro" : launch.blockage;
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

function MainMenu({ onOpen }) {
  const cards = [
    ["Sistema Anticaída", "Cuando estás a punto de caer, jugar, procrastinar o abandonar.", <Shield />, "antifall", "Entrar"],
    ["Arranque 10", "Cuando sabes lo que tienes que hacer, pero no consigues empezar.", <Rocket />, "launch10", "Entrar"],
    ["Trabajo Profundo", "Bloques serios de ejecución con objetivo claro.", <Clock />],
    ["Decisión Rápida", "Cuando estás bloqueado dudando.", <AlertTriangle />],
    ["Detector de Excusas", "Cuando te estás contando una mentira para no actuar.", <Activity />],
    ["Estadísticas", "Tu identidad medida en datos.", <BarChart3 />, "stats", "Ver estadísticas"]
  ];
  return <section className="screen main-menu">
    <div className="menu-heading"><p className="eyebrow">Sistema personal de ejecución</p><h1>MODO EJECUCIÓN</h1><p className="subtitle">No esperes motivación. Entra en movimiento.</p></div>
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

function LaunchModule({ step, launch, loading, onPatch, onStart, onGenerate, onStep, onFinish, onSave, onMenu }) {
  if (step === "home") return <section className="screen home"><div className="stack center"><p className="eyebrow">Protocolo de inicio</p><h1>Arranque 10</h1><p className="subtitle">Convierte una tarea grande en una acción tan pequeña que no puedas rechazarla.</p><p className="launch-mantra">No tienes que tener ganas. Tienes que empezar pequeño.</p><div className="button-row center"><button className="primary-button large" onClick={onStart}><Rocket size={20} />Empezar arranque</button><button className="secondary-button" onClick={onMenu}>Menú</button></div></div></section>;
  if (step === "task") return <LaunchTask launch={launch} onPatch={onPatch} onNext={() => onStep("blockage")} />;
  if (step === "blockage") return <LaunchBlockage launch={launch} onPatch={onPatch} onNext={onGenerate} />;
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
    <button className="primary-button" disabled={!valid} onClick={onNext}>Generar acción mínima</button>
  </section>;
}

function LaunchAction({ launch, loading, onPatch, onStart, onRegenerate, onMenu }) {
  const analysis = launch.analysis;
  return <section className="screen"><StepHeader icon={<Rocket />} title="Acción mínima generada" text="No termines la tarea. Rompe el inicio." />
    <div className={`analysis-card tone-${analysis?.tono || "directo"}`}><p className="eyebrow">{loading ? "Gemini está afinando la respuesta…" : "Protocolo listo"}</p>
      <AnalysisItem label="Diagnóstico" value={analysis?.diagnostico} /><AnalysisItem label="Excusa traducida" value={analysis?.excusa_traducida} />
      <div className="minimal-action"><span>Acción mínima exacta</span><h2>{analysis?.accion_minima}</h2></div>
      <div className="analysis-grid"><AnalysisItem label="Duración recomendada" value={`${analysis?.duracion_recomendada || 10} minutos`} /><AnalysisItem label="Primer movimiento" value={analysis?.primer_movimiento} /></div>
      <blockquote>{analysis?.mensaje_directo}</blockquote>
    </div>
    <div className="duration-picker"><span>Duración</span>{[2, 5, 10, 25].map((duration) => <button key={duration} className={`duration-chip ${launch.duration === duration ? "selected" : ""}`} onClick={() => onPatch({ duration })}>{duration} min</button>)}</div>
    <div className="button-row"><button className="primary-button large" disabled={loading} onClick={onStart}><Play size={20} />Empiezo ahora</button><button className="secondary-button" disabled={loading} onClick={onRegenerate}><RotateCcw size={17} />Regenerar acción</button><button className="ghost-button" onClick={onMenu}>Menú</button></div>
  </section>;
}

function LaunchTimer({ launch, onComplete, onAbandon }) {
  return <section className="screen timer-screen"><div className="stack center"><p className="eyebrow">Ejecutando acción mínima</p><h1>{launch.analysis?.accion_minima}</h1><p className="subtitle">Solo cumple este bloque. No pienses en toda la tarea.</p><Countdown minutes={launch.duration} running /><div className="button-row center"><button className="primary-button large success" onClick={onComplete}><CheckCircle2 size={20} />He terminado</button><button className="danger-button" onClick={onAbandon}>Abandonar</button></div></div></section>;
}

function LaunchSummary({ launch, onPatch, onSave, onStart, onMenu }) {
  if (!launch.completed) return <section className="screen"><StepHeader icon={<XCircle />} title="Arranque abandonado" text="Queda registrado. El patrón se rompe ejecutando pequeño." /><div className="button-row"><button className="primary-button" onClick={onStart}>Hacer otro arranque</button><button className="secondary-button" onClick={onMenu}>Menú</button></div></section>;
  return <section className="screen"><StepHeader icon={<CheckCircle2 />} title="Arranque completado" text="No necesitabas ganas. Necesitabas empezar." />
    <div className="summary-list"><SummaryRow label="Tarea" value={launch.task} /><SummaryRow label="Bloqueo" value={launch.blockage} /><SummaryRow label="Excusa" value={launch.excuse} /><SummaryRow label="Acción mínima" value={launch.analysis?.accion_minima} /><SummaryRow label="Duración" value={`${launch.duration} minutos`} /></div>
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
