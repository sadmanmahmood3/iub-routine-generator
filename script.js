/* =========================================================
   IUB Routine Generator: script.js

   How the file is organised:
     1. Settings and data
     2. Saving and loading (localStorage)
     3. Helpers: times and days
     4. Clash logic         <- the core idea
     5. Finding every valid routine
     6. Explaining why nothing works
     7. Drawing the course list
     8. Drawing the results and the timetable
     9. Event handlers (what happens when you click things)
   ========================================================= */


/* ---------- 1. Settings and data ---------- */

// The name under which our data is saved in the browser
const STORAGE_KEY = "iub-routine-courses";

// Stop after this many routines, so a huge input can't freeze the browser
const MAX_ROUTINES = 500;

// IUB day letters in week order (the IUB week starts on Saturday)
const DAY_ORDER = ["A", "S", "M", "T", "W", "R"];
const DAY_NAMES = { A: "Sat", S: "Sun", M: "Mon", T: "Tue", W: "Wed", R: "Thu" };

// One colour pair per course: a light background and a stronger border
const COURSE_COLORS = [
  { bg: "#dbeafe", border: "#3b82f6" }, // blue
  { bg: "#dcfce7", border: "#22c55e" }, // green
  { bg: "#fef3c7", border: "#f59e0b" }, // amber
  { bg: "#fce7f3", border: "#ec4899" }, // pink
  { bg: "#ede9fe", border: "#8b5cf6" }, // purple
  { bg: "#ffedd5", border: "#f97316" }, // orange
  { bg: "#cffafe", border: "#06b6d4" }, // cyan
  { bg: "#e5e7eb", border: "#6b7280" }  // grey
];

// All the courses the user entered. Shape:
// [ { code: "CSE303", sections: [ { section: "1", days: "ST", start: "8:00 AM", end: "9:30 AM" } ] } ]
let courses = loadCourses();

// The routines found by the last "Generate" click, and which one is on screen
let routines = [];
let currentRoutine = 0;

// Grab the page elements we need to read from or write to
const form = document.getElementById("section-form");
const courseInput = document.getElementById("course-input");
const sectionInput = document.getElementById("section-input");
const daysInput = document.getElementById("days-input");
const startInput = document.getElementById("start-input");
const endInput = document.getElementById("end-input");
const formError = document.getElementById("form-error");
const courseList = document.getElementById("course-list");
const clearAllBtn = document.getElementById("clear-all-btn");
const generateBtn = document.getElementById("generate-btn");
const resultMessage = document.getElementById("result-message");
const routineNav = document.getElementById("routine-nav");
const routineLabel = document.getElementById("routine-label");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const timetable = document.getElementById("timetable");
const routineSummary = document.getElementById("routine-summary");


/* ---------- 2. Saving and loading (localStorage) ---------- */

// localStorage can only store text, so we convert the array to JSON text
// when saving, and back into an array when loading.
function loadCourses() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    // Storage blocked (e.g. some private windows) or the data is broken: start fresh
    return [];
  }
}

function saveCourses() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(courses));
  } catch (error) {
    // If saving fails the app still works; the data just won't survive a refresh
  }
}


/* ---------- 3. Helpers: times and days ---------- */

// Turns "8:00 AM" into minutes since midnight (480), so times can be compared
// with < and >. Returns null if the text isn't a valid time.
// Also accepts "8:00am", "8 AM", "8:00 pm" and so on.
function timeToMinutes(text) {
  // The pattern means: 1-2 digits, optionally ":" and 2 digits, optional space, then AM or PM
  const match = text.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  const period = match[3].toUpperCase();

  if (hours < 1 || hours > 12 || minutes > 59) return null;

  // 12 AM is midnight (hour 0) and 12 PM is noon (hour 12),
  // so first turn 12 into 0, then add 12 for any PM time.
  if (hours === 12) hours = 0;
  if (period === "PM") hours += 12;

  return hours * 60 + minutes;
}

// The opposite: 480 -> "8:00 AM". Used to store times in one tidy format.
function formatTime(totalMinutes) {
  const hours24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const period = hours24 >= 12 ? "PM" : "AM";

  let hours12 = hours24 % 12;
  if (hours12 === 0) hours12 = 12;

  // padStart turns 5 into "05"
  return hours12 + ":" + String(minutes).padStart(2, "0") + " " + period;
}

// Cleans what the user typed in the Days box: " st " -> "ST", "SST" -> "ST".
// Returns null if it's empty or contains a letter that isn't an IUB day.
function cleanDays(text) {
  const letters = text.toUpperCase().replace(/\s/g, ""); // uppercase, remove spaces
  if (letters === "") return null;

  let result = "";
  for (const letter of letters) {
    if (!DAY_ORDER.includes(letter)) return null; // not S, M, T, W, R or A
    if (!result.includes(letter)) result += letter; // skip repeated letters
  }
  return result;
}


/* ---------- 4. Clash logic ----------
   Two sections clash only if BOTH are true:
     (a) they meet on at least one common day, and
     (b) their time ranges overlap.
*/

// (a) Do the two sections share a day?
// "ST" and "TR" share "T" -> true. "ST" and "MW" share nothing -> false.
function sharesADay(sectionA, sectionB) {
  for (const day of sectionA.days) {
    if (sectionB.days.includes(day)) {
      return true;
    }
  }
  return false;
}

// (b) Do the two time ranges overlap?
// The standard rule: A starts before B ends AND B starts before A ends.
//
//   8:00-9:30 vs 9:00-10:30  -> 480 < 630 and 540 < 570 -> overlap
//   8:00-9:30 vs 9:30-11:00  -> 570 < 570 is false     -> no overlap
//                               (back-to-back classes are fine)
function timesOverlap(sectionA, sectionB) {
  const aStart = timeToMinutes(sectionA.start);
  const aEnd = timeToMinutes(sectionA.end);
  const bStart = timeToMinutes(sectionB.start);
  const bEnd = timeToMinutes(sectionB.end);

  return aStart < bEnd && bStart < aEnd;
}

// Puts (a) and (b) together. Everything else in the app is built on this.
function sectionsClash(sectionA, sectionB) {
  return sharesADay(sectionA, sectionB) && timesOverlap(sectionA, sectionB);
}


/* ---------- 5. Finding every valid routine ----------
   A routine = exactly one section from every course, with no clashes.

   With 3 courses we could write 3 nested loops, but the number of courses
   changes, so we use a function that calls itself (recursion):

     build(course number, sections picked so far):
       - if we've picked a section for every course -> save this routine
       - otherwise, try each section of the next course:
           if it doesn't clash with anything picked so far,
           pick it and call build() again for the course after it

   As soon as a section clashes, that path is abandoned, so we never
   waste time finishing combinations that are already broken.
*/

// Does this section clash with any of the sections already picked?
function clashesWithAny(section, picked) {
  for (const pick of picked) {
    if (sectionsClash(pick.section, section)) {
      return true;
    }
  }
  return false;
}

function findAllRoutines() {
  const found = [];
  let hitLimit = false;

  function build(courseIndex, picked) {
    // Every course has a section -> this is a complete, clash-free routine
    if (courseIndex === courses.length) {
      if (found.length < MAX_ROUTINES) {
        found.push(picked);
      } else {
        hitLimit = true; // there are more routines than we're willing to show
      }
      return;
    }

    const course = courses[courseIndex];

    for (const section of course.sections) {
      if (hitLimit) return; // stop searching once we're over the limit

      if (!clashesWithAny(section, picked)) {
        // [...picked, x] makes a NEW array with x added at the end,
        // so other paths of the search keep their own copy of "picked"
        const pick = { code: course.code, colorIndex: courseIndex, section: section };
        build(courseIndex + 1, [...picked, pick]);
      }
    }
  }

  build(0, []); // start with the first course and nothing picked
  return { found: found, hitLimit: hitLimit };
}


/* ---------- 6. Explaining why nothing works ---------- */

// True if EVERY section of course A clashes with EVERY section of course B,
// meaning these two courses can never be taken together.
function alwaysClash(courseA, courseB) {
  for (const a of courseA.sections) {
    for (const b of courseB.sections) {
      if (!sectionsClash(a, b)) {
        return false; // found one pair that works
      }
    }
  }
  return true;
}

// Checks every pair of courses and returns the ones that always clash
function findClashingCoursePairs() {
  const pairs = [];
  for (let i = 0; i < courses.length; i++) {
    for (let j = i + 1; j < courses.length; j++) { // j starts after i, so each pair is checked once
      if (alwaysClash(courses[i], courses[j])) {
        pairs.push([courses[i].code, courses[j].code]);
      }
    }
  }
  return pairs;
}


/* ---------- 7. Drawing the course list ---------- */

// Small helper: create an element with an optional class and text.
// Using textContent (not innerHTML) means typed text is always shown as plain text.
function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function colorFor(courseIndex) {
  // % wraps around, so course 9 reuses colour 1, and so on
  return COURSE_COLORS[courseIndex % COURSE_COLORS.length];
}

function renderCourseList() {
  courseList.innerHTML = ""; // clear the old list and rebuild it

  if (courses.length === 0) {
    courseList.appendChild(createElement("p", "empty", "No courses yet. Add a section above to get started."));
    clearAllBtn.hidden = true;
    return;
  }
  clearAllBtn.hidden = false;

  courses.forEach(function (course, courseIndex) {
    const box = createElement("div", "course");
    box.style.borderLeftColor = colorFor(courseIndex).border;
    box.appendChild(createElement("h3", "", course.code));

    const list = createElement("ul", "section-list");

    course.sections.forEach(function (section, sectionIndex) {
      const item = createElement("li");
      item.appendChild(createElement("span", "",
        "Sec " + section.section + " · " + section.days + " · " + section.start + " – " + section.end));

      const deleteBtn = createElement("button", "btn-icon", "✕");
      deleteBtn.type = "button";
      deleteBtn.setAttribute("aria-label", "Delete " + course.code + " section " + section.section);
      deleteBtn.addEventListener("click", function () {
        deleteSection(courseIndex, sectionIndex);
      });

      item.appendChild(deleteBtn);
      list.appendChild(item);
    });

    box.appendChild(list);
    courseList.appendChild(box);
  });
}


/* ---------- 8. Drawing the results and the timetable ---------- */

// Wipes old results. Called whenever the courses change, so stale routines never show.
function clearResults() {
  routines = [];
  currentRoutine = 0;
  resultMessage.innerHTML = "";
  resultMessage.className = "result-message";
  routineNav.hidden = true;
  timetable.innerHTML = "";
  routineSummary.innerHTML = "";
}

// Shows a red box saying why no routine is possible
function explainNoRoutines() {
  resultMessage.className = "result-message problem";
  resultMessage.appendChild(createElement("p", "", "No possible routines found."));

  const pairs = findClashingCoursePairs();

  if (pairs.length > 0) {
    const list = createElement("ul");
    for (const pair of pairs) {
      list.appendChild(createElement("li", "",
        pair[0] + " and " + pair[1] + " clash in every combination of their sections."));
    }
    resultMessage.appendChild(list);
  } else {
    // Every pair works on its own, but 3 or more courses together can't fit
    resultMessage.appendChild(createElement("p", "",
      "Every pair of courses can fit together, but no combination fits all of them at once. " +
      "The clash involves three or more courses. Try adding more sections."));
  }
}

// Shows the routine at position currentRoutine
function showCurrentRoutine() {
  const routine = routines[currentRoutine];

  // Only show Prev/Next when there's more than one routine
  routineNav.hidden = routines.length < 2;
  routineLabel.textContent = "Routine " + (currentRoutine + 1) + " of " + routines.length;
  prevBtn.disabled = currentRoutine === 0;
  nextBtn.disabled = currentRoutine === routines.length - 1;

  renderTimetable(routine);
  renderSummary(routine);
}

// Builds the weekly table: columns = days, rows = time slots
function renderTimetable(routine) {
  timetable.innerHTML = "";

  // Step 1: which days have at least one class? (kept in IUB week order)
  const daysUsed = DAY_ORDER.filter(function (day) {
    return routine.some(function (pick) {
      return pick.section.days.includes(day);
    });
  });

  // Step 2: list each different time slot once, e.g. "8:00 AM – 9:30 AM"
  const slots = [];
  for (const pick of routine) {
    const alreadyListed = slots.some(function (slot) {
      return slot.start === pick.section.start && slot.end === pick.section.end;
    });
    if (!alreadyListed) {
      slots.push({ start: pick.section.start, end: pick.section.end });
    }
  }

  // Sort slots by start time (and by end time if two start together)
  slots.sort(function (a, b) {
    return (timeToMinutes(a.start) - timeToMinutes(b.start)) ||
           (timeToMinutes(a.end) - timeToMinutes(b.end));
  });

  // Step 3: build the table
  const table = createElement("table", "timetable");

  // Header row: "Time", then one column per day
  const headerRow = createElement("tr");
  headerRow.appendChild(createElement("th", "", "Time"));
  for (const day of daysUsed) {
    headerRow.appendChild(createElement("th", "", DAY_NAMES[day]));
  }
  table.appendChild(headerRow);

  // One row per time slot
  for (const slot of slots) {
    const row = createElement("tr");
    row.appendChild(createElement("td", "time-cell", slot.start + " – " + slot.end));

    for (const day of daysUsed) {
      const cell = createElement("td");

      // Find the class (if any) in this slot on this day.
      // There can be at most one, because the routine has no clashes.
      const pick = routine.find(function (p) {
        return p.section.days.includes(day) &&
               p.section.start === slot.start &&
               p.section.end === slot.end;
      });

      if (pick) {
        const color = colorFor(pick.colorIndex);
        const block = createElement("div", "class-block");
        block.style.background = color.bg;
        block.style.borderLeftColor = color.border;
        block.appendChild(createElement("strong", "", pick.code));
        block.appendChild(createElement("span", "", "Sec " + pick.section.section));
        cell.appendChild(block);
      }

      row.appendChild(cell);
    }
    table.appendChild(row);
  }

  timetable.appendChild(table);
}

// A plain list of the chosen sections, under the table
function renderSummary(routine) {
  routineSummary.innerHTML = "";
  for (const pick of routine) {
    const s = pick.section;
    routineSummary.appendChild(createElement("li", "",
      pick.code + " — Section " + s.section + " (" + s.days + ", " + s.start + " – " + s.end + ")"));
  }
}


/* ---------- 9. Event handlers ---------- */

function showFormError(message) {
  formError.textContent = message;
}

// "Add section" button (the form being submitted)
form.addEventListener("submit", function (event) {
  event.preventDefault(); // stop the browser from reloading the page

  // Read and tidy up the inputs. "cse 303" becomes "CSE303".
  const code = courseInput.value.toUpperCase().replace(/\s/g, "");
  const sectionNumber = sectionInput.value.trim();
  const days = cleanDays(daysInput.value);
  const start = timeToMinutes(startInput.value);
  const end = timeToMinutes(endInput.value);

  // Check each input and stop at the first problem
  if (code === "") return showFormError("Enter a course code, e.g. CSE303.");
  if (sectionNumber === "") return showFormError("Enter a section number, e.g. 1.");
  if (days === null) return showFormError("Days can only use the letters S, M, T, W, R and A (e.g. ST or MW).");
  if (start === null) return showFormError("Start time should look like 8:00 AM.");
  if (end === null) return showFormError("End time should look like 9:30 AM.");
  if (end <= start) return showFormError("The end time must be after the start time.");

  // Find the course if it already exists
  let course = courses.find(function (c) {
    return c.code === code;
  });

  if (course) {
    const duplicate = course.sections.some(function (s) {
      return s.section === sectionNumber;
    });
    if (duplicate) {
      return showFormError(code + " already has a section " + sectionNumber + ". Delete it first to change it.");
    }
  } else {
    // A new course: add it to the list
    course = { code: code, sections: [] };
    courses.push(course);
  }

  // Store times in one tidy format, e.g. "8:00am" is saved as "8:00 AM"
  course.sections.push({
    section: sectionNumber,
    days: days,
    start: formatTime(start),
    end: formatTime(end)
  });

  saveCourses();
  renderCourseList();
  clearResults();

  // Clear the inputs for the next section, but keep the course code,
  // since people usually add several sections of the same course in a row
  showFormError("");
  sectionInput.value = "";
  daysInput.value = "";
  startInput.value = "";
  endInput.value = "";
  sectionInput.focus();
});

// The ✕ button next to a section
function deleteSection(courseIndex, sectionIndex) {
  const course = courses[courseIndex];
  course.sections.splice(sectionIndex, 1); // remove 1 item at that position

  // A course with no sections left is removed completely
  if (course.sections.length === 0) {
    courses.splice(courseIndex, 1);
  }

  saveCourses();
  renderCourseList();
  clearResults();
}

// "Clear all" button
clearAllBtn.addEventListener("click", function () {
  if (!confirm("Delete all courses and sections?")) return;
  courses = [];
  saveCourses();
  renderCourseList();
  clearResults();
});

// "Generate routines" button
generateBtn.addEventListener("click", function () {
  clearResults();

  if (courses.length === 0) {
    resultMessage.className = "result-message problem";
    resultMessage.textContent = "Add at least one course first.";
    return;
  }

  const result = findAllRoutines();
  routines = result.found;

  if (routines.length === 0) {
    explainNoRoutines();
    return;
  }

  resultMessage.className = "result-message success";
  if (result.hitLimit) {
    resultMessage.textContent = "More than " + MAX_ROUTINES + " routines found. Showing the first " +
      MAX_ROUTINES + ". Remove some sections to narrow it down.";
  } else if (routines.length === 1) {
    resultMessage.textContent = "1 possible routine found";
  } else {
    resultMessage.textContent = routines.length + " possible routines found";
  }

  showCurrentRoutine();
});

// Prev / Next buttons
prevBtn.addEventListener("click", function () {
  if (currentRoutine > 0) {
    currentRoutine--;
    showCurrentRoutine();
  }
});

nextBtn.addEventListener("click", function () {
  if (currentRoutine < routines.length - 1) {
    currentRoutine++;
    showCurrentRoutine();
  }
});

// When the page first loads, show whatever was saved last time
renderCourseList();
