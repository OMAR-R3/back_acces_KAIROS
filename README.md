# Proyecto Kairos — Backend API

Sistema de control de visitas presenciales desarrollado como proyecto académico. Este repositorio contiene la API REST del backend construida con Next.js.

---

## 🧰 Tecnologías

| Tecnología | Uso |
|---|---|
| Next.js 15 | Framework principal para la API REST (App Router) |
| Supabase (PostgreSQL) | Base de datos relacional en la nube |
| JSON Web Token (JWT) | Autenticación y manejo de sesiones |
| bcryptjs | Hash seguro de contraseñas |
| Nodemailer | Envío de correos (aprobación, cancelación, recuperación) |
| QRCode | Generación de códigos QR en base64 |
| ngrok | Exposición del servidor en red local para pruebas |

---

## 📁 Estructura del Proyecto

```
├── app/
│   └── api/
│       ├── auth/
│       │   ├── login/route.js
│       │   ├── logout/route.js
│       │   ├── me/route.js
│       │   ├── refresh/route.js
│       │   ├── forgot-password/route.js
│       │   └── reset-password/route.js
│       ├── visits/
│       │   ├── route.js
│       │   ├── register/route.js
│       │   ├── register-internal/route.js
│       │   ├── resend-qr/route.js
│       │   ├── lookup/route.js
│       │   ├── validate/route.js
│       │   └── [id]/status/route.js
│       ├── department/route.js
│       ├── intern_users/route.js
│       ├── visitants/route.js
│       ├── logs/
│       │   ├── route.js
│       │   └── delete/route.js
│       └── documents/
│           ├── upload/route.js
│           ├── download/route.js
│           └── delete/route.js
├── db/
│   └── supabaseClient.js
├── middlewares/
│   └── auth.js
├── services/
│   ├── authService.js
│   ├── visitService.js
│   ├── visitorService.js
│   ├── documentService.js
│   ├── departmentService.js
│   ├── userService.js
│   ├── logService.js
│   └── emailService.js
├── utils/
│   ├── jwt.js
│   ├── qrGenerator.js
│   ├── fileStorage.js
│   └── logger.js
├── storage/
│   └── documents/          # Documentos de identidad (local, no se sube a git)
├── next.config.js
└── .env                    # Variables de entorno (no se sube a git)
```

---

## ⚙️ Instalación

```bash
# 1. Clonar el repositorio
git clone https://github.com/OMAR-R3/back_acces_KAIROS.git
cd kairos-backend

# 2. Instalar dependencias
npm install

# 3. Crear archivo de variables de entorno
cp .env.example .env
# Editar .env con tus valores

# 4. Iniciar en modo desarrollo
npm run dev
```

El servidor quedará disponible en `http://localhost:3000`.

---

## 🔐 Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto con las siguientes variables:

```env
# Supabase
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key

# JWT
JWT_SECRET=string-secreto-minimo-32-caracteres

# Correo (Gmail)
EMAIL_USER=tu-correo@gmail.com
EMAIL_PASS=tu-app-password-de-gmail

# URLs
INTRANET_URL=http://localhost:3001

# QR (opcional, legacy)
QR_SECRET=string-secreto-para-qr
```

> ⚠️ Nunca subas el archivo `.env` al repositorio. Está incluido en `.gitignore`.

---

## 🗺️ Rutas de la API

### Autenticación (pública)
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | Iniciar sesión con nombre y contraseña |
| POST | `/api/auth/logout` | Cerrar sesión e invalidar cookie |
| GET | `/api/auth/me` | Obtener datos del usuario autenticado |
| POST | `/api/auth/refresh` | Renovar token JWT activo |
| POST | `/api/auth/forgot-password` | Solicitar enlace de recuperación |
| POST | `/api/auth/reset-password` | Restablecer contraseña con token |

### Visitas — Extranet (público, sin auth)
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/visits/register` | Registro completo de visita desde formulario público |
| GET | `/api/visits/lookup?correo=` | Consultar visitas por correo del visitante |
| POST | `/api/visits/resend-qr` | Reenviar QR al correo del visitante |

### Visitas — Intranet (requiere auth)
| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | `/api/visits` | Lista de visitas con filtros opcionales | admin, recepcionista, guardia |
| GET | `/api/visits?id=X` | Detalle de una visita con documentos | admin, recepcionista, guardia |
| PATCH | `/api/visits/:id/status` | Cambiar estado: aprobada, cancelada, finalizada | admin, recepcionista, guardia* |
| POST | `/api/visits/register-internal` | Registrar visita sin aprobación (admin) | admin |
| POST | `/api/visits/validate` | Validar token QR en entrada | admin, recepcionista, guardia |

> *El guardia puede cancelar y finalizar pero no aprobar.

### Departamentos
| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| GET | `/api/department` | Lista de departamentos | Pública |
| POST | `/api/department` | Crear departamento | admin |
| PUT | `/api/department` | Actualizar departamento | admin |
| DELETE | `/api/department` | Eliminar departamento | admin |

### Usuarios Internos
| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | `/api/intern_users` | Lista con filtros y paginación | admin |
| POST | `/api/intern_users` | Crear usuario interno | admin |
| PUT | `/api/intern_users` | Actualizar usuario interno | admin |
| DELETE | `/api/intern_users` | Eliminar usuario interno | admin |

### Documentos
| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| POST | `/api/documents/upload` | Subir documento de identidad | admin, recepcionista |
| GET | `/api/documents/download?visita_id=` | Descargar documento | admin, recepcionista |
| DELETE | `/api/documents/delete` | Eliminar documento | admin |

### Logs
| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | `/api/logs` | Lista de logs con filtro opcional | admin |
| POST | `/api/logs` | Registrar log manualmente | admin |
| DELETE | `/api/logs/delete` | Eliminar log por ID | admin |

---

## 🔒 Sistema de Autenticación y Roles

El sistema utiliza **JWT** con expiración de 8 horas. El token se envía en una cookie `HttpOnly` y también en el body de la respuesta para peticiones cross-origin.

### Roles disponibles
| Rol | Descripción |
|---|---|
| `administrador` | Acceso total al sistema |
| `recepcionista` | Gestión de visitas y documentos |
| `guardia` | Validación de QR, cancelar y finalizar visitas |

### Middleware de protección
- `checkAuth(req)` — Verifica que el token sea válido. Lanza 401 si no hay sesión.
- `checkRole(req, roles[])` — Verifica el rol. Lanza 403 si el rol no tiene acceso.

---

## 🗄️ Base de Datos

El proyecto usa **Supabase** con las siguientes tablas:

| Tabla | Descripción |
|---|---|
| `Visitantes` | Personas externas que registran visitas |
| `Visitas` | Registro central de visitas con estado y QR |
| `Departamentos` | Áreas visitables de la institución |
| `Documentos` | Referencias a archivos de identidad (guardados localmente) |
| `Usuarios_Internos` | Personal autorizado con rol y contraseña hasheada |
| `Historial_Estados` | Trazabilidad de cambios de estado de visitas |
| `Logs_Acceso` | Registro de acciones del sistema |
| `reset_tokens` | Tokens temporales para recuperación de contraseña |

---

## 👥 Equipo

Proyecto académico — DS03SV-25
Materia: Desarrollo de Sitios Web Dinámicos  
Profesor: Héctor Saldaña Benítez

- Estrada Fragoso César Eduardo
- García Cruz José Omar
- Hernández Orozco Antonio Jesús
- Ruiz Loredo Miriam Wendoline