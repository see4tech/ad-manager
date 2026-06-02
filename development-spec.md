Especificación de Desarrollo: Plataforma de Generación de Contenido Publicitario con IA (Netlify + Node.js)
1. Visión General del Sistema
El sistema es una aplicación web SaaS que permite a los usuarios generar, organizar, planificar y publicar contenido publicitario (Texto, Imágenes, Video y Audio) en múltiples redes sociales utilizando IA a través de OpenRouter.
Arquitectura y Entorno de Ejecución
● Frontend & Backend (Monolito Serverless): Next.js 14+ (App Router) optimizado para Node.js en Netlify. Las rutas de la API (/app/api/*) y las Server Actions se desplegarán automáticamente como Netlify Functions (Node.js).
● Base de Datos y Autenticación: Supabase (PostgreSQL) + Row Level Security (RLS).
● Almacenamiento de Archivos (DAM): Supabase Storage para la gestión de activos digitales pesados.
● Integraciones Externas: OpenRouter API (Modelos LLM y Multimodales), Meta Graph API (Facebook/Instagram) y LinkedIn API.
 2. Estructura del Proyecto (Estructura de Directorios Node/Next.js)
Claude, genera el código respetando estrictamente la siguiente arquitectura de carpetas:
├── app/
│   ├── (auth)/           # Rutas de autenticación (Login, Registro)
│   ├── (dashboard)/      # Panel principal protegido
│   │   ├── chat/         # UI de chat con IA para generación de copys
│   │   ├── media/        # Gestor de activos (Carpetas y Archivos)
│   │   ├── generate/     # Generador de contenido multimedia (Imagen, Video, Audio)
│   │   ├── calendar/     # Calendario editorial programado
│   │   └── settings/     # Conexión de API keys y OAuth de redes sociales
│   ├── api/              # API Routes (Netlify Functions / Node.js)
│   │   ├── openrouter/   # Proxy seguro para llamadas a IA
│   │   ├── social/       # Callbacks de OAuth y webhooks de publicación
│   │   └── cron/         # Endpoint disparador para tareas programadas
│   └── components/       # Componentes UI basados en Shadcn/ui
├── lib/
│   ├── openrouter.ts     # Cliente de Node.js optimizado para OpenRouter
│   ├── supabase.ts       # Configuración del cliente Supabase
│   └── social-media/     # Módulos de publicación (Meta API, LinkedIn API)
├── hooks/                # React Hooks personalizados (useStorage, useAudioPlayer)
└── types/                # Interfaces de TypeScript globales
 3. Definición del Modelo de Datos (Esquema SQL para Supabase)
Claude, ejecuta estas migraciones iniciales para establecer las tablas relacionales y sus restricciones:
Tabla Columna Tipo de Datos Descripción / Restricciones 
profiles  id  uuid  Primary Key (Ref: auth.users, cascade)
profiles  updated_at  timestamp with time zone  Fecha de modificación
profiles  company_name  text  Nombre de la marca comercial
folders id  uuid  Primary Key (Default: gen_random_uuid())
folders name  text  Nombre de la carpeta (Not Null)
folders parent_id uuid  Ref: folders.id (Jerarquía anidada, cascade)
folders user_id uuid  Ref: profiles.id (Dueño de la carpeta)
assets  id  uuid  Primary Key
assets  user_id uuid  Ref: profiles.id
assets  folder_id uuid  Ref: folders.id (Null si está en raíz)
assets  name  text  Nombre identificativo del activo
assets  type  text  Restricción: CHECK (type IN ('image', 'video', 'audio', 'text'))
assets  content_url text  Ruta hacia el bucket de Supabase Storage
scheduled_posts id  uuid  Primary Key
scheduled_posts asset_id  uuid  Ref: assets.id (Set Null on delete)
scheduled_posts platforms text[]  Array de plataformas destino (ej: ['instagram', 'linkedin'])
scheduled_posts status  text  CHECK (status IN ('pending', 'published', 'failed'))
 4. Especificaciones del Core Engine e Integraciones
A. Integración con OpenRouter (Módulo Node.js)
Implementar las peticiones en el entorno Node.js de Netlify utilizando la API Fetch estándar o la librería oficial de OpenAI apuntando al BaseURL de OpenRouter. Variables de entorno mandatorias: OPENROUTER_API_KEY.
● Modelado de Texto (Chat / Copys): Utilizar anthropic/claude-3.5-sonnet para alta complejidad de marketing o meta-llama/llama-3-70b-instruct para flujos rápidos. El chat debe inyectar un System Prompt experto en marcos de conversión publicitaria (AIDA, PAS).
● Generación Multimedia: Configurar el consumo de modelos de imagen (como SDXL o Flux) y conectores audiovisuales mediante llamadas asíncronas. Debido a que las Netlify Functions tienen un tiempo límite de ejecución (timeout), la generación de video/audio debe guardar un estado preliminar de status: 'processing' en la base de datos y resolverse mediante técnicas de consulta asíncrona o webhooks.
B. Sistema de Gestión de Activos Digitales (DAM)
● El frontend debe pintar una interfaz de árbol o cuadrícula limpia usando componentes de Shadcn (como Dialog, Dropdown Menu y Card).
● Cada archivo multimedia debe renderizarse dinámicamente con etiquetas HTML5 nativas (<video> y <audio>) integrando controles ligeros en el navegador.
● Para garantizar la seguridad en Node.js, utiliza el SDK de Supabase para generar URLs firmadas (Signed URLs) temporales de 1 hora de duración para el consumo multimedia.
C. Calendario y Publicador en Redes Sociales
● OAuth Engine: Implementar los flujos de autorización en /api/social/callback de Node.js para almacenar de forma cifrada los tokens de Meta (Facebook/Instagram) y LinkedIn.
● Mecanismo Cron (Scheduler): Netlify soporta Netlify Scheduled Functions (Crons bajo Node.js). Configurar una función cron en netlify/functions/trigger-posts que se ejecute periódicamente, consulte las filas pending de la tabla scheduled_posts, procese los binarios desde el Storage y haga el POST correspondiente a las APIs de Meta Graph y LinkedIn UGC Post.
 5. Instrucciones de Implementación Inmediata para la IA
Claude, sigue rigurosamente esta secuencia lógica de desarrollo:
1.  Paso 1: Crea los archivos de configuración de TypeScript y verifica que las dependencias clave (@supabase/supabase-js, lucide-react, date-fns) estén listas en el entorno Node.
2.  Paso 2: Escribe la inicialización del cliente en lib/openrouter.ts creando un wrapper robusto para peticiones POST con gestión nativa de errores ante cuellos de botella de red.
3.  Paso 3: Genera las vistas del Gestor de Archivos (Carpetas, creación y carga al Storage) en la ruta de Next.js app/(dashboard)/media/page.tsx.
4.  Paso 4: Construye el flujo del Scheduler conectando la interfaz de calendario interactiva con el backend serverless de Node.
