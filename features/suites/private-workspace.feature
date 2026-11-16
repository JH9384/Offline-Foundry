Feature: private-workspace

  @FA-91 @build
  Scenario: A private workspace opens only for the Prism id that owns it, on a device with a live session and its current boundary key; a record is read only when authentic and in place and stored only sealed; the workspace kept before an id moves in once; and Foundry's Prism kernel names every refusal
    Given the Workspace module in Foundry's Prism kernel, reached by the workspace request prefix
    When the kernel is asked to open a workspace, read or store a record, move the workspace kept before an id, or remove its plain copy
    Then it answers ok only for the owning id on a device with a live session and the current boundary key, for an authentic record in its place, for a sealed record within quota, for a first move, and for a removal after the sealed copy is committed
    And every other request is refused by name, a removed device first, and a wrong version, a trailing word or an unknown kind is malformedWorkspaceRequest
    And each answer is a theorem Lean proves by evaluation and an acceptance vector the compiled guest replays
