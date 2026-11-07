export interface Verdict {
  readonly label: string;
  readonly copy: string;
}

interface ScoreVerdict extends Verdict {
  readonly maximumScore: number;
}

const EMPTY_VERDICT: Verdict = {
  label: "Your spaghetti verdict will appear here.",
  copy: "Choose a project and watch its code land in the bowl.",
};

const SCORE_VERDICTS: readonly ScoreVerdict[] = [
  {
    maximumScore: 0,
    label: "No spaghetti detected.",
    copy: "Code Buster found no weighted findings. The bowl stays spotless.",
  },
  {
    maximumScore: 10,
    label: "Just a noodle or two.",
    copy: "Barely enough to twirl around a fork. This repository is keeping things tidy.",
  },
  {
    maximumScore: 20,
    label: "Atomic code spaghetti.",
    copy: "A small, tidy serving with very little tangled together.",
  },
  {
    maximumScore: 35,
    label: "A few loose noodles.",
    copy: "There are a handful of knots to untangle and plenty of room left in the bowl.",
  },
  {
    maximumScore: 50,
    label: "Light spaghetti.",
    copy: "Some knots are visible, but the bowl remains easy to work through.",
  },
  {
    maximumScore: 65,
    label: "Saucy but sensible.",
    copy: "The friction is visible, but the route through the code can still be followed.",
  },
  {
    maximumScore: 80,
    label: "Expected spaghetti.",
    copy: "A normal serving of code friction, still comfortably contained.",
  },
  {
    maximumScore: 90,
    label: "A generous serving.",
    copy: "The portion is getting hearty, with less space between the tangles.",
  },
  {
    maximumScore: 100,
    label: "Bowl at capacity.",
    copy: "The serving has reached the expected baseline. One more noodle may escape.",
  },
  {
    maximumScore: 120,
    label: "The first noodle escaped.",
    copy: "The serving has crossed the rim. The earliest overflow is now visible.",
  },
  {
    maximumScore: 150,
    label: "Messy spaghetti.",
    copy: "The serving exceeds the bowl's expected capacity and has started to overflow.",
  },
  {
    maximumScore: 180,
    label: "Spaghetti overflow.",
    copy: "The bowl can no longer contain the serving, and the tangles are spreading.",
  },
  {
    maximumScore: 220,
    label: "A full pasta incident.",
    copy: "The spill is substantial. Untangling it deserves a deliberate plan.",
  },
  {
    maximumScore: 300,
    label: "Spaghetti catastrophe.",
    copy: "The bowl has lost containment. Start with the thickest tangles.",
  },
  {
    maximumScore: 500,
    label: "Industrial-scale spaghetti.",
    copy: "One bowl was never going to be enough. Map a path before pulling at the pile.",
  },
];

const UNBOUNDED_VERDICT: Verdict = {
  label: "The spaghetti is self-aware.",
  copy: "The noodles now have opinions. Bring a map, patience, and one small refactor at a time.",
};

export function describeScore(score: number | undefined): Verdict {
  if (score === undefined) return EMPTY_VERDICT;
  for (const verdict of SCORE_VERDICTS) {
    if (score <= verdict.maximumScore) return verdict;
  }
  return UNBOUNDED_VERDICT;
}
