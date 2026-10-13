# Pi interaction

The language used to describe composing prompts and reading conversation history in Pi. These user-facing concepts are shared across the packages.

## Language

**Composer**:
The editing surface where a user prepares a prompt and its associated references and attachments before submission.
_Avoid_: Text box, when referring to the entire composer

**Draft**:
A prompt being prepared for submission, including its text, references, and attachments.
_Avoid_: Message, when the prompt has not been submitted

**Reference**:
Editable text within a draft that identifies a resource, such as a file or skill. A file reference identifies the source file whose current contents can be read.
_Avoid_: Attachment, when referring only to a mention of a resource

**Skill reference**:
A reference identifying a skill the user explicitly wants applied to the request, independent of how the reference entered the draft.
_Avoid_: Slash command, unless referring to a command invocation

**Attachment**:
Supplementary content associated with a draft, such as an image or a text file, preserved as it was when added.
_Avoid_: Reference, when referring to captured content

**Text attachment**:
Text associated with a draft as a file that the agent can read on demand.

**Attachment reference**:
A reference identifying preserved attachment contents in a draft or submitted prompt.
_Avoid_: File reference, when referring to captured attachment contents

**Attachment membership**:
The set of attachments included in a particular draft.
_Avoid_: Attachment contents, when referring to which items the draft includes

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
Consecutive tool calls presented together within a work history. Standalone non-tool items and explicit activity boundaries separate groups; an assistant message boundary alone does not.
_Avoid_: Nested tool call, unless one tool actually called another

**Work history**:
The ordered commentary, thoughts, and tool activity associated with answering a request, distinct from its final response.
_Avoid_: Thought, when referring to all of the work preceding an answer

**Steering message**:
A user message delivered during ongoing work to redirect the current request.

**Queued follow-up**:
A user request held until the current request finishes, with its own work history and final response.

**Final response**:
The assistant's answer to a request, presented separately from the work history leading to it. It can still be streaming or remain partial after interruption.

**Inline thought**:
A thought shown at its conversation position in ordinary chat flow, without its own header, scroll area, or fold. It remains visible after thinking completes whenever its enclosing work history is open.

**Activity heading**:
A standalone bold paragraph within a thought that names current activity. It appears transiently as a working label rather than in the displayed thought prose; the original thought remains in the conversation source.
