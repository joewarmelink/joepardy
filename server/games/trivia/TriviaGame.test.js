/**
 * TriviaGame.test.js
 * 
 * Tests for the TriviaGame plugin logic.
 * Ensures state transitions, scoring, and elimination logic work as expected.
 */

const TriviaGame = require('./TriviaGame');
const EventTypes = require('../../core/EventTypes');

describe('TriviaGame', () => {
  let game;
  let mockBus;
  let mockRepo;
  let mockProvider;
  let mockCalculator;
  const roomCode = 'TEST';

  beforeEach(() => {
    mockBus = {
      on: jest.fn(),
      emit: jest.fn()
    };
    mockRepo = {
      getState: jest.fn(),
      saveState: jest.fn()
    };
    mockProvider = {
      getQuestions: jest.fn()
    };
    mockCalculator = {
      calculate: jest.fn()
    };

    game = new TriviaGame(roomCode, {
      eventBus: mockBus,
      repository: mockRepo,
      provider: mockProvider,
      calculator: mockCalculator
    });
  });

  afterEach(() => {
    game._clearTimers();
  });

  test('should initialize and listen for all command events', async () => {
    game.init();
    expect(mockBus.on).toHaveBeenCalledWith(EventTypes.CMD_START_GAME, expect.any(Function));
    expect(mockBus.on).toHaveBeenCalledWith(EventTypes.CMD_SUBMIT_ANSWER, expect.any(Function));
    expect(mockBus.on).toHaveBeenCalledWith(EventTypes.CMD_REQUEST_NEXT, expect.any(Function));
  });

  test('should start game and fetch questions', async () => {
    const mockQuestions = [{ question: 'Q1', options: ['A', 'B', 'C', 'D'], correctIndex: 0 }];
    mockProvider.getQuestions.mockResolvedValue(mockQuestions);
    mockRepo.getState.mockResolvedValue({ players: {} });

    await game.startGame();

    expect(mockProvider.getQuestions).toHaveBeenCalled();
    expect(mockBus.emit).toHaveBeenCalledWith(EventTypes.EVT_GAME_STARTED, expect.objectContaining({
      roomCode,
      questionCount: 1
    }));
  });

  test('should handle answer submission and update repository', async () => {
    const playerUuid = 'p1';
    const playerAnswer = 0;
    
    game.currentQuestion = { correctIndex: 0 };
    game.questionStartTime = Date.now() - 5000;
    
    mockRepo.getState.mockResolvedValue({
      players: { [playerUuid]: { name: 'Alice', score: 0 } }
    });
    mockCalculator.calculate.mockReturnValue(500);

    await game.handleAnswer(playerUuid, playerAnswer);

    expect(mockBus.emit).toHaveBeenCalledWith(EventTypes.EVT_ANSWER_ACCEPTED, expect.objectContaining({
      points: 500
    }));
  });

  test('should transition through questions and end game', async () => {
    const mockQuestions = [
      { question: 'Q1', options: ['A', 'B'], correctIndex: 0 }
    ];
    game.questions = mockQuestions;
    game.currentQuestionIndex = 0;
    mockRepo.getState.mockResolvedValue({ players: {} });

    await game.prepareNextQuestion();
    expect(game.currentQuestionIndex).toBe(1);
    expect(mockBus.emit).toHaveBeenCalledWith(EventTypes.EVT_SHOW_SUMMARY, expect.any(Object));
  });

  test('should handle elimination timers', async () => {
    jest.useFakeTimers();
    game.currentQuestion = { options: ['A', 'B', 'C', 'D'], correctIndex: 0 };
    
    game._setupEliminationTimers();
    
    // Should create 3 elimination timers (one for each elimination mark)
    expect(game.timers).toHaveLength(3);
    
    // Advance to first elimination (readingBuffer + (timeToAnswer - (timeToAnswer * 0.5)))
    // = 3.5s + 5s = 8.5s = 8500ms
    jest.advanceTimersByTime(8500);
    expect(mockBus.emit).toHaveBeenCalledWith(EventTypes.EVT_ELIMINATE_OPTION, expect.any(Object));
    
    // Advance to second elimination (11s total from start)
    jest.advanceTimersByTime(2500);
    expect(mockBus.emit).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });

  test('should emit prep phase with leaderboard', async () => {
    const mockQuestions = [
      { question: 'Q1', options: ['A', 'B'], correctIndex: 0, category: 'Science', difficulty: 'easy' }
    ];
    game.questions = mockQuestions;
    game.currentQuestionIndex = -1;
    
    const mockState = {
      players: {
        'p1': { uuid: 'p1', name: 'Alice', role: 'player', score: 100, hasAnswered: true, lastAnswerCorrect: true, answerTime: 1000, questionStartTime: 500 },
        'p2': { uuid: 'p2', name: 'Bob', role: 'player', score: 50 },
        'h1': { uuid: 'h1', name: 'Host', role: 'host', score: 0 }
      }
    };
    
    mockRepo.getState.mockResolvedValue(mockState);
    mockCalculator.calculate.mockReturnValue(500);

    await game.prepareNextQuestion();

    expect(mockBus.emit).toHaveBeenCalledWith(EventTypes.EVT_PREP_PHASE, expect.objectContaining({
      roomCode,
      category: 'Science',
      difficulty: 'easy',
      questionNumber: 1,
      totalQuestions: 1,
      resultTime: 5
    }));
    
    // Verify leaderboard structure and filtering
    const prepCall = mockBus.emit.mock.calls.find(call => call[0] === EventTypes.EVT_PREP_PHASE);
    expect(prepCall[1].leaderboard).toHaveLength(2);
    expect(prepCall[1].leaderboard.find(p => p.name === 'Host')).toBeUndefined();
    expect(prepCall[1].leaderboard).toEqual(expect.arrayContaining([
      expect.objectContaining({ 
        name: 'Alice', 
        uuid: 'p1',
        score: expect.any(Number),
        currentRoundScore: expect.any(Number)
      }),
      expect.objectContaining({ 
        name: 'Bob', 
        uuid: 'p2',
        score: 50
      })
    ]));
  });

  test('should start question and emit with correct data', async () => {
    game.currentQuestion = {
      question: 'What is 2+2?',
      options: ['3', '4', '5', '6'],
      category: 'Math',
      difficulty: 'easy',
      correctIndex: 1
    };

    await game.startQuestion();

    expect(game.questionStartTime).toBeDefined();
    expect(mockBus.emit).toHaveBeenCalledWith(EventTypes.EVT_NEXT_QUESTION, expect.objectContaining({
      roomCode,
      question: 'What is 2+2?',
      options: ['3', '4', '5', '6'],
      category: 'Math',
      difficulty: 'easy'
    }));
  });

  test('should prevent double answering', async () => {
    game.currentQuestion = { correctIndex: 0 };
    game.questionStartTime = Date.now() - 5000;
    
    const mockState = {
      players: {
        'p1': { uuid: 'p1', name: 'Alice', hasAnswered: true, score: 100 }
      }
    };
    
    mockRepo.getState.mockResolvedValue(mockState);

    await game.handleAnswer('p1', 0);

    // Should not emit answer accepted if already answered
    expect(mockBus.emit).not.toHaveBeenCalledWith(EventTypes.EVT_ANSWER_ACCEPTED, expect.any(Object));
  });

  test('should calculate potential points correctly for client feedback', async () => {
    game.currentQuestion = { correctIndex: 0 };
    game.questionStartTime = Date.now() - 2000;
    
    const mockState = {
      players: {
        'p1': { uuid: 'p1', name: 'Alice', score: 0 }
      }
    };
    
    mockRepo.getState.mockResolvedValue(mockState);
    mockCalculator.calculate.mockReturnValue(750);

    await game.handleAnswer('p1', 0);

    expect(mockCalculator.calculate).toHaveBeenCalled();
    expect(mockBus.emit).toHaveBeenCalledWith(EventTypes.EVT_ANSWER_ACCEPTED, expect.objectContaining({
      playerUuid: 'p1',
      isCorrect: true,
      points: 750
    }));
  });

  test('should reveal results with player scores', async () => {
    game.currentQuestion = { correctIndex: 1, options: ['A', 'B', 'C', 'D'] };
    
    const mockState = {
      players: {
        'p1': { uuid: 'p1', name: 'Alice', role: 'player', score: 0, hasAnswered: true, lastAnswerCorrect: true, answerTime: 2000, questionStartTime: 1000 },
        'p2': { uuid: 'p2', name: 'Bob', role: 'player', score: 0, hasAnswered: true, lastAnswerCorrect: false, answerTime: 3000, questionStartTime: 1000 }
      }
    };
    
    mockRepo.getState.mockResolvedValue(mockState);
    mockCalculator.calculate.mockReturnValueOnce(800).mockReturnValueOnce(0);

    await game.revealResults();

    expect(mockBus.emit).toHaveBeenCalledWith(EventTypes.EVT_QUESTION_RESULTS, expect.objectContaining({
      roomCode,
      correctIndex: 1,
      playerScoresThisRound: {
        'p1': 800,
        'p2': 0
      }
    }));
  });

  test('should return current game state for reconnection', () => {
    game.isGameActive = true;
    game.currentQuestionIndex = 2;
    game.questions = [{ q: '1' }, { q: '2' }, { q: '3' }];
    game.questionStartTime = 12345;
    game.currentQuestion = {
      question: 'Test Q',
      options: ['A', 'B'],
      category: 'Test',
      difficulty: 'easy'
    };

    const state = game.getCurrentState();

    expect(state).toEqual({
      isGameActive: true,
      currentQuestionIndex: 2,
      totalQuestions: 3,
      questionStartTime: 12345,
      currentQuestion: {
        question: 'Test Q',
        options: ['A', 'B'],
        category: 'Test',
        difficulty: 'easy'
      },
      gameConfig: expect.any(Object)
    });
  });

  test('should handle game already active', async () => {
    game.isGameActive = true;
    const mockQuestions = [{ question: 'Q1', options: ['A', 'B'], correctIndex: 0 }];
    mockProvider.getQuestions.mockResolvedValue(mockQuestions);

    await game.startGame();

    // Should not fetch questions again if game is already active
    expect(mockProvider.getQuestions).not.toHaveBeenCalled();
  });

  test('should clear timers on cleanup', () => {
    const timer1 = setTimeout(() => {}, 1000);
    const timer2 = setTimeout(() => {}, 2000);
    game.timers = [timer1, timer2];

    game._clearTimers();

    expect(game.timers).toHaveLength(0);
  });

  // ========== PHASE 1: Event Listener Branch Tests ==========
  
  test('should ignore CMD_START_GAME with wrong room code', async () => {
    const mockQuestions = [{ question: 'Q1', options: ['A', 'B'], correctIndex: 0 }];
    mockProvider.getQuestions.mockResolvedValue(mockQuestions);
    mockRepo.getState.mockResolvedValue({ players: {} });

    game.init();
    
    // Get the event handler
    const startGameHandler = mockBus.on.mock.calls.find(call => call[0] === EventTypes.CMD_START_GAME)[1];
    
    // Call with different room code
    await startGameHandler({ roomCode: 'WRONG', socketId: 'test' });

    // Should not fetch questions or start game
    expect(mockProvider.getQuestions).not.toHaveBeenCalled();
    expect(mockBus.emit).not.toHaveBeenCalledWith(EventTypes.EVT_GAME_STARTED, expect.any(Object));
  });

  test('should ignore CMD_START_GAME with null data', async () => {
    const mockQuestions = [{ question: 'Q1', options: ['A', 'B'], correctIndex: 0 }];
    mockProvider.getQuestions.mockResolvedValue(mockQuestions);

    game.init();
    
    const startGameHandler = mockBus.on.mock.calls.find(call => call[0] === EventTypes.CMD_START_GAME)[1];
    
    await startGameHandler(null);

    expect(mockProvider.getQuestions).not.toHaveBeenCalled();
  });

  test('should ignore CMD_SUBMIT_ANSWER with wrong room code', async () => {
    game.currentQuestion = { correctIndex: 0 };
    game.questionStartTime = Date.now();
    mockRepo.getState.mockResolvedValue({ players: { 'p1': { name: 'Alice' } } });

    game.init();
    
    const submitAnswerHandler = mockBus.on.mock.calls.find(call => call[0] === EventTypes.CMD_SUBMIT_ANSWER)[1];
    
    await submitAnswerHandler({ roomCode: 'WRONG', playerUuid: 'p1', answerIndex: 0 });

    // Should not save state or emit answer accepted
    expect(mockRepo.saveState).not.toHaveBeenCalled();
    expect(mockBus.emit).not.toHaveBeenCalledWith(EventTypes.EVT_ANSWER_ACCEPTED, expect.any(Object));
  });

  test('should ignore CMD_SUBMIT_ANSWER with undefined data', async () => {
    game.init();
    
    const submitAnswerHandler = mockBus.on.mock.calls.find(call => call[0] === EventTypes.CMD_SUBMIT_ANSWER)[1];
    
    await submitAnswerHandler(undefined);

    expect(mockRepo.saveState).not.toHaveBeenCalled();
  });

  test('should ignore CMD_REQUEST_NEXT with wrong room code', async () => {
    game.questions = [{ question: 'Q1', options: ['A', 'B'], correctIndex: 0 }];
    game.currentQuestionIndex = 0;
    mockRepo.getState.mockResolvedValue({ players: {} });

    game.init();
    
    const requestNextHandler = mockBus.on.mock.calls.find(call => call[0] === EventTypes.CMD_REQUEST_NEXT)[1];
    
    await requestNextHandler({ roomCode: 'WRONG' });

    // Should not emit prep phase or show summary
    expect(mockBus.emit).not.toHaveBeenCalledWith(EventTypes.EVT_PREP_PHASE, expect.any(Object));
    expect(mockBus.emit).not.toHaveBeenCalledWith(EventTypes.EVT_SHOW_SUMMARY, expect.any(Object));
  });

  test('should ignore CMD_REQUEST_NEXT with null data', async () => {
    game.init();
    
    const requestNextHandler = mockBus.on.mock.calls.find(call => call[0] === EventTypes.CMD_REQUEST_NEXT)[1];
    
    await requestNextHandler(null);

    expect(mockBus.emit).not.toHaveBeenCalledWith(EventTypes.EVT_PREP_PHASE, expect.any(Object));
  });

  // ========== PHASE 2: Guard Clause and Early Return Tests ==========

  test('should return early from handleAnswer when no current question', async () => {
    game.currentQuestion = null;
    game.questionStartTime = Date.now();
    mockRepo.getState.mockResolvedValue({ players: { 'p1': { name: 'Alice' } } });

    await game.handleAnswer('p1', 0);

    // Should not access repository or emit events
    expect(mockRepo.getState).not.toHaveBeenCalled();
    expect(mockBus.emit).not.toHaveBeenCalledWith(EventTypes.EVT_ANSWER_ACCEPTED, expect.any(Object));
  });

  test('should return early from handleAnswer when no questionStartTime', async () => {
    game.currentQuestion = { correctIndex: 0 };
    game.questionStartTime = null;
    mockRepo.getState.mockResolvedValue({ players: { 'p1': { name: 'Alice' } } });

    await game.handleAnswer('p1', 0);

    expect(mockRepo.getState).not.toHaveBeenCalled();
    expect(mockBus.emit).not.toHaveBeenCalledWith(EventTypes.EVT_ANSWER_ACCEPTED, expect.any(Object));
  });

  test('should return early from handleAnswer when state is null', async () => {
    game.currentQuestion = { correctIndex: 0 };
    game.questionStartTime = Date.now();
    mockRepo.getState.mockResolvedValue(null);

    await game.handleAnswer('p1', 0);

    expect(mockRepo.saveState).not.toHaveBeenCalled();
    expect(mockBus.emit).not.toHaveBeenCalledWith(EventTypes.EVT_ANSWER_ACCEPTED, expect.any(Object));
  });

  test('should return early from handleAnswer when state has no players', async () => {
    game.currentQuestion = { correctIndex: 0 };
    game.questionStartTime = Date.now();
    mockRepo.getState.mockResolvedValue({});

    await game.handleAnswer('p1', 0);

    expect(mockRepo.saveState).not.toHaveBeenCalled();
    expect(mockBus.emit).not.toHaveBeenCalledWith(EventTypes.EVT_ANSWER_ACCEPTED, expect.any(Object));
  });

  test('should return early from handleAnswer when player does not exist', async () => {
    game.currentQuestion = { correctIndex: 0 };
    game.questionStartTime = Date.now();
    mockRepo.getState.mockResolvedValue({ players: { 'p2': { name: 'Bob' } } });

    await game.handleAnswer('p1', 0);

    expect(mockRepo.saveState).not.toHaveBeenCalled();
    expect(mockBus.emit).not.toHaveBeenCalledWith(EventTypes.EVT_ANSWER_ACCEPTED, expect.any(Object));
  });

  test('should return early from revealResults when no currentQuestion', async () => {
    game.currentQuestion = null;
    mockRepo.getState.mockResolvedValue({ players: { 'p1': { name: 'Alice' } } });

    await game.revealResults();

    expect(mockBus.emit).not.toHaveBeenCalledWith(EventTypes.EVT_QUESTION_RESULTS, expect.any(Object));
  });

  test('should handle null state in _updateScoresForRound gracefully', async () => {
    mockRepo.getState.mockResolvedValue(null);

    await game._updateScoresForRound();

    // Should not crash or attempt to save
    expect(mockRepo.saveState).not.toHaveBeenCalled();
  });

  test('should handle missing players in _updateScoresForRound gracefully', async () => {
    mockRepo.getState.mockResolvedValue({});

    await game._updateScoresForRound();

    // Should not crash
    expect(mockRepo.saveState).not.toHaveBeenCalled();
  });

  // ========== PHASE 3: Role & Conditional Logic Branch Tests ==========

  test('should assign 0 points to players who did not answer in _updateScoresForRound', async () => {
    const mockState = {
      players: {
        'p1': { uuid: 'p1', name: 'Alice', role: 'player', score: 100, hasAnswered: false },
        'p2': { uuid: 'p2', name: 'Bob', role: 'player', score: 50, hasAnswered: false }
      }
    };
    
    mockRepo.getState.mockResolvedValue(mockState);

    await game._updateScoresForRound();

    expect(mockRepo.saveState).toHaveBeenCalledWith(roomCode, expect.objectContaining({
      players: expect.objectContaining({
        'p1': expect.objectContaining({
          currentRoundScore: 0,
          score: 100, // Score should not change
          hasAnswered: false
        }),
        'p2': expect.objectContaining({
          currentRoundScore: 0,
          score: 50, // Score should not change
          hasAnswered: false
        })
      })
    }));
  });

  test('should handle mixed answered and unanswered players in _updateScoresForRound', async () => {
    game.currentQuestion = { correctIndex: 1 };
    
    const mockState = {
      players: {
        'p1': { 
          uuid: 'p1', 
          name: 'Alice', 
          role: 'player', 
          score: 0, 
          hasAnswered: true,
          lastAnswerCorrect: true,
          answerTime: 2000,
          questionStartTime: 1000
        },
        'p2': { 
          uuid: 'p2', 
          name: 'Bob', 
          role: 'player', 
          score: 0, 
          hasAnswered: false
        },
        'h1': {
          uuid: 'h1',
          name: 'Host',
          role: 'host',
          score: 0,
          hasAnswered: false
        }
      }
    };
    
    mockRepo.getState.mockResolvedValue(mockState);
    mockCalculator.calculate.mockReturnValue(800);

    await game._updateScoresForRound();

    expect(mockRepo.saveState).toHaveBeenCalledWith(roomCode, expect.objectContaining({
      players: expect.objectContaining({
        'p1': expect.objectContaining({
          currentRoundScore: 800,
          score: 800,
          hasAnswered: false // Reset after processing
        }),
        'p2': expect.objectContaining({
          currentRoundScore: 0,
          score: 0,
          hasAnswered: false
        }),
        'h1': expect.objectContaining({
          // Host should not have currentRoundScore set
          score: 0
        })
      })
    }));
  });

  test('should assign 0 points to players who did not answer in revealResults', async () => {
    game.currentQuestion = { correctIndex: 1, options: ['A', 'B', 'C', 'D'] };
    
    const mockState = {
      players: {
        'p1': { uuid: 'p1', name: 'Alice', role: 'player', score: 0, hasAnswered: false },
        'p2': { uuid: 'p2', name: 'Bob', role: 'player', score: 0, hasAnswered: false }
      }
    };
    
    mockRepo.getState.mockResolvedValue(mockState);

    await game.revealResults();

    expect(mockBus.emit).toHaveBeenCalledWith(EventTypes.EVT_QUESTION_RESULTS, expect.objectContaining({
      roomCode,
      correctIndex: 1,
      playerScoresThisRound: {
        'p1': 0,
        'p2': 0
      }
    }));
  });

  test('should handle mix of answered and unanswered players in revealResults', async () => {
    game.currentQuestion = { correctIndex: 1, options: ['A', 'B', 'C', 'D'] };
    
    const mockState = {
      players: {
        'p1': { 
          uuid: 'p1', 
          name: 'Alice', 
          role: 'player', 
          score: 0, 
          hasAnswered: true,
          lastAnswerCorrect: true,
          answerTime: 2000,
          questionStartTime: 1000
        },
        'p2': { 
          uuid: 'p2', 
          name: 'Bob', 
          role: 'player', 
          score: 0, 
          hasAnswered: false
        },
        'p3': {
          uuid: 'p3',
          name: 'Charlie',
          role: 'player',
          score: 0,
          hasAnswered: true,
          lastAnswerCorrect: false,
          answerTime: 3000,
          questionStartTime: 1000
        }
      }
    };
    
    mockRepo.getState.mockResolvedValue(mockState);
    mockCalculator.calculate
      .mockReturnValueOnce(800) // For p1
      .mockReturnValueOnce(0);   // For p3

    await game.revealResults();

    expect(mockBus.emit).toHaveBeenCalledWith(EventTypes.EVT_QUESTION_RESULTS, expect.objectContaining({
      roomCode,
      correctIndex: 1,
      playerScoresThisRound: {
        'p1': 800,
        'p2': 0,   // Didn't answer
        'p3': 0    // Answered incorrectly
      }
    }));
  });

  test('should handle score accumulation when player score is initially undefined', async () => {
    game.currentQuestion = { correctIndex: 0 };
    
    const mockState = {
      players: {
        'p1': { 
          uuid: 'p1', 
          name: 'Alice', 
          role: 'player', 
          // score is undefined initially
          hasAnswered: true,
          lastAnswerCorrect: true,
          answerTime: 2000,
          questionStartTime: 1000
        }
      }
    };
    
    mockRepo.getState.mockResolvedValue(mockState);
    mockCalculator.calculate.mockReturnValue(500);

    await game._updateScoresForRound();

    expect(mockRepo.saveState).toHaveBeenCalledWith(roomCode, expect.objectContaining({
      players: expect.objectContaining({
        'p1': expect.objectContaining({
          currentRoundScore: 500,
          score: 500 // Should be 0 + 500 when undefined
        })
      })
    }));
  });

  test('should exclude host from leaderboard in prepareNextQuestion with mixed roles', async () => {
    const mockQuestions = [
      { question: 'Q1', options: ['A', 'B'], correctIndex: 0, category: 'Science', difficulty: 'easy' }
    ];
    game.questions = mockQuestions;
    game.currentQuestionIndex = -1;
    
    const mockState = {
      players: {
        'p1': { uuid: 'p1', name: 'Alice', role: 'player', score: 100, currentRoundScore: 50 },
        'p2': { uuid: 'p2', name: 'Bob', role: 'player', score: 75 },
        'h1': { uuid: 'h1', name: 'Host', role: 'host', score: 0 },
        'p3': { uuid: 'p3', name: 'Charlie', role: 'player', score: 90 }
      }
    };
    
    mockRepo.getState.mockResolvedValue(mockState);

    await game.prepareNextQuestion();

    const prepCall = mockBus.emit.mock.calls.find(call => call[0] === EventTypes.EVT_PREP_PHASE);
    expect(prepCall).toBeDefined();
    expect(prepCall[1].leaderboard).toHaveLength(3);
    expect(prepCall[1].leaderboard.find(p => p.name === 'Host')).toBeUndefined();
    expect(prepCall[1].leaderboard.find(p => p.name === 'Alice')).toBeDefined();
    expect(prepCall[1].leaderboard.find(p => p.name === 'Bob')).toBeDefined();
    expect(prepCall[1].leaderboard.find(p => p.name === 'Charlie')).toBeDefined();
  });

  // ========== PHASE 4: Timer Callback Edge Cases ==========

  test('should handle elimination timer firing when currentQuestion is null', async () => {
    jest.useFakeTimers();
    
    game.currentQuestion = { options: ['A', 'B', 'C', 'D'], correctIndex: 0 };
    game._setupEliminationTimers();
    
    // Clear currentQuestion before timer fires
    game.currentQuestion = null;
    
    // Advance to first elimination time (8.5s)
    jest.advanceTimersByTime(8500);
    
    // Should not emit or crash
    expect(mockBus.emit).not.toHaveBeenCalledWith(EventTypes.EVT_ELIMINATE_OPTION, expect.any(Object));
    
    jest.useRealTimers();
  });

  test('should handle elimination timer with edge case array bounds', async () => {
    jest.useFakeTimers();
    
    // Question with only 2 options (1 incorrect)
    game.currentQuestion = { options: ['A', 'B'], correctIndex: 0 };
    game._setupEliminationTimers();
    
    // Three elimination timers are set, but only 1 incorrect answer exists
    // Advance through all three elimination marks
    jest.advanceTimersByTime(8500);  // First elimination
    jest.advanceTimersByTime(2500);  // Second elimination (should guard against undefined)
    jest.advanceTimersByTime(2500);  // Third elimination (should guard against undefined)
    
    // Should only emit once (for the one incorrect option)
    const eliminateCalls = mockBus.emit.mock.calls.filter(call => call[0] === EventTypes.EVT_ELIMINATE_OPTION);
    expect(eliminateCalls.length).toBeLessThanOrEqual(1);
    
    jest.useRealTimers();
  });

  test('should call endGame when revealResults timer fires on last question', async () => {
    jest.useFakeTimers();
    
    game.questions = [
      { question: 'Q1', options: ['A', 'B'], correctIndex: 0 }
    ];
    game.currentQuestionIndex = 0; // Last question (index 0, length 1)
    game.currentQuestion = game.questions[0];
    
    mockRepo.getState.mockResolvedValue({ players: {} });
    
    const endGameSpy = jest.spyOn(game, 'endGame').mockImplementation(async () => {});
    
    await game.revealResults();
    
    // Advance timer by 5 seconds (reveal screen duration)
    jest.advanceTimersByTime(5000);
    
    // Should have called endGame
    expect(endGameSpy).toHaveBeenCalled();
    expect(mockBus.emit).not.toHaveBeenCalledWith(EventTypes.CMD_REQUEST_NEXT, expect.any(Object));
    
    endGameSpy.mockRestore();
    jest.useRealTimers();
  });

  test('should emit CMD_REQUEST_NEXT when revealResults timer fires on non-last question', async () => {
    jest.useFakeTimers();
    
    game.questions = [
      { question: 'Q1', options: ['A', 'B'], correctIndex: 0 },
      { question: 'Q2', options: ['C', 'D'], correctIndex: 1 }
    ];
    game.currentQuestionIndex = 0; // First question (index 0, length 2)
    game.currentQuestion = game.questions[0];
    
    mockRepo.getState.mockResolvedValue({ players: {} });
    
    const endGameSpy = jest.spyOn(game, 'endGame').mockImplementation(async () => {});
    
    await game.revealResults();
    
    // Advance timer by 5 seconds (reveal screen duration)
    jest.advanceTimersByTime(5000);
    
    // Should emit CMD_REQUEST_NEXT, not call endGame
    expect(mockBus.emit).toHaveBeenCalledWith(EventTypes.CMD_REQUEST_NEXT, { roomCode });
    expect(endGameSpy).not.toHaveBeenCalled();
    
    endGameSpy.mockRestore();
    jest.useRealTimers();
  });

  // ========== Additional Tests for Event Listener Success Paths ==========

  test('should call startGame when CMD_START_GAME event is triggered with correct room code', async () => {
    const mockQuestions = [{ question: 'Q1', options: ['A', 'B'], correctIndex: 0 }];
    mockProvider.getQuestions.mockResolvedValue(mockQuestions);
    mockRepo.getState.mockResolvedValue({ players: {} });

    game.init();
    
    const startGameHandler = mockBus.on.mock.calls.find(call => call[0] === EventTypes.CMD_START_GAME)[1];
    
    await startGameHandler({ roomCode, socketId: 'test' });

    expect(mockProvider.getQuestions).toHaveBeenCalled();
    expect(mockBus.emit).toHaveBeenCalledWith(EventTypes.EVT_GAME_STARTED, expect.objectContaining({ roomCode }));
  });

  test('should call handleAnswer when CMD_SUBMIT_ANSWER event is triggered with correct room code', async () => {
    game.currentQuestion = { correctIndex: 0 };
    game.questionStartTime = Date.now();
    mockRepo.getState.mockResolvedValue({
      players: { 'p1': { uuid: 'p1', name: 'Alice', score: 0 } }
    });
    mockCalculator.calculate.mockReturnValue(500);

    game.init();
    
    const submitAnswerHandler = mockBus.on.mock.calls.find(call => call[0] === EventTypes.CMD_SUBMIT_ANSWER)[1];
    
    await submitAnswerHandler({ roomCode, playerUuid: 'p1', answerIndex: 0 });

    expect(mockRepo.saveState).toHaveBeenCalled();
    expect(mockBus.emit).toHaveBeenCalledWith(EventTypes.EVT_ANSWER_ACCEPTED, expect.any(Object));
  });

  test('should call prepareNextQuestion when CMD_REQUEST_NEXT event is triggered with correct room code', async () => {
    game.questions = [{ question: 'Q1', options: ['A', 'B'], correctIndex: 0 }];
    game.currentQuestionIndex = -1;
    mockRepo.getState.mockResolvedValue({ players: {} });

    game.init();
    
    const requestNextHandler = mockBus.on.mock.calls.find(call => call[0] === EventTypes.CMD_REQUEST_NEXT)[1];
    
    await requestNextHandler({ roomCode });

    expect(mockBus.emit).toHaveBeenCalledWith(EventTypes.EVT_PREP_PHASE, expect.any(Object));
  });

  test('should handle endGame timer callback to delete room', async () => {
    jest.useFakeTimers();
    
    mockRepo.getState.mockResolvedValue({ players: {} });
    mockRepo.deleteRoom = jest.fn().mockResolvedValue();
    
    await game.endGame();
    
    // endGame first emits EVT_SHOW_SUMMARY
    expect(mockBus.emit).toHaveBeenCalledWith(EventTypes.EVT_SHOW_SUMMARY, expect.any(Object));
    
    // deleteRoom should not be called yet
    expect(mockRepo.deleteRoom).not.toHaveBeenCalled();
    
    // Advance timer by summaryScreenTime (default 10 seconds)
    jest.advanceTimersByTime(10000);
    
    // After timer fires, it should delete room (covers lines 314-316)
    expect(mockRepo.deleteRoom).toHaveBeenCalledWith(roomCode);
    
    jest.useRealTimers();
  });
});
