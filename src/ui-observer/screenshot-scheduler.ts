/** One idle timer and one capture at a time across the whole session. */
export class ScreenshotScheduler<T> {
  private timer?: ReturnType<typeof setTimeout>;
  private automatic?: T;
  private manualQueue: T[] = [];
  private running?: Promise<void>;
  private epoch = 0;
  private enabled = true;
  private idleReady = false;
  constructor(private delayMs: number, private capture: (value: T, mode: 'idle' | 'manual', cancelled: () => boolean) => Promise<void>) {}
  activity(value: T): void {
    if (!this.enabled) return;
    this.clearTimer(); this.automatic = value; this.idleReady = false;
    this.timer = setTimeout(() => { this.timer = undefined; this.idleReady = true; this.pump(); }, this.delayMs);
  }
  manual(value: T): boolean {
    if (!this.enabled) return false;
    // A manual capture supersedes the pending automatic observation.
    this.clearTimer(); this.automatic = undefined; this.idleReady = false;
    this.manualQueue.push(value); this.pump(); return true;
  }
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) { this.epoch++; this.clearTimer(); this.automatic = undefined; this.manualQueue = []; this.idleReady = false; }
  }
  stop(): void { this.setEnabled(false); }
  private clearTimer(): void { clearTimeout(this.timer); this.timer = undefined; }
  private pump(): void {
    if (!this.enabled || this.running) return;
    const manual = this.manualQueue.shift();
    const value = manual ?? (this.idleReady ? this.automatic : undefined);
    if (value === undefined) return;
    if (manual === undefined) { this.automatic = undefined; this.idleReady = false; }
    const epoch = this.epoch;
    this.running = Promise.resolve().then(() => this.capture(value, manual === undefined ? 'idle' : 'manual', () => !this.enabled || epoch !== this.epoch))
      .finally(() => { this.running = undefined; this.pump(); });
    // Session capture reports failures; prevent timer callbacks from rejecting globally.
    void this.running.catch(() => {});
  }
  async drain(): Promise<void> { while (this.running) await this.running; }
}
