import VariableSearchDebugAdapterTracker from './VariableSearchDebugAdapterTracker';
import * as vscode from 'vscode';
import Constants from './Constants';
import { Scope } from './DebuggerObjectRepresentations';

export namespace SearchCommands {

    function debuggerPaused(): boolean {
        return vscode.debug.activeDebugSession !== undefined && VariableSearchDebugAdapterTracker.debuggerPaused;
    }

    function debuggerRunningOrExitedError(): string {
        return (vscode.debug.activeDebugSession === undefined)
            ? "VariableSearch: no active debug session." : "VariableSearch: the debugger is not paused.";
    }

    export function searchCommand(): void {
        if (debuggerPaused()) {
            vscode.window.showInputBox({ prompt: "Search for?" }).then(
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