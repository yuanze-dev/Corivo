import type { CorivoDatabase } from '../storage/database.js';
interface AppProps {
    db: CorivoDatabase | null;
    configDir: string;
    dbPath: string;
}
export declare function App({ db, configDir, dbPath }: AppProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=App.d.ts.map