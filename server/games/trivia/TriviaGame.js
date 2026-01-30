/**
 * TriviaGame.js
 *
 * Main logic for the Trivia game type.
 * Handles fetching questions, managing timer-based eliminations,
 * and processing player scores.
 */

const EventTypes = require("../../core/EventTypes");
const config = require("../../../config");

class TriviaGame {
  /**
   * Initializes the Trivia Game instance.
   * @param {string} roomCode - The code of the room this game is running in.
   * @param {Object} deps - Injected dependencies.
   */
  constructor(roomCode, { eventBus, repository, provider, calculator }) {
    this.roomCode = roomCode;
    this.eventBus = eventBus;
    this.repository = repository;
    this.provider = provider;
    this.calculator = calculator;

    this.questions = [];
    this.currentQuestionIndex = -1;
    this.currentQuestion = null;
    this.questionStartTime = null;
    this.timers = [];
    this.isGameActive = false;
  }

  /**
   * Sets up event listeners for this specific game instance.
   */
  init() {
    this.eventBus.on(EventTypes.CMD_START_GAME, async (data) => {
      if (data && data.roomCode === this.roomCode) {
        await this.startGame();
      }
    });

    this.eventBus.on(EventTypes.CMD_SUBMIT_ANSWER, async (data) => {
      if (data && data.roomCode === this.roomCode) {
        await this.handleAnswer(data.playerUuid, data.answerIndex);
      }
    });

    this.eventBus.on(EventTypes.CMD_REQUEST_NEXT, async (data) => {
      if (data && data.roomCode === this.roomCode) {
        console.log(`[TriviaGame] CMD_REQUEST_NEXT received for room ${data.roomCode}. Triggering prepareNextQuestion.`);
        await this.prepareNextQuestion();
      }
    });
  }

  /**
   * Starts the trivia game session.
   */
  async startGame() {
    if (this.isGameActive) return;
    this.isGameActive = true;

    this.questions = await this.provider.getQuestions(config.games.trivia.questionsPerGame);
    console.log(`[TriviaGame] startGame - Fetched ${this.questions.length} questions.`); // Log question count
    this.currentQuestionIndex = -1;

    this.eventBus.emit(EventTypes.EVT_GAME_STARTED, {
      roomCode: this.roomCode,
      questionCount: this.questions.length
    });

    await this.prepareNextQuestion();
  }

  /**
   * Initiates the preparation phase before a question.
   */
  async prepareNextQuestion() {
    console.log(`[TriviaGame] prepareNextQuestion - Entry. currentQuestionIndex: ${this.currentQuestionIndex}, questions.length: ${this.questions.length}`);
    this._clearTimers();
    this.currentQuestionIndex++;

    console.log(`[TriviaGame] prepareNextQuestion - After increment. currentQuestionIndex: ${this.currentQuestionIndex}, questions.length: ${this.questions.length}`);
    if (this.currentQuestionIndex >= this.questions.length) {
      console.log(`[TriviaGame] prepareNextQuestion - Condition met: currentQuestionIndex (${this.currentQuestionIndex}) >= questions.length (${this.questions.length}). Calling endGame().`);
      await this.endGame();
      return;
    }

    this.currentQuestion = this.questions[this.currentQuestionIndex];

    // Before showing the new question, calculate and update scores for the previous round.
    await this._updateScoresForRound();

    const state = await this.repository.getState(this.roomCode);
    const players = (state && state.players) ? Object.values(state.players) : [];
    const leaderboard = players
        .filter(p => p.role === "player")
        .sort((a, b) => (b.score || 0) - (a.score || 0));

    this.eventBus.emit(EventTypes.EVT_PREP_PHASE, {
      roomCode: this.roomCode,
      category: this.currentQuestion.category,
      difficulty: this.currentQuestion.difficulty,
      resultTime: config.games.trivia.resultTime,
      questionNumber: this.currentQuestionIndex + 1,
      totalQuestions: this.questions.length,
      leaderboard
    });

    this._setTimer(() => this.startQuestion(), config.games.trivia.resultTime * 1000);
  }

  /**
   * Helper to update player scores based on their last answer.
   * This is called before transitioning to the next question/prep phase.
   * @private
   */
  async _updateScoresForRound() {
    const state = await this.repository.getState(this.roomCode);
    if (!state || !state.players) return;

    for (const playerUuid in state.players) {
      const player = state.players[playerUuid];
      // Only process players who have answered and are actual players
      if (player.role === "player" && player.hasAnswered) {
        // Recalculate points with actual correctness
        const timeElapsed = (player.answerTime - player.questionStartTime) / 1000;
        const adjustedTimeElapsed = Math.max(0, timeElapsed - config.games.trivia.readingBufferTime);

        const pointsAwarded = this.calculator.calculate(
          adjustedTimeElapsed,
          config.games.trivia.timeToAnswer,
          player.lastAnswerCorrect
        );
        
        player.score = (player.score || 0) + pointsAwarded;
      }
      // Reset for next round
      player.hasAnswered = false;
      player.lastAnswerCorrect = undefined;
      player.answerTime = undefined;
      player.questionStartTime = undefined;
    }
    await this.repository.saveState(this.roomCode, state);
  }

  /**
   * Starts the actual question timer and broadcasting.
   */
  async startQuestion() {
    this.questionStartTime = Date.now();
    
    this.eventBus.emit(EventTypes.EVT_NEXT_QUESTION, {
      roomCode: this.roomCode,
      question: this.currentQuestion.question,
      options: this.currentQuestion.options,
      category: this.currentQuestion.category,
      difficulty: this.currentQuestion.difficulty,
      totalTime: config.games.trivia.timeToAnswer,
      readingBufferTime: config.games.trivia.readingBufferTime,
      scoring: config.games.trivia.scoring
    });

    this._setupEliminationTimers();
    
    // Schedule results reveal
    const totalTimeWithBuffer = (config.games.trivia.readingBufferTime + config.games.trivia.timeToAnswer) * 1000;
    this._setTimer(() => this.revealResults(), totalTimeWithBuffer);
  }

  /**
   * Reveal the correct answer to all players.
   */
  async revealResults() {
    if (!this.currentQuestion) return;

    const state = await this.repository.getState(this.roomCode);
    const playerScoresThisRound = {};
    if (state && state.players) {
      for (const playerUuid in state.players) {
        const player = state.players[playerUuid];
        console.log(`Processing player ${playerUuid}. Role: ${player.role}, Has Answered: ${player.hasAnswered}, Last Correct: ${player.lastAnswerCorrect}`); // DEBUG
        if (player.role === "player" && player.hasAnswered) {
          const timeElapsed = (player.answerTime - player.questionStartTime) / 1000;
          const adjustedTimeElapsed = Math.max(0, timeElapsed - config.games.trivia.readingBufferTime);

          const pointsAwarded = this.calculator.calculate(
            adjustedTimeElapsed,
            config.games.trivia.timeToAnswer,
            player.lastAnswerCorrect // Use actual correctness for final points
          );
          playerScoresThisRound[playerUuid] = pointsAwarded;
        } else if (player.role === "player") {
          playerScoresThisRound[playerUuid] = 0; // Assign 0 points
        }
      }
    }
    console.log('playerScoresThisRound before emit:', playerScoresThisRound); // DEBUG

    this.eventBus.emit(EventTypes.EVT_QUESTION_RESULTS, {
      roomCode: this.roomCode,
      correctIndex: this.currentQuestion.correctIndex,
      playerScoresThisRound: playerScoresThisRound // This is sent.
    });

    // Stay on reveal screen for a bit, then either move to next question or end game
    this._setTimer(async () => {
        console.log(`[TriviaGame] revealResults timer finished. currentQuestionIndex: ${this.currentQuestionIndex}, questions.length: ${this.questions.length}`);
        if (this.currentQuestionIndex + 1 >= this.questions.length) {
            console.log(`[TriviaGame] revealResults - Last question. Calling endGame().`);
            await this.endGame();
        } else {
            console.log(`[TriviaGame] revealResults - Not last question. Emitting CMD_REQUEST_NEXT.`);
            this.eventBus.emit(EventTypes.CMD_REQUEST_NEXT, { roomCode: this.roomCode });
        }
    }, 5000);
  }

  /**
   * Processes a player\'s answer and updates their score.
   */
  async handleAnswer(playerUuid, answerIndex) {
    if (!this.currentQuestion || !this.questionStartTime) {
      return;
    }

    const state = await this.repository.getState(this.roomCode);
    if (!state || !state.players || !state.players[playerUuid]) return;

    // Don\'t allow double scoring, unless we decide to enable changing answers later
    // For now, record the time and correctness of the first answer.
    if (state.players[playerUuid].hasAnswered) return;

    state.players[playerUuid].hasAnswered = true;
    state.players[playerUuid].lastAnswerCorrect = (answerIndex === this.currentQuestion.correctIndex);
    state.players[playerUuid].answerTime = Date.now(); // Record when they answered
    state.players[playerUuid].questionStartTime = this.questionStartTime; // Store question start time with answer
    await this.repository.saveState(this.roomCode, state);

    // Calculate potential points for immediate client feedback (as if correct)
    let timeElapsedForPotential = (state.players[playerUuid].answerTime - this.questionStartTime) / 1000;
    timeElapsedForPotential = Math.max(0, timeElapsedForPotential - config.games.trivia.readingBufferTime);
    const potentialPoints = this.calculator.calculate(
      timeElapsedForPotential, 
      config.games.trivia.timeToAnswer, 
      true // Always calculate potential as correct for client feedback
    );

    // console.log(`Server calculated potential points for ${playerUuid}: ${potentialPoints} (Actual Correct: ${state.players[playerUuid].lastAnswerCorrect})`); // DEBUG

    this.eventBus.emit(EventTypes.EVT_ANSWER_ACCEPTED, {
      roomCode: this.roomCode,
      playerUuid,
      isCorrect: (answerIndex === this.currentQuestion.correctIndex), // Send actual correctness
      points: potentialPoints // Send potential points for client display
    });
  }

  /**
   * Finishes the game session.
   */
  async endGame() {
    console.log(`[TriviaGame] endGame - Entry.`);
    this._clearTimers();
    this.isGameActive = false;
    // Ensure final scores are updated
    await this._updateScoresForRound(); 

    const state = await this.repository.getState(this.roomCode);
    const players = (state && state.players) ? Object.values(state.players) : [];
    const leaderboard = players
        .filter(p => p.role === "player")
        .sort((a, b) => (b.score || 0) - (a.score || 0));
    
    console.log(`[TriviaGame] endGame - Emitting EVT_SHOW_SUMMARY.`);
    this.eventBus.emit(EventTypes.EVT_SHOW_SUMMARY, {
      roomCode: this.roomCode,
      leaderboard,
      summaryScreenTime: config.games.trivia.summaryScreenTime
    });

    this._setTimer(async () => {
      console.log(`[TriviaGame] endGame timer finished. Deleting room ${this.roomCode} and emitting EVT_RETURN_TO_LOBBY.`);
      await this.repository.deleteRoom(this.roomCode); // Clear game state
      this.eventBus.emit(EventTypes.EVT_RETURN_TO_LOBBY, { roomCode: this.roomCode });
    }, config.games.trivia.summaryScreenTime * 1000);
    console.log(`[TriviaGame] endGame - Exit.`);
  }

  /**
   * Internal helper to schedule answer eliminations with a fixed queue.
   * @private
   */
  _setupEliminationTimers() {
    const totalTime = config.games.trivia.timeToAnswer;
    const bufferTime = config.games.trivia.readingBufferTime;
    const marks = config.games.trivia.eliminationMarks; // [0.75, 0.5, 0.25]
    
    let incorrectIndexes = [];
    for (let i = 0; i < this.currentQuestion.options.length; i++) {
      if (i !== this.currentQuestion.correctIndex) {
        incorrectIndexes.push(i);
      }
    }
    
    // Shuffle options using Fisher-Yates
    for (let i = incorrectIndexes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [incorrectIndexes[i], incorrectIndexes[j]] = [incorrectIndexes[j], incorrectIndexes[i]];
    }

    marks.forEach((mark, index) => {
      const timeRemaining = totalTime * mark;
      const delay = (bufferTime + (totalTime - timeRemaining)) * 1000;
      
      this._setTimer(() => {
        if (this.currentQuestion && incorrectIndexes[index] !== undefined) {
          this.eventBus.emit(EventTypes.EVT_ELIMINATE_OPTION, {
            roomCode: this.roomCode,
            optionIndex: incorrectIndexes[index]
          });
        }
      }, delay);
    });
  }

  /**
   * Helper to set a timer and track it for cleanup.
   * @private
   */
  _setTimer(callback, delay) {
    const timer = setTimeout(callback, delay);
    this.timers.push(timer);
    return timer;
  }

  /**
   * Clears all active timers safely.
   * @private
   */
  _clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  /**
   * Retrieves the current state of the game for reconnection purposes.
   * @returns {Object} The current game state.
   */
  getCurrentState() {
    const gameState = {
      isGameActive: this.isGameActive,
      currentQuestionIndex: this.currentQuestionIndex,
      totalQuestions: this.questions.length,
      questionStartTime: this.questionStartTime,
      currentQuestion: this.currentQuestion ? {
        question: this.currentQuestion.question,
        options: this.currentQuestion.options,
        category: this.currentQuestion.category,
        difficulty: this.currentQuestion.difficulty,
      } : null,
      gameConfig: {
        timeToAnswer: config.games.trivia.timeToAnswer,
        readingBufferTime: config.games.trivia.readingBufferTime,
        scoring: config.games.trivia.scoring,
        resultTime: config.games.trivia.resultTime
      }
    };
    return gameState;
  }
}

module.exports = TriviaGame;