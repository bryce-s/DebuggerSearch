import VariableSearchDebugAdapterTracker from './VariableSearchDebugAdapterTracker';
import * as vscode from 'vscode';
import Constants from './Constants';
import { Scope, ThreadTracker } from './DebuggerObjectRepresentations';

export namespace SearchCommands {


    export function debuggerPaused(): boolean {
        if (vscode.debug.activeDebugSession !== undefined && VariableSearchDebugAdapterTracker.debuggerPaused) {
            return true;
        }
        debuggerRunningOrExitedError();
        return false;
    }

    export function debuggerRunningOrExitedError(): string {
        return (vscode.debug.activeDebugSession === undefined)
            ? "VariableSearch: no active debug session." : "VariableSearch: the debugger is not paused.";
    }

    export async function setThread(message: string = "Choose a thread..."): Promise<void> {
        if (debuggerPaused()) {
            let currentThreads: Array<any> = VariableSearchDebugAdapterTracker.threadTracker.threads || new Array<any>();
            let items: Array<any> = currentThreads.map((threadInfo) => {
                return {
                    label: `${threadInfo.id}: ${threadInfo.name}`,
                    description: ``,
                    command: `${threadInfo.id}`,
                };
            });
            let threadChoice = await vscode.window.showQuickPick(items, { placeHolder: message });
            if (debuggerPaused() && threadChoice !== undefined) {
                let targetThread: number = parseInt(threadChoice.command);
                VariableSearchDebugAdapterTracker.selectedThreads.push(targetThread);
            }
        }
    }

    export async function setFrame(message: string = "Choose a stack frame..."): Promise<void> {
        if (debuggerPaused()) {
            let selectedThreads: Array<number> = VariableSearchDebugAdapterTracker.selectedThreads;
            if (selectedThreads.length < 1) {
                vscode.window.showErrorMessage("A thread must be selected first.");
                await setThread("First, choose a thread...");
                selectedThreads = VariableSearchDebugAdapterTracker.selectedThreads;
            }
            selectedThreads.forEach(async (threadId: any) => {
                let frames = await vscode.debug.activeDebugSession?.customRequest(Constants.stackTrace, {
                    threadId: threadId,
                    startFrame: 0,
                    levels: 20, //todo: get this from a setting, or something.
                });
                if (!frames) {
                    vscode.window.showErrorMessage("No stack frames found.");
                    return;
                }
                frames = frames.stackFrames;
                let i: number = 0;
                let items = frames.map((frame: any) => {
                    let res = {
                        label: `Stack Frame ${i.toString()}: ${frame.name}${(i === 0) ? " (top) " : ""}`,
                        description: ``,
                        command: frame.id,
                    };
                    i++;
                    return res;
                });
                let frameChoice: any = await vscode.window.showQuickPick(items, { placeHolder: message });
                if (debuggerPaused() && frameChoice !== undefined) {
                    VariableSearchDebugAdapterTracker.selectedFrames.push(frameChoice.command);
                }
            });
        }
    }

    export async function searchForTerm(): Promise<void> {
        if (debuggerPaused()) {
            if (!VariableSearchDebugAdapterTracker.selectedThreads.length) {
                await setThread("Before searching, select a thread...");
            }
            if (!VariableSearchDebugAdapterTracker.selectedFrames.length) {
                await setFrame("Before searching, select a stack frame...");
            }
            let frameTargets = VariableSearchDebugAdapterTracker.selectedFrames;

            let allThenAbles: Array<any> = Array<any>();

            allThenAbles.push(
                vscode.window.showInputBox({ prompt: "Search for?", }).then((term: string | undefined) => {
                    if (term === undefined) {
                        vscode.window.showErrorMessage("Must enter a term to search");
                    }
                })
            );

            frameTargets.forEach(async (frame: number) => {
                allThenAbles.push(
                    vscode.debug.activeDebugSession?.customRequest(Constants.scopes, { frameid: frame }).then((scopes) => {
                        VariableSearchDebugAdapterTracker.generateNewTracker();
                        scopes.forEach(async (s: any) => {
                            VariableSearchDebugAdapterTracker.trackerReference?.addScope(new Scope(s.expensive, s.name,
                                s.presentationHint, s.variablesReference));
                        });
                    })
                );
                // how can we kick off asking for the search term ahead of time, while 
                // we do the above?
                // https://stackoverflow.com/questions/50924814/node-js-wait-for-multiple-async-calls-to-finish-before-continuing-in-code/50925514
                // need to use Promise.all()
                // or Task.WhenAll(RequestTerm(), OtherFunction())
                //VariableSearchDebugAdapterTracker.trackerReference?.searchTerm()
                //https://stackoverflow.com/questions/41292316/how-do-i-await-multiple-promises-in-parallel-without-fail-fast-behavior
            });

        }
    }



    export function searchCommand(): void {
        if (debuggerPaused()) {
            vscode.window.showInputBox({ prompt: "Search for?", }).then(
                (term: string | undefined) => {
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
                        vscode.window.showQuickPick(options, { canPickMany: false }).then((option: any) => {
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
            vscode.debug.activeDebugSession?.customRequest(Constants.stackTrace, {
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
            vscode.debug.activeDebugSession?.customRequest(Constants.scopes, {
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