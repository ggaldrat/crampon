import Share from 'react-native-share';
import * as RNFS from '@dr.pogodin/react-native-fs';
import {Alert, Platform} from 'react-native';

// const mockDocumentPath = '/mock/documents';
// jest.mock('@dr.pogodin/react-native-fs', () => ({
//   DocumentDirectoryPath: '/mock/documents',
// }));

// Mock the androidPermission module
jest.mock('../androidPermission', () => ({
  ensureLegacyStoragePermission: jest.fn().mockResolvedValue(true),
}));
import {
  exportLegacyChatSessions,
  exportChatSession,
  exportAllChatSessions,
  exportChatSessionAsMarkdown,
} from '../exportUtils';
import {userId} from '../chat';
import {format} from 'date-fns';
import {ensureLegacyStoragePermission} from '../androidPermission';

// Mock dependencies
jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
  },
  Alert: {
    alert: jest.fn(),
  },
}));

// Mock react-native-share
jest.mock('react-native-share', () => ({
  open: jest.fn().mockResolvedValue({success: true}),
}));

jest.mock('@dr.pogodin/react-native-fs', () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue('{"legacy":"data"}'),
  exists: jest.fn().mockResolvedValue(true),
  copyFile: jest.fn().mockResolvedValue(undefined),
  DocumentDirectoryPath: '/mock/document/path',
  CachesDirectoryPath: '/mock/cache/path',
  DownloadDirectoryPath: '/mock/download/path',
}));

jest.mock('date-fns', () => ({
  // Return-only mock with the fixed value the filename tests rely on. Tests
  // that need to assert WHICH date was formatted (export time vs session date)
  // read `format.mock.calls` — `jest.fn()` records arguments regardless of
  // return value.
  format: jest.fn().mockReturnValue('2024-01-01_12-00-00'),
}));

// Import the actual repository to spy on it
import {chatSessionRepository} from '../../repositories/ChatSessionRepository';

jest.mock('../androidPermission', () => ({
  ensureLegacyStoragePermission: jest.fn().mockResolvedValue(true),
}));

// Mock l10n
// jest.mock('../l10n', () => ({
//   l10n: jest.fn(key => key), // Return the key as the translation
// }));

describe('exportUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset all RNFS mocks to their default behavior
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    (RNFS.readFile as jest.Mock).mockResolvedValue('{}');
    (RNFS.writeFile as jest.Mock).mockResolvedValue(undefined);
    (RNFS.copyFile as jest.Mock).mockResolvedValue(undefined);
    (RNFS.DocumentDirectoryPath as string) = '/mock/documents';

    // Reset Share mock
    (Share.open as jest.Mock).mockResolvedValue(undefined);

    // Reset Alert mock
    (Alert.alert as jest.Mock).mockImplementation(() => {});

    // Reset Platform mock to iOS by default
    (Platform as any).OS = 'ios';

    // PermissionsAndroid is handled by individual tests when needed

    // Don't restore all mocks here as it interferes with console.error mocking in error handling tests
  });

  describe('exportLegacyChatSessions', () => {
    it('should export legacy sessions if file exists', async () => {
      // Setup
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(true);
      (RNFS.readFile as jest.Mock).mockResolvedValueOnce('{"sessions": []}');

      // Execute
      await exportLegacyChatSessions();

      // Verify
      expect(RNFS.exists).toHaveBeenCalled();
      expect(RNFS.readFile).toHaveBeenCalled();
      expect(RNFS.writeFile).toHaveBeenCalled();
      expect(Share.open).toHaveBeenCalled();
    });

    it('should throw error if legacy file does not exist', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(false);

      await expect(exportLegacyChatSessions()).rejects.toThrow(
        'Legacy chat sessions file not found',
      );
    });

    it('should handle file read errors', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(true);
      (RNFS.readFile as jest.Mock).mockRejectedValueOnce(
        new Error('File read failed'),
      );

      await expect(exportLegacyChatSessions()).rejects.toThrow(
        'File read failed',
      );
    });
  });

  describe('exportChatSession', () => {
    const mockSessionData = {
      session: {
        id: 'session-1',
        title: 'Test Session',
        date: '2024-01-01T00:00:00Z',
        activePalId: 'pal-1',
      },
      messages: [
        {
          id: 'msg-1',
          author: 'user',
          text: 'Hello',
          type: 'text',
          metadata: '{"test": true}',
          createdAt: 1704067200000,
          // Mimic the WatermelonDB Message model surface used by exportUtils.
          toMessageObject: () => ({
            id: 'msg-1',
            type: 'text',
            text: 'Hello',
            author: {id: 'user'},
            createdAt: 1704067200000,
            metadata: {test: true},
          }),
        },
      ],
      completionSettings: {
        settings: '{"temperature": 0.7}',
      },
    };

    beforeEach(() => {
      // Override the centralized mock's getSessionById method
      chatSessionRepository.getSessionById = jest
        .fn()
        .mockResolvedValue(mockSessionData as any);
    });

    it('should export single chat session successfully', async () => {
      await exportChatSession('session-1');

      expect(chatSessionRepository.getSessionById).toHaveBeenCalledWith(
        'session-1',
      );
      expect(RNFS.writeFile).toHaveBeenCalled();
      expect(Share.open).toHaveBeenCalled();
    });

    it('should throw error if session not found', async () => {
      (chatSessionRepository.getSessionById as jest.Mock).mockResolvedValueOnce(
        null,
      );

      await expect(exportChatSession('nonexistent')).rejects.toThrow(
        'Session not found',
      );
    });

    it('should handle export errors', async () => {
      (RNFS.writeFile as jest.Mock).mockRejectedValueOnce(
        new Error('Write failed'),
      );

      await expect(exportChatSession('session-1')).rejects.toThrow(
        'Write failed',
      );
    });

    it('exports AssistantTurn rows with derivedText (joined step.content) — story Hook test #5', async () => {
      const turnSessionData = {
        session: {
          id: 'session-2',
          title: 'Turn Session',
          date: '2024-01-01T00:00:00Z',
        },
        messages: [
          {
            id: 'msg-turn',
            author: 'assistant',
            text: '', // empty by design for assistant_turn
            type: 'assistant_turn',
            metadata: JSON.stringify({
              copyable: true,
              steps: [{content: 'Let me check'}, {content: 'The answer is 42'}],
            }),
            createdAt: 1704067200000,
            // Real WatermelonDB Message.toMessageObject lifts metadata.steps
            // to top-level — we mirror that here.
            toMessageObject: () => ({
              id: 'msg-turn',
              type: 'assistant_turn',
              author: {id: 'assistant'},
              createdAt: 1704067200000,
              steps: [{content: 'Let me check'}, {content: 'The answer is 42'}],
              metadata: {copyable: true},
            }),
          },
        ],
        completionSettings: null,
      };
      chatSessionRepository.getSessionById = jest
        .fn()
        .mockResolvedValue(turnSessionData as any);

      await exportChatSession('session-2');

      expect(RNFS.writeFile).toHaveBeenCalled();
      const writtenJson = (RNFS.writeFile as jest.Mock).mock.calls[0][1];
      const parsed = JSON.parse(writtenJson);
      expect(parsed.messages).toHaveLength(1);
      expect(parsed.messages[0].type).toBe('assistant_turn');
      // derivedText joins step.content with two newlines.
      expect(parsed.messages[0].text).toBe('Let me check\n\nThe answer is 42');
    });
  });

  describe('exportAllChatSessions', () => {
    const mockSessions = [
      {id: 'session-1', title: 'Session 1', date: '2024-01-01T00:00:00Z'},
      {id: 'session-2', title: 'Session 2', date: '2024-01-02T00:00:00Z'},
    ];

    const mockSessionData = {
      session: mockSessions[0],
      messages: [],
      completionSettings: null,
    };

    beforeEach(() => {
      // Override the centralized mock methods
      chatSessionRepository.getAllSessions = jest
        .fn()
        .mockResolvedValue(mockSessions as any);
      chatSessionRepository.getSessionById = jest
        .fn()
        .mockResolvedValue(mockSessionData as any);
    });

    it('should export all chat sessions successfully', async () => {
      await exportAllChatSessions();

      expect(chatSessionRepository.getAllSessions).toHaveBeenCalled();
      expect(chatSessionRepository.getSessionById).toHaveBeenCalledTimes(2);
      expect(RNFS.writeFile).toHaveBeenCalled();
      expect(Share.open).toHaveBeenCalled();
    });

    it('should handle empty sessions list', async () => {
      (chatSessionRepository.getAllSessions as jest.Mock).mockResolvedValueOnce(
        [],
      );

      await exportAllChatSessions();

      expect(RNFS.writeFile).toHaveBeenCalled();
      expect(Share.open).toHaveBeenCalled();
    });
  });

  describe('Platform-specific behavior', () => {
    it('should handle iOS file sharing', async () => {
      // iOS is already mocked as default
      await exportChatSession('session-1');

      expect(Share.open).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('file://'),
          type: 'application/json',
        }),
      );
    });

    it('should handle Android file sharing with permissions', async () => {
      // Mock Android
      (Platform as any).OS = 'android';
      (ensureLegacyStoragePermission as jest.Mock).mockResolvedValue(true);

      await exportChatSession('session-1');

      expect(ensureLegacyStoragePermission).toHaveBeenCalled();
      expect(RNFS.copyFile).toHaveBeenCalled();
    });

    it('should handle Android permission denial gracefully', async () => {
      (Platform as any).OS = 'android';
      (ensureLegacyStoragePermission as jest.Mock).mockResolvedValue(false);

      await exportChatSession('session-1');

      // Should fall back to direct sharing
      expect(Share.open).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    const mockSessionData = {
      session: {
        id: 'session-1',
        title: 'Test Session',
        date: '2024-01-01T00:00:00Z',
        activePalId: 'pal-1',
      },
      messages: [
        {
          id: 'msg-1',
          author: 'user',
          text: 'Hello',
          type: 'text',
          metadata: '{"test": true}',
          createdAt: 1704067200000,
          // Mimic the WatermelonDB Message model surface used by exportUtils.
          toMessageObject: () => ({
            id: 'msg-1',
            type: 'text',
            text: 'Hello',
            author: {id: 'user'},
            createdAt: 1704067200000,
            metadata: {test: true},
          }),
        },
      ],
      completionSettings: {
        settings: '{"temperature": 0.7}',
      },
    };

    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      // Set up the chat session repository mock for error handling tests
      chatSessionRepository.getSessionById = jest
        .fn()
        .mockResolvedValue(mockSessionData as any);
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('should handle share errors gracefully', async () => {
      (Share.open as jest.Mock).mockRejectedValue(new Error('Share failed'));

      await expect(exportChatSession('session-1')).rejects.toThrow();
      expect(Alert.alert).toHaveBeenCalledWith(
        expect.stringContaining('Export Error'),
        expect.stringContaining('export'),
        expect.any(Array),
      );
    });

    it('should handle file write errors', async () => {
      (RNFS.writeFile as jest.Mock).mockRejectedValue(new Error('Disk full'));

      await expect(exportChatSession('session-1')).rejects.toThrow('Disk full');
      expect(console.error).toHaveBeenCalledWith(
        'Error sharing JSON data:',
        expect.any(Error),
      );
    });

    it('should handle copy file errors on Android gracefully', async () => {
      // Set up Android environment (not API 29) with granted permissions
      (Platform as any).OS = 'android';
      (Platform as any).Version = 28; // Not API 29

      // Mock the androidPermission module to return true (permission granted)
      (ensureLegacyStoragePermission as jest.Mock).mockResolvedValueOnce(true);

      // Mock copyFile to fail
      (RNFS.copyFile as jest.Mock).mockRejectedValue(new Error('Copy failed'));

      // The function should handle the error gracefully, not throw
      await exportChatSession('session-1');

      // Verify that copyFile was attempted
      expect(RNFS.copyFile).toHaveBeenCalled();

      // Verify that Alert.alert was called to show the error to the user
      expect(Alert.alert).toHaveBeenCalledWith(
        expect.any(String), // Save options title
        expect.any(String), // Save options message
        expect.any(Array), // Buttons array
      );
    });
  });

  describe('exportChatSessionAsMarkdown', () => {
    // `createdAt` ascends with the argument order so fixtures can be written
    // newest-first (see the ordering note on the repository mock below) while
    // still carrying truthful timestamps.
    const makeTextMessage = (
      id: string,
      author: string,
      text: string,
      createdAt = 1704067200000,
    ): any => ({
      id,
      author,
      text,
      type: 'text',
      metadata: null,
      createdAt,
      toMessageObject: () => ({
        id,
        type: 'text',
        text,
        author: {id: author},
        createdAt,
        metadata: {},
      }),
    });

    const writtenMarkdown = () => {
      const call = (RNFS.writeFile as jest.Mock).mock.calls.at(-1);
      return {path: call?.[0] as string, content: call?.[1] as string};
    };

    beforeEach(() => {
      // IMPORTANT: `getSessionById` queries `Q.sortBy('position', Q.desc)` and
      // `addMessageToSession` assigns `highestPosition + 1`, so the real array
      // is NEWEST FIRST — the same convention ChatSessionStore documents
      // ("messages are in reverse order, ie 0 is the latest"). Fixtures must
      // match that order or an ordering bug stays invisible.
      chatSessionRepository.getSessionById = jest.fn().mockResolvedValue({
        session: {
          id: 'session-1',
          title: 'My Chat',
          date: '2024-01-01T00:00:00Z',
          activePalId: null,
        },
        messages: [
          makeTextMessage('m2', 'assistant-1', 'It is 4.', 1704067260000),
          makeTextMessage('m1', userId, 'What is 2+2?', 1704067200000),
        ],
        completionSettings: {settings: '{}'},
      } as any);
    });

    it('writes a .md file and shares it with a markdown mime type', async () => {
      await exportChatSessionAsMarkdown('session-1');

      const {path} = writtenMarkdown();
      expect(path).toMatch(/\.md$/);
      expect(Share.open).toHaveBeenCalledWith(
        expect.objectContaining({type: 'text/markdown'}),
      );
    });

    it('renders the title, headings and message text as markdown', async () => {
      await exportChatSessionAsMarkdown('session-1');

      const {content} = writtenMarkdown();
      expect(content).toContain('# My Chat');
      expect(content).toContain('### User');
      expect(content).toContain('What is 2+2?');
      expect(content).toContain('### Assistant');
      expect(content).toContain('It is 4.');
    });

    it('writes the transcript in chronological order, oldest first', async () => {
      await exportChatSessionAsMarkdown('session-1');

      const {content} = writtenMarkdown();
      // Positional, not membership: `toContain` alone passes in any order.
      expect(content.indexOf('What is 2+2?')).toBeLessThan(
        content.indexOf('It is 4.'),
      );
      expect(content.match(/^### (User|Assistant)$/gm)).toEqual([
        '### User',
        '### Assistant',
      ]);
    });

    it('stamps the export time, not the session creation date', async () => {
      // `session.date` is only ever set at creation and never refreshed, so a
      // chat started years ago must not claim to have been exported then.
      const sessionCreated = '2020-06-15T08:30:00Z';
      (chatSessionRepository.getSessionById as jest.Mock).mockResolvedValueOnce(
        {
          session: {
            id: 'session-old',
            title: 'Old Chat',
            date: sessionCreated,
            activePalId: null,
          },
          messages: [makeTextMessage('m1', userId, 'Hi')],
          completionSettings: {settings: '{}'},
        } as any,
      );

      await exportChatSessionAsMarkdown('session-old');

      // `format` is mocked to a fixed string, so the rendered output cannot
      // reveal which date was used — assert on the argument instead.
      const formattedDates = (format as jest.Mock).mock.calls
        .filter(([, pattern]) => pattern === 'yyyy-MM-dd HH:mm')
        .map(([date]) => (date as Date).toISOString());

      expect(formattedDates).toHaveLength(1);
      expect(formattedDates[0]).not.toBe(
        new Date(sessionCreated).toISOString(),
      );
    });

    it('attributes authorship by user id rather than message order', async () => {
      // Assistant speaks first here; role must follow the author id.
      (chatSessionRepository.getSessionById as jest.Mock).mockResolvedValueOnce(
        {
          session: {
            id: 'session-2',
            title: 'Greeting',
            date: '2024-01-01T00:00:00Z',
            activePalId: null,
          },
          // Newest first: the Pal's greeting is the OLDEST message here, so it
          // sits last in the repository's array and first in the transcript.
          messages: [
            makeTextMessage('m2', userId, 'Hello.', 1704067260000),
            makeTextMessage('m1', 'assistant-1', 'Hi there!', 1704067200000),
          ],
          completionSettings: {settings: '{}'},
        } as any,
      );

      await exportChatSessionAsMarkdown('session-2');

      const {content} = writtenMarkdown();
      // A Pal greeting means the assistant legitimately speaks first; role must
      // follow the author id, and the greeting must lead the transcript.
      expect(content.indexOf('Hi there!')).toBeLessThan(
        content.indexOf('Hello.'),
      );
      expect(content.match(/^### (User|Assistant)$/gm)).toEqual([
        '### Assistant',
        '### User',
      ]);
    });

    it('exports assistant_turn content, whose text column is empty by design', async () => {
      (chatSessionRepository.getSessionById as jest.Mock).mockResolvedValueOnce(
        {
          session: {
            id: 'session-3',
            title: 'Turn Based',
            date: '2024-01-01T00:00:00Z',
            activePalId: null,
          },
          messages: [
            {
              id: 'm1',
              author: 'assistant-1',
              text: '',
              type: 'assistant_turn',
              metadata: null,
              createdAt: 1704067200000,
              toMessageObject: () => ({
                id: 'm1',
                type: 'assistant_turn',
                author: {id: 'assistant-1'},
                createdAt: 1704067200000,
                metadata: {},
                steps: [{content: 'First part.'}, {content: 'Second part.'}],
              }),
            },
          ],
          completionSettings: {settings: '{}'},
        } as any,
      );

      await exportChatSessionAsMarkdown('session-3');

      const {content} = writtenMarkdown();
      expect(content).toContain('First part.');
      expect(content).toContain('Second part.');
    });

    it('collapses a multi-line title so it stays a single heading', async () => {
      // Titles are derived from the user's first message, so they can contain
      // newlines — and a `#` starting the second line shifts the structure.
      (chatSessionRepository.getSessionById as jest.Mock).mockResolvedValueOnce(
        {
          session: {
            id: 'session-4',
            title: 'Multi\nline # title',
            date: '2024-01-01T00:00:00Z',
            activePalId: null,
          },
          messages: [makeTextMessage('m1', userId, 'Hi')],
          completionSettings: {settings: '{}'},
        } as any,
      );

      await exportChatSessionAsMarkdown('session-4');

      const {content} = writtenMarkdown();
      expect(content).toContain('# Multi line # title');
      expect(content.match(/^#[^#]/gm)).toHaveLength(1);
    });

    it('notes attached images instead of dropping them silently', async () => {
      const withImages = makeTextMessage('m1', userId, 'Look at this');
      // `toExportedMessage` reads the raw `metadata` column, not the in-memory
      // object, so the URIs have to be on the JSON string.
      withImages.metadata = JSON.stringify({
        imageUris: ['file:///a.png', 'file:///b.png'],
      });
      (chatSessionRepository.getSessionById as jest.Mock).mockResolvedValueOnce(
        {
          session: {
            id: 'session-5',
            title: 'With Images',
            date: '2024-01-01T00:00:00Z',
            activePalId: null,
          },
          messages: [withImages],
          completionSettings: {settings: '{}'},
        } as any,
      );

      await exportChatSessionAsMarkdown('session-5');

      const {content} = writtenMarkdown();
      // One note per attachment, none dropped silently.
      const noteCount = content.split('_[image]_').length - 1;
      expect(noteCount).toBe(2);
      // The note follows the text it belongs to, inside the same section.
      expect(content.indexOf('Look at this')).toBeLessThan(
        content.indexOf('_[image]_'),
      );
      // The on-device temp URI must never leak into a shared transcript.
      expect(content).not.toContain('file:///a.png');
      expect(content).not.toContain('file:///b.png');
    });

    it('throws when the session does not exist', async () => {
      (chatSessionRepository.getSessionById as jest.Mock).mockResolvedValueOnce(
        null,
      );

      await expect(exportChatSessionAsMarkdown('nonexistent')).rejects.toThrow(
        'Session not found',
      );
    });

    it('still shares the JSON export as application/json', async () => {
      // The mimeType parameter defaults, so the existing export is unchanged.
      await exportChatSession('session-1');

      expect(Share.open).toHaveBeenCalledWith(
        expect.objectContaining({type: 'application/json'}),
      );
    });
  });
});
