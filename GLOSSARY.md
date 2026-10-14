# Pi interaction

The language used to describe composing prompts, pursuing goals, and reading conversation history in Pi. These user-facing concepts are shared across the packages.

## Language

**Composer**:
The editing surface where a user prepares a prompt and its associated references and attachments before submission.
_Avoid_: Text box, when referring to the entire composer

**Draft**:
A prompt being prepared for submission, including its text, references, and attachments.
_Avoid_: Message, when the prompt has not been submitted

**Reference**:
Editable text within a draft that identifies a resource, such as a file or skill. A plain source path identifies the file whose current contents can be read.
_Avoid_: Attachment, when referring only to a mention of a resource

**Skill reference**:
A reference identifying a skill the user explicitly wants applied to the request, independent of how the reference entered the draft.
_Avoid_: Slash command, unless referring to a command invocation

**Attachment**:
Supplementary file contents included in a draft through a Markdown link or image pointing to a local file.
_Avoid_: Reference, when referring to captured content

**Attachment source**:
An existing file or entered text from which an attachment is captured, independent of the kind of content it contains.
_Avoid_: Attachment type, when referring to how content is supplied

**Attachment snapshot**:
A retained copy of contents captured from an attachment source. Later changes to the source do not change that copy.

**Attachment capture**:
Preservation of an attachment source's contents as a snapshot.

**Text attachment**:
Text associated with a draft as a file that the agent can read on demand.

**Attachment thumbnail**:
A compact image preview in the composer that identifies an attached image without opening its retained file in another application.
_Avoid_: Attachment contents, when referring only to the preview

**Attachment reference**:
A Markdown link or image pointing to an existing local file whose contents are included as an attachment in a draft or submitted prompt.
_Avoid_: File reference, when referring to captured attachment contents

**Attachment membership**:
The attachments included in a draft through local-file links and images in its Markdown. A plain path does not include a file as an attachment.
_Avoid_: Attachment contents, when referring to which items the draft includes

**Preview text**:
Read-only inspection of an attachment's retained text without changing the draft or its attachment membership.

**Restore Inline**:
Conversion of attached text into ordinary editable draft text by inserting its contents at the caret or selection and removing the corresponding attachment reference. The retained contents remain available.

**Remove from draft**:
Removal of an attachment reference and therefore its membership in the current draft, while preserving its retained contents.

**Source view**:
A view of the draft's Markdown syntax that can be edited directly.
_Avoid_: Separate draft, when switching how the same draft is displayed

**Formatted view**:
A view in which supported Markdown formatting appears within the editable draft.
_Avoid_: Preview, when the displayed content is directly editable

**Paste**:
A user action that inserts copied content into a draft. Its content can be text, an image, or copied files.
_Avoid_: Attachment, when referring to the action

**Paste policy**:
The rules that determine how pasted content enters a draft, including whether text appears inline or becomes an attachment.

**Chat view**:
The primary display of conversation messages and current activity alongside the composer.
_Avoid_: Transcript, when referring to the main chat surface

**Transcript**:
A separate overlay for reading and navigating conversation history over the chat view.
_Avoid_: Chat view, when referring to the history-reading overlay

**Active branch**:
The conversation path from the beginning of a session to its currently selected point in history.

**Retained history**:
Recorded conversation content still available in a session, including original content summarized during compaction.
_Avoid_: Visible history, when content may be folded or absent from the current chat view

**Fold**:
A display state that replaces displayed conversation content with a summary or disclosure header while preserving the underlying content.
_Avoid_: Compaction, when only the presentation changes

**Activity group**:
Consecutive tool calls presented together within a work history. Visible standalone non-tool items and explicit activity boundaries separate groups; an assistant message boundary alone does not.
_Avoid_: Nested tool call, unless one tool actually called another

**Action label**:
A short description of observed tool activity in an activity group's collapsed header or while a call is running. It describes the action without replacing the tool's own presentation.
_Avoid_: Tool title, when referring to the group's summary

**Work history**:
The ordered commentary, thoughts, and tool activity associated with answering a request, distinct from its final response.
_Avoid_: Thought, when referring to all of the work preceding an answer

**Steering message**:
A user message delivered during ongoing work to redirect the current request.

**Queued follow-up**:
A user request held until the current request finishes, with its own work history and final response.

**Final response**:
The assistant's answer to a request, presented separately from the work history leading to it. It can still be streaming or remain partial after interruption.

**Hide thinking**:
The choice to omit thoughts from ordinary chat flow while retaining them in conversation history. Finding a thought can temporarily reveal that occurrence without changing the choice.

**Inline thought**:
A thought shown at its conversation position in ordinary chat flow, without its own header, scroll area, or fold. It remains visible after thinking completes whenever thinking is shown and its enclosing work history is open.

**Activity heading**:
A standalone bold paragraph within a thought that names current activity. It appears transiently as a working label rather than in the displayed thought prose; the original thought remains in the conversation source.

**Goal**:
An explicitly authorized outcome whose pursuit can continue within a session across successive work attempts.
_Avoid_: Task list, when referring to the desired outcome

**Objective**:
The statement of what a goal must achieve, including its scope and constraints.
_Avoid_: Plan, when referring to the desired outcome rather than the steps to reach it

**Goal continuation**:
A further work attempt toward an active goal after the previous attempt ends, without a new user request.
_Avoid_: Queued follow-up, which originates from a user request

**Goal budget**:
An optional token allowance allocated to pursuing a goal.
_Avoid_: Context limit, time limit, spending limit

**Agent interface**:
The instructions, messages, tool contracts, calls, and results available to the model during a conversation.
_Avoid_: User interface, when referring to information exchanged with the model
