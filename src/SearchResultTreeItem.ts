import * as vscode from 'vscode';
import * as path from 'path';

export default class SearchResultTreeItem extends vscode.TreeItem {


    public readonly scope: string;
    public readonly value: string;

    constructor(scope: string, value: string) {
        super("bryce", undefined );
        this.scope = scope;
        this.value = value;
        this.tooltip = scope;
        this.description = "this is our desc";
    }

    iconPath = {
        light: path.join(__filename, '..', '..', 'resources', 'light', 'dependency.svg'),
        dark: path.join(__filename, '..', '..', 'resources', 'dark', 'dependency.svg')
      };
}
