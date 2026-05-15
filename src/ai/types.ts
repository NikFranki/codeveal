export interface AISkill {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  run(prompt: string): Promise<string>;
}

export interface AIRawOutput {
  responsibility: string;
  dataFlow: Array<{ from: string; through: string; to: string }>;
  exportDescriptions: Record<string, string>;
}
