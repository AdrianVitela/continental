# 🃏 Continental — Multiplayer

Juego de cartas Continental con soporte multijugador en tiempo real y asíncrono.

## Estructura

```
continental/
├── server/
│   ├── index.js        ← Express + WebSocket server
│   ├── GameEngine.js   ← Lógica del juego (fuente de verdad)
│   ├── GameRoom.js     ← Manejo de salas, reconexión, persistencia
│   └── package.json
├── client/
│   ├── index.html      ← Lobby (crear/unirse sala)
│   ├── game.html       ← Mesa de juego
│   ├── js/
│   │   ├── socket.js      ← WebSocket con auto-reconexión
│   │   ├── animations.js  ← Animaciones FLIP + movimiento de cartas
│   │   └── dragdrop.js    ← Drag & drop (mano, fondo, pago, acomodar)
│   └── css/
│       └── style.css
└── saves/              ← Partidas asíncronas guardadas (auto-creado)
```

## Correr localmente

```bash
cd server
npm install
npm run dev     # con hot-reload
# ó
npm start       # producción
```

Abre http://localhost:3000 en tu navegador.

## Deploy en Railway

1. Crea una cuenta en https://railway.app
2. "New Project" → "Deploy from GitHub repo"
3. Selecciona tu repositorio
4. Railway detecta el `package.json` automáticamente
5. Variables de entorno: ninguna requerida (PORT se asigna automáticamente)
6. El `Procfile` ya está configurado

## Deploy en Render

1. Crea cuenta en https://render.com
2. "New Web Service" → conecta tu repo
3. Build Command:  `cd server && npm install`
4. Start Command:  `cd server && node index.js`
5. Listo — Render asigna un dominio automáticamente

## Deploy en Fly.io

```bash
cd server
npm install -g flyctl
fly auth login
fly launch        # detecta Node.js automáticamente
fly deploy
```

## Modos de juego

### Tiempo real
- Todos los jugadores deben estar conectados simultáneamente
- Turnos en tiempo real — todos ven los movimientos al instante
- Recomendado para jugar con amigos en sesión

### Asíncrono
- El estado se guarda en disco (`saves/CODIGO.json`)
- Los jugadores pueden desconectarse y reconectarse cuando quieran
- Timeout de turno: 5 minutos (auto-paga la primera carta)
- Las salas expiran después de 6 horas de inactividad

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
