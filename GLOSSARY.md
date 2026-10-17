# Pi interaction

Terms for conversation structure, presentation, composition, and execution in Pi. Thread, turn, and item follow the [published conversation model](https://learn.chatgpt.com/docs/app-server#core-primitives); agent activity and its rendered items describe a separate presentation layer.

## Language

### Conversation structure

**Thread**:
A conversation between a user and an agent, composed of turns.

**Turn**:
One user request together with the agent processing and response that follow it. A turn contains items; its agent activity is only part of the turn.

**Item**:
A unit of input or output within a turn, such as a user message, assistant message, tool call, command execution, or file change.
_Avoid_: Activity item, when referring to conversation structure

**Active branch**:
The conversation path from the beginning of a thread to its currently selected point in history.

**Retained history**:
Recorded conversation content still available, including original content summarized during compaction.
_Avoid_: Visible history, when content may be collapsed or absent from the chat view

**Steering message**:
A user message delivered during agent activity to redirect the current turn.

**Queued follow-up**:
A user request held until the current turn finishes, starting its own turn when delivered.

**Final response**:
The assistant's answer within a turn, presented separately from its preceding agent activity. It can still be streaming or remain partial after interruption.

### Presentation

**Chat view**:
The primary display of conversation messages and current activity alongside the composer.

**Conversation gutter**:
The side padding beside conversation content that belongs to the conversation's scrolling surface.
_Avoid_: Scrollbar gutter, when referring to this area

**Transcript**:
A separate overlay for reading and navigating conversation history over the chat view.

**Agent activity**:
The ordered commentary, thoughts, and tool activity within a turn, presented separately from its user messages and final response.
_Avoid_: Turn, when referring only to the agent's activity

**Render group**:
Consecutive activity items displayed together within agent activity. Visible standalone non-tool items and explicit activity boundaries separate groups; an assistant message or execution cell boundary alone does not.

**Activity item**:
A unit of displayed agent activity identifying an operation, failure, or delivered image. A conversation item or tool call can contribute zero or several activity items; returning text alone is not an operation.

**Execution activity item**:
An activity item for explicitly declared execution-error facts. Core script and input/collection failures remain in model results and retained source without creating this item.
_Avoid_: Child operation, when referring to the execution's own outcome

**Summary**:
A concise description shown at a disclosure. Qualify it as a group summary or item summary when identifying what it describes.

**Group summary**:
A short description in a render group's header that summarizes the types of operations it contains without replacing their item summaries.

**Item summary**:
A short description identifying the action and target of one activity item. Its wording can become less specific when the full output already shows the command or target.

**Command action**:
A read, search, directory listing, or general command identified within a shell command for presentation. Recognizing an action does not execute the command or establish its outcome.

**Command recognition**:
The interpretation of command text into command actions. Unrecognized syntax retains a general command action and its original text.

**Activity body**:
The content inspected when an activity item's disclosure is expanded. Its output control can show a preview or the full output.
_Avoid_: Details, when naming the displayed region rather than tool-result metadata

**Disclosure**:
A control that switches its content between collapsed and expanded states without changing the underlying content. Nested disclosures have independent states.
_Avoid_: Expansion control or fold, when naming the control

**Collapsed**:
The display state that hides content or reduces it to a preview, depending on the disclosure.
_Avoid_: Compaction, when only presentation changes

**Expanded**:
The display state that reveals the content associated with a disclosure.

**Hide thinking**:
The choice to omit thoughts from ordinary chat flow while retaining them in conversation history. Finding a thought can temporarily reveal that occurrence without changing the choice.

**Inline thought**:
A thought shown at its conversation position in ordinary chat flow, without its own header, scroll area, or disclosure. It remains visible after thinking completes whenever thinking is shown and its enclosing agent activity is expanded.

**Activity heading**:
A standalone bold paragraph that titles a thought section. It is omitted from displayed thought prose and can supply the working label. Its original text remains in the conversation source.

**Working label**:
The transient, single-line text in Pi's native working indicator, selected from current operations or the latest activity heading. It describes current work independently of thought visibility and activity disclosure state; thought body prose never supplies it.

### Composition

**Composer**:
The editing surface where a user prepares a prompt and its associated references and attachments before submission.

**Draft**:
A prompt being prepared for submission, including its text, references, and attachments.

**Reference**:
Editable text within a draft that identifies a resource, such as a file or skill. A plain source path identifies the file whose current contents can be read.

**Skill reference**:
A reference identifying a skill the user explicitly wants applied to the request, independent of how the reference entered the draft.

**Attachment**:
Supplementary file contents included in a draft through a Markdown link or image pointing to a local file.

**Attachment source**:
An existing file or entered text from which an attachment is captured, independent of the kind of content it contains.

**Attachment capture**:
Preservation of an attachment source's contents as a snapshot.

**Attachment snapshot**:
A retained copy of contents captured from an attachment source. Later changes to the source do not change that copy.

**Text attachment**:
Text associated with a draft as a file that the agent can read on demand.

**Attachment thumbnail**:
A compact image preview in the composer that identifies an attached image without opening its retained file in another application.

**Attachment reference**:
A Markdown link or image pointing to an existing local file whose contents are included as an attachment in a draft or submitted prompt.

**Attachment membership**:
The attachments included in a draft through local-file links and images in its Markdown. A plain path does not include a file as an attachment.

**Preview text**:
Read-only inspection of an attachment's retained text without changing the draft or its attachment membership.

**Restore Inline**:
Conversion of attached text into ordinary editable draft text by inserting its contents at the caret or selection and removing the corresponding attachment reference. The retained contents remain available.

**Remove from draft**:
Removal of an attachment reference and therefore its membership in the current draft, while preserving its retained contents.

**Source view**:
A view of the draft's Markdown syntax that can be edited directly.

**Formatted view**:
A view in which supported Markdown formatting appears within the editable draft.

**Paste**:
A user action that inserts copied content into a draft. Its content can be text, an image, or copied files.

**Paste policy**:
The rules that determine how pasted content enters a draft, including whether text appears inline or becomes an attachment.

### Execution

**Agent interface**:
The instructions, messages, tool contracts, calls, and results available to the model during a conversation.

**Core toolset**:
The model-facing tools for Pi's built-in local command, file, and image capabilities. Tools from unrelated extensions are outside this set.

**Tool call**:
An invocation of a tool with its inputs and eventual outcome. One tool call can contribute zero or several activity items.

**Pending tool call**:
A call whose inputs are still arriving and which has not begun execution. Pending is distinct from an unknown historical outcome.

**Tool result**:
The content and outcome returned by a tool call. Returning or forwarding a tool result does not itself perform another operation.

**Execution cell**:
One execution whose new output and eventual result can be collected across tool calls.

**Operation**:
An underlying action, such as running a command or changing a file. A tool call can perform several operations, and an execution cell can coordinate several tool calls.
_Avoid_: Activity item, when referring to execution rather than its presentation

**Process session**:
A command that remains available for input or output collection until its final result is collected.

### Goals

**Goal**:
An explicitly authorized outcome whose pursuit can continue within a session across successive work attempts.

**Objective**:
The statement of what a goal must achieve, including its scope and constraints.

**Goal continuation**:
A further work attempt toward an active goal after the previous attempt ends, without a new user request.

**Goal pause**:
A stop to future goal pursuit that retains the objective and consumed usage for an explicit resume.

**Goal clear**:
Removal of the current goal while retaining its conversation history.

**Goal budget**:
An optional token allowance allocated to pursuing a goal.
