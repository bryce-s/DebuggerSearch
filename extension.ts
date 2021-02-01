// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { DebugAdapterTracker, DebugAdapterTrackerFactory,  } from 'vscode';
import { exec } from 'child_process';
import { stringify } from 'querystring';
import { Socket } from 'dgram';
import  RequestConstants from './RequestConstants';
import { setFlagsFromString } from 'v8';


export function activate(context: vscode.ExtensionContext) {
    const trackerFactory = new ProbeRsDebugAdapterTrackerFactory();
    context.subscriptions.push(vscode.debug.registerDebugAdapterTrackerFactory('*', trackerFactory));
}



class ProbeRsDebugAdapterTrackerFactory implements DebugAdapterTrackerFactory {
    
    createDebugAdapterTracker(session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterTracker> {
        console.log("Creating new debug adapter tracker");
        const tracker = new VariableSearchDebugAdapterTracker();
        return tracker;
    }
}

class VariableSearchDebugAdapterTracker implements DebugAdapterTracker {

    private readonly tracker: VariableTracker; 

    constructor() {
        this.tracker = new StackTraverser();
    }

    onWillReceiveMessage(message: any) {
        // sending a message to the debug adapter
        //this.tracker.logRequest()

        if (message.command === 'scopes') {

        }
        if (message.command === 'variables') {
            this.tracker.logRequest(message.seq, message.arguments.variablesReference);
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

        if (message.command === 'variables') {
            let variables = message.body.variables;

            let trackedVariables: Array<Variable> = new Array<Variable>();
            variables.forEach((variable: any) =>  trackedVariables.push(new Variable(variable.variablesReference))); 
            trackedVariables = trackedVariables.filter((variable) => variable.variablesReference !== 0);

            this.tracker.addVariables(trackedVariables, message.request_seq);

            if (this.tracker.searchInProgress) {
                this.tracker.addVariableData(variables.map(
                    (x: any) => new VariableInfo(x.variablesReference, x.name, x.type, x.evaluateName)
                    ));
            }
        }
        if (message.command === 'scopes') {
            //this.tracker.addScope();
            console.log('adding a scope');
            message.body.scopes.forEach((s: any) => {
                this.tracker.addScope(new Scope(s.expensive, s.name, s.presentationHint, s.variablesReference));
            });
        }

        //vscode.debug.activeDebugSession?.customRequest("variables", { variablesReference: 3 });
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

    constructor(variablesReferenceIn: number) {
        this.variablesReference = variablesReferenceIn;
    }

}

class VariableInfo {

    public variableReference: number = -1;
    public name: string = ''; // "01" (this is the 'real' name)
    public type: string = ''; // "str"
    public evaluateName: string = ''; // "inputFiles[1]"

    constructor(variableReferencesIn: number, nameIn: string, typeIn: string, evaluateNameIn: string) {
        this.variableReference = variableReferencesIn;
        this.name = nameIn;
        this.type = typeIn;
        this.evaluateName = evaluateNameIn;
    }

}

interface VariableTracker {

    // add variables to the tree; map request_seq back to its request
    addVariables(v: Array<Variable>, requestSeq: number): void;

    // add variable info with full data
    addVariableData(v: Array<VariableInfo>): void;

    // variablesReference has a pending variables request
    logRequest(seq: number, variableReference: number): void;
    
    // search for a term using the tree
    searchTerm(t: string, scopeName?: string, regex?: boolean, depth?: number): any;
    
    // should serve as root nodes
    addScope(s: Scope): void;

    searchInProgress: boolean;
}

class StackTraverser implements VariableTracker {

    private scopes: Array<Scope> = new Array<Scope>();
    private visited: Set<number> = new Set<number>();
    private openRequests: Map<number, number> = new Map<number, number>();
    private activeVariablesReferences: Set<number> = new Set<number>();
    private variableMapping: Map<number, Array<Variable>> = new Map<number, Array<Variable>>();

    private variableInfoMapping: Map<number, Array<VariableInfo>> = new Map<number, Array<VariableInfo>>();

    private dfsStack: Array<Variable> = new Array<Variable>();

    searchInProgress: boolean = false;
    term: string = '';

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
    
    public addVariableData(v: Array<VariableInfo>): void {

    }

    public logRequest(seq: number, variableReference: number) {
        this.openRequests.set(seq, variableReference);
    }

    public searchTerm(t: string, scopeName?: string, regex?: boolean, depth?: number): any {
        this.searchInProgress = true;
        this.term = t;
        
        if (scopeName === 'locals') {
            let locals: Scope | undefined = this.scopes.find((scope) => scope.name === 'locals');
            if (locals === undefined) {
                // error, not a valid scope
                locals = this.scopes[0];
            }
            let variable = new Variable(locals.variablesReference);
            if (variable === undefined) {
                // error
                throw new Error('variable was undefined!');
            }
            this.dfsStack.push(variable);
            this.traverseVariableTreeIterative(new Variable(locals.variablesReference), 
                                               2, (s: string) => s === 'hey');
        }
                
        this.term = '';
        this.searchInProgress = false;
    }

    // comp: do we want to regex? or just check if contains, etc.
    private traverseVariableTree(root: Variable, depth: number, pathToHere: Array<string>, comp: Function): void {
        this.visited.add(root.variablesReference);

        let childNodes: Array<Variable> | undefined = this.variableMapping.get(root.variablesReference);
        if (childNodes === undefined) {
            childNodes = new Array<Variable>();
        }
    }

    // there's two ways to enter this; the initial way , and a resume. Inital elt is preloaded
    private traverseVariableTreeIterative(root: Variable, depth: number, comp: Function) {

        // gonna be kinda tricky, since we need to 'start and stop...'
        if (this.dfsStack.length > 0) {
            let activeVariable: Variable | undefined = this.dfsStack.pop();

            if (activeVariable === undefined) {
                throw Error('what?');
            }

            // throw and push back in stack
            if (!this.variableInfoMapping.has(root.variablesReference)) {
                // we need to populate this...
                this.getVariableContents(activeVariable.variablesReference);
                this.dfsStack.push(activeVariable);
                // how to bail out?
            }

        }

        if (this.dfsStack.length === 0) {
            this.term = '';
            this.searchInProgress = false;
        }

    }

    private getVariableContents(varRef: number) {
        if (vscode.debug.activeDebugSession === undefined) {
                // we're not debugging
        }
        vscode.debug.activeDebugSession?.customRequest("variables", { variablesReference: varRef });
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
