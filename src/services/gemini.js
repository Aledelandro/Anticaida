export async function analyzeWithGemini(payload) {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error("No se pudo llamar al analizador.");
  }

  const data = await response.json();
  if (!data.ok) {
    throw new Error(data.error || "Gemini no disponible.");
  }

  return data.result;
}
