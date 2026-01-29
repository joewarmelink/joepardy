/**
 * SocketRouter.js
 * 
 * Bridges the gap between WebSockets (Network) and the internal Event Bus (Logic).
 * It translates incoming socket messages into bus CMDs, and EVTs back to sockets.
 */

const EventTypes = require('./EventTypes');

class SocketRouter {
  /**
   * @param {Object} io - The Socket.io server instance.
   * @param {Object} eventBus - The PlatformEventBus instance.
   */
  constructor(io, eventBus) {
    this.io = io;
    this.eventBus = eventBus;
  }

  /**
   * Sets up listeners for internal platform EVTs and broadcasts them to the correct clients.
   */
  init() {
    // Platform Level Events
    this.eventBus.on(EventTypes.EVT_PLAYER_JOINED, (data) => {
      this.io.to(data.roomCode).emit(EventTypes.EVT_PLAYER_JOINED, data);
    });

    this.eventBus.on(EventTypes.EVT_ROOM_CREATED, (data) => {
      // Room creation is usually sent back to the specific socketId
      this.io.emit(EventTypes.EVT_ROOM_CREATED, data);
    });

    // Game Level Events
    const gameEvents = [
        EventTypes.EVT_GAME_STARTED,
        EventTypes.EVT_PREP_PHASE,
        EventTypes.EVT_NEXT_QUESTION,
        EventTypes.EVT_ELIMINATE_OPTION,
        EventTypes.EVT_ANSWER_ACCEPTED,
        EventTypes.EVT_QUESTION_RESULTS,
        EventTypes.EVT_SHOW_SCOREBOARD,
        EventTypes.EVT_GAME_OVER,
        EventTypes.EVT_ERROR
    ];

    gameEvents.forEach(evt => {
        this.eventBus.on(evt, (data) => {
            if (data && data.roomCode) {
                this.io.to(data.roomCode).emit(evt, data);
            }
        });
    });
  }

  /**
   * Registers a newly connected socket and maps its messages to internal CMDs.
   * @param {Object} socket - The Socket.io socket instance.
   */
  registerSocket(socket) {
    // Map of Socket Event -> Bus Command
    const socketToBusMap = {
        [EventTypes.CMD_CREATE_ROOM]: EventTypes.CMD_CREATE_ROOM,
        [EventTypes.CMD_JOIN_ROOM]: EventTypes.CMD_JOIN_ROOM,
        [EventTypes.CMD_START_GAME]: EventTypes.CMD_START_GAME,
        [EventTypes.CMD_SUBMIT_ANSWER]: EventTypes.CMD_SUBMIT_ANSWER
    };

    Object.entries(socketToBusMap).forEach(([socketEvt, busCmd]) => {
        socket.on(socketEvt, (data) => {
            if (socketEvt === EventTypes.CMD_JOIN_ROOM && data.roomCode) {
                socket.join(data.roomCode);
            }
            this.eventBus.emit(busCmd, { ...data, socketId: socket.id });
        });
    });

    socket.on('disconnect', () => {
      this.eventBus.emit(EventTypes.SYSTEM_DISCONNECT, { socketId: socket.id });
    });
  }
}

module.exports = SocketRouter;
