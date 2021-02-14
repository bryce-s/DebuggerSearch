// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { DebugAdapterTracker, DebugAdapterTrackerFactory,  } from 'vscode';
import { exec } from 'child_process';
import { stringify } from 'querystring';
import { Socket } from 'dgram';
import  RequestConstants from './RequestConstants';
import { setFlagsFromString } from 'v8';
import { Console } from 'console';
import { Z_ASCII } from 'zlib';
import { parse } from 'path';


// todo:
// some kind of testcase
// implement logging so we can see what happens; we need observability
// need a tree page, or something.. some kinda UI   
// we sometimes concatenate before printing message, this might be slow.
// need to add a way to exclude non-user code.. is this even possible?
// should only allocate on use.
// commands to disable and enable

// next: gotta bind our threads to frames, 
// then frames to scopes, then scopes to variables

function debuggerPaused(): boolean {
   return vscode.debug.activeDebugSession !== undefined && VariableSearchDebugAdapterTracker.debuggerPaused; 
}

function debuggerRunningOrExitedError(): string {
   return (vscode.debug.activeDebugSession === undefined) 
   ? "VariableSearch: no active debug session." : "VariableSearch: the debugger is not paused."; 
}


export function activate(context: vscode.ExtensionContext) {
    const trackerFactory = new VariableSearchDebugAdapterTrackerFactory();
    // lets us dispose of the listener when it's done
    context.subscriptions.push(vscode.debug.registerDebugAdapterTrackerFactory('*', trackerFactory));
    
    // might wanna make the callback async here, then we can await functions inside it
    let x = vscode.commands.registerCommand("variableSearch.search", SearchCommands.searchCommand);
    context.subscriptions.push(x);

}
namespace SearchCommands {

    export function searchCommand(): void {
        if (debuggerPaused()) {
            vscode.window.showInputBox({prompt: "Search for?"}).then(
                (term: string | undefined)=>{
                    // success
                    if (term === undefined) {
                        return;
                    }
                    if (debuggerPaused()) {
                        let currentThreads: Array<any> = VariableSearchDebugAdapterTracker.threadTracker.threads || new Array<any>();
                        let options = currentThreads.map((threadInfo) => {
                            return {
                                label: `${threadInfo.id}: ${threadInfo.name}`,
                                description: ``,
                                command: `${threadInfo.id}`,
                            };
                        });
                        vscode.window.showQuickPick(options, {canPickMany: false}).then((option: any) => {
                            if (!option) {
                                return;
                            }
                            if (!option.length) {
                                option = new Array<any>(option);
                            }
                            let targetThread = option.map((opt: any) => parseInt(opt.command));
                            requestFrames(targetThread, term);
                        });
                    }
    
                    },
                    (v: string | undefined) => {
                    // failure?
                    }
                );
        } else {
            vscode.window.showWarningMessage( 
                 debuggerRunningOrExitedError() 
                );
        }
    };

    function requestFrames(threads: Array<number>, term: string) {
        // this should only have one at the moment; could do multiple but would need to bind them 
        // back, since origin is not included in promise resolution.
        threads.forEach(threadId => {
            vscode.debug.activeDebugSession?.customRequest("stackTrace", {
                threadId: threadId,
                startFrame: 0,
                levels: 20,
            }).then((stackFrames: any) => {
                if (!stackFrames) {
                    return;
                }
                pickFrame(stackFrames.stackFrames, term);
            });
        });
    }

    function pickFrame(stackFrames: Array<any>, term: string) {
        let i: number = 0;
        let options = stackFrames.map((frame: any) => {
            let res = {
                label: `Stack Frame ${i.toString()}: ${frame.name}`,
                description: ``,
                command: frame.id,
            };
            i++;
            return res;
        });
        vscode.window.showQuickPick(options).then((option: any) => {
            if (!option) {
                return;
            }
            if (!option.length) {
                option = new Array<any>(option);
            }
            let frameToRequest = option.map((opt: any) => opt.command);
            requestScopes(frameToRequest, term);
        });
    }

    function requestScopes(frameToRequest: Array<any>, term: string) {
        frameToRequest.forEach((frame: any) => {
            vscode.debug.activeDebugSession?.customRequest("scopes", {
                frameId: frame,
            }).then((message) => {
                // is array with .name, .variablesReference
                if (!message) {
                    return;
                }
                let scopes = message.scopes;

                VariableSearchDebugAdapterTracker.generateNewTracker();
                scopes.forEach((s: any) => {
                    VariableSearchDebugAdapterTracker.trackerReference?.addScope(new Scope(s.expensive, s.name, 
                        s.presentationHint, s.variablesReference)
                     );
                });

                VariableSearchDebugAdapterTracker.trackerReference?.searchTerm(term, undefined, undefined, 3);

            });
        });
    }

}




class VariableSearchDebugAdapterTrackerFactory implements DebugAdapterTrackerFactory {
    
    createDebugAdapterTracker(session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterTracker> {
        console.log("Creating new debug adapter tracker");
        const tracker = new VariableSearchDebugAdapterTracker();
        return tracker;
    }
}

class VariableSearchDebugAdapterTracker implements DebugAdapterTracker {

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
        VariableSearchDebugAdapterTracker.trackerReference = new StackTraverser();
    }
    
    onWillReceiveMessage(message: any) {
        // sending a message to the debug adapter
        //this.tracker.logRequest()

        if (message.command === 'bryceWillsIt' ) {
            VariableSearchDebugAdapterTracker.trackerReference!.logRequest(message.seq, message.arguments.variablesReference);
        }
        if (message.command === 'scopes') {
            console.log('scopes Online');
        }
        if (message.command === 'variables') {
            VariableSearchDebugAdapterTracker.trackerReference!.logRequest(message.seq, message.arguments.variablesReference);
        }

        if (message.command === 'stackTrace') {
            console.log('requesting stackTrace');
            console.log(message.body);
        }

        if (message.command === 'threads') {
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
        if (message.type === 'event') {
            this.handleEventRecv(message);
        }

        if (message.command === 'variables' && VariableSearchDebugAdapterTracker.trackerReference!.searchInProgress) {
            // need to actually save the data and associate it with our variable being requested.
            this.handleVariablesUnderSearchRecv(message);
        }
        else if (message.command === 'variables') {
            this.handleVariablesRecv(message);
        }
        if (message.command === 'scopes') {
            this.handleScopesRecv(message);
        }
        if (message.command === 'stackTrace') {
            this.handleStackTraceRecv(message);
        }
        if (message.command === 'threads') {
            this.handleThreadsRecv(message);
        }
    }

    handleEventRecv(message: any): void {
        if (message.event === 'stopped') {
            VariableSearchDebugAdapterTracker.debuggerPaused = true;
        }
        if (message.event === 'continued') {
            VariableSearchDebugAdapterTracker.debuggerPaused = false;
            VariableSearchDebugAdapterTracker.threadTracker.clearThreads();
        }
        if (message.event === 'exited' || message.event === 'terminated') {
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

class StackFrameTracker {
    private stackFrames: Array<any> | undefined;

    public addFrames(frames: Array<any>) {
        this.stackFrames = frames;
    }

    public clearFrames(): void {
        this.stackFrames = undefined;
    }

}

class ThreadTracker {
    public threads: Array<any> | undefined; 

    // add paused threads to tracker
    public addThreads(threadIds: Array<any>) {
        this.threads = threadIds;
    }

    public clearThreads(): void {
        this.threads = undefined;
    }
}

class Scope {

    public expensive: boolean = false;
    public name: string = '';
    public presentationHint: string = '';
    public variablesReference: number = -1;

    constructor(expensiveIn: boolean, nameIn: string, presentationHintIn: string, variablesReferenceIn: number) {
        this.expensive = expensiveIn;
        this.name = nameIn;
        this.presentationHint = presentationHintIn;
        this.variablesReference = variablesReferenceIn;
    }

}

class Variable {

    public variablesReference: number = -1;
    public depthFoundAt: number = 1;

    constructor(variablesReferenceIn: number, priorDepthIn: number | undefined = undefined) {
        this.variablesReference = variablesReferenceIn;
        if (priorDepthIn !== undefined) {
            this.depthFoundAt += priorDepthIn;
        }
    }
}

class SearchResult {
    public result: string = '';
    public eval: string = '';
    constructor(resultIn: string, evalIn: string) {
        this.result = resultIn;
        this.eval = evalIn;
    }
}

class VariableInfo {

    public variableReference: number = -1;
    public name: string = ''; // "01" (this is the 'real' name)
    public type: string = ''; // "str"
    public evaluateName: string = ''; // "Image.PropertyName"
    public value: any = undefined;

    constructor(variableReferencesIn: number, nameIn: string, typeIn: string, evaluateNameIn: string, valueIn: any) {
        this.variableReference = variableReferencesIn;
        this.name = nameIn;
        this.type = typeIn;
        this.evaluateName = evaluateNameIn;
        this.value = valueIn;
    }

}

interface VariableTracker {

    // add variables to the tree; map request_seq back to its request
    addVariables(v: Array<Variable>, requestSeq: number): void;

    // add variable info with full data
    addVariableData(v: Array<VariableInfo>, requestSeq: number): void;

    // variablesReference has a pending variables request
    logRequest(seq: number, variableReference: number): void;
    
    // search for a term using the tree
    searchTerm(t: string, scopeName?: string, regex?: boolean, depth?: number): any;
    
    // should serve as root nodes for a search..
    addScope(s: Scope): void;



    resumeSearch(): void;

    searchInProgress: boolean;

}

class VariableSearchLogger {
    public enabled: boolean = false;

    public writeLog(content: any): void {
        if (this.enabled) {
            console.log(content);
        }
    }

    constructor(enabled: boolean = false) {
        this.enabled = enabled;
    }
}



class StackTraverser implements VariableTracker {

    private scopes: Array<Scope> = new Array<Scope>();
    private visited: Set<number> = new Set<number>();
    private openRequests: Map<number, number> = new Map<number, number>();
    private activeVariablesReferences: Set<number> = new Set<number>();
    private variableMapping: Map<number, Array<Variable>> = new Map<number, Array<Variable>>();

    private variableDataRequested: Set<number> = new Set<number>();

    private variableInfoMapping: Map<number, Array<VariableInfo>> = new Map<number, Array<VariableInfo>>();

    private dfsStack: Array<Variable> = new Array<Variable>();
    private depthToSearch: number = 3;

    // how to tell if extension is deployed?
    private logger: VariableSearchLogger = new VariableSearchLogger( true  );

    private term: string = '';
    private searchWithRegex: boolean = false;

    private results: Array<SearchResult> = new Array<SearchResult>();

    // public VariableTracker properties
    searchInProgress: boolean = false;

    searchContains = (s: string, term: string): boolean => {
        return s.includes(term);
    };

    regexSearchContains = (sWithRegex: string, term: string) => {
        return false;
    };

    public addVariables(v: Array<Variable>, requestSeq: number) : void {
        let variableReference: number | undefined = this.openRequests.get(requestSeq);
        this.openRequests.delete(requestSeq);

        if (variableReference === undefined) {
            // this is an error.
            variableReference = 0;
        }

        let childNodes: Variable[] | undefined = this.variableMapping.get(variableReference);
        childNodes = childNodes?.concat(v);
        this.variableMapping.set(variableReference, 
            (childNodes === undefined) ? new Array<Variable>().concat(v) : childNodes);

        childNodes?.forEach(child => this.activeVariablesReferences.add(child.variablesReference));
    }

    public addVariableData(v: Array<VariableInfo>, requestSeq: number): void {
        // going to need to do something like open requests, from above.
        let variableReference: number | undefined = this.openRequests.get(requestSeq);
        this.openRequests.delete(requestSeq);

        if (variableReference === undefined) {
            // error
            throw new Error('no reference to map to from variable');
        }

        if (!this.variableInfoMapping.has(variableReference)) {
            this.logger.writeLog(`Storing the following for variablesReference: ${variableReference}`);
            this.logger.writeLog(v);
            this.variableInfoMapping.set(variableReference, v);
        }

    }

    public logRequest(seq: number, variableReference: number) {
        this.openRequests.set(seq, variableReference);
    }

    public searchTerm(t: string, scopeId?: string, regex?: boolean, depth?: number): any {
        this.searchInProgress = true;
        this.term = t;
        this.depthToSearch = (depth === undefined) ? 3 : depth;
        this.searchWithRegex = (regex !== undefined) ? regex : false;

        this.logger.writeLog(`Searching term: ${t} at depth ${depth}.`);


        if (this.scopes === undefined) {
            throw new Error("we need to ensure scopes are populated by this point");
        }

        if (scopeId === undefined) {
            let scopes: Array<Scope> = this.scopes; 
            let startingVariables = scopes.map((s) => new Variable(s.variablesReference));
            this.dfsStack.push(...startingVariables);
            let bailOut: boolean = this.traverseVariableTreeIterative(this.depthToSearch, (this.searchWithRegex) ? this.regexSearchContains : this.searchContains);
            if (bailOut) {
                return;
            }
        } else {
            let targetScope: Scope | undefined = this.scopes.find((scope) => scope.variablesReference === parseInt(scopeId));
            if (targetScope === undefined) {
                // error, not a valid scope
                targetScope = this.scopes[0];
            }
    
            this.logger.writeLog(`Searching in scope: ${targetScope}`);
    
            let variable = new Variable(targetScope.variablesReference);
            if (variable === undefined) {
                // error
                throw new Error('variable was undefined!');
            }

            this.dfsStack.push(variable);
            let bailOut: boolean = this.traverseVariableTreeIterative(this.depthToSearch, (this.searchWithRegex) ? this.regexSearchContains : this.searchContains);
            if (bailOut) {
                return;
            }     
        }
        

        this.term = '';
        this.searchInProgress = false;
        this.searchWithRegex = false;
    }

    public resumeSearch() {
        this.traverseVariableTreeIterative(this.depthToSearch, (this.searchWithRegex) ? this.regexSearchContains: this.searchContains);
    }

    // comp: do we want to regex? or just check if contains, etc.
    private traverseVariableTree(root: Variable, depth: number, pathToHere: Array<string>, comp: Function): void {
        this.visited.add(root.variablesReference);

        let childNodes: Array<Variable> | undefined = this.variableMapping.get(root.variablesReference);
        if (childNodes === undefined) {
            childNodes = new Array<Variable>();
        }
    }

    // there's two ways to enter this; the initial way , and a resume. Initial elt is preloaded
    // returns: should we bail out?
    private traverseVariableTreeIterative(depth: number, checkString: Function): boolean {

        // gonna be kinda tricky, since we need to 'start and stop...'
        while (this.dfsStack.length > 0) {
            let activeVariable: Variable | undefined = this.dfsStack.pop();

            if (activeVariable === undefined) {
                throw Error('what?');
            }

            let referenceNumber = activeVariable.variablesReference;

            // throw and push back in stack
            if (!this.variableInfoMapping.has(referenceNumber)) {
                // we need to populate this...
                this.getVariableContents(referenceNumber);
                this.dfsStack.push(activeVariable);
                return true;
            }

            // good to go
            this.visited.add(referenceNumber);

            let varInfos: VariableInfo[] | undefined = this.variableInfoMapping.get(referenceNumber);

            if (varInfos === undefined) {
                throw new Error('should not be undefined');
            }

            varInfos.forEach(info => {
                if (activeVariable === undefined) {
                    throw new Error("this can't be undefined");
                }
                if (info.variableReference !== 0 && !this.visited.has(info.variableReference)
                    && (activeVariable.depthFoundAt + 1) <= depth) {
                    this.dfsStack.push(new Variable(info.variableReference, activeVariable.depthFoundAt));
                    this.visited.add(info.variableReference);
                }
                if (checkString(info.evaluateName || '', this.term) || checkString(info.name || '', this.term) 
                    || checkString(info.value || '', this.term)) {
                    console.log('we found a result ^_^');
                    this.results.push(new SearchResult(info.value, info.evaluateName));
                }
            });
        }


        if (this.dfsStack.length === 0) {
            this.term = '';
            this.searchInProgress = false;
            this.searchWithRegex = false;
        }
        return false;
    }

    private getVariableContents(varRef: number) {
        if (!this.variableDataRequested.has(varRef)) {
            this.variableDataRequested.add(varRef);
            if (vscode.debug.activeDebugSession === undefined) {
                // we're not debugging
                throw new Error('woof');
            }
            (this.logger.enabled )? this.logger.writeLog(`Requesting variable info for variablesReference ${varRef}`) : ()=>{};
            // can't just resolve the promise; no way to bind it back:
            vscode.debug.activeDebugSession?.customRequest("variables", { variablesReference: varRef });
        }
    }

    public addScope(s: Scope): void {
        this.scopes.push(s);
        this.activeVariablesReferences.add(s.variablesReference);
        this.variableMapping.set(s.variablesReference, new Array<Variable>());
    }
}





// debug adapter constants:

// export const EVENT_TYPES = {
//     breakpointValidated: 'breakpointValidated',
//     end: 'end',
//     launched: 'launched',
//     stopOnBreakpoint: 'stopOnBreakpoint',
//     stopOnEntry: 'stopOnEntry',
//     stopOnException: 'stopOnException',
//     stopOnStepIn: 'stopOnStepIn',
//     stopOnStepOut: 'stopOnStepOut',
//     stopOnStepOver: 'stopOnStepOver',
//     stopped: 'stopped',
// };

// export const EVENT_REASONS = {
//     breakpoint: 'breakpoint',
//     changed: 'changed',
//     entry: 'entry',
//     exception: 'exception',
//     stepIn: 'stepin',
//     stepOut: 'stepout',
//     stepOver: 'step',
// };

// // we don't support multiple threads, so we can use a hardcoded ID for the default thread
// export const MAIN_THREAD = {
//     id: 1,
//     name: 'thread 1',
// };

// export const EVALUATE_REQUEST_TYPES = {
//     hover: 'hover',
//     watch: 'watch',
// };

// export const DEBUG_TYPE = 'truffle';

// //export const EMBED_DEBUG_ADAPTER = !!(typeof(IS_BUNDLE_TIME) === 'undefined');

// export const ERROR_MESSAGE_ID = 1;

// //

// // debug session constants 
  
// export const GET_INSTRUCTIONS = 'requestInstructions';
// export const GET_CURRENT_INSTRUCTION = 'requestCurrentInstruction';

// // t


// // this method is called when your extension is activated
// // your extension is activated the very first time the command is executed
// export function activate(context: vscode.ExtensionContext) {

// 	// Use the console to output diagnostic information (console.log) and errors (console.error)
// 	// This line of code will only be executed once when your extension is activated
// 	console.log('Congratulations, your extension "helloworld" is is now active!');

// 	// The command has been defined in the package.json file
// 	// Now provide the implementation of the command with registerCommand
// 	// The commandId parameter must match the command field in package.json
// 	let disposable = vscode.commands.registerCommand('helloworld.helloWorld', () => {
// 		// The code you place here will be executed every time your command is executed

// 		let debugAdapter = new PapyrusDebugAdapterTrackerFactory();
	    	

// 		// Display a message box to the user
// 		vscode.window.showInformationMessage('Hello World from HelloWorld!');
// 	});

// 	context.subscriptions.push(disposable);
// }


// export class PapyrusDebugAdapterTrackerFactory implements DebugAdapterTrackerFactory, Disposable {
// 	private readonly _registration: Disposable;

//     constructor() {
//         this._registration = debug.registerDebugAdapterTrackerFactory('papyrus', this);
// 	}

//     async createDebugAdapterTracker(session: DebugSession): Promise<DebugAdapterTracker> {
//         return new DebugAdapterTrackerWrapper(session);
//     }

//     dispose() {
//         this._registration.dispose();
//     }
// }


// class DebugAdapterTrackerWrapper implements DebugAdapterTracker {
// 	private readonly _session: DebugSession;

//     private _showErrorMessages = true;
//     // private instructionView: InstructionView;

//     constructor(session: DebugSession) {
//         this._session = session;
//     }

//     onWillStopSession() {
//         this._showErrorMessages = false;
// 	}
	

//     onError(error: Error) {
//         if (!this._showErrorMessages || this._session.configuration.noop) {
//             return;
//         }

//         window.showErrorMessage(`Papyrus debugger error: ${error.toString()}`);
//     }
//     onExit(code: number | undefined, signal: string | undefined) {
//         if (!this._showErrorMessages || this._session.configuration.noop) {
//             return;
//         }

//         if (code) {
//             window.showErrorMessage(`Papyrus debugger exited with code: ${code}, signal: ${signal}`);
//         }
// 	}
	

//     public onDidSendMessage(message: any): void {
//         if (message.success === false) {
//             window.showErrorMessage('Error occured in debug mode: ' + message.body.error.format);
//             return;
//         }
//         switch (message.event) {
//             case EVENT_TYPES.launched: // init instructions after launch
//                 this.requestForInstructions();
//                 return;
//             case EVENT_TYPES.stopped: // get current instruction on every stop event
//                 this.requestForCurrentInstruction();
//                 return;
//         }
//         switch (message.command) {
//             case GET_INSTRUCTIONS:
//                 // this.updateInstructionView(message.body.instructions);
//                 return;
//             case GET_CURRENT_INSTRUCTION:
//                 // this.revealInstruction(message.body.currentInstruction);
//                 return;
// 		}


// 	}		

//     private requestForInstructions() {
//         this._session.customRequest(GET_INSTRUCTIONS);
//     }

//     private requestForCurrentInstruction() {
//         this._session.customRequest(GET_CURRENT_INSTRUCTION);
//     }

//     //private updateInstructionView(instructions: IInstruction[]) {
//     //    this.instructionView.update(instructions);
//     //}

//     //private revealInstruction(instruction: IInstruction) {
//      //   this.instructionView.revealInstruction(instruction);
//     //}
   
	
// }





// this method is called when your extension is deactivated
export function deactivate() {}
