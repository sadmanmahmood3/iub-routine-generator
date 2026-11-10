# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

IUB Routine Generator: a static site (plain HTML/CSS/JS, no frameworks, no build step, no backend) that finds every clash-free class routine from courses and sections the user enters by hand. It is meant to be hosted on GitHub Pages.

The owner is a beginner learning from this code. Keep it simple and explained with comments, especially the clash-checking logic. Do not add frameworks, bundlers, npm dependencies or ES module splitting unless asked.

## Running

Open `index.html` directly in a browser; nothing to install or build. There is no linter. Node.js is not installed on the dev machine.

**Tests:** `test.html` loads the unchanged `script.js` and runs automatically, showing PASS/FAIL for each test. It has hidden copies of the page elements `script.js` looks up by id. Each test sets the shared top-level `courses` and `filters` variables, clicks the hidden Generate button, then checks `routines` and the result message. If you add an element id that `script.js` looks up, add a hidden copy of it to `test.html` too. To run the tests from the command line, use headless Edge (from PowerShell):

```powershell
& "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu --user-data-dir="$env:TEMP\edge-test-profile" --dump-dom "file:///D:/iub-routine-generator/test.html"
```

and look for `N of N tests passed` in the output.

## Architecture

Three files: `index.html` (static structure, empty containers), `style.css` (mobile-first, with one `@media (min-width: 700px)` block for wider screens) and `script.js` (all logic, in numbered sections 1–9).

**Data model:** a single global `courses` array, `[{ code, sections: [{ section, days, start, end }] }]`, saved to `localStorage` under the key `iub-routine-courses` as JSON after every change. Times are stored as normalised 12-hour strings (`"8:00 AM"`) and converted to minutes since midnight with `timeToMinutes()` whenever they are compared. Days are strings of IUB letters: S=Sun, M=Mon, T=Tue, W=Wed, R=Thu, A=Sat. `DAY_ORDER` puts Saturday first, matching the IUB week.

**Core pipeline:**
- `sectionsClash(a, b)` = shared day AND time overlap (`aStart < bEnd && bStart < aEnd`). Back-to-back classes don't clash.
- `findAllRoutines()` is a recursive backtracking search that picks one section per course and drops a branch as soon as it clashes. It is capped at `MAX_ROUTINES` (500) and reports `hitLimit` only when a 501st routine actually exists.
- `findAllRoutines(courseList)` and `findClashingCoursePairs(courseList)` take the course list as a parameter, so they can run on either all courses or the filtered list.
- Filters are stored in a global `filters` object, saved in `localStorage` under `iub-routine-filters`. "No classes before" and "Avoid days" are applied per section *before* the search (`applyFilters()` returns a new list and leaves `courses` unchanged), so the cap counts only routines that pass the filters. "Sort by fewest days" (`countCampusDays`) runs *after* the search. The Generate handler searches without filters first, to tell apart three cases: a real clash, a filter that empties a course, and filters that are too strict.
- The "No classes before" dropdown is rebuilt from the start times you've entered, every time `renderCourseList()` runs.
- When there are zero routines, `findClashingCoursePairs()` reports course pairs where every section combination clashes. If there are none, the message says the conflict involves three or more courses.

**Rendering conventions:**
- DOM is built with the `createElement()` helper and `textContent` (never `innerHTML` with user data).
- Any change to `courses` must call `saveCourses()`, `renderCourseList()` and `clearResults()`, so old routines are never shown.
- Visibility is toggled with the `hidden` attribute. The global `[hidden] { display: none !important }` rule in `style.css` makes this work even on flex elements.
- A course's colour comes from its index in `courses` (`colorFor(index)`), so the same course has the same colour in the list and the timetable.
- The timetable always shows all six IUB days as columns, even empty ones, so routines are easy to compare. Rows are the distinct time slots in that routine.
- Changing a filter also calls `clearResults()`.
