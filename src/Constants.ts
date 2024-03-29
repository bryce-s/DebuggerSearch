import * as vscode from 'vscode';

export default class Constants {

    // message types:
    public static readonly event: string = 'event';

    // event types:
    public static readonly stopped: string = 'stopped';
    public static readonly continued: string = 'continued';
    public static readonly exited: string = 'exited';
    public static readonly terminated: string = 'terminated';

    // commands:
    public static readonly scopes: string = 'scopes';
    public static readonly variables: string = 'variables';
    public static readonly stackTrace: string = 'stackTrace';
    public static readonly threads: string = 'threads';
    public static readonly reset: string = '--reset';

    //output
    public static readonly outputDivider = '-----------------';

    // Scope types:
    public static readonly allScopes: string = "All";

    // Variables reference types
    public static readonly noChildren: number = 0;

    // Search types
    public static readonly containsDefault: string = "Contains (Default Search Type)";
    public static readonly contains: string = "Contains";
    public static readonly regex: string = "Regex";
    public static readonly exactMatch: string = "Exact Match";

    // quote types
    public static readonly quoteTypes: Array<string> = ["'", '"', '`'];

    public static readonly debuggerSearchLoggingEnabled: boolean = false;

}




