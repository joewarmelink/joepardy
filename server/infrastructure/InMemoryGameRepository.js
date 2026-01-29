/**
 * InMemoryGameRepository.js
 * 
 * An in-memory implementation of the GameRepository.
 * Stores all game states in a Map. This is suitable for single-server
 * deployments or local development.
 * 
 * Note: All methods are async to match the interface needed for 
 * eventual Redis/External database implementations.
 */

class InMemoryGameRepository {
  /**
   * Initializes the repository with an empty Map.
   */
  constructor() {
    this.rooms = new Map();
  }

  /**
   * Checks if a room with the given code exists.
   * @param {string} roomCode 
   * @returns {Promise<boolean>}
   */
  async exists(roomCode) {
    return this.rooms.has(roomCode);
  }

  /**
   * Creates a new entry for a room.
   * @param {string} roomCode 
   * @returns {Promise<void>}
   */
  async createRoom(roomCode) {
    this.rooms.set(roomCode, {
      state: null,
      players: new Map(),
    });
  }

  /**
   * Saves the current state of a game room.
   * @param {string} roomCode 
   * @param {Object} state 
   * @returns {Promise<void>}
   */
  async saveState(roomCode, state) {
    const room = this.rooms.get(roomCode);
    if (room) {
      room.state = state;
    }
  }

  /**
   * Retrieves the current state of a game room.
   * @param {string} roomCode 
   * @returns {Promise<Object|null>}
   */
  async getState(roomCode) {
    const room = this.rooms.get(roomCode);
    return room ? room.state : null;
  }

  /**
   * Deletes a room from storage.
   * @param {string} roomCode 
   * @returns {Promise<void>}
   */
  async deleteRoom(roomCode) {
    this.rooms.delete(roomCode);
  }
}

module.exports = InMemoryGameRepository;
