import {appSchema, tableSchema} from '@nozbe/watermelondb';

export default appSchema({
  version: 9,
  tables: [
    tableSchema({
      name: 'chat_sessions',
      columns: [
        {name: 'title', type: 'string'},
        {name: 'date', type: 'string'},
        {name: 'active_pal_id', type: 'string', isOptional: true},
        {name: 'settings_source', type: 'string', isOptional: true},
        {name: 'pinned', type: 'boolean'},
        {name: 'created_at', type: 'number'},
        {name: 'updated_at', type: 'number'},
      ],
    }),
    tableSchema({
      name: 'messages',
      columns: [
        {name: 'session_id', type: 'string', isIndexed: true},
        {name: 'author', type: 'string'},
        {name: 'text', type: 'string', isOptional: true},
        {name: 'type', type: 'string'},
        {name: 'created_at', type: 'number'},
        {name: 'metadata', type: 'string'}, // JSON stringified
        {name: 'position', type: 'number'}, // For ordering
      ],
    }),
    tableSchema({
      name: 'completion_settings',
      columns: [
        {name: 'session_id', type: 'string', isIndexed: true},
        {name: 'settings', type: 'string'}, // JSON stringified
        {name: 'created_at', type: 'number'},
        {name: 'updated_at', type: 'number'},
      ],
    }),
    tableSchema({
      name: 'global_settings',
      columns: [
        {name: 'key', type: 'string', isIndexed: true},
        {name: 'value', type: 'string'}, // JSON stringified
        {name: 'created_at', type: 'number'},
        {name: 'updated_at', type: 'number'},
      ],
    }),
    // Local Pals table for unified pal storage
    tableSchema({
      name: 'local_pals',
      columns: [
        {name: 'name', type: 'string'},
        {name: 'description', type: 'string', isOptional: true},
        {name: 'thumbnail_url', type: 'string', isOptional: true},
        {name: 'system_prompt', type: 'string'},
        {name: 'original_system_prompt', type: 'string', isOptional: true},
        {name: 'is_system_prompt_changed', type: 'boolean'},
        {name: 'use_ai_prompt', type: 'boolean'},
        {name: 'default_model', type: 'string', isOptional: true}, // JSON stringified
        {name: 'prompt_generation_model', type: 'string', isOptional: true}, // JSON stringified
        {name: 'generating_prompt', type: 'string', isOptional: true},
        {name: 'color', type: 'string', isOptional: true}, // JSON stringified [string, string]
        {name: 'capabilities', type: 'string'}, // JSON stringified PalCapabilities
        {name: 'parameters', type: 'string'}, // JSON stringified Record<string, any>
        {name: 'parameter_schema', type: 'string'}, // JSON stringified ParameterDefinition[]
        {name: 'source', type: 'string'}, // 'local' | 'palshub'
        {name: 'palshub_id', type: 'string', isOptional: true},
        {name: 'creator_info', type: 'string', isOptional: true}, // JSON stringified
        {name: 'categories', type: 'string', isOptional: true}, // JSON stringified string[]
        {name: 'tags', type: 'string', isOptional: true}, // JSON stringified string[]
        {name: 'rating', type: 'number', isOptional: true},
        {name: 'review_count', type: 'number', isOptional: true},
        {name: 'protection_level', type: 'string', isOptional: true},
        {name: 'price_cents', type: 'number', isOptional: true},
        {name: 'is_owned', type: 'boolean', isOptional: true},
        {name: 'generation_settings', type: 'string', isOptional: true}, // JSON stringified
        {name: 'pact', type: 'string', isOptional: true}, // JSON stringified { talents: TalentRef[] }
        {name: 'greeting', type: 'string', isOptional: true}, // JSON stringified Pal['greeting']
        {name: 'created_at', type: 'number'},
        {name: 'updated_at', type: 'number'},
      ],
    }),
  ],
});
