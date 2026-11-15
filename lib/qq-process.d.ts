export interface QqProcess {
    pid: number;
    path: string;
    startedAt: string;
    visible: boolean;
}
export declare function compatibleProcess(p: QqProcess, executable?: string): boolean;
export declare function chooseQqProcess(processes: QqProcess[], choice?: {
    pid: number;
    startedAt: string;
}, executable?: string): QqProcess | undefined;
