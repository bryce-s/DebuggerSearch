import * as vscode from 'vscode';



class Commands {
    public readonly runInTerminal: string = 'runInTerminal';
    public readonly variables: string = 'variables';
    public readonly breakpointLocations: string = 'breakpointLocations';
    public readonly continue: string = 'continue';
    public readonly next: string = 'next';
    public readonly stepIn: string = 'stepIn';
    public readonly stepOut: string = 'stepOut';
    public readonly stepBack: string = 'stepBack';
    public readonly scopes: string = 'scopes';
};


class RequestConstants {
    // see:
    // https://microsoft.github.io/debug-adapter-protocol/specification
    private readonly _commands: Commands = new Commands();
    public get commands(): Commands {
        return this._commands;
    }
}


export default RequestConstants;
