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

    await game.nextQuestion();
    expect(game.currentQuestionIndex).toBe(1);
    expect(mockBus.emit).toHaveBeenCalledWith(EventTypes.EVT_GAME_OVER, expect.any(Object));
  });

  test('should handle elimination timers', async () => {
    jest.useFakeTimers();
    game.currentQuestion = { options: ['A', 'B', 'C', 'D'], correctIndex: 0 };
    
    game._setupEliminationTimers();
    
    expect(game.timers).toHaveLength(4);
    
    jest.advanceTimersByTime(2501);
    expect(mockBus.emit).toHaveBeenCalledWith(EventTypes.EVT_ELIMINATE_OPTION, expect.any(Object));
    
    jest.advanceTimersByTime(7500);
    expect(mockBus.emit).toHaveBeenCalledWith(EventTypes.EVT_QUESTION_RESULTS, expect.any(Object));

    jest.useRealTimers();
  });
});
