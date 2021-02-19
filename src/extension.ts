// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { exec } from 'child_process';
import { stringify } from 'querystring';
import { Socket } from 'dgram';
import { setFlagsFromString } from 'v8';
import { Console } from 'console';
import { Z_ASCII } from 'zlib';
import { parse } from 'path';
import { Scope } from './DebuggerObjectRepresentations';
import  Constants from './Constants';
import VariableTracker from './VariableTracker';
import VariableSearchDebugAdapterTracker from './VariableSearchDebugAdapterTracker';
import { SearchCommands } from './SearchCommands';


// todo:
// some kind of testcase
// implement logging so we can see what happens; we need observability
// need a tree page, or something.. some kinda UI   
// we sometimes concatenate before printing message, this might be slow.
// need to add a way to exclude non-user code.. is this even possible?
// should only allocate on use./
// commands to disable and enable

// next: gotta bind our threads to frames, 
// then frames to scopes, then scopes to variables




export function activate(context: vscode.ExtensionContext) {
    const trackerFactory = new VariableSearchDebugAdapterTrackerFactory();
    // lets us dispose of the listener when it's done
    context.subscriptions.push(vscode.debug.registerDebugAdapterTrackerFactory('*', trackerFactory));
    
    // might wanna make the callback async here, then we can await functions inside it
    let x = vscode.commands.registerCommand("variableSearch.search", SearchCommands.searchCommand);
    context.subscriptions.push(x);
    

}


class VariableSearchDebugAdapterTrackerFactory implements vscode.DebugAdapterTrackerFactory {
    
    createDebugAdapterTracker(session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterTracker> {
        console.log("Creating new debug adapter tracker");
        const tracker = new VariableSearchDebugAdapterTracker();
        return tracker;
    }
}



export function deactivate() {}