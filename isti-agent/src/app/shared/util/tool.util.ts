import { InputSchema, Tool, ToolAction } from '../model/tool.model';
import { logAction } from './tool/log.tool';
import { alertAction } from './tool/alert.tool';

export class ToolBuilder {
  private _name: string;
  private _description: string;
  private _inputSchema: InputSchema;
  private _action: ToolAction;

  private constructor(name: string, description: string, inputSchema: InputSchema) {
    this._name = name;
    this._description = description;
    this._inputSchema = inputSchema;
    this._action = () => Promise.resolve('test');
  }

  static for(name: string, description: string) {
    return new ToolBuilder(name, description, {
      type: 'object',
      properties: {},
      required: [],
    });
  }

  public addRequiredProperty(name: string, type: string, description: string) {
    this.addProperty(name, type, description);
    this._inputSchema.required.push(name);
    return this;
  }

  public addProperty(name: string, type: string, description: string) {
    this._inputSchema.properties[name] = { type, description };
    return this;
  }

  public setAction(action: ToolAction) {
    this._action = action;
    return this;
  }

  public build() {
    return {
      definition: {
        name: this._name,
        description: this._description,
        input_schema: this._inputSchema,
      },
      action: this._action,
    } as Tool;
  }
}

export const TOOLS: Tool[] = [
  ToolBuilder.for(
    'browser-console-log',
    'Print a text in the console javascript (via the console.log function)',
  )
    .addRequiredProperty('text', 'string', 'The text to print in the console')
    .setAction(logAction)
    .build(),
  ToolBuilder.for('browser-alert', 'Print text in an alert window (via the alert function)')
    .addRequiredProperty('text', 'string', 'The text to print in the alert box')
    .setAction(alertAction)
    .build(),
] as Tool[];
