import { BaseMCP } from './BaseMCP';
export declare class FigmaMCP extends BaseMCP {
    private accessToken;
    private baseUrl;
    constructor();
    connect(): Promise<void>;
    private getFileInfo;
    private getComments;
}
