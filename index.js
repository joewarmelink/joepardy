/**
 * index.js
 * 
 * Main entry point for the Trivia Platform server.
 * Initializes all core components and starts the Express/Socket.io server.
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');

const config = require('./config');
const PlatformEventBus = require('./server/core/PlatformEventBus');
const SocketRouter = require('./server/core/SocketRouter');
const RoomManager = require('./server/core/RoomManager');
const InMemoryGameRepository = require('./server/infrastructure/InMemoryGameRepository');
const OpenTDBProvider = require('./server/infrastructure/OpenTDBProvider');
const ScoreCalculator = require('./server/games/trivia/ScoreCalculator');
const TriviaGame = require('./server/games/trivia/TriviaGame');
const EventTypes = require('./server/core/EventTypes');

// 1. Initialize Core Components
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const eventBus = new PlatformEventBus();
const repository = new InMemoryGameRepository();
const roomManager = new RoomManager(repository);
const socketRouter = new SocketRouter(io, eventBus);

// Maps roomCode -> GameInstance
const activeGames = new Map();

// 2. Setup Static Files
app.use(express.static(path.join(__dirname, 'public')));

// 3. Initialize Socket Routing
socketRouter.init();
io.on('connection', (socket) => {
  socketRouter.registerSocket(socket);
});

// 4. Handle Internal Logic via Event Bus (Commands)
eventBus.on(EventTypes.CMD_JOIN_ROOM, async (data) => {
  const { roomCode, player, socketId } = data;
  
  const success = await roomManager.joinRoom(roomCode, player);
  if (success) {
    eventBus.emit(EventTypes.EVT_PLAYER_JOINED, {
      roomCode,
      player
    });
  } else {
    io.to(socketId).emit(EventTypes.EVT_ERROR, { message: 'Room not found' });
  }
});

eventBus.on(EventTypes.CMD_CREATE_ROOM, async (data) => {
  const { socketId } = data;
  const roomCode = await roomManager.createRoom();
  
  // Create and initialize the game instance
  const triviaProvider = new OpenTDBProvider();
  const calculator = new ScoreCalculator();
  const game = new TriviaGame(roomCode, {
    eventBus,
    repository,
    provider: triviaProvider,
    calculator
  });
  
  game.init();
  activeGames.set(roomCode, game);

  io.to(socketId).emit(EventTypes.EVT_ROOM_CREATED, { roomCode });
});

// 5. Start Server
server.listen(config.port, () => {
  console.log('-------------------------------------------');
  console.log(`JoePARDY! running on port ${config.port}`);
  
  const networkInterfaces = os.networkInterfaces();
  for (const name of Object.keys(networkInterfaces)) {
    for (const net of networkInterfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`Players can join at: http://${net.address}:${config.port}`);
      }
    }
  }
  console.log('-------------------------------------------');
});
