import * as vscode from 'vscode';
import { Variable, VariableInfo, Scope } from './DebuggerObjectRepresentations';

export default interface VariableTracker {

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


    cancelSearch(): void;

    resumeSearch(): void;

    searchInProgress: boolean;

}
