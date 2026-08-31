export const problemConfigs = {
  gaming: {
    label: "Quiero jugar cuando debería trabajar",
    context: "impulso de jugar en horario de trabajo",
    detailPlaceholder: "Quiero jugar Roblox/PS5 pero tengo que trabajar en mi tienda.",
    emotionQuestion: "¿Qué emoción te está empujando a jugar ahora?",
    avoidedQuestion: "¿Qué trabajo estabas evitando hacer?",
    consequenceQuestion: "¿Qué pasaría si juegas ahora y rompes tu compromiso?",
    defaultEmotionOptions: [
      "Aburrimiento",
      "Cansancio",
      "Pereza",
      "Miedo a fallar",
      "Falta de claridad",
      "Búsqueda de dopamina rápida",
      "Enfado",
      "Estrés",
      "Otro"
    ],
    resetOptions: [
      "20 flexiones",
      "Lavarte la cara con agua fría",
      "Caminar 3 minutos",
      "Subir y bajar escaleras",
      "Respirar 1 minuto y levantarte de la silla"
    ],
    minimalActions: [
      "Trabajar 10 minutos antes de decidir si juego.",
      "Terminar una tarea pequeña de Shopify.",
      "Escribir un copy de anuncio.",
      "Revisar métricas.",
      "Buscar 3 productos.",
      "Arreglar una sección de la web.",
      "Subir o preparar un vídeo.",
      "Hacer 45 minutos de trabajo profundo."
    ],
    shieldOptions: [
      "Bloquear juegos durante horario de trabajo.",
      "Quitar accesos directos.",
      "Dejar el móvil lejos.",
      "Cerrar sesión en juegos.",
      "Escribir la primera tarea antes de empezar.",
      "Trabajar primero 45 minutos antes de ocio.",
      "Otro ajuste personalizado."
    ],
    hardMessages: [
      "Has caído, pero puedes reajustar ahora.",
      "Esto ya no es un despiste. Estás repitiendo el patrón. Haz la acción mínima ahora.",
      "Estás entrenando la identidad que dices que no quieres tener. No negocies. Levántate y cumple 10 minutos.",
      "Si juegas ahora, estás eligiendo perder respeto por ti mismo. No necesitas motivación. Necesitas ejecutar. Haz el reset físico y completa la acción mínima."
    ]
  },
  procrastination: {
    label: "Estoy procrastinando",
    context: "evasión de una tarea concreta",
    detailPlaceholder: "Estoy evitando editar el anuncio 3 de Meta Ads.",
    emotionQuestion: "¿Qué emoción está alimentando la procrastinación?",
    avoidedQuestion: "¿Qué tarea exacta estás evitando?",
    consequenceQuestion: "¿Qué coste tendrá seguir aplazando esto hoy?",
    defaultEmotionOptions: [
      "Falta de claridad",
      "Pereza",
      "Miedo a empezar",
      "Tarea demasiado grande",
      "Perfeccionismo",
      "Saturación",
      "Búsqueda de dopamina rápida",
      "Estrés",
      "Otro"
    ],
    resetOptions: [
      "Levantarte y ordenar la mesa 2 minutos",
      "Caminar 3 minutos",
      "Abrir la tarea y dejarla visible",
      "Respirar 1 minuto de pie",
      "Escribir en papel el primer paso"
    ],
    minimalActions: [
      "Abrir la tarea y trabajar solo 10 minutos.",
      "Editar una sola frase del trabajo pendiente.",
      "Crear una lista de 3 pasos y ejecutar el primero.",
      "Eliminar una distracción visible y empezar.",
      "Enviar o preparar una versión imperfecta.",
      "Cerrar todo menos la herramienta necesaria.",
      "Marcar un bloque de 15 minutos y empezar por lo más pequeño."
    ],
    shieldOptions: [
      "Escribir la primera tarea antes de abrir redes.",
      "Dividir la tarea de mañana en 3 pasos visibles.",
      "Bloquear webs de distracción durante el primer bloque.",
      "Dejar preparada la pestaña o archivo de trabajo.",
      "Trabajar 25 minutos antes de revisar ocio.",
      "Poner una alarma de inicio obligatorio.",
      "Otro ajuste personalizado."
    ],
    hardMessages: [
      "No necesitas ganas. Necesitas abrir la tarea.",
      "Procrastinar también es una decisión.",
      "Si lo aplazas otra vez, entrenas evasión.",
      "Haz el primer paso aunque sea incómodo."
    ]
  },
  lowEnergy: {
    label: "No tengo energía",
    context: "baja energía física o mental",
    detailPlaceholder: "Dormí poco y tengo que preparar pedidos o revisar campañas.",
    emotionQuestion: "¿Qué tipo de cansancio está mandando ahora?",
    avoidedQuestion: "¿Qué tarea mínima podrías hacer incluso con poca energía?",
    consequenceQuestion: "¿Qué empeora si usas el cansancio como permiso para abandonar?",
    defaultEmotionOptions: [
      "Sueño",
      "Agotamiento mental",
      "Saturación",
      "Pereza",
      "Desánimo",
      "Estrés físico",
      "Falta de foco",
      "Resistencia",
      "Otro"
    ],
    resetOptions: [
      "Beber agua y levantarte 2 minutos",
      "Lavarte la cara con agua fría",
      "Caminar 3 minutos",
      "Respirar 1 minuto junto a una ventana",
      "Estirar cuello, hombros y espalda"
    ],
    minimalActions: [
      "Hacer 10 minutos de una tarea fácil pero útil.",
      "Ordenar el escritorio y abrir la tarea prioritaria.",
      "Responder un mensaje importante.",
      "Revisar una métrica clave y anotar una decisión.",
      "Preparar el siguiente bloque de trabajo para cuando vuelva la energía.",
      "Completar una tarea administrativa pequeña.",
      "Hacer 15 minutos a ritmo bajo, sin negociar."
    ],
    shieldOptions: [
      "Dormir con hora de corte clara.",
      "Preparar agua y primera tarea antes de empezar.",
      "Planear tareas ligeras para momentos de baja energía.",
      "Evitar ocio dopaminérgico al empezar el día.",
      "Hacer primer bloque de trabajo antes del móvil.",
      "Dejar una lista de tareas de baja energía.",
      "Otro ajuste personalizado."
    ],
    hardMessages: [
      "Baja energía no significa cero ejecución.",
      "No confundas cansancio con permiso para abandonar.",
      "Haz una tarea pequeña. El sistema no se apaga.",
      "Hoy toca ritmo bajo, no rendición."
    ]
  },
  doubts: {
    label: "Tengo dudas y me bloqueo",
    context: "bloqueo por duda, miedo o falta de decisión",
    detailPlaceholder: "No sé si lanzar este producto o cambiar el anuncio.",
    emotionQuestion: "¿Qué emoción hay debajo de la duda?",
    avoidedQuestion: "¿Qué decisión o prueba estás evitando?",
    consequenceQuestion: "¿Qué pierdes si sigues bloqueado sin probar nada?",
    defaultEmotionOptions: [
      "Miedo a fallar",
      "Perfeccionismo",
      "Inseguridad",
      "Sobrecarga de opciones",
      "Falta de claridad",
      "Vergüenza",
      "Necesidad de control",
      "Estrés",
      "Otro"
    ],
    resetOptions: [
      "Escribir la decisión en una línea",
      "Caminar 3 minutos sin móvil",
      "Respirar 1 minuto de pie",
      "Cerrar pestañas que no ayudan",
      "Anotar la opción más simple"
    ],
    minimalActions: [
      "Elegir una prueba pequeña y ejecutarla 10 minutos.",
      "Escribir dos opciones y escoger una por defecto.",
      "Crear un experimento de 24 horas.",
      "Publicar una versión simple sin perfeccionarla.",
      "Pedir un dato concreto en vez de pensar más.",
      "Tomar una decisión reversible y avanzar.",
      "Eliminar una opción y trabajar con la restante."
    ],
    shieldOptions: [
      "Definir criterios de decisión antes de trabajar.",
      "Limitar investigación a 15 minutos.",
      "Usar decisiones reversibles por defecto.",
      "Escribir la próxima prueba la noche anterior.",
      "Guardar una plantilla de experimentos pequeños.",
      "Bloquear cambios hasta terminar el primer bloque.",
      "Otro ajuste personalizado."
    ],
    hardMessages: [
      "La duda parece prudencia, pero hoy está siendo evasión.",
      "No necesitas certeza total. Necesitas una prueba pequeña.",
      "Pensar más no cuenta si no produce acción.",
      "Decide algo reversible y muévete."
    ]
  },
  abandonment: {
    label: "He fallado y quiero abandonar",
    context: "derrota reciente y ganas de abandonar",
    detailPlaceholder: "Fallé el plan de hoy y siento que ya da igual.",
    emotionQuestion: "¿Qué emoción te está empujando a abandonar?",
    avoidedQuestion: "¿Qué compromiso quieres soltar ahora mismo?",
    consequenceQuestion: "¿Qué identidad entrenas si abandonas después de fallar?",
    defaultEmotionOptions: [
      "Culpa",
      "Vergüenza",
      "Frustración",
      "Cansancio",
      "Todo o nada",
      "Rabia",
      "Desánimo",
      "Miedo a volver a fallar",
      "Otro"
    ],
    resetOptions: [
      "Levantarte y caminar 3 minutos",
      "Lavarte la cara con agua fría",
      "Respirar 1 minuto y volver a sentarte",
      "Ordenar el espacio de trabajo",
      "Escribir: fallo no es abandono"
    ],
    minimalActions: [
      "Hacer una reparación de 10 minutos.",
      "Completar una tarea pequeña para cerrar el día con cumplimiento.",
      "Escribir el siguiente paso y hacerlo ahora.",
      "Enviar una versión mínima de lo pendiente.",
      "Recoger el fallo en una línea y ejecutar una corrección.",
      "Trabajar 15 minutos sin intentar compensarlo todo.",
      "Preparar el primer bloque de mañana y ejecutar 5 minutos hoy."
    ],
    shieldOptions: [
      "Definir una regla de reparación mínima tras fallar.",
      "Escribir el primer paso de mañana antes de cerrar.",
      "No usar un fallo como permiso para ocio impulsivo.",
      "Crear una tarea de recuperación de 10 minutos.",
      "Registrar el fallo sin dramatizarlo.",
      "Volver al sistema antes de tomar decisiones grandes.",
      "Otro ajuste personalizado."
    ],
    hardMessages: [
      "Fallar no te autoriza a abandonar.",
      "El daño real empieza cuando conviertes un fallo en identidad.",
      "Repara 10 minutos. No dramatices.",
      "Hoy no toca perfección. Toca volver."
    ]
  },
  other: {
    label: "Otro problema",
    context: "problema personal de ejecución",
    detailPlaceholder: "Describe el patrón exacto que está a punto de tumbarte.",
    emotionQuestion: "¿Qué emoción está empujando este patrón?",
    avoidedQuestion: "¿Qué acción concreta estás evitando?",
    consequenceQuestion: "¿Qué pasará si cedes ahora?",
    defaultEmotionOptions: [
      "Miedo",
      "Cansancio",
      "Pereza",
      "Vergüenza",
      "Estrés",
      "Falta de claridad",
      "Impulso",
      "Frustración",
      "Otro"
    ],
    resetOptions: [
      "Caminar 3 minutos",
      "Lavarte la cara con agua fría",
      "Respirar 1 minuto de pie",
      "Ordenar tu mesa 2 minutos",
      "Escribir el primer paso"
    ],
    minimalActions: [
      "Hacer 10 minutos de la acción más pequeña posible.",
      "Abrir la herramienta necesaria y completar un paso.",
      "Escribir una línea clara de lo que toca hacer.",
      "Eliminar una distracción y empezar.",
      "Completar una reparación mínima.",
      "Preparar el siguiente bloque y ejecutar 5 minutos.",
      "Pedir ayuda o buscar un dato concreto."
    ],
    shieldOptions: [
      "Escribir la primera acción antes de empezar mañana.",
      "Bloquear la distracción principal.",
      "Reducir el objetivo a una acción de 10 minutos.",
      "Preparar el entorno antes del bloque de trabajo.",
      "Crear una regla de reinicio cuando aparezca el patrón.",
      "Registrar el disparador principal.",
      "Otro ajuste personalizado."
    ],
    hardMessages: [
      "No necesitas explicar más. Necesitas ejecutar una acción pequeña.",
      "El patrón pierde fuerza cuando te mueves.",
      "No negocies con una excusa bien redactada.",
      "Haz 10 minutos y recupera el mando."
    ]
  }
};

export const problemOptions = Object.entries(problemConfigs).map(([id, config]) => ({
  id,
  label: config.label
}));

export function getProblemConfig(problemId) {
  return problemConfigs[problemId] || problemConfigs.other;
}

export function getProblemLabel(problemId) {
  return getProblemConfig(problemId).label;
}
