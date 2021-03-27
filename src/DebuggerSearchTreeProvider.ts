import * as vscode from 'vscode';
import SearchResultTreeItem from './SearchResultTreeItem';
import { SearchResult } from './DebuggerObjectRepresentations';

export default class DebuggerSearchTreeProvider implements vscode.TreeDataProvider<SearchResultTreeItem> {
    getTreeItem(element: SearchResultTreeItem) {
        return new SearchResultTreeItem("woof", "bark");
    }
    getChildren(element?: SearchResultTreeItem): Thenable<SearchResultTreeItem[]> {
        if (element === undefined) {
            // this is the root node;
            return Promise.resolve([]);
            return Promise.resolve([new SearchResultTreeItem("woof", "bark")]);
        }
        return Promise.resolve([]);
    }
    private static _onDidChangeTreeData: vscode.EventEmitter<SearchResult | undefined | null | void> = new vscode.EventEmitter<SearchResult | undefined | null | void>();
    static readonly onDidChangeTreeData: vscode.Event<SearchResult | undefined | null | void> = DebuggerSearchTreeProvider._onDidChangeTreeData.event;
  
    public static refreshTreeView(result: SearchResult | undefined = undefined): void {
        if (result !== undefined) {
            this._onDidChangeTreeData.fire(result);
        }
        else {
            this._onDidChangeTreeData.fire(result);
        }
    }
}

