import * as vscode from 'vscode';
import VariableTracker from './VariableTracker';
import { Scope, Variable, SearchResult, VariableInfo, VariableSearchLogger } from './DebuggerObjectRepresentations';
import Constants from './Constants';
import VariableSearchDebugAdapterTracker from './VariableSearchDebugAdapterTracker';

export default class ScopeTraverser implements VariableTracker {

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

	private foundResults: Set<number> = new Set<number>();
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

    private printSearchingMessage(term: string, depth: number, openChannel: boolean, clearChannel: boolean, 
                                  channel: vscode.OutputChannel | undefined) {
        if (channel !== undefined) {
            if (clearChannel) {
                channel.clear();
            }
            if (openChannel) {
                channel.show();
            } 
            if (!clearChannel) {
                channel.appendLine(Constants.outputDivider);
            }
            channel.appendLine(`Searching for:  ${term}`);
            channel.appendLine(`In thread:      ${VariableSearchDebugAdapterTracker.selectedThreads[0]}`);
            channel.appendLine(`In stack frame: ${VariableSearchDebugAdapterTracker.selectedThreads[0]}`);
            channel.appendLine(`At depth:       ${depth}`);
            channel.appendLine(Constants.outputDivider);
        }
    }

    public searchTerm(t: string, scopeId?: string, regex?: boolean, depth?: number): any {
        this.searchInProgress = true;
        this.term = t;
        this.depthToSearch = (depth === undefined) ? 3 : depth;
        this.searchWithRegex = (regex !== undefined) ? regex : false;

        let channel = VariableSearchDebugAdapterTracker.outputChannel;
        this.printSearchingMessage(this.term, this.depthToSearch, true, true, channel);
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
                if ((checkString(info.evaluateName || '', this.term) || checkString(info.name || '', this.term) 
                    || checkString(info.value || '', this.term)) && info.evaluateName !== undefined) {
				    let resultsFoundBeforeAdd: number = this.foundResults.size;
					this.foundResults.add(info.variableReference);
				    if (resultsFoundBeforeAdd !== this.foundResults.size) {
                    	this.results.push(new SearchResult(info.variableReference, info.value, info.evaluateName));
					}
                }
            });
        }

        if (this.dfsStack.length === 0) {
            this.term = '';
            this.searchInProgress = false;
            this.searchWithRegex = false;
            console.log(`results:`, this.results);

            let outputChannel = VariableSearchDebugAdapterTracker.outputChannel;
            this.printResultsToConsole(this.results, outputChannel);
            this.openOutputWindow(outputChannel);
        }

        return false;
    }

    private printResultsToConsole(results: Array<SearchResult>, channel: vscode.OutputChannel | undefined) {
        if (channel !== undefined) {
            results.forEach(result => {
                channel!.appendLine(`- ${result.eval}\n${result.result}`);
            });
            channel?.appendLine(Constants.outputDivider);
            channel?.appendLine(`Search complete. ${this.results?.length} ${(this.results.length === 1) ? "result" : "results"} found.`);
            channel?.appendLine(Constants.outputDivider);
        }
    }
    
    private openOutputWindow(console: vscode.OutputChannel | undefined) {
        if (console !== undefined) {
            console.show();
        }
    }


    private getVariableContents(varRef: number) {
        if (!this.variableDataRequested.has(varRef)) {
            this.variableDataRequested.add(varRef);
            if (vscode.debug.activeDebugSession === undefined) {
                // we're not debugging
                const message: string = "Active debug session required.";
                vscode.window.showErrorMessage(message);
                throw new Error(message);
            }
            (this.logger.enabled )? this.logger.writeLog(`Requesting variable info for variablesReference ${varRef}`) : ()=>{};
            // can't just resolve the promise; no way to bind it back:
            vscode.debug.activeDebugSession?.customRequest(Constants.variables, { variablesReference: varRef });
        }
    }

    public addScope(s: Scope): void {
        this.scopes.push(s);
        this.activeVariablesReferences.add(s.variablesReference);
        this.variableMapping.set(s.variablesReference, new Array<Variable>());
    }
}
