Feature: theater

  @FA-92 @build
  Scenario: Theater, right after Library in the sidebar, plays Prism apps one after another on a stage beside an up next rail, under the build preview's own sandbox, with the floor's catalogue, covers and bookmarks, and its look is the experience spec's five Theater statements
    Given the experience spec's statements theaterInSidebar, theaterStage, theaterDetails, theaterUpNext and theaterKeys
    When the shell's sidebar, router and Theater screen are read
    Then Theater is the navigation item right after Library, always shown, and the header names it
    And the router serves Theater at /theater from the floor's own module
    And the stage runs a visitor's app from the run state's address under exactly the build preview's sandbox
    And the rail lists the floor's catalogue and the visitor's apps through the floor's views, covers and bookmarks
    And the address names the app on the stage, and f, t and Shift N are answered outside fields
