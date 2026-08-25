# Spec-Driven Development · Secuenciador MIDI generativo (Web App)

> **Cómo usar este documento.** Es un prompt completo para un agente de código (Claude Code, Cursor, Codex…). Entrégalo por secciones, no de golpe:
>
> 1. Pega **§0 + §1 (Constitución)** y pide: *"Confirma que has entendido las reglas no negociables. No escribas código todavía."*
> 2. Pega **§2 (Spec)** y pide: *"Lee la spec. Antes de planificar, lístame TODO lo que esté ambiguo o infra-especificado como `[NECESITA ACLARACIÓN]`. No escribas código todavía."*
> 3. Resuelve las ambigüedades. Luego pega **§3–§5 (Plan, Modelo de datos, Contratos)**.
> 4. Pega **§6 (Tasks)** y pide que ejecute **una fase por vez**, parando en cada *Definition of Done*.
>
> Regla permanente para el agente: **si una decisión no está en este documento, pregunta antes de inventar.**

---

## §0 · Brief

Construye una **web app de secuenciación MIDI generativa**, mobile-first, que funcione offline.

El usuario apila **módulos** en un *rack*. Cada módulo genera una parte musical distinta (línea de bajo, batería, acordes, arpegio, patrón euclidiano…), siempre **en tonalidad y en tiempo** respecto a un tempo y una tonalidad globales del proyecto. Cada módulo suena por sí solo a través de un motor de audio interno, y —cuando el navegador lo permite— envía MIDI a hardware externo por su propio puerto y canal.

La generación es **local, algorítmica y determinista a partir de una semilla**. Sin nube, sin modelo de IA, sin cuenta de usuario, sin telemetría.

**Nombre del producto:** `sequens-R`. No uses "Sequentia": es un producto existente y esto es una obra distinta, no un clon de marca.

**Referencia conceptual:** Sequentia (iOS). Se toma de ella el *modelo de interacción* (rack modular, random/mutate, tempo y tonalidad globales, ruteo por módulo). **No** se copian su nombre, su identidad visual, sus textos, sus librerías de contenido ni sus assets.

---

## §1 · Constitución (reglas no negociables)

Estas reglas ganan a cualquier otra consideración. Si una tarea del §6 las contradice, para y avisa.

### C1 · Determinismo
Todo generador es una **función pura**: `generate(seed, params, contextoMusical) → Pattern`. Sin `Math.random()`, sin `Date.now()`, sin acceso a estado global, sin I/O. La única fuente de aleatoriedad es un PRNG sembrado, pasado explícitamente. Misma entrada → misma salida, siempre, en cualquier máquina.

### C2 · El hilo de audio nunca lee estado reactivo
El scheduler y los `AudioWorklet` **no** leen stores de Svelte, ni el DOM, ni observan objetos reactivos. La UI empuja *snapshots inmutables* al motor mediante una cola de mensajes. Una violación de esta regla produce glitches audibles y es un bug de severidad alta.

### C3 · Cero red en tiempo de ejecución
Después de la instalación del PWA, la app funciona con el avión activado. No hay llamadas de red en ninguna ruta de código. No hay analytics, ni fuentes remotas, ni CDN en runtime. Todo asset se sirve desde el propio origen y se cachea.

**Corolario:** como todo es del mismo origen, el **aislamiento cross-origin sale gratis**. Se sirve con `Cross-Origin-Opener-Policy: same-origin` y `Cross-Origin-Embedder-Policy: require-corp`, y se verifica que `crossOriginIsolated === true` al arrancar. Eso sube la resolución de `performance.now()` de 100 µs a 5 µs, que es justo lo que hace medible el jitter de C10.

*(Habilita también `SharedArrayBuffer`, pero **no se usa en v1**: ver §3.1.)*

### C4 · Los datos son del usuario
Todo se guarda en IndexedDB / OPFS en el dispositivo. Existe **exportar todo** (`.json` + samples en `.zip`) e **importar todo**. Nunca se envía nada a ningún servidor.

### C5 · CSS a mano
Vanilla CSS. Nada de Tailwind, Bootstrap, UnoCSS, styled-components ni librerías de componentes. Se permiten: custom properties, `@layer`, nesting nativo, container queries, `oklch()`. Un único fichero de tokens es la fuente de verdad de color, espaciado, tipografía y radios.

### C6 · Dos superficies, un núcleo
Sin App Store, la distribución es por enlace, y los enlaces se abren en el móvil. Pero el hardware está en una mesa. Son dos disposiciones del mismo producto, adaptadas a contextos distintos:

- **Móvil = superficie de captación y edición compacta.** Abrir un enlace, oírlo, Random/Mutate, editar cualquiera de los módulos, compartir y exportar. Los editores densos usan revelado progresivo o una superficie dedicada; nunca se comprime el estudio de escritorio dentro del viewport.
- **Escritorio (≥ 1024 px) = superficie de estudio expandida.** Los mismos módulos en carriles paralelos, más atajos de teclado y capacidades dependientes del dispositivo como selección de salida y File System Access.

**El núcleo compartido se diseña a 375 × 667 CSS px, en vertical, con una sola mano.** Transporte, placa de módulo, rejilla de pasos, knob, Random/Mutate, slots, selector de preset. La restricción del pulgar mejora esas primitivas de verdad, y por eso se mantiene entera: área táctil mínima 44 × 44 px, nada crítico detrás de un `hover`, nada crítico en la zona de la barra de gestos.

El escritorio **ensancha** el núcleo, no lo reemplaza. Tras la fase 6, que un módulo no pueda editarse en móvil es un bug. Una capacidad realmente dependiente del dispositivo o del layout de estudio —por ejemplo `setSinkId`, File System Access, atajos globales o carriles paralelos— puede seguir siendo exclusiva de escritorio.

**Corolario de latencia:** el móvil no es para tocar con los dedos. En v1 **no se construye nada que dependa de latencia ajustada entre gesto y sonido** — ni teclado tocable, ni tap tempo por sensación, ni finger drumming. Eso neutraliza el techo de latencia de Android en lugar de pelearlo. Si algún día se quiere, es una función de escritorio.

### C7 · El sonido interno es monitorización
El motor de audio interno **jamás** altera los eventos MIDI que se envían o se exportan. Cuando un módulo tiene un destino MIDI externo asignado, su voz interna se silencia por defecto para no doblar al hardware. Un botón de altavoz por módulo anula esa decisión en ambos sentidos.

### C8 · Mutate es reversible
Cualquier mutación conserva el patrón original intacto. `revert()` devuelve exactamente el patrón previo, byte a byte. Se implementa guardando el original + una pila de transformaciones puras, no mutando en sitio.

### C9 · TypeScript estricto
`strict: true`, `noUncheckedIndexedAccess: true`. Cero `any` en código de producción (`unknown` + narrowing sí). Los tipos del dominio musical viven en un solo módulo compartido.

### C10 · Presupuestos de rendimiento (fallar el presupuesto es fallar la tarea)
Dispositivo de referencia: **Android de gama media, Chrome estable**. Se mide ahí, no en el portátil del desarrollador.

- JS inicial ≤ **200 KB** gzip; carga total inicial ≤ 400 KB.
- 0 xruns de audio con **16 módulos activos** a 140 BPM.
- `AudioContext.renderCapacity` medio ≤ **0.5**, pico ≤ 0.8 en ese escenario (si la API existe; feature-detect).
- Frame de UI ≤ **8 ms** con el transporte en marcha.
- TTI ≤ 2.5 s en 4G simulada.
- Jitter de scheduling MIDI ≤ **1 ms** de desviación estándar, medido con `performance.now()` bajo aislamiento cross-origin.
- Latencia de audio (`baseLatency + outputLatency`) reportada en el panel de diagnóstico y por debajo de **40 ms** en el dispositivo de referencia.

### C11 · Accesibilidad
`prefers-reduced-motion` respetado. Foco visible en todo control. Cada control es operable por teclado. Los pasos del secuenciador tienen `role`/`aria-*` correctos. Contraste AA mínimo en texto e iconografía.

### C12 · Todo patch cabe en un enlace
Un rack son semillas más parámetros: **200–400 bytes** comprimidos. Cabe en el fragmento de una URL, que **nunca sale del navegador** — así que compartir no contradice C3 ni C4. Mandas un enlace y la otra persona oye tu patch exacto, sin cuenta, sin subir nada, sin servidor.

Esto es el mecanismo de distribución del producto, no una función más. Todo módulo nuevo debe ser serializable a esa forma. Si un módulo no puede serlo (§4), se marca explícitamente como no compartible por enlace y se exporta como fichero.

### C13 · Antiobjetivos explícitos
No se construye: cuenta de usuario, sincronización en la nube, colaboración en tiempo real, generación por IA/LLM, feed social, ni pantalla de onboarding con carrusel. Si el agente propone alguna, es señal de que ha perdido el hilo.

Tampoco se construye una versión de escritorio separada, ni un contenedor nativo.

---

## §2 · Especificación funcional (el QUÉ)

> Formato: `RF-###`. Cada requisito lleva criterios de aceptación verificables. El agente no puede marcar una tarea como hecha sin demostrar sus criterios.

### 2.1 Usuarios y contexto

- **U1 — El del hardware.** Tiene sintes/cajas de ritmo. Quiere que el móvil o el portátil sea el cerebro que genera y dispara. Necesita ruteo por módulo y clock MIDI fiable.
- **U2 — El del sofá.** No tiene nada enchufado. Quiere darle a play y que suene música. Nunca verá un puerto MIDI.
- **U3 — El que lleva ideas al DAW.** Genera, encuentra algo bueno, exporta `.mid` y sigue en Ableton/Logic.

**El caso base es U2.** La app debe sonar y ser satisfactoria sin ningún permiso, sin ningún dispositivo y sin ninguna configuración.

### 2.2 Recorrido crítico (debe funcionar en la fase 1)

**Nadie llega a un rack vacío.** Una pantalla en blanco en una web sin instalar es gente que se va.

`Abrir un enlace (propio o compartido) → un rack de arranque ya cargado → un toque en Play → suena → Random hasta que guste → ajustar un knob → Compartir → el destinatario lo oye idéntico.`

De principio a fin, en un móvil, **en menos de diez segundos y con un solo permiso: ninguno.**

### 2.3 Proyecto y transporte

| ID | Requisito | Criterios de aceptación |
|---|---|---|
| RF-001 | Tempo global 20–300 BPM, resolución 0.1 | Cambiar el tempo durante la reproducción no produce corte ni desfase; todos los módulos siguen alineados en la siguiente subdivisión |
| RF-002 | Tonalidad global: raíz (12) × escala (mayor, menor natural, dórico, frigio, lidio, mixolidio, locrio, menor armónica, pentatónica menor, blues) | Cambiar la tonalidad en marcha transporta todas las partes melódicas en la siguiente barra sin regenerar el patrón |
| RF-003 | Transporte: play / stop / (opcional) rec. Stop devuelve el playhead a 0 | Doble tap en stop = pánico: `All Notes Off` (CC 123) + `All Sound Off` (CC 120) en todos los canales y corte del audio interno en < 50 ms |
| RF-004 | Un proyecto contiene: metadatos, tempo, tonalidad, 1..N racks, ajustes | Cerrar la pestaña y reabrir restaura el estado exacto, incluidos los samples del usuario |
| RF-005 | Undo/redo global sobre todo el rack, ≥ 50 pasos | Un arrastre de knob completo cuenta como **un** paso, no como cincuenta |
| RF-006 | **Rack de arranque.** Sin proyecto previo y sin patch en la URL, la app carga tres módulos (Drums + Bass + Chords) con semillas fijas y auditadas | Primera visita: el único gesto necesario para oír música es Play. La semilla de arranque está versionada en el repositorio y cubierta por un test golden |
| RF-007 | **Compartir por enlace.** Un botón serializa el rack al fragmento de la URL y lo copia al portapapeles | Abrir ese enlace en otro dispositivo produce **audio idéntico**, verificado por igualdad profunda del patrón generado. El fragmento nunca se envía a ningún servidor |
| RF-007a | El enlace lleva versión de esquema | Un enlace de una versión antigua o se migra, o dice con claridad que no se puede abrir. Nunca carga algo distinto en silencio |
| RF-008 | Un patch con módulos no serializables (piano roll dibujado, samples propios) avisa antes de compartir | Se ofrece exportar fichero como alternativa, y se indica exactamente qué módulos se perderían |

### 2.4 El rack y el módulo

| ID | Requisito | Criterios de aceptación |
|---|---|---|
| RF-010 | Módulos apilados verticalmente, reordenables por arrastre desde un asa | El arrastre no interfiere con el scroll vertical de la lista; funciona con un solo dedo |
| RF-011 | Cabecera común en cada módulo: asa, nombre editable, altavoz (monitor), S (solo), M (mute), menú, plegar | Plegar un módulo no detiene su reproducción |
| RF-012 | Añadir / duplicar / borrar módulos **con el transporte en marcha** | Ninguna de las tres operaciones produce un click, un corte ni una nota colgada en los demás módulos |
| RF-013 | Cada módulo tiene destino MIDI propio (puerto + canal 1–16). No existe salida global | Dos módulos pueden apuntar a puertos distintos simultáneamente |
| RF-014 | Cada módulo tiene su propia semilla, visible y editable/copiable | Introducir una semilla conocida reproduce el patrón exacto |
| RF-015 | `Random` genera un patrón nuevo (nueva semilla). `Mutate` evoluciona el actual con intensidad 1–4 cada N loops | RF-015a: `Revert` devuelve el patrón pre-mutación idéntico (test de igualdad profunda) |
| RF-016 | Solo/mute: `S` aísla; `M` detiene el módulo. En módulos de control (sin notas) `M` corta el envío | Activar mute con notas sonando envía note-off, no deja notas colgadas |

### 2.5 Módulos — alcance por superficie

**Núcleo — v1, ambas superficies. Cinco módulos. Se acabó.**

| ID | Módulo | Núcleo |
|---|---|---|
| RF-020 | **Drums** | 8 carriles, 16/32 pasos, edición por toque, librería de grooves por estilo, swing, velocidad por paso, humanize |
| RF-021 | **Bass** | Línea generativa por estilo (≥ 6 estilos), `steps`, `range`, `density`, `drive`, `octave`, `gate` |
| RF-022 | **Acid** | Línea monofónica estilo 303: `fill`, `steps` 4–32, `range`, `decay`, con **slide** (portamento real) y **accent** |
| RF-023 | **Chords** | Progresión diatónica 1–8 acordes en la tonalidad del proyecto; calidad por acorde (tríada, 7ª, 9ª, sus); duración por acorde; `strum` |
| RF-024 | **Mixer** | No produce sonido. Mute / solo / nivel de otros módulos o de todos |

> **Sobre el Acid.** Lo musicalmente valioso es la **generación** con slide y accent, no el modelado de circuito. En v1 la voz es sierra + biquad resonante + envolvente de decay, y basta. El filtro escalera de retardo cero (TPT) es la parte más lenta de todo el DSP del proyecto y **no es lo que hace útil la app el primer día**: se difiere a la fase 5, detrás de la misma interfaz de voz, para poder sustituirlo sin tocar nada más.

**Ampliación introducida en escritorio — fase 4; paridad de edición móvil — fase 6.** La fase 4 incorporó estos módulos inicialmente para viewport ≥ 1024 px y dejó su reproducción móvil en modo de solo lectura. La fase 6 debe permitir añadirlos y editarlos también en móvil mediante superficies adaptativas, sin duplicar el modelo, los generadores, el scheduler ni la serialización.

| ID | Módulo | Núcleo |
|---|---|---|
| RF-025 | **Arp** | Convierte un acorde en línea. Dirección, rate, span de octavas, gate. `Follow Chords`: sigue en vivo al primer módulo Chords |
| RF-026 | **Euclid** | 3 anillos independientes (Bjorklund), `steps` 2–16, `hits`, `rotation`, nota por anillo, salida conjunta o por canales separados |
| RF-027 | **Piano roll** | Dibujo manual: añadir con toque, mover con arrastre, redimensionar por el borde. Modo `In Key` / `Chromatic`. 16/32/64 pasos. **No serializable a enlace** (C12) |
| RF-028 | **CC Control** | Panel de knobs → CC MIDI. Canal por control. Grabación de movimiento en bucle de 1–8 barras |
| RF-029 | **Mod** | Hasta 3 LFOs sincronizados a tempo sobre CCs. Forma, rate en beats, depth, fade-in, centro, bipolar |

**Backlog — fase 5 o más tarde. No se planifica hasta que el núcleo tenga uso demostrado.**

| ID | Módulo | Núcleo |
|---|---|---|
| RF-030 | **Stabs** | Acordes cortos por estilo, `voices` 1–4, `density`, `gate`, `follow chords` |
| RF-031 | **Rain** | Notas dispersas generativas, nunca se repite. `density`, `range`, `gate` |
| RF-032 | **Sampler** | Audio propio del usuario. **No serializable a enlace** |
| RF-033 | **Performer** | Pad XY que reconfigura el rack en vivo: X = densidad, Y = movimiento. Centro = HOME. `Break` mientras se mantiene. Cuantizado al compás, así que la latencia no le afecta |

### 2.6 Motor de audio interno

| ID | Requisito | Criterios de aceptación |
|---|---|---|
| RF-040 | Cada módulo que emite notas tiene una voz interna; Mixer, CC Control y Mod son silenciosos por contrato. Play produce sonido sin ninguna configuración | Primera visita, un solo toque en Play → se oye música; añadir un módulo de control no crea una voz |
| RF-041 | Banco de presets: ≥ 12 voces Acid, ≥ 40 voces no-Acid repartidas entre Bass/Chords/Arp/Piano/Euclid y ≥ 6 kits de batería | Todos los presets están **nivelados** en loudness percibida (±1 LU) |
| RF-042 | Cambio de preset en caliente, sin cortar la reproducción | El cambio ocurre en el siguiente límite de nota, sin click |
| RF-043 | Cada tipo de módulo audible abre con un preset coherente con lo que genera | Bass, Acid, Chords, Arp, Piano y Euclid se distinguen por timbre sin mirar la UI |
| RF-044 | El bus máster lleva un limitador | Con 16 módulos a tope no hay clipping digital |
| RF-045 | El motor interno **es gratis y está activo por defecto** | — |
| RF-046 | Los parámetros generativos y los de sonido son contratos separados | Cambiar preset, panorama, macros o sends no cambia ningún `NoteEvent`, MIDI enviado ni SMF exportado |
| RF-047 | Reproducción en vivo y bounce comparten la misma fábrica de voces, presets y grafo | La misma frase y preset cumplen tolerancias de duración, loudness, pico, DC y envolvente espectral en ambos caminos |
| RF-048 | Los controles de sonido responden en vivo con suavizado de `AudioParam` | Barrer cualquier macro durante reproducción no produce clicks ni zipper noise; los cambios de topología/preset entran en el siguiente ataque de nota |
| RF-049 | Todo preset es local, versionado y con procedencia documentada | Cero CDN/runtime fetch. Assets externos sin licencia compatible o procedencia verificable no entran; el motor procedural cumple la DoD sin samples opcionales |

**Objetivo de calidad de la fase 7.** Los presets se nivelan con una frase de referencia de ocho compases por familia a **−18 LUFS-I ±1 LU**, medidos según ITU-R BS.1770-5, y a **≤ −1 dBTP**. Es un objetivo de comparación de presets, no una normalización destructiva del máster del usuario. Cada subfase requiere además una escucha A/B a loudness igualada; sonar “más fuerte” no cuenta como sonar mejor.

### 2.7 MIDI y compatibilidad de plataforma

**Navegador objetivo: Google Chrome.** Chrome en **Android** es la plataforma de referencia (mobile-first, §C6); Chrome en escritorio es la secundaria. Se optimiza para Chrome; se *degrada* con dignidad fuera de él.

**Chrome-first no es Chrome-only.** Toda API exclusiva de Chromium que se use debe estar en la lista de §3.6 y tener un fallback documentado o una degradación documentada. Nunca un error.

**iOS y WebKit quedan fuera de alcance.** Es una decisión de producto, no un fallo pendiente. WebKit no implementa Web MIDI, así que un iPhone nunca podrá enviar MIDI desde el navegador ni siquiera instalando Chrome, porque el motor de renderizado es el mismo. Perseguirlo cuesta un camino de UI entero para un usuario que jamás obtendrá la función principal. **Safari en macOS cae con lo mismo y por la misma razón.**

Dos niveles, detectados **por feature detection**, nunca por user-agent:

| Nivel | Entorno | Qué obtiene |
|---|---|---|
| **Soportado** | Chrome / Chromium 124+ en Android, Windows, macOS, Linux, ChromeOS | Todo. Es donde se desarrolla, se mide y se afina |
| **Fuera de alcance** | WebKit (todo iOS/iPadOS, Safari macOS) y cualquier navegador sin `AudioWorklet` o sin Web MIDI | Una pantalla honesta de una frase: qué hace falta y por qué. Sin app degradada, sin funciones a medias |

Firefox y Samsung Internet funcionan —tienen Web MIDI y AudioWorklet— pero pierden las optimizaciones de §3.6. No se rompen, no se prueban.

**Lo que esto ahorra:** un camino de UI paralelo, una matriz de tests duplicada, y todo el trabajo específico de WebKit (`navigator.audioSession`, sus rarezas con `AudioContext`, sus límites de almacenamiento). Ese presupuesto se gasta en profundidad, no en cobertura.

**Lo que NO ahorra:** el motor de audio interno sigue siendo obligatorio y sigue siendo el camino por defecto. La razón original era iOS, y ha desaparecido; pero quedan dos que no: el permiso MIDI de Chrome 124+ obliga a que la app sea plenamente útil **antes** de concederlo, y el usuario U2 (§2.1) nunca enchufa nada. RF-040 a RF-049 no se tocan.

| ID | Requisito | Criterios de aceptación |
|---|---|---|
| RF-050 | Detección de capacidad por feature detection | En un entorno fuera de alcance se muestra la pantalla explicativa antes de cargar el motor, no un error a mitad de camino |
| RF-051 | **Permiso MIDI bajo demanda.** `requestMIDIAccess()` **nunca** se llama al cargar la página | Se llama solo desde una acción explícita ("Conectar hardware"). Antes se consulta `navigator.permissions.query({name:'midi'})` para saber si el estado es `granted`, `prompt` o `denied` y presentar la UI adecuada |
| RF-051a | `sysex: false` siempre en v1 | Un `SecurityError` (permiso denegado) muestra una ruta de recuperación que explica cómo reactivarlo en la configuración del sitio, no un error genérico |
| RF-052 | Enumeración de puertos con hot-plug (`statechange`) | Conectar un dispositivo con el transporte en marcha lo añade a la lista sin recargar |
| RF-053 | MIDI Clock 24 PPQ + Start (`0xFA`) / Stop (`0xFC`) / Continue (`0xFB`), activable por puerto | Un dispositivo esclavo se mantiene sincronizado 10 min con deriva < 5 ms |
| RF-054 | MIDI in: un controlador externo mueve knobs y dispara transporte (MIDI learn) | — |
| RF-055 | **BLE MIDI por Web Bluetooth** en Android (fase 3b) | Un dispositivo BLE MIDI se empareja desde la app y recibe notas. Se prefiere Web MIDI si el sistema ya expone el dispositivo |
| RF-056 | Export `.mid` (SMF tipo 1) por módulo y del rack completo, al tempo actual | El fichero abre correctamente en Ableton, Logic y Reaper con las notas en su sitio |
| RF-057 | Sin salida MIDI disponible, el export `.mid` sigue siendo la vía de salida principal | — |

> **Nota de despliegue:** Web MIDI exige contexto seguro. En desarrollo, `localhost` ya cuenta como seguro; para probar en un móvil real por IP de red local hace falta HTTPS (`vite-plugin-mkcert` o un túnel).

### 2.8 Slots, escenas y proyectos

| ID | Requisito | Criterios de aceptación |
|---|---|---|
| RF-060 | 8 slots de patrón por módulo | Cambiar de slot ocurre **cuantizado al siguiente compás**, no instantáneamente |
| RF-061 | Escenas: instantánea de qué slot está activo en cada módulo | Lanzar una escena cambia todos los módulos a la vez, en el mismo límite de compás |
| RF-062 | Múltiples racks dentro de un proyecto | — |
| RF-063 | Persistencia automática con debounce ≤ 2 s tras el último cambio | Un cierre forzado pierde como máximo el último cambio |
| RF-064 | Export / import de proyecto (JSON + samples) | Un proyecto exportado en un dispositivo se abre idéntico en otro |

### 2.9 PWA y comportamiento móvil

| ID | Requisito | Criterios de aceptación |
|---|---|---|
| RF-070 | Instalable, arranca sin conexión | Lighthouse PWA installable ✓ |
| RF-071 | Media Session API: controles de transporte en pantalla de bloqueo | Play/pause desde el lock screen funciona |
| RF-072 | Wake Lock mientras el transporte está en marcha | La pantalla no se apaga durante una sesión |
| RF-074 | Recuperación de `AudioContext` suspendido tras volver de segundo plano | Volver a la pestaña reanuda sin recargar y sin desfase |

---

## §3 · Plan técnico (el CÓMO)

### 3.1 Stack

| Capa | Elección | Por qué |
|---|---|---|
| Framework | **Svelte 5 + runes** | Reactividad de grano fino sin VDOM. Una rejilla de 8 × 32 pasos son 256 nodos que se tocan constantemente; el coste de diffing de React/Vue aquí se nota. Compila y desaparece: ayuda a C10 |
| Build | **Vite 6** + `vite-plugin-pwa` | SvelteKit was evaluated on 2026-08-23 and deferred: the v1 instrument is a single-screen, client-only PWA, and Kit would not improve the audio or scheduling path. See `architecture-decisions.md` AD-002 |
| Lenguaje | **TypeScript estricto** | C9 |
| Estilos | **Vanilla CSS** en `@layer reset, tokens, base, components, utilities` | C5 |
| Audio | **Web Audio API cruda + AudioWorklet** | Ver 3.3 |
| MIDI | **Web MIDI API cruda** tras una fachada propia de ~150 líneas | `webmidi.js` añade peso y abstrae justo lo que hay que controlar: el timestamping. La fachada además permite inyectar un mock en tests (no existe MIDI virtual en Chrome headless) |
| Serialización de enlaces | **CBOR + `CompressionStream('deflate-raw')` + base64url** | Nativo del navegador, cero dependencias. Ver §3.8 |
| Transporte de eventos | **`postMessage` con `Transferable`.** Nada de `SharedArrayBuffer` en v1 | Con look-ahead ya se programa todo con tiempos absolutos hasta 150 ms por delante, así que el jitter del canal de mensajes es irrelevante, y la automatización interna va por curvas de `AudioParam`, ya sample-accurate. **El SAB solo entra si una medición demuestra que hace falta** |
| Teoría musical | `tonal` (tree-shakeable) tras un adaptador propio | El adaptador permite sustituirlo si el peso molesta |
| Persistencia | `idb` sobre IndexedDB; OPFS para samples > 1 MB | — |
| Export MIDI | `midi-writer-js` o escritor SMF propio (~200 líneas) | — |
| Reordenar | `svelte-dnd-action` | Es la única dependencia de UI aceptada |
| Tests | Vitest (unitario + golden) · Playwright (E2E) | — |

**Si prefieres Vue 3:** usa `<script setup>` + `shallowRef` para el estado del patrón y salta la reactividad profunda en los buffers de eventos. Todo lo demás del plan se mantiene idéntico. Pero para esta carga de UI, **Svelte es la recomendación**.

**Sobre Tone.js:** permitido **solo** como bloque de construcción de voces si hace falta velocidad. **Nunca** para el transporte ni para el scheduling — la app necesita su propio reloj para poder alinear el timestamp MIDI con el tiempo de audio (3.4). Preferible: sin Tone.js.

### 3.2 Estructura de carpetas

```
src/
  lib/
    core/
      rng.ts              # sfc32 + splitmix, PRNG sembrado
      theory/             # escalas, acordes, transporte tonal, grados romanos
      pattern.ts          # tipos Pattern / Step / NoteEvent
      time.ts             # beats <-> segundos <-> ticks
    generators/           # PUROS. Sin DOM, sin audio, sin Date.
      drums.ts  bass.ts  acid.ts  chords.ts
      arp.ts  euclid.ts  rain.ts  stabs.ts
      index.ts            # registro Generator<P>
    audio/
      engine.ts           # grafo, buses, limitador
      clock.worklet.ts    # fuente de reloj sample-accurate
      scheduler.ts        # look-ahead, encola eventos
      voices/             # una voz especializada por familia + contratos compartidos
      effects/            # delay/reverb compartidos, saturación y máster
      presets/            # catálogo append-only, schemas y definiciones de patches
      analysis/           # loudness, true peak, DC y rasgos espectrales de tests offline
    midi/
      access.ts  ports.ts  clock.ts  out.ts  learn.ts  smf.ts
    state/
      project.svelte.ts   # runes. NUNCA lo lee el hilo de audio.
      history.ts          # undo/redo con coalescing
      persistence.ts
    ui/
      Knob.svelte  StepGrid.svelte  Fader.svelte  Playhead.svelte
      ModulePlate.svelte  Transport.svelte  Sheet.svelte
  modules/                # un directorio por tipo: UI + params + binding
  styles/
    tokens.css  reset.css  base.css
  routes/
data/
  grooves/*.json          # librerías de contenido, versionadas, no en el bundle inicial
  progressions/*.json
```

### 3.3 Arquitectura de audio

```
                  ┌──────────────────────────────┐
   UI (Svelte)    │  clock.worklet (hilo audio)  │
        │         │  cuenta samples → postMessage│
        │ snapshot│  cada ~10 ms                 │
        ▼ inmutable      │ tick + contextTime
  ┌───────────┐          ▼
  │ Scheduler │ ◄── ventana look-ahead 150 ms
  └─────┬─────┘
        │ eventos con tiempo absoluto (AudioContext.currentTime)
        ├──────────────► Voces internas  ──► bus módulo ──► máster ──► limitador ──► out
        └──────────────► MIDI out (timestamp convertido, ver 3.4)
```

**Reglas de implementación:**

- **Un solo `AudioContext`**, creado en el primer gesto del usuario. Si queda `suspended`, la UI muestra un botón explícito, no un fallo silencioso.
- **El reloj vive en un `AudioWorkletProcessor`**, no en `setInterval`. Un timer del hilo principal se estrangula en segundo plano y en pestañas inactivas; el worklet no, porque corre mientras corra el audio.
- **Patrón look-ahead:** el scheduler despierta con cada tick del worklet, mira la ventana `[ahora, ahora + 150 ms)` y programa todo lo que cae dentro con tiempos absolutos de `AudioContext`. Nunca se dispara nada "ahora mismo".
- **Snapshots inmutables:** cuando el usuario cambia un parámetro, la UI construye un objeto nuevo y lo publica en una cola de un solo escritor. El scheduler lo recoge en el siguiente límite seguro. Nada de lectura compartida (**C2**).
- **Voces:** `AudioWorklet` para el motor 303 (filtro escalera de retardo cero, TPT — Zavalishin; envolvente de decay; accent que modula cutoff y velocity; slide como portamento de frecuencia entre notas solapadas). Nodos nativos (`Oscillator` + `Biquad` + `Gain`) bastan para las voces politimbrales. Batería por samples (`AudioBufferSourceNode` sobre buffers pre-decodificados).
- **Pool de voces por módulo** con robo de voz por la más antigua. Techo global de voces configurable (defecto 64).
- **Nunca** `createGain()` dentro del callback de scheduling: pre-asignar.

#### 3.3.1 Grafo y contratos de sonido — fase 7

```text
voz especializada → trim/insert del módulo → panorama ─┬→ bus dry ───────────────┐
                                                       ├→ send delay compartido ─┤
                                                       └→ send reverb compartido ┤
                                                                                 ▼
                                                         headroom → DC/EQ → soft clip → limitador → meter → out
```

- `PatternSnapshot` y `SoundSnapshot` son objetos inmutables distintos. El primero cambia notas/MIDI y mantiene la cuantización musical existente; el segundo solo cambia monitorización interna.
- Macros continuas se aplican con rampas de 15–30 ms. Un preset que cambia topología se prepara fuera del callback del scheduler y se activa en el siguiente ataque con crossfade corto; nunca se construye un grafo pesado dentro de `trigger()`.
- `VoiceFactory` acepta `BaseAudioContext`, por lo que `AudioContext` y `OfflineAudioContext` instancian exactamente las mismas voces, inserts y returns.
- Bass, Acid, Chords, Arp y Piano tienen voces propias. Euclid tiene tres voces percusivas independientes. Drums conserva ocho carriles con choke groups. Mixer no genera notas. CC Control y Mod siguen siendo módulos de control silenciosos.
- Delay y reverb son returns únicos y preasignados para todo el rack. No se crea una instancia por módulo. Los efectos se incluyen de forma determinista en bounce y stems.
- El limitador no compensa una mezcla sin headroom. El grafo reserva ganancia antes del máster, elimina DC y mide pico/RMS; oversampling solo entra en bloques no lineales si C10 sigue verde en Android.
- El motor procedural es el baseline obligatorio. Samples opcionales deben ser originales o tener licencia compatible documentada, estar autoalojados y conservar arranque offline y presupuestos C10.

### 3.4 El puente de tiempo MIDI ⇄ audio (detalle crítico)

`MIDIOutput.send(data, timestamp)` usa el dominio de `performance.now()`. El scheduler trabaja en `AudioContext.currentTime`. Programarlo mal produce un desfase audible y variable entre el sonido interno y el hardware.

```ts
function makeTimeBridge(ctx: AudioContext) {
  let offsetMs = 0;
  const resync = () => {
    const t = ctx.getOutputTimestamp();
    if (t.contextTime != null && t.performanceTime != null) {
      offsetMs = t.performanceTime - t.contextTime * 1000;
    }
  };
  resync();
  setInterval(resync, 1000); // corrige la deriva entre relojes
  return (contextTime: number) => contextTime * 1000 + offsetMs;
}
```

Todo evento MIDI se envía con `send(bytes, toPerfTime(evento.contextTime))`. Nada de `send(bytes)` sin timestamp.

**MIDI Clock:** 24 PPQ → intervalo de tick = `60 / (bpm * 24)` segundos. Los ticks se programan por adelantado dentro de la misma ventana look-ahead, con timestamp, igual que las notas.

### 3.5 Rendimiento de la UI

- **El playhead no pasa por Svelte, y en Chrome ni siquiera pasa por el hilo principal.** Se crea con `element.animate()` una animación lineal de `transform` de duración igual a un compás, `iterations: Infinity`. Chrome la ejecuta **en el hilo del compositor**, así que sigue moviéndose fluida aunque el hilo principal se atasque. Una vez por compás se corrige la deriva escribiendo `animation.currentTime` desde el reloj de audio, y `animation.playbackRate` absorbe los cambios de tempo. Cero re-renders por frame y cero trabajo por frame en el hilo principal.
  Fallback fuera de Chrome: `requestAnimationFrame` escribiendo `style.setProperty('--playhead', …)`.
- **`content-visibility: auto` + `contain-intrinsic-size`** en las placas de módulo plegadas o fuera de pantalla. Con un rack de 16 módulos esto es la diferencia entre cumplir y no cumplir el presupuesto de frame.
- Los pasos de la rejilla son elementos estables con `{#each ... (key)}`; solo cambia una clase de estado.
- Knobs: `input[type="range"]` nativo como control semántico, rodeado por un SVG puramente decorativo. Pointer Events + `setPointerCapture` + `touch-action: pan-x` añaden arrastre vertical sin bloquear el paneo horizontal; `Shift` reduce la sensibilidad y doble clic restaura el default. El input conserva rol/valor nativos, flechas/Home/End y expone `aria-valuetext` con la unidad formateada. El gesto agrupa sus cambios en un solo paso de Undo y termina con un único commit.
- Menús de módulo como *bottom sheet* con `dialog` nativo, no como modal centrado: alcance del pulgar.
- Librerías de contenido (grooves, progresiones) por `import()` dinámico, fuera del bundle inicial.

### 3.6 Perfil Chrome

Lista cerrada de APIs exclusivas de Chromium que se usan, cada una con su fallback. **No se añade ninguna que no esté aquí sin aprobación.** Todas se detectan con feature detection; `navigator.userAgentData` está prohibido para decidir capacidades.

#### Audio

| API | Uso | Fuera de Chrome |
|---|---|---|
| `AudioContext.renderCapacity` | Medición continua de la carga del hilo de audio. Alimenta el presupuesto de C10 y dispara un aviso al usuario si supera 0.8, ofreciendo bajar el techo de voces | Sin telemetría de carga; el techo de voces se queda fijo |
| `AudioContext.setSinkId()` | Selector de dispositivo de salida. **Solo escritorio:** Android no permite enrutar streams individuales a dispositivos distintos, así que en el móvil este control no existe | Salida por defecto del sistema |
| `WebCodecs AudioDecoder` | Decodificar samples del usuario fuera del hilo principal | `decodeAudioData` dentro de un Worker con `OfflineAudioContext` |

**Ruta de baja latencia en Android — regla concreta:** construir el contexto como `new AudioContext({ latencyHint: 'interactive' })` y **no pasar `sampleRate`**. Forzar una frecuencia distinta a la nativa del dispositivo hace que Chrome inserte un remuestreador y pierda el camino rápido de AAudio. Todo el DSP debe leer `ctx.sampleRate`, nunca asumir 44100 ni 48000.

**Por qué `getOutputTimestamp()` y no una pareja ingenua `currentTime`/`performance.now()`:** el audio interno sale con `baseLatency + outputLatency` de retraso, mientras que un mensaje MIDI con timestamp sale cuando toca. `getOutputTimestamp()` devuelve el tiempo de contexto **de la muestra que está saliendo ahora mismo**, así que el puente de §3.4 ya incorpora esa latencia y el hardware queda alineado con lo que se oye por los altavoces. Emparejar `currentTime` con `performance.now()` a pelo produce un desfase igual a la latencia de salida — decenas de milisegundos en Android.

#### MIDI

- **Permiso (Chrome 124+):** toda la Web MIDI API está detrás de un prompt de permiso, no solo SysEx como antes. Implicación de diseño: la app tiene que ser plenamente útil **antes** de pedirlo. El prompt aparece cuando el usuario pulsa "Conectar hardware", nunca al cargar.
- **BLE MIDI vía Web Bluetooth** (fase 3b, Android): servicio `03B80E5A-EDE8-4B33-A751-6CE34EC4C700`, característica `7772E5DB-3868-4112-A1A9-F2669D106BF3`. Hay que implementar el empaquetado BLE MIDI a mano: byte de cabecera + bytes de timestamp de 13 bits en milisegundos, con manejo del desbordamiento cada 8192 ms. Requiere gesto del usuario para `requestDevice()`. Si el sistema ya expone el dispositivo por Web MIDI, se prefiere esa ruta.
- **WebUSB:** anotado como escape para dispositivos USB-MIDI *class compliant* que no aparezcan por Web MIDI. **Fuera de v1** — el sistema operativo suele reclamar la interfaz y el resultado es inconsistente. No se implementa sin una necesidad demostrada.

#### Almacenamiento y ficheros

| API | Uso | Fuera de Chrome |
|---|---|---|
| `navigator.storage.persist()` | Pedir almacenamiento persistente al arrancar. Sin esto, IndexedDB es desalojable y C4 es una promesa vacía | Se pide igual; si se deniega, se avisa una vez y se recomienda exportar |
| OPFS + `createSyncAccessHandle()` | Samples del usuario, con acceso síncrono desde Worker. Base para streaming de samples largos | IndexedDB con Blobs |
| File System Access (`showSaveFilePicker`, `showDirectoryPicker`) | Guardar `.mid` y proyectos donde el usuario quiera; carpeta de biblioteca de samples con el handle persistido en IndexedDB. **En Chrome Android el soporte es limitado** | Descarga de blob con `<a download>` |
| File Handling API + `launch_queue` | Abrir un `.mid` o un proyecto desde el gestor de archivos directamente en la app | Import manual |

#### UI

| API | Uso | Fuera de Chrome |
|---|---|---|
| Web Animations en el compositor | Playhead y barra de compás (§3.5) | `requestAnimationFrame` |
| `content-visibility: auto` | Placas de módulo fuera de pantalla | Sin optimización; se nota a partir de ~12 módulos |
| View Transitions API | Añadir, borrar y reordenar módulos. Sustituye a cualquier librería de animación | Cambio instantáneo, sin transición |
| CSS anchor positioning | Menús y popovers anclados sin JS de posicionamiento | `position: fixed` calculado a mano |
| `scheduler.postTask()` / `scheduler.yield()` | Serialización y persistencia a prioridad `'background'`, para que nunca compitan con el frame | `setTimeout(…, 0)` |

Todo lo anterior debe respetar `prefers-reduced-motion` (C11).

#### Verificación

- **Presupuestos:** Chrome DevTools → panel Performance con la pista de audio, más el panel WebAudio para inspeccionar el grafo. `renderCapacity` se registra en un panel de diagnóstico interno de la app, accesible en modo desarrollo.
- **Aislamiento:** un test que falla si `crossOriginIsolated !== true`. Las cabeceras COOP/COEP hay que configurarlas en dos sitios: `server.headers` en `vite.config.ts` para desarrollo, y el fichero de cabeceras del hosting para producción.
- **E2E:** Playwright con `channel: 'chrome'`. Chrome headless **no tiene puertos MIDI**, así que los tests de MIDI usan el mock de la fachada. Los tests de integración con hardware real son manuales y están en una checklist aparte; el clock de RF-053 se verifica contra un dispositivo físico, no en CI.

### 3.7 Dirección visual

No es un detalle cosmético: la app es un instrumento y debe *leerse* de un vistazo en un escenario oscuro, a un brazo de distancia, con visión periférica.

- **Paleta** en `oklch()`, superficie oscura por defecto. Un único color de acento vivo reservado **exclusivamente** al estado "sonando". Todo lo demás en grises neutros con una segunda familia fría para lo estructural. El acento no se usa nunca en decoración; si brilla, es que suena.
- **Tipografía:** una cara de datos de ancho fijo para valores numéricos (tempo, BPM, número de paso, semilla) y una grotesca condensada para etiquetas. Los números nunca deben "saltar" al cambiar: `font-variant-numeric: tabular-nums`.
- **Jerarquía por peso, no por color.** El color codifica estado (sonando / silenciado / en solo), nunca importancia.
- **Elemento firma:** elige **uno** y ejecútalo bien. Sugerencia: la barra de progreso de compás como una fina línea que recorre la cabecera de todo el rack, ligando visualmente módulos que están desalineados en longitud (un anillo euclidiano de 12 contra una batería de 16). Es la única pieza de "espectáculo" permitida.
- Sin gradientes decorativos, sin glassmorphism, sin sombras suaves apiladas. La superficie es plana y el contraste hace el trabajo.

### 3.8 Serialización del enlace

El objetivo es **≤ 400 bytes** para un rack de cinco módulos. Reglas:

1. **Nunca se serializa un patrón.** Se serializan `seed` + `params` + tonalidad + tempo. El patrón se regenera al abrir, y C1 garantiza que sale idéntico. Esto es lo que hace que quepa en una URL: un patrón son kilobytes, una semilla son cuatro bytes.
2. **Params por índice, no por nombre.** El `paramSchema` (§5) ya define un orden; se emite un array posicional y se omite todo lo que esté en su valor por defecto.
3. **Cuantizar.** Los params son enteros de 8 o 16 bits según su rango declarado, nunca `float64`.
4. **Pipeline:** objeto → CBOR → `CompressionStream('deflate-raw')` → base64url → fragmento. Todo con APIs nativas.
5. **Versión primero.** El primer byte es la versión de esquema. Un lector que no la reconoce lo dice; no adivina.
6. **Fragmento, no query string.** `#p=…` nunca se envía al servidor, ni siquiera en los logs de acceso. Esa es la propiedad que sostiene C3 y C4.

**Test obligatorio (fase 0):** para 200 racks aleatorios, `deserializar(serializar(rack))` produce patrones idénticos por igualdad profunda, y ninguno supera los 400 bytes. Este test es el que impide que un módulo nuevo rompa el mecanismo de distribución sin que nadie se entere.

**Ruta:** `/#p=<payload>` carga el patch. Sin fragmento y sin proyecto guardado, se carga el rack de arranque (RF-006). Un patch abierto por enlace **no sobrescribe** el proyecto local: entra como borrador y hay que guardarlo explícitamente.

---

## §4 · Modelo de datos

```ts
type ScaleName = 'major' | 'minor' | 'dorian' | 'phrygian' | 'lydian'
               | 'mixolydian' | 'locrian' | 'harmonicMinor' | 'pentMinor' | 'blues';

interface Project {
  schemaVersion: number;        // migraciones obligatorias desde v1
  id: string;
  name: string;
  bpm: number;
  key: { root: number; scale: ScaleName };   // root 0..11, C = 0
  racks: Rack[];
  activeRackId: string;
  scenes: Scene[];
  createdAt: number;
  updatedAt: number;
}

interface Rack {
  id: string;
  name: string;
  moduleIds: string[];
  mix: {
    delayDivision: number;
    delayFeedback: number;
    delayReturn: number;
    reverbReturn: number;
    masterCharacter: number;
  };
}

interface Module {
  id: string;
  type: ModuleType;
  name: string;
  collapsed: boolean;
  mute: boolean;
  solo: boolean;
  monitor: boolean | 'auto';                 // 'auto' = off si hay destino MIDI
  midi: { portId: string | null; channel: number };  // 1..16
  level: number;                              // 0..1; se conserva fuera de sound por compatibilidad
  sound: {
    engineVersion: 2;
    presetId: string;                         // ID estable y append-only
    params: Record<string, number>;           // enteros cuantizados por SoundParamSchema
    pan: number;                              // -100..100
    delaySend: number;                        // 0..100
    reverbSend: number;                       // 0..100
  };
  slots: [PatternSlot, ...PatternSlot[]];            // exactamente 8
  activeSlot: number;
  mutate: { on: boolean; intensity: 1|2|3|4; everyNLoops: number };
}

interface PatternSlot {
  seed: number;                 // uint32
  params: Record<string, number | string | boolean>;
  cache: Pattern | null;        // derivable de (seed, params, key) — nunca es la verdad
}

interface Pattern {
  lengthSteps: number;
  stepsPerBeat: number;         // 4 = semicorcheas
  events: NoteEvent[];          // ordenados por startStep
}

interface NoteEvent {
  startStep: number;
  durationSteps: number;
  pitch: number;                // 0..127
  velocity: number;             // 1..127
  slide?: boolean;
  accent?: boolean;
  lane?: number;                // batería: 0..7
}

interface Scene { id: string; name: string; assignments: Record<string, number>; }
```

**Invariante:** `cache` es siempre reconstruible con `generate(seed, params, key)`. Si se pierde, se regenera. Un patrón dibujado a mano (Piano roll) es la excepción y se marca con `handEdited: true`, momento en el que el patrón pasa a ser la verdad y la semilla queda inerte.

**Corolario de C12:** ese invariante es exactamente lo que permite que un rack quepa en una URL. Un `PatternSlot` con `handEdited: true` —o un módulo con samples propios— **rompe la serialización a enlace**, porque ya no basta la semilla. Esos módulos exponen `shareable = false` y disparan el aviso de RF-008.

**Migración de sonido de fase 7:** el proyecto pasa a schema v4 y el patch compartible a schema v3. Proyectos v1–v3 y patches v1–v2 reciben un preset `legacy-<tipo>-v1` que conserva la voz anterior; no se reinterpretan silenciosamente con un timbre nuevo. Los módulos creados tras la migración usan `engineVersion: 2`. El catálogo de IDs y sus índices compactos es append-only. Un proyecto legacy puede actualizarse mediante una acción explícita, reversible por Undo.

**Regla para módulos nuevos:** un generador que necesite guardar su patrón para reproducirse no es un generador, es un editor. Puede existir, pero cae fuera del mecanismo de distribución y hay que decirlo en su spec.

---

## §5 · Contratos

Cada generador implementa exactamente esta interfaz. Nada más.

```ts
interface MusicalContext {
  key: { root: number; scale: ScaleName };
  bars: number;
  chords?: ChordEvent[];   // presente solo si followChords está activo
}

interface Generator<P extends object> {
  readonly id: ModuleType;
  readonly defaults: P;
  readonly paramSchema: ParamSchema<P>;   // rango, paso, unidad, etiqueta — la UI se construye a partir de esto

  /** PURA. Sin Math.random, sin Date, sin I/O. */
  generate(seed: number, params: P, ctx: MusicalContext): Pattern;

  /** PURA. No muta la entrada. */
  mutate(base: Pattern, seed: number, intensity: 1|2|3|4, params: P, ctx: MusicalContext): Pattern;
}
```

La UI de parámetros **se genera automáticamente** desde `paramSchema`. Nadie escribe a mano un knob por parámetro. Eso hace que añadir un módulo nuevo cueste un fichero y no una pantalla.

**PRNG obligatorio:**

```ts
export function sfc32(seed: number) {
  let a = seed ^ 0x9e3779b9, b = seed ^ 0x243f6a88,
      c = seed ^ 0xb7e15162, d = 1;
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b | 0) + d | 0;
    d = d + 1 | 0; a = b ^ b >>> 9; b = c + (c << 3) | 0;
    c = c << 21 | c >>> 11; c = c + t | 0;
    return (t >>> 0) / 4294967296;
  };
}
```

---

## §6 · Tasks

Ejecuta **una fase por vez**. No empieces la siguiente sin que la DoD de la anterior esté demostrada con evidencia (test que pasa, medición, o captura).

> **Secuencia.** Las fases 0–3 construyen el núcleo móvil original de cinco módulos. La fase 4 ensancha el producto con la superficie de estudio y cinco módulos adicionales; la fase 5 profundiza el instrumento. La fase 6 devuelve esos cinco módulos a la superficie móvil con editores adaptativos. La fase 7 mejora la identidad sonora módulo por módulo y consolida la mezcla sin crear un segundo motor. No se crean dos motores ni dos modelos de módulo: cambia la presentación o la voz, no el dominio compartido. Por enmienda explícita del usuario del 2026-08-25, la implementación de fase 6 puede comenzar mientras la evidencia física pendiente de las fases 3 y 5 sigue registrada; esos gates no se consideran aprobados por ello. Salvo nueva enmienda explícita, la fase 7 comienza después de aprobar el gate físico de la fase 6.

### Fase 0 — Cimientos
1. Vite + Svelte 5 + TS estricto + Vitest + Playwright (`channel: 'chrome'`) + `vite-plugin-pwa`.
1b. **Cabeceras COOP/COEP** en dev y en producción + test que falla si `crossOriginIsolated !== true`. Hacerlo ahora: retrofitear aislamiento cross-origin más tarde rompe cosas.
2. `tokens.css` y las capas `@layer`. Nada de componentes todavía.
3. `rng.ts` con test golden: `sfc32(42)` produce una secuencia fija y versionada.
4. `theory/` con escalas y acordes + tests.
5. **Serialización de enlace (§3.8) y routing por fragmento.** Va aquí, no más tarde: toca el modelo de datos y el `paramSchema`, y retrofitearlo obliga a reescribir todos los módulos.

**DoD:** `npm test` verde, incluido el test de ida y vuelta de 200 racks bajo 400 bytes. Bundle vacío ≤ 30 KB gzip. `crossOriginIsolated === true`.

### Fase 1 — Que suene
6. `AudioContext` tras gesto + `clock.worklet` + `scheduler.ts`.
7. Voz poly básica + un kit de batería + voz acid simple (sin TPT).
8. Los cinco generadores del núcleo, puros, con tests golden.
9. `ModulePlate.svelte`, `StepGrid.svelte`, `Knob.svelte`, `Transport.svelte`.
10. Rack con añadir/borrar/reordenar módulos.
11. **Rack de arranque (RF-006) y botón Compartir (RF-007).**

**DoD:** el **recorrido crítico completo de §2.2** funciona en un Android real, enlace incluido: se comparte, se abre en otro dispositivo y suena idéntico. Se mide el jitter y se documenta. Añadir un módulo en marcha no produce ningún click. **A partir de aquí el producto ya es compartible con desconocidos.**

### Fase 2 — Que sea determinista y persistente
12. Slots, semillas visibles, `Random`.
13. `Mutate` + `Revert` con test de igualdad profunda (**C8**).
14. Persistencia IndexedDB + `navigator.storage.persist()` + migración de esquema + export/import de proyecto.
15. Undo/redo con coalescing de arrastres.
16. Aviso de patch no compartible (RF-008).

**DoD:** cerrar y reabrir restaura todo. Un proyecto exportado se importa idéntico en otro navegador. `revert()` pasa el test de igualdad.

### Fase 3 — MIDI y salidas
17. Fachada `midi/` con mock inyectable. Detección de capacidad (§2.7).
18. **Flujo de permiso:** consulta previa con la Permissions API, solicitud solo desde el botón "Conectar hardware", ruta de recuperación ante denegación.
19. Enumeración de puertos + hot-plug.
20. Puente de tiempo (§3.4) + envío de notas con timestamp.
21. MIDI Clock 24 PPQ + start/stop.
22. Export SMF tipo 1.
23. **Bounce a WAV con `OfflineAudioContext`**, mezclado y por pistas separadas. Renderiza más rápido que en tiempo real y no cuesta infraestructura; con el `.mid` cubre las dos salidas que la gente pide.

**DoD:** el recorrido crítico de §2.2 sigue completo **sin haber concedido nunca el permiso MIDI**. Un dispositivo esclavo real se mantiene sincronizado 10 minutos con deriva < 5 ms. El `.mid` exportado abre correctamente en un DAW. Jitter medido y dentro de C10.

### Fase 3b — BLE MIDI (opcional, Android)
24. Web Bluetooth: `requestDevice()` con filtro por el servicio BLE MIDI, empaquetado y desempaquetado de mensajes con timestamps de 13 bits, manejo del desbordamiento y de la desconexión.

**DoD:** un dispositivo BLE MIDI real recibe notas desde un Android. Si el dispositivo ya está expuesto por Web MIDI, la app usa esa ruta y no duplica el puerto.

### Fase 4 — Superficie de escritorio
25. **Disposición en carriles paralelos** para ≥ 1024 px. No es un breakpoint del layout móvil: es una segunda disposición del mismo núcleo.
26. Módulos de ampliación: Arp, Euclid, Piano roll, CC Control, Mod.
27. Ruteo MIDI por módulo en la UI, `setSinkId` (solo escritorio), File System Access con fallback a descarga.
28. Atajos de teclado y racks múltiples.
29. En móvil, un patch con módulos de escritorio se reproduce pero no se edita, y lo indica. Este es el comportamiento histórico aceptado de fase 4; la fase 6 lo sustituye por edición móvil adaptativa.

**DoD por módulo:** tests golden del generador + su UI se construye desde `paramSchema` sin código a medida. **DoD de fase:** el núcleo móvil no ha perdido ninguna capacidad.

### Fase 5 — Pulido y profundidad
30. Escenas con lanzamiento cuantizado.
31. PWA, Media Session con `setPositionState`, Wake Lock, recuperación de segundo plano.
32. Capa Chrome de §3.6: View Transitions, `content-visibility`, playhead en el compositor, `scheduler.postTask` para la persistencia.
33. **Filtro escalera TPT del Acid**, sustituyendo la voz simple tras la misma interfaz.
34. Backlog de módulos (RF-030 a RF-033), solo si el uso lo justifica.
35. Pasada de accesibilidad completa (**C11**).
36. Panel de diagnóstico interno: `renderCapacity`, `baseLatency + outputLatency`, jitter, voces activas.
37. Verificación de los presupuestos de **C10** con evidencia numérica en el dispositivo de referencia.

**DoD:** los siete presupuestos de C10 medidos y documentados en un Android de gama media con Chrome. Lighthouse PWA installable ✓. Navegación completa por teclado. Cada API de §3.6 verificada con su fallback desactivando la nativa.

### Fase 6 — Paridad de edición móvil
38. Sustituir la clasificación de “módulo de escritorio” por una clasificación de presentación. Arp, Euclid, Piano roll, CC Control y Mod conservan exactamente sus tipos, generadores, slots, snapshots y formatos persistidos.
39. Permitir añadir, duplicar, borrar, reordenar y editar Arp y Euclid desde móvil con los mismos `paramSchema`, golden tests y resultados que en escritorio.
40. Crear superficies móviles para CC Control y Mod. La grabación de CC, los tres LFO, el ruteo por control y los estados mute/solo deben seguir operativos sin depender de `hover`.
41. Crear un editor móvil dedicado a pantalla completa para Piano roll, con entrada, selección, movimiento, redimensionado y borrado táctiles; `In Key` / `Chromatic` y 16/32/64 pasos; salida explícita que restaura el foco al módulo.
42. Mantener el rack vertical y colapsable. En viewports compactos se edita como máximo un cuerpo de módulo denso a la vez; cerrar u ocultar su UI nunca detiene su audio o MIDI.
43. Confinar el desplazamiento horizontal a Step Grid, Euclid y Piano roll. La página no puede tener overflow horizontal. Todos los objetivos táctiles siguen siendo ≥ 44 × 44 CSS px y ninguna acción crítica depende de un gesto sin alternativa accesible.
44. Contener o diferir el renderizado de módulos fuera de pantalla sin desmontar el estado musical. No modificar el `AudioEngine`, el scheduler, el puente de tiempo MIDI ni los contratos de determinismo salvo que una medición demuestre un defecto independiente.
45. Añadir tests unitarios y Playwright para creación y edición de los cinco módulos ampliados a 375 × 667 y 375 × 812, apertura móvil de patches/proyectos creados en escritorio, persistencia, sharing cuando corresponda, reproducción durante la edición, foco, teclado, axe y ausencia de overflow de página.

**DoD funcional:** en Chrome Android, una persona puede añadir y editar los diez tipos de módulo sin cambiar a modo escritorio. Un patch de escritorio con Arp, Euclid o Mod se abre, se edita y vuelve a compartir con resultado determinista idéntico. Piano roll y automatización CC conservan su contrato de exportación/importación de proyecto cuando no caben en enlace. Añadir, editar, colapsar, reordenar y borrar cualquier tipo durante la reproducción no produce clicks, cortes ni notas colgadas.

**DoD de interfaz y rendimiento:** recorrido completo a 375 × 667 sin overflow horizontal de página, sin controles solapados y con objetivos táctiles ≥ 44 × 44 CSS px. Navegación por teclado, foco restaurado al cerrar editores dedicados, reducción de movimiento y axe sin violaciones serias/críticas. En el Android de referencia, 16 módulos activos a 140 BPM mantienen 0 xruns, `renderCapacity` medio ≤ 0.5/pico ≤ 0.8 cuando exista y frames de UI ≤ 8 ms mientras se desplaza y edita el rack. Los presupuestos de tamaño de C10 siguen verdes.

### Fase 7 — Identidad sonora y mezcla

La fase se ejecuta como subfases secuenciales. Cada una termina con tests, métricas y escucha A/B aceptada antes de comenzar la siguiente. El detalle normativo vive en `phase-7-sound-quality.md`.

#### Fase 7.0 — Contrato y banco de pruebas
46. Separar estado generativo y estado de sonido; `SoundParamSchema`, catálogo de presets, `SoundSnapshot`, migración proyecto v4/patch v3 y presets legacy.
47. Extraer una `VoiceFactory` única para live/offline, un rack de referencia y análisis offline de loudness, true peak, DC, duración y envolvente espectral.

#### Fase 7.1 — Mixer y máster
48. Gain staging con headroom, panorama/sends por módulo, delay y reverb compartidos, DC blocker, soft clip, limitador y medidores. El Mixer expone estos controles sin generar sonido.

#### Fase 7.2 — Drums
49. Sustituir los ocho buffers básicos por ocho instrumentos procedurales diseñados, con choke, velocity, variación determinista y seis kits nivelados. Samples originales son una capa opcional, no el baseline.

#### Fase 7.3 — Bass
50. Voz monofónica dedicada: oscilador + sub, filtro/envolvente, glide y drive real. Ocho presets nivelados.

#### Fase 7.4 — Acid
51. Completar el worklet TPT con oscilador antialias, saw/square, cutoff, resonance, env amount, decay, accent, slide y drive. Doce presets nivelados; oversampling condicionado a C10.

#### Fase 7.5 — Chords
52. Voz polifónica dedicada de ocho voces, ADSR, filtro, anchura/chorus y reverb send. Diez presets; ningún acorde soportado pierde notas por un pool insuficiente.

#### Fase 7.6 — Arp
53. Voz pluck dedicada, articulación por velocity/gate, filtro y delay sincronizado. Ocho presets.

#### Fase 7.7 — Piano
54. Voz de piano eléctrico FM ligera con tremolo y dinámica por velocity. Ocho presets. Un multisample solo entra tras aprobar procedencia, tamaño y rendimiento.

#### Fase 7.8 — Euclid
55. Tres voces percusivas independientes, con afinación, decay y panorama por anillo. Seis paletas niveladas.

#### Fase 7.9 — CC Control
56. Auditar que CC Control permanece silencioso, no crea voces y que sus automatizaciones no alteran accidentalmente el grafo interno. No se añaden destinos de modulación interna en esta fase.

#### Fase 7.10 — Mod
57. Auditar que Mod permanece silencioso, mantiene timing/valores MIDI y no consume voces. Modular parámetros internos queda fuera de alcance.

#### Fase 7.11 — Integración y aceptación
58. Completar los 12 presets Acid, 40 presets no-Acid (Bass 8, Chords 10, Arp 8, Piano 8, Euclid 6) y seis kits; nivelar; verificar live/bounce, migraciones, share, exports, accesibilidad, bundle y Android.

**DoD por subfase sonora:** output MIDI/SMF y golden de patrón idénticos antes/después; live y offline dentro de tolerancias; ningún click, NaN, DC persistente o voz colgada; preset/macros accesibles en móvil y escritorio; C10 sin regresión; escucha A/B a loudness igualada aceptada y documentada.

**DoD de fase:** RF-040–RF-049 demostrados. Los 58 presets/kits están versionados y nivelados a −18 LUFS-I ±1 LU con true peak ≤ −1 dBTP sobre sus frases de referencia. Un rack de 16 módulos a 140 BPM cumple todos los presupuestos C10 en el Android de referencia. Bounce y live comparten el grafo, los proyectos/enlaces legacy conservan su preset legacy, nuevos enlaces siguen ≤ 400 bytes y no existe runtime network. La fase no se completa únicamente con tests automáticos: requiere aceptación auditiva explícita de cada familia.

---

## §7 · Decisiones pendientes

Resuélvelas **antes** de la fase 0. El agente debe preguntar, no elegir por su cuenta:

1. ~~**Nombre del producto.**~~ **Resuelto:** sequens-R. El dominio y el hosting se decidirán después del desarrollo local de v1.
2. **Modelo de negocio.** Sin App Store y sin contenedor nativo, cobrar exige pasarela y por tanto **cuenta**, lo que choca de frente con C3 y C4. La recomendación es no monetizar en v1 y decidirlo cuando haya uso. Si se monetiza, hace falta una capa de *capabilities* desde el día uno; meterla después duele.
3. ~~**Origen del contenido — el mayor riesgo del proyecto.**~~ **Resuelto para v1:** los grooves, progresiones y presets se crean de forma original; no se copian de ningún producto existente.
   **Alcance aceptado:** 40 grooves repartidos entre seis estilos. Durante el desarrollo se implementa un groove representativo por estilo para pruebas; la expansión a 40 queda para el final.
4. ~~Alcance de la emulación 303.~~ **Resuelto:** voz simple en v1, filtro TPT diferido a la fase 5 detrás de la misma interfaz (§2.5).
5. ~~¿Hace falta cubrir iOS?~~ **Resuelto: no.** iOS y WebKit quedan fuera de alcance (§2.7). No hay contenedor nativo, no hay segundo backend de MIDI. La fachada `midi/` se mantiene, pero solo para poder inyectar un mock en tests.
6. ~~**Idioma de la UI.**~~ **Resuelto:** todo el producto y el desarrollo se realizan en inglés desde este punto. No se añade i18n en v1.

---

## §8 · Cómo se comporta el agente

- **Pregunta antes de inventar.** Si algo no está aquí, no lo decidas en silencio.
- **Una fase por vez.** Para en cada DoD y enseña la evidencia.
- **No refactorices lo que no te han pedido.**
- **No añadas dependencias** sin justificarlas contra C10 y sin aprobación explícita.
- **No escribas comentarios que narren el código.** Comenta solo el *porqué* no obvio (p. ej., por qué el reloj vive en un worklet).
- Si una instrucción de este documento resulta **imposible o contradictoria al implementarla**, para y dilo. No la sortees con un apaño silencioso.
