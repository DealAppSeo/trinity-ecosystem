
import { BaseMCP } from './BaseMCP';
// import { Server } from '@modelcontextprotocol/server-github'; // NOTE: This package is a server, not a client library. 
// We likely need to spawn it or mock its logic if we can't import it directly as a library easily.
// Checking package usage... usually it's run as stdio. 
// For this 'Adapter', we will use Octokit directly to mimic the MCP interface within our specific Node process,
// Since wrapping a stdio server inside a Next.js api route is complex. 
// A "True" MCP architecture would spawn it. 

// ALTERNATIVE: Use Octokit directly but Expose as MCP Tools.
// This is cleaner for a Next.js integrated "Monolith" agent.

import { Octokit } from '@octokit/rest';

export class GitHubMCP extends BaseMCP {
    private octokit: Octokit | null = null;
    private token: string;

    constructor() {
        super('GitHub');
        this.token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN || '';
    }

    async connect(): Promise<void> {
        if (!this.token) {
            throw new Error('GITHUB_PERSONAL_ACCESS_TOKEN is missing');
        }
        this.octokit = new Octokit({ auth: this.token });

        // Verify connection
        const user = await this.octokit.users.getAuthenticated();
        console.log(`[GitHubMCP] Connected as ${user.data.login}`);

        this.registerTool({
            name: 'search_repositories',
            description: 'Search for GitHub repositories',
            schema: {
                type: 'object',
                properties: {
                    query: { type: 'string' }
                },
                required: ['query']
            },
            execute: this.searchRepos.bind(this)
        });

        this.registerTool({
            name: 'get_issue',
            description: 'Get details of a GitHub issue',
            schema: {
                type: 'object',
                properties: {
                    owner: { type: 'string' },
                    repo: { type: 'string' },
                    issue_number: { type: 'number' }
                },
                required: ['owner', 'repo', 'issue_number']
            },
            execute: this.getIssue.bind(this)
        });
    }

    private async searchRepos(args: { query: string }): Promise<string> {
        if (!this.octokit) throw new Error('Not connected');
        const res = await this.octokit.search.repos({ q: args.query, per_page: 5 });
        return JSON.stringify(res.data.items.map(r => ({ full_name: r.full_name, stars: r.stargazers_count, url: r.html_url })), null, 2);
    }

    private async getIssue(args: { owner: string, repo: string, issue_number: number }): Promise<string> {
        if (!this.octokit) throw new Error('Not connected');
        const res = await this.octokit.issues.get({ owner: args.owner, repo: args.repo, issue_number: args.issue_number });
        return JSON.stringify({
            title: res.data.title,
            state: res.data.state,
            body: res.data.body?.substring(0, 500) // Truncate
        }, null, 2);
    }
}
