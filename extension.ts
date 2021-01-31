// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { DebugAdapterTracker, DebugAdapterTrackerFactory,  } from 'vscode';
import { exec } from 'child_process';
import { stringify } from 'querystring';
import { Socket } from 'dgram';
import  RequestConstants from './RequestConstants';


export function activate(context: vscode.ExtensionContext) {
    const tracker_factory = new ProbeRsDebugAdapterTrackerFactory();

    //const descriptor_factory = new ProbeRsDebugAdapterDescriptorFactory();

    context.subscriptions.push(vscode.debug.registerDebugAdapterTrackerFactory('*', tracker_factory));
    //context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('probe_rs', descriptor_factory)); 
}



class ProbeRsDebugAdapterTrackerFactory implements DebugAdapterTrackerFactory {
    
    createDebugAdapterTracker(session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterTracker> {
        console.log("Creating new debug adapter tracker");
        const tracker = new ProbeRsDebugAdapterTracker();
        return tracker;
    }
}

class ProbeRsDebugAdapterTracker implements DebugAdapterTracker {

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
            let trackedVariables: Array<Variable> = new Array<Variable>()
            variables.forEach((variable: any) =>  trackedVariables.push(new Variable(variable.variablesReference))); 
            trackedVariables = trackedVariables.filter((variable) => variable.variablesReference !== 0);
            this.tracker.addVariables(trackedVariables, message.request_seq);
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


interface VariableTracker {

    // add variables to the tree; map request_seq back to its request
    addVariables(v: Array<Variable>, requestSeq: number): void;

    // variablesReference has a pending variables request
    logRequest(seq: number, variableReference: number): void;
    
    // search for a term using the tree
    searchTerm(t: string, scopeName?: string, regex?: boolean, depth?: number): any;
    
    // should serve as root nodes
    addScope(s: Scope): void;
}

class StackTraverser implements VariableTracker {

    private scopes: Array<Scope> = new Array<Scope>();
    private visited: Set<number> = new Set<number>();
    private openRequests: Map<number, number> = new Map<number, number>();
    private activeVariablesReferences: Set<number> = new Set<number>();
    private variableMapping: Map<number, Array<Variable>> = new Map<number, Array<Variable>>();

    public addVariables(v: Array<Variable>, requestSeq: number) : void {
        let variableReference: number | undefined = this.openRequests.get(requestSeq);
        this.openRequests.delete(requestSeq);
        if (variableReference === undefined) {
            // this is an error.
            variableReference = 0;
        }
        let children = this.variableMapping.get(variableReference);
        children?.concat(v);
        children?.forEach(child => this.activeVariablesReferences.add(child.variablesReference));
    }

    public logRequest(seq: number, variableReference: number) {
        this.openRequests.set(seq, variableReference);
    }

    public searchTerm(t: string, scopeName?: string, regex?: boolean, depth?: number): any {

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
