Plan approved.
{{#if contextPreserved}}
- History usable; the plan below authoritative if it conflicts with earlier exploration.
{{/if}}

<instruction>
Full plan inlined below; durable copy at `{{planFilePath}}` (identical content).
{{#if teamEnabled}}
Independent slices: one `task` call with `team: true`, shared `context` (this plan's contract), and {{teamSize}} `tasks[]` items with disjoint `# Target` files. You orchestrate those slices; NEVER implement them yourself. Serial or shared steps stay on you. After they yield, `read` their files, then you run formatters/tests once.
{{else}}
Execute plan step-by-step with full tool access; MUST verify each step before next.
{{/if}}
NEVER re-read `{{planFilePath}}` while the inline plan is intact; the path is for subagent handoff and recovery only.
{{#has tools "todo"}}
Before execution: initialize todo tracking with `todo`.
After each completed step: immediately update `todo`.
If `todo` fails: fix payload; retry before continuing.
{{/has}}
</instruction>

<plan path="{{planFilePath}}">
{{planContent}}
</plan>

<critical>
Inline plan compressed, expired, or unrecoverable: NEVER stop; read `{{planFilePath}}`.
Read failure: report exact path and error; NEVER guess.
MUST continue until complete.
</critical>
