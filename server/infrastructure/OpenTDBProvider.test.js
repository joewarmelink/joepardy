/**
 * OpenTDBProvider.test.js
 * 
 * Tests for the OpenTDBProvider, which fetches trivia questions
 * from the Open Trivia Database API and maps them to our internal model.
 */

const OpenTDBProvider = require('./OpenTDBProvider');

describe('OpenTDBProvider', () => {
  let provider;
  let mockFetch;

  beforeEach(() => {
    // We'll mock the global fetch to avoid making real network calls
    mockFetch = jest.fn();
    global.fetch = mockFetch;
    provider = new OpenTDBProvider();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should fetch and format questions from OTDB', async () => {
    const mockApiResponse = {
      response_code: 0,
      results: [{
        category: 'Science',
        type: 'multiple',
        difficulty: 'medium',
        question: 'What is the speed of light?',
        correct_answer: '299,792,458 m/s',
        incorrect_answers: ['300,000,000 m/s', '150,000,000 m/s', '1,000,000 m/s']
      }]
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockApiResponse
    });

    const questions = await provider.getQuestions();

    expect(questions).toHaveLength(1);

    const q = questions[0];
    expect(q.question).toBe('What is the speed of light?');
    expect(q.options).toHaveLength(4);
    expect(q.options).toContain('299,792,458 m/s');
    expect(q.correctIndex).toBeGreaterThanOrEqual(0);
    expect(q.correctIndex).toBeLessThan(4);
    expect(q.options[q.correctIndex]).toBe('299,792,458 m/s');
  });

  test('should throw error if API response is not ok', async () => {
    mockFetch.mockResolvedValue({
      ok: false
    });

    await expect(provider.getQuestions(1)).rejects.toThrow('Failed to fetch trivia questions');
  });

  test('should handle API response code error', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response_code: 1 }) // 1 = No Results
    });

    await expect(provider.getQuestions(1)).rejects.toThrow('OTDB API returned error code: 1');
  });

  test('should handle empty or null values in _decodeHtml gracefully', async () => {
    const mockApiResponse = {
      response_code: 0,
      results: [{
        category: '',
        type: 'multiple',
        difficulty: 'easy',
        question: 'Test Question',
        correct_answer: 'Answer',
        incorrect_answers: ['Wrong1', 'Wrong2', 'Wrong3']
      }]
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockApiResponse
    });

    const questions = await provider.getQuestions(1);

    expect(questions).toHaveLength(1);
    expect(questions[0].category).toBe('');
    expect(questions[0].question).toBe('Test Question');
  });
});
