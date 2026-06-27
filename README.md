# FloFlo Backend 💜

Backend de FloFlo, una aplicación web pensada para apoyar a niños y niñas autistas en la organización de rutinas, preparación de actividades, registro emocional, habilidades sociales y seguimiento por parte de padres o cuidadores.

Este backend expone una API REST construida con Node.js, Express y PostgreSQL. Incluye autenticación con JWT, roles de usuario, validación de permisos, generación de reportes PDF, recuperación de contraseña y módulos de seguimiento para niños/as y cuidadores.

---

## 🚀 Tecnologías utilizadas

* Node.js
* Express
* PostgreSQL
* JWT
* bcrypt
* PDFKit
* Resend
* dotenv
* CORS

---

## 📁 Estructura general

```txt
FloFloBackend/
├── src/
│   ├── controllers/
│   ├── routes/
│   ├── services/
│   ├── middleware/
│   ├── database/
│   └── app.js
├── package.json
└── README.md
```

---

## ⚙️ Instalación local

### 1. Clonar el repositorio

```bash
git clone https://github.com/DorianAndrea/FloFloBackend.git
```

### 2. Entrar al proyecto

```bash
cd FloFloBackend
```

### 3. Instalar dependencias

```bash
npm install
```

### 4. Crear archivo `.env`

En la raíz del proyecto crear un archivo `.env` con las variables necesarias.

```env
PORT=5001
DATABASE_URL=postgresql://usuario:password@host:puerto/database
JWT_SECRET=tu_secreto_jwt
FRONTEND_URL=http://localhost:5173
APP_TIMEZONE=America/Santiago

RESEND_API_KEY=tu_api_key_de_resend
EMAIL_FROM=FloFlo <onboarding@resend.dev>
ALLOW_RESET_TOKEN_RESPONSE=false
```

No subir el archivo `.env` al repositorio.

---

## ▶️ Ejecutar backend en local

```bash
npm run dev
```

Por defecto el backend corre en:

```txt
http://localhost:5001
```

La API se consume desde:

```txt
http://localhost:5001/api
```

---

## 🌐 Deploy

El backend está preparado para funcionar en Render.

URL de producción:

```txt
https://floflobackend.onrender.com
```

Variables recomendadas en Render:

```env
PORT=5001
DATABASE_URL=postgresql://usuario:password@host:puerto/database
JWT_SECRET=tu_secreto_jwt
FRONTEND_URL=https://floflodesktop2.onrender.com
APP_TIMEZONE=America/Santiago

RESEND_API_KEY=tu_api_key_de_resend
EMAIL_FROM=FloFlo <onboarding@resend.dev>
ALLOW_RESET_TOKEN_RESPONSE=false
```

---

## 🧩 Base de datos

FloFlo utiliza PostgreSQL con el esquema principal:

```sql
"FloFlo"
```

Tablas principales utilizadas:

```txt
user
user_progress
achievement
user_achievement

mood
routine
routine_progress

place
place_step

user_contact
user_contact_conversation
user_contact_conversation_progress

conversation
conversation_progress

parent_child
sensory_profile
sensory_profile_history
weekly_support_plan_history
password_reset_token
```

---

## 🔐 Autenticación y seguridad

El backend utiliza autenticación mediante JWT.

Las rutas protegidas requieren el header:

```txt
Authorization: Bearer TOKEN
```

El backend valida:

* Usuario autenticado.
* Rol del usuario.
* Ownership de recursos.
* Que un niño/a solo acceda a sus propios datos.
* Que un padre/cuidador solo acceda a niños/as asociados.
* Que rutas antiguas o inseguras no expongan información.
* Que no se puedan modificar recursos de otros usuarios.

---

## 👥 Roles

FloFlo utiliza dos roles principales:

```txt
child
parent
```

### Rol `child`

Puede acceder a sus propios módulos:

* Emociones.
* Rutinas.
* Lugares.
* Amigos/contactos.
* Conversaciones.
* Logros.
* Perfil sensorial propio.
* Reporte propio.

### Rol `parent`

Puede acceder a:

* Panel de padres.
* Niños/as asociados.
* Perfil sensorial del niño/a.
* Reportes del niño/a.
* Dashboard de evolución.
* Plan semanal de apoyo.
* Recomendaciones.

---

## 📌 Endpoints principales

### Auth

```txt
POST /api/auth/register
POST /api/auth/login
POST /api/auth/forgot-password
POST /api/auth/reset-password
```

---

### Perfil

```txt
GET /api/profile
PUT /api/profile
```

---

### Emociones

```txt
GET /api/moods
POST /api/moods
```

---

### Rutinas

```txt
GET /api/routines
GET /api/routines/today
GET /api/routines/history
POST /api/routines
PUT /api/routines/:id
DELETE /api/routines/:id
POST /api/routines/:id/complete
```

El módulo de rutinas permite:

* Crear rutinas con horarios.
* Seleccionar días de la semana.
* Ver rutinas activas.
* Ver rutinas de hoy.
* Completar una rutina una vez por día.
* Mantener historial por fecha.
* Evitar duplicar puntos por completar dos veces el mismo día.

---

### Lugares

```txt
GET /api/places
GET /api/places/:id
POST /api/places
PUT /api/places/:id
DELETE /api/places/:id

GET /api/places/:id/steps
POST /api/places/:id/steps
PUT /api/places/:id/steps/replace
```

---

### Amigos/contactos

```txt
GET /api/contacts
GET /api/contacts/:id
POST /api/contacts
PUT /api/contacts/:id
DELETE /api/contacts/:id
```

---

### Conversaciones de contactos

```txt
GET /api/contact-conversations
GET /api/contact-conversations/progress
GET /api/contact-conversations/contact/:contactId
POST /api/contact-conversations
PUT /api/contact-conversations/:id
DELETE /api/contact-conversations/:id
POST /api/contact-conversations/:id/complete
POST /api/contact-conversations/:id/favorite
```

---

### Conversaciones generales

```txt
GET /api/conversations
POST /api/conversations
PUT /api/conversations/:id
DELETE /api/conversations/:id
POST /api/conversations/:id/complete
POST /api/conversations/:id/favorite
```

---

### Logros

```txt
GET /api/achievements
```

---

### Progreso

```txt
GET /api/progress
```

---

### Panel de padres

```txt
GET /api/parent-dashboard/me
GET /api/parent-dashboard/children/:childId
GET /api/parent-dashboard/children/:childId/evolution
GET /api/parent-dashboard/children/:childId/weekly-plan-history
```

---

### Asociación padre-hijo

```txt
GET /api/parent-child/me/children
POST /api/parent-child/link
```

---

### Perfil sensorial

```txt
GET /api/sensory-profile/me
PUT /api/sensory-profile/me

GET /api/sensory-profile/children/:childId
PUT /api/sensory-profile/children/:childId

GET /api/sensory-profile/history/me
GET /api/sensory-profile/history/children/:childId
```

---

### Reportes PDF

```txt
GET /api/report/me
GET /api/report/children/:childId
```

El reporte PDF incluye:

* Resumen general.
* Semáforo de bienestar.
* Perfil sensorial.
* Historial sensorial.
* Plan semanal.
* Historial de planes.
* Dashboard de evolución.
* Tendencia emocional.
* Recomendaciones.

---

## 🧠 Rutinas 2.0

El backend incluye una versión mejorada del módulo de rutinas.

### Tabla `routine`

Campos relevantes:

```txt
id
user_id
name
description
start_time
end_time
days_of_week
is_active
created_at
updated_at
```

### Tabla `routine_progress`

Campos relevantes:

```txt
id
user_id
routine_id
completed
points
completed_at
completion_date
```

La lógica permite:

* Completar una rutina una vez por día.
* Volver a completar la misma rutina al día siguiente.
* Evitar duplicación de puntos en el mismo día.
* Mantener historial de cumplimiento.
* Filtrar rutinas según el día actual.
* Desactivar rutinas sin borrar su historial.

Índice recomendado:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS routine_progress_user_routine_date_unique
ON "FloFlo".routine_progress (user_id, routine_id, completion_date);
```

---

## 📄 Reportes PDF

El backend genera reportes PDF con PDFKit.

El reporte es útil para padres, cuidadores o profesionales, ya que reúne información sobre:

* Estado emocional.
* Rutinas.
* Perfil sensorial.
* Recomendaciones.
* Evolución.
* Plan semanal de apoyo.

---

## 📧 Recuperación de contraseña

FloFlo utiliza Resend para enviar correos de recuperación.

Flujo general:

```txt
1. Usuario solicita recuperación.
2. Backend genera token.
3. Se guarda token en password_reset_token.
4. Se envía correo con enlace al frontend.
5. Usuario crea nueva contraseña.
6. Token se invalida después de usarse.
```

---

## 🧪 Pruebas manuales recomendadas

### Auth

* [ ] Registrar usuario niño.
* [ ] Registrar usuario padre.
* [ ] Login correcto.
* [ ] Login con contraseña incorrecta.
* [ ] Recuperar contraseña.
* [ ] Resetear contraseña.

### Rutinas

* [ ] Crear rutina con todos los días.
* [ ] Crear rutina con días específicos.
* [ ] Editar rutina.
* [ ] Completar rutina.
* [ ] Intentar completar la misma rutina dos veces el mismo día.
* [ ] Ver historial.
* [ ] Eliminar rutina y verificar que no aparece como activa.

### Lugares

* [ ] Crear lugar.
* [ ] Crear pasos.
* [ ] Regenerar pasos.
* [ ] Editar lugar.
* [ ] Eliminar lugar.

### Amigos y conversaciones

* [ ] Crear contacto.
* [ ] Editar contacto.
* [ ] Crear conversación para contacto.
* [ ] Editar conversación.
* [ ] Completar conversación.
* [ ] Marcar favorita.
* [ ] Eliminar conversación.
* [ ] Eliminar contacto.

### Panel padres

* [ ] Asociar niño/a.
* [ ] Ver dashboard.
* [ ] Ver perfil sensorial.
* [ ] Ver evolución.
* [ ] Descargar PDF.

### Seguridad

* [ ] Niño no puede acceder a rutas de padre.
* [ ] Padre no puede acceder a niños no asociados.
* [ ] Usuario no puede editar recursos de otro usuario.
* [ ] Rutas antiguas inseguras retornan error o 404.

---

## 🧯 Errores comunes

### `Token no enviado`

La ruta requiere autenticación y no se envió el header:

```txt
Authorization: Bearer TOKEN
```

### `Rutina ya estaba completada hoy`

La rutina ya fue marcada como realizada en la fecha actual.

### `Esta rutina no está programada para hoy`

La rutina existe, pero su campo `days_of_week` no incluye el día actual.

### `No autorizado`

El usuario no tiene permisos para acceder a ese recurso.

---

## 📌 Estado actual

El backend se encuentra en etapa de MVP avanzado.

Incluye:

* Autenticación.
* Roles.
* Seguridad por ownership.
* Rutinas 2.0.
* Perfil sensorial.
* Panel de padres.
* Reportes PDF.
* Recuperación de contraseña.
* Logros y progreso.
* Historiales.
* Deploy en Render.

Pendientes sugeridos:

* Agregar pruebas automatizadas.
* Documentar respuestas exactas de cada endpoint.
* Agregar validación más estricta con schemas.
* Mejorar logs de producción.
* Agregar rate limiting.
* Revisar monitoreo y backups de base de datos.

---

## 👩‍💻 Autora

Proyecto desarrollado por Dorian Andrea.

---

## 💜 Propósito

FloFlo busca entregar una herramienta clara, segura y amable para apoyar la autonomía, anticipación y seguimiento diario de niños y niñas autistas, integrando también a padres y cuidadores en el proceso.
