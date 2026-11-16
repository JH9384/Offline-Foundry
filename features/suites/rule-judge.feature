Feature: rule-judge

  @FA-90 @build
  Scenario: A published app's answer is decided by the rule judge in Foundry's Prism kernel: the first rule whose conditions all hold decides, otherwise decides when none does, and a request outside the fields' bounds is refused
    Given the fixture FA-90 needs
    When the suite exercises FA-90
    Then A published app's answer is decided by the rule judge in Foundry's Prism kernel: the first rule whose conditions all hold decides, otherwise decides when none does, and a request outside the fields' bounds is refused
