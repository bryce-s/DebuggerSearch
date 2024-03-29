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
import DebuggerSearchTreeProvider from './DebuggerSearchTreeProvider';
import SearchResultTreeItem from './SearchResultTreeItem';


// some kind of testcase
// implement logging so we can see what happens; we need observability
// need a tree page, or something.. some kinda UI   
// we sometimes concatenate before printing message, this might be slow.
// need to add a way to exclude non-user code.. is this even possible?
// should only allocate on use./
// commands to disable and enable

export function activate(context: vscode.ExtensionContext) {
    const trackerFactory = new VariableSearchDebugAdapterTrackerFactory();

    const debuggerSearchTreeProvider = new DebuggerSearchTreeProvider();

    // lets us dispose of the listener when it's done
    context.subscriptions.push(vscode.debug.registerDebugAdapterTrackerFactory('*', trackerFactory));

    // since this is an array we could just extend it?
    context.subscriptions.push(
		vscode.commands.registerCommand("variableSearch.search", SearchCommands.searchCommand)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand("variableSearch.setThread", SearchCommands.setThread)
	);
    context.subscriptions.push(
        vscode.commands.registerCommand("variableSearch.setFrame", SearchCommands.setFrame)
    );
    context.subscriptions.push(
        vscode.commands.registerCommand("variableSearch.setSearchDepth", SearchCommands.setSearchDepth)
    );
    context.subscriptions.push( 
        vscode.commands.registerCommand("variableSearch.resetParameters", SearchCommands.resetParameters)
    );
    context.subscriptions.push(
        vscode.commands.registerCommand("variableSearch.setScope", SearchCommands.setScope)
    );
    context.subscriptions.push(
        vscode.commands.registerCommand("variableSearch.searchForTerm", SearchCommands.searchForTerm)
    );
    context.subscriptions.push(
        vscode.commands.registerCommand("variableSearch.setSearchType", SearchCommands.setSearchType)
    );
    context.subscriptions.push(
        vscode.commands.registerCommand("variableSearch.searchForTermFromTree", SearchCommands.searchForTermFromTree)
    );
    context.subscriptions.push(
        vscode.commands.registerCommand("variableSearch.refreshSearchTree", 
        async (item: SearchResultTreeItem[] | undefined) => { 
            debuggerSearchTreeProvider.refreshTreeView(item); 
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand("variableSearch.cancelSearch", SearchCommands.cancelSearch)
    );

    VariableSearchDebugAdapterTracker.outputChannel = vscode.window.createOutputChannel("Debugger Search");

    vscode.window.registerTreeDataProvider('variablesSearch.view', debuggerSearchTreeProvider);

}


class VariableSearchDebugAdapterTrackerFactory implements vscode.DebugAdapterTrackerFactory {
    
    createDebugAdapterTracker(session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterTracker> {
        // console.log("Creating new debug adapter tracker");
        const tracker = new VariableSearchDebugAdapterTracker();
        return tracker;
    }
}



export function deactivate() {}
