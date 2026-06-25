/**
 * NV Rev2 DOM selectors — refined via discovery script.
 * Fallback chain supports minor markup variations across projects.
 */
export const NV_SELECTORS = {
  login: {
    station: [
      'input[name="station"]',
      'input[name="STATION"]',
      "#station",
      'input[placeholder*="Station" i]',
    ],
    password: [
      'input[name="password"]',
      'input[name="PASSWORD"]',
      "#password",
      'input[type="password"]',
    ],
    id: ['input[name="id"]', 'input[name="ID"]', "#id", 'input[name="ws"]'],
    project: ['select[name="project"]', "#project", 'select[name="quest"]'],
    group: ['select[name="group"]', "#group", 'select[name="s_ini"]'],
    mode: ['select[name="mode"]', "#mode"],
    submit: [
      'input[type="submit"]',
      'button[type="submit"]',
      "#login",
      'button:has-text("Login")',
    ],
  },
  interview: {
    questionName: [
      'input[name="QUESTION"]',
      'input[name="question"]',
      "#question",
      "[data-question]",
      ".question-name",
      'input[type="hidden"][name*="quest" i]',
      'input[name="QLABEL"]',
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
];

/** Scoped radio/checkbox selectors — never append [value] to a comma-separated list. */
export function nvRadioSelector(questionName: string, code: string): string {
  const name = questionName.toUpperCase();
  return `input[type="radio"][name="${name}"][value="${code}"], input[type="RADIO"][name="${name}"][value="${code}"]`;
}

export function nvCheckboxSelector(questionName: string, code: string): string {
  const name = questionName.toUpperCase();
  return `input[type="checkbox"][name="${name}"][value="${code}"], input[type="CHECKBOX"][name="${name}"][value="${code}"]`;
}

export function nvRadioGroupSelector(questionName: string): string {
  const name = questionName.toUpperCase();
  return `input[type="radio"][name="${name}"], input[type="RADIO"][name="${name}"]`;
}
