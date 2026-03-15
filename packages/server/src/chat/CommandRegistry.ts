import type { PlayerState } from "../state/PlayerState";

export interface CommandContext {
  sessionId: string;
  player: PlayerState;
  role: string;
  args: string[];
  rawArgs: string;
}

export interface CommandDefinition {
  name: string;
  description: string;
  usage: string;
  adminOnly: boolean;
  handler: (ctx: CommandContext) => void;
}

export class CommandRegistry {
  private commands: Map<string, CommandDefinition> = new Map();

  register(cmd: CommandDefinition): void {
    this.commands.set(cmd.name.toLowerCase(), cmd);
  }

  get(name: string): CommandDefinition | undefined {
    return this.commands.get(name.toLowerCase());
  }

  /** Get commands visible to a given role. */
  getAvailable(
    role: string,
  ): { name: string; usage: string; description: string; adminOnly: boolean }[] {
    const result: { name: string; usage: string; description: string; adminOnly: boolean }[] = [];
    for (const cmd of this.commands.values()) {
      if (!cmd.adminOnly || role === "admin") {
        result.push({
          name: cmd.name,
          usage: cmd.usage,
          description: cmd.description,
          adminOnly: cmd.adminOnly,
        });
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }
}
