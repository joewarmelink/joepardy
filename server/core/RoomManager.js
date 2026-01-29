/**
 * RoomManager.js
 * 
 * Manages game rooms and their associated players using a Repository for persistence.
 * Handles room creation with collision detection, joining, and player tracking.
 */

const config = require('../../config');

class RoomManager {
  /**
   * Initializes the RoomManager with a repository.
   * @param {Object} repository - An implementation of the IGameRepository interface.
   */
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * Creates a new room with a unique random code.
   * Checks the repository to ensure no duplicate codes.
   * @returns {Promise<string>} The generated unique room code.
   */
  async createRoom() {
    let code;
    let exists = true;

    while (exists) {
      code = this._generateCode();
      exists = await this.repository.exists(code);
    }

    await this.repository.createRoom(code);
    // Initialize room state with an empty players object
    await this.repository.saveState(code, { players: {} });
    
    return code;
  }

  /**
   * Adds a player to a room's state.
   * @param {string} roomCode - The code of the room to join.
   * @param {Object} player - The player object containing uuid and name.
   * @returns {Promise<boolean>} True if the room exists and player was added, false otherwise.
   */
  async joinRoom(roomCode, player) {
    const state = await this.repository.getState(roomCode);
    if (!state) {
      return false;
    }

    // Default role to player if not provided
    const participant = {
        ...player,
        role: player.role || 'player'
    };

    state.players[participant.uuid] = participant;
    await this.repository.saveState(roomCode, state);
    return true;
  }

  /**
   * Retrieves all players currently in a room.
   * @param {string} roomCode - The code of the room.
   * @returns {Promise<Array|undefined>} An array of player objects.
   */
  async getPlayers(roomCode) {
    const state = await this.repository.getState(roomCode);
    if (!state) {
      return undefined;
    }
    return Object.values(state.players);
  }

  /**
   * Finds a specific player in a room by their UUID.
   * @param {string} roomCode - The code of the room.
   * @param {string} uuid - The unique identifier of the player.
   * @returns {Promise<Object|undefined>} The player object if found.
   */
  async getPlayerByUuid(roomCode, uuid) {
    const state = await this.repository.getState(roomCode);
    if (!state || !state.players) {
      return undefined;
    }
    return state.players[uuid];
  }

  /**
   * Deletes a room from the repository.
   * @param {string} roomCode - The code of the room to remove.
   * @returns {Promise<void>}
   */
  async removeRoom(roomCode) {
    await this.repository.deleteRoom(roomCode);
  }

  /**
   * Generates a random string based on the configured alphabet and length.
   * @private
   * @returns {string}
   */
  _generateCode() {
    const alphabet = config.platform.roomCodeAlphabet;
    const length = config.platform.roomCodeLength;
    let code = '';
    for (let i = 0; i < length; i++) {
      code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return code;
  }
}

module.exports = RoomManager;
