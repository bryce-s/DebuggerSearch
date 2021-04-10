import VariableSearchDebugAdapterTracker from './VariableSearchDebugAdapterTracker';
import * as vscode from 'vscode';
import Constants from './Constants';
import { Scope, ThreadTracker, Variable, VariableSearchLogger } from './DebuggerObjectRepresentations';
import { parse, resolve } from 'path';
import { rejects } from 'assert';
import { clear } from 'console';
import { Z_ASCII } from 'node:zlib';

export namespace SearchCommands {

    export function cancelSearch(): void {
        if (debuggerPaused()) {
            VariableSearchDebugAdapterTracker.cancelSearch();
        }
    }


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
                    threadId: threadInfo.id,
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
                VariableSearchDebugAdapterTracker.selectedThread = threadChoice;
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
                        number: i,
                        name: frame.name,
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
                    VariableSearchDebugAdapterTracker.selectedFrame = frameChoice;
                } else {
                    // this crashes things..
                    const message: string = "Failed to select a frame!";
                    vscode.window.showErrorMessage(message);
                    return Promise.reject(message);
                }
            }
        }
    }

    export async function setScope(): Promise<void> {
        if (debuggerPaused()) {
            if (VariableSearchDebugAdapterTracker.selectedThread === undefined) {
                vscode.window.showErrorMessage("A thread must be selected first");
                await setThread();
            }
            if (VariableSearchDebugAdapterTracker.selectedFrame === undefined) {
                vscode.window.showErrorMessage("A frame must be selected first");
                await setFrame();
            }

            let frame: number = VariableSearchDebugAdapterTracker.selectedFrame.command;

            let scopeResponse: any = await vscode.debug.activeDebugSession?.customRequest(Constants.scopes, { frameId: frame });

            if (!scopeResponse || !scopeResponse.scopes) {
                vscode.window.showErrorMessage("Failed to load scopes");
                return;
            }

            let scopes = scopeResponse.scopes;

            let scopeChoices = scopes.map((scope: any) => scope.name);
            scopeChoices.unshift(Constants.allScopes);

            let choiceOfScope = await vscode.window.showQuickPick(
                scopeChoices,
                {
                    placeHolder: "Select scope to search...",
                    ignoreFocusOut: true
                }
            );

            if (choiceOfScope !== undefined) {
                VariableSearchDebugAdapterTracker.clearSelectedScope();
                if (choiceOfScope === Constants.allScopes) {
                    VariableSearchDebugAdapterTracker.selectedScope = Constants.allScopes;
                }
                else {
                    VariableSearchDebugAdapterTracker.selectedScope = scopes.filter((s: any) => s.name === choiceOfScope)[0];
                }
            }
        }
    }

    // not dependent on having a running debug session.
    export async function setSearchDepth(): Promise<void> {
        let candidates = Array.from(Array(10).keys()).filter(c => ![0, 1].includes(c));;
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

    export async function setSearchTypeIfNeeded(): Promise<void> {
        if (VariableSearchDebugAdapterTracker.selectedSearchType === undefined) {
            await setSearchType();
        }
    }

    export async function setSearchType(): Promise<void> {
        const choice = await vscode.window.showQuickPick(
            [Constants.containsDefault, Constants.regex, Constants.exactMatch],
            {
                placeHolder: "Select search type...",
                ignoreFocusOut: true
            }
        );
        if (choice !== undefined) {
            VariableSearchDebugAdapterTracker.selectedSearchType = choice;
        } else {
            const message: string = "Failed to set a search type!";
            vscode.window.showErrorMessage(message);
            return Promise.reject(message);
        }
    }

    function clearSearchType() {
        VariableSearchDebugAdapterTracker.selectedSearchType = undefined;
    }

    export function resetParameters(): void {
        clearThreadsAndFrame();
        resetSearchDepth();
        clearSearchType();
    }


    function resetSearchDepth(): void {
        VariableSearchDebugAdapterTracker.depth = undefined;
    }

    function clearThreadsAndFrame(): void {
        VariableSearchDebugAdapterTracker.selectedThread = undefined;
        VariableSearchDebugAdapterTracker.selectedFrame = undefined;
        VariableSearchDebugAdapterTracker.clearSelectedFrames();
        VariableSearchDebugAdapterTracker.clearSelectedThreads();
    }

    function clearDepth() {
        VariableSearchDebugAdapterTracker.depth = undefined;
    }

    async function setFramesAndThreadsIfNeeded(): Promise<void> {
        if (VariableSearchDebugAdapterTracker.selectedThread === undefined) {
            await setThread("Before searching, select a thread...");
        }
        if (VariableSearchDebugAdapterTracker.selectedFrame === undefined) {
            await setFrame("Before searching, select a stack frame...");
        }
        if (VariableSearchDebugAdapterTracker.depth === undefined) {
            await setSearchDepth();
        }
    }

    export async function searchForTermFromTree() {
        await searchForTerm();
    }


    export async function searchForTerm(): Promise<void> {
        if (debuggerPaused()) {

            await setFramesAndThreadsIfNeeded();
            await setSearchTypeIfNeeded();

            let frameTargets = VariableSearchDebugAdapterTracker.selectedFrames;
            let searchTerm: string = '';

            let termAndScopes = await Promise.all(
                [vscode.window.showInputBox(
                    {
                        prompt: `Search in ${VariableSearchDebugAdapterTracker.selectedThread.label
                            }, or reset parameters (${Constants.reset})`,
                        ignoreFocusOut: true
                    })].concat(
                        frameTargets.map(async (frame: number) => {
                            return vscode.debug.activeDebugSession?.customRequest(Constants.scopes, { frameId: frame });
                        }))
            );

            if (termAndScopes.some((result: any) => result === undefined)) {
                return;
            }

            if (termAndScopes.some((result: any) => result === Constants.reset)) {
                resetParameters();
                searchForTerm();
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
                    const selectedScope = VariableSearchDebugAdapterTracker.selectedScope;
                    if (selectedScope === undefined || selectedScope === Constants.allScopes) {
                        VariableSearchDebugAdapterTracker.selectedScope = Constants.allScopes;
                        scopes.forEach((s: any) => {
                            VariableSearchDebugAdapterTracker.trackerReference?.addScope(
                                new Scope(s.expensive, s.name, s.presentationHint, s.variablesReference)
                            );
                        });
                    }
                    else {
                        VariableSearchDebugAdapterTracker.trackerReference?.addScope(
                            new Scope(selectedScope.expensive, selectedScope.name, selectedScope.presentationHint, selectedScope.variablesReference)
                        );
                    }
                }
            });

            const depth = (VariableSearchDebugAdapterTracker.depth !== undefined) ? VariableSearchDebugAdapterTracker.depth : 3;

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