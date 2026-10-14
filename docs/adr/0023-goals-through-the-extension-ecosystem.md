# Deliver goals through the extension ecosystem

`pi-goal` must be implemented entirely as an extension, without modifying Pi's source or installed host files. This keeps installation and updates within the existing ecosystem and preserves the integration policy in [ADR 0001](0001-preserve-pi-extension-contracts.md). A missing capability does not authorize a host patch; any resulting design trade-off must be made explicit before implementation.
