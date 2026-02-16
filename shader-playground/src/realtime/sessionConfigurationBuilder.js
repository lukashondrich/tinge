const SESSION_TOOLS = [
  {
    type: 'function',
    name: 'get_user_profile',
    description: 'Retrieve the user\'s current learning profile to personalize the tutoring session.',
    parameters: {
      type: 'object',
      properties: {
        user_id: {
          type: 'string',
          description: 'The user\'s unique identifier'
        }
      },
      required: ['user_id']
    }
  },
  {
    type: 'function',
    name: 'update_user_profile',
    description: 'Update the user\'s learning profile with new session insights.',
    parameters: {
      type: 'object',
      properties: {
        user_id: {
          type: 'string',
          description: 'The user\'s unique identifier'
        },
        updates: {
          type: 'object',
          properties: {
            reference_language: {
              type: 'string',
              description: 'Learner\'s native or strongest language'
            },
            l1: {
              type: 'object',
              description: 'Primary target language updates',
              properties: {
                language: { type: 'string' },
                level: {
                  type: 'string',
                  enum: [
                    'beginner',
                    'elementary',
                    'intermediate',
                    'upper-intermediate',
                    'advanced',
                    'proficient'
                  ]
                },
                mistake_patterns: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      type: {
                        type: 'string',
                        enum: ['grammar', 'vocabulary', 'pronunciation', 'pragmatics', 'fluency']
                      },
                      specific: { type: 'string' },
                      example: { type: 'string' }
                    }
                  }
                },
                mastery_updates: {
                  type: 'object',
                  properties: {
                    learned: { type: 'array', items: { type: 'string' } },
                    struggling: { type: 'array', items: { type: 'string' } },
                    forgotten: { type: 'array', items: { type: 'string' } }
                  }
                },
                specific_goals: { type: 'array', items: { type: 'string' } }
              }
            },
            l2: {
              type: 'object',
              description: 'Secondary target language updates (optional)'
            },
            l3: {
              type: 'object',
              description: 'Tertiary target language updates (optional)'
            },
            learning_style: {
              type: 'object',
              properties: {
                correction_style: {
                  type: 'string',
                  enum: ['gentle', 'direct', 'delayed', 'implicit', 'explicit']
                },
                challenge_level: {
                  type: 'string',
                  enum: ['comfortable', 'moderate', 'challenging']
                },
                session_structure: {
                  type: 'string',
                  enum: ['structured', 'flexible', 'conversation-focused', 'task-based']
                },
                cultural_learning_interests: { type: 'array', items: { type: 'string' } }
              }
            },
            personal_context: {
              type: 'object',
              properties: {
                goals_and_timeline: {
                  type: 'object',
                  properties: {
                    short_term: { type: 'string' },
                    long_term: { type: 'string' },
                    timeline: { type: 'string' }
                  }
                },
                immediate_needs: { type: 'array', items: { type: 'string' } },
                motivation_sources: { type: 'array', items: { type: 'string' } }
              }
            },
            communication_patterns: {
              type: 'object',
              properties: {
                conversation_starters: { type: 'array', items: { type: 'string' } },
                humor_style: { type: 'string' },
                cultural_background: { type: 'string' },
                professional_context: { type: 'string' }
              }
            },
            practical_usage: {
              type: 'object',
              properties: {
                social_connections: { type: 'array', items: { type: 'string' } },
                geographic_relevance: { type: 'string' }
              }
            },
            meta_learning: {
              type: 'object',
              properties: {
                strategy_preferences: { type: 'array', items: { type: 'string' } },
                confidence_building_needs: { type: 'array', items: { type: 'string' } }
              }
            },
            conversation_notes: {
              type: 'string',
              description: 'General observations about the session'
            }
          },
          required: ['user_id', 'updates']
        }
      },
      required: ['user_id', 'updates']
    }
  },
  {
    type: 'function',
    name: 'search_knowledge',
    description: 'Search trusted knowledge snippets for factual questions and provide source metadata for citations.',
    parameters: {
      type: 'object',
      properties: {
        query_original: {
          type: 'string',
          description: 'Original query in the user\'s language.'
        },
        query_en: {
          type: 'string',
          description: 'English translation/paraphrase of query_original for EN-only retrieval.'
        },
        language: {
          type: 'string',
          enum: ['en'],
          description: 'Document language filter. Use "en".'
        },
        top_k: {
          type: 'integer',
          minimum: 1,
          maximum: 10,
          description: 'Number of top results to return.'
        }
      },
      required: ['query_original', 'query_en']
    }
  }
];

const SESSION_SEMANTIC_VAD_CONFIG = Object.freeze({
  type: 'semantic_vad',
  eagerness: 'low',
  create_response: true,
  interrupt_response: false
});

function cloneTools() {
  return JSON.parse(JSON.stringify(SESSION_TOOLS));
}

export function buildSessionUpdate({ enableSemanticVad = false } = {}) {
  return {
    type: 'session.update',
    session: {
      input_audio_transcription: { model: 'gpt-4o-mini-transcribe' },
      turn_detection: enableSemanticVad ? { ...SESSION_SEMANTIC_VAD_CONFIG } : null,
      tools: cloneTools()
    }
  };
}
