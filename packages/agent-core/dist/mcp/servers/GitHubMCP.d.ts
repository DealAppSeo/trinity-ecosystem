import { BaseMCP } from './BaseMCP';
export declare class GitHubMCP extends BaseMCP {
    private octokit;
    private token;
    constructor();
    connect(): Promise<void>;
    private searchRepos;
    private getIssue;
}
