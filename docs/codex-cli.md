# Codex CLI calling reference

Start `codex app-server` as a child process, then send JSON requests over stdin and read responses and notifications from stdout. The model, effort, prompt, and output schema are passed in these requests.

## 1. Launch the CLI

```bash
codex app-server \
  --disable apps \
  --disable plugins \
  --disable remote_plugin \
  --disable browser_use \
  --disable browser_use_external \
  --disable computer_use \
  --disable image_generation \
  --disable multi_agent \
  --disable in_app_browser \
  -c 'web_search="disabled"' \
  -c 'notify=[]' \
  -c 'approval_policy="never"' \
  -c 'sandbox_mode="read-only"'
```

Stdio is the default transport. Set the child process's working directory to the directory you want Codex to inspect and use pipes for stdin and stdout. These feature flags reproduce a read-only inspection configuration.

## 2. Initialize the connection

The JSON examples below are formatted for reading. Serialize each object onto one line, followed by a newline, when writing to stdin:

```js
child.stdin.write(`${JSON.stringify(message)}\n`);
```

Send this request first:

```json
{
  "id": 1,
  "method": "initialize",
  "params": {
    "clientInfo": {
      "name": "my_client",
      "title": "My Client",
      "version": "1.0.0"
    },
    "capabilities": null
  }
}
```

Wait for the successful response with `id: 1`, then send this notification:

```json
{
  "method": "initialized"
}
```

Initialize once per connection. Requests have unique IDs; notifications omit the ID. Do not include a `jsonrpc` field.

## 3. Inspect available models and configuration

These are optional requests after initialization. Use a new ID for each request.

| Method | Parameters | Purpose |
| --- | --- | --- |
| `model/list` | `{"cursor": null}` | Get available model IDs; follow `nextCursor` for additional pages. |
| `account/read` | `{}` | Read sign-in information. |
| `account/rateLimits/read` | `null` | Read account usage limits. |
| `config/read` | `{"cwd": "/absolute/path/to/workspace"}` | Read configuration, including configured MCP servers. |

Example:

```json
{
  "id": 2,
  "method": "model/list",
  "params": {
    "cursor": null
  }
}
```

## 4. Start a thread

Replace `<model-id>` with an ID from `model/list` and replace the workspace path.

```json
{
  "id": 3,
  "method": "thread/start",
  "params": {
    "cwd": "/absolute/path/to/workspace",
    "model": "<model-id>",

    "sandbox": "read-only",
    "approvalPolicy": "never",
    "serviceTier": null,

    "config": {},
    "ephemeral": false
  }
}
```

Wait for the response and save `result.thread.id`. With `ephemeral: false`, the thread can be persisted for later resumption.

To disable configured MCP servers, populate `config` with an override for each server name returned by `config/read`:

```json
{
  "mcp_servers.<server-name>.enabled": false
}
```

## 5. Pass the prompt, effort, and output schema

Replace `<thread-id>` with the thread ID returned above. Set `effort` to a value supported by the selected model; this example uses `high`.

```json
{
  "id": 4,
  "method": "turn/start",
  "params": {
    "threadId": "<thread-id>",
    "input": [
      {
        "type": "text",
        "text": "Inspect the files in this workspace and explain how the application starts. Read files only; do not execute application code or tests. Return the explanation in the answer field.",
        "text_elements": []
      }
    ],

    "effort": "high",
    "serviceTierForTurn": "default",

    "outputSchema": {
      "type": "object",
      "properties": {
        "answer": {
          "type": "string"
        }
      },
      "required": ["answer"],
      "additionalProperties": false
    }
  }
}
```

Omit `outputSchema` if a structured JSON answer is unnecessary. `serviceTierForTurn: "default"` selects standard speed for this turn.

If instructions and task content are separate strings, combine them before sending the text input:

```js
const text = `${instructions}\n\n${taskInput}`;
```

Both strings are then part of the same text input; this does not create a separate system message.

## 6. Read the result

Keep reading stdout while the turn runs. The `turn/start` response acknowledges the turn; wait for `turn/completed` and check that `params.turn.status` is `completed` before treating the task as successful.

| Notification | Meaning |
| --- | --- |
| `item/agentMessage/delta` | Incremental response text. |
| `item/completed` | A completed item; an `agentMessage` contains message text. |
| `turn/completed` | The turn ended; inspect its status and any error. |

## 7. Resume or interrupt

To resume a persisted thread, start a new process, initialize the connection, then send:

```json
{
  "id": 5,
  "method": "thread/resume",
  "params": {
    "threadId": "<thread-id>"
  }
}
```

After resuming, send another `turn/start` with the same thread ID and the next prompt.

To interrupt an active turn, use its thread ID and the turn ID returned by `turn/start`:

```json
{
  "id": 6,
  "method": "turn/interrupt",
  "params": {
    "threadId": "<thread-id>",
    "turnId": "<turn-id>"
  }
}
```

## Call sequence

```text
codex app-server
  → initialize
  → initialized
  → optional model/account/config requests
  → thread/start or thread/resume
  → turn/start
  → read notifications until turn/completed
```

