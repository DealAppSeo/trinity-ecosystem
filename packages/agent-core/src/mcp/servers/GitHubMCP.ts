
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
    private owner: string;
    private repo: string;

    constructor() {
        super('GitHub');
        this.token = process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN || '';
        this.owner = process.env.GITHUB_ORG || '';
        this.repo = process.env.GITHUB_REPO || '';
    }

    async connect(): Promise<void> {
        if (!this.token) {
            throw new Error('GITHUB_TOKEN is missing');
        }
        this.octokit = new Octokit({ auth: this.token });

        // Verify connection
        const user = await this.octokit.users.getAuthenticated();
        console.log(`[GitHubMCP] Connected as ${user.data.login}`);

        this.registerTool({
            name: 'search_repositories',
            description: 'Search for GitHub repositories. Arguments: query (string), owner (string, optional).',
            schema: {
                type: 'object',
                properties: {
                    query: { type: 'string' },
                    owner: { type: 'string' }
                },
                required: ['query']
            },
            execute: this.searchRepos.bind(this)
        });

        this.registerTool({
            name: 'get_issue',
            description: 'Get details of a GitHub issue. Defaults to GITHUB_ORG/GITHUB_REPO if not specified.',
            schema: {
                type: 'object',
                properties: {
                    owner: { type: 'string' },
                    repo: { type: 'string' },
                    issue_number: { type: 'number' }
                },
                required: ['issue_number']
            },
            execute: this.getIssue.bind(this)
        });

        this.registerTool({
            name: 'create_pr',
            description: 'Creates a new pull request. Arguments: title (string), head (string), base (string), body (string, optional), owner (string, optional), repo (string, optional).',
            schema: {
                type: 'object',
                properties: {
                    title: { type: 'string' },
                    head: { type: 'string' },
                    base: { type: 'string' },
                    body: { type: 'string' },
                    owner: { type: 'string' },
                    repo: { type: 'string' }
                },
                required: ['title', 'head', 'base']
            },
            execute: async (args: any) => this.createPR(args)
        },
            {
                name: 'update_file',
                description: 'Creates or updates a file. Arguments: path (string), content (string), message (string), branch (string, optional), sha (string, optional), owner (string, optional), repo (string, optional).',
                schema: {
                    type: 'object',
                    properties: {
                        path: { type: 'string' },
                        content: { type: 'string' },
                        message: { type: 'string' },
                        branch: { type: 'string' },
                        sha: { type: 'string' },
                        owner: { type: 'string' },
                        repo: { type: 'string' }
                    },
                    required: ['path', 'content', 'message']
                },
                execute: async (args: any) => this.updateFile(args)
            },
            {
                name: 'create_branch',
                description: 'Creates a new branch. Arguments: branch (string), base (string), owner (string, optional), repo (string, optional).',
                schema: {
                    type: 'object',
                    properties: {
                        branch: { type: 'string' },
                        base: { type: 'string' },
                        owner: { type: 'string' },
                        repo: { type: 'string' }
                    },
                    required: ['branch', 'base']
                },
                execute: async (args: any) => this.createBranch(args)
            },
            {
                name: 'read_repo_file',
                description: 'Reads the content of a file. Arguments: path (string), branch (string, optional), owner (string, optional), repo (string, optional).',
                schema: {
                    type: 'object',
                    properties: {
                        path: { type: 'string' },
                        branch: { type: 'string' },
                        owner: { type: 'string' },
                        repo: { type: 'string' }
                    },
                    required: ['path']
                },
                execute: async (args: any) => this.readFile(args)
            },
            {
                name: 'get_repo_tree',
                description: 'Lists all files and directories in a repository. Arguments: recursive (boolean, optional), branch (string, optional), owner (string, optional), repo (string, optional).',
                schema: {
                    type: 'object',
                    properties: {
                        recursive: { type: 'boolean' },
                        branch: { type: 'string' },
                        owner: { type: 'string' },
                        repo: { type: 'string' }
                    }
                },
                execute: async (args: any) => this.getRepoTree(args)
            },
            {
                name: 'list_branches',
                description: 'Lists all branches in the repository. Arguments: per_page (number, optional), owner (string, optional), repo (string, optional).',
                schema: {
                    type: 'object',
                    properties: {
                        per_page: { type: 'number' },
                        owner: { type: 'string' },
                        repo: { type: 'string' }
                    }
                },
                execute: async (args: any) => this.listBranches(args)
            },
            {
                name: 'submit_pr_review',
                description: 'Submits a pull request review. Arguments: pull_number (number), event (string: APPROVE, REQUEST_CHANGES, or COMMENT), body (string, optional), owner (string, optional), repo (string, optional).',
                schema: {
                    type: 'object',
                    properties: {
                        pull_number: { type: 'number' },
                        event: { type: 'string', enum: ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'] },
                        body: { type: 'string' },
                        owner: { type: 'string' },
                        repo: { type: 'string' }
                    },
                    required: ['pull_number', 'event']
                },
                execute: async (args: any) => this.submitPRReview(args)
            }
        );
    }

    private async searchRepos(args: { query: string, owner?: string }): Promise<string> {
        if (!this.octokit) throw new Error('Not connected');
        const owner = args.owner || this.owner;
        const q = owner ? `user:${owner} ${args.query}` : args.query;
        const res = await this.octokit.search.repos({ q, per_page: 5 });
        return JSON.stringify(res.data.items.map(r => ({ full_name: r.full_name, stars: r.stargazers_count, url: r.html_url })), null, 2);
    }

    private async getIssue(args: { owner?: string, repo?: string, issue_number: number }): Promise<string> {
        if (!this.octokit) throw new Error('Not connected');
        const owner = args.owner || this.owner;
        const repo = args.repo || this.repo;
        if (!owner || !repo) throw new Error('Owner or Repo missing');
        const res = await this.octokit.issues.get({ owner, repo, issue_number: args.issue_number });
        return JSON.stringify({
            title: res.data.title,
            state: res.data.state,
            body: res.data.body?.substring(0, 500) // Truncate
        }, null, 2);
    }

    private async createPR(args: { title: string, head: string, base: string, body?: string, owner?: string, repo?: string }): Promise<string> {
        if (!this.octokit) throw new Error('Not connected');
        const owner = args.owner || this.owner;
        const repo = args.repo || this.repo;
        if (!owner || !repo) throw new Error('Owner or Repo missing');
        const res = await this.octokit.pulls.create({
            owner,
            repo,
            title: args.title,
            head: args.head,
            base: args.base,
            body: args.body
        });
        return `PR Created: ${res.data.html_url}`;
    }

    private async updateFile(args: { path: string, content: string, message: string, branch?: string, sha?: string, owner?: string, repo?: string }): Promise<string> {
        if (!this.octokit) throw new Error('Not connected');
        const owner = args.owner || this.owner;
        const repo = args.repo || this.repo;
        if (!owner || !repo) throw new Error('Owner or Repo missing');
        const res = await this.octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: args.path,
            message: args.message,
            content: Buffer.from(args.content).toString('base64'),
            branch: args.branch,
            sha: args.sha
        });
        return `File Updated: ${res.data.content?.html_url} (Commit: ${res.data.commit.sha})`;
    }

    private async createBranch(args: { branch: string, base: string, owner?: string, repo?: string }): Promise<string> {
        if (!this.octokit) throw new Error('Not connected');
        const owner = args.owner || this.owner;
        const repo = args.repo || this.repo;
        if (!owner || !repo) throw new Error('Owner or Repo missing');

        // 1. Get SHA of base branch
        const baseRef = await this.octokit.git.getRef({
            owner,
            repo,
            ref: `heads/${args.base}`
        });
        const sha = baseRef.data.object.sha;

        // 2. Create new branch
        await this.octokit.git.createRef({
            owner,
            repo,
            ref: `refs/heads/${args.branch}`,
            sha: sha
        });

        return `Branch '${args.branch}' created successfully from '${args.base}' in ${owner}/${repo}.`;
    }

    private async readFile(args: { path: string, branch?: string, owner?: string, repo?: string }): Promise<string> {
        if (!this.octokit) throw new Error('Not connected');
        const owner = args.owner || this.owner;
        const repo = args.repo || this.repo;
        if (!owner || !repo) throw new Error('Owner or Repo missing');
        const res = await this.octokit.repos.getContent({
            owner,
            repo,
            path: args.path,
            ref: args.branch
        });

        if (Array.isArray(res.data)) {
            return `This path is a directory in ${owner}/${repo}. Entries: ${res.data.map(i => i.name).join(', ')}`;
        }

        if ('content' in res.data) {
            return Buffer.from(res.data.content, 'base64').toString('utf-8');
        }

        return "Error: Could not read file content.";
    }

    private async getRepoTree(args: { recursive?: boolean, branch?: string, owner?: string, repo?: string }): Promise<string> {
        if (!this.octokit) throw new Error('Not connected');
        const owner = args.owner || this.owner;
        const repo = args.repo || this.repo;
        if (!owner || !repo) throw new Error('Owner or Repo missing');

        // 1. Get the SHA of the branch head
        const branch = args.branch || 'main';
        const ref = await this.octokit.git.getRef({
            owner,
            repo,
            ref: `heads/${branch}`
        });
        const sha = ref.data.object.sha;

        // 2. Get the tree
        const tree = await this.octokit.git.getTree({
            owner,
            repo,
            tree_sha: sha,
            recursive: args.recursive ? 'true' : undefined
        });

        return JSON.stringify(tree.data.tree.map(i => ({
            path: i.path,
            type: i.type,
            size: i.size
        })), null, 2);
    }

    private async listBranches(args: { per_page?: number, owner?: string, repo?: string }): Promise<string> {
        if (!this.octokit) throw new Error('Not connected');
        const owner = args.owner || this.owner;
        const repo = args.repo || this.repo;
        if (!owner || !repo) throw new Error('Owner or Repo missing');
        const res = await this.octokit.repos.listBranches({
            owner,
            repo,
            per_page: args.per_page || 30
        });
        return JSON.stringify(res.data.map(b => b.name), null, 2);
    }

    private async submitPRReview(args: { pull_number: number, event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT', body?: string, owner?: string, repo?: string }): Promise<string> {
        if (!this.octokit) throw new Error('Not connected');
        const owner = args.owner || this.owner;
        const repo = args.repo || this.repo;
        if (!owner || !repo) throw new Error('Owner or Repo missing');

        const res = await this.octokit.pulls.createReview({
            owner,
            repo,
            pull_number: args.pull_number,
            event: args.event,
            body: args.body
        });

        return `Review submitted: ${res.data.html_url}`;
    }
}
