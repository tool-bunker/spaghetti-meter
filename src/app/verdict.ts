export interface Verdict {
  readonly label: string;
}

interface ScoreVerdict extends Verdict {
  readonly maximumScore: number;
}

const EMPTY_VERDICT: Verdict = {
  label: "Your spaghetti verdict will appear here.",
};

const SCORE_VERDICTS: readonly ScoreVerdict[] = [
  {
    maximumScore: 0,
    label: "No spaghetti detected.",
  },
  {
    maximumScore: 10,
    label: "Just a noodle or two.",
  },
  {
    maximumScore: 20,
    label: "Atomic code spaghetti.",
  },
  {
    maximumScore: 35,
    label: "A few loose noodles.",
  },
  {
    maximumScore: 50,
    label: "Light spaghetti.",
  },
  {
    maximumScore: 65,
    label: "Saucy but sensible.",
  },
  {
    maximumScore: 80,
    label: "Expected spaghetti.",
  },
  {
    maximumScore: 90,
    label: "A generous serving.",
  },
  {
    maximumScore: 100,
    label: "Bowl at capacity.",
  },
  {
    maximumScore: 120,
    label: "The first noodle escaped.",
  },
  {
    maximumScore: 150,
    label: "Messy spaghetti.",
  },
  {
    maximumScore: 180,
    label: "Spaghetti overflow.",
  },
  {
    maximumScore: 220,
    label: "A full pasta incident.",
  },
  {
    maximumScore: 300,
    label: "Spaghetti catastrophe.",
  },
  {
    maximumScore: 500,
    label: "Industrial-scale spaghetti.",
  },
];

const UNBOUNDED_VERDICT: Verdict = {
  label: "The spaghetti is self-aware.",
};

export function describeScore(score: number | undefined): Verdict {
  if (score === undefined) return EMPTY_VERDICT;
  for (const verdict of SCORE_VERDICTS) {
    if (score <= verdict.maximumScore) return verdict;
  }
  return UNBOUNDED_VERDICT;
}
