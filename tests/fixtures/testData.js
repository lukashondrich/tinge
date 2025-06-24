// Test fixtures and mock data for all test suites

const mockOpenAIResponses = {
  token: {
    success: {
      client_secret: {
        value: 'sk-test-token-123456789',
        expires_at: Date.now() + 3600000
      },
      model: 'gpt-4o-realtime-preview-2024-12-17',
      voice: 'verse'
    },
    error401: {
      error: {
        message: 'Incorrect API key provided',
        type: 'invalid_request_error',
        code: 'invalid_api_key'
      }
    },
    error429: {
      error: {
        message: 'Rate limit exceeded',
        type: 'rate_limit_error',
        code: 'rate_limit'
      }
    }
  },
  
  transcription: {
    success: {
      text: "Hello world, this is a test transcription.",
      words: [
        { word: "Hello", start: 0.0, end: 0.5 },
        { word: "world", start: 0.6, end: 1.0 },
        { word: "this", start: 1.2, end: 1.4 },
        { word: "is", start: 1.5, end: 1.7 },
        { word: "a", start: 1.8, end: 1.9 },
        { word: "test", start: 2.0, end: 2.3 },
        { word: "transcription", start: 2.4, end: 3.0 }
      ],
      duration: 3.0
    },
    
    shortPhrase: {
      text: "Yes please",
      words: [
        { word: "Yes", start: 0.0, end: 0.3 },
        { word: "please", start: 0.4, end: 0.8 }
      ],
      duration: 0.8
    },
    
    longSentence: {
      text: "I would like to have a comprehensive conversation about artificial intelligence and machine learning technologies.",
      words: [
        { word: "I", start: 0.0, end: 0.1 },
        { word: "would", start: 0.2, end: 0.4 },
        { word: "like", start: 0.5, end: 0.7 },
        { word: "to", start: 0.8, end: 0.9 },
        { word: "have", start: 1.0, end: 1.2 },
        { word: "a", start: 1.3, end: 1.4 },
        { word: "comprehensive", start: 1.5, end: 2.2 },
        { word: "conversation", start: 2.3, end: 3.0 },
        { word: "about", start: 3.1, end: 3.4 },
        { word: "artificial", start: 3.5, end: 4.1 },
        { word: "intelligence", start: 4.2, end: 4.9 },
        { word: "and", start: 5.0, end: 5.1 },
        { word: "machine", start: 5.2, end: 5.6 },
        { word: "learning", start: 5.7, end: 6.1 },
        { word: "technologies", start: 6.2, end: 7.0 }
      ],
      duration: 7.0
    }
  }
};

const mockEmbeddings = {
  commonWords: {
    'hello': Array.from({ length: 384 }, (_, i) => Math.sin(i * 0.1) * 0.5),
    'world': Array.from({ length: 384 }, (_, i) => Math.cos(i * 0.1) * 0.5),
    'test': Array.from({ length: 384 }, (_, i) => Math.sin(i * 0.2) * 0.3),
    'the': Array.from({ length: 384 }, (_, i) => Math.cos(i * 0.05) * 0.2),
    'and': Array.from({ length: 384 }, (_, i) => Math.sin(i * 0.05) * 0.2),
    'is': Array.from({ length: 384 }, (_, i) => Math.cos(i * 0.15) * 0.1),
    'a': Array.from({ length: 384 }, (_, i) => Math.sin(i * 0.03) * 0.1)
  },
  
  specialCharacters: {
    'café': Array.from({ length: 384 }, (_, i) => Math.sin(i * 0.3) * 0.4),
    '世界': Array.from({ length: 384 }, (_, i) => Math.cos(i * 0.3) * 0.4),
    'emoji🌟': Array.from({ length: 384 }, (_, i) => Math.sin(i * 0.4) * 0.3),
    'hyphen-word': Array.from({ length: 384 }, (_, i) => Math.cos(i * 0.25) * 0.3),
    "apostrophe's": Array.from({ length: 384 }, (_, i) => Math.sin(i * 0.35) * 0.25)
  }
};

const mockConversations = {
  simple: [
    {
      id: 'conv1-msg1',
      speaker: 'user',
      text: 'Hello there',
      words: ['Hello', 'there'],
      timestamp: Date.now() - 10000,
      audioBlob: null
    },
    {
      id: 'conv1-msg2',
      speaker: 'ai',
      text: 'Hi! How can I help you today?',
      words: ['Hi', 'How', 'can', 'I', 'help', 'you', 'today'],
      timestamp: Date.now() - 8000,
      audioBlob: null
    },
    {
      id: 'conv1-msg3',
      speaker: 'user',
      text: 'I would like to test the system',
      words: ['I', 'would', 'like', 'to', 'test', 'the', 'system'],
      timestamp: Date.now() - 5000,
      audioBlob: null
    }
  ],
  
  complex: [
    {
      id: 'conv2-msg1',
      speaker: 'user',
      text: 'Can you explain machine learning to me?',
      words: ['Can', 'you', 'explain', 'machine', 'learning', 'to', 'me'],
      timestamp: Date.now() - 20000,
      audioBlob: null
    },
    {
      id: 'conv2-msg2',
      speaker: 'ai',
      text: 'Machine learning is a subset of artificial intelligence that enables computers to learn and make decisions from data without being explicitly programmed.',
      words: [
        'Machine', 'learning', 'is', 'a', 'subset', 'of', 'artificial', 
        'intelligence', 'that', 'enables', 'computers', 'to', 'learn', 
        'and', 'make', 'decisions', 'from', 'data', 'without', 'being', 
        'explicitly', 'programmed'
      ],
      timestamp: Date.now() - 18000,
      audioBlob: null
    }
  ]
};

const mockAudioData = {
  validWavHeader: Buffer.from([
    0x52, 0x49, 0x46, 0x46, // RIFF
    0x24, 0x08, 0x00, 0x00, // File size
    0x57, 0x41, 0x56, 0x45, // WAVE
    0x66, 0x6D, 0x74, 0x20, // fmt 
    0x10, 0x00, 0x00, 0x00, // fmt chunk size
    0x01, 0x00, 0x01, 0x00, // PCM, mono
    0x44, 0xAC, 0x00, 0x00, // 44100 Hz
    0x88, 0x58, 0x01, 0x00, // Byte rate
    0x02, 0x00, 0x10, 0x00, // Block align, bits per sample
    0x64, 0x61, 0x74, 0x61, // data
    0x00, 0x08, 0x00, 0x00  // data size
  ]),
  
  shortAudioBuffer: Buffer.alloc(1024, 0), // 1KB of silent audio
  mediumAudioBuffer: Buffer.alloc(8192, 0), // 8KB of silent audio
  
  generateSineWave: (frequency = 440, duration = 1, sampleRate = 44100) => {
    const samples = Math.floor(duration * sampleRate);
    const buffer = Buffer.alloc(samples * 2); // 16-bit samples
    
    for (let i = 0; i < samples; i++) {
      const sample = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 32767;
      buffer.writeInt16LE(Math.floor(sample), i * 2);
    }
    
    return buffer;
  }
};

const mockThreeJSObjects = {
  scene: {
    add: jest.fn(),
    remove: jest.fn(),
    traverse: jest.fn(),
    children: []
  },
  
  camera: {
    position: { x: 0, y: 0, z: 5, set: jest.fn() },
    rotation: { x: 0, y: 0, z: 0, set: jest.fn() },
    lookAt: jest.fn(),
    updateProjectionMatrix: jest.fn()
  },
  
  renderer: {
    setSize: jest.fn(),
    render: jest.fn(),
    setPixelRatio: jest.fn(),
    domElement: document.createElement('canvas')
  },
  
  geometry: {
    setAttribute: jest.fn(),
    setIndex: jest.fn(),
    computeBoundingSphere: jest.fn()
  },
  
  material: {
    color: { set: jest.fn() },
    opacity: 1,
    transparent: false
  }
};

const mockStorageData = {
  userProfiles: {
    testUser: {
      id: 'test-user-123',
      name: 'Test User',
      preferences: {
        theme: 'dark',
        language: 'en',
        audioQuality: 'high'
      },
      conversationHistory: [],
      createdAt: Date.now() - 86400000, // 24 hours ago
      lastActive: Date.now() - 3600000   // 1 hour ago
    }
  },
  
  utterances: [
    {
      id: 'utt-1',
      speaker: 'user',
      text: 'Test utterance',
      audioBlob: null,
      timestamp: Date.now() - 5000,
      embeddings: mockEmbeddings.commonWords
    }
  ],
  
  embeddings: mockEmbeddings.commonWords
};

const mockNetworkResponses = {
  successful: {
    status: 200,
    ok: true,
    json: () => Promise.resolve({ success: true }),
    text: () => Promise.resolve('Success')
  },
  
  notFound: {
    status: 404,
    ok: false,
    json: () => Promise.resolve({ error: 'Not found' }),
    text: () => Promise.resolve('Not found')
  },
  
  serverError: {
    status: 500,
    ok: false,
    json: () => Promise.resolve({ error: 'Internal server error' }),
    text: () => Promise.resolve('Internal server error')
  },
  
  networkError: () => Promise.reject(new Error('Network error'))
};

const testUtilities = {
  // Generate random test data
  generateRandomWord: (length = 5) => {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  },
  
  generateRandomSentence: (wordCount = 5) => {
    const words = Array.from({ length: wordCount }, () => testUtilities.generateRandomWord());
    return words.join(' ');
  },
  
  generateWordTimings: (words, totalDuration = 3.0) => {
    const timePerWord = totalDuration / words.length;
    return words.map((word, index) => ({
      word,
      start: index * timePerWord,
      end: (index + 1) * timePerWord
    }));
  },
  
  // Validation helpers
  isValidEmbedding: (embedding) => {
    return Array.isArray(embedding) && 
           embedding.length === 384 && 
           embedding.every(val => typeof val === 'number' && isFinite(val));
  },
  
  isValidTimestamp: (timestamp) => {
    return typeof timestamp === 'number' && 
           timestamp > 0 && 
           timestamp <= Date.now();
  },
  
  isValidAudioBuffer: (buffer) => {
    return Buffer.isBuffer(buffer) && buffer.length > 0;
  },
  
  // Mock setup helpers
  setupMockFetch: (responses = {}) => {
    const mockFetch = jest.fn();
    
    Object.entries(responses).forEach(([key, response]) => {
      if (key === 'default') {
        mockFetch.mockResolvedValue(response);
      } else {
        mockFetch.mockResolvedValueOnce(response);
      }
    });
    
    global.fetch = mockFetch;
    return mockFetch;
  },
  
  createMockFile: (name = 'test.wav', content = mockAudioData.shortAudioBuffer) => {
    const file = new File([content], name, { type: 'audio/wav' });
    Object.defineProperty(file, 'arrayBuffer', {
      value: () => Promise.resolve(content.buffer)
    });
    return file;
  }
};

module.exports = {
  mockOpenAIResponses,
  mockEmbeddings,
  mockConversations,
  mockAudioData,
  mockThreeJSObjects,
  mockStorageData,
  mockNetworkResponses,
  testUtilities
};