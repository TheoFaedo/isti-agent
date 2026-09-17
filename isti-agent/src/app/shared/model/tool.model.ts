export interface Tool {
  definition: ToolDefinition;
  action: ToolAction;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: InputSchema;
}

export interface InputSchema {
  type: 'object';
  properties: Record<string, Property>;
  required: string[];
}

export interface Property {
  type: string;
  description: string;
}

export type ToolAction = (args: Record<string, string>) => Promise<string>;
