export interface Verdict {
  readonly label: string;
  readonly detail: string;
}

interface ScoreVerdict extends Verdict {
  readonly maximumScore: number;
}

const EMPTY_VERDICT: Verdict = {
  label: "Your spaghetti verdict will appear here.",
  detail: "Select a repository and let the pasta science begin.",
};

const SCORE_VERDICTS: readonly ScoreVerdict[] = [
  {
    maximumScore: 0,
    label: "No spaghetti detected.",
    detail: "The fork came back clean. Suspicious.",
  },
  {
    maximumScore: 10,
    label: "Just a noodle or two.",
    detail: "A brave little noodle is trying its best.",
  },
  {
    maximumScore: 20,
    label: "Atomic code spaghetti.",
    detail: "Ohh... try creating more of the same code. That should make a huge difference.",
  },
  {
    maximumScore: 35,
    label: "A few loose noodles.",
    detail: "A few more copy-pastes and this could become competitive.",
  },
  {
    maximumScore: 50,
    label: "Light spaghetti.",
    detail: "You can still see the bottom of the bowl. Keep going.",
  },
  {
    maximumScore: 65,
    label: "Saucy but sensible.",
    detail: "Sauce levels stable. Engineering prestige rising.",
  },
  {
    maximumScore: 80,
    label: "Expected spaghetti.",
    detail: "Exactly enough complexity to look intentional.",
  },
  {
    maximumScore: 90,
    label: "A generous serving.",
    detail: "The bowl is impressed. Your reviewer may have questions.",
  },
  {
    maximumScore: 100,
    label: "Bowl at capacity.",
    detail: "Perfectly contained chaos. For now.",
  },
  {
    maximumScore: 120,
    label: "The first noodle escaped.",
    detail: "One noodle has escaped. The others are taking notes.",
  },
  {
    maximumScore: 150,
    label: "Messy spaghetti.",
    detail: "Refactoring could help, but where is the fun in that?",
  },
  {
    maximumScore: 180,
    label: "Spaghetti overflow.",
    detail: "The bowl has filed its first containment report.",
  },
  {
    maximumScore: 220,
    label: "A full pasta incident.",
    detail: "Oh wow. This is no longer lunch; it is infrastructure.",
  },
  {
    maximumScore: 300,
    label: "Spaghetti catastrophe.",
    detail: "WOW. Not even AI can untangle that mess.",
  },
  {
    maximumScore: 500,
    label: "Industrial-scale spaghetti.",
    detail: "Congratulations. You have invented enterprise pasta.",
  },
];

const UNBOUNDED_VERDICT: Verdict = {
  label: "The spaghetti is self-aware.",
  detail: "It has begun reviewing your pull requests.",
};

export function describeScore(score: number | undefined): Verdict {
  if (score === undefined) return EMPTY_VERDICT;
  for (const verdict of SCORE_VERDICTS) {
    if (score <= verdict.maximumScore) return verdict;
  }
  return UNBOUNDED_VERDICT;
}
