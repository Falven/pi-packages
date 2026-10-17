import { CopyAction, CopyActions } from "./controls.ts"
import { ItemControls } from "./item-controls.ts"
import { responsePayload } from "./payloads.ts"
import type { CopyProvider } from "./copy-contract.ts"

export const createCopyControls: CopyProvider = (environment) => {
  const actions = new CopyActions(environment)
  return {
    item: (source, owner) => new ItemControls(actions, source, owner),
    response: (parts) =>
      new CopyAction(actions, () => responsePayload(parts()), true),
    isAction: (value): value is CopyAction => value instanceof CopyAction,
  }
}
