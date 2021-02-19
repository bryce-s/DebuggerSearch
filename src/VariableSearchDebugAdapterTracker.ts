import { DebugAdapterTracker, DebugAdapterTrackerFactory,  } from 'vscode';
import Constants from './Constants';
import { ThreadTracker, StackFrameTracker, Variable, VariableInfo, Scope } from './DebuggerObjectRepresentations';
import VariableTracker from './VariableTracker';
import ScopeTraverser from './ScopeTraverser';


export default class VariableSearchDebugAdapterTracker implements DebugAdapterTracker {

    //private tracker!: VariableTracker; 

    public static threadTracker: ThreadTracker;
    public static stackFrameTracker: StackFrameTracker; 

    public static trackerReference: VariableTracker | undefined = undefined;
    public static debuggerPaused: boolean = false;

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
            console.log('scopes Online');
        }
        if (message.command === Constants.variables) {
            VariableSearchDebugAdapterTracker.trackerReference!.logRequest(message.seq, message.arguments.variablesReference);
        }

        if (message.command === Constants.stackTrace) {
            console.log('requesting stackTrace');
            console.log(message.body);
        }

        if (message.command === Constants.threads) {
            console.log('requesting threads');
        }

        // let requestForBottomVariable = {
        //     command: "variables",
        //     arguments: {
        //       variablesReference: 10,
        //     },
        //     type: "request",
        //     seq: 17,
        //   };
          
          // vscode.debug.activeDebugSession?.customRequest("variables", )

        //vscode.debug.activeDebugSession?.customRequest()
    }


    onDidSendMessage(message: any) {
        console.log("Received message from debug adapter:\n", message);
        
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
        if (message.event === Constants.continued) {
            VariableSearchDebugAdapterTracker.debuggerPaused = false;
            VariableSearchDebugAdapterTracker.threadTracker.clearThreads();
        }
        if (message.event === Constants.exited || message.event === Constants.terminated) {
            VariableSearchDebugAdapterTracker.debuggerPaused = false;
            VariableSearchDebugAdapterTracker.threadTracker.clearThreads();
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
            VariableSearchDebugAdapterTracker.generateNewTracker();

            message.body.scopes.forEach((s: any) => {
                VariableSearchDebugAdapterTracker.trackerReference!.addScope(new Scope(s.expensive, s.name, s.presentationHint, s.variablesReference));
            });

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
}
