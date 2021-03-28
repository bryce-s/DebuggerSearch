import { ListenOptions } from 'node:net';
import { Z_ASCII } from 'node:zlib';
import * as vscode from 'vscode';
import SearchResultTreeItem from './SearchResultTreeItem';

export default class DebuggerSearchTreeProvider implements vscode.TreeDataProvider<SearchResultTreeItem> {

    private _onDidChangeTreeData: vscode.EventEmitter<SearchResultTreeItem | undefined | null | void> = new vscode.EventEmitter<SearchResultTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<SearchResultTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private rootResults: Array<SearchResultTreeItem> = new Array<SearchResultTreeItem>();

    private pathToValue: Map<string, string> = new Map<string, string>();
    private scopesToSearchResults: Map<string, any> = new Map<string, any>();
  
    public async refreshTreeView(results: SearchResultTreeItem[] | undefined = undefined): Promise<void> {
        this.clearInternalData();
        // we'll handle the entire update from this function.
        if (results !== undefined) {
            this.hashFullPathsToValue(results);
            this.buildNamespaceTree(results);
            this.populateRootResults();
        }
        try {
            this._onDidChangeTreeData.fire();
        } catch (e) {
            console.log(e);
        }
        return;
    }

    public clearInternalData(): void {
        this.rootResults = new Array<SearchResultTreeItem>();
        this.pathToValue = new Map<string, string>();
        this.scopesToSearchResults = new Map<string, any>();
    }

    private hashFullPathsToValue(results: SearchResultTreeItem[]): void {
        results.forEach(result => this.pathToValue.set(result.scope, result.value));
    }

    private buildNamespaceTree(results: SearchResultTreeItem[]): void {
        console.log(results);
        results.forEach(result => {
            let scopePath = result.scope;
            let scopes: Array<string> = scopePath.split('.');

            let activeMap = this.scopesToSearchResults;
            for (let i = 0; i < scopes.length; i ++) {
                let scope = scopes[i];
                if (!activeMap.has(scope)) {
                    activeMap.set(scope, new Map<string,any>());
                }
                activeMap = activeMap.get(scope);
            }
        });
    }

    private populateRootResults(): void {
        for (let rootScope of this.scopesToSearchResults.keys()) {
            this.rootResults.push(new SearchResultTreeItem(rootScope, undefined));
        };
    }

    // Get TreeItem representation of the element
    // @param element — The element for which TreeItem representation is asked for.
    // @return — TreeItem representation of the element
    getTreeItem(element: SearchResultTreeItem): vscode.TreeItem  {
        return element;
    }

    getValue(element: SearchResultTreeItem, pathToHere: string): Thenable<SearchResultTreeItem[]> {
        const value = this.pathToValue.get(element.scope);
        return Promise.resolve([new SearchResultTreeItem(value || '', undefined, pathToHere, vscode.TreeItemCollapsibleState.None)]);
    } 
    // Get the children of element or root if no element is passed.
    // @param element — The element from which the provider gets children. Can be undefined.
    // @return — Children of element or root if no element is passed.
    getChildren(element?: SearchResultTreeItem): Thenable<SearchResultTreeItem[]> {
        // so, if we expand a node in our tree, this function finds its children.
        if (element === undefined) {
            // we're setting the root node. 
            return Promise.resolve(this.rootResults);
        }

        let elementChildren = [];
        const scopePath = element.scope.split('.');

        const pathToHere: string = element.fullPath;

        let activeMap = this.scopesToSearchResults;
        for (let i = 0; i < scopePath.length; i++) {
            const path = scopePath[i];
            if (!activeMap.has(path)) {
                return this.getValue(element, pathToHere + "." + path);
            }
            activeMap = activeMap.get(path);
        }

        if (activeMap === undefined || activeMap.size === 0) {
            // this is a value node
            // path to here shouldn't matter
            return this.getValue(element, pathToHere);
        } else {
            let children: Array<any> = Array<any>();
            // -_-
            for (let key of activeMap.keys()) {
                children.push(key);
            }
            children.sort();
            return Promise.resolve(children.map((child) => new SearchResultTreeItem(child)));
        }
    }



}
