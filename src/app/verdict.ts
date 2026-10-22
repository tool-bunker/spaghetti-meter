export interface Verdict {
  label: string;
  copy: string;
}

export function describeScore(score: number | undefined): Verdict {
  if (score === undefined) {
    return {
      label: "Your spaghetti verdict will appear here.",
      copy: "Choose a project and watch its code land in the bowl.",
    };
  }
  if (score <= 20) {
    return {
      label: "Atomic code spaghetti.",
      copy: "A small, tidy serving with very little tangled together.",
    };
  }
  if (score <= 50) {
    return {
      label: "Light spaghetti.",
      copy: "Some knots are visible, but the bowl remains easy to work through.",
    };
  }
  if (score <= 80) {
    return {
      label: "Expected spaghetti.",
      copy: "A normal serving of code friction, still comfortably contained.",
    };
  }
  if (score <= 100) {
    return {
      label: "Full but expected spaghetti.",
      copy: "The bowl is nearly full, but the project remains within the expected range.",
    };
  }
  if (score <= 150) {
    return {
      label: "Messy spaghetti.",
      copy: "The serving exceeds the bowl's expected capacity and has started to overflow.",
    };
  }
  return {
    label: "Spaghetti catastrophe.",
    copy: "The bowl has lost containment. Start with the thickest tangles.",
  };
}
