export class CodexAppServerNotImplemented extends Error {
  constructor() {
    super('Codex app-server transport is planned. Current beta uses Codex CLI exec transport.');
  }
}
