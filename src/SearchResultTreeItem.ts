import * as vscode from 'vscode';
import * as path from 'path';
import { stat } from 'node:fs';

export default class SearchResultTreeItem extends vscode.TreeItem {


    public readonly scope: string = '';
    public readonly value: string = '';
    public readonly fullPath: string = '';
    public readonly pathAsArray: Array<string> | undefined = undefined;

    constructor(scope: string, 
        value: string | undefined = undefined,
        fullPath: string | undefined = undefined,
        pathAsArray: Array<string> | undefined = undefined,
        state: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed) {
        super(scope, state);
        this.scope = scope;
        if (value !== undefined) {
            this.value = value;
        }
        this.fullPath = fullPath || '';
        this.tooltip = scope;
        this.description = this.value;
        this.pathAsArray = pathAsArray;
    }

    // iconPath = {
    //     light: path.join(_filename, '..', '..', 'resources', 'light', 'dependency.svg'),
    //     dark: path.join(_filename, '..', '..', 'resources', 'dark', 'dependency.svg')
    //   };
}
