import { openUrl } from "@tauri-apps/plugin-opener";
import { Container, Graphics, Text, type TextStyleOptions } from "pixi.js";
import { UiButton } from "../ui/UiButton";
import { COLORS, FONTS } from "../ui/theme";

const BOLD_FONT_WEIGHT = "bold";
const COMPACT_LAYOUT_MAX_WIDTH = 700;

const CODE_BUSTER_REPOSITORY_URL = "https://github.com/tool-bunker/code-buster";

export class InfoScene extends Container {
  private readonly background = new Graphics();
  private readonly glow = new Graphics();
  private readonly eyebrow = centeredText("ABOUT SPAGHETTI METER", {
    fill: COLORS.red,
    fontFamily: FONTS.mono,
    fontSize: 10,
    fontWeight: BOLD_FONT_WEIGHT,
    letterSpacing: 2,
  });
  private readonly title = centeredText("A playful second opinion", {
    fill: COLORS.heading,
    fontFamily: FONTS.serif,
    fontSize: 56,
    fontWeight: "500",
    letterSpacing: -2,
    align: "center",
  });
  private readonly lede = centeredText(
    "Spaghetti Meter turns Code Buster findings into a deliberately lighthearted score.\nIt is a conversation starter, not a final verdict on your repository.",
    {
      fill: COLORS.body,
      fontFamily: FONTS.sans,
      fontSize: 14,
      lineHeight: 23,
      align: "center",
      wordWrap: true,
      wordWrapWidth: 600,
    },
  );
  private readonly note = new NoteCard();
  private readonly formula = new FormulaCard();
  private readonly feedback = centeredText(
    "Help Code Buster improve by sharing examples of true positives and false positives.",
    {
      fill: COLORS.body,
      fontFamily: FONTS.sans,
      fontSize: 12,
      align: "center",
      wordWrap: true,
      wordWrapWidth: 560,
    },
  );
  private readonly githubButton: UiButton;
  private readonly licenseButton: UiButton;
  private readonly backButton: UiButton;

  constructor(onBack: () => void, onLicenses: () => void) {
    super({ label: "info-scene", eventMode: "none", visible: false, alpha: 0 });
    this.githubButton = new UiButton({
      label: "GitHub · tool-bunker/code-buster ↗",
      accessibleLabel: "Open the Code Buster repository on GitHub",
      variant: "github",
      onPress: () => {
        void openUrl(CODE_BUSTER_REPOSITORY_URL);
      },
    });
    this.licenseButton = new UiButton({
      label: "Third-party licenses",
      variant: "text",
      onPress: onLicenses,
    });
    this.backButton = new UiButton({
      label: "Back to the bowl",
      variant: "text",
      onPress: onBack,
    });
    this.addChild(
      this.background,
      this.glow,
      this.eyebrow,
      this.title,
      this.lede,
      this.note,
      this.formula,
      this.feedback,
      this.githubButton,
      this.licenseButton,
      this.backButton,
    );
    this.title.accessible = true;
    this.title.accessibleType = "h1";
    this.title.accessibleTitle = this.title.text;
    this.lede.accessible = true;
    this.lede.accessibleType = "p";
    this.lede.accessibleTitle = this.lede.text;
    this.feedback.accessible = true;
    this.feedback.accessibleType = "p";
    this.feedback.accessibleTitle = this.feedback.text;
  }

  resize(width: number, height: number): void {
    const compact = width <= COMPACT_LAYOUT_MAX_WIDTH;
    const centerX = width / 2;
    const contentWidth = Math.min(width - (compact ? 36 : 64), 680);
    const top = compact ? Math.max(58, height * 0.065) : Math.max(90, height * 0.12);

    this.background.clear().rect(0, 0, width, height).fill(COLORS.background);
    this.glow.clear()
      .circle(centerX, height * 0.15, Math.min(width * 0.34, 280))
      .fill({ color: COLORS.accent, alpha: 0.035 });
    this.eyebrow.position.set(centerX, top);

    this.title.style.fontSize = compact
      ? Math.min(44, Math.max(30, width * 0.078))
      : Math.min(68, Math.max(46, width * 0.05));
    this.title.style.wordWrap = true;
    this.title.style.wordWrapWidth = contentWidth;
    this.title.position.set(centerX, top + (compact ? 44 : 58));

    this.lede.style.fontSize = compact ? 13 : 14;
    this.lede.style.wordWrapWidth = Math.min(contentWidth, 600);
    this.lede.position.set(centerX, top + (compact ? 118 : 142));

    const noteY = top + (compact ? 190 : 205);
    const noteHeight = compact ? 142 : 136;
    this.note.resize(contentWidth, noteHeight);
    this.note.position.set(centerX - contentWidth / 2, noteY);

    const formulaY = noteY + noteHeight + 12;
    this.formula.resize(contentWidth, 98);
    this.formula.position.set(centerX - contentWidth / 2, formulaY);

    this.feedback.style.wordWrapWidth = contentWidth;
    this.feedback.position.set(centerX, formulaY + 119);

    const githubWidth = Math.min(330, contentWidth);
    this.githubButton.resize(githubWidth, 44);
    this.githubButton.position.set(centerX - githubWidth / 2, formulaY + 141);

    const footerY = formulaY + 199;
    const footerWidth = Math.min(190, (contentWidth - 8) / 2);
    this.licenseButton.resize(footerWidth, 28);
    this.licenseButton.position.set(centerX - footerWidth - 4, footerY);
    this.backButton.resize(footerWidth, 28);
    this.backButton.position.set(centerX + 4, footerY);
  }

  setInteractive(interactive: boolean): void {
    this.eventMode = interactive ? "passive" : "none";
  }
}

class NoteCard extends Container {
  private readonly panel = new Graphics();
  private readonly eyebrow = centeredText("A PINCH OF SALT", {
    fill: COLORS.red,
    fontFamily: FONTS.mono,
    fontSize: 10,
    fontWeight: BOLD_FONT_WEIGHT,
    letterSpacing: 2,
  });
  private readonly title = centeredText("Useful signal, not a final verdict.", {
    fill: COLORS.project,
    fontFamily: FONTS.serif,
    fontSize: 20,
    fontWeight: "500",
    align: "center",
  });
  private readonly copy = centeredText(
    "Every repository has its own context. If a result feels wrong, trust your judgment—and help Code Buster improve by sharing what was a true positive or a false positive.",
    {
      fill: COLORS.muted,
      fontFamily: FONTS.sans,
      fontSize: 12,
      lineHeight: 18,
      align: "center",
      wordWrap: true,
    },
  );

  constructor() {
    super({ eventMode: "none" });
    this.addChild(this.panel, this.eyebrow, this.title, this.copy);
    this.accessible = true;
    this.accessibleType = "section";
    this.accessibleTitle = "Take the Spaghetti Meter score with a grain of salt. Useful signal, not a final verdict. Every repository has its own context.";
  }

  resize(width: number, height: number): void {
    this.panel.clear()
      .roundRect(0, 0, width, height, 14)
      .fill(COLORS.panel)
      .stroke({ color: COLORS.panelBorder, width: 1 });
    this.eyebrow.position.set(width / 2, 22);
    this.title.style.wordWrap = true;
    this.title.style.wordWrapWidth = width - 32;
    this.title.position.set(width / 2, 52);
    this.copy.style.wordWrapWidth = width - 40;
    this.copy.position.set(width / 2, height - 42);
  }
}

class FormulaCard extends Container {
  private readonly panel = new Graphics();
  private readonly eyebrow = centeredText("THE RECIPE", {
    fill: COLORS.red,
    fontFamily: FONTS.mono,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
  });
  private readonly formula = centeredText(
    "100 × (actionable × 3 + advisory) / max(files, 10)",
    {
      fill: COLORS.accent,
      fontFamily: FONTS.mono,
      fontSize: 12,
      fontWeight: "600",
      align: "center",
      wordWrap: true,
    },
  );
  private readonly copy = centeredText(
    "Scores through 100 fit in the bowl. Anything above 100 overflows.",
    {
      fill: COLORS.muted,
      fontFamily: FONTS.sans,
      fontSize: 11,
      align: "center",
      wordWrap: true,
    },
  );

  constructor() {
    super({ eventMode: "none" });
    this.addChild(this.panel, this.eyebrow, this.formula, this.copy);
    this.accessible = true;
    this.accessibleType = "section";
    this.accessibleTitle = "The recipe. 100 times actionable times 3 plus advisory, divided by the greater of files or 10. Scores through 100 fit in the bowl. Anything above 100 overflows.";
  }

  resize(width: number, height: number): void {
    this.panel.clear()
      .rect(0, 0, width, height)
      .fill({ color: COLORS.accent, alpha: 0.025 })
      .stroke({ color: COLORS.accent, alpha: 0.18, width: 1 });
    this.eyebrow.position.set(width / 2, 18);
    this.formula.style.wordWrapWidth = width - 24;
    this.formula.position.set(width / 2, 45);
    this.formula.style.fontSize = width < 460 ? 10 : 12;
    this.copy.style.wordWrapWidth = width - 24;
    this.copy.position.set(width / 2, height - 20);
  }
}

function centeredText(text: string, style: TextStyleOptions): Text {
  return new Text({ text, style, anchor: 0.5, eventMode: "none" });
}
