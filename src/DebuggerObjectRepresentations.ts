import { CommentThreadCollapsibleState } from "vscode";

export class StackFrameTracker {
    private stackFrames: Array<any> | undefined;

    public addFrames(frames: Array<any>) {
        this.stackFrames = frames;
    }

    public clearFrames(): void {
        this.stackFrames = undefined;
    }

}

export class ThreadTracker {
    public threads: Array<any> | undefined; 

    // add paused threads to tracker
    public addThreads(threadIds: Array<any>) {
        this.threads = threadIds;
    }

    public clearThreads(): void {
        this.threads = undefined;
    }
}

export class Scope {

    public expensive: boolean = false;
    public name: string = '';
    public presentationHint: string = '';
    public variablesReference: number = -1;

    constructor(expensiveIn: boolean, nameIn: string, presentationHintIn: string, variablesReferenceIn: number) {
        this.expensive = expensiveIn;
        this.name = nameIn;
        this.presentationHint = presentationHintIn;
        this.variablesReference = variablesReferenceIn;
    }

}

export class Variable {

    public variablesReference: number = -1;
    public depthFoundAt: number = 1;
    public nameEntries: Array<string> = new Array<string>();

    constructor(variablesReferenceIn: number, priorDepthIn: number | undefined = undefined, 
        previousScope: Array<string> | undefined = undefined) {
        this.variablesReference = variablesReferenceIn;
        if (priorDepthIn !== undefined) {
            this.depthFoundAt += priorDepthIn;
        }
        if (previousScope !== undefined) {
            // shallow copy old reference
            this.nameEntries = previousScope.slice();
        }
    }
}

export class SearchResult {
	public variablesReference: number = -1;
    public result: string = '';
    public eval: string = '';
    public path: string = '';
    public pathAsArray: Array<string> = new Array<string>();
    constructor(variablesReferenceIn: number, resultIn: string, evalIn: string, pathIn: string, pathAsArrayIn: Array<string>) {
		this.variablesReference = variablesReferenceIn;
        this.result = resultIn;
        this.eval = evalIn;
        this.path = pathIn;
        this.pathAsArray = pathAsArrayIn;
    }
}

export class VariableInfo {

    public variableReference: number = -1;
    public name: string = ''; // "01" (this is the 'real' name)
    public type: string = ''; // "str"
    public evaluateName: string = ''; // "Image.PropertyName"
    public value: any = undefined;

    constructor(variableReferencesIn: number, nameIn: string, typeIn: string, evaluateNameIn: string, valueIn: any) {
        this.variableReference = variableReferencesIn;
        this.name = nameIn;
        this.type = typeIn;
        this.evaluateName = evaluateNameIn;
        this.value = valueIn;
    }

}



export class VariableSearchLogger {
    public enabled: boolean = false;

    public writeLog(content: any): void {
        if (this.enabled) {
            console.log(content);
        }
    }

    constructor(enabled: boolean = false) {
        this.enabled = enabled;
    }
}
