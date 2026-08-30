# Chat UX and SSE API

Chats fix Scope at creation; messages stream over SSE (`status`, `token`,
`citations`, `done`, `error`) from `POST /chats/:id/messages`. Assistant rows
persist display markdown with resolved deep-links plus structured `citations`
jsonb. Citations render as inline links and footer chips opening YouTube.
Creating a Chat is allowed with zero ready Videos; sending fails until the
Scope has corpus. One in-flight answer per Chat; last 10 turns feed the graph.
The React shell separates `/chats`, Sources, and skill-content routes.
