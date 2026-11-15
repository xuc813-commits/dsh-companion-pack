import { Store } from './store.ts';
export declare function exportAgent(store: Store, home: string, id: string, dest: string): Promise<{
    path: string;
    snapshotId: `${string}-${string}-${string}-${string}-${string}`;
}>;
export declare function importAgent(store: Store, home: string, src: string, name: string): import("./store.ts").Companion;
