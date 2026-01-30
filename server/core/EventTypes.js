/**
 * EventTypes.js
 * 
 * Standard constants for events used across the platform.
 * Commands (CMD) are requests from clients/logic.
 * Events (EVT) are broadcasts/notifications to clients.
 */

module.exports = {
  // --- Commands (Input to the Server) ---
  CMD_CREATE_ROOM: 'room:create',
  CMD_JOIN_ROOM: 'room:join',
  CMD_START_GAME: 'game:start',
  CMD_SUBMIT_ANSWER: 'game:submit_answer',
  CMD_REQUEST_NEXT: 'game:request_next', // Internal trigger for next state
  CMD_PLAYER_DISCONNECTED: 'player:disconnected',

  // --- Events (Output to the Clients) ---
  EVT_ROOM_CREATED: 'room:created',
  EVT_PLAYER_JOINED: 'room:player_joined',
  EVT_GAME_STARTED: 'game:started',
  EVT_PREP_PHASE: 'game:prep_phase',
  EVT_NEXT_QUESTION: 'game:next_question',
  EVT_ELIMINATE_OPTION: 'game:eliminate_option',
  EVT_ANSWER_ACCEPTED: 'game:answer_accepted',
  EVT_QUESTION_RESULTS: 'game:question_results',
  EVT_SHOW_SCOREBOARD: 'game:show_scoreboard',
  EVT_GAME_OVER: 'game:over',
  EVT_ERROR: 'platform:error',

  // --- System Events ---
  SYSTEM_DISCONNECT: 'system:disconnect',
  SYSTEM_RECONNECT: 'system:reconnect'
};
