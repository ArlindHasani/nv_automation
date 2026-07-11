/**
 * NV Rev2 DOM selectors.
 * Fallback chain supports minor markup variations across projects.
 */
export const NV_SELECTORS = {
  login: {
    station: [
      "#inputWorkStation",
      'input[name="extension"]',
      'input[name="station"]',
      'input[name="STATION"]',
      "#station",
      'input[placeholder*="Station" i]',
    ],
    password: [
      "#inputPassword",
      'input[name="password"]',
      'input[name="PASSWORD"]',
      "#password",
      'input[type="password"]',
    ],
    id: [
      "#inputID",
      'input[name="uid"]',
      'input[name="id"]',
      'input[name="ID"]',
      "#id",
    ],
    project: [
      "#inputProject",
      'select[name="prj"]',
      'select[name="project"]',
      "#project",
    ],
    group: [
      "#inputGroup",
      'select[name="grp"]',
      'select[name="group"]',
      "#group",
    ],
    mode: ["#inputMode", 'select[name="mode"]', "#mode"],
    submit: [
      "#login",
      'input[type="submit"]',
      'button[type="submit"]',
      'button:has-text("Login")',
    ],
  },
  home: {
    form: ["#start", 'form[action*="start.php"]'],
    recRadio: ['input[name="nv_manual_type"][value="REC"]'],
    questInput: ["#inputRecTel", 'input[name="nv_manual_selection"]'],
    startCase: ["#startCase", 'button[name="nv_start_case"]'],
    exit: ["#exit", 'button[value="quit"]', 'form[action*="end.php"] button'],
    exitForm: ['form[action*="end.php"]'],
    heading: [".form-signin-heading", "h2.form-signin-heading"],
  },
  interview: {
    questionName: [
      'input[name="QLABEL"]',
      'input[name="QUESTION"]',
      'input[name="question"]',
      "#question",
      "[data-question]",
      ".question-name",
      'input[type="hidden"][name*="quest" i]',
    ],
    nextButton: [
      "#gofwd",
      'button#stepbystep',
      'input[type="submit"][value*="Next" i]',
      'button:has-text("Next")',
      'input[type="submit"]',
      "#next",
      'a:has-text("Avanti")',
      'button:has-text("Avanti")',
    ],
    radio: 'input[type="radio"], input[type="RADIO"]',
    checkbox: 'input[type="checkbox"], input[type="CHECKBOX"]',
    textInput: 'input[type="text"]:not([type="hidden"])',
    nvTextInput:
      'input[type="TEXT"], form#form table#example input:not([type="HIDDEN"]):not([type="hidden"])',
    textarea: "textarea",
    errorBanner: [".error", ".alert-danger", "#error", '[class*="error" i]'],
  },
} as const;

export const NV_API_PATTERNS = [
  /api\.php/i,
  /start\.php/i,
  /logon\.php/i,
  /next\.php/i,
  /end\.php/i,
];

/** Scoped radio/checkbox selectors — never append [value] to a comma-separated list. */
export function nvRadioSelector(questionName: string, code: string): string {
  const name = questionName.toUpperCase();
  return `input[type="radio"][name="${name}"][value="${code}"], input[type="RADIO"][name="${name}"][value="${code}"]`;
}

export function nvCheckboxSelector(questionName: string, code: string): string {
  const name = questionName.toUpperCase();
  // Spontaneous Multi uses per-code names: D0_1B:03 (same pattern as grid cells).
  const colon = `${name}:${code}`;
  return [
    `input[type="checkbox"][name="${colon}"]`,
    `input[type="CHECKBOX"][name="${colon}"]`,
    `input[type="checkbox"][name="${colon}"][value="${code}"]`,
    `input[type="CHECKBOX"][name="${colon}"][value="${code}"]`,
    `input[type="checkbox"][name="${name}"][value="${code}"]`,
    `input[type="CHECKBOX"][name="${name}"][value="${code}"]`,
  ].join(", ");
}

export function nvRadioGroupSelector(questionName: string): string {
  const name = questionName.toUpperCase();
  return `input[type="radio"][name="${name}"], input[type="RADIO"][name="${name}"]`;
}
