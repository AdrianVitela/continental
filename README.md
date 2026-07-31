# 🃏 Continental — Multiplayer

Juego de cartas **Continental** multijugador en tiempo real con cuentas, perfiles, mesas privadas y públicas, y panel de administración.

## Características

- **Cuentas y perfiles** — registro, inicio de sesión con JWT y página propia `/perfil` para cambiar el nombre, elegir skin (14 disponibles) y ver tu insignia.
- **Skins e insignias** — skins gratuitas y exclusivas por rol (owner, VIP, beta tester, early adopter) que se muestran como avatar en el lobby y en la mesa.
- **Mesas privadas** — crea una sala con código compartible para jugar con amigos.
- **Mesas públicas** — explora mesas abiertas desde el lobby y únete con un clic. Su código queda oculto; cualquiera entra desde la lista.
- **Mesas calientes 🔥** — mesas públicas de **5 jugadores** con solo **2 mazos**: más difícil, más adrenalina.
- **Salir de la mesa** — botón "Salir de la mesa" antes de iniciar; si el host se va, el siguiente jugador toma el rol automáticamente.
- **Mesas auto-limpieza** — cuando una mesa queda vacía (salir o desconexión) se elimina sola; no hay que matarla a mano.
- **Panel de administración** (`/admin`, solo rol `owner`) — gestiona usuarios, insignias y mesas activas.
- **Feedback** — los jugadores pueden enviar comentarios con calificación desde el propio juego.

## Estructura

```
continental/
├── server/
│   ├── index.js         ← Express + WebSocket (rutas HTTP, salas, WS)
│   ├── GameEngine.js    ← Lógica del juego (fuente de verdad)
│   ├── GameRoom.js      ← Salas, asientos, mesas públicas, reconexión
│   ├── auth.js          ← Registro / login / perfil (JWT)
│   ├── admin.js         ← Panel de administración (owner)
│   ├── feedback.js      ← Endpoint de feedback
│   ├── db.js            ← Pool de PostgreSQL
│   └── setup-db.js      ← Crea las tablas
├── client/
│   ├── index.html       ← Lobby (crear/unirse, mesas públicas)
│   ├── login.html       ← Inicio de sesión
│   ├── register.html    ← Registro
│   ├── perfil.html      ← Perfil (skin, nombre, insignia)
│   ├── game.html        ← Mesa de juego
│   ├── admin.html       ← Panel de administración
│   ├── js/
│   │   ├── lobby.js       ← Lobby: salas, mesas públicas, espera
│   │   ├── skins.js       ← Catálogo compartido de skins e insignias
│   │   ├── socket.js      ← WebSocket con auto-reconexión
│   │   ├── game.js        ← Mesa de juego
│   │   ├── animations.js  ← Animaciones FLIP + movimiento de cartas
│   │   ├── dragdrop.js    ← Drag & drop (mano, fondo, pago, acomodar)
│   │   └── gsap-enhance.js
│   └── css/
│       └── style.css
├── saves/              ← Partidas guardadas (auto-creado)
├── .env                ← Variables de entorno (NO se sube al repo)
└── package.json        ← `npm start` lanza `server/index.js`
```

## Requisitos

- Node.js **>= 18**
- PostgreSQL (local o remoto)

## Configuración

Copia `.env.example` a `.env` (o créalo) con:

```bash
DATABASE_URL=postgres://usuario:password@localhost:5432/continental
JWT_SECRET=una_frase_secreta_larga_y_aleatoria
PORT=3000
RESEND_API_KEY=opcional_para_emails
FEEDBACK_TO=correo_que_recibe_feedback
```

> `DATABASE_URL` es obligatoria (usuarios, perfiles, feedback). `JWT_SECRET` se usa para firmar sesiones; cámbiala en producción.

### Base de datos

```bash
node server/setup-db.js   # crea las tablas usuarios y feedback
```

## Correr localmente

```bash
npm install
npm start          # abre http://localhost:3000
```

Para desarrollo con hot-reload:

```bash
cd server && npm install && npm run dev
```

## Cuentas y perfiles

- Registro en `/register` y login en `/login` (contraseñas con bcrypt).
- El perfil propio vive en `/perfil`:
  - **Skin**: 7 gratuitas (clásico, rojo, obsidiana, esmeralda, plata, bronce, zafiro…) y 7 exclusivas por rol (👑 Dorado, ⚡ Neon, 👑 Imperial, 🌈 Arcoíris, ⭐ Amatista, 🧪 Cobalto, 🎖️ Marfil).
  - **Nombre**: cambia tu nombre de jugador (único).
  - La skin y el nombre se reflejan en el lobby y durante la partida.

## Mesas

- **Privada**: se genera un código para compartir; la mesa se ve en la sala de espera con el código visible.
- **Pública**: aparece en el buscador de mesas del lobby (`🔥 Mesas públicas`). El código se oculta y cualquiera se une desde la lista.
- **Capacidad**: de 2 a 5 jugadores. Con **5 jugadores** la mesa es **caliente 🔥** (2 mazos, más reñido) y se marca en la lista.
- En la sala de espera hay un botón **"Salir de la mesa"**: liberas el asiento y vuelves al lobby; si eres el host, el siguiente jugador pasa a ser host.
- **Auto-limpieza**: una mesa vacía (por salida o desconexión de todos) se elimina sola al instante.

## Mecánicas implementadas

- ✅ 7 rondas con requisitos correctos
- ✅ Sistema de castigo (jerarquía de derecha a izquierda, jugadores bajados se saltan)
- ✅ Fase de acomodar en jugadas ajenas (tercias y corridas)
- ✅ Ronda 7 sin pagar
- ✅ As como 1 y como 14
- ✅ Comodines en tercias y corridas
- ✅ Reconexión automática
- ✅ Estado privado por jugador (no ves las cartas de otros)
- ✅ Animaciones: reparto, robo del mazo, pago, bajarse, rival paga, puntos flotantes
- ✅ Drag & drop: reordenar mano, fondo→mano en posición, mano→fondo para pagar

## Administración

Solo cuentas con rol `owner` acceden a `/admin`:

- Listar usuarios y asignar insignias (badges)
- Ver **mesas activas** y **cerrarlas** a distancia
- Consultar feedback recibido

## Deploy

### Railway

```bash
git push origin main     # Railway auto-deploya (railway.json ya está configurado)
```

1. Crea un proyecto desde tu repositorio en https://railway.app
2. Añade una base de datos **PostgreSQL** y enlaza `DATABASE_URL`
3. Define `JWT_SECRET` en las variables de entorno
4. Listo

### Render

1. "New Web Service" → conecta tu repo
2. Build Command: `npm install`
3. Start Command: `node server/index.js`
4. Añade una base de datos PostgreSQL y las variables de entorno

### Fly.io

```bash
npm install -g flyctl
fly auth login
fly launch        # detecta Node.js automáticamente
fly deploy
```

> Cualquier plataforma que sirva Node.js sirve: solo necesita `DATABASE_URL` (PostgreSQL) y `JWT_SECRET`.
