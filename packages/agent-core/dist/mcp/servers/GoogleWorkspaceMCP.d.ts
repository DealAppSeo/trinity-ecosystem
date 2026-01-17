import { BaseMCP } from './BaseMCP';
export declare class GoogleWorkspaceMCP extends BaseMCP {
    private auth;
    constructor();
    connect(): Promise<void>;
    private listEvents;
    private listEmails;
}
