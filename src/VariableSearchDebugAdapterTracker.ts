import { DebugAdapterTracker, DebugAdapterTrackerFactory,  } from 'vscode';
import Constants from './Constants';
import * as vscode from 'vscode';
import { ThreadTracker, StackFrameTracker, Variable, VariableInfo, Scope, VariableSearchLogger } from './DebuggerObjectRepresentations';
import VariableTracker from './VariableTracker';
import ScopeTraverser from './ScopeTraverser';


export default class VariableSearchDebugAdapterTracker implements DebugAdapterTracker {

    public static threadTracker: ThreadTracker;

    public static trackerReference: VariableTracker | undefined = undefined;
    public static debuggerPaused: boolean = false;

    public static outputChannel: vscode.OutputChannel | undefined = undefined;
    
    constructor() {

        VariableSearchDebugAdapterTracker.generateNewTracker();

        // reassign to false on debug adapter start:
        VariableSearchDebugAdapterTracker.debuggerPaused = false;
        VariableSearchDebugAdapterTracker.threadTracker = new ThreadTracker();
    }

    public static generateNewTracker(): void {
        VariableSearchDebugAdapterTracker.trackerReference = new ScopeTraverser();
    }
    
    onWillReceiveMessage(message: any) {
        // sending a message to the debug adapter

        if (message.command === Constants.scopes) {

        }
        if (message.command === Constants.variables) {
            VariableSearchDebugAdapterTracker.trackerReference!.logRequest(message.seq, message.arguments.variablesReference);
        }

        if (message.command === Constants.stackTrace) {
        }

        if (message.command === Constants.threads) {
        }

    }


    onDidSendMessage(message: any) {
        // recv message from debug adapter
        
        // https://microsoft.github.io/debug-adapter-protocol/specification
        if (message.type === Constants.event) {
            this.handleEventRecv(message);
        }

        if (message.command === Constants.variables && VariableSearchDebugAdapterTracker.trackerReference!.searchInProgress) {
            // need to actually save the data and associate it with our variable being requested.
            this.handleVariablesUnderSearchRecv(message);
        }
        else if (message.command === Constants.variables) {
            this.handleVariablesRecv(message);
        }
        if (message.command === Constants.scopes) {
            this.handleScopesRecv(message);
        }
        if (message.command === Constants.stackTrace) {
            this.handleStackTraceRecv(message);
        }
        if (message.command === Constants.threads) {
            this.handleThreadsRecv(message);
        }
    }

    handleEventRecv(message: any): void {
        if (message.event === Constants.stopped) {
            VariableSearchDebugAdapterTracker.debuggerPaused = true;
        }
        // works for steps
        if (message.event === Constants.continued) {
            VariableSearchDebugAdapterTracker.debuggerPaused = false;
            VariableSearchDebugAdapterTracker.threadTracker.clearThreads();
            VariableSearchDebugAdapterTracker._selectedThreads = undefined;
        }
        if (message.event === Constants.exited || message.event === Constants.terminated) {
            VariableSearchDebugAdapterTracker.debuggerPaused = false;
            VariableSearchDebugAdapterTracker.threadTracker.clearThreads();
            VariableSearchDebugAdapterTracker._selectedThreads = undefined;
        }
    }

    handleVariablesUnderSearchRecv(message: any): void {
        if (message.success) {
            let variables = message.body.variables;
        
            VariableSearchDebugAdapterTracker.trackerReference!.addVariableData(variables.map(
                (x: any) => new VariableInfo(x.variablesReference, x.name, x.type, x.evaluateName, x.value)
                ), message.request_seq);

            VariableSearchDebugAdapterTracker.trackerReference!.resumeSearch();
        } else {
            console.log(`requesting variables failed`);
            console.log(message);
        }
    }

    handleVariablesRecv(message: any): void {
        let variables = message.body.variables;

        let trackedVariables: Array<Variable> = new Array<Variable>();
        variables.forEach((variable: any) =>  trackedVariables.push(new Variable(variable.variablesReference))); 
        trackedVariables = trackedVariables.filter((variable) => variable.variablesReference !== 0);

        VariableSearchDebugAdapterTracker.trackerReference!.addVariables(trackedVariables, message.request_seq);
    }

    handleScopesRecv(message: any): void {
            // i think the only time this is called is when execution is paused?
            // this should be the case, but we will want to defer doing work until a search is actually run.
        if (message.success) {

       //     VariableSearchDebugAdapterTracker.generateNewTracker();

            message.body.scopes.forEach((s: any) => {
                VariableSearchDebugAdapterTracker.trackerReference!.addScope(new Scope(s.expensive, s.name, s.presentationHint, s.variablesReference));
            });
        }

    }

    handleStackTraceRecv(message: any) {
            if (message.success) {
                if (message.body.stackFrames.length === message.body.totalFrames) {
                    // this is from all threads.
                    
                }
            }
            console.log(`requested: ${message.body}`);
    }

    handleThreadsRecv(message: any): void {
        if (message.success) {
            VariableSearchDebugAdapterTracker.threadTracker.addThreads(
                message.body.threads.map((thread: any) => {
                    return {
                        id: thread.id,
                        name: thread.name,
                    };
                })
            );
        } else {
            console.log(`error getting threads`);
        }
    }


    onError(error: Error) {
        console.log("Error in communication with debug adapter:\n", error);
    }

    onExit(code: number, signal: string) {
        if (code) {
            console.log("Debug Adapter exited with exit code", code);
        } else {
            console.log("Debug Adapter exited with signal", signal);
        }
    }

    //#region selected depth for search

    public static depth: number | undefined = undefined;

    //#endregion

    //#region selected threads for search
    private static _selectedThreads: Array<number> | undefined = undefined;

    private static allocateSelectedThreadsIfNeeded(): void {
        if (VariableSearchDebugAdapterTracker._selectedThreads === undefined) {
            VariableSearchDebugAdapterTracker._selectedThreads = new Array<number>();
        }
    }

    public static get selectedThreads(): Array<number> {
        this.allocateSelectedThreadsIfNeeded();
        return VariableSearchDebugAdapterTracker._selectedThreads!;
    }
    public static set selectedThreads(threads: Array<number>) {
        this.allocateSelectedThreadsIfNeeded();
        VariableSearchDebugAdapterTracker._selectedThreads = VariableSearchDebugAdapterTracker._selectedThreads?.concat(threads);
    }

    public static clearSelectedThreads(): void {
        VariableSearchDebugAdapterTracker._selectedThreads = undefined;
    }
    
    //#endregion


    //#region selected frames for search
    private static _selectedFrames: Array<number> | undefined = undefined;

    private static allocateSelectedFramesIfNeeded(): void {
        if (VariableSearchDebugAdapterTracker._selectedFrames === undefined) {
            VariableSearchDebugAdapterTracker._selectedFrames = new Array<number>();
        }
    }

    public static get selectedFrames(): Array<number> {
        this.allocateSelectedFramesIfNeeded();
        return VariableSearchDebugAdapterTracker._selectedFrames!;
    }
    public static set selectedFrames(threads: Array<number>) {
        this.allocateSelectedFramesIfNeeded();
        VariableSearchDebugAdapterTracker._selectedFrames = VariableSearchDebugAdapterTracker._selectedFrames?.concat(threads);
    }

    public static clearSelectedFrames(): void {
       VariableSearchDebugAdapterTracker._selectedFrames = undefined; 
    }

    //#endregion

    //#region selected scopes for search

    public static selectedScope: any = undefined;

    public static clearSelectedScope(): void {
        VariableSearchDebugAdapterTracker.selectedScope = undefined;
    }

}
