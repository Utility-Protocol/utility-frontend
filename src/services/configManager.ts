export type ConfigPrimitive = string | number | boolean;
export type ConfigValue = ConfigPrimitive | ConfigPrimitive[] | Record<string, ConfigPrimitive>;
export type ConfigSnapshot = Record<string, ConfigValue>;

export type ConfigFieldType = "string" | "number" | "boolean" | "string[]" | "number[]" | "record";

export interface ConfigFieldSchema<T extends ConfigValue = ConfigValue> {
  type: ConfigFieldType;
  required?: boolean;
  default?: T;
  description?: string;
  sensitive?: boolean;
  validate?: (value: T, snapshot: ConfigSnapshot) => true | string;
}

export type ConfigSchema = Record<string, ConfigFieldSchema>;

export interface ConfigChangeEvent {
  version: number;
  changedKeys: string[];
  previous: Readonly<ConfigSnapshot>;
  current: Readonly<ConfigSnapshot>;
  appliedAt: number;
}

export interface ConfigValidationError {
  key: string;
  message: string;
}

export interface ConfigManagerOptions {
  schema: ConfigSchema;
  initial?: ConfigSnapshot;
  now?: () => number;
  onMetric?: (name: string, value: number, tags?: Record<string, string>) => void;
  onValidationError?: (errors: ConfigValidationError[]) => void;
}

type ConfigListener = (event: ConfigChangeEvent) => void;

type Poller = {
  stop: () => void;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneSnapshot(snapshot: ConfigSnapshot): ConfigSnapshot {
  return globalThis.structuredClone
    ? globalThis.structuredClone(snapshot)
    : JSON.parse(JSON.stringify(snapshot));
}

function matchesType(value: unknown, type: ConfigFieldType): boolean {
  if (type === "string[]") return Array.isArray(value) && value.every((item) => typeof item === "string");
  if (type === "number[]") return Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item));
  if (type === "record") return isObject(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

export function redactConfig(snapshot: ConfigSnapshot, schema: ConfigSchema): ConfigSnapshot {
  const redacted = cloneSnapshot(snapshot);
  for (const [key, field] of Object.entries(schema)) {
    if (field.sensitive && key in redacted) redacted[key] = "[REDACTED]";
  }
  return redacted;
}

export function validateConfig(snapshot: ConfigSnapshot, schema: ConfigSchema): ConfigValidationError[] {
  const errors: ConfigValidationError[] = [];
  for (const [key, field] of Object.entries(schema)) {
    const value = snapshot[key] ?? field.default;
    if (value === undefined) {
      if (field.required) errors.push({ key, message: "is required" });
      continue;
    }
    if (!matchesType(value, field.type)) {
      errors.push({ key, message: `must be ${field.type}` });
      continue;
    }
    const customResult = field.validate?.(value as never, snapshot);
    if (typeof customResult === "string") errors.push({ key, message: customResult });
  }
  return errors;
}

export class ConfigManager {
  private snapshot: ConfigSnapshot;
  private version = 0;
  private listeners = new Set<ConfigListener>();
  private readonly schema: ConfigSchema;
  private readonly now: () => number;
  private readonly onMetric?: ConfigManagerOptions["onMetric"];
  private readonly onValidationError?: ConfigManagerOptions["onValidationError"];

  constructor(options: ConfigManagerOptions) {
    this.schema = options.schema;
    this.now = options.now ?? Date.now;
    this.onMetric = options.onMetric;
    this.onValidationError = options.onValidationError;
    this.snapshot = this.withDefaults(options.initial ?? {});
    const errors = validateConfig(this.snapshot, this.schema);
    if (errors.length > 0) throw new Error(`Invalid initial configuration: ${errors.map((error) => `${error.key} ${error.message}`).join(", ")}`);
  }

  getVersion(): number {
    return this.version;
  }

  getSnapshot(): Readonly<ConfigSnapshot> {
    return cloneSnapshot(this.snapshot);
  }

  get<T extends ConfigValue>(key: string): T | undefined {
    return cloneSnapshot(this.snapshot)[key] as T | undefined;
  }

  subscribe(listener: ConfigListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  apply(next: ConfigSnapshot): { ok: true; event: ConfigChangeEvent | null } | { ok: false; errors: ConfigValidationError[] } {
    const startedAt = this.now();
    const candidate = this.withDefaults({ ...this.snapshot, ...next });
    const errors = validateConfig(candidate, this.schema);
    if (errors.length > 0) {
      this.onValidationError?.(errors);
      this.onMetric?.("config.validation_failed", 1);
      return { ok: false, errors };
    }

    const changedKeys = Object.keys(candidate).filter((key) => JSON.stringify(candidate[key]) !== JSON.stringify(this.snapshot[key]));
    if (changedKeys.length === 0) return { ok: true, event: null };

    const previous = cloneSnapshot(this.snapshot);
    this.snapshot = candidate;
    this.version += 1;
    const event: ConfigChangeEvent = {
      version: this.version,
      changedKeys,
      previous,
      current: cloneSnapshot(this.snapshot),
      appliedAt: this.now(),
    };
    this.onMetric?.("config.reload_latency_ms", Math.max(0, event.appliedAt - startedAt), { result: "success" });
    for (const listener of this.listeners) listener(event);
    return { ok: true, event };
  }

  createPoller(load: () => Promise<ConfigSnapshot>, intervalMs: number): Poller {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stopped) return;
      try {
        this.apply(await load());
      } finally {
        if (!stopped) timer = setTimeout(tick, intervalMs);
      }
    };
    timer = setTimeout(tick, intervalMs);
    return {
      stop: () => {
        stopped = true;
        if (timer) clearTimeout(timer);
      },
    };
  }

  private withDefaults(snapshot: ConfigSnapshot): ConfigSnapshot {
    const next = cloneSnapshot(snapshot);
    for (const [key, field] of Object.entries(this.schema)) {
      if (next[key] === undefined && field.default !== undefined) next[key] = field.default;
    }
    return next;
  }
}

export const systemConfigSchema: ConfigSchema = {
  apiBaseUrl: { type: "string", required: true, description: "Base API URL used by service clients." },
  apiTimeoutMs: {
    type: "number",
    default: 15_000,
    validate: (value) => (Number(value) > 0 && Number(value) <= 60_000 ? true : "must be between 1 and 60000"),
  },
  enableTelemetry: { type: "boolean", default: true },
  canaryPercent: {
    type: "number",
    default: 0,
    validate: (value) => (Number(value) >= 0 && Number(value) <= 100 ? true : "must be between 0 and 100"),
  },
  alertWebhookUrl: { type: "string", required: false, sensitive: true },
};
