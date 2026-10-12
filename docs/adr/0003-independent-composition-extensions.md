# Independent composition extensions

Editing, attachments, and skill references are separate Pi extensions with separate packages and specifications, so attachment and skill behavior remain useful with the native editor when `pi-composer` is absent. `pi-attachments` owns paste classification and attachment capture in distinct internal modules that share one capture, recovery, and storage operation, keeping a pasted attachment within one package lifecycle. Cooperation with other extensions follows Pi's existing native contracts and the active editor's draft-transaction ownership.
