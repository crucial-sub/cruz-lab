# Cruz Lab Knowledge MCP Server

Small local stdio MCP server for reading Cruz Lab documents from this repo.

This is not a new flagship portfolio project. The goal is narrower: wrap existing Cruz Lab project metadata, project posts, blog drafts, and resume notes so an MCP client can inspect the boundary between tools, resources, and prompts.

## Run

```bash
pnpm mcp:knowledge
```

The command starts a stdio server:

```bash
node tools/cruz-lab-knowledge-mcp/server.mjs
```

## Read Scope

The server only reads these repo paths:

- `src/content/projects`
- `data/final-posts`
- `data/resume`

It skips PDFs, `.DS_Store`, images and binary files, `data/cruz-lab-firebase-adminsdk-*.json`, `node_modules`, `dist`, `.astro`, `.vercel`, and `.git`.

## Tools

- `list_projects`: list project metadata documents and related project post counts.
- `search_docs`: keyword search across allowed markdown documents.
- `read_doc`: read one allowed document by repo-relative path or unambiguous slug.
- `get_resume`: read `data/resume/jungsub_resume.md`.
- `get_project_context`: read one project metadata document with its related project post entries.

All tools are read-only. `read_doc` rejects absolute paths and paths outside the allowed document roots.

## Resources

- `cruzlab://projects`
- `cruzlab://resume`
- `cruzlab://project/{slug}`

## Prompts

- `interview_questions`: prompt template for project-based interview questions.
- `blog_post_context`: prompt template for a grounded follow-up post brief.

## Manual Verification

Use MCP Inspector or another local MCP client and run:

- `list_projects`
- `search_docs` with a query such as `MCP`
- `read_doc` with `src/content/projects/cruz-lab/project.md`
- `get_resume`
- `get_project_context` with `cruz-lab`

Also check failure cases:

- `read_doc` with `../package.json` should fail.
- `read_doc` with an unknown slug should fail clearly.
- `search_docs` with a missing term should return an empty list.

## Local MCP Client Config

For clients that accept stdio MCP server config, use this command from the repo root:

```json
{
  "mcpServers": {
    "cruz-lab-knowledge": {
      "command": "node",
      "args": ["tools/cruz-lab-knowledge-mcp/server.mjs"],
      "cwd": "/Users/parkjungsub/projects/cruz-lab"
    }
  }
}
```

Claude Code verification is optional for now. If the subscription is re-enabled later, connect the same stdio command and repeat the manual checks.

## Follow-Up Writing

- General tech post: revisit `data/final-posts/tech/why-everyone-talks-about-mcp.md` after this experiment and add what changed after using a small stdio MCP server.
- Cruz Lab project follow-up candidate: `src/content/projects/cruz-lab/cruz-lab-knowledge-mcp.md`.

Keep the framing modest: this server lets an agent read Cruz Lab documents through MCP; it does not add vector search, embeddings, auth, a web UI, deployment, or CMS changes.
