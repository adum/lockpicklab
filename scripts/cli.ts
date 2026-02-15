export interface ParsedArgs {
  flags: Record<string, string | boolean>;
  positional: string[];
}

export interface ParseArgsOptions {
  shortBooleanFlags?: string[];
}

export function parseArgs(
  argv: string[],
  options?: ParseArgsOptions
): ParsedArgs {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  const shortBooleanFlags = new Set(options?.shortBooleanFlags ?? []);

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const eqIndex = arg.indexOf("=");
      if (eqIndex !== -1) {
        const key = arg.slice(2, eqIndex);
        const value = arg.slice(eqIndex + 1);
        flags[key] = value;
        continue;
      }
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
      continue;
    }
    if (arg.startsWith("-") && arg.length === 2) {
      const key = arg.slice(1);
      if (shortBooleanFlags.has(key)) {
        flags[key] = true;
        continue;
      }
    }
    positional.push(arg);
  }

  return { flags, positional };
}
