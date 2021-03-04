import VariableSearchDebugAdapterTracker from './VariableSearchDebugAdapterTracker';
import * as vscode from 'vscode';
import Constants from './Constants';
import { Scope, ThreadTracker, Variable } from './DebuggerObjectRepresentations';
import { parse, resolve } from 'path';
import { rejects } from 'assert';
import { clear } from 'console';

export namespace SearchCommands {


    export function debuggerPaused(): boolean {
        if (vscode.debug.activeDebugSession !== undefined && VariableSearchDebugAdapterTracker.debuggerPaused) {
            return true;
        }
        vscode.window.showWarningMessage(
            debuggerRunningOrExitedError()
        );
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
            let threadChoice = await vscode.window.showQuickPick(items, {
                   placeHolder: message,
                   ignoreFocusOut: true
                });
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

            for (let threadId of selectedThreads) {
                let frames = await vscode.debug.activeDebugSession?.customRequest(Constants.stackTrace, {
                    threadId: threadId,
                    startFrame: 0,
                    levels: 20, //todo: get this from a setting, or something.
                });
                if (!frames) {
                    await vscode.window.showErrorMessage("No stack frames found.");
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
                let frameChoice: any = await vscode.window.showQuickPick(items, {
                        placeHolder: message,
                        ignoreFocusOut: true
                     });
                if (debuggerPaused() && frameChoice !== undefined) {
                    VariableSearchDebugAdapterTracker.selectedFrames.push(frameChoice.command);
                } else {
                    // this crashes things..
                    const message: string = "Failed to select a frame!";
                    vscode.window.showErrorMessage(message);
                    return Promise.reject(message);
                }
            }
        }
    }

    // not dependent on having a running debug session.
    export async function setSearchDepth(): Promise<void> {
        let candidates = Array.from(Array(10).keys()).filter(c => ![0,1,2].includes(c));;
        const choice = await vscode.window.showQuickPick(candidates.map(c => c.toString()), 
                      {
                          placeHolder: "Select depth to search...",
                          ignoreFocusOut: true
                      });
        if (choice !== undefined) {
                VariableSearchDebugAdapterTracker.depth = parseInt(choice);
        }
        else {
            const message: string = "Failed to select search depth!";
            vscode.window.showErrorMessage(message);
            return Promise.reject(message);
        }
    }

    export function resetParameters(): void {
        clearThreadsAndFrame();
        resetSearchDepth();
    }


    function resetSearchDepth(): void {
        VariableSearchDebugAdapterTracker.depth = undefined;
    }

    function clearThreadsAndFrame(): void {
        VariableSearchDebugAdapterTracker.clearSelectedFrames();
        VariableSearchDebugAdapterTracker.clearSelectedThreads();
    }

    async function setFramesAndThreadsIfNeeded(): Promise<void> {
        if (!VariableSearchDebugAdapterTracker.selectedThreads.length) {
            await setThread("Before searching, select a thread...");
        }
        if (!VariableSearchDebugAdapterTracker.selectedFrames.length) {
            await setFrame("Before searching, select a stack frame...");
        }
        if (VariableSearchDebugAdapterTracker.depth === undefined) {
            await setSearchDepth();
        }
    }

    export async function searchForTerm(): Promise<void> {
        if (debuggerPaused()) {

            await setFramesAndThreadsIfNeeded();

            let frameTargets = VariableSearchDebugAdapterTracker.selectedFrames;
            let searchTerm: string = '';

            let termAndScopes = await Promise.all(
                [vscode.window.showInputBox(
                    { 
                        prompt: "Search for term in {Thread} , {Frame}.\nOr type --reset to change search parameters.\n",
                        ignoreFocusOut: true
                    })].concat(
                    frameTargets.map(async (frame: number) => {
                        return vscode.debug.activeDebugSession?.customRequest(Constants.scopes, { frameId: frame });
                    }))
            );

            if (termAndScopes.some((result: any) => result === undefined)) {
                return;
            }

            VariableSearchDebugAdapterTracker.generateNewTracker();

            termAndScopes.forEach((result: any) => {
                if (typeof result === 'string') {
                   searchTerm = result; 
                } else {
                    // it's not undefined, so it's scopes object.
                    if (result === undefined) {
                        return;
                    }
                    let message = result;
                    let scopes = message.scopes;
                    scopes.forEach((s: any) => {
                       VariableSearchDebugAdapterTracker.trackerReference?.addScope(
                           new Scope(s.expensive, s.name, s.presentationHint, s.variablesReference)
                       );
                    });
                }
            });

            const depth = (VariableSearchDebugAdapterTracker.depth !== undefined) ? VariableSearchDebugAdapterTracker.depth : 3 ; 

            VariableSearchDebugAdapterTracker.trackerReference?.searchTerm(searchTerm, undefined, false, depth);
        }
    }



    export function searchCommand(): void {
        if (debuggerPaused()) {
            vscode.window.showInputBox(
                { 
                    prompt: "Search for?",
                    ignoreFocusOut: true
                 }).then(
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
                        vscode.window.showQuickPick(options, {
                             canPickMany: false,
                             ignoreFocusOut: true
                            }).then((option: any) => {
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