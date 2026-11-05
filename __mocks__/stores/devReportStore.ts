export const mockDevReportStore = {
  enabled: true,
  includeConversations: true,
  installId: 'test-install',
  setEnabled: jest.fn(),
  setIncludeConversations: jest.fn(),
  report: jest.fn(),
  reportError: jest.fn(),
  startAnswer: jest.fn(),
  noteTool: jest.fn(),
  finishAnswer: jest.fn(),
  failAnswer: jest.fn(),
  flush: jest.fn(),
};
