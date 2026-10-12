# Prompt composition

The language used to describe composing prompts in Pi. These user-facing concepts are shared across the four composition packages.

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
