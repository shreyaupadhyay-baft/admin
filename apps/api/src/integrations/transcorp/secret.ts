const REDACTED = "[REDACTED]";

/**
 * Wraps a credential so it cannot leak through JSON.stringify, string
 * interpolation, util.inspect or a logger that walks an object. The only way
 * to read the value is the explicit `.reveal()` call, which should appear in
 * exactly one place: the client's header builder (and the webhook verifier).
 */
export class SecretValue {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  reveal(): string {
    return this.#value;
  }

  toJSON(): string {
    return REDACTED;
  }

  toString(): string {
    return REDACTED;
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return REDACTED;
  }
}
