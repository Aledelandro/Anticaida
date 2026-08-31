import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Dumbbell,
  Flame,
  Lock,
  Play,
  Shield,
  XCircle
} from "lucide-react";
import "./styles.css";
import {
  buildGeminiPayload,
  fallbackAnalysis,
  getStats,
  markActiveFailureIfNeeded,
  readHistory,
  saveActiveProtocol,
  saveProtocol,
  updateActiveProtocol
} from "./services/storage";
import { analyzeWithGemini } from "./services/gemini";
import { getProblemConfig, problemOptions } from "./problemConfigs";

const initialProtocol = {
  problemId: "",
  problem: "",
  details: "",
  reset: "",
  emotion: "",
  customEmotion: "",
  avoidedTask: "",
  consequence: "",
  action: "",
  shield: "",
  customShield: "",
  analysis: null,
  actionCompleted: false
};

function toneFromFailures(failStreak, config) {
  const hardMessages = config?.hardMessages || [];
  if (failStreak >= 4) {
    return {
      level: 4,
      tone: "muy_duro",
      message:
        hardMessages[3] ||
        "Si cedes ahora, estás eligiendo perder respeto por tu sistema. No necesitas motivación. Necesitas ejecutar. Haz el reset físico y completa la acción mínima."
    };
  }
  if (failStreak >= 3) {
    return {
      level: 3,
      tone: "duro",
      message: hardMessages[2] || "Estás entrenando la identidad que dices que no quieres tener. No negocies. Levántate y cumple 10 minutos."
    };
  }
  if (failStreak >= 2) {
    return {
      level: 2,
      tone: "directo",
      message: hardMessages[1] || "Esto ya no es un despiste. Estás repitiendo el patrón. Haz la acción mínima ahora."
    };
  }
  return {
    level: 1,
    tone: "normal",
    message: hardMessages[0] || "Has caído, pero puedes reajustar ahora."
  };
}

function App() {
  const [screen, setScreen] = useState("home");
  const [protocol, setProtocol] = useState(initialProtocol);
  const [history, setHistory] = useState(() => readHistory());
  const [showAbortModal, setShowAbortModal] = useState(false);
  const [geminiLoading, setGeminiLoading] = useState(false);

  const stats = useMemo(() => getStats(history), [history]);
  const activeConfig = getProblemConfig(protocol.problemId);
  const problemStats = useMemo(() => getStats(history, protocol.problemId), [history, protocol.problemId]);
  const firmness = toneFromFailures(problemStats.failStreak, activeConfig);

  useEffect(() => {
    const onBeforeUnload = (event) => {
      const active = JSON.parse(localStorage.getItem("sistemaAnticaidaActive") || "null");
      if (active && !active.actionCompleted && active.problemId) {
        updateActiveProtocol({ abandonedByClose: true });
        event.preventDefault();
        event.returnValue = "Cerrar ahora también cuenta como caída. ¿Vas a abandonar o vas a reajustar?";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    const changed = markActiveFailureIfNeeded();
    if (changed) setHistory(readHistory());
  }, []);

  function patchProtocol(values) {
    setProtocol((current) => {
      const next = { ...current, ...values };
      updateActiveProtocol(next);
      return next;
    });
  }

  function startProtocol() {
    const fresh = { ...initialProtocol, startedAt: new Date().toISOString() };
    setProtocol(fresh);
    saveActiveProtocol(fresh);
    setScreen("problem");
  }

  function requestAbort() {
    if (["home", "summary", "stats"].includes(screen)) {
      setScreen("home");
      return;
    }
    if (!protocol.actionCompleted) setShowAbortModal(true);
  }

  function confirmAbort() {
    const record = saveProtocol({ ...protocol, completed: false, endedAt: new Date().toISOString() });
    setHistory(readHistory());
    setProtocol(initialProtocol);
    setShowAbortModal(false);
    setScreen("home");
    return record;
  }

  async function runAnalysisAndContinue() {
    const chosenAction =
      protocol.action || activeConfig.minimalActions[Math.floor(Math.random() * activeConfig.minimalActions.length)];
    const local = fallbackAnalysis({
      protocol: { ...protocol, action: chosenAction },
      stats: problemStats,
      firmness,
      config: activeConfig
    });

    patchProtocol({ action: chosenAction, analysis: local });
    setScreen("action");
    setGeminiLoading(true);

    try {
      const previous = history.find((item) => item.problemId === protocol.problemId || item.problem === protocol.problem);
      const result = await analyzeWithGemini(
        buildGeminiPayload({
          protocol: { ...protocol, action: chosenAction },
          stats: problemStats,
          previous,
          config: activeConfig
        })
      );
      patchProtocol({
        action: result.accion_minima || chosenAction,
        reset: result.reset_fisico || protocol.reset,
        analysis: result
      });
    } catch {
      patchProtocol({ analysis: local });
    } finally {
      setGeminiLoading(false);
    }
  }

  async function prepareResetAndContinue() {
    const seededAction = activeConfig.minimalActions[0];
    const local = fallbackAnalysis({
      protocol: { ...protocol, action: seededAction },
      stats: problemStats,
      firmness,
      config: activeConfig
    });

    patchProtocol({ action: seededAction, analysis: local });
    setScreen("reset");
    setGeminiLoading(true);

    try {
      const previous = history.find((item) => item.problemId === protocol.problemId || item.problem === protocol.problem);
      const result = await analyzeWithGemini(
        buildGeminiPayload({
          protocol: { ...protocol, action: seededAction },
          stats: problemStats,
          previous,
          config: activeConfig
        })
      );
      patchProtocol({
        action: result.accion_minima || seededAction,
        analysis: result
      });
    } catch {
      patchProtocol({ analysis: local });
    } finally {
      setGeminiLoading(false);
    }
  }

  function completeProtocol(shieldValues = {}) {
    const completedProtocol = {
      ...protocol,
      ...shieldValues,
      actionCompleted: true,
      completed: true,
      endedAt: new Date().toISOString()
    };
    saveProtocol(completedProtocol);
    setProtocol(completedProtocol);
    setHistory(readHistory());
    setScreen("summary");
  }

  return (
    <main className="app">
      <div className="shell">
        <TopBar
          screen={screen}
          stats={stats}
          onStats={() => setScreen("stats")}
          onAbort={requestAbort}
        />

        {screen === "home" && <HomeScreen stats={stats} onStart={startProtocol} />}
        {screen === "problem" && (
          <ProblemSelectionScreen
            protocol={protocol}
            firmness={firmness}
            onChange={patchProtocol}
            options={problemOptions}
            onNext={prepareResetAndContinue}
          />
        )}
        {screen === "reset" && (
          <PhysicalResetScreen
            protocol={protocol}
            firmness={firmness}
            config={activeConfig}
            analysis={protocol.analysis}
            onChange={patchProtocol}
            onNext={() => setScreen("emotion")}
          />
        )}
        {screen === "emotion" && (
          <EmotionalAnalysisScreen
            protocol={protocol}
            config={activeConfig}
            onChange={patchProtocol}
            onNext={runAnalysisAndContinue}
          />
        )}
        {screen === "action" && (
          <MinimalActionScreen
            protocol={protocol}
            firmness={firmness}
            config={activeConfig}
            loading={geminiLoading}
            onComplete={() => setScreen("shield")}
            onChange={patchProtocol}
          />
        )}
        {screen === "shield" && (
          <PreventiveShieldScreen
            protocol={protocol}
            config={activeConfig}
            onChange={patchProtocol}
            onComplete={completeProtocol}
          />
        )}
        {screen === "summary" && (
          <SummaryScreen
            protocol={protocol}
            stats={getStats(readHistory(), protocol.problemId)}
            onClose={() => {
              setProtocol(initialProtocol);
              setScreen("home");
            }}
          />
        )}
        {screen === "stats" && <StatsScreen stats={stats} history={history} onBack={() => setScreen("home")} />}
      </div>

      {showAbortModal && (
        <AbortModal
          onAbort={confirmAbort}
          onAdjust={() => {
            if (!protocol.action) {
              const local = fallbackAnalysis({
                protocol: { ...protocol, action: activeConfig.minimalActions[0] },
                stats: problemStats,
                firmness,
                config: activeConfig
              });
              patchProtocol({ action: activeConfig.minimalActions[0], analysis: local });
            }
            setShowAbortModal(false);
            setScreen("action");
          }}
        />
      )}
    </main>
  );
}

function TopBar({ screen, stats, onStats, onAbort }) {
  return (
    <header className="topbar">
      <button className="brand" onClick={onAbort} aria-label="Volver al inicio">
        <Shield size={22} />
        <span>Sistema Anticaída</span>
      </button>
      <div className="top-actions">
        <span className="pill danger">
          <Flame size={16} />
          Fallos seguidos: {stats.failStreak}
        </span>
        <button className="icon-button" onClick={onStats} title="Estadísticas" aria-label="Estadísticas">
          <BarChart3 size={20} />
        </button>
        {screen !== "home" && screen !== "stats" && (
          <button className="ghost-button" onClick={onAbort}>
            Cerrar protocolo
          </button>
        )}
      </div>
    </header>
  );
}

function HomeScreen({ stats, onStart }) {
  return (
    <section className="screen home">
      <div className="stack center">
        <p className="eyebrow">Herramienta de disciplina personal</p>
        <h1>Sistema Anticaída</h1>
        <p className="subtitle">No eres una persona que abandona. Eres una persona que reajusta.</p>
        <button className="primary-button large" onClick={onStart}>
          <Play size={22} />
          Activar protocolo
        </button>
      </div>
      <div className="metric-row">
        <Metric label="Protocolos" value={stats.total} />
        <Metric label="Completados" value={stats.completed} />
        <Metric label="Mejor racha" value={stats.bestCompletionStreak} />
      </div>
    </section>
  );
}

function ProblemSelectionScreen({ protocol, firmness, options, onChange, onNext }) {
  const selectedConfig = getProblemConfig(protocol.problemId);
  const canContinue = Boolean(protocol.problemId);
  return (
    <section className="screen">
      <StepHeader
        icon={<AlertTriangle />}
        title="Selecciona el problema"
        text="La caída empieza cuando empiezas a justificarte. Nómbrala con precisión."
      />
      <FirmnessBanner firmness={firmness} />
      <div className="option-grid">
        {options.map((problem) => (
          <button
            key={problem.id}
            className={`option ${protocol.problemId === problem.id ? "selected" : ""}`}
            onClick={() =>
              onChange({
                problemId: problem.id,
                problem: problem.label,
                reset: "",
                emotion: "",
                customEmotion: "",
                action: "",
                shield: "",
                customShield: "",
                analysis: null
              })
            }
          >
            {problem.label}
          </button>
        ))}
      </div>
      <label className="field">
        <span>Detalles opcionales</span>
        <textarea
          value={protocol.details}
          onChange={(event) => onChange({ details: event.target.value })}
          placeholder={selectedConfig.detailPlaceholder}
        />
      </label>
      <button className="primary-button" disabled={!canContinue} onClick={onNext}>
        Continuar
      </button>
    </section>
  );
}

function PhysicalResetScreen({ protocol, firmness, config, analysis, onChange, onNext }) {
  const resetOptions = [...new Set([analysis?.reset_fisico, ...config.resetOptions].filter(Boolean))];
  return (
    <section className="screen">
      <StepHeader
        icon={<Dumbbell />}
        title="Antes de pensar, muévete. Haz un reset físico."
        text="No dependas de la motivación. Depende del movimiento."
      />
      <FirmnessBanner firmness={firmness} message={analysis?.mensaje_duro} />
      <div className="option-grid">
        {resetOptions.map((reset) => (
          <button
            key={reset}
            className={`option ${protocol.reset === reset ? "selected" : ""}`}
            onClick={() => onChange({ reset })}
          >
            {reset}
          </button>
        ))}
      </div>
      {analysis?.reset_fisico && <p className="recommendation">Recomendado: {analysis.reset_fisico}</p>}
      <button className="primary-button" disabled={!protocol.reset} onClick={onNext}>
        Ya hice el reset físico
      </button>
    </section>
  );
}

function EmotionalAnalysisScreen({ protocol, config, onChange, onNext }) {
  const emotion = protocol.emotion === "Otro" ? protocol.customEmotion.trim() : protocol.emotion;
  const canContinue = emotion && protocol.avoidedTask.trim() && protocol.consequence.trim();
  return (
    <section className="screen">
      <StepHeader
        icon={<Activity />}
        title={config.emotionQuestion}
        text="No negocies con la caída. Mírala de frente y baja a una acción concreta."
      />
      <div className="option-grid compact">
        {config.defaultEmotionOptions.map((emotionOption) => (
          <button
            key={emotionOption}
            className={`option ${protocol.emotion === emotionOption ? "selected" : ""}`}
            onClick={() => onChange({ emotion: emotionOption })}
          >
            {emotionOption}
          </button>
        ))}
      </div>
      {protocol.emotion === "Otro" && (
        <label className="field">
          <span>Respuesta personalizada</span>
          <input
            value={protocol.customEmotion}
            onChange={(event) => onChange({ customEmotion: event.target.value })}
            placeholder="Escribe la emoción real"
          />
        </label>
      )}
      <label className="field">
        <span>{config.avoidedQuestion}</span>
        <textarea
          required
          value={protocol.avoidedTask}
          onChange={(event) => onChange({ avoidedTask: event.target.value })}
          placeholder="La tarea concreta que no quieres mirar."
        />
      </label>
      <label className="field">
        <span>{config.consequenceQuestion}</span>
        <textarea
          required
          value={protocol.consequence}
          onChange={(event) => onChange({ consequence: event.target.value })}
          placeholder="La consecuencia real, sin adornos."
        />
      </label>
      <button className="primary-button" disabled={!canContinue} onClick={onNext}>
        Generar acción mínima
      </button>
    </section>
  );
}

function MinimalActionScreen({ protocol, firmness, config, loading, onComplete, onChange }) {
  const [seconds, setSeconds] = useState(600);
  const [running, setRunning] = useState(false);
  const finished = seconds <= 0;

  useEffect(() => {
    if (!running || finished) return undefined;
    const id = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(id);
  }, [running, finished]);

  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const rest = String(seconds % 60).padStart(2, "0");

  return (
    <section className="screen">
      <StepHeader
        icon={<Clock />}
        title="No tienes que hacer todo. Solo tienes que romper la caída con una acción mínima."
        text={`${config.hardMessages[0]} Haz 10 minutos. Luego decides.`}
      />
      <FirmnessBanner firmness={firmness} message={protocol.analysis?.mensaje_duro} />
      <div className="action-panel">
        <p className="eyebrow">{loading ? "Personalizando con Gemini..." : "Acción mínima recomendada"}</p>
        <h2>{protocol.action || config.minimalActions[0]}</h2>
        {protocol.analysis?.diagnostico && <p>{protocol.analysis.diagnostico}</p>}
        {protocol.analysis?.pregunta_reflexion && <p className="reflection">{protocol.analysis.pregunta_reflexion}</p>}
        <div className="timer">{minutes}:{rest}</div>
        {!running && !finished && (
          <button
            className="primary-button large"
            onClick={() => {
              setRunning(true);
              onChange({ actionStartedAt: new Date().toISOString() });
            }}
          >
            Empiezo acción mínima
          </button>
        )}
        {running && !finished && <p className="warning">La caída empieza cuando empiezas a justificarte.</p>}
        {finished && (
          <button className="primary-button large success" onClick={onComplete}>
            <CheckCircle2 size={22} />
            He completado la acción mínima
          </button>
        )}
      </div>
    </section>
  );
}

function PreventiveShieldScreen({ protocol, config, onChange, onComplete }) {
  const shield = protocol.shield === "Otro ajuste personalizado." ? protocol.customShield.trim() : protocol.shield;
  const shieldOptions = [...new Set([protocol.analysis?.blindaje_recomendado, ...config.shieldOptions].filter(Boolean))];
  return (
    <section className="screen">
      <StepHeader
        icon={<Lock />}
        title="¿Qué ajuste vas a hacer para que esto no vuelva a pasar mañana?"
        text="Un sistema serio no solo apaga incendios. Cierra la puerta al patrón."
      />
      {protocol.analysis?.blindaje_recomendado && (
        <p className="recommendation">Recomendado: {protocol.analysis.blindaje_recomendado}</p>
      )}
      <div className="option-grid">
        {shieldOptions.map((shieldOption) => (
          <button
            key={shieldOption}
            className={`option ${protocol.shield === shieldOption ? "selected" : ""}`}
            onClick={() => onChange({ shield: shieldOption })}
          >
            {shieldOption}
          </button>
        ))}
      </div>
      {protocol.shield === "Otro ajuste personalizado." && (
        <label className="field">
          <span>Ajuste personalizado</span>
          <input
            value={protocol.customShield}
            onChange={(event) => onChange({ customShield: event.target.value })}
            placeholder="Escribe el blindaje exacto"
          />
        </label>
      )}
      <button
        className="primary-button"
        disabled={!shield}
        onClick={() => onComplete({ shield: protocol.shield, customShield: protocol.customShield })}
      >
        Guardar blindaje
      </button>
    </section>
  );
}

function SummaryScreen({ protocol, stats, onClose }) {
  const emotion = protocol.emotion === "Otro" ? protocol.customEmotion : protocol.emotion;
  const shield = protocol.shield === "Otro ajuste personalizado." ? protocol.customShield : protocol.shield;
  return (
    <section className="screen">
      <StepHeader
        icon={<CheckCircle2 />}
        title="Hoy no has abandonado. Has reajustado."
        text="No eres alguien que abandona. Eres alguien que reajusta."
      />
      <div className="summary-list">
        <SummaryRow label="Problema elegido" value={protocol.problem} />
        <SummaryRow label="Detalles usados" value={protocol.details} />
        <SummaryRow label="Emoción detectada" value={emotion} />
        <SummaryRow label="Qué estaba evitando" value={protocol.avoidedTask} />
        <SummaryRow label="Diagnóstico" value={protocol.analysis?.diagnostico} />
        <SummaryRow label="Acción mínima completada" value={protocol.action} />
        <SummaryRow label="Blindaje elegido" value={shield} />
        <SummaryRow label="Recomendación futura" value={protocol.analysis?.blindaje_recomendado} />
        <SummaryRow label="Número de caídas acumuladas" value={stats.failed} />
      </div>
      <button className="primary-button large" onClick={onClose}>
        Cerrar protocolo
      </button>
    </section>
  );
}

function StatsScreen({ stats, history, onBack }) {
  return (
    <section className="screen">
      <StepHeader icon={<BarChart3 />} title="Estadísticas" text="Lo que se mide deja de esconderse." />
      <div className="metric-grid">
        <Metric label="Total de protocolos activados" value={stats.total} />
        <Metric label="Acciones mínimas completadas" value={stats.completed} />
        <Metric label="Fallos seguidos" value={stats.failStreak} />
        <Metric label="Mejor racha de cumplimiento" value={stats.bestCompletionStreak} />
        <Metric label="Problema más repetido" value={stats.mostRepeatedProblem || "Sin datos"} />
        <Metric label="Emoción más repetida" value={stats.mostRepeatedEmotion || "Sin datos"} />
      </div>
      <div className="history">
        {history.slice(0, 8).map((item) => (
          <div className="history-row" key={item.id}>
            <span>{new Date(item.date).toLocaleString("es-ES")}</span>
            <strong>{item.completed ? "Completado" : "Fallo"}</strong>
            <span>
              {item.problem}
              {item.details ? ` - ${item.details}` : ""}
              {item.analysis?.blindaje_recomendado ? ` | Próximo blindaje: ${item.analysis.blindaje_recomendado}` : ""}
            </span>
          </div>
        ))}
      </div>
      <button className="secondary-button" onClick={onBack}>
        <ChevronLeft size={18} />
        Volver
      </button>
    </section>
  );
}

function StepHeader({ icon, title, text }) {
  return (
    <div className="step-header">
      <div className="step-icon">{icon}</div>
      <div>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
    </div>
  );
}

function FirmnessBanner({ firmness, message }) {
  return (
    <div className={`firmness tone-${firmness.tone}`}>
      <strong>Nivel {firmness.level}</strong>
      <span>{message || firmness.message}</span>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="summary-row">
      <span>{label}</span>
      <strong>{value || "No registrado"}</strong>
    </div>
  );
}

function AbortModal({ onAbort, onAdjust }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <XCircle size={34} className="warn-icon" />
        <h2>Cerrar ahora también cuenta como caída. ¿Vas a abandonar o vas a reajustar?</h2>
        <div className="modal-actions">
          <button className="danger-button" onClick={onAbort}>
            Abandonar
          </button>
          <button className="primary-button" onClick={onAdjust}>
            Reajustar ahora
          </button>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
