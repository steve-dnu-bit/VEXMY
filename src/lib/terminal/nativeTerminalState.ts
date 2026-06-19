/** Tracks whether Stripe Terminal.initialize() has completed in this app session. */
let nativeTerminalInitialized = false;

/** True while WisePad mandatory firmware OTA is running — pause proactive token/display work. */
let readerFirmwareUpdating = false;
let readerFirmwareProgress = 0;

/** Set when a token/discovery failure should abort the in-flight reader operation. */
let terminalOperationAborted = false;

export function isNativeTerminalInitialized(): boolean {
  return nativeTerminalInitialized;
}

export function setNativeTerminalInitialized(initialized: boolean): void {
  nativeTerminalInitialized = initialized;
}

export function isReaderFirmwareUpdating(): boolean {
  return readerFirmwareUpdating;
}

export function getReaderFirmwareProgress(): number {
  return readerFirmwareProgress;
}

export function setReaderFirmwareUpdate(active: boolean, progress = 0): void {
  readerFirmwareUpdating = active;
  readerFirmwareProgress = active ? Math.max(0, Math.min(100, Math.round(progress))) : 0;
}

export function beginTerminalOperation(): void {
  terminalOperationAborted = false;
}

export function abortTerminalOperation(): void {
  terminalOperationAborted = true;
}

export function isTerminalOperationAborted(): boolean {
  return terminalOperationAborted;
}
