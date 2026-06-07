// Mock vscode module for unit tests
jest.mock('vscode', () => {
  const EventEmitter = class {
    private listeners: Map<string, Function[]> = new Map();
    
    event = (listener: Function) => {
      const key = 'event';
      if (!this.listeners.has(key)) {
        this.listeners.set(key, []);
      }
      this.listeners.get(key)!.push(listener);
      return { dispose: () => {} };
    };
    
    fire(data: any) {
      const listeners = this.listeners.get('event') || [];
      listeners.forEach(listener => listener(data));
    }
  };

  return {
    workspace: {
      getConfiguration: jest.fn(() => ({
        get: jest.fn((key: string, defaultValue?: any) => defaultValue),
        has: jest.fn(() => false),
        inspect: jest.fn(),
        update: jest.fn()
      })),
      openTextDocument: jest.fn(),
      createFileSystemWatcher: jest.fn(() => ({
        onDidChange: jest.fn(),
        onDidDelete: jest.fn(),
        onDidCreate: jest.fn(),
        dispose: jest.fn()
      })),
      getWorkspaceFolder: jest.fn(),
      workspaceFolders: [],
      onDidChangeConfiguration: jest.fn()
    },
    window: {
      showInformationMessage: jest.fn(),
      showErrorMessage: jest.fn(),
      showWarningMessage: jest.fn(),
      showQuickPick: jest.fn(),
      showInputBox: jest.fn(),
      createOutputChannel: jest.fn(() => ({
        appendLine: jest.fn(),
        append: jest.fn(),
        clear: jest.fn(),
        show: jest.fn(),
        hide: jest.fn(),
        dispose: jest.fn()
      })),
      setStatusBarMessage: jest.fn(),
      createStatusBarItem: jest.fn(() => ({
        text: '',
        tooltip: '',
        command: '',
        show: jest.fn(),
        hide: jest.fn(),
        dispose: jest.fn()
      }))
    },
    commands: {
      registerCommand: jest.fn(),
      executeCommand: jest.fn()
    },
    Uri: {
      file: jest.fn((path: string) => ({
        fsPath: path,
        path,
        scheme: 'file'
      })),
      parse: jest.fn((path: string) => ({
        fsPath: path,
        path,
        scheme: 'file'
      }))
    },
    Range: jest.fn(),
    Position: jest.fn(),
    Selection: jest.fn(),
    TextEdit: {
      insert: jest.fn(),
      delete: jest.fn(),
      replace: jest.fn()
    },
    WorkspaceEdit: jest.fn(),
    RelativePattern: jest.fn((base: any, pattern: string) => ({
      base,
      pattern
    })),
    EventEmitter,
    CancellationTokenSource: jest.fn(),
    Disposable: jest.fn(),
    ExtensionContext: jest.fn()
  };
}, { virtual: true });
