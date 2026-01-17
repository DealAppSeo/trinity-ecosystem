import { BaseMCP } from './BaseMCP';
export declare class PlaywrightMCP extends BaseMCP {
    private browser;
    private page;
    constructor();
    connect(): Promise<void>;
    private browsePage;
    private takeScreenshot;
}
