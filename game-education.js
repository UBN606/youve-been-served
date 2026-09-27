// Optional reading data only. Importing this module opens no UI, changes no
// gameplay state, stores no personal information, and triggers no requests.
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

export const EDUCATION_CONTEXT = freeze({
  title: 'Between rounds',
  optional: true,
  placement: 'between-rounds-or-user-opened-menu',
  interruptAction: false,
  attribution: 'Original game paraphrases of Derek Samaras\' Rebellion Tested articles. These are article readings, not Urantia Book quotations or clinical diagnoses.',
  bossFictionNotice: 'The boss attacks are invented game mechanics, not clinical stages or a way to diagnose anyone. Real safety and recovery do not follow a combat script.',
  seriesUrl: 'https://www.urantiabooknetwork.com/rebellion',
  continueLabel: 'Back to the game',
});

export const EDUCATION_SOURCES = freeze({
  part1: {
    label: 'Read part 1',
    title: 'Rebellion Tested: What the Lucifer Rebellion Knows About Narcissistic Abuse',
    url: 'https://www.urantiabooknetwork.com/articles/rebellion-tested-narcissism',
    kind: 'author-interpretation',
  },
  part2: {
    label: 'Read part 2',
    title: 'Rebellion Tested: What Jesus’ Final Week Knows About Being Destroyed for Refusing a Role',
    url: 'https://www.urantiabooknetwork.com/articles/rebellion-tested-final-week',
    kind: 'author-interpretation',
  },
  part3: {
    label: 'Read part 3',
    title: 'Rebellion Tested: A Thousand Times the Evil, and What It Cost to Get There',
    url: 'https://www.urantiabooknetwork.com/articles/rebellion-tested-thousand-times',
    kind: 'author-interpretation',
  },
  part4: {
    label: 'Read part 4',
    title: 'Rebellion Tested: The Self They Could Not Recruit',
    url: 'https://www.urantiabooknetwork.com/articles/rebellion-tested-could-not-recruit',
    kind: 'author-interpretation',
  },
  safetyPlan: {
    label: 'Safety planning: The Hotline',
    title: 'What is a Safety Plan?',
    url: 'https://www.thehotline.org/what-is-a-safety-plan/',
    kind: 'specialist-support-guidance',
  },
  preparingToLeave: {
    label: 'Preparing to leave: The Hotline',
    title: 'Preparing to Leave',
    url: 'https://www.thehotline.org/resources/preparing-to-leave-2/',
    kind: 'specialist-support-guidance',
  },
  supportingSurvivors: {
    label: 'Supporting someone: The Hotline',
    title: 'Ways to Support a Domestic Violence Survivor',
    url: 'https://www.thehotline.org/support-others/ways-to-support-a-domestic-violence-survivor/',
    kind: 'specialist-support-guidance',
  },
});

// Article sections identify the actual reading basis. No fragment URLs are
// invented: live article HTML has no server-rendered heading IDs.
export const EDUCATION_CARDS = freeze([
  {
    id: 'care-with-boundaries',
    title: 'Care can have boundaries',
    text: 'The series separates compassion from continued access. Caring about someone does not require ongoing debate, reconciliation, or accepting mistreatment. A boundary can protect your time and attention without becoming a punishment.',
    theme: 'boundaries',
    kind: 'original-article-paraphrase',
    article: EDUCATION_SOURCES.part1,
    sections: ['The Circuits Go Dark', 'The Forgiveness Problem'],
    sources: [EDUCATION_SOURCES.part1],
  },
  {
    id: 'acceptance-without-approval',
    title: 'Acceptance without approval',
    text: 'Acceptance can mean acknowledging what happened without approving it or turning it into your identity. You do not have to keep arguing for another person\'s agreement before your experience matters.',
    theme: 'acceptance',
    kind: 'original-article-paraphrase',
    article: EDUCATION_SOURCES.part1,
    sections: ['The Coach and the Revelation', 'The Forgiveness Problem'],
    sources: [EDUCATION_SOURCES.part1],
  },
  {
    id: 'your-pace',
    title: 'Your pace is yours',
    text: 'The final-week article rejects using Jesus\' forgiveness to hurry a survivor. No one else\'s spiritual story creates a deadline for your recovery or an obligation to restore trust.',
    theme: 'recovery-without-pressure',
    kind: 'original-article-paraphrase',
    article: EDUCATION_SOURCES.part2,
    sections: ['For Anyone Who Was Destroyed for Refusing a Role'],
    sources: [EDUCATION_SOURCES.part2],
  },
  {
    id: 'more-than-a-role',
    title: 'More than an assigned role',
    text: 'Someone\'s disappointment does not automatically mean you have wronged them. The series asks readers to distinguish genuine responsibility from pressure to become another person\'s preferred version of them.',
    theme: 'self-respect',
    kind: 'original-article-paraphrase',
    article: EDUCATION_SOURCES.part2,
    sections: ['The Part He Would Not Play', 'The First Failure: A Ledger Kept in Private'],
    sources: [EDUCATION_SOURCES.part2],
  },
  {
    id: 'growth-does-not-justify-harm',
    title: 'Growth does not justify harm',
    text: 'The series allows hope without calling the harm necessary or deserved. Anything meaningful you build afterward belongs to your life; it does not turn mistreatment into a favor you owe gratitude for.',
    theme: 'survivor-dignity',
    kind: 'original-article-paraphrase',
    article: EDUCATION_SOURCES.part3,
    sections: ['Who Never Collects', 'What the Ledger Does Not Ask'],
    sources: [EDUCATION_SOURCES.part3],
  },
  {
    id: 'worth-beyond-approval',
    title: 'Worth beyond approval',
    text: 'In the series\' spiritual reading, personal worth is given, not earned through performance. Another person\'s approval does not determine your dignity. Knowing this can coexist with still feeling hurt.',
    theme: 'self-respect',
    kind: 'original-article-paraphrase',
    article: EDUCATION_SOURCES.part4,
    sections: ['Worth You Cannot Manufacture'],
    sources: [EDUCATION_SOURCES.part4],
  },
  {
    id: 'support-without-control',
    title: 'Support without taking over',
    text: 'The series ends with people carrying help to others. In real life, support means listening, respecting the survivor\'s choices, and offering help they want. You do not have to direct their recovery.',
    theme: 'survivor-support',
    kind: 'original-paraphrase-with-specialist-guidance',
    article: EDUCATION_SOURCES.part4,
    sections: ['The Ones Who Carried the Mercy'],
    sources: [EDUCATION_SOURCES.part4, EDUCATION_SOURCES.supportingSurvivors],
  },
  {
    id: 'personal-safety',
    title: 'Safety fits your situation',
    text: 'No contact is not safe or possible for everyone. If abuse is involved, consider a personal safety plan with a specialist advocate or trusted supporter, including before or after leaving. Your circumstances and choices matter.',
    theme: 'disengagement-and-safety',
    kind: 'specialist-guidance-contextualizing-article',
    article: EDUCATION_SOURCES.part1,
    sections: ['The Circuits Go Dark'],
    sources: [EDUCATION_SOURCES.part1, EDUCATION_SOURCES.safetyPlan, EDUCATION_SOURCES.preparingToLeave],
  },
]);

/** Pure selection only; the caller controls whether and when a player reads. */
export function getEducationCard(index = 0) {
  const value = Number.isFinite(index) ? Math.trunc(index) : 0;
  return EDUCATION_CARDS[((value % EDUCATION_CARDS.length) + EDUCATION_CARDS.length) % EDUCATION_CARDS.length];
}
