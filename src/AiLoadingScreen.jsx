import React, { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";

export const AI_LOADING_CONFIG = {
  launch_questionnaire: {
    title: "Preparando cuestionario",
    subtitle: "La IA está cerrando el alcance de tu tarea para hacerte mejores preguntas.",
    steps: ["Analizando la tarea", "Detectando categoría", "Identificando bloqueo", "Preparando preguntas útiles"],
    maxSeconds: 20
  },
  launch_plan: {
    title: "Generando plan de ejecución",
    subtitle: "La IA está convirtiendo tus respuestas en pasos pequeños y accionables.",
    steps: ["Leyendo tus respuestas", "Dividiendo la tarea", "Calculando duración aproximada", "Preparando acción mínima"],
    maxSeconds: 30
  },
  anti_fall: {
    title: "Activando protocolo",
    subtitle: "La IA está usando tu historial para ajustar el tono y la acción mínima.",
    steps: ["Revisando patrón", "Analizando emoción", "Ajustando dureza", "Preparando reajuste"],
    maxSeconds: 20
  },
  deep_work: {
    title: "Preparando bloque",
    subtitle: "La IA está convirtiendo tu objetivo en un plan de trabajo profundo.",
    steps: ["Leyendo tu objetivo", "Revisando memoria", "Detectando distracciones", "Dividiendo el bloque", "Preparando plan final"],
    maxSeconds: 35
  }
};

export default function AiLoadingScreen({ type, title, subtitle, steps, maxSeconds, onCancel }) {
  const defaults = AI_LOADING_CONFIG[type] || AI_LOADING_CONFIG.deep_work;
  const content = {
    title: title || defaults.title,
    subtitle: subtitle || defaults.subtitle,
    steps: steps?.length ? steps : defaults.steps,
    maxSeconds: maxSeconds || defaults.maxSeconds
  };
  const [activeStep, setActiveStep] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    setActiveStep(0);
    setElapsedSeconds(0);
    const stepTimer = window.setInterval(() => {
      setActiveStep((current) => Math.min(current + 1, content.steps.length - 1));
    }, Math.max(1000, Math.floor((content.maxSeconds * 1000) / content.steps.length)));
    const counterTimer = window.setInterval(() => {
      setElapsedSeconds((current) => Math.min(current + 1, content.maxSeconds));
    }, 1000);
    return () => {
      window.clearInterval(stepTimer);
      window.clearInterval(counterTimer);
    };
  }, [type, content.maxSeconds, content.steps.length]);

  return <section className="screen ai-loading-screen" aria-live="polite" aria-busy="true">
    <div className="ai-loading-heading"><div className="ai-spinner" aria-hidden="true" /><div><p className="eyebrow">Procesando con IA</p><h1>{content.title}</h1><p className="subtitle">{content.subtitle}</p></div></div>
    <div className="ai-progress" aria-hidden="true"><i style={{ width: `${((activeStep + 1) / content.steps.length) * 100}%` }} /></div>
    <div className="ai-loading-steps">{content.steps.map((step, index) => {
      const state = index < activeStep ? "done" : index === activeStep ? "active" : "pending";
      return <div className={`ai-loading-step ${state}`} key={step}>
        <span className="ai-step-status">{state === "done" ? <CheckCircle2 size={19} /> : <i />}</span>
        <span>{step}</span>
      </div>;
    })}</div>
    <div className="ai-loading-counter"><span>Esto puede tardar unos segundos.</span><strong>{elapsedSeconds}s / {content.maxSeconds}s</strong></div>
    {onCancel && <button className="ghost-button ai-cancel-button" type="button" onClick={onCancel}>Cancelar y usar versión local</button>}
  </section>;
}
